import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { getInstruments, refreshQuotes } from "@/server/market-data/service";

export async function GET() {
  try {
    let instruments = await getInstruments();
    try { await refreshQuotes(instruments.map((instrument) => instrument.symbol)); } catch { /* cached movers are still useful */ }
    instruments = await getInstruments();
    const movers = instruments.map((instrument) => ({
      symbol: instrument.symbol,
      name: instrument.name,
      changePct: instrument.quote?.priceChangePct?.toString() ?? null,
      lastPrice: instrument.quote?.lastPrice?.toString() ?? null,
    })).filter((item) => item.changePct != null);
    return apiSuccess({ gainers: [...movers].sort((a, b) => Number(b.changePct) - Number(a.changePct)).slice(0, 5), losers: [...movers].sort((a, b) => Number(a.changePct) - Number(b.changePct)).slice(0, 5) });
  } catch (error) {
    return apiError(getErrorMessage(error), 500, "MARKET_DATA_ERROR");
  }
}
