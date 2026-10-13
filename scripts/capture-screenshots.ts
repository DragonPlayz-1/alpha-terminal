import "dotenv/config";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { chromium, expect, type APIRequestContext, type Page } from "@playwright/test";

// Only the unique schema created below may be seeded or removed by this script.
const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!source) throw new Error("Set DATABASE_URL or TEST_DATABASE_URL before capturing screenshots.");
const sourceUrl = new URL(source);
if (!process.env.TEST_DATABASE_URL && !["localhost", "127.0.0.1", "[::1]"].includes(sourceUrl.hostname)) {
  throw new Error("Screenshot capture requires a local database or an explicit TEST_DATABASE_URL.");
}
const schema = `alpha_screenshots_${randomUUID().replaceAll("-", "")}`;
sourceUrl.searchParams.set("schema", schema);
sourceUrl.searchParams.set("connection_limit", "5");
const databaseUrl = sourceUrl.toString();
const admin = new PrismaClient({ datasources: { db: { url: source } } });
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const origin = "http://127.0.0.1:3200";
const output = resolve("docs/screenshots");
let runtime: string | undefined;
let server: ChildProcess | undefined;
let child: ChildProcess | undefined;
let interrupted = false;

function stop(signal: NodeJS.Signals) {
  interrupted = true;
  for (const process of [child, server]) if (process?.pid) {
    try { globalThis.process.kill(-process.pid, signal); } catch { /* Already stopped. */ }
  }
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  if (interrupted) throw new Error("Screenshot capture interrupted.");
  await new Promise<void>((resolvePromise, reject) => {
    child = spawn(command, args, { env, stdio: "inherit", detached: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      if (code === 0 && !signal) resolvePromise();
      else reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (interrupted || server?.exitCode != null) throw new Error("Screenshot server stopped before becoming healthy.");
    try { if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) return; }
    catch { /* The standalone process is still starting. */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  }
  throw new Error("Screenshot server did not become healthy.");
}

const quoteValues = [
  ["BTC-USD", 82500, 82514, 2.48, 18420], ["ETH-USD", 3808, 3814, 1.76, 142600],
  ["SOL-USD", 191, 192, 4.12, 2486000], ["XRP-USD", .52, .53, -.84, 41250000],
  ["DOGE-USD", .17, .18, 1.32, 184200000], ["ADA-USD", .44, .45, -1.25, 42500000],
  ["AVAX-USD", 35.20, 35.35, 3.26, 1240000], ["LINK-USD", 18.40, 18.55, 2.18, 3150000],
  ["LTC-USD", 82.10, 82.35, -.56, 465000], ["DOT-USD", 4.12, 4.18, .92, 7540000],
  ["BTC-PERP", 82490, 82510, 2.48, 18420], ["ETH-PERP", 3802, 3818, 1.76, 142600],
  ["SOL-PERP", 190, 193, 4.12, 2486000],
] as const;

async function setQuote(symbol: string, bid: number, ask: number, change = 0, volume = 10000) {
  const instrument = await db.instrument.findUniqueOrThrow({ where: { symbol } });
  const values = { bid, ask, lastPrice: bid, markPrice: instrument.instrumentType === "SPOT" ? bid : (bid + ask) / 2, priceChangePct: change, volume, mode: "LIVE" as const, sourceTimestamp: new Date(), receivedAt: new Date() };
  await db.marketQuote.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...values }, update: values });
}

