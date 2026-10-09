import { db } from "@/lib/db";
import { D, fixed, normalizedReturn } from "@/server/trading/math";
import { valueAccount } from "@/server/trading/valuation";
import { createTradingAccount } from "@/server/auth/account";
import { withAccount } from "@/server/trading/transaction";
import { releaseOrder } from "@/server/trading/settlement";
import { assertWorkerRunning, fenceWorkerTransaction } from "@/server/worker-context";

export async function leaderboard(type = "all-time", limit = 50) {
  const rows = await db.leaderboardSnapshot.findMany({
    where: { leaderboardType: type, periodKey: "current", snapshotTimestamp: { gte: new Date(Date.now() - 15 * 60_000) }, user: { accountStatus: "ACTIVE", publicProfile: true, publicHistory: true, isGuest: false } },
    orderBy: [{ rank: "asc" }, { userId: "asc" }], take: limit,
    include: { user: { select: { username: true, avatarUrl: true, achievements: { include: { achievement: true }, take: 3 } } } },
  });
  return rows.map((row, index) => ({ rank: index + 1, userId: row.userId, username: row.user.username, avatarUrl: row.user.avatarUrl, returnPercentage: row.returnPercentage.toString(), realizedPnl: row.realizedPnl.toString(), tradeCount: row.tradeCount, winRate: row.winRate?.toString() ?? "0", achievements: row.user.achievements.map(a => a.achievement.name), snapshotTimestamp: row.snapshotTimestamp.toISOString() }));
}

// Worker-only calculation. Public requests read bounded snapshots, not a full
// database scan plus one valuation transaction per user.
export async function writeLeaderboardSnapshot(type = "all-time", periodKey = "current") {
  const entries: Array<{ userId: string; returnPercentage: string; realizedPnl: string; realizedReturn: string; tradeCount: number; winRate: string }> = [];
  let cursor: string | undefined;
  for (;;) {
    const accounts = await db.tradingAccount.findMany({ where: { scope: "main", accountStatus: "ACTIVE", user: { accountStatus: "ACTIVE", publicProfile: true, publicHistory: true, isGuest: false } }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!accounts.length) break;
    cursor = accounts.at(-1)!.id;
    for (const account of accounts) {
      assertWorkerRunning();
      const value = await valueAccount(account.id);
      if (!value.complete) continue;
      const [tradeCount, closed, wins] = await Promise.all([
        db.execution.count({ where: { order: { accountId: account.id } } }),
        db.execution.count({ where: { order: { accountId: account.id, reduceOnly: true } } }),
        db.execution.count({ where: { order: { accountId: account.id, reduceOnly: true }, realizedPnl: { gt: 0 } } }),
      ]);
      if (!tradeCount || type === "win-rate" && !closed) continue;
      entries.push({ userId: account.userId, returnPercentage: value.returnPct, realizedPnl: value.account.realizedPnl.toString(), realizedReturn: D(value.account.realizedPnl).div(account.initialCapital).toString(), tradeCount, winRate: closed ? D(wins).div(closed).mul(100).toFixed(8) : "0" });
    }
  }
  const key = type === "realized" ? "realizedReturn" : type === "win-rate" ? "winRate" : "returnPercentage";
  entries.sort((a, b) => D(b[key]).cmp(a[key]) || a.userId.localeCompare(b.userId));
  await db.$transaction(async tx => {
    await fenceWorkerTransaction(tx);
    // Serializes concurrent snapshot publishers without deleting another batch.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leaderboard:${type}:${periodKey}`}))`;
    await tx.leaderboardSnapshot.deleteMany({ where: { leaderboardType: type, periodKey } });
    const snapshotRows = entries.slice(0, 500).map(({ realizedReturn: _realizedReturn, ...entry }, index) => ({ ...entry, leaderboardType: type, periodKey, rank: index + 1 }));
    if (snapshotRows.length) await tx.leaderboardSnapshot.createMany({ data: snapshotRows });
    await fenceWorkerTransaction(tx);
  });
  return entries.length;
}

export async function challenges(userId?: string) {
  const rows = await db.challenge.findMany({ where: { status: { in: ["ACTIVE", "UPCOMING", "ENDED"] } }, include: { participants: { where: { userId: userId ?? "" }, select: { id: true } }, _count: { select: { participants: true } } }, orderBy: { startTime: "desc" }, take: 100 });
  const now = new Date();
  return rows.map(c => ({ id: c.id, name: c.name, description: c.description, startingCapital: c.startingCapital.toString(), startTime: c.startTime.toISOString(), endTime: c.endTime.toISOString(), status: c.endTime <= now || c.status === "ENDED" ? "ENDED" : c.startTime > now ? "UPCOMING" : "ACTIVE", participants: c._count.participants, joined: Boolean(userId && c.participants.length > 0), accountScope: userId && c.participants.length > 0 ? c.id : null, configuration: c.configuration }));
}

export async function finalizeExpiredChallenges(now = new Date()) {
  const expired = await db.challenge.findMany({ where: { status: { in: ["ACTIVE", "UPCOMING"] }, endTime: { lte: now } } });
  let finalized = 0;
  for (const challenge of expired) {
    const participants = await db.challengeParticipant.findMany({ where: { challengeId: challenge.id, finalizedAt: null } });
    for (const participant of participants) {
      const account = await db.tradingAccount.findUniqueOrThrow({ where: { userId_scope: { userId: participant.userId, scope: challenge.id } } });
      await withAccount(account.id, async tx => {
        const current = await tx.challengeParticipant.findUniqueOrThrow({ where: { id: participant.id } });
        if (current.finalizedAt) return;
        // An outage must never substitute post-deadline prices. The published
        // rules use the last complete pre-deadline snapshot (including every fill).
        const snapshot = await tx.portfolioSnapshot.findFirst({ where: { accountId: account.id, snapshotTimestamp: { lte: challenge.endTime } }, orderBy: [{ snapshotTimestamp: "desc" }, { id: "desc" }] });
        const orders = await tx.order.findMany({ where: { accountId: account.id, status: { in: ["OPEN", "PARTIALLY_FILLED", "PENDING"] } } });
        for (const order of orders) await releaseOrder(tx, order, "EXPIRED", "Challenge ended");
        if (!snapshot) {
          await tx.challengeParticipant.update({ where: { id: current.id }, data: { finalizationError: "No complete pre-deadline valuation was available; manual review is required." } });
          await tx.tradingAccount.update({ where: { id: account.id }, data: { accountStatus: "CLOSED" } });
          await tx.auditLog.create({ data: { userId: participant.userId, action: "CHALLENGE_FINALIZATION_BLOCKED", entityType: "ChallengeParticipant", entityId: current.id, metadata: { challengeId: challenge.id } } });
          return;
        }
        await tx.challengeParticipant.update({ where: { id: current.id }, data: { finalEquity: snapshot.equity, performance: fixed(normalizedReturn(D(snapshot.equity), D(current.startingEquity))), finalizedAt: now, valuationAt: snapshot.snapshotTimestamp } });
        await tx.tradingAccount.update({ where: { id: account.id }, data: { accountStatus: "CLOSED" } });
        finalized++;
      });
    }
    await db.$transaction(async tx => {
      await fenceWorkerTransaction(tx);
      await tx.challenge.update({ where: { id: challenge.id }, data: { status: "ENDED" } });
    });
  }
  return finalized;
}

export async function joinChallenge(userId: string, challengeId: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.accountStatus !== "ACTIVE") throw new Error("Account is not active.");
    const existing = await tx.challengeParticipant.findUnique({ where: { challengeId_userId: { challengeId, userId } } });
    if (existing) return existing;
    const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
    const now = new Date();
    if (!challenge || !["ACTIVE", "UPCOMING"].includes(challenge.status) || challenge.startTime > now || challenge.endTime <= now) throw new Error("This challenge is not accepting entries.");
    await createTradingAccount(userId, challenge.startingCapital, tx, challenge.id);
    return tx.challengeParticipant.create({ data: { challengeId, userId, startingEquity: challenge.startingCapital } });
  });
}

