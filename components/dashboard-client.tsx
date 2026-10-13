"use client";

import { ScopedLink as Link } from "@/components/scoped-link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, SectionHeading, Skeleton } from "@/components/ui";
import { AccountHistoryChart } from "@/components/account-history-chart";
import { formatCurrency, formatNumber, formatPercent, formatRelativeTime } from "@/lib/format";
import { apiRequest } from "@/lib/api-client";

type Market = { symbol: string; name: string; baseAsset: string; instrumentType: string; quote?: { lastPrice: string | null; priceChangePct: string | null; freshness: string } | null };
type Portfolio = { equity: string; returnPct: string; unrealizedPnl: string; account: { initialCapital: string; availableCash: string; reservedCash: string; realizedPnl: string; feesPaid: string }; positions: Array<{ id: string; symbol: string; positionSide: string; quantity: string; currentPrice: string | null; unrealizedPnl: string }> };
type Order = { id: string; symbol: string; side: string; orderType: string; status: string; createdAt: string };

export function DashboardClient({ username }: { username: string }) {
  const scope = useSearchParams().get("scope") ?? "main";
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Array<{ timestamp: string; equity: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true; const request = ++sequence.current;
      try {
        const query = `scope=${encodeURIComponent(scope)}`;
        const [marketBody, accountBody, ordersBody, historyBody] = await Promise.all([
          apiRequest<{ instruments: Market[] }>("/api/markets?refresh=0", { signal: controller.signal }),
          apiRequest<Portfolio>(`/api/portfolio?${query}`, { signal: controller.signal }),
          apiRequest<{ orders: Order[] }>(`/api/orders?${query}&status=all`, { signal: controller.signal }),
          apiRequest<{ history: Array<{ timestamp: string; equity: string }> }>(`/api/portfolio/history?${query}`, { signal: controller.signal }),
        ]);
        if (request !== sequence.current) return;
        setPortfolio(accountBody); setMarkets(marketBody.instruments); setOrders(ordersBody.orders.slice(0, 5)); setHistory(historyBody.history); setError("");
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load the command center."); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer = setInterval(() => void load(), 20000);
    return () => { controller.abort(); sequence.current++; clearInterval(timer); };
  }, [scope, refresh]);
  const winners = [...markets].filter(market => market.quote?.priceChangePct != null).sort((a, b) => Number(b.quote?.priceChangePct) - Number(a.quote?.priceChangePct)).slice(0, 4);
  return <div className="page-enter">
    <SectionHeading eyebrow={`Good to see you, ${username}`} title="Your command center" description="A clear view of your simulated capital, market context, and next decision." action={<Link href="/terminal" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[#11131d]">New position</Link>} />
    {error && <p role="alert" className="mb-5 rounded-xl bg-[var(--negative)]/10 p-4 text-xs text-[var(--negative)]">{error}<Button size="sm" variant="ghost" onClick={() => setRefresh(value => value + 1)}>Retry</Button></p>}
    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-32" />)}</div> : portfolio ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total equity" value={formatCurrency(portfolio.equity)} detail={`${formatPercent(portfolio.returnPct)} all time`} /><Metric label="Available cash" value={formatCurrency(portfolio.account.availableCash)} detail={`${formatCurrency(portfolio.account.reservedCash)} reserved`} /><Metric label="Unrealized P&L" value={formatCurrency(portfolio.unrealizedPnl)} detail={`${portfolio.positions.length} open positions`} /><Metric label="Realized P&L" value={formatCurrency(portfolio.account.realizedPnl)} detail={`${formatCurrency(portfolio.account.feesPaid)} fees paid`} /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.06] p-5"><h2 className="text-sm font-semibold">Market pulse</h2><Link href="/markets" className="text-xs text-[var(--accent-bright)]">View all</Link></div><div className="grid sm:grid-cols-2">{winners.map(market => <Link href={`${market.instrumentType === "SPOT" ? "/terminal" : "/futures"}?symbol=${market.symbol}`} key={market.symbol} className="min-w-0 border-b border-white/[.06] p-5 hover:bg-white/[.03]"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{market.symbol}</strong><Badge tone={market.quote?.freshness === "LIVE" ? "positive" : "warning"}>{market.quote?.freshness === "LIVE" ? "Live" : "Cached"}</Badge></div><p className="mt-2 text-xs text-[var(--muted)]">{market.name}</p><div className="mt-5 flex justify-between gap-2"><span className="tabular text-lg font-semibold">{formatCurrency(market.quote?.lastPrice)}</span><span className={`text-xs ${Number(market.quote?.priceChangePct) >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>{formatPercent(market.quote?.priceChangePct)}</span></div></Link>)}</div>{!winners.length && <EmptyState title="Market quotes are warming up" description="Open Markets to request current quotes." />}</Card>
        <Card><div className="flex items-center justify-between border-b border-white/[.06] p-5"><h2 className="text-sm font-semibold">Account activity</h2><Link href="/history" className="text-xs text-[var(--accent-bright)]">History</Link></div>{orders.length ? orders.map(order => <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between gap-3 border-b border-white/[.05] p-4 hover:bg-white/[.03]"><span className="min-w-0"><strong className="block truncate text-xs">{order.side} {order.symbol}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{order.orderType} · {formatRelativeTime(order.createdAt)}</span></span><Badge tone={order.status === "FILLED" ? "positive" : "neutral"}>{order.status}</Badge></Link>) : <EmptyState title="No orders yet" description="Your first decision is yours." />}</Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2"><Card><div className="flex items-center justify-between border-b border-white/[.06] p-5"><h2 className="text-sm font-semibold">Open positions</h2><Link href="/portfolio" className="text-xs text-[var(--accent-bright)]">Portfolio</Link></div>{portfolio.positions.length ? portfolio.positions.map(position => <div key={position.id} className="flex items-center justify-between gap-3 border-b border-white/[.05] p-4"><div className="min-w-0"><strong className="text-xs">{position.symbol} · {position.positionSide}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{formatNumber(position.quantity, 8)} units · mark {formatCurrency(position.currentPrice)}</p></div><span className={`tabular text-xs ${Number(position.unrealizedPnl) >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>{formatCurrency(position.unrealizedPnl)}</span></div>) : <EmptyState title="No positions yet" description="Use the terminal to open a simulated position." />}</Card><Card className="p-5"><h2 className="text-sm font-semibold">Your track record</h2><p className="mb-5 mt-2 text-xs text-[var(--muted)]">Actual account snapshots · {formatPercent(portfolio.returnPct)} since creation</p><AccountHistoryChart points={history.map(point => ({ timestamp: point.timestamp, value: point.equity }))} /><p className="mt-4 text-xs text-[var(--muted)]">Starting capital {formatCurrency(portfolio.account.initialCapital)}</p></Card></div>
    </> : <EmptyState title="Your account data is unavailable" action={<Button onClick={() => setRefresh(value => value + 1)}>Retry</Button>} />}
  </div>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="surface-lift p-5"><div className="text-xs text-[var(--muted)]">{label}</div><div className="mt-5 tabular text-2xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-xs text-[var(--muted)]">{detail}</div></Card>; }
