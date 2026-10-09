import { setTimeout as sleep } from "node:timers/promises";
import { db } from "@/lib/db";
import { getInstruments, refreshQuotes } from "@/server/market-data/service";
import { processOpenOrders } from "@/server/trading/service";
import { processDerivatives } from "@/server/trading/derivatives";
import { takeSnapshot } from "@/server/trading/valuation";
import { startCoinbaseTickerStream } from "@/server/market-data/stream";
import { finalizeExpiredChallenges, writeLeaderboardSnapshot } from "@/server/competition/service";
import { acquireWorkerLease, renewWorkerLease, releaseWorkerLease, workerSuccess, workerOwner } from "@/server/worker-health";
import { asWorker, assertWorkerRunning } from "@/server/worker-context";

let lastMaintenance = 0;
const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());

async function tick() {
  const instruments = await getInstruments();
  await refreshQuotes(instruments.map(i => i.symbol));
  assertWorkerRunning();
  // Risk processing precedes new opening fills.
  await processDerivatives();
  const filled = await processOpenOrders();
  let cursor: string | undefined;
  const now = new Date();
  const mainCutoff = new Date(now.getTime() - 300_000);
  const challengeCutoff = new Date(now.getTime() - 5_000);
  for (;;) {
    const accounts = await db.tradingAccount.findMany({ where: { accountStatus: "ACTIVE", OR: [
      { scope: "main", snapshots: { none: { snapshotTimestamp: { gt: mainCutoff } } } },
      { scope: { not: "main" }, snapshots: { none: { snapshotTimestamp: { gt: challengeCutoff } } } },
    ] }, select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!accounts.length) break;
    cursor = accounts.at(-1)!.id;
    for (const account of accounts) await takeSnapshot(account.id);
  }
  await finalizeExpiredChallenges();
  if (Date.now() - lastMaintenance > 300_000) {
    for (const type of ["all-time", "realized", "win-rate"]) await writeLeaderboardSnapshot(type);
    const now = new Date();
    await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.passwordToken.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
    lastMaintenance = Date.now();
  }
  assertWorkerRunning();
  await workerSuccess();
  if (filled) console.log(JSON.stringify({ event: "orders_filled", count: filled }));
}

async function main() {
  let stream: Awaited<ReturnType<typeof startCoinbaseTickerStream>> = null;
  let renew: ReturnType<typeof setInterval> | undefined;
  let leader = false;
  let renewing = false;
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  abort.signal.addEventListener("abort", () => {
    stream?.close();
    shutdownTimer = setTimeout(() => process.exit(1), 25000);
    shutdownTimer.unref();
  });
  try {
    while (!abort.signal.aborted) {
      if (!leader) {
        leader = await acquireWorkerLease();
        if (!leader) { await sleep(5000, undefined, { signal: abort.signal }).catch(() => undefined); continue; }
        console.log(JSON.stringify({ event: "worker_leader_acquired" }));
        renew = setInterval(() => {
          if (renewing || abort.signal.aborted) return;
          renewing = true;
          void renewWorkerLease().then(ok => { if (!ok) abort.abort(); }).catch(() => abort.abort()).finally(() => { renewing = false; });
        }, 10000);
        stream = await startCoinbaseTickerStream().catch(error => { console.warn(JSON.stringify({ event: "market_stream_unavailable", message: error instanceof Error ? error.message : "unknown" })); return null; });
      }
      try { await asWorker(workerOwner, abort.signal, tick); }
      catch (error) { console.error(JSON.stringify({ event: "worker_tick_failed", message: error instanceof Error ? error.message : "unknown" })); }
      await sleep(5000, undefined, { signal: abort.signal }).catch(() => undefined);
    }
  } finally {
    if (renew) clearInterval(renew);
    stream?.close();
    if (leader) await releaseWorkerLease().catch(() => undefined);
    await db.$disconnect();
    if (shutdownTimer) clearTimeout(shutdownTimer);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
