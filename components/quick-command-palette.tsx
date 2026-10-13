"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, CandlestickChart, LayoutDashboard, Search, Settings2, WalletCards, Zap } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { withScope } from "@/lib/account-scope";
import { Dialog } from "@/components/dialog";

type CommandItem = { id: string; label: string; detail: string; href: string; icon: typeof Zap };
type Market = { symbol: string; name: string; instrumentType: string };
const navigation: CommandItem[] = [
  { id: "terminal", label: "Open trading terminal", detail: "Execution workspace", href: "/terminal", icon: CandlestickChart },
  { id: "dashboard", label: "Go to dashboard", detail: "Command center", href: "/dashboard", icon: LayoutDashboard },
  { id: "markets", label: "Browse markets", detail: "Quotes and watchlists", href: "/markets", icon: Search },
  { id: "portfolio", label: "View portfolio", detail: "Equity and exposure", href: "/portfolio", icon: WalletCards },
  { id: "journal", label: "Open trade journal", detail: "Decisions and lessons", href: "/journal", icon: BookOpen },
  { id: "settings", label: "Open settings", detail: "Account controls", href: "/settings", icon: Settings2 },
];

export function QuickCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); show(); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-quick-commands", show);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("open-quick-commands", show); };
  }, []);
  return open ? <Dialog title="Quick command palette" onClose={() => setOpen(false)}><Commands onClose={() => setOpen(false)} /></Dialog> : null;
}

function Commands({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const scope = useSearchParams().get("scope") ?? "main";
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    void apiRequest<{ instruments: Market[] }>("/api/markets?refresh=0", { signal: controller.signal }).then(body => setMarkets(body.instruments)).catch(() => { if (!controller.signal.aborted) setError("Market search is temporarily unavailable. Page commands still work."); });
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);
  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pages = navigation.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(normalized));
    const assets = markets.filter(market => `${market.symbol} ${market.name}`.toLowerCase().includes(normalized)).slice(0, 8).map(market => ({ id: `market:${market.symbol}`, label: `Trade ${market.symbol}`, detail: market.name, href: `${market.instrumentType === "SPOT" ? "/terminal" : "/futures"}?symbol=${encodeURIComponent(market.symbol)}`, icon: Zap }));
    return [...pages, ...assets];
  }, [markets, query]);
  function navigate(href: string) { router.push(withScope(href, scope)); onClose(); }
  return <>
    <div className="flex items-center gap-3 px-4"><Search size={17} className="shrink-0 text-[var(--muted)]" /><input ref={inputRef} aria-label="Search commands and markets" aria-controls="command-results" aria-activedescendant={items[activeIndex] ? `command-${activeIndex}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, Math.max(0, items.length - 1))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); }
      if (event.key === "Enter" && items[activeIndex]) { event.preventDefault(); navigate(items[activeIndex].href); }
    }} placeholder="Search commands or symbols" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" /></div>
    {error && <p role="status" className="px-4 py-2 text-xs text-amber-300">{error}</p>}
    <div id="command-results" className="max-h-[55dvh] overflow-y-auto p-2">{items.length ? items.map((item, index) => { const Icon = item.icon; return <button id={`command-${index}`} type="button" key={item.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => navigate(item.href)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left ${index === activeIndex ? "bg-[var(--accent)]/15 text-white" : "text-[var(--muted-strong)] hover:bg-white/[.05]"}`}><Icon size={15} className="shrink-0 text-[var(--accent-bright)]" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">{item.detail}</span></span><ArrowRight size={14} /></button>; }) : <p className="p-8 text-center text-xs text-[var(--muted)]">No results for “{query}”.</p>}</div>
    <p className="border-t border-white/[.08] px-4 py-3 text-[10px] text-[var(--muted)]">↑↓ to move · Enter to open · Escape to close</p>
  </>;
}