export async function challengeLeaderboard(challengeId: string) {
  const challenge = await db.challenge.findUniqueOrThrow({ where: { id: challengeId }, include: { participants: { where: { user: { publicProfile: true, publicHistory: true, accountStatus: "ACTIVE" } }, include: { user: { select: { username: true, avatarUrl: true } } } } } });
  const rows = [];
  const minimumTrades = Number((challenge.configuration as { minimumTrades?: number })?.minimumTrades ?? 0);
  for (const participant of challenge.participants) {
    const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId: participant.userId, scope: challengeId } } });
    if (!account) continue;
    const trades = await db.execution.count({ where: { order: { accountId: account.id } } });
    if (trades < minimumTrades) continue;
    if (!participant.finalizedAt && challenge.endTime <= new Date()) continue;
    const value = participant.finalizedAt ? null : await valueAccount(account.id);
    if (value && !value.complete) continue;
    const equity = participant.finalizedAt ? participant.finalEquity!.toString() : value!.equity;
    rows.push({ username: participant.user.username, avatarUrl: participant.user.avatarUrl, equity, performance: participant.finalizedAt ? participant.performance!.toString() : fixed(normalizedReturn(D(equity), D(participant.startingEquity))), trades, finalizedAt: participant.finalizedAt?.toISOString() ?? null, valuationAt: participant.valuationAt?.toISOString() ?? null });
  }
  return rows.sort((a, b) => D(b.performance).cmp(a.performance) || a.username.localeCompare(b.username)).slice(0, 100).map((row, index) => ({ rank: index + 1, ...row }));
}

export async function getPublicProfile(username: string) {
  const user = await db.user.findUnique({ where: { username: username.toLowerCase() }, include: { tradingAccounts: { where: { scope: "main" }, take: 1 }, achievements: { include: { achievement: true } } } });
  if (!user || !user.publicProfile || user.isGuest || user.accountStatus !== "ACTIVE") return null;
  const profile = { username: user.username, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString(), publicHistory: user.publicHistory, achievements: user.achievements.map(a => ({ name: a.achievement.name, description: a.achievement.description, unlockedAt: a.unlockedAt.toISOString() })) };
  if (!user.publicHistory || !user.tradingAccounts[0]) return profile;
  const account = user.tradingAccounts[0];
  const value = await valueAccount(account.id);
  const [trades, closed, wins] = await Promise.all([
    db.execution.count({ where: { order: { accountId: account.id } } }),
    db.execution.count({ where: { order: { accountId: account.id, reduceOnly: true } } }),
    db.execution.count({ where: { order: { accountId: account.id, reduceOnly: true }, realizedPnl: { gt: 0 } } }),
  ]);
  return { ...profile, returnPercentage: value.returnPct, complete: value.complete, realizedPnl: value.account.realizedPnl.toString(), tradeCount: trades, winRate: closed ? D(wins).div(closed).mul(100).toFixed(2) : "0" };
}
