import { NextRequest } from "next/server";
import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { getQuote } from "@/server/market-data/service";

export async function GET(_request: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol: rawSymbol } = await context.params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
    const result = await getQuote(symbol, true);
    if (!result.quote) return apiError("No quote is available for this instrument.", 503, "QUOTE_UNAVAILABLE");
    const ageMs = result.ageMs;
    return apiSuccess({
      instrument: {
        id: result.instrument.id,
        symbol: result.instrument.symbol,
        name: result.instrument.name,
        baseAsset: result.instrument.baseAsset,
        quoteAsset: result.instrument.quoteAsset,
        dataProvider: result.instrument.dataProvider,
      },
      quote: {
        bid: result.quote.bid?.toString() ?? null,
        ask: result.quote.ask?.toString() ?? null,
        lastPrice: result.quote.lastPrice?.toString() ?? null,
        volume: result.quote.volume?.toString() ?? null,
        priceChange: result.quote.priceChange?.toString() ?? null,
        priceChangePct: result.quote.priceChangePct?.toString() ?? null,
        sourceTimestamp: new Date(result.quote.sourceTimestamp ?? result.quote.receivedAt).toISOString(),
        receivedAt: result.quote.receivedAt.toISOString(),
        ageMs,
        freshness: result.fresh ? "LIVE" : "CACHED",
      },
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 404, "INSTRUMENT_NOT_FOUND");
  }
}
