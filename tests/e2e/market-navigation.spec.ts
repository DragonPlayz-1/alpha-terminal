import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { db } from "@/lib/db";
import { market, quote } from "../fixtures";

test.afterAll(() => db.$disconnect());

test("market and order links select the correct trading workspace and preserve account scope", async ({ page }) => {
  test.setTimeout(90000);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const registered = await page.request.post("/api/auth/register", { data: { username: `routing_${suffix}`, email: `${suffix}@example.test`, password: "market-navigation-password", initialCapital: 10000 } });
  expect(registered.status()).toBe(201);
  const [spot, contract] = await Promise.all([market(), market(true)]);
  const challenge = await db.challenge.create({ data: { name: `Routing ${suffix}`, description: "Scoped instrument navigation", startingCapital: "5000", startTime: new Date(Date.now() - 10000), endTime: new Date(Date.now() + 3600000), status: "ACTIVE", configuration: { symbols: [spot.symbol, contract.symbol], maxLeverage: 5 } } });
  expect((await page.request.post(`/api/challenges/${challenge.id}/join`)).status()).toBe(201);

  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    // Supply deterministic current marks; navigation must not depend on public providers.
    const derivatives = await db.instrument.findMany({ where: { instrumentType: { not: "SPOT" } }, select: { id: true } });
    await Promise.all(derivatives.map(instrument => quote(instrument.id)));
    await page.goto(`/markets?scope=${challenge.id}`);
    await page.getByLabel("Search assets or symbols", { exact: true }).fill(contract.symbol);
    await expect(page.getByRole("link", { name: "Trade", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Trade", exact: true })).toHaveAttribute("href", `/futures?symbol=${contract.symbol}&scope=${challenge.id}`);
    await page.getByRole("link", { name: new RegExp(contract.baseAsset) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/futures\\?symbol=${contract.symbol}&scope=${challenge.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Futures", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(contract.symbol) })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Trading account scope")).toHaveValue(challenge.id);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto(`/markets?scope=${challenge.id}`);
    await page.getByLabel("Search assets or symbols", { exact: true }).fill(spot.symbol);
    await expect(page.getByRole("link", { name: "Trade", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Trade", exact: true })).toHaveAttribute("href", `/terminal?symbol=${spot.symbol}&scope=${challenge.id}`);
    await page.getByRole("link", { name: new RegExp(spot.baseAsset) }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Trading terminal", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Buy ${spot.baseAsset}`, exact: true })).toBeVisible();
    await expect(page.getByLabel("Trading account scope")).toHaveValue(challenge.id);
  }

  await quote(contract.id);
  const created = await page.request.post("/api/orders", { data: { symbol: contract.symbol, scope: challenge.id, side: "BUY", positionSide: "LONG", leverage: 5, orderType: "MARKET", quantity: "1", timeInForce: "IOC", clientOrderId: randomUUID() } });
  expect(created.status(), await created.text()).toBe(201);
  const order = (await created.json()).data.order;
  expect(order.status).toBe("FILLED");
  await page.goto(`/orders/${order.id}?scope=${challenge.id}`);
  await expect(page.getByText("Reservation released", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open terminal", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/futures\\?symbol=${contract.symbol}&scope=${challenge.id}$`));
  await expect(page.getByRole("button", { name: new RegExp(contract.symbol) })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Trading account scope")).toHaveValue(challenge.id);
});
