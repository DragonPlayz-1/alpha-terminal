import { apiError, apiSuccess } from "@/lib/http";
import { getInstruments, refreshQuotes, isFresh } from "@/server/market-data/service";
import { getTradingConfig } from "@/server/config";
import { getPortfolio } from "@/server/trading/service";
import { requireApiUser } from "@/server/auth/session";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401);
  let instruments = (await getInstruments()).filter(i => i.instrumentType !== "SPOT");
  await refreshQuotes(instruments.map(i => i.symbol)).catch(() => undefined);
  instruments = await getInstruments();
  const { quoteMaxAgeMs, feeRate } = await getTradingConfig();
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
  try {
  const portfolio = await getPortfolio(user.id, scope);
  return apiSuccess({
    instruments: instruments.filter(i => i.instrumentType !== "SPOT").map(i => ({ symbol: i.symbol, name: i.name, underlying: i.baseAsset, maximumLeverage: i.maximumLeverage.toString(), specifications: i.metadata, quote: i.quote ? { markPrice: i.quote.markPrice?.toString(), bid: i.quote.bid?.toString(), ask: i.quote.ask?.toString(), freshness: isFresh(i.quote, Date.now(), quoteMaxAgeMs) ? "LIVE" : "CACHED" } : null })),
    feeRate,
    positions: portfolio.positions.filter(p => p.instrumentType !== "SPOT"),
    equity: portfolio.equity,
    availableCash: portfolio.account.availableCash.toString(),
    margin: portfolio.margin,
  });
  } catch {
    return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
  }
}
