"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, IconButton, SectionHeading, Skeleton } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import { useSearchParams } from "next/navigation";

type Entry = { id: string; title: string | null; notes: string; tags: unknown; emotionalState: string | null; outcome: string | null; orderId: string | null; symbol: string | null; instrumentName: string | null; order: { id: string; side: string; orderType: string; symbol: string } | null; createdAt: string; updatedAt: string };
type FormState = { title: string; notes: string; tags: string; emotionalState: string; outcome: string; instrumentSymbol: string; orderId: string };

const emptyForm: FormState = { title: "", notes: "", tags: "", emotionalState: "", outcome: "OPEN", instrumentSymbol: "", orderId: "" };

export function JournalClient() {
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") ?? "main";
  const linkedOrderId = searchParams.get("orderId") ?? "";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState<FormState>({ ...emptyForm, orderId: linkedOrderId });
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const saving = useRef(false);

  async function load() {
    const current = ++request.current;
    setLoading(true); setError("");
    try { const body = await apiRequest<{ entries: Entry[] }>(`/api/journal?scope=${encodeURIComponent(scope)}`); if (current === request.current) setEntries(body.entries); }
    catch (caught) { if (current === request.current) setError(caught instanceof Error ? caught.message : "Unable to load the trade journal."); }
    finally { if (current === request.current) setLoading(false); }
  }

  useEffect(() => { void load(); return () => { request.current++; }; }, [scope]);
  useEffect(() => { if (linkedOrderId) setForm(current => ({ ...current, orderId: linkedOrderId })); }, [linkedOrderId]);

  const visible = useMemo(() => entries.filter(entry => `${entry.title ?? ""} ${entry.notes} ${entry.symbol ?? ""} ${Array.isArray(entry.tags) ? entry.tags.join(" ") : ""}`.toLowerCase().includes(query.toLowerCase())), [entries, query]);

  function update(key: keyof FormState, value: string) { setForm(current => ({ ...current, [key]: value })); }
  function edit(entry: Entry) { if (saving.current) return; setEditing(entry.id); setForm({ title: entry.title ?? "", notes: entry.notes, tags: Array.isArray(entry.tags) ? entry.tags.join(", ") : "", emotionalState: entry.emotionalState ?? "", outcome: entry.outcome ?? "OPEN", instrumentSymbol: entry.symbol ?? "", orderId: entry.orderId ?? "" }); document.getElementById("journal-notes")?.focus(); }
  function reset() { setEditing(null); setForm({ ...emptyForm, orderId: linkedOrderId }); }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving.current || !form.notes.trim()) return;
    saving.current = true;
    setBusy("save"); setError(""); setMessage("");
    const body = { scope, title: form.title.trim() || null, notes: form.notes.trim(), tags: form.tags.split(",").map(tag => tag.trim()).filter(Boolean), emotionalState: form.emotionalState || null, outcome: form.outcome || null, instrumentSymbol: form.instrumentSymbol.trim().toUpperCase() || null, orderId: form.orderId.trim() || null };
    try {
      if (editing) await apiRequest(`/api/journal/${editing}?scope=${encodeURIComponent(scope)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: body.title, notes: body.notes, tags: body.tags, emotionalState: body.emotionalState, outcome: body.outcome }) });
      else await apiRequest("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      reset(); setMessage(editing ? "Journal entry updated." : "Journal entry saved."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save the journal entry."); }
    finally { saving.current = false; setBusy(""); }
  }

  async function remove(id: string) {
    if (saving.current) return;
    saving.current = true;
    setBusy(id); setError("");
    try { await apiRequest(`/api/journal/${id}?scope=${encodeURIComponent(scope)}`, { method: "DELETE" }); setEntries(current => current.filter(entry => entry.id !== id)); if (editing === id) reset(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete the journal entry."); }
    finally { saving.current = false; setBusy(""); }
  }

  return <div className="page-enter"><SectionHeading eyebrow="Decision log" title="Trade journal" description="Capture the reasoning, emotions, and outcomes behind every simulated decision." action={<Button size="sm" variant="secondary" onClick={() => { reset(); document.getElementById("journal-notes")?.focus(); }}><Plus size={15} />New entry</Button>} />
    {message && <div role="status" className="mb-4 rounded-xl border border-[var(--positive)]/20 bg-[var(--positive)]/10 px-4 py-3 text-xs text-[var(--positive)]">{message}</div>}
    {error && <div role="alert" className="mb-4 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-4 py-3 text-xs text-[var(--negative)]">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
      <Card className="p-5"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-white"><BookOpen size={17} className="text-[var(--accent-bright)]" />{editing ? "Edit journal entry" : "New journal entry"}</div><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Write down the setup before the lesson gets lost in the chart.</p></div>{editing && <IconButton label="Cancel editing" size="sm" onClick={reset}><X size={15} /></IconButton>}</div><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-xs text-[var(--muted-strong)]">Title<input value={form.title} onChange={event => update("title", event.target.value)} maxLength={80} placeholder="What was the idea?" className="mt-2 h-10 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-sm text-white outline-none focus:border-[var(--accent)]" /></label><label className="block text-xs text-[var(--muted-strong)]">Notes<span className="sr-only">Trade notes</span><textarea id="journal-notes" value={form.notes} onChange={event => update("notes", event.target.value)} required maxLength={5000} rows={7} placeholder="What did you see, expect, and learn?" className="mt-2 w-full resize-y rounded-xl border border-white/[.1] bg-white/[.045] px-3 py-3 text-sm leading-6 text-white outline-none focus:border-[var(--accent)]" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-[var(--muted-strong)]">Emotional state<select value={form.emotionalState} onChange={event => update("emotionalState", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-xs text-white outline-none focus:border-[var(--accent)]"><option value="">Not recorded</option>{["CALM", "FOCUSED", "CONFIDENT", "ANXIOUS", "FOMO", "UNCERTAIN"].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="block text-xs text-[var(--muted-strong)]">Outcome<select value={form.outcome} onChange={event => update("outcome", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-xs text-white outline-none focus:border-[var(--accent)]"><option value="OPEN">In progress</option><option value="WIN">Win</option><option value="LOSS">Loss</option><option value="BREAKEVEN">Breakeven</option></select></label></div><label className="block text-xs text-[var(--muted-strong)]">Tags<span className="mt-1 block text-[10px] font-normal text-[var(--muted)]">Separate tags with commas.</span><input value={form.tags} onChange={event => update("tags", event.target.value)} maxLength={300} placeholder="breakout, patience, risk" className="mt-2 h-10 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-xs text-white outline-none focus:border-[var(--accent)]" /></label>{!editing && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-[var(--muted-strong)]">Instrument<input value={form.instrumentSymbol} onChange={event => update("instrumentSymbol", event.target.value)} placeholder="BTC-USD" className="mt-2 h-10 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-xs uppercase text-white outline-none focus:border-[var(--accent)]" /></label><label className="block text-xs text-[var(--muted-strong)]">Order ID <span className="font-normal text-[var(--muted)]">(optional)</span><input value={form.orderId} onChange={event => update("orderId", event.target.value)} placeholder="Link from order details" className="mt-2 h-10 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-3 text-xs text-white outline-none focus:border-[var(--accent)]" /></label></div>}<Button type="submit" disabled={busy === "save"}>{busy === "save" ? "Saving…" : editing ? <><Check size={15} />Save changes</> : <><BookOpen size={15} />Save journal entry</>}</Button></form></Card>
      <Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold text-white">Your entries</div><div className="mt-1 text-xs text-[var(--muted)]">{entries.length} recorded in this account</div></div><label className="relative block sm:w-56"><span className="sr-only">Search journal</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notes" className="h-9 w-full rounded-lg border border-white/[.08] bg-white/[.035] pl-8 pr-3 text-xs text-white outline-none focus:border-[var(--accent)]" /></label></div>{loading ? <div className="space-y-3 p-5"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : visible.length ? <div className="divide-y divide-white/[.06]">{visible.map(entry => <article key={entry.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-white">{entry.title || entry.symbol || "Untitled trade note"}</h2>{entry.outcome && <Badge tone={entry.outcome === "WIN" ? "positive" : entry.outcome === "LOSS" ? "negative" : "neutral"}>{entry.outcome}</Badge>}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{entry.symbol ?? "General account note"} · {formatRelativeTime(entry.updatedAt)}{entry.emotionalState ? ` · felt ${entry.emotionalState.toLowerCase()}` : ""}</div></div><div className="flex items-center gap-1"><IconButton label="Edit journal entry" size="sm" onClick={() => edit(entry)}><Edit3 size={14} /></IconButton><IconButton label="Delete journal entry" size="sm" className="hover:text-[var(--negative)]" onClick={() => void remove(entry.id)} disabled={busy === entry.id}><Trash2 size={14} /></IconButton></div></div><p className="mt-4 whitespace-pre-wrap text-xs leading-6 text-[var(--muted-strong)]">{entry.notes}</p>{Array.isArray(entry.tags) && entry.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{entry.tags.map(tag => <span key={String(tag)} className="rounded-full bg-white/[.06] px-2 py-1 text-[10px] text-[var(--muted)]">#{String(tag)}</span>)}</div>}{entry.order && <div className="mt-4 rounded-xl border border-white/[.07] bg-white/[.02] px-3 py-2 text-[10px] text-[var(--muted)]">Linked order · {entry.order.symbol} · {entry.order.side} {entry.order.orderType}</div>}</article>)}</div> : <EmptyState icon={BookOpen} title={query ? "No matching entries" : "Your journal is empty"} description={query ? "Try another symbol, tag, or phrase." : "Record the thinking behind a trade to build a repeatable process."} />}</Card>
    </div>
  </div>;
}
