import { TerminalClient } from "@/components/terminal-client";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ symbol: string }>; searchParams: Promise<{ scope?: string }> }) {
  const [{ symbol }, { scope = "main" }] = await Promise.all([params, searchParams]);
  const normalizedSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({ where: { symbol: normalizedSymbol }, select: { instrumentType: true } });
  if (!instrument) notFound();
  if (instrument.instrumentType !== "SPOT") {
    const query = new URLSearchParams({ symbol: normalizedSymbol });
    if (scope !== "main") query.set("scope", scope);
    redirect(`/futures?${query}`);
  }
  return <TerminalClient key={`${scope}:${normalizedSymbol}`} initialSymbol={normalizedSymbol} initialScope={scope} />;
}
