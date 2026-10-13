import { db } from "@/lib/db";
import { D, fixed, normalizedReturn } from "./math";
import { valueAccount } from "./valuation";

const PERIODS = { "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: null } as const;
export type AnalyticsPeriod = keyof typeof PERIODS;

export async function getPortfolioAnalytics(userId: string, scope = "main", period: AnalyticsPeriod = "all") {
  return db.$transaction(async tx => {
    const account = await tx.tradingAccount.findUnique({ where: { userId_scope: { userId, scope } } });
    if (!account) throw new Error("Trading account unavailable.");
    const now = new Date();
    const challenge = scope === "main" ? null : await tx.challenge.findUnique({ where: { id: scope }, select: { endTime: true } });
    const ended = Boolean(challenge && challenge.endTime <= now);
    const end = ended ? challenge!.endTime : now;
    const duration = PERIODS[period];
    const start = new Date(Math.max(account.createdAt.getTime(), duration === null ? account.createdAt.getTime() : end.getTime() - duration));
    const anchor = await tx.portfolioSnapshot.findFirst({ where: { accountId: account.id, snapshotTimestamp: { lte: start } }, orderBy: [{ snapshotTimestamp: "desc" }, { id: "desc" }] });
    const initial = anchor ? D(anchor.equity) : start.getTime() === account.createdAt.getTime() ? D(account.initialCapital) : null;
    const current = ended ? null : await valueAccount(account.id, tx);
    const lastSnapshot = await tx.portfolioSnapshot.findFirst({ where: { accountId: account.id, snapshotTimestamp: { lte: end } }, orderBy: [{ snapshotTimestamp: "desc" }, { id: "desc" }] });
    const ending = current ? D(current.equity) : lastSnapshot ? D(lastSnapshot.equity) : null;
    let peak = initial, maxDrawdown = D(0), maxDrawdownAmount = D(0), snapshotCount = 0;
    let cursor: string | undefined;
    function observe(value: ReturnType<typeof D>) {
      if (!peak || value.gt(peak)) peak = value;
      const drawdown = peak.gt(0) ? peak.minus(value).div(peak).mul(100) : D(0);
      if (drawdown.gt(maxDrawdown)) { maxDrawdown = drawdown; maxDrawdownAmount = peak.minus(value); }
    }
    // Scan every snapshot for extrema; a chart's display limit must not cap metrics.
    for (;;) {
      const rows = await tx.portfolioSnapshot.findMany({ where: { accountId: account.id, snapshotTimestamp: { gte: start, lte: end } }, select: { id: true, equity: true }, orderBy: [{ snapshotTimestamp: "asc" }, { id: "asc" }], take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      for (const row of rows) observe(D(row.equity));
      snapshotCount += rows.length;
      if (rows.length < 1000) break;
      cursor = rows.at(-1)!.id;
    }
    if (ending) observe(ending);
    const executionWhere = { order: { accountId: account.id }, executionTimestamp: { gte: start, lte: end } };
    const closedWhere = { ...executionWhere, order: { accountId: account.id, reduceOnly: true } };
    const [total, closed, wins, losses, funding, latestExposure] = await Promise.all([
      tx.execution.aggregate({ where: executionWhere, _sum: { fee: true, realizedPnl: true }, _count: true }),
      tx.execution.count({ where: closedWhere }),
      tx.execution.aggregate({ where: { ...closedWhere, realizedPnl: { gt: 0 } }, _sum: { realizedPnl: true }, _avg: { realizedPnl: true }, _count: true }),
      tx.execution.aggregate({ where: { ...closedWhere, realizedPnl: { lt: 0 } }, _sum: { realizedPnl: true }, _avg: { realizedPnl: true }, _count: true }),
      tx.fundingEvent.aggregate({ where: { accountId: account.id, createdAt: { gte: start, lte: end } }, _sum: { amount: true } }),
      tx.portfolioSnapshot.findMany({ where: { accountId: account.id, snapshotTimestamp: { gte: start, lte: end } }, orderBy: [{ snapshotTimestamp: "desc" }, { id: "desc" }], take: 120 }),
    ]);
    const profit = D(wins._sum.realizedPnl ?? 0), loss = D(losses._sum.realizedPnl ?? 0).abs();
    let previousReturnPct: string | null = null;
    if (duration !== null && start.getTime() > account.createdAt.getTime()) {
      const previousStart = new Date(Math.max(account.createdAt.getTime(), start.getTime() - duration));
      const previous = await tx.portfolioSnapshot.findFirst({ where: { accountId: account.id, snapshotTimestamp: { lte: previousStart } }, orderBy: [{ snapshotTimestamp: "desc" }, { id: "desc" }] });
      const baseline = previous ? D(previous.equity) : previousStart.getTime() === account.createdAt.getTime() ? D(account.initialCapital) : null;
      if (baseline?.gt(0) && initial) previousReturnPct = fixed(normalizedReturn(initial, baseline));
    }
    return {
      period, scope, start: start.toISOString(), end: end.toISOString(), baselineAt: anchor?.snapshotTimestamp.toISOString() ?? (initial ? account.createdAt.toISOString() : null),
      complete: initial !== null && ending !== null && (current?.complete ?? Boolean(lastSnapshot)), snapshotCount,
      returnPct: initial?.gt(0) && ending ? fixed(normalizedReturn(ending, initial)) : null,
      previousReturnPct, maxDrawdownPct: fixed(maxDrawdown), maxDrawdownAmount: fixed(maxDrawdownAmount),
      startingEquity: initial ? fixed(initial) : null, endingEquity: ending ? fixed(ending) : null,
      realizedPnl: D(total._sum.realizedPnl ?? 0).toString(), fees: D(total._sum.fee ?? 0).toString(), funding: D(funding._sum.amount ?? 0).toString(),
      grossProfit: fixed(profit), grossLoss: fixed(loss), averageWin: D(wins._avg.realizedPnl ?? 0).toString(), averageLoss: D(losses._avg.realizedPnl ?? 0).toString(),
      profitFactor: loss.gt(0) ? fixed(profit.div(loss)) : profit.gt(0) ? "Infinity" : "0",
      tradeCount: total._count, closedTradeCount: closed, winCount: wins._count, lossCount: losses._count,
      breakevenCount: closed - wins._count - losses._count, winRate: closed ? fixed(D(wins._count).div(closed).mul(100)) : "0",
      exposure: latestExposure.reverse().map(snapshot => ({ timestamp: snapshot.snapshotTimestamp.toISOString(), equity: snapshot.equity.toString(), spotValue: snapshot.spotValue.toString(), unrealizedPnl: snapshot.unrealizedPnl.toString() })),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
