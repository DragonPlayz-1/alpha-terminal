import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";

const schema = z.object({ feeRate: z.coerce.number().finite().min(0).max(0.1).optional(), quoteMaxAgeMs: z.coerce.number().int().min(1000).max(300000).optional() }).strict();
async function adminUser() { const user = await requireApiUser(); if (!user || user.role !== "ADMIN") return null; return user; }
export async function GET() {
  try { if (!await adminUser()) return apiError("Admin access required.", 403, "ADMIN_REQUIRED"); const rows = await db.appConfig.findMany({ where: { key: { in: ["feeRate", "quoteMaxAgeMs"] } } }); return apiSuccess({ config: Object.fromEntries(rows.map(row => [row.key, row.value])) }); }
  catch (error) { return apiException(error, "Admin configuration is unavailable.", 503, "ADMIN_CONFIG_UNAVAILABLE"); }
}
export async function PATCH(request: NextRequest) {
  try { const user = await adminUser(); if (!user) return apiError("Admin access required.", 403, "ADMIN_REQUIRED"); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("Invalid configuration.", 400, "INVALID_ADMIN_CONFIGURATION"); await db.$transaction(async tx => { if (parsed.data.feeRate !== undefined) await tx.appConfig.upsert({ where: { key: "feeRate" }, create: { key: "feeRate", value: parsed.data.feeRate }, update: { value: parsed.data.feeRate } }); if (parsed.data.quoteMaxAgeMs !== undefined) await tx.appConfig.upsert({ where: { key: "quoteMaxAgeMs" }, create: { key: "quoteMaxAgeMs", value: parsed.data.quoteMaxAgeMs }, update: { value: parsed.data.quoteMaxAgeMs } }); await tx.auditLog.create({ data: { userId: user.id, action: "ADMIN_CONFIG_UPDATED", entityType: "AppConfig", metadata: parsed.data } }); }); return apiSuccess({ saved: true }); }
  catch (error) { return apiException(error, "Unable to update admin configuration.", 503, "ADMIN_CONFIG_UPDATE_UNAVAILABLE"); }
}
