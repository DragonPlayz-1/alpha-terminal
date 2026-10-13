import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { chartPreferenceSchema, normalizeChartPreferences } from "@/lib/chart-preferences";

const schema = z.object({
  theme: z.enum(["dark"]).optional(),
  defaultCurrency: z.literal("USD").optional(),
  defaultMarket: z.literal("CRYPTO").optional(),
  chartPreferences: chartPreferenceSchema.partial().strict().optional(),
  notificationPreferences: z.object({ orderFilled: z.boolean().optional(), orderTriggered: z.boolean().optional(), orderRejected: z.boolean().optional(), orderCancelled: z.boolean().optional(), liquidation: z.boolean().optional(), achievement: z.boolean().optional(), challenge: z.boolean().optional(), leaderboard: z.boolean().optional(), priceAlert: z.boolean().optional(), system: z.boolean().optional() }).strict().optional(),
}).strict();

const notificationDefaults = { orderFilled: true, orderTriggered: true, orderRejected: true, orderCancelled: true, liquidation: true, achievement: true, challenge: true, leaderboard: true, priceAlert: true, system: true };

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const preferences = await db.userPreference.findUnique({ where: { userId: user.id } });
    return apiSuccess({ preferences: preferences ? { ...preferences, notificationPreferences: preferences.notificationPreferences ?? notificationDefaults } : { theme: "dark", defaultCurrency: "USD", defaultMarket: "CRYPTO", notificationPreferences: notificationDefaults } });
  } catch (error) { return apiException(error, "Unable to load preferences.", 503, "PREFERENCES_UNAVAILABLE"); }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid preference values.");
    const preferences = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.userPreference.findUnique({ where: { userId: user.id } });
      const previousNotifications = current?.notificationPreferences;
      const notifications = previousNotifications && typeof previousNotifications === "object" && !Array.isArray(previousNotifications) ? previousNotifications : {};
      const data = { ...parsed.data,
        ...(parsed.data.chartPreferences ? { chartPreferences: { ...normalizeChartPreferences(current?.chartPreferences), ...parsed.data.chartPreferences } } : {}),
        ...(parsed.data.notificationPreferences ? { notificationPreferences: { ...notificationDefaults, ...notifications, ...parsed.data.notificationPreferences } } : {}),
      };
      return tx.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    });
    return apiSuccess({ preferences });
  } catch (error) { return apiException(error, "Unable to save preferences.", 503, "PREFERENCES_UPDATE_UNAVAILABLE"); }
}
