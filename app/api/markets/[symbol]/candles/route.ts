import { NextRequest } from "next/server";
import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { getCandles } from "@/server/market-data/service";
import { z } from "zod";

const querySchema = z.object({
  timeframe: z.enum(["1m", "5m", "15m", "1h", "6h", "1d"]).default("1h"),
  limit: z.coerce.number().int().min(1).max(300).default(120),
}).strict();

export async function GET(request: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol: rawSymbol } = await context.params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) return apiError("Invalid candle query. Use a supported timeframe and a limit from 1 to 300.", 400, "INVALID_CANDLE_QUERY");
    const { timeframe, limit } = parsed.data;
    const candles = await getCandles(symbol, timeframe, limit);
    return apiSuccess({ symbol, timeframe, candles });
  } catch (error) {
    return apiError(getErrorMessage(error), 404, "CANDLE_DATA_ERROR");
  }
}
