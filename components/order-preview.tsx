"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Button, Skeleton } from "@/components/ui";

export type OrderPreviewData = { scope: string; symbol: string; executionPrice: string; notional: string; fee: string; reservedAmount: string; reservedQuantity: string; availableCashAfter: string; maximumQuantity: string; outcome: string; warnings: string[] };
export function OrderPreview({ payload }: { payload: Record<string, unknown> }) {
  const signature = JSON.stringify(payload);
  const [result, setResult] = useState<{ signature: string; data?: OrderPreviewData; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const ready = Number(payload.quantity) > 0;
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void apiRequest<{ preview: OrderPreviewData }>("/api/orders/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: signature, signal: controller.signal }).then(body => setResult({ signature, data: body.preview })).catch(caught => { if (!controller.signal.aborted) setResult({ signature, error: caught instanceof Error ? caught.message : "Unable to preview order." }); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [signature, ready, retry]);
  if (!ready) return <p className="text-xs text-[var(--muted)]">Enter a quantity to check cash, fees, and account rules.</p>;
  if (result?.signature !== signature) return <Skeleton className="h-32" />;
  if (result.error) return <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-200">{result.error}<Button variant="ghost" size="sm" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Refresh preview</Button></div>;
  const data = result.data;
  return data ? <div className="space-y-2 rounded-xl border border-white/[.08] bg-white/[.025] p-3 text-xs">
    <p className="font-semibold text-[var(--accent-bright)]">Server preview · {data.outcome}</p>
    <Row label="Reference price" value={formatCurrency(data.executionPrice, Number(data.executionPrice) < 1 ? 5 : 2)} /><Row label="Notional" value={formatCurrency(data.notional)} /><Row label="Fee" value={formatCurrency(data.fee, 4)} /><Row label="Cash reserved" value={formatCurrency(data.reservedAmount)} /><Row label="Units reserved" value={formatNumber(data.reservedQuantity, 8)} /><Row label="Available cash after" value={formatCurrency(data.availableCashAfter)} /><Row label="Maximum quantity" value={formatNumber(data.maximumQuantity, 8)} />
    <p className="pt-2 text-[10px] leading-4 text-[var(--muted)]">Estimate at the current quote. Submission rechecks every rule.{data.warnings.map(warning => <span key={warning} className="mt-1 block">{warning}</span>)}</p>
  </div> : null;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">{label}</span><span className="tabular text-right text-[var(--muted-strong)]">{value}</span></div>; }
