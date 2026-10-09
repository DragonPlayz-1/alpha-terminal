"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

const inputClass = "h-12 w-full rounded-xl border border-white/[.1] bg-white/[.045] pl-10 pr-4 text-sm text-white outline-none focus:border-[var(--accent)]";
function Field({ label, icon: Icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: typeof Mail }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">{label}</span><span className="relative block"><Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#657187]" /><input {...props} className={inputClass} /></span></label>;
}

function PasswordField({ value, onChange, create }: { value: string; onChange: (value: string) => void; create?: boolean }) {
  const [show, setShow] = useState(false);
  return <div className="relative"><Field label={create ? "Create password" : "Password"} icon={LockKeyhole} type={show ? "text" : "password"} autoComplete={create ? "new-password" : "current-password"} minLength={create ? 10 : 1} maxLength={72} placeholder={create ? "10+ characters" : "Enter your password"} value={value} onChange={e => onChange(e.target.value)} required /><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="absolute right-3 bottom-3 p-1 text-[#657187]">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (loading) return;
    setLoading(true); setError("");
    try {
      await apiRequest("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      router.push("/dashboard"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setLoading(false); }
  }
  return <form onSubmit={submit} className="space-y-5"><Field label="Email address" icon={Mail} type="email" autoComplete="email" maxLength={320} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /><PasswordField value={password} onChange={setPassword} /><Link href="/forgot-password" className="block text-xs text-[var(--accent-bright)]">Forgot password?</Link>{error && <p role="alert" className="text-sm text-[var(--negative)]">{error}</p>}<Button type="submit" disabled={loading} className="h-12 w-full">{loading ? "Signing in…" : "Enter terminal"}<ArrowRight size={16} /></Button></form>;
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "", initialCapital: "10000" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function update(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (loading) return;
    setLoading(true); setError("");
    try {
      await apiRequest("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, initialCapital: Number(form.initialCapital) }) });
      router.push("/dashboard"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create account."); }
    finally { setLoading(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <Field label="Choose a username" icon={UserRound} autoComplete="username" minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" placeholder="market_maven" value={form.username} onChange={e => update("username", e.target.value)} required />
    <Field label="Email address" icon={Mail} type="email" autoComplete="email" maxLength={320} placeholder="you@example.com" value={form.email} onChange={e => update("email", e.target.value)} required />
    <PasswordField create value={form.password} onChange={value => update("password", value)} />
    <div className="flex items-center justify-between text-xs text-[var(--muted-strong)]"><span>Starting virtual capital</span><Badge tone="positive">100% simulated</Badge></div>
    <div className="grid grid-cols-3 gap-2">{[1000, 5000, 10000, 50000, 100000].map(capital => <button type="button" key={capital} onClick={() => update("initialCapital", String(capital))} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${form.initialCapital === String(capital) ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white" : "border-white/[.08] text-[var(--muted)]"}`}>${capital.toLocaleString()}</button>)}</div>
    <label className="block text-xs text-[var(--muted-strong)]">Custom starting capital (USD)<input type="number" min={100} max={1000000} step="0.01" value={form.initialCapital} onChange={e => update("initialCapital", e.target.value)} required className={`${inputClass} mt-2`} /></label>
    {error && <p role="alert" className="text-sm text-[var(--negative)]">{error}</p>}
    <Button type="submit" disabled={loading} className="h-12 w-full">{loading ? "Creating account…" : "Create simulated account"}<ArrowRight size={16} /></Button>
    <p className="text-xs leading-5 text-[var(--muted)]">Your starting capital is recorded permanently and only used for simulation. It cannot be withdrawn or converted to real money.</p>
  </form>;
}
