import { z } from "zod";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { D, fixed, conditionalState } from "./math";
import { settle, releaseOrder } from "./settlement";
import { withAccount } from "./transaction";
import { getQuote, isFresh } from "@/server/market-data/service";
import { getTradingConfig } from "@/server/config";
import { assertWorkerRunning, WorkerLeaseLostError } from "@/server/worker-context";
export { getPortfolio, getPortfolioHistory } from "./valuation";

const positive = z.string().max(40).regex(/^\d+(\.\d{1,8})?$/).refine(v => D(v).gt(0) && D(v).lte("1000000000"), "Must be positive and no larger than 1 billion.");
export const orderSchema = z.object({
  symbol: z.string().min(3).max(30).regex(/^[A-Z0-9-]+$/), side: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MARKET", "LIMIT", "STOP_MARKET", "STOP_LIMIT", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"]),
  quantity: positive, limitPrice: positive.optional(), stopPrice: positive.optional(),
  bracketStop: positive.optional(), bracketTarget: positive.optional(),
  clientOrderId: z.string().min(8).max(80), timeInForce: z.enum(["GTC", "IOC", "FOK", "DAY"]).default("GTC"),
  leverage: z.number().int().min(1).max(20).default(1), positionSide: z.enum(["LONG", "SHORT"]).default("LONG"),
  reduceOnly: z.boolean().default(false), scope: z.string().min(1).max(80).default("main"), expiresAt: z.iso.datetime().optional(),
}).strict().superRefine((order, ctx) => {
  const limit = order.orderType.includes("LIMIT");
  const conditional = !["MARKET", "LIMIT"].includes(order.orderType);
  if (limit !== (order.limitPrice !== undefined)) ctx.addIssue({ code: "custom", path: ["limitPrice"], message: limit ? "A limit price is required." : "This order type does not accept a limit price." });
  if (conditional !== (order.stopPrice !== undefined)) ctx.addIssue({ code: "custom", path: ["stopPrice"], message: conditional ? "A trigger price is required." : "This order type does not accept a trigger price." });
  if (conditional && ["IOC", "FOK"].includes(order.timeInForce)) ctx.addIssue({ code: "custom", path: ["timeInForce"], message: "Conditional orders require GTC or DAY time in force." });
});
export type OrderInput = z.input<typeof orderSchema>;

export async function accountFor(userId: string, scope = "main") {
  const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId, scope } } });
  if (!account || account.accountStatus !== "ACTIVE") throw new Error("Trading account unavailable.");
  return account;
}

