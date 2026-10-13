"use client";

import { useEffect, useState } from "react";
import { BellRing, Save } from "lucide-react";
import { Button, Card, Skeleton } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

const fields = [
  ["orderFilled", "Order fills", "A simulated order completed."],
  ["orderTriggered", "Conditional triggers", "A stop or take-profit trigger was reached."],
  ["orderRejected", "Order rejections", "A simulated order was rejected."],
  ["orderCancelled", "Order cancellations", "An order was cancelled or expired."],
  ["liquidation", "Liquidation alerts", "A futures position reached liquidation."],
  ["achievement", "Achievements", "A new achievement was unlocked."],
  ["priceAlert", "Price alert notifications", "A saved price target was reached."],
] as const;
type Preferences = Partial<Record<(typeof fields)[number][0], boolean>>;

export function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [changed, setChanged] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void apiRequest<{ preferences: { notificationPreferences?: Preferences | null } }>("/api/user/preferences", { signal: controller.signal }).then(body => { setPreferences(body.preferences.notificationPreferences ?? {}); setChanged({}); }).catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load preferences."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  async function save() {
    if (busy || !preferences) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiRequest("/api/user/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationPreferences: changed }) }); setChanged({}); setMessage("Notification preferences saved."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save preferences."); }
    finally { setBusy(false); }
  }
  return <Card className="mt-5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><BellRing size={17} />Notification preferences</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Choose which future account events appear in your notification center.</p></div><Button size="sm" variant="secondary" onClick={() => void save()} disabled={busy || loading || !preferences}><Save size={14} />{busy ? "Saving…" : "Save preferences"}</Button></div>
    {message && <p role="status" className="mt-4 text-xs text-[var(--positive)]">{message}</p>}
    {error && <p role="alert" className="mt-4 text-xs text-[var(--negative)]">{error}{!preferences && <Button size="sm" variant="ghost" onClick={() => setRefresh(value => value + 1)}>Retry preferences</Button>}</p>}
    {loading ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : preferences && <fieldset disabled={busy} className="mt-5 grid gap-3 sm:grid-cols-2"><legend className="sr-only">Notification categories</legend>{fields.map(([key, label, description]) => <label key={key} className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-white/[.08] p-4 hover:bg-white/[.04]"><input type="checkbox" checked={preferences[key] ?? true} onChange={event => { const value = event.target.checked; setPreferences(current => ({ ...current, [key]: value })); setChanged(current => ({ ...current, [key]: value })); setMessage(""); }} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" /><span><span className="block text-xs font-semibold">{label}</span><span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{description}</span></span></label>)}</fieldset>}
  </Card>;
}
