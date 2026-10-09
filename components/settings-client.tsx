"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Save, ShieldCheck, UserRound } from "lucide-react";
import { Button, Card, SectionHeading } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

type Profile = { username: string; email: string; publicProfile: boolean; publicHistory: boolean };
export function SettingsClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try { const body = await apiRequest<{ user: Profile }>("/api/user/profile"); setProfile(body.user); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Unable to load profile."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile || busy) return;
    setBusy(true); setStatus("");
    try {
      const { user } = await apiRequest<{ user: Profile }>("/api/user/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: profile.username, publicProfile: profile.publicProfile, publicHistory: profile.publicHistory }) });
      setProfile(user); setStatus("Profile saved.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to save profile."); }
    finally { setBusy(false); }
  }
  async function verifyEmail() {
    if (!profile || busy) return;
    setBusy(true);
    try { const body = await apiRequest<{ message: string }>("/api/auth/send-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: profile.email }) }); setStatus(body.message); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Unable to send verification."); }
    finally { setBusy(false); }
  }
  return <div className="animate-slide-up">
    <SectionHeading eyebrow="Control center" title="Settings" description="Manage your profile, privacy, and account access." />
    {status && <p role="status" className="mb-4 text-sm text-[var(--muted-strong)]">{status}</p>}
    {loading ? <p className="text-sm text-[var(--muted)]">Loading settings…</p> : !profile ? <Button onClick={load}>Retry</Button> : <div className="grid gap-5 lg:grid-cols-[1fr_.7fr]">
      <Card className="p-5"><div className="mb-6 flex items-center gap-3 font-semibold text-white"><UserRound size={18} />Profile & privacy</div>
        <form onSubmit={save} className="space-y-5"><label className="block text-xs text-[var(--muted-strong)]">Username<input required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" value={profile.username} onChange={e => setProfile({ ...profile, username: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white" /></label>
          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm text-white"><input type="checkbox" checked={profile.publicProfile} onChange={e => setProfile({ ...profile, publicProfile: e.target.checked })} /><span>Public profile<span className="mt-1 block text-xs text-[var(--muted)]">Display your username and achievements.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm text-white"><input type="checkbox" checked={profile.publicHistory} onChange={e => setProfile({ ...profile, publicHistory: e.target.checked })} /><span>Public trading statistics<span className="mt-1 block text-xs text-[var(--muted)]">Share performance and appear on leaderboards when your profile is public.</span></span></label>
          <Button type="submit" disabled={busy}><Save size={15} />{busy ? "Saving…" : "Save profile"}</Button>
        </form></Card>
      <Card className="p-5"><div className="flex items-center gap-2 font-semibold text-white"><ShieldCheck size={18} />Account access</div><p className="mt-4 break-all text-sm text-[var(--muted)]">{profile.email}</p><Button variant="secondary" disabled={busy} onClick={verifyEmail} className="mt-4">Send verification email</Button><Link href="/forgot-password" className="mt-5 block text-sm text-[var(--accent-bright)]">Change password via recovery email</Link></Card>
    </div>}
  </div>;
}
