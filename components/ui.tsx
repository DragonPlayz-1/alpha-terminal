import { cn } from "@/lib/utils";
export { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("surface min-w-0 rounded-2xl", className)}>{children}</section>;
}

export function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("glass rounded-2xl", className)}>{children}</section>;
}

export function Button({ className, variant = "primary", size = "md", type = "button", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const styles = {
    primary: "bg-[var(--accent)] text-[#11131d] shadow-[0_8px_26px_rgba(139,140,255,.2)] hover:bg-[var(--accent-bright)]",
    secondary: "bg-white/[.07] text-[var(--text)] border border-white/[.1] hover:bg-white/[.11]",
    ghost: "text-[var(--muted-strong)] hover:bg-white/[.06] hover:text-white",
    danger: "bg-[var(--negative)]/15 text-[var(--negative)] border border-[var(--negative)]/20 hover:bg-[var(--negative)]/25",
  };
  const sizes = { sm: "min-h-9 px-3 py-2 text-xs", md: "min-h-10 px-4 py-2.5 text-sm", lg: "min-h-12 px-5 py-3 text-sm" };
  return <button type={type} className={cn("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0", sizes[size], styles[variant], className)} {...props}>{children}</button>;
}

export function IconButton({ label, className, size = "md", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }) {
  return <button type="button" aria-label={label} title={label} className={cn("inline-flex shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition-[background-color,color,transform] duration-200 hover:bg-white/[.07] hover:text-white active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-bright)] disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "h-9 w-9" : "h-10 w-10", className)} {...props}>{children}</button>;
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "accent" | "warning"; className?: string }) {
  const tones = { neutral: "bg-white/[.07] text-[var(--muted-strong)]", positive: "bg-[var(--positive)]/10 text-[var(--positive)]", negative: "bg-[var(--negative)]/10 text-[var(--negative)]", accent: "bg-[var(--accent)]/15 text-[var(--accent-bright)]", warning: "bg-amber-400/10 text-amber-300" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em]", tones[tone], className)}>{children}</span>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex min-w-0 flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"><div className="min-w-0">{eyebrow && <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--accent-bright)]">{eyebrow}</div>}<h1 className="text-2xl font-semibold tracking-[-.03em] text-white md:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>}</div>{action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}</div>;
}

export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cn("skeleton rounded-lg", className)} />; }

export function EmptyState({ icon: Icon, title, description, action }: { icon?: React.ComponentType<{ size?: number; className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="empty-state p-10 text-center sm:p-14">{Icon && <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[.08] bg-white/[.035] text-[var(--accent-bright)]"><Icon size={20} /></span>}<h2 className={cn("text-sm font-semibold text-white", Icon && "mt-5")}>{title}</h2>{description && <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[var(--muted)]">{description}</p>}{action && <div className="mt-5 flex justify-center">{action}</div>}</div>;
}
