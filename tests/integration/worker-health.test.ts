import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acquireWorkerLease, renewWorkerLease, releaseWorkerLease, workerSuccess, workerHealth, WORKER_NAME } from "@/server/worker-health";
import { asWorker } from "@/server/worker-context";
import { withAccount } from "@/server/trading/transaction";
import { trader } from "../fixtures";

describe("worker lease", () => {
  const owners: string[] = [];

  afterEach(async () => {
    for (const owner of owners) await releaseWorkerLease(owner);
    owners.length = 0;
    await db.workerLease.updateMany({ where: { name: WORKER_NAME }, data: { expiresAt: new Date(0) } });
  });

  it("allows one owner and prevents a concurrent second owner", async () => {
    await db.workerLease.updateMany({ where: { name: WORKER_NAME }, data: { expiresAt: new Date(0) } });
    const first = randomUUID();
    const second = randomUUID();
    owners.push(first, second);
    expect(await acquireWorkerLease(first)).toBe(true);
    expect(await acquireWorkerLease(second)).toBe(false);
    await releaseWorkerLease(first);
    expect(await acquireWorkerLease(second)).toBe(true);
  });

  it("requires a successful tick from the new owner before reporting ready", async () => {
    const first = randomUUID(), second = randomUUID(); owners.push(first, second);
    expect(await acquireWorkerLease(first)).toBe(true);
    expect((await workerHealth()).healthy).toBe(false);
    await workerSuccess(first);
    expect((await workerHealth()).healthy).toBe(true);
    await releaseWorkerLease(first);
    expect(await renewWorkerLease(first)).toBe(false);
    expect(await acquireWorkerLease(second)).toBe(true);
    expect((await workerHealth()).healthy).toBe(false);
    await workerSuccess(first);
    expect((await workerHealth()).healthy).toBe(false);
    await workerSuccess(second);
    expect((await workerHealth()).healthy).toBe(true);
  });

  it("rolls back a transaction when its worker loses leadership or is aborted", async () => {
    const { account } = await trader();
    const old = randomUUID(), current = randomUUID(); owners.push(old, current);
    expect(await acquireWorkerLease(current)).toBe(true);
    const abort = new AbortController();
    await expect(asWorker(old, abort.signal, () => withAccount(account.id, tx => tx.tradingAccount.update({ where: { id: account.id }, data: { availableCash: 5 } })))).rejects.toThrow("leadership lost");
    await expect(asWorker(current, abort.signal, () => withAccount(account.id, async tx => {
      await tx.tradingAccount.update({ where: { id: account.id }, data: { availableCash: 5 } });
      abort.abort();
    }))).rejects.toThrow("leadership lost");
    expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).availableCash.toString()).toBe("10000");
  });
});