export async function createOrder(userId: string, input: OrderInput) {
  const p = orderSchema.parse(input);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    symbol: p.symbol,
    side: p.side,
    orderType: p.orderType,
    quantity: D(p.quantity).toString(),
    limitPrice: p.limitPrice ? D(p.limitPrice).toString() : null,
    stopPrice: p.stopPrice ? D(p.stopPrice).toString() : null,
    bracketStop: p.bracketStop ? D(p.bracketStop).toString() : null,
    bracketTarget: p.bracketTarget ? D(p.bracketTarget).toString() : null,
    timeInForce: p.timeInForce,
    leverage: p.leverage,
    positionSide: p.positionSide,
    reduceOnly: p.reduceOnly,
    scope: p.scope,
    expiresAt: p.expiresAt ?? null,
  })).digest("hex");
  const account = await accountFor(userId, p.scope);
  const previous = await db.order.findUnique({ where: { accountId_clientOrderId: { accountId: account.id, clientOrderId: p.clientOrderId } } });
  if (previous) {
    if (previous.requestFingerprint && previous.requestFingerprint !== fingerprint) throw new Error("Client order ID was already used with different order details.");
    return previous;
  }
  const { instrument } = await getQuote(p.symbol, true);
  return withAccount(account.id, async tx => {
    const a = await tx.tradingAccount.findUniqueOrThrow({ where: { id: account.id }, include: { user: true } });
    if (a.accountStatus !== "ACTIVE" || a.user.accountStatus !== "ACTIVE") throw new Error("Account is suspended.");
    const existing = await tx.order.findUnique({ where: { accountId_clientOrderId: { accountId: a.id, clientOrderId: p.clientOrderId } } });
    if (existing) {
      if (existing.requestFingerprint && existing.requestFingerprint !== fingerprint) throw new Error("Client order ID was already used with different order details.");
      return existing;
    }
    const settings = await getTradingConfig(tx);
    const quote = await tx.marketQuote.findUnique({ where: { instrumentId: instrument.id } });
    const i = await tx.instrument.findUniqueOrThrow({ where: { id: instrument.id } });
    if (i.tradingStatus !== "ACTIVE" || i.quoteAsset !== "USD") throw new Error("Instrument is not available for this USD account.");
    if (!quote || !isFresh(quote, Date.now(), settings.quoteMaxAgeMs) || !quote.bid || !quote.ask || quote.mode !== a.dataMode) throw new Error("Market data is stale or unavailable. Execution is paused.");
    const derivative = i.instrumentType !== "SPOT";
    if (!D(i.contractMultiplier).eq(1) || i.instrumentType === "FUTURE") throw new Error("This contract specification is not supported by the execution engine.");
    if (!derivative && (p.leverage !== 1 || p.positionSide === "SHORT" || p.reduceOnly)) throw new Error("Unsupported leverage or short-selling mode.");
    if (!p.reduceOnly && D(p.leverage).gt(i.maximumLeverage)) throw new Error("Unsupported leverage or short-selling mode.");
    if (p.scope !== "main") {
      const challenge = await tx.challenge.findUnique({ where: { id: p.scope } });
      const rules = challenge?.configuration as { symbols?: string[]; eligibleMarkets?: string[]; maxLeverage?: number; orderTypes?: string[] } | null;
      if (!challenge || challenge.startTime > new Date() || challenge.endTime <= new Date() || !["ACTIVE", "UPCOMING"].includes(challenge.status)) throw new Error("Challenge is outside its trading window.");
      if (p.leverage > (rules?.maxLeverage ?? 1) || rules?.symbols && !rules.symbols.includes(p.symbol) || rules?.eligibleMarkets && !rules.eligibleMarkets.includes(i.assetClass) || rules?.orderTypes && !rules.orderTypes.includes(p.orderType)) throw new Error("Order violates challenge rules.");
    }
    if (D(p.quantity).lt(i.minimumQuantity)) throw new Error(`Minimum quantity: ${i.minimumQuantity}.`);
    for (const price of [p.limitPrice, p.stopPrice, p.bracketStop, p.bracketTarget]) {
      if (price && !D(price).mod(i.tickSize.toString()).eq(0)) throw new Error(`Prices must use tick size ${i.tickSize}.`);
    }
    if (await tx.order.count({ where: { accountId: a.id, status: "OPEN" } }) >= 200) throw new Error("Open-order limit reached. Cancel an order before adding another.");
    const closing = derivative ? p.reduceOnly : p.side === "SELL";
    if (derivative && p.side !== (p.positionSide === "LONG" ? (closing ? "SELL" : "BUY") : (closing ? "BUY" : "SELL"))) throw new Error("Invalid side for position direction.");
    if (p.orderType.includes("LIMIT") && !p.limitPrice) throw new Error("A limit price is required.");
    if (!["MARKET", "LIMIT"].includes(p.orderType) && !p.stopPrice) throw new Error("A trigger price is required.");
    if (p.bracketStop || p.bracketTarget) {
      if (closing) throw new Error("Brackets can only attach to an opening order.");
      const ref = D(p.limitPrice ?? (p.side === "BUY" ? quote.ask : quote.bid));
      const long = p.positionSide === "LONG";
      if (p.bracketStop && (long ? D(p.bracketStop).gte(ref) : D(p.bracketStop).lte(ref)) || p.bracketTarget && (long ? D(p.bracketTarget).lte(ref) : D(p.bracketTarget).gte(ref))) throw new Error("Bracket exits must be on the correct sides of the entry price.");
    }
    const rate = D(settings.feeRate);
    const price = D(p.limitPrice ?? p.stopPrice ?? (p.side === "BUY" ? quote.ask : quote.bid));
    if (price.mul(p.quantity).gt(1000000)) throw new Error("Maximum simulated order notional is $1,000,000.");
    let reserve = D(0), reserveQty = D(0);
    if (!closing) {
      const position = await tx.position.findUnique({ where: { accountId_instrumentId_positionSide: { accountId: a.id, instrumentId: i.id, positionSide: p.positionSide } } });
      if (derivative && position && !D(position.leverage).eq(p.leverage)) throw new Error("Close the existing position before changing its leverage.");
      reserve = price.mul(p.quantity).div(derivative ? p.leverage : 1).plus(price.mul(p.quantity).mul(rate));
      if (D(a.availableCash).lt(reserve)) throw new Error("Insufficient available cash or margin.");
    } else {
      const position = await tx.position.findUnique({ where: { accountId_instrumentId_positionSide: { accountId: a.id, instrumentId: i.id, positionSide: p.positionSide } } });
      const exits = await tx.order.findMany({ where: { accountId: a.id, instrumentId: i.id, positionSide: p.positionSide, status: "OPEN", reservedQuantity: { gt: 0 } } });
      const grouped = new Map(exits.map(o => [o.orderGroupId ?? o.id, D(o.reservedQuantity)]));
      const reservedQty = [...grouped.values()].reduce((s, q) => s.plus(q), D(0));
      // Market closes can consume bracket-protected inventory. Settlement resizes surviving exits atomically.
      const reservedNonBracket = exits.filter(o => !o.orderGroupId).reduce((s, o) => s.plus(o.reservedQuantity), D(0));
      if (!position || D(position.quantity).minus(p.orderType === "MARKET" ? reservedNonBracket : reservedQty).lt(p.quantity)) throw new Error("Insufficient unreserved holdings.");
      reserveQty = D(p.quantity);
    }
    const expiresAt = p.expiresAt ? new Date(p.expiresAt) : p.timeInForce === "DAY" ? new Date(new Date().setUTCHours(23, 59, 59, 999)) : null;
    if (expiresAt && expiresAt <= new Date()) throw new Error("Expiration must be in the future.");
    const order = await tx.order.create({ data: { accountId: a.id, instrumentId: i.id, clientOrderId: p.clientOrderId, requestFingerprint: fingerprint, side: p.side, orderType: p.orderType, quantity: p.quantity, limitPrice: p.limitPrice, stopPrice: p.stopPrice, bracketStop: p.bracketStop, bracketTarget: p.bracketTarget, positionSide: p.positionSide, leverage: p.leverage, reduceOnly: closing, status: "OPEN", reservedAmount: fixed(reserve), reservedQuantity: fixed(reserveQty), feeRate: fixed(rate), estimatedFee: fixed(price.mul(p.quantity).mul(rate)), timeInForce: p.timeInForce, expiresAt } });
    await tx.tradingAccount.update({ where: { id: a.id }, data: { availableCash: { decrement: fixed(reserve) }, reservedCash: { increment: fixed(reserve) } } });
    const state = conditionalState(order.orderType, order.side, D(quote.bid), D(quote.ask), order.limitPrice && D(order.limitPrice), order.stopPrice && D(order.stopPrice), false);
    if (state.triggered) await tx.order.update({ where: { id: order.id }, data: { triggeredAt: new Date() } });
    if (state.executable) return settle(tx, order, await tx.tradingAccount.findUniqueOrThrow({ where: { id: a.id } }), i, quote);
    if (["IOC", "FOK"].includes(p.timeInForce)) { await releaseOrder(tx, order, "CANCELLED", "Not immediately executable"); return tx.order.findUniqueOrThrow({ where: { id: order.id } }); }
    return order;
  });
}

