import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";

const schema = z.object({ feeRate: z.coerce.number().finite().min(0).max(0.1).optional(), quoteMaxAgeMs: z.coerce.number().int().min(1000).max(300000).optional() }).strict();
async function admin() { const user = await requireApiUser(); if (!user || user.role !== "ADMIN") throw new Error("Admin access required."); return user; }
export async function GET() { try { await admin(); const rows = await db.appConfig.findMany({ where: { key: { in: ["feeRate", "quoteMaxAgeMs"] } } }); return apiSuccess({ config: Object.fromEntries(rows.map(row => [row.key, row.value])) }); } catch (error) { return apiError(error instanceof Error ? error.message : "Admin access required.", 403); } }
export async function PATCH(request: NextRequest) { try { const user = await admin(); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("Invalid configuration."); await db.$transaction(async tx => { if (parsed.data.feeRate !== undefined) await tx.appConfig.upsert({ where: { key: "feeRate" }, create: { key: "feeRate", value: parsed.data.feeRate }, update: { value: parsed.data.feeRate } }); if (parsed.data.quoteMaxAgeMs !== undefined) await tx.appConfig.upsert({ where: { key: "quoteMaxAgeMs" }, create: { key: "quoteMaxAgeMs", value: parsed.data.quoteMaxAgeMs }, update: { value: parsed.data.quoteMaxAgeMs } }); await tx.auditLog.create({ data: { userId: user.id, action: "ADMIN_CONFIG_UPDATED", entityType: "AppConfig", metadata: parsed.data } }); }); return apiSuccess({ saved: true }); } catch (error) { const message = getErrorMessage(error); return apiError(message, message.startsWith("Unable to complete") ? 503 : 403); } }
