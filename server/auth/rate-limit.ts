import { db } from "@/lib/db";
export async function enforceRateLimit(key: string, limit = 10, windowMs = 60000) {
  const now = new Date(), expiresAt = new Date(Date.now() + windowMs);
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" (key, count, "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN 1 ELSE "RateLimit".count + 1 END,
    "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimit"."expiresAt" END
    RETURNING count`;
  return { allowed: rows[0].count <= limit, remaining: Math.max(0, limit - rows[0].count) };
}
