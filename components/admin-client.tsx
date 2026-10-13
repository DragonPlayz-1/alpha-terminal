"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Activity, Database, Gauge, RefreshCcw, Server, ShieldAlert, Users } from "lucide-react";
import { Badge, Button, Card, SectionHeading, Skeleton } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

type AdminData = Record<string, unknown>;

export function AdminClient() {
  const [health, setHealth] = useState<AdminData | null>(null);
  const [reconciliation, setReconciliation] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);

  async function load() {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const [healthBody, reconcileBody] = await Promise.all([apiRequest<AdminData>("/api/admin/health"), apiRequest<AdminData>("/api/admin/reconcile")]);
      if (current === sequence.current) { setHealth(healthBody); setReconciliation(reconcileBody); }
    } catch (caught) {
      if (current === sequence.current) setError(caught instanceof Error ? caught.message : "Unable to load admin operations.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  useEffect(() => { void load(); return () => { sequence.current++; }; }, []);
  const reconciliationOk = reconciliation?.ok === true;

  return <div className="animate-slide-up"><SectionHeading eyebrow="Restricted operations" title="Admin dashboard" description="Monitor feed health, account reconciliation, and processing activity." action={<Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={15} /> Refresh</Button>} />{error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-4 py-3 text-sm text-[var(--negative)]"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></div>}{loading ? <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-28" />)}</div> : health && reconciliation ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminMetric icon={Users} label="Users" value={String(health.users ?? "—")} /><AdminMetric icon={Database} label="Accounts" value={String(health.accounts ?? "—")} /><AdminMetric icon={Activity} label="Open orders" value={String(health.openOrders ?? "—")} /><AdminMetric icon={Server} label="Live feeds" value={String(health.liveFeeds ?? "—")} /></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><Card className="p-5"><div className="flex items-center gap-3"><Gauge className="text-[var(--accent-bright)]" size={18} /><div className="text-sm font-semibold text-white">Reconciliation</div><Badge tone={reconciliationOk ? "positive" : "negative"} className="ml-auto">{reconciliationOk ? "Healthy" : "Review"}</Badge></div><p className="mt-4 text-xs leading-5 text-[var(--muted)]">Compares ledger cash, margin, and instrument inventory against materialized account state. Mismatches are surfaced for investigation.</p><pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-black/20 p-4 text-[10px] leading-5 text-[var(--muted-strong)]">{JSON.stringify(reconciliation, null, 2)}</pre></Card><Card className="p-5"><div className="flex items-center gap-3"><ShieldAlert className={reconciliationOk ? "text-[var(--positive)]" : "text-[var(--negative)]"} size={18} /><div className="text-sm font-semibold text-white">Operational status</div></div><div className="mt-5 space-y-3 text-xs"><StatusRow label="Database checks" value={reconciliationOk ? "Passing" : "Needs review"} good={reconciliationOk} /><StatusRow label="Last checked" value={String(health.checkedAt ?? "—")} good /><StatusRow label="Live quote feeds" value={String(health.liveFeeds ?? "—")} good={Number(health.liveFeeds ?? 0) > 0} /></div></Card></div></> : <Card className="p-10 text-center"><div className="text-sm font-semibold text-white">Admin data is unavailable.</div><p className="mt-2 text-sm text-[var(--muted)]">Check the database connection and retry.</p><Button size="sm" variant="secondary" className="mt-5" onClick={() => void load()}>Retry</Button></Card>}</div>;
}

function AdminMetric({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; value: string }) { return <Card className="p-5"><Icon size={17} className="text-[var(--accent-bright)]" /><div className="mt-5 text-[10px] text-[var(--muted)]">{label}</div><div className="mt-1 break-words text-2xl font-semibold text-white">{value}</div></Card>; }
function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) { return <div className="flex items-center justify-between gap-4 border-b border-white/[.05] pb-3 last:border-0 last:pb-0"><span className="text-[var(--muted)]">{label}</span><span className={good ? "text-[var(--positive)]" : "text-[var(--negative)]"}>{value}</span></div>; }
