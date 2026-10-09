"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Gauge, Layers3, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, Card, SectionHeading } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import { apiRequest } from "@/lib/api-client";
import { submitPaperOrder } from "@/lib/order-client";

type Future = { symbol: string; name: string; underlying: string; maximumLeverage: string; specifications: { maintenanceRate?: string; fundingRate?: string; fundingIntervalHours?: number; marginMode?: string } | null; quote: { markPrice: string | null; bid: string | null; ask: string | null; freshness: string } | null };
type Position = { id: string; symbol: string; positionSide: string; quantity: string; averageEntryPrice: string; currentPrice: string | null; unrealizedPnl: string; initialMargin: string; leverage: string; liquidationPrice: string | null; fundingTotal: string };

export function FuturesClient({ scope = "main" }: { scope?: string }) {
  const [futures, setFutures] = useState<Future[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selected, setSelected] = useState("");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  async function load() {
    try {
      const body = await apiRequest<{ instruments: Future[]; positions: Position[] }>(`/api/futures?scope=${encodeURIComponent(scope)}`);
      setFutures(body.instruments); setPositions(body.positions);
      setSelected(previous => body.instruments.some(i => i.symbol === previous) ? previous : body.instruments[0]?.symbol ?? "");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to load futures."); }
  }
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 12000); return () => clearInterval(timer); }, [scope]);

  const current = futures.find(f => f.symbol === selected);
  useEffect(() => { if (current && Number(leverage) > Number(current.maximumLeverage)) setLeverage("1"); }, [current, leverage]);
  async function submit() {
    if (busy.current) return;
    setStatus(""); busy.current = true; setSubmitting(true);
    try {
      const body = await submitPaperOrder({ symbol: selected, side: side === "LONG" ? "BUY" : "SELL", positionSide: side, leverage: Number(leverage), reduceOnly: false, orderType: "MARKET", quantity, scope, timeInForce: "IOC" });
      setStatus(body.order.status === "FILLED" ? "Position opened and margin updated." : `Order ${body.order.status.toLowerCase()}.`);
      setQuantity(""); await load();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Order rejected."); }
    finally { busy.current = false; setSubmitting(false); }
  }
  async function closePosition(position: Position) {
    if (busy.current) return;
    setStatus(""); busy.current = true; setSubmitting(true);
    try {
      const body = await submitPaperOrder({ symbol: position.symbol, side: position.positionSide === "LONG" ? "SELL" : "BUY", positionSide: position.positionSide, leverage: Number(position.leverage), reduceOnly: true, orderType: "MARKET", quantity: position.quantity, scope, timeInForce: "IOC" });
      setStatus(body.order.status === "FILLED" ? `${position.symbol} position closed and P&L realized.` : `Order ${body.order.status.toLowerCase()}.`);
      await load();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Close order rejected."); }
    finally { busy.current = false; setSubmitting(false); }
  }

  return <fieldset disabled={submitting} className="min-w-0 animate-slide-up">
    {scope !== "main" && <div className="mb-3"><Badge tone="accent">Challenge account</Badge></div>}
    <SectionHeading eyebrow="Derivatives lab" title="Futures" description="Linear isolated-margin contracts with explicit mark price, funding, and liquidation rules." action={<Badge tone="warning"><AlertTriangle size={12} className="mr-1" />High risk simulation</Badge>} />
    <div className="mb-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100"><div className="flex items-center gap-2 font-semibold"><ShieldAlert size={15} />Before you use leverage</div><p className="mt-2 text-amber-100/70">These contracts are synthetic linear USD simulations. The mark is the midpoint of public Coinbase bid/ask, funding is a documented 0.01% synthetic rate every 8 hours, and isolated gap protection is explicitly recorded. Leverage increases losses.</p></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_.75fr]">
      <Card className="overflow-hidden"><div className="border-b border-white/[.06] px-5 py-4"><div className="text-sm font-semibold text-white">Supported contracts</div><div className="mt-1 text-xs text-[var(--muted)]">Select a contract to open an isolated position</div></div><div className="divide-y divide-white/[.05]">{futures.map(f => <button key={f.symbol} onClick={() => setSelected(f.symbol)} className={`flex w-full items-center justify-between px-5 py-4 text-left ${selected === f.symbol ? "bg-[var(--accent)]/[.1]" : "hover:bg-white/[.03]"}`}><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-xs font-bold text-[var(--accent-bright)]">{f.underlying[0]}</div><div><div className="text-sm font-semibold text-white">{f.symbol}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{f.name} · {f.specifications?.marginMode ?? "isolated"}</div></div></div><div className="text-right"><div className="tabular text-sm font-semibold text-white">{f.quote?.markPrice ? formatCurrency(f.quote.markPrice) : "—"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">up to {f.maximumLeverage}x</div></div></button>)}</div></Card>
      <Card className="p-5"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-white">Open isolated position</div><div className="mt-1 text-xs text-[var(--muted)]">{current?.symbol ?? "Choose a contract"}</div></div><Gauge className="text-[var(--accent-bright)]" size={19} /></div><div className="mt-6 grid grid-cols-2 gap-2"><button onClick={() => setSide("LONG")} className={`rounded-xl border py-3 text-xs font-bold ${side === "LONG" ? "border-[var(--positive)]/25 bg-[var(--positive)]/10 text-[var(--positive)]" : "border-white/[.08] text-[var(--muted)]"}`}><TrendingUp size={14} className="mr-1 inline" />Long</button><button onClick={() => setSide("SHORT")} className={`rounded-xl border py-3 text-xs font-bold ${side === "SHORT" ? "border-[var(--negative)]/25 bg-[var(--negative)]/10 text-[var(--negative)]" : "border-white/[.08] text-[var(--muted)]"}`}><TrendingDown size={14} className="mr-1 inline" />Short</button></div><label className="mt-5 block"><span className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">Contract quantity</span><input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.01" inputMode="decimal" className="h-11 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-sm text-white outline-none focus:border-[var(--accent)]" /></label><label className="mt-4 block"><span className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">Leverage</span><select value={leverage} onChange={e => setLeverage(e.target.value)} className="h-11 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-sm text-white outline-none focus:border-[var(--accent)]">{[1, 2, 3, 5, 10, 20].filter(x => Number(x) <= Number(current?.maximumLeverage ?? 1)).map(x => <option key={x}>{x}</option>)}</select></label><div className="mt-5 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-xs"><div className="flex justify-between"><span className="text-[var(--muted)]">Mark price</span><span className="tabular text-white">{formatCurrency(current?.quote?.markPrice ?? 0)}</span></div><div className="mt-3 flex justify-between"><span className="text-[var(--muted)]">Est. initial margin</span><span className="tabular text-white">{formatCurrency(Number(current?.quote?.markPrice ?? 0) * Number(quantity || 0) / Number(leverage))}</span></div><div className="mt-3 flex justify-between"><span className="text-[var(--muted)]">Maintenance rate</span><span className="text-white">2.50%</span></div></div>{status && <div className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3 py-3 text-xs text-[var(--accent-bright)]">{status}</div>}<Button onClick={submit} disabled={!selected || !quantity} className="mt-5 h-12 w-full">Open {side.toLowerCase()} <ArrowRight size={15} /></Button><div className="mt-4 flex gap-2 text-[10px] leading-4 text-[#657187]"><Layers3 size={13} className="shrink-0" />Closing a derivative is reduce-only and releases its isolated margin.</div></Card>
    </div>
    <Card className="mt-5 overflow-hidden"><div className="border-b border-white/[.06] px-5 py-4"><div className="text-sm font-semibold text-white">Open positions</div><div className="mt-1 text-xs text-[var(--muted)]">Mark price, funding, and liquidation thresholds</div></div>{positions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead className="text-[10px] uppercase tracking-[.15em] text-[#657187]"><tr><th className="px-5 py-4">Contract</th><th className="px-3 py-4">Side</th><th className="px-3 py-4">Size / leverage</th><th className="px-3 py-4">Mark</th><th className="px-3 py-4">Liquidation</th><th className="px-3 py-4 text-right">Unrealized P&L</th><th className="px-5 py-4"></th></tr></thead><tbody className="divide-y divide-white/[.05]">{positions.map(p => <tr key={p.id}><td className="px-5 py-4 text-sm font-semibold text-white">{p.symbol}</td><td className={`px-3 py-4 text-xs font-semibold ${p.positionSide === "LONG" ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>{p.positionSide}</td><td className="px-3 py-4 text-xs text-[var(--muted-strong)]">{formatNumber(p.quantity, 6)} · {p.leverage}x</td><td className="tabular px-3 py-4 text-xs text-[var(--muted-strong)]">{formatCurrency(p.currentPrice ?? 0)}</td><td className="tabular px-3 py-4 text-xs text-amber-300">{formatCurrency(p.liquidationPrice ?? 0)}</td><td className={`tabular px-3 py-4 text-right text-sm font-semibold ${Number(p.unrealizedPnl) >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>{formatCurrency(p.unrealizedPnl)}<div className="mt-1 text-[10px] font-normal">Funding {formatCurrency(p.fundingTotal)}</div></td><td className="px-5 py-4 text-right"><Button variant="danger" className="px-3 py-2 text-[11px]" onClick={() => closePosition(p)}>Close</Button></td></tr>)}</tbody></table></div> : <div className="p-12 text-center text-sm text-[var(--muted)]">No open derivatives positions.</div>}</Card>
  </fieldset>;
}
