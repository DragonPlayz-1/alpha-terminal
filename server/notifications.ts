import type { NotificationType, Prisma } from "@prisma/client";
import type { Tx } from "@/server/trading/transaction";

const preferenceKeys: Partial<Record<NotificationType, string>> = {
  ORDER_FILLED: "orderFilled",
  ORDER_TRIGGERED: "orderTriggered",
  ORDER_REJECTED: "orderRejected",
  ORDER_CANCELLED: "orderCancelled",
  LIQUIDATION: "liquidation",
  ACHIEVEMENT: "achievement",
  CHALLENGE: "challenge",
  LEADERBOARD: "leaderboard",
  PRICE_ALERT: "priceAlert",
  SYSTEM: "system",
};

export async function createNotification(tx: Tx, data: Prisma.NotificationCreateInput) {
  const key = data.notificationType ? preferenceKeys[data.notificationType] : undefined;
  const userId = data.user?.connect?.id;
  if (key && userId) {
    const preference = await tx.userPreference.findUnique({ where: { userId }, select: { notificationPreferences: true } });
    const values = preference?.notificationPreferences;
    if (values && typeof values === "object" && !Array.isArray(values) && (values as Record<string, unknown>)[key] === false) return null;
  }
  return tx.notification.create({ data });
}
