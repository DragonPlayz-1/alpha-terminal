import { cn } from "@/lib/utils";
export { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("surface rounded-2xl", className)}>{children}</section>;
}

export function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("glass rounded-2xl", className)}>{children}</section>;
}

export function Button({ className, variant = "primary", type = "button", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-[var(--accent)] text-white shadow-[0_8px_26px_rgba(139,140,255,.2)] hover:bg-[var(--accent-bright)]",
    secondary: "bg-white/[.07] text-[var(--text)] border border-white/[.1] hover:bg-white/[.11]",
    ghost: "text-[var(--muted-strong)] hover:bg-white/[.06] hover:text-white",
    danger: "bg-[var(--negative)]/15 text-[var(--negative)] border border-[var(--negative)]/20 hover:bg-[var(--negative)]/25",
  };
  return <button type={type} className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50", styles[variant], className)} {...props}>{children}</button>;
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "accent" | "warning"; className?: string }) {
  const tones = { neutral: "bg-white/[.07] text-[var(--muted-strong)]", positive: "bg-[var(--positive)]/10 text-[var(--positive)]", negative: "bg-[var(--negative)]/10 text-[var(--negative)]", accent: "bg-[var(--accent)]/15 text-[var(--accent-bright)]", warning: "bg-amber-400/10 text-amber-300" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em]", tones[tone], className)}>{children}</span>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex items-end justify-between gap-4"><div>{eyebrow && <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--accent-bright)]">{eyebrow}</div>}<h1 className="text-2xl font-semibold tracking-[-.03em] text-white md:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>}</div>{action}</div>;
}

export function Skeleton({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded-lg bg-white/[.07]", className)} />; }