async function prepareMarkets() {
  const { ensureDefaultInstruments } = await import("@/server/auth/account");
  await ensureDefaultInstruments(db);
  // A screenshot-only provider prevents external requests from replacing fixtures.
  // LIVE is used solely inside this disposable schema to exercise normal order flows.
  await db.instrument.updateMany({ data: { dataProvider: "screenshot-fixture" } });
  for (const [symbol, bid, ask, change, volume] of quoteValues) await setQuote(symbol, bid, ask, change, volume);
  const btc = await db.instrument.findUniqueOrThrow({ where: { symbol: "BTC-USD" } });
  const anchor = Math.floor(Date.now() / 3600000) * 3600000;
  await db.marketCandle.createMany({ data: Array.from({ length: 180 }, (_, index) => {
    const open = 77600 + index * 27 + Math.sin(index / 9) * 530 + Math.cos(index / 3) * 90;
    const close = open + Math.sin(index * 1.7) * 130 + 25;
    const openTime = new Date(anchor - (180 - index) * 3600000);
    return { instrumentId: btc.id, timeframe: "1h", openTime, closeTime: new Date(openTime.getTime() + 3600000), open: open.toFixed(2), close: close.toFixed(2), high: (Math.max(open, close) + 100).toFixed(2), low: (Math.min(open, close) - 100).toFixed(2), volume: (150 + index % 17 * 18).toFixed(2), isComplete: true };
  }) });
  await db.challenge.create({ data: { id: "weekly-discipline", name: "The 7-Day Discipline", description: "Practice measured entries, consistent sizing, and a written plan for every decision.", startingCapital: "10000", startTime: new Date(Date.now() - 86400000), endTime: new Date(Date.now() + 6 * 86400000), configuration: { eligibleMarkets: ["CRYPTO"], maxLeverage: 1, ranking: "return_percentage", minimumTrades: 1 }, status: "ACTIVE" } });
}

async function post(request: APIRequestContext, path: string, data?: Record<string, unknown>) {
  const response = await request.post(path, { data });
  if (!response.ok()) throw new Error(`Screenshot fixture request ${path} returned ${response.status()}: ${await response.text()}`);
  return (await response.json()).data;
}

