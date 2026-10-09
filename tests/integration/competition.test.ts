import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { trader, market, quote, clientOrderId } from "../fixtures";
import { createOrder, cancelOrder, getOrder, getOrders } from "@/server/trading/service";
import { challengeLeaderboard, challenges, finalizeExpiredChallenges, getPublicProfile, joinChallenge, leaderboard, writeLeaderboardSnapshot } from "@/server/competition/service";
import { reconcile } from "@/server/trading/ledger";

describe("competition lifecycle and privacy", () => {
  it("isolates challenge funds, joins once under concurrency, and freezes pre-deadline results", async () => {
    const { user, account: main } = await trader("10000", true);
    const instrument = await market();
    const endTime = new Date(Date.now() + 60000);
    const challenge = await db.challenge.create({ data: { name: "Isolated lifecycle test", description: "Test", startingCapital: "1000", startTime: new Date(Date.now() - 1000), endTime, status: "ACTIVE", configuration: { symbols: [instrument.symbol], maxLeverage: 1, minimumTrades: 1 } } });
    const entries = await Promise.all([joinChallenge(user.id, challenge.id), joinChallenge(user.id, challenge.id)]);
    expect(entries[0].id).toBe(entries[1].id);
    expect((await challenges()).find(c => c.id === challenge.id)?.joined).toBe(false);
    const account = await db.tradingAccount.findUniqueOrThrow({ where: { userId_scope: { userId: user.id, scope: challenge.id } } });
    const order = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", scope: challenge.id, clientOrderId: clientOrderId() });
    const pending = await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "LIMIT", quantity: "1", limitPrice: "80", scope: challenge.id, clientOrderId: clientOrderId() });
    expect(await getOrder(user.id, order.id)).toBeNull();
    expect(await getOrder(user.id, order.id, challenge.id)).not.toBeNull();
    await expect(cancelOrder(user.id, pending.id)).rejects.toThrow("not found");
    const before = await db.portfolioSnapshot.findFirstOrThrow({ where: { accountId: account.id }, orderBy: { snapshotTimestamp: "desc" } });
    // A worker outage resumes after the deadline with a very different market.
    await quote(instrument.id, "500", "501");
    await Promise.all([finalizeExpiredChallenges(endTime), finalizeExpiredChallenges(endTime)]);
    const final = await db.challengeParticipant.findUniqueOrThrow({ where: { id: entries[0].id } });
    expect(final.finalEquity?.toString()).toBe(before.equity.toString());
    expect(final.valuationAt).toEqual(before.snapshotTimestamp);
    expect(await getOrder(user.id, pending.id, challenge.id)).toMatchObject({ status: "EXPIRED" });
    expect(await getOrders(user.id, undefined, challenge.id)).toHaveLength(2);
    expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: main.id } })).availableCash.toString()).toBe("10000");
    expect(await reconcile(account.id)).toMatchObject({ ok: true });
    const ranking = await challengeLeaderboard(challenge.id);
    await quote(instrument.id, "1", "2");
    expect(await challengeLeaderboard(challenge.id)).toEqual(ranking);
    await expect(db.challengeParticipant.update({ where: { id: final.id }, data: { finalEquity: 9999 } })).rejects.toThrow("immutable");
  });

  it("hides private statistics from profile and ranking and calculates wins from closing executions", async () => {
    const { user } = await trader();
    const instrument = await market();
    await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    await quote(instrument.id, "120", "121");
    await createOrder(user.id, { symbol: instrument.symbol, side: "SELL", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    expect(await getPublicProfile(user.username)).not.toHaveProperty("returnPercentage");
    await writeLeaderboardSnapshot("win-rate");
    expect((await leaderboard("win-rate")).some(e => e.username === user.username)).toBe(false);
    await db.user.update({ where: { id: user.id }, data: { publicHistory: true } });
    expect(await getPublicProfile(user.username)).toMatchObject({ winRate: "100.00", tradeCount: 2, realizedPnl: "19" });
    await writeLeaderboardSnapshot("win-rate");
    expect((await leaderboard("win-rate")).find(e => e.username === user.username)).toMatchObject({ winRate: "100" });
    await db.user.update({ where: { id: user.id }, data: { publicHistory: false } });
    expect((await leaderboard("win-rate")).some(e => e.username === user.username)).toBe(false);
    await db.user.update({ where: { id: user.id }, data: { publicProfile: false } });
    expect(await getPublicProfile(user.username)).toBeNull();
  });

  it("records a missing final valuation for review without blocking other challenges", async () => {
    const { user } = await trader();
    const endTime = new Date(Date.now() + 60000);
    const challenge = await db.challenge.create({ data: { name: "Missing snapshot test", description: "Test", startingCapital: "1000", startTime: new Date(Date.now() - 1000), endTime, status: "ACTIVE", configuration: {} } });
    const participant = await joinChallenge(user.id, challenge.id);
    const account = await db.tradingAccount.findUniqueOrThrow({ where: { userId_scope: { userId: user.id, scope: challenge.id } } });
    await db.portfolioSnapshot.deleteMany({ where: { accountId: account.id } });
    await finalizeExpiredChallenges(endTime);
    const final = await db.challengeParticipant.findUniqueOrThrow({ where: { id: participant.id } });
    expect(final.finalizedAt).toBeNull();
    expect(final.finalizationError).toContain("manual review");
    expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).accountStatus).toBe("CLOSED");
    expect(await finalizeExpiredChallenges(endTime)).toBe(0);
  });
});
