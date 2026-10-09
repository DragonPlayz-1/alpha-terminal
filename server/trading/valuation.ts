import { db } from "@/lib/db";
import { D, fixed, linearPnl, normalizedReturn } from "./math";
import { isFresh } from "@/server/market-data/service";
import { withAccount } from "./transaction";
import type { Tx } from "./transaction";
import { getTradingConfig } from "@/server/config";

export async function valueAccount(accountId: string, tx?: Tx) {
  return tx ? readAccountValue(accountId, tx) : db.$transaction(client => readAccountValue(accountId, client), { isolationLevel: "RepeatableRead", timeout: 15000 });
}

async function readAccountValue(accountId: string, tx: Tx) {
  const { quoteMaxAgeMs } = await getTradingConfig(tx);
  const account = await tx.tradingAccount.findUniqueOrThrow({ where: { id: accountId } });
  const positions = await tx.position.findMany({ where: { accountId, quantity: { gt: 0 } }, include: { instrument: { include: { quote: true } } }, orderBy: { openedAt: "asc" } });
  const positionData = positions.map(p => {
    const derivative = p.instrument.instrumentType !== "SPOT";
    const quote = p.instrument.quote;
    const mark = quote?.markPrice ?? quote?.lastPrice;
    const price = mark ? D(mark) : D(p.averageEntryPrice);
    const pnl = linearPnl(D(p.quantity), D(p.averageEntryPrice), price, p.positionSide);
    return { id: p.id, symbol: p.instrument.symbol, name: p.instrument.name, instrumentType: p.instrument.instrumentType, positionSide: p.positionSide, quantity: p.quantity.toString(), averageEntryPrice: p.averageEntryPrice.toString(), currentPrice: mark?.toString() ?? null, marketValue: price.mul(p.quantity).toString(), unrealizedPnl: pnl.toString(), returnPct: pnl.div(derivative ? D(p.initialMargin).gt(0) ? p.initialMargin : 1 : D(p.quantity).mul(p.averageEntryPrice)).mul(100).toString(), quoteFresh: !!quote && isFresh(quote, Date.now(), quoteMaxAgeMs), initialMargin: p.initialMargin.toString(), leverage: p.leverage.toString(), liquidationPrice: p.liquidationPrice?.toString() ?? null, fundingTotal: p.fundingTotal.toString(), maintenanceMargin: derivative ? price.mul(p.quantity).mul("0.025").toString() : "0" };
  });
  const sum = (key: "marketValue" | "unrealizedPnl" | "initialMargin", type?: string) => positionData.filter(p => !type || (type === "SPOT" ? p.instrumentType === "SPOT" : p.instrumentType !== "SPOT")).reduce((s, p) => s.plus(p[key]), D(0));
  const spotValue = sum("marketValue", "SPOT"), margin = sum("initialMargin"), derivativePnl = sum("unrealizedPnl", "DERIVATIVE"), unrealizedPnl = sum("unrealizedPnl");
  const equity = D(account.availableCash).plus(account.reservedCash).plus(spotValue).plus(margin).plus(derivativePnl);
  const complete = positionData.every(p => p.quoteFresh);
  return { account, positions: positionData, equity: fixed(equity), spotValue: fixed(spotValue), margin: fixed(margin), derivativesPnl: fixed(derivativePnl), unrealizedPnl: fixed(unrealizedPnl), returnPct: fixed(normalizedReturn(equity, D(account.initialCapital))), complete };
}
export async function snapshotInTransaction(accountId: string, tx: Tx, force = false) {
    const account = await tx.tradingAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (account.accountStatus !== "ACTIVE") return null;
    if (account.scope !== "main") {
      const challenge = await tx.challenge.findUnique({ where: { id: account.scope } });
      if (!challenge || challenge.endTime <= new Date()) return null;
    }
    const latest = await tx.portfolioSnapshot.findFirst({ where: { accountId }, orderBy: { snapshotTimestamp: "desc" } });
    if (!force && latest && Date.now() - latest.snapshotTimestamp.getTime() < (account.scope === "main" ? 300_000 : 5000)) return latest;
    const value = await valueAccount(accountId, tx);
    if (!value.complete) {
      if (force) throw new Error("Complete portfolio quotes are required for a challenge fill.");
      return null;
    }
    return tx.portfolioSnapshot.create({ data: { accountId, equity: value.equity, cashBalance: D(value.account.availableCash).plus(value.account.reservedCash).toString(), reservedCash: value.account.reservedCash, spotValue: value.spotValue, unrealizedPnl: value.unrealizedPnl, realizedPnl: value.account.realizedPnl } });
}
export async function takeSnapshot(accountId: string) {
  return withAccount(accountId, tx => snapshotInTransaction(accountId, tx));
}
export async function getPortfolio(userId: string, scope = "main") {
  const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId, scope } } });
  if (!account) throw new Error("Trading account unavailable.");
  return valueAccount(account.id);
}
export async function getPortfolioHistory(userId: string, scope = "main") {
  const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId, scope } } });
  if (!account) throw new Error("Trading account unavailable.");
  const rows = await db.portfolioSnapshot.findMany({ where: { accountId: account.id }, orderBy: { snapshotTimestamp: "desc" }, take: 500 });
  return rows.reverse();
}
