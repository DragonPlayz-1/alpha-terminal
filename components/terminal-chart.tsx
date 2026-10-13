"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Crosshair, Settings2 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { defaultChartPreferences, normalizeChartPreferences, type ChartPreferences } from "@/lib/chart-preferences";
import type { Candle } from "@/lib/chart-data";
import { PriceChart } from "@/components/price-chart";
import { Button, IconButton, Skeleton } from "@/components/ui";
import { Dialog } from "@/components/dialog";

export function TerminalChart({ symbol }: { symbol: string }) {
  const [preferences, setPreferences] = useState(defaultChartPreferences);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ preferences: { chartPreferences?: unknown } }>("/api/user/preferences", { signal: controller.signal }).then(body => { setPreferences(normalizeChartPreferences(body.preferences.chartPreferences)); setLoaded(true); }).catch(() => { if (!controller.signal.aborted) { setLoaded(true); setPreferenceError("Could not load chart defaults. Changes can be saved again."); } });
    return () => controller.abort();
  }, []);
  function change(patch: Partial<ChartPreferences>) {
    setPreferences(current => ({ ...current, ...patch }));
    setSaving(true); setPreferenceError("");
    const current = ++revision.current;
    queue.current = queue.current.catch(() => undefined).then(() => apiRequest("/api/user/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chartPreferences: patch }) })).catch(caught => { if (revision.current === current) setPreferenceError(caught instanceof Error ? caught.message : "Unable to save chart preferences."); }).finally(() => { if (revision.current === current) setSaving(false); });
  }
  useEffect(() => {
    if (!loaded || !symbol) return;
    const controller = new AbortController();
    setLoading(true); setCandles([]); setError("");
    void apiRequest<{ candles: Candle[] }>(`/api/markets/${encodeURIComponent(symbol)}/candles?timeframe=${preferences.timeframe}&limit=160`, { signal: controller.signal }).then(body => setCandles(body.candles)).catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load candles."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [symbol, preferences.timeframe, loaded, refresh]);
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[.06] px-3 py-2">
      <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto">{(["1m", "5m", "15m", "1h", "6h", "1d"] as const).map(timeframe => <button type="button" key={timeframe} disabled={!loaded} aria-pressed={preferences.timeframe === timeframe} onClick={() => change({ timeframe })} className={`min-h-11 rounded-lg px-2.5 text-xs ${preferences.timeframe === timeframe ? "bg-[var(--accent)]/15 text-[var(--accent-bright)]" : "text-[var(--muted)] hover:bg-white/[.05]"}`}>{timeframe}</button>)}</div>
      <div className="flex gap-1"><IconButton label="Indicators" disabled={!loaded} onClick={() => setSettings(true)}><BarChart3 size={16} /></IconButton><IconButton label="Crosshair" disabled={!loaded} aria-pressed={preferences.crosshair} onClick={() => change({ crosshair: !preferences.crosshair })}><Crosshair size={16} /></IconButton><IconButton label="Chart settings" disabled={!loaded} onClick={() => setSettings(true)}><Settings2 size={16} /></IconButton></div>
    </div>
    <div className="px-4 pt-2 text-[10px] text-[var(--muted)]" role="status">{saving ? "Saving chart preferences…" : preferences.indicator !== "none" ? `${preferences.indicator === "sma20" ? "SMA" : "EMA"} ${preferences.period}` : "Price action"}{preferenceError && <span className="ml-2 text-[var(--negative)]">{preferenceError}</span>}</div>
    <div className="p-3">{loading ? <Skeleton className="h-[360px]" /> : error ? <div role="alert" className="flex h-[360px] flex-col items-center justify-center gap-4 p-4 text-center text-xs text-[var(--negative)]">{error}<Button variant="secondary" onClick={() => setRefresh(value => value + 1)}>Retry chart</Button></div> : <PriceChart candles={candles} preferences={preferences} />}</div>
    {settings && <Dialog title="Chart settings" onClose={() => setSettings(false)}><div className="space-y-4 p-5">
      <label className="block text-xs">Chart type<select aria-label="Chart type" value={preferences.type} onChange={event => change({ type: event.target.value as ChartPreferences["type"] })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-soft)] px-3"><option value="candles">Candles</option><option value="line">Line</option><option value="area">Area</option></select></label>
      <label className="block text-xs">Chart indicator<select aria-label="Chart indicator" value={preferences.indicator} onChange={event => change({ indicator: event.target.value as ChartPreferences["indicator"] })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-soft)] px-3"><option value="none">No indicator</option><option value="sma20">Simple moving average</option><option value="ema20">Exponential moving average</option></select></label>
      <label className="block text-xs">Indicator period<select aria-label="Indicator period" value={preferences.period} onChange={event => change({ period: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-soft)] px-3">{[...new Set([10, 20, 50, 100, preferences.period])].sort((a, b) => a - b).map(period => <option key={period}>{period}</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-3 text-xs"><input type="checkbox" checked={preferences.volume} onChange={event => change({ volume: event.target.checked })} />Show volume bars</label>
      <label className="flex min-h-11 items-center gap-3 text-xs"><input type="checkbox" checked={preferences.crosshair} onChange={event => change({ crosshair: event.target.checked })} />Show crosshair</label>
      {preferenceError && <p role="alert" className="text-xs text-[var(--negative)]">{preferenceError}<Button variant="secondary" className="mt-2" onClick={() => change(preferences)}>Retry saving</Button></p>}
    </div></Dialog>}
  </>;
}
