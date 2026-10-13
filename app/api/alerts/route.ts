import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";

const createSchema = z.object({ symbol: z.string().trim().toUpperCase().min(3).max(20), direction: z.enum(["ABOVE", "BELOW"]), target: z.coerce.number().finite().positive().max(1_000_000_000) }).strict();

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const alerts = await db.priceAlert.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return apiSuccess({ alerts: alerts.map(alert => ({ id: alert.id, symbol: alert.symbol, direction: alert.direction, target: alert.target.toString(), active: alert.active, createdAt: alert.createdAt.toISOString() })) });
  } catch (error) {
    return apiException(error, "Unable to load price alerts.", 503, "ALERTS_UNAVAILABLE");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Enter a valid price alert.", 400, "INVALID_ALERT");
    const instrument = await db.instrument.findUnique({ where: { symbol: parsed.data.symbol }, select: { symbol: true } });
    if (!instrument) return apiError("Instrument not found.", 404, "INSTRUMENT_NOT_FOUND");
    const alert = await db.priceAlert.create({ data: { userId: user.id, symbol: instrument.symbol, direction: parsed.data.direction, target: parsed.data.target.toString() } });
    return apiSuccess({ alert: { id: alert.id, symbol: alert.symbol, direction: alert.direction, target: alert.target.toString(), active: alert.active, createdAt: alert.createdAt.toISOString() } }, 201);
  } catch (error) {
    return apiException(error, "Unable to create the price alert.", 503, "ALERT_CREATE_UNAVAILABLE");
  }
}
