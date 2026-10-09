import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";

const context = new AsyncLocalStorage<{ owner: string; signal: AbortSignal }>();
export class WorkerLeaseLostError extends Error {
  constructor() { super("Worker leadership lost; transaction rolled back."); }
}
export function asWorker<T>(owner: string, signal: AbortSignal, work: () => Promise<T>) {
  return context.run({ owner, signal }, work);
}
export function assertWorkerRunning() {
  if (context.getStore()?.signal.aborted) throw new WorkerLeaseLostError();
}

export async function fenceWorkerTransaction(tx: Prisma.TransactionClient) {
  const worker = context.getStore();
  if (!worker) return;
  assertWorkerRunning();
  // Hold a shared lease-row lock through commit. Takeover cannot pass this
  // boundary while an old leader's account transaction is still writing.
  const rows = await tx.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM "WorkerLease"
    WHERE name = 'market-worker' AND owner = ${worker.owner} AND "expiresAt" > clock_timestamp()
    FOR SHARE`;
  if (!rows.length) throw new WorkerLeaseLostError();
}
