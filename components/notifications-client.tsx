"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, CircleAlert, Info, RefreshCcw, ShieldAlert, Trophy, Zap } from "lucide-react";
import { Badge, Button, Card, SectionHeading, Skeleton } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";

type Notification = { id: string; notificationType: string; title: string; message: string; readAt: string | null; createdAt: string };

export function NotificationsClient() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const sequence = useRef(0);

  async function load() {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const body = await apiRequest<{ notifications: Notification[] }>("/api/notifications");
      if (current === sequence.current) setRows(body.notifications);
    } catch (caught) {
      if (current === sequence.current) setError(caught instanceof Error ? caught.message : "Unable to load notifications.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  useEffect(() => { void load(); return () => { sequence.current++; }; }, []);

  async function markRead(id?: string) {
    const key = id ?? "all";
    setSaving(key);
    setError("");
    try {
      await apiRequest("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : {}) });
      setRows(current => current.map(row => id && row.id !== id ? row : { ...row, readAt: new Date().toISOString() }));
      window.dispatchEvent(new Event("notifications-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update notifications.");
    } finally {
      setSaving("");
    }
  }

  return <div className="mx-auto max-w-4xl animate-slide-up"><SectionHeading eyebrow="Account feed" title="Notifications" description="Order events, risk events, achievements, and challenge updates from your server-side account." action={<Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={15} /> Refresh</Button>} />{error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-4 py-3 text-sm text-[var(--negative)]"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></div>}{rows.some(row => !row.readAt) && <div className="mb-5 flex justify-end"><button disabled={saving === "all"} onClick={() => void markRead()} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--accent-bright)] hover:bg-white/[.05] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-bright)]"><CheckCheck size={14} /> {saving === "all" ? "Saving…" : "Mark all read"}</button></div>}<Card className="overflow-hidden">{loading ? <div className="space-y-3 p-5">{[1, 2, 3].map(item => <Skeleton key={item} className="h-20" />)}</div> : rows.length ? <div className="divide-y divide-white/[.05]">{rows.map(row => <button key={row.id} disabled={saving === row.id} onClick={() => void markRead(row.id)} className={`flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[.035] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-bright)] ${row.readAt ? "opacity-65" : "bg-[var(--accent)]/[.035]"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[.06] text-[var(--accent-bright)]"><NotificationIcon type={row.notificationType} /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-white">{row.title}</span>{!row.readAt && <Badge tone="accent">New</Badge>}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{row.message}</span><span className="mt-2 block text-[10px] text-[#657187]">{formatRelativeTime(row.createdAt)}</span></span></button>)}</div> : <div className="p-16 text-center"><Bell size={25} className="mx-auto mb-4 text-[#657187]" /><div className="text-sm font-semibold text-white">Your notification center is clear</div><p className="mt-2 text-xs text-[var(--muted)]">Order fills and important account events will appear here.</p></div>}</Card></div>;
}

function NotificationIcon({ type }: { type: string }) { if (type === "LIQUIDATION") return <ShieldAlert size={17} />; if (type === "ACHIEVEMENT") return <Trophy size={17} />; if (type === "ORDER_REJECTED") return <CircleAlert size={17} />; if (type === "CHALLENGE") return <Zap size={17} />; return <Info size={17} />; }
