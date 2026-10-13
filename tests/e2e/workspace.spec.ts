import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { db } from "@/lib/db";
import { market, quote } from "../fixtures";

test.afterAll(() => db.$disconnect());

test("chart persistence, scoped navigation, watchlists, order detail, and rendered viewports", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const registered = await page.request.post("/api/auth/register", { data: { username: `visual_${suffix}`, email: `${suffix}@example.test`, password: "visual-workspace-password", initialCapital: 10000 } });
  expect(registered.status()).toBe(201);
  const instrument = await market();
  const startTime = Math.floor(Date.now() / 3600000) * 3600000 - 100 * 3600000;
  await db.marketCandle.createMany({ data: ["1h", "6h"].flatMap(timeframe => Array.from({ length: 80 }, (_, index) => ({ instrumentId: instrument.id, timeframe, openTime: new Date(startTime + index * 3600000), closeTime: new Date(startTime + (index + 1) * 3600000), open: 100 + index % 5, close: 101 + index % 5, high: 103 + index % 5, low: 99 + index % 5, volume: 100 + index }))) });
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });

  await page.goto(`/terminal?symbol=${instrument.symbol}`);
  await expect(page.getByRole("img", { name: "candles price chart", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chart settings", exact: true }).click();
  await page.getByLabel("Chart type", { exact: true }).selectOption("area");
  await page.getByLabel("Chart indicator", { exact: true }).selectOption("sma20");
  await page.getByLabel("Show volume bars").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Chart settings", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await page.getByRole("button", { name: "Crosshair", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/user/preferences")).json()).data.preferences.chartPreferences).toMatchObject({ type: "area", indicator: "sma20", timeframe: "6h", volume: false, crosshair: false });
  await page.reload();
  await expect(page.getByRole("img", { name: "area price chart with SMA 20" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crosshair", exact: true })).toHaveAttribute("aria-pressed", "false");

  await quote(instrument.id);
  await page.getByLabel("Quantity", { exact: true }).fill("1");
  await expect(page.getByText(/Server preview · Immediate simulated fill/)).toBeVisible();
  await page.getByRole("button", { name: `Buy ${instrument.baseAsset}`, exact: true }).click();
  await expect(page.getByRole("link", { name: "View order", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View order", exact: true }).click();
  await expect(page.getByText("Execution timeline", { exact: true })).toBeVisible();
  await expect(page.getByText("FILLED", { exact: true }).first()).toBeVisible();
  const orderPath = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Add a trade journal note" }).click();
  await page.locator("#journal-notes").fill("Waited for a confirmed breakout. Next time, reduce the initial size.");
  await page.getByRole("button", { name: "Save journal entry" }).click();
  await expect(page.getByText("Journal entry saved.", { exact: true })).toBeVisible();

  await page.goto("/markets");
  await page.getByLabel("New watchlist name").fill("Focused markets");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByLabel("Active watchlist name")).toHaveValue("Focused markets");
  await page.getByLabel("Add watchlist symbol").fill(instrument.symbol);
  await page.getByRole("button", { name: "Add symbol", exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove ${instrument.symbol}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Set default", exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove ${instrument.symbol} from watchlist`, exact: true }).last()).toBeVisible();
  await page.goto(`/terminal?symbol=${instrument.symbol}`);
  await expect(page.getByLabel("Terminal watchlist").locator("option:checked")).toHaveText("Focused markets");

  const challenge = await db.challenge.create({ data: { name: `Challenge ${suffix}`, description: "Scoped browser test", startingCapital: "5000", startTime: new Date(Date.now() - 10000), endTime: new Date(Date.now() + 3600000), status: "ACTIVE", configuration: { symbols: [instrument.symbol], maxLeverage: 1 } } });
  expect((await page.request.post(`/api/challenges/${challenge.id}/join`)).status()).toBe(201);
  await page.goto("/dashboard");
  await page.getByLabel("Trading account scope").selectOption(challenge.id);
  await expect(page).toHaveURL(new RegExp(`scope=${challenge.id}`));
  await page.locator("#mobile-navigation").getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/portfolio\\?scope=${challenge.id}`));
  await expect(page.getByText("$5,000.00", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Trading account scope").selectOption("main");
  await expect(page).toHaveURL(/\/portfolio$/);

  const viewports = [{ width: 320, height: 780 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 900 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of [`/terminal?symbol=${instrument.symbol}`, "/markets", "/portfolio", "/journal", orderPath, "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (path.startsWith("/terminal")) {
        await expect(page.getByRole("img", { name: "area price chart with SMA 20" })).toBeVisible();
        await expect(page.getByRole("button", { name: `Buy ${instrument.baseAsset}`, exact: true })).toBeVisible();
      }
      if (path === "/markets") {
        await expect(page.getByLabel("Active watchlist name")).toBeVisible();
        await expect(page.getByRole("button", { name: `Remove ${instrument.symbol} from watchlist`, exact: true })).toBeVisible();
      }
      if (path === "/portfolio") await expect(page.getByText("Max drawdown", { exact: true })).toBeVisible();
      if (path === "/journal") await expect(page.getByText("Waited for a confirmed breakout. Next time, reduce the initial size.", { exact: true })).toBeVisible();
      if (path === "/settings") await expect(page.getByRole("button", { name: "Save preferences", exact: true })).toBeEnabled();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if ([320, 768, 1440].includes(viewport.width) || path.startsWith("/terminal")) await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-${path.split("?")[0].replaceAll("/", "_")}.png`), fullPage: true, animations: "disabled" });
    }
  }
  await page.getByRole("button", { name: "Quick trade", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Quick command palette" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("command-palette.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Quick trade", exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".animate-slide-up").first().evaluate(element => Number.parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(.001);
  expect(failures).toEqual([]);
});