async function prepareAccount(request: APIRequestContext) {
  const registered = await post(request, "/api/auth/register", { username: "demo", email: "demo@example.test", password: randomUUID() + randomUUID(), initialCapital: 100000 });
  const account = await db.tradingAccount.findUniqueOrThrow({ where: { userId_scope: { userId: registered.user.id, scope: "main" } } });
  const order = async (symbol: string, side: string, quantity: string, extra = {}) => (await post(request, "/api/orders", { symbol, side, quantity, orderType: "MARKET", clientOrderId: randomUUID(), ...extra })).order;
  await setQuote("BTC-USD", 79500, 79514);
  await order("BTC-USD", "BUY", "0.5");
  await setQuote("ETH-USD", 3670, 3676);
  await order("ETH-USD", "BUY", "5");
  await setQuote("SOL-USD", 193, 194);
  await order("SOL-USD", "BUY", "30");
  for (const [symbol, bid, ask, change, volume] of quoteValues) await setQuote(symbol, bid, ask, change, volume);
  const closed = await order("BTC-USD", "SELL", "0.1");
  await order("ETH-USD", "SELL", "1");
  await order("SOL-USD", "SELL", "10");
  await order("BTC-PERP", "BUY", "0.05", { leverage: 5, positionSide: "LONG", timeInForce: "IOC" });
  const bracket = await order("BTC-USD", "BUY", "0.02", { bracketStop: "79000", bracketTarget: "87000" });
  await order("ETH-USD", "BUY", "0.5", { orderType: "LIMIT", limitPrice: "3600" });
  await post(request, "/api/challenges/weekly-discipline/join");
  await post(request, "/api/journal", { title: "BTC: patient entry, measured exit", notes: "Waited for the hourly structure to recover before entering. Took a partial exit into strength and kept the remainder within the original risk plan. The lesson: let the setup develop before increasing size.", tags: ["breakout", "position-sizing", "review"], emotionalState: "FOCUSED", outcome: "WIN", orderId: closed.id });
  await post(request, "/api/journal", { title: "SOL: respect the invalidation", notes: "The follow-through did not arrive. Reduced exposure instead of widening the plan. A small controlled loss is useful feedback; chasing the next candle is not part of the process.", tags: ["risk-management", "discipline"], emotionalState: "CALM", outcome: "LOSS", instrumentSymbol: "SOL-USD" });
  await post(request, "/api/journal", { title: "Session plan: quality over activity", notes: "Focus on BTC and ETH. Check spread and quote freshness, review the server preview, and write down the reason before submitting. Keep enough cash available for the next deliberate decision.", tags: ["preparation", "process"], emotionalState: "FOCUSED", outcome: "OPEN" });
  const lists = await db.watchlist.findMany({ where: { userId: registered.user.id } });
  for (const list of lists) await db.watchlist.update({ where: { id: list.id }, data: { isDefault: false } });
  const watchlist = lists.find(list => list.name === "Core markets") ?? (await post(request, "/api/watchlists", { name: "Core markets" })).watchlist;
  const defaultList = await request.patch(`/api/watchlists/${watchlist.id}`, { data: { isDefault: true } });
  if (!defaultList.ok()) throw new Error("Could not prepare screenshot watchlist.");
  for (const symbol of ["BTC-USD", "ETH-USD", "SOL-USD", "AVAX-USD", "LINK-USD"]) await post(request, `/api/watchlists/${watchlist.id}/items`, { symbol });
  const preferences = await request.patch("/api/user/preferences", { data: { chartPreferences: { type: "candles", indicator: "ema20", timeframe: "1h", volume: true, crosshair: true } } });
  if (!preferences.ok()) throw new Error("Could not prepare screenshot preferences.");

  // Explicitly synthetic 30-day history for the gallery; never production data.
  const portfolio = (await (await request.get("/api/portfolio")).json()).data;
  const ending = Number(portfolio.equity);
  const start = new Date(Date.now() - 30 * 86400000);
  await db.tradingAccount.update({ where: { id: account.id }, data: { createdAt: start } });
  await db.portfolioSnapshot.deleteMany({ where: { accountId: account.id } });
  await db.portfolioSnapshot.createMany({ data: Array.from({ length: 61 }, (_, index) => {
    const fraction = index / 60;
    const equity = 100000 + (ending - 100000) * fraction + Math.sin(index / 4) * 230 * Math.sin(Math.PI * fraction);
    const spotValue = Number(portfolio.spotValue) * Math.min(1, fraction * 4);
    return { accountId: account.id, snapshotTimestamp: new Date(start.getTime() + index * 12 * 3600000), equity: equity.toFixed(8), cashBalance: (equity - spotValue).toFixed(8), reservedCash: "0", spotValue: spotValue.toFixed(8), realizedPnl: (Number(portfolio.account.realizedPnl) * fraction).toFixed(8), unrealizedPnl: (Number(portfolio.unrealizedPnl) * fraction).toFixed(8) };
  }) });
  return bracket.id as string;
}

async function capturePage(page: Page, name: string, path: string, ready: () => Promise<unknown>, fullPage = true) {
  if (interrupted) throw new Error("Screenshot capture interrupted.");
  // Refresh fixture timestamps only; real providers are not involved.
  await db.marketQuote.updateMany({ data: { sourceTimestamp: new Date(), receivedAt: new Date() } });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await ready();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(output, `${name}.png`), fullPage, animations: "disabled" });
  console.log(`Captured ${name}.png`);
}

