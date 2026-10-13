import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";

const schema = z.object({ symbol: z.string().trim().min(3).max(30), tradingStatus: z.enum(["ACTIVE", "HALTED", "DELISTED", "DATA_UNAVAILABLE"]).optional(), maximumLeverage: z.coerce.number().finite().min(1).max(100).optional() }).strict();

async function adminUser() { const user = await requireApiUser(); if (!user || user.role !== "ADMIN") return null; return user; }
export async function GET() {
  try { const user = await adminUser(); if (!user) return apiError("Admin access required.", 403, "ADMIN_REQUIRED"); const instruments = await db.instrument.findMany({ orderBy: { symbol: "asc" } }); return apiSuccess({ instruments: instruments.map(instrument => ({ symbol: instrument.symbol, name: instrument.name, instrumentType: instrument.instrumentType, tradingStatus: instrument.tradingStatus, maximumLeverage: instrument.maximumLeverage.toString(), dataProvider: instrument.dataProvider })) }); }
  catch (error) { return apiException(error, "Instrument administration is unavailable.", 503, "ADMIN_INSTRUMENTS_UNAVAILABLE"); }
}
export async function PATCH(request: NextRequest) {
  try { const user = await adminUser(); if (!user) return apiError("Admin access required.", 403, "ADMIN_REQUIRED"); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("Invalid instrument configuration.", 400, "INVALID_INSTRUMENT_CONFIGURATION"); const instrument = await db.instrument.update({ where: { symbol: parsed.data.symbol.toUpperCase() }, data: { ...(parsed.data.tradingStatus ? { tradingStatus: parsed.data.tradingStatus } : {}), ...(parsed.data.maximumLeverage !== undefined ? { maximumLeverage: parsed.data.maximumLeverage } : {}) } }); await db.auditLog.create({ data: { userId: user.id, action: "ADMIN_INSTRUMENT_UPDATED", entityType: "Instrument", entityId: instrument.id, metadata: parsed.data } }); return apiSuccess({ instrument: { symbol: instrument.symbol, tradingStatus: instrument.tradingStatus, maximumLeverage: instrument.maximumLeverage.toString() } }); }
  catch (error) { return apiException(error, "Unable to update the instrument.", 503, "ADMIN_INSTRUMENT_UPDATE_UNAVAILABLE"); }
}
