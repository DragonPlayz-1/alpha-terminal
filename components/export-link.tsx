"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

export function ExportLink({ dataset, children }: { dataset: "executions" | "snapshots" | "journal"; children: React.ReactNode }) {
  const scope = useSearchParams().get("scope") ?? "main";
  return <a href={`/api/exports?scope=${encodeURIComponent(scope)}&dataset=${dataset}`} download className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-[var(--muted-strong)] hover:bg-white/10"><Download size={14} />{children}</a>;
}
