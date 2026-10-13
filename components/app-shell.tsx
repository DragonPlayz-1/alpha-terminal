"use client";

import { ScopedLink as Link } from "@/components/scoped-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, BookOpen, CandlestickChart, CircleHelp, Clock3, LayoutDashboard, ListOrdered, LogOut, Menu, Search, Settings2, Trophy, WalletCards, X, Zap } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { apiRequest } from "@/lib/api-client";
import { IconButton } from "@/components/ui";

const navGroups = [
  { label: "Workspace", items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }, { href: "/terminal", label: "Terminal", icon: CandlestickChart }, { href: "/markets", label: "Markets", icon: Search }, { href: "/portfolio", label: "Portfolio", icon: WalletCards }, { href: "/futures", label: "Futures", icon: CandlestickChart }] },
  { label: "Review", items: [{ href: "/orders", label: "Orders", icon: ListOrdered }, { href: "/history", label: "Trade history", icon: Clock3 }, { href: "/journal", label: "Trade journal", icon: BookOpen }] },
  { label: "Compete", items: [{ href: "/leaderboards", label: "Leaderboards", icon: Trophy }, { href: "/challenges", label: "Challenges", icon: Zap }] },
  { label: "Account", items: [{ href: "/settings", label: "Settings", icon: Settings2 }, { href: "/help", label: "How it works", icon: CircleHelp }] },
];
const mobileNav = navGroups[0].items.slice(0, 4);

export function AppShell({ user, children }: { user: { username: string; role: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const scope = useSearchParams().get("scope") ?? "main";
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => { setDesktop(media.matches); if (media.matches) setMobileOpen(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : menuButtonRef.current;
    document.body.classList.add("menu-open");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileOpen(false); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(element => element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    drawerRef.current?.querySelector<HTMLElement>('button[aria-label="Close navigation"]')?.focus();
    return () => { document.body.classList.remove("menu-open"); window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [mobileOpen]);

  useEffect(() => {
    let active = true;
    async function loadUnread() {
      try { const body = await apiRequest<{ unreadCount: number }>("/api/notifications"); if (active) setUnreadCount(body.unreadCount); }
      catch { /* Navigation remains usable during a notification outage. */ }
    }
    void loadUnread();
    window.addEventListener("notifications-changed", loadUnread);
    const timer = setInterval(() => void loadUnread(), 30_000);
    return () => { active = false; clearInterval(timer); window.removeEventListener("notifications-changed", loadUnread); };
  }, [pathname]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError("");
    try { await apiRequest("/api/auth/logout", { method: "POST" }); router.replace("/"); router.refresh(); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : "Unable to sign out. Please try again."); setLoggingOut(false); }
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return <div className="min-h-screen bg-[var(--bg)]">
    <aside ref={drawerRef} id="mobile-navigation" aria-label="Primary navigation" inert={!desktop && !mobileOpen} className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(248px,calc(100vw-2rem))] flex-col border-r border-white/[.07] bg-[#0b0e14]/95 px-4 py-5 backdrop-blur-2xl transition-transform lg:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex items-center justify-between px-2 pb-5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3" onClick={() => setMobileOpen(false)}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-sm font-black text-[#11131d] shadow-[0_8px_24px_rgba(139,140,255,.35)]">A</span><span className="truncate text-[13px] font-bold tracking-[.1em] text-white">ALPHA<span className="text-[var(--accent-bright)]">/</span>TERMINAL</span></Link>
        <IconButton label="Close navigation" className="lg:hidden" onClick={() => setMobileOpen(false)}><X size={17} /></IconButton>
      </div>
      <div className="mb-5 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[.07] p-3"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--accent-bright)]">Simulation mode</div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Virtual balances. Public market data.</p></div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto">{navGroups.map(group => <div key={group.label}>
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--muted)]">{group.label}</div>
        <div className="space-y-1">{group.items.map(item => { const Icon = item.icon; const active = isActive(item.href); return <Link href={item.href} key={item.href} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={cn("group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors", active ? "bg-[var(--accent)]/12 text-white" : "text-[var(--muted)] hover:bg-white/[.05] hover:text-[var(--muted-strong)]")}><Icon size={17} className={active ? "text-[var(--accent-bright)]" : ""} /><span>{item.label}</span></Link>; })}</div>
      </div>)}</nav>
      <div className="mt-4 border-t border-white/[.07] pt-3"><div className="flex items-center gap-3 rounded-xl p-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7475df] to-[#54bad9] text-xs font-bold text-white">{initials(user.username)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{user.username}</div><div className="text-[11px] text-[var(--muted)]">Paper trader</div></div><IconButton label="Log out" disabled={loggingOut} onClick={logout}><LogOut size={16} /></IconButton></div>{logoutError && <p role="alert" className="px-2 pt-2 text-[11px] leading-4 text-[var(--negative)]">{logoutError}</p>}</div>
    </aside>
    {mobileOpen && <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <main inert={mobileOpen} className="min-w-0 lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-white/[.07] bg-[var(--bg)]/80 px-4 backdrop-blur-xl md:px-8">
        <div className="flex items-center gap-3"><button ref={menuButtonRef} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="mobile-navigation" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[.08] text-[var(--muted)] hover:bg-white/[.06] lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={18} /></button><span className="hidden text-xs text-[var(--muted)] sm:block">Your paper-trading workspace</span></div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Quick trade" onClick={() => window.dispatchEvent(new Event("open-quick-commands"))} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/[.06] px-3 text-xs font-medium text-[var(--muted-strong)] hover:bg-white/[.1]"><Zap size={14} className="text-[var(--accent-bright)]" /><span className="hidden sm:inline">Quick trade</span><kbd className="hidden rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-[var(--muted)] md:block">Ctrl / ⌘ K</kbd></button>
          <Link href="/notifications" aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"} className="relative flex h-11 w-11 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-white/[.06]"><Bell size={18} />{unreadCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 rounded-full bg-[var(--accent-bright)] px-1 text-[9px] font-bold text-[#11131d]">{unreadCount > 99 ? "99+" : unreadCount}</span>}</Link>
          <Link href="/settings" aria-label="Open account settings" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/[.06]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#7475df] to-[#54bad9] text-[10px] font-bold">{initials(user.username)}</span></Link>
        </div>
      </header>
      <div key={scope} className="mx-auto max-w-[1800px] px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 lg:pb-8">{children}</div>
    </main>
    <nav inert={mobileOpen} aria-label="Mobile shortcuts" className="fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-5 gap-1 rounded-2xl border border-white/[.1] bg-[#111722]/95 p-1.5 shadow-2xl backdrop-blur-xl lg:hidden">{mobileNav.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", isActive(item.href) ? "bg-[var(--accent)]/15 text-[var(--accent-bright)]" : "text-[var(--muted)]")}><Icon size={16} />{item.label}</Link>; })}<button aria-label="Open more navigation" onClick={() => setMobileOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-[var(--muted)]"><Menu size={16} />More</button></nav>
  </div>;
}
