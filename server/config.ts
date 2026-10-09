import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Tx } from "@/server/trading/transaction";

const settingsSchema = z.object({
  feeRate: z.coerce.number().finite().min(0).max(0.1),
  quoteMaxAgeMs: z.coerce.number().int().min(1000).max(300000),
});

// Read inside the caller's transaction for execution decisions. Do not cache
// financial configuration in process memory: web and worker may be separate replicas.
export async function getTradingConfig(client: Tx | typeof db = db) {
  const rows = await client.appConfig.findMany({ where: { key: { in: ["feeRate", "quoteMaxAgeMs"] } } });
  const stored = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const parsed = settingsSchema.safeParse({
    feeRate: stored.feeRate ?? env.TRADING_FEE_RATE,
    quoteMaxAgeMs: stored.quoteMaxAgeMs ?? env.QUOTE_MAX_AGE_MS,
  });
  if (!parsed.success) throw new Error("Trading configuration is invalid. Execution is paused.");
  return { ...parsed.data, feeRate: String(parsed.data.feeRate) };
}
