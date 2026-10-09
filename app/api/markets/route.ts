import { NextRequest } from "next/server";
import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { getInstruments, refreshQuotes } from "@/server/market-data/service";
import { isFresh } from "@/server/market-data/service";
import { getTradingConfig } from "@/server/config";
import { z } from "zod";

function serializeInstrument(instrument: Awaited<ReturnType<typeof getInstruments>>[number], quoteMaxAgeMs: number) {
  const quote = instrument.quote;
  const ageMs = quote?.sourceTimestamp ? Date.now() - quote.sourceTimestamp.getTime() : null;
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    providerSymbol: instrument.providerSymbol,
    name: instrument.name,
    assetClass: instrument.assetClass,
    instrumentType: instrument.instrumentType,
    baseAsset: instrument.baseAsset,
    quoteAsset: instrument.quoteAsset,
    minimumQuantity: instrument.minimumQuantity.toString(),
    maximumLeverage: instrument.maximumLeverage.toString(),
    tradingStatus: instrument.tradingStatus,
    dataProvider: instrument.dataProvider,
    quote: quote ? {
      bid: quote.bid?.toString() ?? null,
      ask: quote.ask?.toString() ?? null,
      lastPrice: quote.lastPrice?.toString() ?? null,
      volume: quote.volume?.toString() ?? null,
      priceChange: quote.priceChange?.toString() ?? null,
      priceChangePct: quote.priceChangePct?.toString() ?? null,
      sourceTimestamp: quote.sourceTimestamp?.toISOString() ?? null,
      receivedAt: quote.receivedAt.toISOString(),
      ageMs,
       freshness: isFresh(quote, Date.now(), quoteMaxAgeMs) ? "LIVE" : "CACHED",
    } : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchValue = request.nextUrl.searchParams.get("search") ?? undefined;
    if (searchValue && searchValue.length > 50) return apiError("Search is limited to 50 characters.", 400, "INVALID_SEARCH");
    const search = z.string().trim().max(50).optional().parse(searchValue);
    const refresh = request.nextUrl.searchParams.get("refresh") !== "0";
    const { quoteMaxAgeMs, feeRate } = await getTradingConfig();
    let instruments = await getInstruments(search);
    if (refresh && instruments.length) {
      try {
        await refreshQuotes(instruments.map((instrument) => instrument.symbol));
        instruments = await getInstruments(search);
      } catch {
        // Return the last persisted quote and let the UI show its cached state.
      }
    }
    return apiSuccess({ instruments: instruments.map(instrument => serializeInstrument(instrument, quoteMaxAgeMs)), provider: [...new Set(instruments.map(instrument => instrument.dataProvider))].join(",") || "coinbase", feeRate });
  } catch (error) {
    return apiError(getErrorMessage(error), 500, "MARKET_DATA_ERROR");
  }
}
