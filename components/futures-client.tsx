"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, RefreshCcw } from "lucide-react";
import { Badge, Button, Card, EmptyState, SectionHeading, Skeleton } from "@/components/ui";
import { OrderPreview } from "@/components/order-preview";
import { formatCurrency, formatNumber } from "@/lib/format";
import { apiRequest } from "@/lib/api-client";
import { submitPaperOrder } from "@/lib/order-client";

type Future = { symbol: string; name: string; underlying: string; maximumLeverage: string; quote: { markPrice: string | null; freshness: string } | null };
type Position = { id: string; symbol: string; positionSide: string; quantity: string; currentPrice: string | null; unrealizedPnl: string; initialMargin: string; leverage: string; liquidationPrice: string | null; fundingTotal: string };

export function FuturesClient({ scope = "main", initialSymbol = "" }: { scope?: string; initialSymbol?: string }) {
  const [futures, setFutures] = useState<Future[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selected, setSelected] = useState(initialSymbol);
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const body = await apiRequest<{ instruments: Future[]; positions: Position[] }>(`/api/futures?scope=${encodeURIComponent(scope)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setFutures(body.instruments); setPositions(body.positions); setError("");
        setSelected(previous => previous || body.instruments[0]?.symbol || "");
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load futures."); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer = setInterval(() => void load(), 12000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [scope, refresh]);
  const current = futures.find(future => future.symbol === selected);
  const opening = { symbol: selected, side: side === "LONG" ? "BUY" : "SELL", positionSide: side, leverage: Number(leverage), reduceOnly: false, orderType: "MARKET", quantity, scope, timeInForce: "IOC" };
  const closePayload = (position: Position) => ({ symbol: position.symbol, side: position.positionSide === "LONG" ? "SELL" : "BUY", positionSide: position.positionSide, leverage: Number(position.leverage), reduceOnly: true, orderType: "MARKET", quantity: position.quantity, scope, timeInForce: "IOC" });
  useEffect(() => { if (current && Number(leverage) > Number(current.maximumLeverage)) setLeverage("1"); }, [current, leverage]);
  async function submit(payload: Record<string, unknown>) {
    if (busy.current) return;
    busy.current = true; setSubmitting(true); setStatus(""); setError("");
    try { const body = await submitPaperOrder(payload); setStatus(`Order ${body.order.status.toLowerCase()}. Account updated.`); setQuantity(""); setRefresh(value => value + 1); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Order rejected."); }
    finally { busy.current = false; setSubmitting(false); }
  }
  return <fieldset disabled={submitting} className="min-w-0 page-enter"><legend className="sr-only">Futures trading workspace</legend>
    <SectionHeading eyebrow="Derivatives lab" title="Futures" description="Linear isolated-margin simulation with public-data marks, synthetic funding, and recorded liquidations." action={<Badge tone="warning">Virtual margin</Badge>} />
    {error && <div role="alert" className="mb-4 rounded-xl bg-[var(--negative)]/10 p-4 text-xs text-[var(--negative)]">{error}<Button size="sm" variant="ghost" onClick={() => setRefresh(value => value + 1)}><RefreshCcw size={14} />Retry</Button></div>}
    {status && <p role="status" className="mb-4 rounded-xl bg-[var(--positive)]/10 p-4 text-xs text-[var(--positive)]">{status}</p>}
    {loading ? <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : <>
      <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
        <Card><div className="border-b border-white/[.06] p-5"><h2 className="text-sm font-semibold">Supported contracts</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Synthetic USD contracts with isolated gap protection. Funding is 0.01% per observed eight-hour boundary: longs pay, shorts receive.</p></div>{futures.map(future => <button key={future.symbol} type="button" aria-pressed={selected === future.symbol} onClick={() => { setSelected(future.symbol); setQuantity(""); }} className={`flex min-h-20 w-full items-center justify-between gap-3 border-b border-white/[.04] px-5 py-4 text-left ${selected === future.symbol ? "bg-[var(--accent)]/10" : "hover:bg-white/[.03]"}`}><span className="min-w-0"><strong className="block truncate text-sm">{future.symbol}</strong><span className="mt-1 block truncate text-xs text-[var(--muted)]">{future.name}</span></span><span className="shrink-0 text-right"><span className="block tabular text-sm">{formatCurrency(future.quote?.markPrice)}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">Up to {future.maximumLeverage}× · {future.quote?.freshness ?? "Unavailable"}</span></span></button>)}{!futures.length && <EmptyState title="No contracts available" />}</Card>
        <Card className="p-5"><h2 className="flex items-center justify-between text-sm font-semibold">Open isolated position<Gauge size={18} /></h2><p className="mt-2 text-xs text-[var(--muted)]">{current?.symbol ?? "Select a supported contract"}</p><form onSubmit={event => { event.preventDefault(); void submit(opening); }} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">{(["LONG", "SHORT"] as const).map(value => <button type="button" key={value} aria-pressed={side === value} onClick={() => setSide(value)} className={`min-h-11 rounded-xl text-xs font-semibold ${side === value ? "bg-[var(--accent)]/15 text-[var(--accent-bright)]" : "bg-white/5 text-[var(--muted)]"}`}>{value === "LONG" ? "Long" : "Short"}</button>)}</div>
          <label className="block text-xs">Contract quantity<input aria-label="Contract quantity" required inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm" placeholder="0.01" /></label>
          <label className="block text-xs">Leverage<select aria-label="Leverage" value={leverage} onChange={event => setLeverage(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-soft)] px-3 text-sm">{[1, 2, 3, 5, 10, 20].filter(value => value <= Number(current?.maximumLeverage ?? 20)).map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
          <OrderPreview payload={opening} />
          <Button type="submit" disabled={!current || submitting} className="w-full">{submitting ? "Submitting…" : `Open ${side.toLowerCase()} position`}</Button>
        </form></Card>
      </div>
      <Card className="mt-5"><div className="border-b border-white/[.06] p-5"><h2 className="text-sm font-semibold">Open positions</h2></div>{positions.length ? <div className="grid gap-4 p-4 lg:grid-cols-2">{positions.map(position => <div key={position.id} className="rounded-xl border border-white/[.08] p-4"><div className="flex items-center justify-between gap-3"><div><strong className="text-sm">{position.symbol}</strong><p className="mt-1 text-xs text-[var(--muted)]">{position.positionSide} · {formatNumber(position.quantity, 8)} · {position.leverage}×</p></div><Button size="sm" variant="danger" onClick={() => void submit(closePayload(position))}>Close</Button></div><div className="mt-4 grid grid-cols-2 gap-3"><Value label="Mark" value={formatCurrency(position.currentPrice)} /><Value label="Liquidation" value={formatCurrency(position.liquidationPrice)} /><Value label="Unrealized P&L" value={formatCurrency(position.unrealizedPnl)} /><Value label="Funding paid" value={formatCurrency(position.fundingTotal, 4)} /></div><details className="mt-4"><summary className="cursor-pointer py-2 text-xs text-[var(--accent-bright)]">Preview close</summary><OrderPreview payload={closePayload(position)} /></details></div>)}</div> : <EmptyState title="No open futures positions" description="Choose a contract to prepare your first simulated position." />}</Card>
    </>}
  </fieldset>;
}
function Value({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] text-[var(--muted)]">{label}</div><div className="mt-1 tabular text-xs font-semibold">{value}</div></div>; }
