import { TerminalClient } from "@/components/terminal-client";

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ symbol?: string; scope?: string }> }) {
  const params = await searchParams;
  return <TerminalClient key={`${params.scope ?? "main"}:${params.symbol ?? "BTC-USD"}`} initialSymbol={params.symbol ? params.symbol.toUpperCase() : "BTC-USD"} initialScope={params.scope ?? "main"} />;
}
