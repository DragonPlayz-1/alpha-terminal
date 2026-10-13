"use client";

import { ScopedLink as Link } from "@/components/scoped-link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Ban, Clock3, Filter, RefreshCcw, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, SectionHeading, Skeleton } from "@/components/ui";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/format";
import { apiRequest } from "@/lib/api-client";

type Order = { id: string; symbol: string; name: string; side: string; orderType: string; quantity: string; filledQuantity: string; limitPrice: string | null; averageFillPrice: string | null; estimatedFee: string | null; status: string; createdAt: string; updatedAt: string; executions: Array<{ quantity: string; executionPrice: string; fee: string; realizedPnl: string; executionTimestamp: string }> };

export function OrdersClient({ history = false }: { history?: boolean }) {
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") ?? "main";
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState(history ? "all" : "OPEN");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState("");
  const sequence = useRef(0);

  async function load() {
    const current = ++sequence.current;
    setLoading(true); setError("");
    try { const body = await apiRequest<{ orders: Order[] }>(`/api/orders?status=${filter}&scope=${encodeURIComponent(scope)}`); if (current === sequence.current) setOrders(body.orders); }
    catch (caught) { if (current === sequence.current) setError(caught instanceof Error ? caught.message : "Unable to load orders."); }
    finally { if (current === sequence.current) setLoading(false); }
  }

  useEffect(() => { void load(); return () => { sequence.current++; }; }, [filter, history, scope]);

  async function cancel(id: string) {
    setCancelling(id); setError("");
    try { await apiRequest(`/api/orders/${id}?scope=${encodeURIComponent(scope)}`, { method: "DELETE" }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to cancel order."); }
    finally { setCancelling(""); }
  }

  function exportCsv() {
    const rows = [["Order ID", "Symbol", "Side", "Type", "Requested quantity", "Filled quantity", "Average price", "Status", "Created", "Fees"], ...orders.map(order => [order.id, order.symbol, order.side, order.orderType, order.quantity, order.filledQuantity, order.averageFillPrice ?? "", order.status, order.createdAt, order.estimatedFee ?? ""])] as string[][];
    const blob = new Blob([rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `alpha-terminal-${history ? "trade-history" : "orders"}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const visible = orders.filter(order => `${order.symbol} ${order.name}`.toLowerCase().includes(query.toLowerCase()));
  const statuses = history ? [["all", "All history"], ["FILLED", "Filled"], ["CANCELLED", "Cancelled"], ["REJECTED", "Rejected"]] : [["OPEN", "Open orders"], ["FILLED", "Filled"], ["all", "All orders"]];

  return <div className="page-enter"><SectionHeading eyebrow={history ? "Audit trail" : "Execution management"} title={history ? "Trade history" : "Open orders"} description={history ? "Immutable simulated executions, fees, and realized outcomes." : "Manage pending orders and monitor their lifecycle."} action={<div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button size="sm" variant="secondary" onClick={exportCsv}><DownloadIcon />Export CSV</Button><Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={15} />Refresh</Button></div>} />
    <Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-white/[.06] p-4 md:flex-row md:items-center md:justify-between"><label className="relative block md:w-72"><span className="sr-only">Search orders</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#68748a]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search orders" className="h-10 w-full rounded-xl border border-white/[.08] bg-white/[.035] pl-9 pr-3 text-xs text-white outline-none focus:border-[var(--accent)]" /></label><div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1"><Filter size={14} className="mr-1 shrink-0 text-[#68748a]" />{statuses.map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-bright)] ${filter === value ? "bg-white/[.1] text-white" : "text-[var(--muted)] hover:bg-white/[.05]"}`}>{label}</button>)}</div></div>{error && <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-4 py-3 text-sm text-[var(--negative)]"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></div>}
      {loading ? <div className="space-y-3 p-5"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : visible.length ? <><div className="divide-y divide-white/[.05] md:hidden">{visible.map(order => <div key={order.id} className="space-y-3 p-5"><div className="flex items-start justify-between gap-3"><Link href={`/orders/${order.id}?scope=${encodeURIComponent(scope)}`} className="min-w-0"><div className="text-sm font-semibold text-white hover:text-[var(--accent-bright)]">{order.symbol}</div><div className="mt-1 text-xs text-[var(--muted)]">{order.side} · {order.orderType} · {formatRelativeTime(order.createdAt)}</div></Link><StatusBadge status={order.status} /></div><div className="grid grid-cols-2 gap-3 text-xs"><Value label="Quantity" value={`${formatNumber(order.filledQuantity, 8)} / ${formatNumber(order.quantity, 8)}`} /><Value label="Average fill" value={order.averageFillPrice ? formatCurrency(order.averageFillPrice) : "—"} /><Value label="Limit price" value={order.limitPrice ? formatCurrency(order.limitPrice) : "Market"} /><Value label="Fees" value={order.estimatedFee ? formatCurrency(order.estimatedFee) : "—"} /></div><div className="flex flex-wrap gap-3"><Link href={`/orders/${order.id}?scope=${encodeURIComponent(scope)}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--accent-bright)] hover:bg-white/[.05]">View details <ArrowUpRight size={13} /></Link>{!history && order.status === "OPEN" && <Button size="sm" variant="danger" onClick={() => void cancel(order.id)} disabled={cancelling === order.id}><Ban size={14} />{cancelling === order.id ? "Cancelling…" : "Cancel order"}</Button>}</div></div>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-left"><thead className="border-b border-white/[.05] text-[10px] uppercase tracking-[.15em] text-[#657187]"><tr><th className="px-5 py-4 font-semibold">Order</th><th className="px-3 py-4 font-semibold">Side / type</th><th className="px-3 py-4 font-semibold">Quantity</th><th className="px-3 py-4 font-semibold">Price</th><th className="px-3 py-4 font-semibold">Status</th><th className="px-3 py-4 font-semibold">Created</th><th className="px-5 py-4 text-right font-semibold">Action</th></tr></thead><tbody className="divide-y divide-white/[.05]">{visible.map(order => <tr key={order.id} className="text-sm"><td className="px-5 py-4"><Link href={`/orders/${order.id}?scope=${encodeURIComponent(scope)}`} className="block hover:text-[var(--accent-bright)]"><div className="font-semibold text-white">{order.symbol}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{order.name}</div></Link></td><td className="px-3 py-4"><div className={order.side === "BUY" ? "text-[var(--positive)]" : "text-[var(--negative)]"}>{order.side}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{order.orderType}</div></td><td className="tabular px-3 py-4 text-[var(--muted-strong)]">{formatNumber(order.filledQuantity, 8)} / {formatNumber(order.quantity, 8)}</td><td className="tabular px-3 py-4 text-[var(--muted-strong)]">{order.averageFillPrice ? formatCurrency(order.averageFillPrice) : order.limitPrice ? formatCurrency(order.limitPrice) : "Market"}</td><td className="px-3 py-4"><StatusBadge status={order.status} /></td><td className="px-3 py-4 text-xs text-[var(--muted)]"><Clock3 size={13} className="mr-1 inline" />{formatRelativeTime(order.createdAt)}</td><td className="px-5 py-4 text-right"><div className="flex items-center justify-end gap-3"><Link href={`/orders/${order.id}?scope=${encodeURIComponent(scope)}`} className="text-xs font-semibold text-[var(--accent-bright)]">Details</Link>{!history && order.status === "OPEN" && <Button size="sm" variant="danger" onClick={() => void cancel(order.id)} disabled={cancelling === order.id}><Ban size={14} />{cancelling === order.id ? "Cancelling…" : "Cancel"}</Button>}</div></td></tr>)}</tbody></table></div></> : <EmptyState icon={Clock3} title={query ? "No matching orders" : history ? "No trade history yet" : "No open orders"} description={query ? "Try another symbol or asset name." : "Orders and executions will appear here as you trade."} action={<Link href={`/terminal?scope=${encodeURIComponent(scope)}`}><Button variant="secondary">Open terminal <ArrowUpRight size={13} /></Button></Link>} />}</Card>
  </div>;
}

function Value({ label, value }: { label: string; value: string }) { return <div><div className="text-[var(--muted)]">{label}</div><div className="mt-1 tabular font-semibold text-white">{value}</div></div>; }
function StatusBadge({ status }: { status: string }) { const tone = status === "FILLED" ? "positive" : ["REJECTED", "EXPIRED"].includes(status) ? "negative" : status === "CANCELLED" ? "neutral" : "warning"; return <Badge tone={tone as "positive" | "negative" | "neutral" | "warning"}>{status}</Badge>; }
function DownloadIcon() { return <span aria-hidden="true" className="text-xs">↓</span>; }
