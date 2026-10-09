import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mode = process.argv[2] ?? "unit";
if (!["unit", "e2e"].includes(mode)) throw new Error("Use unit or e2e.");
const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!source) throw new Error("Set TEST_DATABASE_URL to a PostgreSQL test database.");
const url = new URL(source);
if (!process.env.TEST_DATABASE_URL && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Remote databases require an explicit TEST_DATABASE_URL.");
}

// A fresh schema per invocation preserves application data, leases, and the
// append-only financial triggers. No test disables triggers or truncates public.
const schema = `alpha_test_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
url.searchParams.set("connection_limit", "5");
const databaseUrl = url.toString();
const admin = new PrismaClient({ datasources: { db: { url: source } } });
const testEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  TEST_SCHEMA: schema,
  NODE_ENV: "test",
  APP_URL: "http://127.0.0.1:3100",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  SESSION_SECRET: randomUUID() + randomUUID(),
  TRUSTED_ORIGINS: "",
  TRUSTED_CLIENT_IP_HEADER: "",
  TRADING_FEE_RATE: "0.001",
  QUOTE_MAX_AGE_MS: "15000",
  SMTP_URL: "smtp://127.0.0.1:2526",
  MAIL_FROM: "ALPHA Test <test@example.test>",
};
let child;
let runtime;
let interrupted = false;
function stop(signal) {
  interrupted = true;
  if (child?.pid) {
    try { process.kill(-child.pid, signal); } catch { /* already stopped */ }
  }
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function run(command, args, env = testEnv) {
  if (interrupted) throw new Error("Test run interrupted.");
  return new Promise((resolve, reject) => {
    child = spawn(command, args, { env, stdio: "inherit", detached: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      if (code === 0 && !signal) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  if (mode === "unit") {
    await run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(3)]);
  } else {
    if (process.env.E2E_SKIP_BUILD !== "1") await run("npm", ["run", "build"], { ...testEnv, NODE_ENV: "production" });
    if (readdirSync(".next/standalone").some(name => name === ".env" || name.startsWith(".env."))) throw new Error("Standalone output contains a dotenv file.");
    runtime = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "alpha-runtime-"));
    cpSync(".next/standalone", runtime, { recursive: true });
    console.log("Verifying a copied standalone artifact outside the project directory.");
    await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3)], { ...testEnv, STANDALONE_DIR: runtime });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Test run failed.");
  process.exitCode = 1;
} finally {
  // Only the unpredictable schema created by THIS invocation is eligible.
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => { console.error(`Could not remove test schema ${schema}`); process.exitCode = 1; });
  await admin.$disconnect();
  if (runtime) rmSync(runtime, { recursive: true, force: true });
}
