import { notFound } from "next/navigation";
import { Award, BarChart3, CalendarDays, EyeOff, Trophy } from "lucide-react";
import { getPublicProfile } from "@/server/competition/service";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { formatCurrency, formatPercent } from "@/lib/format";

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  const history = "returnPercentage" in profile ? profile : null;
  return (
    <div className="mx-auto max-w-4xl animate-slide-up">
      <SectionHeading
        eyebrow="Public profile"
        title={profile.username}
        description="Permitted simulation statistics and achievements."
        action={<Badge tone="accent"><Trophy size={12} className="mr-1" /> Trader profile</Badge>}
      />
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="p-5 md:col-span-1">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#7475df] to-[#54bad9] text-xl font-bold text-white">
            {profile.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="mt-5 text-lg font-semibold text-white">{profile.username}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
            <CalendarDays size={13} />Joined {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "the terminal"}
          </div>
          <div className="mt-6 rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-[var(--muted)]">
            All displayed stats are simulated and public by user choice.
          </div>
        </Card>
        {history ? (
          <div className="grid gap-4 md:col-span-2 sm:grid-cols-2">
            <Stat icon={BarChart3} label="Return" value={formatPercent(history.returnPercentage)} />
            <Stat icon={Trophy} label="Realized P&L" value={formatCurrency(history.realizedPnl)} />
            <Stat icon={BarChart3} label="Completed trades" value={String(history.tradeCount)} />
            <Stat icon={Award} label="Win rate" value={`${history.winRate}%`} />
          </div>
        ) : (
          <Card className="flex flex-col justify-center p-5 md:col-span-2">
            <EyeOff size={20} className="text-[var(--muted-strong)]" />
            <div className="mt-4 text-sm font-semibold text-white">Trading history is private</div>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
              This trader has chosen to keep performance, trade count, and win rate visible only to themselves.
            </p>
          </Card>
        )}
      </div>
      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold text-white">Achievements</h2>
        {profile.achievements.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {profile.achievements.map((achievement) => (
              <div key={`${achievement.name}-${achievement.unlockedAt}`} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><Award size={15} className="text-[var(--accent-bright)]" />{achievement.name}</div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{achievement.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">No achievements unlocked yet.</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return <Card className="p-5"><Icon size={18} className="text-[var(--accent-bright)]" /><div className="mt-6 text-[10px] text-[var(--muted)]">{label}</div><div className="mt-2 tabular text-2xl font-semibold text-white">{value}</div></Card>;
}
