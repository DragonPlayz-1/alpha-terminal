import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export const WORKER_NAME = "market-worker";
export const WORKER_LEASE_MS = 60_000;
export const workerOwner = randomUUID();

export async function acquireWorkerLease(owner: string = workerOwner) {
  const rows = await db.$queryRaw<Array<{ owner: string }>>`
    INSERT INTO "WorkerLease" (name, owner, "expiresAt", "heartbeatAt")
    VALUES (${WORKER_NAME}, ${owner}, NOW() + INTERVAL '60 seconds', NOW())
    ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, "expiresAt" = EXCLUDED."expiresAt", "heartbeatAt" = NOW()
      , "lastSuccessAt" = CASE WHEN "WorkerLease".owner = ${owner} AND "WorkerLease"."expiresAt" > NOW() THEN "WorkerLease"."lastSuccessAt" ELSE NULL END
    WHERE "WorkerLease"."expiresAt" <= NOW() OR "WorkerLease".owner = ${owner}
    RETURNING owner`;
  return rows.length === 1;
}

export async function renewWorkerLease(owner: string = workerOwner) {
  const count = await db.$executeRaw`
    UPDATE "WorkerLease" SET "expiresAt" = clock_timestamp() + INTERVAL '60 seconds', "heartbeatAt" = clock_timestamp()
    WHERE name = ${WORKER_NAME} AND owner = ${owner} AND "expiresAt" > clock_timestamp()`;
  return count === 1;
}

export async function workerSuccess(owner: string = workerOwner) {
  await db.$executeRaw`UPDATE "WorkerLease" SET "lastSuccessAt" = clock_timestamp() WHERE name = ${WORKER_NAME} AND owner = ${owner} AND "expiresAt" > clock_timestamp()`;
}

export async function releaseWorkerLease(owner: string = workerOwner) {
  await db.workerLease.updateMany({ where: { name: WORKER_NAME, owner }, data: { expiresAt: new Date(0) } });
}

export async function workerHealth() {
  const lease = await db.workerLease.findUnique({ where: { name: WORKER_NAME } });
  const now = Date.now();
  return { healthy: !!lease && lease.expiresAt.getTime() > now && !!lease.lastSuccessAt && now - lease.lastSuccessAt.getTime() < 120_000, lastSuccessAt: lease?.lastSuccessAt?.toISOString() ?? null, heartbeatAt: lease?.heartbeatAt.toISOString() ?? null };
}
