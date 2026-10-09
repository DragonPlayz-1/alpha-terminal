import { randomUUID } from "node:crypto";
import type { Instrument, MarketQuote, Order, TradingAccount } from "@prisma/client";
import { Decimal } from "@/lib/decimal";
import { D, fixed, averageCost, linearPnl, liquidationPrice } from "./math";
import { postLedger } from "./ledger";
import { evaluateAchievements } from "@/server/competition/achievements";
import type { Tx } from "./transaction";
import { snapshotInTransaction } from "./valuation";

export async function releaseOrder(tx: Tx, order: Order, status: "CANCELLED" | "EXPIRED" | "REJECTED", reason?: string) {
  if (!["OPEN", "PENDING", "PARTIALLY_FILLED"].includes(order.status)) return;
  if (D(order.reservedAmount).gt(0)) await tx.tradingAccount.update({ where: { id: order.accountId }, data: { availableCash: { increment: order.reservedAmount }, reservedCash: { decrement: order.reservedAmount } } });
  await tx.order.update({ where: { id: order.id }, data: { status, reservedAmount: 0, reservedQuantity: 0, rejectionReason: reason } });
}

export async function settle(tx: Tx, order: Order, account: TradingAccount, instrument: Instrument, quote: MarketQuote, liquidating = false) {
  if (!["OPEN", "PENDING", "PARTIALLY_FILLED"].includes(order.status)) throw new Error("Order is no longer executable.");
  if (account.scope !== "main") {
    const challenge = await tx.challenge.findUnique({ where: { id: account.scope } });
    if (!challenge || challenge.endTime <= new Date() || challenge.startTime > new Date() || !["ACTIVE", "UPCOMING"].includes(challenge.status)) throw new Error("Challenge is outside its trading window.");
  }
  const derivative = instrument.instrumentType !== "SPOT";
  const closing = derivative ? order.reduceOnly : order.side === "SELL";
  const price = D(order.side === "BUY" ? quote.ask! : quote.bid!);
  const quantity = D(order.quantity).minus(order.filledQuantity);
  if (quantity.lte(0)) throw new Error("Order has no remaining quantity.");
  const notional = price.mul(quantity);
  // Fee rate is fixed at submission; changing administrator settings cannot alter an accepted order.
  const rate = D(order.feeRate);
  const fee = notional.mul(rate);
  const reserved = D(order.reservedAmount);
  const key = { accountId: account.id, instrumentId: instrument.id, positionSide: order.positionSide };
  const position = await tx.position.findUnique({ where: { accountId_instrumentId_positionSide: key } });
  let pnl = D(0), marginDelta = D(0), cashDelta = D(0), protection = D(0);
  if (!closing) {
    const margin = derivative ? notional.div(order.leverage) : D(0);
    const cost = (derivative ? margin : notional).plus(fee);
    if (D(account.availableCash).plus(reserved).lt(cost)) throw new Error("Insufficient available cash or margin at execution.");
    const oldQuantity = D(position?.quantity ?? 0);
    if (derivative && position && !D(position.leverage).eq(order.leverage)) throw new Error("Close the existing position before changing its leverage.");
    const newQuantity = oldQuantity.plus(quantity);
    const average = averageCost(oldQuantity, D(position?.averageEntryPrice ?? 0), quantity, price);
    const newMargin = D(position?.initialMargin ?? 0).plus(margin);
    await tx.position.upsert({ where: { accountId_instrumentId_positionSide: key },
      create: { ...key, quantity: fixed(newQuantity), averageEntryPrice: fixed(average), initialMargin: fixed(newMargin), leverage: order.leverage, liquidationPrice: derivative ? fixed(liquidationPrice(newQuantity, average, newMargin, order.positionSide)) : null },
      update: { quantity: fixed(newQuantity), averageEntryPrice: fixed(average), initialMargin: fixed(newMargin), liquidationPrice: derivative ? fixed(liquidationPrice(newQuantity, average, newMargin, order.positionSide)) : null },
    });
    marginDelta = margin;
    cashDelta = derivative ? margin.neg() : notional.neg();
  } else {
    if (!position || D(position.quantity).lt(quantity)) throw new Error("Insufficient position quantity.");
    // Spot inventory is long-only, so its realized result is the same
    // directional P&L calculation used by linear simulator contracts.
    // Keeping this on the execution path makes spot sells count toward
    // account P&L, leaderboards, and profitable-trade achievements.
    pnl = linearPnl(quantity, D(position.averageEntryPrice), price, order.positionSide);
    const releasedMargin = D(position.initialMargin).mul(quantity).div(position.quantity);
    cashDelta = derivative ? releasedMargin.plus(pnl) : notional;
    // Documented isolated negative-balance protection. Gap losses beyond allocated margin are an explicit adjustment.
    if (derivative && cashDelta.minus(fee).lt(0)) { protection = fee.minus(cashDelta); cashDelta = fee; }
    const nextQuantity = D(position.quantity).minus(quantity);
    marginDelta = releasedMargin.neg();
    if (nextQuantity.eq(0)) await tx.position.delete({ where: { id: position.id } });
    else await tx.position.update({ where: { id: position.id }, data: { quantity: fixed(nextQuantity), initialMargin: { decrement: fixed(releasedMargin) }, realizedPnl: { increment: fixed(pnl) } } });
    // Cancel OCO sibling atomically; resize other protected exits after an independent partial close.
    const exits = await tx.order.findMany({ where: { accountId: account.id, instrumentId: instrument.id, positionSide: order.positionSide, status: "OPEN", reservedQuantity: { gt: 0 }, id: { not: order.id } }, orderBy: { createdAt: "asc" } });
    let remaining = nextQuantity;
    const groups = new Map<string, Decimal>();
    for (const exit of exits) {
      if (exit.orderGroupId && exit.orderGroupId === order.orderGroupId) { await releaseOrder(tx, exit, "CANCELLED", "OCO counterpart filled"); continue; }
      const group = exit.orderGroupId ?? exit.id;
      let size = groups.get(group);
      if (!size) { size = Decimal.min(remaining, D(exit.quantity).minus(exit.filledQuantity)); groups.set(group, size); remaining = remaining.minus(size); }
      if (size.eq(0)) await releaseOrder(tx, exit, "CANCELLED", "Position closed");
      else if (size.lt(D(exit.quantity).minus(exit.filledQuantity))) await tx.order.update({ where: { id: exit.id }, data: { quantity: fixed(size.plus(exit.filledQuantity)), reservedQuantity: fixed(size) } });
    }
  }
  await tx.tradingAccount.update({ where: { id: account.id }, data: {
    availableCash: { increment: fixed(reserved.plus(cashDelta).minus(fee)) }, reservedCash: { decrement: fixed(reserved) },
    feesPaid: { increment: fixed(fee) }, realizedPnl: { increment: fixed(pnl.plus(protection)) },
  } });
  await postLedger(tx, account.id, liquidating ? "LIQUIDATION" : "ORDER_SETTLEMENT", order.id, `${order.side} ${fixed(quantity)} ${instrument.symbol}`, [
    { type: "CASH", asset: "USD", amount: cashDelta }, { type: "FEE", asset: "USD", amount: fee.neg() },
    { type: "ASSET", asset: `${instrument.symbol}:${order.positionSide}`, amount: closing ? quantity.neg() : quantity },
    { type: "MARGIN", asset: "USD", amount: marginDelta }, { type: "PNL", asset: "USD", amount: pnl },
  ]);
  if (protection.gt(0)) await postLedger(tx, account.id, "ADJUSTMENT", order.id, "Simulated isolated gap protection; already included in settlement cash", [{ type: "PNL", asset: "USD", amount: protection }]);
  await tx.execution.create({ data: { orderId: order.id, quantity: fixed(quantity), executionPrice: fixed(price), fee: fixed(fee), feeAsset: "USD", realizedPnl: fixed(pnl.plus(protection)), executionMetadata: { model: "top-of-book full fill; no depth simulation", provider: instrument.dataProvider, quoteTimestamp: quote.sourceTimestamp?.toISOString() ?? "", isolatedGapProtection: protection.toString(), liquidation: liquidating } } });
  const averageFill = D(order.filledQuantity).gt(0) ? averageCost(D(order.filledQuantity), D(order.averageFillPrice ?? price), quantity, price) : price;
  const filled = await tx.order.update({ where: { id: order.id }, data: { status: "FILLED", filledQuantity: order.quantity, averageFillPrice: fixed(averageFill), estimatedFee: fixed(fee), reservedAmount: 0, reservedQuantity: 0 } });
  await evaluateAchievements(tx, account.userId, account.id);
  await tx.notification.create({ data: { userId: account.userId, notificationType: liquidating ? "LIQUIDATION" : "ORDER_FILLED", title: liquidating ? "Position liquidated" : `${order.side === "BUY" ? "Bought" : "Sold"} ${instrument.baseAsset}`, message: `${fixed(quantity)} ${instrument.symbol} filled at $${price.toFixed(2)}. Fee $${fee.toFixed(4)}.` } });
  if (!closing && (order.bracketStop || order.bracketTarget)) {
    const group = randomUUID();
    for (const [type, trigger] of [["STOP_MARKET", order.bracketStop], ["TAKE_PROFIT_LIMIT", order.bracketTarget]] as const) {
      if (!trigger) continue;
      await tx.order.create({ data: { accountId: account.id, instrumentId: instrument.id, clientOrderId: `${order.id}:${type}`, side: order.side === "BUY" ? "SELL" : "BUY", positionSide: order.positionSide, orderType: type, quantity: fixed(quantity), stopPrice: trigger, limitPrice: type === "TAKE_PROFIT_LIMIT" ? trigger : null, reduceOnly: true, reservedQuantity: fixed(quantity), orderGroupId: group, linkedOrderId: order.id, leverage: order.leverage, status: "OPEN", feeRate: order.feeRate, estimatedFee: fixed(D(trigger).mul(quantity).mul(rate)) } });
    }
  }
  if (account.scope !== "main" && !(await snapshotInTransaction(account.id, tx, true))) throw new Error("Challenge deadline reached before settlement.");
  return filled;
}
