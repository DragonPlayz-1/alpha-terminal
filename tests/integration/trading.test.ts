import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { trader, market, quote, clientOrderId } from "../fixtures";
import { createOrder, cancelOrder, getOrder, processOpenOrders } from "@/server/trading/service";
import { reconcile } from "@/server/trading/ledger";
import { getPortfolio } from "@/server/trading/valuation";
import { processDerivatives } from "@/server/trading/derivatives";
import { persistQuote } from "@/server/market-data/service";

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.marketQuote.updateMany({ where: { instrument: { dataProvider: "test-fixture" } }, data: { mode: "UNAVAILABLE" } });
  await db.appConfig.deleteMany({ where: { key: { in: ["quoteMaxAgeMs", "feeRate"] } } });
});

describe("authoritative trading transactions", () => {
  it("posts spot cash, fees, weighted cost, partial-close P&L and ledger inventory exactly", async () => {
    const { user, account } = await trader();
    const instrument = await market();
    await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "2", clientOrderId: clientOrderId() });
    await quote(instrument.id, "120", "121");
    await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "2", clientOrderId: clientOrderId() });
    await createOrder(user.id, { symbol: instrument.symbol, side: "SELL", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    const portfolio = await getPortfolio(user.id);
    expect(portfolio.account.availableCash.toString()).toBe("9675.436");
    expect(portfolio.account.feesPaid.toString()).toBe("0.564");
    expect(portfolio.account.realizedPnl.toString()).toBe("9");
    expect(portfolio.positions[0]).toMatchObject({ quantity: "3", averageEntryPrice: "111" });
    expect(await reconcile(account.id)).toMatchObject({ ok: true, cashDelta: "0", reservationDelta: "0", inventoryErrors: [] });
  });

  it("settles one execution for concurrent identical requests and rejects changed replays", async () => {
    const { user, account } = await trader();
    const instrument = await market();
    const input = { symbol: instrument.symbol, side: "BUY" as const, orderType: "MARKET" as const, quantity: "1", clientOrderId: clientOrderId() };
    const results = await Promise.all(Array.from({ length: 8 }, () => createOrder(user.id, input)));
    expect(new Set(results.map(o => o.id)).size).toBe(1);
    expect(await db.execution.count({ where: { orderId: results[0].id } })).toBe(1);
    expect((await createOrder(user.id, { ...input, quantity: "1.000" })).id).toBe(results[0].id);
    await expect(createOrder(user.id, { ...input, quantity: "2" })).rejects.toThrow("different order details");
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });

  it("does not overspend when two orders race for the same balance", async () => {
    const { user, account } = await trader("150");
    const instrument = await market();
    const results = await Promise.allSettled(Array.from({ length: 2 }, () => createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.execution.count({ where: { order: { accountId: account.id } } })).toBe(1);
    expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).availableCash.toString()).toBe("48.899");
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });

  it("preserves reservations through cancellation/fill races and enforces ownership", async () => {
    const { user, account } = await trader();
    const other = await trader();
    const instrument = await market();
    const order = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "LIMIT", limitPrice: "90", quantity: "2", clientOrderId: clientOrderId() });
    expect(order.reservedAmount.toString()).toBe("180.18");
    expect(await getOrder(other.user.id, order.id)).toBeNull();
    await expect(cancelOrder(other.user.id, order.id)).rejects.toThrow("not found");
    await quote(instrument.id, "89", "90");
    await Promise.allSettled([processOpenOrders(), cancelOrder(user.id, order.id)]);
    const final = await getOrder(user.id, order.id);
    expect(["FILLED", "CANCELLED"]).toContain(final?.status);
    expect(final?.executions).toHaveLength(final?.status === "FILLED" ? 1 : 0);
    expect(await reconcile(account.id)).toMatchObject({ ok: true, reservationDelta: "0" });
  });

  it("arms a stop-limit independently of filling it and releases cash after an unaffordable gap", async () => {
    const { user, account } = await trader("150");
    const instrument = await market();
    const order = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "STOP_LIMIT", stopPrice: "110", limitPrice: "111", quantity: "1", clientOrderId: clientOrderId() });
    await quote(instrument.id, "112", "113");
    await processOpenOrders();
    expect(await getOrder(user.id, order.id)).toMatchObject({ status: "OPEN", triggeredAt: expect.any(Date), executions: [] });
    await quote(instrument.id, "109", "110");
    await processOpenOrders();
    expect(await getOrder(user.id, order.id)).toMatchObject({ status: "FILLED" });
    await createOrder(user.id, { symbol: instrument.symbol, side: "SELL", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    const stop = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "STOP_MARKET", stopPrice: "120", quantity: "1", clientOrderId: clientOrderId() });
    await quote(instrument.id, "199", "200");
    await processOpenOrders();
    expect(await getOrder(user.id, stop.id)).toMatchObject({ status: "REJECTED", reservedAmount: expect.anything() });
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });

  it("resizes bracket exits after a partial close and cancels the OCO counterpart", async () => {
    const { user, account } = await trader();
    const instrument = await market();
    const entry = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "2", bracketStop: "90", bracketTarget: "120", clientOrderId: clientOrderId() });
    await createOrder(user.id, { symbol: instrument.symbol, side: "SELL", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    const exits = await db.order.findMany({ where: { linkedOrderId: entry.id } });
    expect(exits).toHaveLength(2);
    expect(exits.map(o => o.reservedQuantity.toString())).toEqual(["1", "1"]);
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
    await quote(instrument.id, "121", "122");
    await Promise.all([processOpenOrders(), processOpenOrders()]);
    const final = await db.order.findMany({ where: { linkedOrderId: entry.id } });
    expect(final.map(o => o.status).sort()).toEqual(["CANCELLED", "FILLED"]);
    expect(await db.position.count({ where: { accountId: account.id } })).toBe(0);
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });

  it("honors persisted quote-age configuration and never trades a stale quote", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No provider in this deterministic test")));
    const { user, account } = await trader();
    const instrument = await market();
    await quote(instrument.id, "100", "101", new Date(Date.now() - 5000));
    await db.appConfig.upsert({ where: { key: "quoteMaxAgeMs" }, create: { key: "quoteMaxAgeMs", value: 1000 }, update: { value: 1000 } });
    await expect(createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() })).rejects.toThrow("stale or unavailable");
    expect(await db.order.count({ where: { accountId: account.id } })).toBe(0);
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });

  it("persists monotonically ordered quotes under competing writers", async () => {
    const instrument = await market();
    const start = Date.now();
    const timestamps = Array.from({ length: 20 }, (_, i) => start + i);
    await Promise.all(timestamps.reverse().map((timestamp, i) => persistQuote({ symbol: instrument.providerSymbol, bid: String(100 + i), ask: String(101 + i), lastPrice: String(100 + i), sourceTimestamp: new Date(timestamp).toISOString(), provider: instrument.dataProvider }, instrument.dataProvider)));
    const latest = await db.marketQuote.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
    expect(latest.sourceTimestamp?.getTime()).toBe(start + 19);
    expect(latest.bid?.toString()).toBe("100");
  });

  it("charges a funding interval once and liquidates an isolated gap without negative cash", async () => {
    const { user, account } = await trader();
    const instrument = await market(true, "100", "100");
    await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "10", leverage: 5, clientOrderId: clientOrderId() });
    const boundary = Math.floor(Date.now() / 28800000) * 28800000;
    const position = await db.position.findFirstOrThrow({ where: { accountId: account.id } });
    await db.position.update({ where: { id: position.id }, data: { openedAt: new Date(boundary - 1), lastFundingAt: new Date(boundary - 1) } });
    await Promise.all([processDerivatives(), processDerivatives()]);
    expect(await db.fundingEvent.count({ where: { positionId: position.id } })).toBe(1);
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
    await quote(instrument.id, "60", "60");
    await Promise.all([processDerivatives(), processDerivatives()]);
    expect(await db.liquidationEvent.count({ where: { positionId: position.id } })).toBe(1);
    expect(await db.position.count({ where: { accountId: account.id } })).toBe(0);
    expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).availableCash.gte(0)).toBe(true);
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });

  it("keeps historical executions and ledger records immutable", async () => {
    const { user, account } = await trader();
    const instrument = await market();
    const order = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    const execution = await db.execution.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(db.execution.update({ where: { id: execution.id }, data: { fee: 0 } })).rejects.toThrow("append-only");
    await expect(db.ledgerEntry.deleteMany({ where: { accountId: account.id } })).rejects.toThrow("append-only");
    await expect(db.tradingAccount.update({ where: { id: account.id }, data: { initialCapital: 99999 } })).rejects.toThrow("immutable");
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
  });
});
