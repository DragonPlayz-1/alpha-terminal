import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reconcile } from "@/server/trading/ledger";
import { trader } from "../fixtures";

describe("database health", () => {
  it("can reach PostgreSQL and has the account ledger tables", async () => {
    const result = await db.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    expect(result[0]?.ok).toBe(1);
    const tables = await db.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'LedgerEntry'`;
    expect(tables.length).toBe(1);
  });
  it("reconciliation returns a diagnostic shape for an account", async () => {
    const { account } = await trader();
    const result = await reconcile(account.id);
    expect(result).toMatchObject({ ok: true, cashDelta: "0", marginDelta: "0", reservationDelta: "0", inventoryErrors: [], reservationErrors: [] });
  });
});
