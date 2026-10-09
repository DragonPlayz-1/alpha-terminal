import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { D, fixed, linearPnl, liquidationPrice, MAINTENANCE, LIQUIDATION_FEE } from "./math";
import { withAccount } from "./transaction";
import { settle, releaseOrder } from "./settlement";
import { postLedger } from "./ledger";
import { isFresh } from "@/server/market-data/service";
import { getTradingConfig } from "@/server/config";

export async function processDerivatives(now = new Date()) {
  const positions = await db.position.findMany({ where: { instrument: { instrumentType: "PERPETUAL" } }, select: { id: true, accountId: true } });
  const intervalMs = 8 * 3600000;
  const intervalTime = Math.floor(now.getTime() / intervalMs) * intervalMs;
  for (const candidate of positions) await withAccount(candidate.accountId, async tx => {
    const { quoteMaxAgeMs } = await getTradingConfig(tx);
    let position = await tx.position.findUnique({ where: { id: candidate.id }, include: { instrument: { include: { quote: true } }, account: true } });
    if (!position || !position.instrument.quote || !isFresh(position.instrument.quote, now.getTime(), quoteMaxAgeMs) || position.instrument.quote.mode !== position.account.dataMode) return;
    if (position.account.scope !== "main") { const c = await tx.challenge.findUnique({ where: { id: position.account.scope } }); if (!c || c.endTime <= now) return; }
    const quote = position.instrument.quote;
    if (!quote.bid || !quote.ask || !quote.markPrice) return;
    const mark = D(quote.markPrice), notional = mark.mul(position.quantity);
    if (position.lastFundingAt.getTime() < intervalTime && position.openedAt.getTime() < intervalTime) {
      const rate = D("0.0001"); // Explicit synthetic rate: longs pay, shorts receive, once per observed UTC boundary.
      const amount = notional.mul(rate).mul(position.positionSide === "LONG" ? 1 : -1);
      await tx.fundingEvent.create({ data: { accountId: candidate.accountId, positionId: position.id, intervalKey: String(intervalTime), rate: fixed(rate), amount: fixed(amount) } });
      await tx.position.update({ where: { id: position.id }, data: { initialMargin: { decrement: fixed(amount) }, fundingTotal: { increment: fixed(amount) }, lastFundingAt: new Date(intervalTime), liquidationPrice: fixed(liquidationPrice(D(position.quantity), D(position.averageEntryPrice), D(position.initialMargin).minus(amount), position.positionSide)) } });
      await tx.tradingAccount.update({ where: { id: candidate.accountId }, data: { fundingPaid: { increment: fixed(amount) } } });
      await postLedger(tx, candidate.accountId, "FUNDING", position.id, "Synthetic 0.01% / 8h funding (not an exchange rate)", [{ type: "MARGIN", asset: "USD", amount: amount.neg() }, { type: "FUNDING", asset: "USD", amount: amount.neg() }]);
      position = await tx.position.findUniqueOrThrow({ where: { id: position.id }, include: { instrument: { include: { quote: true } }, account: true } });
    }
    const pnl = linearPnl(D(position.quantity), D(position.averageEntryPrice), mark, position.positionSide);
    if (D(position.initialMargin).plus(pnl).gt(notional.mul(MAINTENANCE.plus(LIQUIDATION_FEE)))) return;
    const exits = await tx.order.findMany({ where: { accountId: candidate.accountId, instrumentId: position.instrumentId, positionSide: position.positionSide, status: "OPEN", reduceOnly: true } });
    for (const exit of exits) await releaseOrder(tx, exit, "CANCELLED", "Liquidation");
    const order = await tx.order.create({ data: { accountId: candidate.accountId, instrumentId: position.instrumentId, clientOrderId: `liquidation:${randomUUID()}`, side: position.positionSide === "LONG" ? "SELL" : "BUY", positionSide: position.positionSide, reduceOnly: true, orderType: "MARKET", quantity: position.quantity, status: "PENDING", feeRate: fixed(LIQUIDATION_FEE), leverage: position.leverage } });
    const price = D(order.side === "BUY" ? quote.ask : quote.bid);
    await settle(tx, order, position.account, position.instrument, quote, true);
    await tx.liquidationEvent.create({ data: { accountId: candidate.accountId, positionId: position.id, symbol: position.instrument.symbol, price: fixed(price), loss: fixed(Decimal.max(0, pnl.neg())), fee: fixed(price.mul(position.quantity).mul(LIQUIDATION_FEE)) } });
  });
}
