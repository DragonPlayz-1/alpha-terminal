"use client";

import { ScopedLink as Link } from "@/components/scoped-link";
import { useEffect, useRef, useState } from "react";
import { Award, CalendarDays, ChevronRight, ShieldCheck, Sparkles, Trophy, Users, Zap } from "lucide-react";
import { Badge, Button, Card, SectionHeading, Skeleton } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";
import { formatCurrency, formatPercent } from "@/lib/format";

type Leader = { rank: number; username: string; avatarUrl: string | null; returnPercentage: string; realizedPnl: string; tradeCount: number; winRate: string; achievements: string[] };
type Challenge = { id: string; name: string; description: string; startingCapital: string; startTime: string; endTime: string; status: string; participants: number; joined: boolean; accountScope: string | null; configuration: Record<string, unknown> };

const leaderboardTypes = [["all-time", "All time"], ["realized", "Realized P&L"], ["win-rate", "Win rate"]] as const;

export function LeaderboardsClient() {
  const [entries, setEntries] = useState<Leader[]>([]);
  const [type, setType] = useState<(typeof leaderboardTypes)[number][0]>("all-time");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);

  async function load() {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const body = await apiRequest<{ entries: Leader[] }>(`/api/leaderboards?type=${type}`);
      if (current === sequence.current) setEntries(body.entries);
    } catch (caught) {
      if (current === sequence.current) setError(caught instanceof Error ? caught.message : "Unable to load the leaderboard.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  useEffect(() => { void load(); return () => { sequence.current++; }; }, [type]);

  return <div className="animate-slide-up">
    <SectionHeading eyebrow="Competitive edge" title="Leaderboards" description="Compare normalized simulated performance. Starting balance never determines rank." action={<Badge tone="accent"><Trophy size={12} className="mr-1" /> Server-ranked</Badge>} />
    <div className="mb-5 flex gap-1 overflow-x-auto" role="tablist" aria-label="Leaderboard period">
      {leaderboardTypes.map(([value, label]) => <button key={value} role="tab" aria-selected={type === value} onClick={() => setType(value)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-bright)] ${type === value ? "bg-[var(--accent)]/15 text-[var(--accent-bright)]" : "text-[var(--muted)] hover:bg-white/[.05]"}`}>{label}</button>)}
    </div>
    {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-4 py-3 text-sm text-[var(--negative)]"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></div>}
    <Card className="overflow-hidden">
      {loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-16" />)}</div> : entries.length ? <>
        <div className="hidden grid-cols-[56px_1.6fr_1fr_1fr_1fr] border-b border-white/[.06] px-5 py-3 text-[10px] uppercase tracking-[.15em] text-[#657187] md:grid"><span>Rank</span><span>Trader</span><span>Return</span><span>Realized P&L</span><span className="text-right">Win rate</span></div>
        <div className="divide-y divide-white/[.05]">{entries.map(entry => <div key={entry.username} className="px-5 py-4 md:grid md:grid-cols-[56px_1.6fr_1fr_1fr_1fr] md:items-center">
          <div className={`text-sm font-bold ${entry.rank <= 3 ? "text-amber-300" : "text-[var(--muted)]"}`}>{entry.rank < 10 ? `0${entry.rank}` : entry.rank}</div>
          <div className="mt-3 flex items-center gap-3 md:mt-0"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7475df] to-[#54bad9] text-[10px] font-bold text-white">{entry.username.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{entry.username}</div><div className="mt-1 flex gap-1">{entry.achievements.slice(0, 2).map(achievement => <span key={achievement} title={achievement}><Award size={12} className="text-[var(--accent-bright)]" /></span>)}</div></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs md:mt-0 md:block"><span className="text-[var(--muted)] md:hidden">Return<br /></span><span className={Number(entry.returnPercentage) >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}>{formatPercent(entry.returnPercentage)}</span><span className="text-[var(--muted)] md:hidden">P&L<br /></span><span className="text-[var(--muted-strong)] md:block">{formatCurrency(entry.realizedPnl)}</span><span className="text-[var(--muted)] md:hidden">Win rate<br /></span><span className="text-[var(--muted-strong)] md:block">{formatPercent(entry.winRate)}</span></div>
          <div className="hidden text-sm text-[var(--muted-strong)] md:block">{formatCurrency(entry.realizedPnl)}</div><div className="hidden text-right text-sm text-[var(--muted-strong)] md:block">{formatPercent(entry.winRate)}</div>
        </div>)}</div>
      </> : <div className="p-12 text-center"><Trophy size={25} className="mx-auto mb-4 text-[#657187]" /><div className="text-sm font-semibold text-white">No ranked activity yet</div><p className="mt-2 text-xs text-[var(--muted)]">Complete simulated trades to appear on the server-ranked board.</p></div>}
    </Card>
  </div>;
}

export function ChallengesClient() {
  const [rows, setRows] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [joining, setJoining] = useState("");
  const sequence = useRef(0);

  async function load() {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const body = await apiRequest<{ challenges: Challenge[] }>("/api/challenges");
      if (current === sequence.current) setRows(body.challenges);
    } catch (caught) {
      if (current === sequence.current) setError(caught instanceof Error ? caught.message : "Unable to load challenges.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  useEffect(() => { void load(); return () => { sequence.current++; }; }, []);

  async function join(id: string) {
    setJoining(id);
    setMessage("");
    setError("");
    try {
      await apiRequest(`/api/challenges/${id}/join`, { method: "POST" });
      setMessage("Challenge account created. Open Futures or Terminal to trade it.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to join challenge.");
    } finally {
      setJoining("");
    }
  }

  return <div className="animate-slide-up">
    <SectionHeading eyebrow="Practice with a clock" title="Challenges" description="Structured simulations with fixed rules, fixed starting snapshots, and transparent ranking." action={<Badge tone="positive"><Sparkles size={12} className="mr-1" /> Virtual funds only</Badge>} />
    {message && <div role="status" className="mb-5 rounded-xl border border-[var(--positive)]/20 bg-[var(--positive)]/10 px-4 py-3 text-xs text-[var(--positive)]">{message}</div>}
    {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-4 py-3 text-sm text-[var(--negative)]"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></div>}
    {loading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2].map(item => <Skeleton key={item} className="h-52" />)}</div> : rows.length ? <div className="grid gap-4 md:grid-cols-2">{rows.map(challenge => <Card key={challenge.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/12 text-[var(--accent-bright)]"><Zap size={20} /></div><Badge tone={challenge.status === "ACTIVE" ? "positive" : "neutral"}>{challenge.status}</Badge></div><h2 className="mt-6 text-lg font-semibold tracking-[-.03em] text-white">{challenge.name}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{challenge.description}</p><div className="mt-6 grid grid-cols-3 gap-3 border-y border-white/[.06] py-4 text-xs"><div><div className="text-[var(--muted)]">Starting</div><div className="mt-1 tabular font-semibold text-white">{formatCurrency(challenge.startingCapital)}</div></div><div><div className="text-[var(--muted)]">Traders</div><div className="mt-1 flex items-center gap-1 font-semibold text-white"><Users size={13} />{challenge.participants}</div></div><div><div className="text-[var(--muted)]">Ends</div><div className="mt-1 font-semibold text-white">{new Date(challenge.endTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div></div></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-[10px] text-[var(--muted)]"><ShieldCheck size={13} className="text-[var(--positive)]" /> Server-enforced rules</div>{challenge.joined ? <Link href={`/futures?scope=${encodeURIComponent(challenge.accountScope ?? "")}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-bright)]">Open account <ChevronRight size={14} /></Link> : <Button size="sm" disabled={joining === challenge.id || challenge.status !== "ACTIVE"} onClick={() => void join(challenge.id)}>{joining === challenge.id ? "Joining…" : challenge.status === "ACTIVE" ? "Join challenge" : "Unavailable"}</Button>}</div></Card>)}</div> : <Card className="p-12 text-center"><CalendarDays size={25} className="mx-auto mb-4 text-[#657187]" /><div className="text-sm font-semibold text-white">No challenges are available</div><p className="mt-2 text-xs text-[var(--muted)]">Check back when the next simulation window opens.</p></Card>}
  </div>;
}
