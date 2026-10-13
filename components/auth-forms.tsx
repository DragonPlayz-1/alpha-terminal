"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button, Badge, cn } from "@/components/ui";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import { safeReturnTo } from "@/lib/auth-navigation";

const inputClass = "h-12 w-full min-w-0 rounded-xl border border-white/[.1] bg-white/[.045] pl-10 pr-4 text-base text-white outline-none focus:border-[var(--accent)] sm:text-sm";

function Field({ label, icon: Icon, error, trailing, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: typeof Mail; error?: string; trailing?: React.ReactNode }) {
  const id = props.id ?? props.name;
  return <div>
    <label htmlFor={id} className="mb-2 block text-xs font-medium text-[var(--muted-strong)]">{label}</label>
    <div className="relative">
      <Icon aria-hidden="true" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8b95a7]" />
      <input {...props} id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : props["aria-describedby"]} className={cn(inputClass, trailing ? "pr-14" : undefined, error ? "border-[var(--negative)]/70" : undefined, className)} />
      {trailing}
    </div>
    {error && <p id={`${id}-error`} className="mt-2 text-xs text-[var(--negative)]">{error}</p>}
  </div>;
}

function PasswordField({ value, onChange, create = false, error }: { value: string; onChange: (value: string) => void; create?: boolean; error?: string }) {
  const [show, setShow] = useState(false);
  const id = create ? "register-password" : "login-password";
  const label = create ? "Create password" : "Password";
  return <Field id={id} name="password" label={label} icon={LockKeyhole} error={error} type={show ? "text" : "password"} autoComplete={create ? "new-password" : "current-password"} minLength={create ? 10 : 1} maxLength={72} placeholder={create ? "10+ characters" : "Enter your password"} value={value} onChange={e => onChange(e.target.value)} required autoCapitalize="none" spellCheck={false}
    trailing={<button type="button" aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-controls={id} aria-pressed={show} onClick={() => setShow(!show)} className="absolute inset-y-1 right-1 flex w-11 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white/[.06] hover:text-white">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />;
}

async function verifyBrowserSession() {
  try { await apiRequest("/api/auth/me"); }
  catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) throw new Error("Your browser did not retain the sign-in cookie. Use HTTPS (or localhost for local development) and allow cookies for this site, then sign in again.");
    throw error;
  }
}

export function LoginForm({ returnTo = "/dashboard" }: { returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    if (!retrySeconds) return;
    const timer = setTimeout(() => setRetrySeconds(current => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retrySeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || retrySeconds) return;
    const form = event.currentTarget;
    // Read the actual controls, including password-manager/autofill values.
    const values = new FormData(form);
    const submittedEmail = String(values.get("email") ?? "").trim();
    const submittedPassword = String(values.get("password") ?? "");
    const fields: typeof fieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(submittedEmail)) fields.email = "Enter a valid email address.";
    if (!submittedPassword) fields.password = "Enter your password.";
    setFieldErrors(fields); setError("");
    if (Object.keys(fields).length) { form.querySelector<HTMLInputElement>(fields.email ? "#login-email" : "#login-password")?.focus(); return; }
    busy.current = true; setLoading(true);
    try {
      await apiRequest("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: submittedEmail, password: submittedPassword }) });
      await verifyBrowserSession();
      router.replace(safeReturnTo(returnTo)); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
      if (caught instanceof ApiRequestError && caught.status === 429) setRetrySeconds(Math.min(300, caught.retryAfter ?? 60));
      busy.current = false; setLoading(false);
    }
  }
  return <form onSubmit={submit} className="space-y-5" noValidate aria-busy={loading}>
    <Field id="login-email" name="email" label="Email address" icon={Mail} error={fieldErrors.email} type="email" autoComplete="username" autoCapitalize="none" inputMode="email" spellCheck={false} maxLength={320} placeholder="you@example.com" value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(current => ({ ...current, email: undefined })); }} required />
    <PasswordField value={password} onChange={value => { setPassword(value); setFieldErrors(current => ({ ...current, password: undefined })); }} error={fieldErrors.password} />
    <Link href="/forgot-password" className="inline-flex min-h-9 items-center text-xs text-[var(--accent-bright)] hover:text-white">Forgot password?</Link>
    {error && <p role="alert" className="rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-3 py-3 text-sm text-[var(--negative)]">{error}</p>}
    <Button type="submit" size="lg" disabled={loading || retrySeconds > 0} className="w-full">{loading ? "Signing in…" : retrySeconds ? `Try again in ${retrySeconds}s` : "Enter terminal"}<ArrowRight size={16} /></Button>
  </form>;
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "", initialCapital: "10000" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  function update(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const values = new FormData(event.currentTarget);
    const details = { username: String(values.get("username") ?? "").trim(), email: String(values.get("email") ?? "").trim(), password: String(values.get("password") ?? ""), initialCapital: Number(values.get("initialCapital")) };
    if (new TextEncoder().encode(details.password).length > 72) { setError("Password must be at most 72 UTF-8 bytes. Try a shorter password."); return; }
    busy.current = true; setLoading(true); setError("");
    try {
      await apiRequest("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) });
      await verifyBrowserSession();
      router.replace("/dashboard"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create account."); busy.current = false; setLoading(false); }
  }
  return <form onSubmit={submit} className="space-y-4" aria-busy={loading}>
    <Field id="register-username" name="username" label="Choose a username" icon={UserRound} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" placeholder="market_maven" value={form.username} onChange={e => update("username", e.target.value)} required />
    <Field id="register-email" name="email" label="Email address" icon={Mail} type="email" autoComplete="email" autoCapitalize="none" inputMode="email" spellCheck={false} maxLength={320} placeholder="you@example.com" value={form.email} onChange={e => update("email", e.target.value)} required />
    <PasswordField create value={form.password} onChange={value => update("password", value)} />
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-strong)]"><span>Starting virtual capital</span><Badge tone="positive">100% simulated</Badge></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[1000, 5000, 10000, 50000, 100000].map(capital => <button type="button" key={capital} aria-pressed={form.initialCapital === String(capital)} onClick={() => update("initialCapital", String(capital))} className={cn("min-h-11 rounded-xl border px-2 py-2.5 text-xs font-semibold", form.initialCapital === String(capital) ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white" : "border-white/[.08] text-[var(--muted)] hover:bg-white/[.05]")}>${capital.toLocaleString()}</button>)}</div>
    <label htmlFor="initial-capital" className="block text-xs text-[var(--muted-strong)]">Custom starting capital (USD)<input id="initial-capital" name="initialCapital" type="number" min={100} max={1000000} step="0.01" inputMode="decimal" value={form.initialCapital} onChange={e => update("initialCapital", e.target.value)} required className={cn(inputClass, "mt-2 pl-4")} /></label>
    {error && <p role="alert" className="rounded-xl border border-[var(--negative)]/20 bg-[var(--negative)]/10 px-3 py-3 text-sm text-[var(--negative)]">{error}</p>}
    <Button type="submit" size="lg" disabled={loading} className="w-full">{loading ? "Creating account…" : "Create simulated account"}<ArrowRight size={16} /></Button>
    <p className="text-xs leading-5 text-[var(--muted)]">Your starting capital is recorded permanently and only used for simulation. It cannot be withdrawn or converted to real money.</p>
  </form>;
}