async function capture() {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin }, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const orderId = await prepareAccount(context.request);
    await capturePage(page, "landing", "/", () => expect(page.getByRole("heading", { name: /make sharper/i })).toBeVisible(), false);
    await capturePage(page, "dashboard", "/dashboard", () => expect(page.getByText("Your track record", { exact: true })).toBeVisible());
    const terminalReady = async () => {
      await expect(page.getByRole("img", { name: "candles price chart with EMA 20", exact: true })).toBeVisible();
      await page.getByLabel("Quantity", { exact: true }).fill("0.025");
      await expect(page.getByText(/Server preview · Immediate simulated fill/)).toBeVisible();
    };
    await capturePage(page, "terminal", "/terminal?symbol=BTC-USD", terminalReady);
    await page.getByRole("button", { name: "Chart settings", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: join(output, "chart-settings.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await capturePage(page, "markets", "/markets", async () => {
      await expect(page.getByLabel("Active watchlist name")).toHaveValue("Core markets");
      await expect(page.getByRole("link", { name: "Trade", exact: true })).toHaveCount(13);
    });
    await capturePage(page, "portfolio", "/portfolio", () => expect(page.getByText("Max drawdown", { exact: true })).toBeVisible());
    await capturePage(page, "journal", "/journal", () => expect(page.getByRole("heading", { name: "BTC: patient entry, measured exit", exact: true })).toBeVisible());
    await capturePage(page, "order-detail", `/orders/${orderId}`, () => expect(page.getByText("Execution timeline", { exact: true })).toBeVisible());
    await capturePage(page, "futures", "/futures?symbol=BTC-PERP", async () => {
      await page.getByLabel("Contract quantity", { exact: true }).fill("0.01");
      await expect(page.locator("form").getByText(/Server preview · Immediate simulated fill/)).toBeVisible();
    });
    await capturePage(page, "challenges", "/challenges", () => expect(page.getByRole("heading", { name: "The 7-Day Discipline", exact: true })).toBeVisible());
    await capturePage(page, "settings", "/settings", () => expect(page.getByRole("button", { name: "Save preferences", exact: true })).toBeEnabled());
    await page.getByRole("button", { name: "Quick trade", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Quick command palette" })).toBeVisible();
    await page.screenshot({ path: join(output, "command-palette.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await capturePage(page, "mobile-dashboard", "/dashboard", () => expect(page.getByText("Total equity", { exact: true })).toBeVisible(), false);
    await capturePage(page, "mobile-terminal", "/terminal?symbol=BTC-USD", async () => {
      await terminalReady();
      await page.getByRole("heading", { name: "BTC-USD", exact: true }).evaluate(element => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 96, behavior: "instant" }));
    }, false);
    await capturePage(page, "mobile-journal", "/journal", async () => {
      await page.getByRole("heading", { name: "BTC: patient entry, measured exit", exact: true }).scrollIntoViewIfNeeded();
    }, false);
    if (errors.length) throw new Error(`Browser errors during screenshot capture: ${errors.join("; ")}`);
  } finally { await browser.close(); }
}

async function main() {
  const testEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test", APP_URL: origin, NEXT_PUBLIC_APP_URL: origin, SESSION_SECRET: randomUUID() + randomUUID(), MARKET_PROVIDER: "coinbase", TRUSTED_ORIGINS: "", TRUSTED_CLIENT_IP_HEADER: "", QUOTE_MAX_AGE_MS: "300000", TRADING_FEE_RATE: "0.001" };
  for (const key of Object.keys(testEnv)) if (/^(GH_|GITHUB_|GIT_AUTHOR_|GIT_COMMITTER_)/.test(key)) delete testEnv[key];
  // Domain imports in this process must resolve the same isolated database.
  process.env.DATABASE_URL = databaseUrl;
  process.env.MARKET_PROVIDER = "coinbase";
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], testEnv);
    await run("npm", ["run", "build"], { ...testEnv, NODE_ENV: "production" });
    if (readdirSync(".next/standalone").some(name => name === ".env" || name.startsWith(".env."))) throw new Error("Standalone output contains an environment file.");
    await prepareMarkets();
    runtime = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "alpha-gallery-"));
    cpSync(".next/standalone", runtime, { recursive: true });
    server = spawn(process.execPath, ["scripts/start.mjs"], { env: { ...testEnv, NODE_ENV: "production", STANDALONE_DIR: runtime, PORT: "3200", LISTEN_HOST: "127.0.0.1" }, stdio: "inherit", detached: true });
    await waitForHealth();
    await capture();
    console.log("Product gallery written to docs/screenshots.");
  } finally {
    if (server?.pid && server.exitCode === null) {
      const exited = new Promise(resolvePromise => server!.once("exit", resolvePromise));
      try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
      await Promise.race([exited, new Promise(resolvePromise => setTimeout(resolvePromise, 5000))]);
    }
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => { console.error(`Could not remove screenshot schema ${schema}.`); process.exitCode = 1; });
    await admin.$disconnect();
    if (runtime) rmSync(runtime, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Screenshot capture failed."); process.exitCode = 1; });
