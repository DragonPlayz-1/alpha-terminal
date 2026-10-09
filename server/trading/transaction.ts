import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fenceWorkerTransaction } from "@/server/worker-context";
export type Tx = Prisma.TransactionClient;
// Lock the account before reading materialized balances. Every cash/position writer uses this boundary.
export async function withAccount<T>(accountId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await fenceWorkerTransaction(tx);
        await tx.$queryRaw`SELECT id FROM "TradingAccount" WHERE id = ${accountId} FOR UPDATE`;
        const result = await work(tx);
        await fenceWorkerTransaction(tx);
        return result;
      }, { isolationLevel: "ReadCommitted", timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}
