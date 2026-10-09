import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export async function evaluateAchievements(tx: Tx, userId: string, accountId: string) {
  const [executions, profitable, conditional, positions, definitions] = await Promise.all([
    tx.execution.count({ where: { order: { accountId } } }),
    tx.execution.count({ where: { order: { accountId }, realizedPnl: { gt: 0 } } }),
    tx.order.count({ where: { accountId, orderType: { in: ["STOP_MARKET", "STOP_LIMIT", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"] }, status: "FILLED" } }),
    tx.position.count({ where: { accountId, quantity: { gt: 0 } } }),
    tx.achievement.findMany(),
  ]);
  const criteria = new Map<string, boolean>([
    ["First Trade", executions >= 1],
    ["First Profitable Trade", profitable >= 1],
    ["Portfolio Diversifier", positions >= 3],
    ["Risk Manager", conditional >= 1],
    ["One Hundred Trades", executions >= 100],
  ]);
  const unlocked = [];
  for (const achievement of definitions) {
    if (!criteria.get(achievement.name)) continue;
    const existing = await tx.userAchievement.findUnique({ where: { userId_achievementId: { userId, achievementId: achievement.id } } });
    if (existing) continue;
    const item = await tx.userAchievement.createMany({ data: [{ userId, achievementId: achievement.id }], skipDuplicates: true });
    if (!item.count) continue;
    await tx.notification.create({ data: { userId, notificationType: "ACHIEVEMENT", title: `Achievement unlocked: ${achievement.name}`, message: achievement.description, metadata: { achievementId: achievement.id } } });
    unlocked.push(item);
  }
  return unlocked;
}
