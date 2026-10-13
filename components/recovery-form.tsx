"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

export function RecoveryForm({ reset = false, verify = false, token = "" }: { reset?: boolean; verify?: boolean; token?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (reset && password !== confirmation) { setError("Passwords do not match."); return; }
    setLoading(true); setError(""); setStatus("");
    const action = verify ? "verify-email" : reset ? "reset-password" : "forgot-password";
    try {
      const body = await apiRequest<{ message: string }>(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: verify ? JSON.stringify({ token }) : reset ? JSON.stringify({ token, password }) : JSON.stringify({ email }) });
      setStatus(body.message);
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setLoading(false); }
  }

  return <form onSubmit={submit} className="space-y-5" noValidate>
    {reset ? <><label className="block"><span className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">New password</span><span className="relative block"><KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#657187]" /><input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? "text" : "password"} minLength={10} maxLength={72} required placeholder="10+ characters" className="h-12 w-full rounded-xl border border-white/[.1] bg-white/[.045] pl-10 pr-12 text-sm text-white outline-none focus:border-[var(--accent)]" /><button type="button" aria-label={showPassword ? "Hide new password" : "Show new password"} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#657187] hover:bg-white/[.06] hover:text-white">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label><label className="block"><span className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">Confirm password</span><input value={confirmation} onChange={e => setConfirmation(e.target.value)} type={showPassword ? "text" : "password"} minLength={10} maxLength={72} required placeholder="Repeat your password" className="h-12 w-full rounded-xl border border-white/[.1] bg-white/[.045] px-4 text-sm text-white outline-none focus:border-[var(--accent)]" /></label></> : verify ? <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-sm text-[var(--muted)]">Confirm this address to finish setting up your ALPHA TERMINAL account.</div> : <label className="block"><span className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">Email address</span><span className="relative block"><Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#657187]" /><input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@example.com" className="h-12 w-full rounded-xl border border-white/[.1] bg-white/[.045] pl-10 pr-4 text-sm text-white outline-none focus:border-[var(--accent)]" /></span></label>}
    {error && <div role="alert" aria-live="assertive" className="rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-3 py-3 text-xs text-[var(--negative)]">{error}</div>}
    {status && <div role="status" aria-live="polite" className="rounded-xl border border-[var(--positive)]/20 bg-[var(--positive)]/10 px-3 py-3 text-xs text-[var(--positive)]">{status}</div>}
    <Button type="submit" size="lg" disabled={loading || (verify && !token)} className="w-full">{loading ? "Working…" : verify ? "Verify email" : reset ? "Set new password" : "Send recovery link"}<ArrowRight size={15} /></Button>
    <Link href="/login" className="flex items-center justify-center gap-2 text-xs text-[var(--muted)] hover:text-white"><ArrowLeft size={13} /> Back to sign in</Link>
  </form>;
}
