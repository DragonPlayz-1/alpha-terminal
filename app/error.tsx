"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="flex min-h-dvh items-center justify-center px-5 py-12"><Card className="w-full max-w-lg p-6 text-center sm:p-8"><div className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent-bright)]">Something went wrong</div><h1 className="mt-3 text-2xl font-semibold text-white">The terminal could not load this page.</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Try again. If the problem continues, check the database connection and server logs.</p><Button className="mt-6" onClick={() => reset()}>Try again</Button></Card></main>;
}
