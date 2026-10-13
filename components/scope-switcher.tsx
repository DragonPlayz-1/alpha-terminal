"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { apiRequest } from "@/lib/api-client";

type Account = { scope: string; name: string; status: string; ended: boolean };

export function ScopeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") ?? "main";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ accounts: Account[] }>("/api/accounts", { signal: controller.signal }).then(body => { setAccounts(body.accounts); setError(""); }).catch(caught => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load accounts.");
    });
    return () => controller.abort();
  }, [pathname, scope]);

  function changeScope(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "main") params.delete("scope"); else params.set("scope", value);
    params.delete("orderId");
    const destination = pathname.startsWith("/orders/") ? "/orders" : pathname;
    router.push(`${destination}${params.size ? `?${params}` : ""}`);
  }

  return <div className="mb-5 rounded-2xl border border-[var(--accent)]/15 bg-[linear-gradient(110deg,rgba(139,140,255,.1),rgba(112,214,255,.035))] px-4 py-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent-bright)]"><Layers3 size={17} /></span>
        <div className="min-w-0"><div className="text-xs font-semibold text-white">Trading account</div><div className="mt-0.5 text-[11px] text-[var(--muted)]">Balances, orders, and performance follow this account.</div></div>
      </div>
      <label className="min-w-0 sm:w-64"><span className="sr-only">Trading account scope</span>
        <select aria-label="Trading account scope" value={scope} onChange={event => changeScope(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-white/[.12] bg-[var(--bg-soft)] px-3 text-xs font-semibold text-white">
          {!accounts.some(account => account.scope === scope) && <option value={scope}>{scope === "main" ? "Main account" : "Selected account unavailable"}</option>}
          {accounts.map(account => <option key={account.scope} value={account.scope}>{account.name}{account.ended || account.status !== "ACTIVE" ? " · read only" : ""}</option>)}
        </select>
      </label>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-[var(--negative)]">{error}</p>}
  </div>;
}
