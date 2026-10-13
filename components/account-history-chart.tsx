"use client";

import { useId } from "react";
import { formatCurrency } from "@/lib/format";

export function AccountHistoryChart({ points, label = "Equity history" }: { points: Array<{ timestamp: string; value: string }>; label?: string }) {
  const id = useId().replaceAll(":", "");
  const data = points.filter(point => Number.isFinite(Number(point.value)) && Number.isFinite(Date.parse(point.timestamp))).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (data.length < 2) return <div className="flex h-52 items-center justify-center rounded-xl bg-white/[.025] p-5 text-center text-xs text-[var(--muted)]">At least two snapshots are needed to show {label.toLowerCase()}.</div>;
  const values = data.map(point => Number(point.value));
  const min = Math.min(...values), max = Math.max(...values), range = max - min;
  const first = Date.parse(data[0].timestamp), last = Date.parse(data.at(-1)!.timestamp);
  const pointsString = data.map(point => `${(Date.parse(point.timestamp) - first) / (last - first || 1) * 100},${range ? 90 - (Number(point.value) - min) / range * 80 : 50}`).join(" ");
  return <div>
    <div className="mb-2 flex justify-between text-[10px] text-[var(--muted)]"><span>Low {formatCurrency(min)}</span><span>High {formatCurrency(max)}</span></div>
    <div className="h-52 rounded-xl bg-white/[.025] p-3"><svg role="img" aria-label={`${label}: ${formatCurrency(values[0])} to ${formatCurrency(values.at(-1))}`} viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none"><defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b8cff" stopOpacity=".3" /><stop offset="1" stopColor="#8b8cff" stopOpacity="0" /></linearGradient></defs><polyline points={`0,100 ${pointsString} 100,100`} fill={`url(#${id})`} /><polyline points={pointsString} fill="none" stroke="#a3a4ff" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div>
    <div className="mt-2 flex justify-between gap-3 text-[10px] text-[var(--muted)]"><span>{new Date(first).toLocaleDateString()}</span><span>{new Date(last).toLocaleDateString()}</span></div>
  </div>;
}
