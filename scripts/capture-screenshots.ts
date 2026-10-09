import "dotenv/config";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";

const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!source) throw new Error("Set DATABASE_URL before capturing screenshots.");

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
const runtime = mkRuntimePath();
const output = resolve("docs/screenshots");
let server: ChildProcess | undefined;

function mkRuntimePath() {
  return join(tmpdir(), `alpha-screenshot-runtime-${randomUUID()}`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: "inherit", detached: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 && !signal ? resolvePromise() : reject(new Error(`${command} exited with ${signal ?? code}`)));
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch { /* The standalone process is still starting. */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  }
  throw new Error("The screenshot server did not become healthy.");
}

async function prepareDemoData() {
  process.env.DATABASE_URL = databaseUrl;
  const { ensureDefaultInstruments } = await import("@/server/auth/account");
  await ensureDefaultInstruments();
  const quoteValues = [
    ["BTC-USD", "82500", "82514"],
    ["ETH-USD", "3808", "3814"],
    ["SOL-USD", "191", "192"],
    ["XRP-USD", "0.52", "0.53"],
    ["DOGE-USD", "0.17", "0.18"],
    ["ADA-USD", "0.44", "0.45"],
    ["AVAX-USD", "35.20", "35.35"],
    ["LINK-USD", "18.40", "18.55"],
    ["LTC-USD", "82.10", "82.35"],
    ["DOT-USD", "4.12", "4.18"],
    ["BTC-PERP", "82490", "82510"],
    ["ETH-PERP", "3802", "3818"],
    ["SOL-PERP", "190", "193"],
  ] as const;
  for (const [symbol, bid, ask] of quoteValues) {
    const instrument = await db.instrument.findUnique({ where: { symbol } });
    if (!instrument) continue;
    await db.marketQuote.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, bid, ask, lastPrice: bid, markPrice: bid, mode: "LIVE", sourceTimestamp: new Date() },
      update: { bid, ask, lastPrice: bid, markPrice: bid, mode: "LIVE", sourceTimestamp: new Date(), receivedAt: new Date() },
    });
  }
  await db.challenge.upsert({
    where: { id: "weekly-discipline-challenge" },
    create: { id: "weekly-discipline-challenge", name: "The 7-Day Discipline", description: "Build positive simulated performance while keeping your decisions measured.", startingCapital: "10000", startTime: new Date(Date.now() - 86_400_000), endTime: new Date(Date.now() + 6 * 86_400_000), configuration: { eligibleMarkets: ["CRYPTO"], maxLeverage: 1, ranking: "return_percentage", minimumTrades: 1 }, status: "ACTIVE" },
    update: { status: "ACTIVE", startTime: new Date(Date.now() - 86_400_000), endTime: new Date(Date.now() + 6 * 86_400_000) },
  });
}

async function capture() {
  mkdirSync(output, { recursive: true });
  const credentials = { username: `demo_${randomUUID().replaceAll("-", "").slice(0, 10)}`, email: `demo_${randomUUID().replaceAll("-", "").slice(0, 10)}@example.test`, password: "demo-screenshot-password-2026", initialCapital: 10000 };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/register`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("market_maven").fill(credentials.username);
    await page.getByPlaceholder("you@example.com").fill(credentials.email);
    await page.getByLabel("Create password", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: /create simulated account/i }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });

    const order = await page.evaluate(async clientOrderId => {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: "BTC-USD", side: "BUY", orderType: "MARKET", quantity: "0.1", clientOrderId }) });
      return { status: response.status, body: await response.json() };
    }, randomUUID());
    if (order.status !== 201) throw new Error(`Could not create screenshot demo order: ${JSON.stringify(order.body)}`);

    const pages = [
      ["landing", "/"],
      ["dashboard", "/dashboard"],
      ["terminal", "/terminal?symbol=BTC-USD"],
      ["markets", "/markets"],
      ["futures", "/futures"],
      ["challenges", "/challenges"],
      ["settings", "/settings"],
    ] as const;
    for (const [name, path] of pages) {
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: "disabled" });
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    TEST_SCHEMA: schema,
    NODE_ENV: "test",
    APP_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    SESSION_SECRET: randomUUID() + randomUUID(),
    TRUSTED_ORIGINS: "",
    TRUSTED_CLIENT_IP_HEADER: "",
    QUOTE_MAX_AGE_MS: "300000",
    TRADING_FEE_RATE: "0.001",
  };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], testEnv);
    await run("npm", ["run", "build"], { ...testEnv, NODE_ENV: "production" });
    await prepareDemoData();
    cpSync(".next/standalone", runtime, { recursive: true });
    server = spawn(process.execPath, ["scripts/start.mjs"], { cwd: process.cwd(), env: { ...testEnv, NODE_ENV: "production", STANDALONE_DIR: runtime, PORT: "3200", LISTEN_HOST: "127.0.0.1" }, stdio: "inherit", detached: true });
    await waitForHealth();
    await capture();
    console.log(`Captured ${output} screenshots.`);
  } finally {
    if (server?.pid) {
      try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
    }
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await admin.$disconnect();
    rmSync(runtime, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
