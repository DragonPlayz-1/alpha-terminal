import { FuturesClient } from "@/components/futures-client";
export default async function FuturesPage({ searchParams }: { searchParams: Promise<{ scope?: string; symbol?: string }> }) {
  const { scope = "main", symbol = "" } = await searchParams;
  return <FuturesClient key={`${scope}:${symbol}`} scope={scope} initialSymbol={symbol.toUpperCase()} />;
}
