import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { market, quote, trader } from "../fixtures";
import { processPriceAlerts } from "@/server/market-data/alerts";
import { asWorker } from "@/server/worker-context";

describe("price alerts", () => {
  it("triggers once, deactivates atomically, and creates a notification", async () => {
    const { user } = await trader();
    const instrument = await market(false, "100", "101");
    await db.priceAlert.create({ data: { userId: user.id, symbol: instrument.symbol, direction: "ABOVE", target: "100" } });

    expect(await processPriceAlerts()).toBe(1);
    expect(await processPriceAlerts()).toBe(0);
    expect(await db.priceAlert.count({ where: { userId: user.id, active: true } })).toBe(0);
    expect(await db.notification.findFirst({ where: { userId: user.id, notificationType: "PRICE_ALERT" } })).toMatchObject({ title: `${instrument.symbol} price alert` });
  });

  it("does not trigger below alerts before the target is reached", async () => {
    const { user } = await trader();
    const instrument = await market(false, "100", "101");
    await db.priceAlert.create({ data: { userId: user.id, symbol: instrument.symbol, direction: "BELOW", target: "99" } });
    expect(await processPriceAlerts()).toBe(0);
    await quote(instrument.id, "98", "99");
    expect(await processPriceAlerts()).toBe(1);
  });

  it("ignores stale quotes and rolls back alert claims when worker leadership is lost", async () => {
    const { user } = await trader(); const instrument = await market();
    const alert = await db.priceAlert.create({ data: { userId: user.id, symbol: instrument.symbol, direction: "ABOVE", target: "50" } });
    await quote(instrument.id, "100", "101", new Date(Date.now() - 600000));
    await processPriceAlerts();
    expect((await db.priceAlert.findUniqueOrThrow({ where: { id: alert.id } })).active).toBe(true);
    await quote(instrument.id);
    await expect(asWorker("not-the-owner", new AbortController().signal, processPriceAlerts)).rejects.toThrow("leadership lost");
    expect((await db.priceAlert.findUniqueOrThrow({ where: { id: alert.id } })).active).toBe(true);
    const counts = await Promise.all([processPriceAlerts(), processPriceAlerts()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await db.notification.count({ where: { userId: user.id, notificationType: "PRICE_ALERT" } })).toBe(1);
  });
});
