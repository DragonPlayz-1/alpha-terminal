import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";

const schema = z.object({
  theme: z.enum(["dark"]).optional(),
  defaultCurrency: z.literal("USD").optional(),
  defaultMarket: z.literal("CRYPTO").optional(),
  chartPreferences: z.object({ type: z.enum(["candles", "line", "area"]).optional(), timeframe: z.enum(["1m", "5m", "15m", "1h", "6h", "1d"]).optional(), indicator: z.string().max(16).optional(), period: z.number().int().min(2).max(100).optional(), volume: z.boolean().optional(), crosshair: z.boolean().optional() }).strict().optional(),
  notificationPreferences: z.record(z.string(), z.boolean()).optional(),
}).strict();

export async function GET() {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const preferences = await db.userPreference.findUnique({ where: { userId: user.id } });
  return apiSuccess({ preferences: preferences ?? { theme: "dark", defaultCurrency: "USD", defaultMarket: "CRYPTO" } });
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid preference values.");
  const preferences = await db.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...parsed.data }, update: parsed.data });
  return apiSuccess({ preferences });
}