export async function cancelOrder(userId: string, orderId: string, scope = "main") {
  const order = await db.order.findFirst({ where: { id: orderId, account: { userId, scope } } });
  if (!order) throw new Error("Order not found.");
  return withAccount(order.accountId, async tx => {
    const account = await tx.tradingAccount.findUniqueOrThrow({ where: { id: order.accountId } });
    if (account.accountStatus !== "ACTIVE") throw new Error("Trading account is closed.");
    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (current.status === "CANCELLED") return current;
    if (!["OPEN", "PARTIALLY_FILLED"].includes(current.status)) throw new Error("Only open orders may be cancelled.");
    await releaseOrder(tx, current, "CANCELLED");
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}
export async function processOpenOrders() {
  // A cursor scans all orders rather than indefinitely starving order 1001.
  let filled = 0;
  let failed = 0;
  let cursor: string | undefined;
  do {
  const orders = await db.order.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } }, select: { id: true, accountId: true }, orderBy: { id: "asc" }, take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  if (!orders.length) break;
  cursor = orders.at(-1)!.id;
  for (const candidate of orders) {
    assertWorkerRunning();
    try { await withAccount(candidate.accountId, async tx => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: candidate.id }, include: { instrument: { include: { quote: true } }, account: { include: { user: true } } } });
      if (!["OPEN", "PARTIALLY_FILLED"].includes(order.status)) return;
      if (order.expiresAt && order.expiresAt <= new Date()) { await releaseOrder(tx, order, "EXPIRED"); return; }
       if (order.account.accountStatus !== "ACTIVE" || order.account.user.accountStatus !== "ACTIVE") { await releaseOrder(tx, order, "REJECTED", "Trading account is inactive"); return; }
       if (order.instrument.tradingStatus !== "ACTIVE") return;
      if (order.account.scope !== "main") { const c = await tx.challenge.findUnique({ where: { id: order.account.scope } }); if (!c || c.endTime <= new Date() || !["ACTIVE", "UPCOMING"].includes(c.status)) { await releaseOrder(tx, order, "EXPIRED", "Challenge ended"); return; } if (c.startTime > new Date()) return; }
      const quote = order.instrument.quote;
      const settings = await getTradingConfig(tx);
      if (!quote || !isFresh(quote, Date.now(), settings.quoteMaxAgeMs) || !quote.bid || !quote.ask || quote.mode !== order.account.dataMode) return;
      const position = await tx.position.findUnique({ where: { accountId_instrumentId_positionSide: { accountId: order.accountId, instrumentId: order.instrumentId, positionSide: order.positionSide } } });
      if (!order.reduceOnly && order.instrument.instrumentType !== "SPOT" && position && !D(position.leverage).eq(order.leverage)) { await releaseOrder(tx, order, "REJECTED", "Existing position has different leverage"); return; }
      const state = conditionalState(order.orderType, order.side, D(quote.bid), D(quote.ask), order.limitPrice && D(order.limitPrice), order.stopPrice && D(order.stopPrice), !!order.triggeredAt);
      if (state.triggered && !order.triggeredAt) {
        await tx.order.update({ where: { id: order.id }, data: { triggeredAt: new Date() } });
        await tx.notification.create({ data: { userId: order.account.userId, notificationType: "ORDER_TRIGGERED", title: "Conditional order triggered", message: `${order.instrument.symbol}: trigger reached. ${order.orderType.includes("LIMIT") ? "Limit constraint still applies." : "Market execution pending."}` } });
      }
      if (!state.executable) return;
      const cost = D(order.side === "BUY" ? quote.ask : quote.bid).mul(D(order.quantity).minus(order.filledQuantity));
      if (!order.reduceOnly && D(order.account.availableCash).plus(order.reservedAmount).lt(cost.div(order.instrument.instrumentType === "SPOT" ? 1 : order.leverage).plus(cost.mul(order.feeRate)))) {
        await releaseOrder(tx, order, "REJECTED", "Insufficient funds after market gap");
        await tx.notification.create({ data: { userId: order.account.userId, notificationType: "ORDER_REJECTED", title: "Order rejected at trigger", message: "Market gap exceeded available cash or margin. Reservation released." } }); return;
      }
      await settle(tx, order, order.account, order.instrument, quote); filled++;
    }); } catch (error) {
      if (error instanceof WorkerLeaseLostError) throw error;
      failed++;
      console.error(JSON.stringify({ event: "order_processing_error", orderId: candidate.id, message: error instanceof Error ? error.message : "unknown" }));
    }
  }
  } while (cursor);
  if (failed) throw new Error(`${failed} order transaction(s) failed; worker readiness withheld.`);
  return filled;
}
export async function getOrder(userId: string, id: string, scope = "main") {
  return db.order.findFirst({ where: { id, account: { userId, scope } }, include: { instrument: true, executions: { orderBy: { executionTimestamp: "desc" } } } });
}
export async function getOrders(userId: string, status?: string, scope = "main") {
  // Closed challenge accounts retain a readable immutable audit trail.
  const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId, scope } } });
  if (!account) throw new Error("Trading account unavailable.");
  const valid = ["OPEN", "FILLED", "CANCELLED", "REJECTED", "EXPIRED", "PENDING", "PARTIALLY_FILLED"];
  return db.order.findMany({ where: { accountId: account.id, ...(status && valid.includes(status) ? { status: status as "OPEN" } : {}) }, include: { instrument: true, executions: { orderBy: { executionTimestamp: "desc" } } }, orderBy: { createdAt: "desc" }, take: 500 });
}
