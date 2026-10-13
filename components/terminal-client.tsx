"use client";

import { ScopedLink as Link } from "@/components/scoped-link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Layers3, Plus, RefreshCcw, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, IconButton, SectionHeading, Skeleton } from "@/components/ui";
import { TerminalChart } from "@/components/terminal-chart";
import { OrderPreview } from "@/components/order-preview";
import { useWatchlists } from "@/components/use-watchlists";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { apiRequest } from "@/lib/api-client";
import { submitPaperOrder } from "@/lib/order-client";

type Quote = { bid: string | null; ask: string | null; lastPrice: string | null; priceChangePct: string | null; volume: string | null; freshness: string; receivedAt: string; sourceTimestamp: string | null };
type Market = { symbol: string; name: string; baseAsset: string; instrumentType: string; minimumQuantity: string; quote?: Quote | null };
type Position = { symbol: string; instrumentType: string; quantity: string; marketValue: string; unrealizedPnl: string };

export function TerminalClient({ initialSymbol = "BTC-USD", initialScope = "main" }: { initialSymbol?: string; initialScope?: string }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState(initialSymbol);
  const [query, setQuery] = useState("");
  const [listId, setListId] = useState("default");
  const { watchlists, error: listError } = useWatchlists();
  const [positions, setPositions] = useState<Position[]>([]);
  const [cash, setCash] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [streamState, setStreamState] = useState("Connecting");
  const [loaded, setLoaded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(0);
  const [maxAge, setMaxAge] = useState(15000);
  useEffect(() => { setSelected(initialSymbol); }, [initialSymbol]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const [marketBody, portfolio] = await Promise.all([
          apiRequest<{ instruments: Market[]; quoteMaxAgeMs: number }>("/api/markets?refresh=0", { signal: controller.signal }),
          apiRequest<{ account: { availableCash: string }; positions: Position[] }>(`/api/portfolio?scope=${encodeURIComponent(initialScope)}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setMarkets(marketBody.instruments.filter(market => market.instrumentType === "SPOT")); setMaxAge(marketBody.quoteMaxAgeMs);
        setPositions(portfolio.positions.filter(position => position.instrumentType === "SPOT")); setCash(portfolio.account.availableCash); setError("");
        void apiRequest<{ instruments: Market[] }>("/api/markets?refresh=1", { signal: controller.signal }).then(body => { if (!controller.signal.aborted) setMarkets(body.instruments.filter(market => market.instrumentType === "SPOT")); }).catch(() => { /* Keep the cached view usable; submission requires a fresh quote. */ });
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Workspace unavailable."); }
      finally { pending = false; if (!controller.signal.aborted) setLoaded(true); }
    }
    void load(); const timer = setInterval(() => void load(), 12000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [initialScope, refresh]);
  const symbols = markets.map(market => market.symbol).join(",");
  useEffect(() => {
    if (!symbols) return;
    const source = new EventSource(`/api/stream/quotes?symbols=${encodeURIComponent(symbols)}`);
    source.onerror = () => setStreamState("Reconnecting");
    source.addEventListener("quotes", event => {
      try {
        const updates: unknown = JSON.parse((event as MessageEvent).data);
        if (!Array.isArray(updates)) throw new Error("Invalid stream payload");
        const valid = updates.filter((item): item is Quote & { symbol: string } => item && typeof item.symbol === "string" && typeof item.freshness === "string" && typeof item.receivedAt === "string" && [item.bid, item.ask, item.lastPrice, item.priceChangePct, item.volume].every(value => value === null || typeof value === "string" && Number.isFinite(Number(value))));
        setMarkets(current => current.map(market => { const update = valid.find(item => item.symbol === market.symbol); return update ? { ...market, quote: update } : market; }));
        setStreamState("Connected");
      } catch { setStreamState("Reconnecting"); }
    });
    return () => source.close();
  }, [symbols]);
  const current = markets.find(market => market.symbol === selected);
  const list = listId === "all" ? undefined : watchlists.find(list => list.id === listId) ?? watchlists.find(list => list.isDefault) ?? watchlists[0];
  const visible = (list ? list.items.map(item => markets.find(market => market.symbol === item.instrument.symbol)).filter((market): market is Market => Boolean(market)) : markets).filter(market => `${market.symbol} ${market.name}`.toLowerCase().includes(query.toLowerCase()));
  const fresh = current?.quote?.freshness === "LIVE" && Boolean(current.quote.sourceTimestamp) && now - Date.parse(current.quote.sourceTimestamp!) <= maxAge;

  return <div className="page-enter">
    <SectionHeading eyebrow="Execution workspace" title="Trading terminal" description="Market context, deliberate decisions, and virtual execution." action={<div className="flex flex-wrap items-center gap-3"><Badge tone={streamState === "Connected" ? "positive" : "warning"}>{streamState}</Badge><span className="text-xs text-[var(--muted)]">Cash <strong className="tabular text-white">{cash === null ? "—" : formatCurrency(cash)}</strong></span><Link href="/orders" className="text-xs text-[var(--accent-bright)]">Orders</Link></div>} />
    {error && <p role="alert" className="mb-4 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 p-4 text-xs text-[var(--negative)]">{error}<Button size="sm" variant="ghost" onClick={() => setRefresh(value => value + 1)}>Retry</Button></p>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[200px_minmax(0,1fr)_320px]">
      <Card className="max-h-[360px] overflow-y-auto xl:col-span-2 2xl:col-span-1 2xl:max-h-[760px]">
        <div className="sticky top-0 z-10 space-y-3 border-b border-white/[.06] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between"><h2 className="text-xs font-semibold">Watchlist</h2><Link href="/markets" aria-label="Manage watchlists" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/5"><Plus size={16} /></Link></div>
          <select aria-label="Terminal watchlist" value={listId === "all" ? "all" : list?.id ?? "all"} onChange={event => setListId(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[var(--bg-soft)] px-2 text-xs"><option value="all">All spot markets</option>{watchlists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select>
          <label className="relative block"><span className="sr-only">Search terminal markets</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input aria-label="Search terminal markets" value={query} onChange={event => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-2 text-xs" placeholder="Search" /></label>
        </div>
        {listError && <p role="alert" className="p-3 text-xs text-amber-300">{listError}</p>}
        {!loaded ? <div className="p-4"><Skeleton className="h-36" /></div> : visible.length ? <div className="grid divide-y divide-white/[.045] sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-1">{visible.map(market => <button type="button" key={market.symbol} onClick={() => setSelected(market.symbol)} aria-pressed={selected === market.symbol} className={`min-w-0 px-4 py-3 text-left ${selected === market.symbol ? "bg-[var(--accent)]/12" : "hover:bg-white/[.035]"}`}><span className="flex justify-between gap-2 text-xs"><strong>{market.baseAsset}</strong><span className={Number(market.quote?.priceChangePct) < 0 ? "text-[var(--negative)]" : "text-[var(--positive)]"}>{market.quote?.priceChangePct == null ? "—" : formatPercent(market.quote.priceChangePct)}</span></span><span className="mt-2 block tabular text-xs text-[var(--muted)]">{market.quote?.lastPrice ? formatCurrency(market.quote.lastPrice) : "Awaiting quote"}</span></button>)}</div> : <EmptyState title="No matching spot markets" description="Choose another list or add spot symbols in Markets." />}
      </Card>
      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.06] p-4"><div><h2 className="text-base font-semibold">{current?.symbol ?? selected}</h2><p className="mt-1 text-xs text-[var(--muted)]">{current?.name ?? "Select an available spot market"}</p></div><div className="flex items-center gap-3"><div className="tabular text-lg font-semibold">{current?.quote?.lastPrice ? formatCurrency(current.quote.lastPrice, Number(current.quote.lastPrice) < 1 ? 5 : 2) : "—"}</div><Badge tone={fresh ? "positive" : "warning"}>{fresh ? "Live" : "Cached"}</Badge><IconButton label="Refresh market data" onClick={() => setRefresh(value => value + 1)}><RefreshCcw size={16} /></IconButton></div></div>
        <TerminalChart key={`${selected}:${refresh}`} symbol={selected} />
        <div className="grid grid-cols-3 gap-3 border-t border-white/[.06] p-4"><QuoteStat label="Bid" value={current?.quote?.bid ? formatCurrency(current.quote.bid) : "—"} /><QuoteStat label="Ask" value={current?.quote?.ask ? formatCurrency(current.quote.ask) : "—"} /><QuoteStat label="24h volume" value={current?.quote?.volume ? formatNumber(current.quote.volume, 0) : "—"} /></div>
      </Card>
      <Card className="overflow-hidden">{current ? <OrderTicket key={`${current.symbol}:${initialScope}`} market={current} scope={initialScope} fresh={fresh} onFilled={() => setRefresh(value => value + 1)} /> : <EmptyState title="Choose a market" description="Select an available spot symbol to prepare an order." />}</Card>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Card><div className="flex items-center justify-between border-b border-white/[.06] p-5"><h2 className="text-sm font-semibold">Open positions</h2><Link href="/portfolio" className="text-xs text-[var(--accent-bright)]">View portfolio</Link></div>{positions.length ? positions.map(position => <div key={position.symbol} className="flex items-center justify-between gap-3 border-b border-white/[.04] p-4"><div><strong className="text-xs">{position.symbol}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{formatNumber(position.quantity, 8)} units · {formatCurrency(position.marketValue)}</p></div><span className={`tabular text-xs ${Number(position.unrealizedPnl) >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>{formatCurrency(position.unrealizedPnl)}</span></div>) : <EmptyState title="No open spot positions" description="Your positions update after a simulated fill." />}</Card>
      <Card className="p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={17} />Execution notes</h2><div className="mt-4 space-y-3 text-xs leading-6 text-[var(--muted)]"><p>Market buys use the current ask; sells use the bid. The simulator uses full top-of-book fills without market-depth modelling.</p><p>Limit and conditional orders reserve cash or inventory. Triggered orders can fill at a different price from their trigger.</p><p>Stale quotes pause execution. Every submission revalidates balances, reservations, and challenge rules on the server.</p></div></Card>
    </div>
  </div>;
}

function OrderTicket({ market, scope, fresh, onFilled }: { market: Market; scope: string; fresh: boolean; onFilled: () => void }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState("MARKET");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState(market.quote?.lastPrice ?? "");
  const [stopPrice, setStopPrice] = useState("");
  const [bracketStop, setBracketStop] = useState("");
  const [bracketTarget, setBracketTarget] = useState("");
  const [timeInForce, setTimeInForce] = useState("GTC");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string; id?: string } | null>(null);
  const conditional = !["MARKET", "LIMIT"].includes(orderType);
  const payload = { symbol: market.symbol, side, orderType, quantity, limitPrice: orderType.includes("LIMIT") ? limitPrice : undefined, stopPrice: conditional ? stopPrice : undefined, bracketStop: side === "BUY" ? bracketStop || undefined : undefined, bracketTarget: side === "BUY" ? bracketTarget || undefined : undefined, timeInForce: conditional && ["IOC", "FOK"].includes(timeInForce) ? "GTC" : timeInForce, scope };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(null);
    try { const body = await submitPaperOrder(payload); setMessage({ text: `Order ${body.order.status.toLowerCase().replaceAll("_", " ")}.`, id: body.order.id }); setQuantity(""); onFilled(); }
    catch (caught) { setMessage({ error: true, text: caught instanceof Error ? caught.message : "Unable to submit order." }); }
    finally { locked.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="p-4">
    <h2 className="text-sm font-semibold">Place order</h2><fieldset disabled={busy} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">{(["BUY", "SELL"] as const).map(value => <button key={value} type="button" aria-pressed={side === value} onClick={() => setSide(value)} className={`min-h-11 rounded-xl text-xs font-bold ${side === value ? value === "BUY" ? "bg-[var(--positive)]/15 text-[var(--positive)]" : "bg-[var(--negative)]/15 text-[var(--negative)]" : "bg-white/5 text-[var(--muted)]"}`}>{value === "BUY" ? "Buy" : "Sell"}</button>)}</div>
      <label className="block text-xs text-[var(--muted-strong)]">Order type<select value={orderType} onChange={event => setOrderType(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-soft)] px-3 text-sm">{["MARKET", "LIMIT", "STOP_MARKET", "STOP_LIMIT", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"].map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      <Field label="Quantity" value={quantity} onChange={setQuantity} placeholder={market.minimumQuantity} required />
      {conditional && <Field label="Trigger price" value={stopPrice} onChange={setStopPrice} required />}
      {orderType.includes("LIMIT") && <Field label="Limit price" value={limitPrice} onChange={setLimitPrice} required />}
      <label className="block text-xs text-[var(--muted-strong)]">Time in force<select value={payload.timeInForce} onChange={event => setTimeInForce(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-soft)] px-3 text-sm">{(conditional ? ["GTC", "DAY"] : ["GTC", "DAY", "IOC", "FOK"]).map(value => <option key={value}>{value}</option>)}</select></label>
      {side === "BUY" && <details className="rounded-xl border border-white/[.08] p-3"><summary className="cursor-pointer text-xs font-semibold">Optional bracket exits</summary><p className="my-3 text-[10px] leading-5 text-[var(--muted)]">The stop and target share inventory. Filling one cancels the other.</p><div className="space-y-3"><Field label="Bracket stop" value={bracketStop} onChange={setBracketStop} /><Field label="Bracket target" value={bracketTarget} onChange={setBracketTarget} /></div></details>}
      <OrderPreview payload={payload} />
      {!fresh && <p className="flex gap-2 text-xs text-amber-200"><AlertTriangle size={14} className="shrink-0" />Quote is cached. The server requires a fresh quote at submission.</p>}
      {message && <div role={message.error ? "alert" : "status"} className={`rounded-xl p-3 text-xs leading-5 ${message.error ? "bg-[var(--negative)]/10 text-[var(--negative)]" : "bg-[var(--positive)]/10 text-[var(--positive)]"}`}>{message.text}{message.id && <Link href={`/orders/${message.id}`} className="ml-2 underline">View order</Link>}</div>}
      <Button type="submit" variant={side === "BUY" ? "primary" : "danger"} disabled={busy} className="min-h-12 w-full">{busy ? "Submitting…" : `${side === "BUY" ? "Buy" : "Sell"} ${market.baseAsset}`}</Button>
    </fieldset>
  </form>;
}
function Field({ label, value, onChange, placeholder = "Optional", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return <label className="block text-xs text-[var(--muted-strong)]">{label}<input aria-label={label} required={required} value={value} onChange={event => onChange(event.target.value)} inputMode="decimal" placeholder={placeholder} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-right text-sm" /></label>;
}
function QuoteStat({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><div className="text-[10px] text-[var(--muted)]">{label}</div><div className="mt-1 break-words tabular text-xs text-[var(--muted-strong)]">{value}</div></div>; }
