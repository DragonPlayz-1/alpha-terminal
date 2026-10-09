import { FuturesClient } from "@/components/futures-client";
export default async function FuturesPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope = "main" } = await searchParams;
  return <FuturesClient key={scope} scope={scope} />;
}
