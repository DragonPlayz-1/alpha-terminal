import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrder, getOrder } from "@/server/trading/service";
import { getPortfolioAnalytics } from "@/server/trading/analytics";
import { trader, market, clientOrderId } from "../fixtures";

describe("journal, lifecycle events, analytics, and notification preferences", () => {
  it("records append-only order lifecycle events and computes performance metrics", async () => {
    const { user } = await trader();
    const instrument = await market(false, "100", "101");
    const order = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "2", clientOrderId: clientOrderId() });
    const detail = await getOrder(user.id, order.id);
    expect(detail?.events.map(event => event.eventType)).toEqual(["CREATED", "FILLED"]);
    expect(detail?.executions).toHaveLength(1);
    await expect(db.orderEvent.update({ where: { id: detail!.events[0].id }, data: { message: "rewritten" } })).rejects.toThrow("append-only");

    const analytics = await getPortfolioAnalytics(user.id);
    expect(analytics.tradeCount).toBe(1);
    expect(analytics.closedTradeCount).toBe(0);
    expect(analytics.fees).toBe("0.202");
    expect(analytics.startingEquity).toBe("10000");
  });

  it("suppresses disabled notification categories without affecting settlement", async () => {
    const { user, account } = await trader();
    const instrument = await market();
    await db.userPreference.create({ data: { userId: user.id, notificationPreferences: { orderFilled: false } } });
    await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    expect(await db.notification.count({ where: { userId: user.id, notificationType: "ORDER_FILLED" } })).toBe(0);
    expect(await db.execution.count({ where: { order: { accountId: account.id } } })).toBe(1);
    expect(await db.orderEvent.count({ where: { order: { accountId: account.id }, eventType: "FILLED" } })).toBe(1);
  });

  it("measures drawdowns beyond the chart page limit and uses the preceding period baseline", async () => {
    const { user, account } = await trader();
    const now = Date.now();
    await db.tradingAccount.update({ where: { id: account.id }, data: { createdAt: new Date(now - 4 * 86400000) } });
    await db.portfolioSnapshot.create({ data: { accountId: account.id, equity: "12000", cashBalance: "12000", reservedCash: "0", spotValue: "0", realizedPnl: "0", unrealizedPnl: "0", snapshotTimestamp: new Date(now - 86400000 - 5000) } });
    await db.portfolioSnapshot.createMany({ data: Array.from({ length: 510 }, (_, index) => ({ accountId: account.id, equity: index === 505 ? "6000" : "12000", cashBalance: "10000", reservedCash: "0", spotValue: "0", realizedPnl: "0", unrealizedPnl: "0", snapshotTimestamp: new Date(now - 80000000 + index * 1000) })) });
    const metrics = await getPortfolioAnalytics(user.id, "main", "1d");
    expect(metrics.snapshotCount).toBeGreaterThan(500);
    expect(metrics.startingEquity).toBe("12000");
    expect(metrics.endingEquity).toBe("10000");
    expect(metrics.maxDrawdownPct).toBe("50");
    expect(Number(metrics.returnPct)).toBeCloseTo(-16.6666667);
    expect(metrics.exposure).toHaveLength(120);
  });
});
