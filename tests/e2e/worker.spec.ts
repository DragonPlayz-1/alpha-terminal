import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";

test.afterAll(() => db.$disconnect());
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 28000);
  try { await exited; } finally { clearTimeout(timer); }
}

test("standalone readiness, live worker exclusivity, takeover and clean shutdown", async ({ request }) => {
  test.setTimeout(150000);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/api/ready")).status()).toBe(503);
  const start = () => spawn(process.execPath, ["--import", "tsx", "worker/market-worker.ts"], { env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  const first = start();
  const logs: string[] = [];
  first.stdout!.on("data", data => logs.push(data.toString()));
  first.stderr!.on("data", data => logs.push(data.toString()));
  let second: ChildProcess | undefined;
  try {
    await expect.poll(async () => (await request.get("/api/ready")).status(), { timeout: 100000, intervals: [1000] }).toBe(200);
    const original = await db.workerLease.findUniqueOrThrow({ where: { name: "market-worker" } });
    second = start();
    const secondLogs: string[] = [];
    second.stdout!.on("data", data => secondLogs.push(data.toString()));
    second.stderr!.on("data", data => secondLogs.push(data.toString()));
    await expect.poll(async () => (await db.workerLease.findUniqueOrThrow({ where: { name: "market-worker" } })).heartbeatAt.getTime(), { timeout: 20000 }).toBeGreaterThan(original.heartbeatAt.getTime());
    expect((await db.workerLease.findUniqueOrThrow({ where: { name: "market-worker" } })).owner).toBe(original.owner);
    expect(secondLogs.join("")).not.toContain("worker_leader_acquired");
    const markets = await request.get("/api/markets?refresh=0");
    expect(markets.status()).toBe(200);
    const live = (await markets.json()).data.instruments.filter((i: { quote?: { freshness?: string } }) => i.quote?.freshness === "LIVE");
    expect(live.length).toBeGreaterThan(0);
    await stop(first);
    await expect.poll(async () => (await db.workerLease.findUniqueOrThrow({ where: { name: "market-worker" } })).owner, { timeout: 20000 }).not.toBe(original.owner);
    await expect.poll(async () => (await request.get("/api/ready")).status(), { timeout: 40000 }).toBe(200);
    expect(logs.join("")).not.toContain("worker_tick_failed");
    expect(secondLogs.join("")).not.toContain("worker_tick_failed");
    await stop(second);
    expect((await request.get("/api/ready")).status()).toBe(503);
  } finally { await stop(first); if (second) await stop(second); }
});
