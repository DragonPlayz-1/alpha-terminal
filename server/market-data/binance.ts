import type { CandleData, MarketDataProvider, MarketQuoteData } from "./types";
import { env } from "@/lib/env";

const BASE_URL = env.BINANCE_REST_URL;

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  volume: string;
  priceChange: string;
  priceChangePercent: string;
  closeTime: number;
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Binance market data returned ${response.status}.`);
  return response.json() as Promise<T>;
}

export class BinanceMarketDataProvider implements MarketDataProvider {
  readonly name = "Binance Public Market Data";

  async getQuote(symbol: string): Promise<MarketQuoteData> {
    const ticker = await request<BinanceTicker>(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
    return {
      symbol,
      bid: ticker.bidPrice,
      ask: ticker.askPrice,
      lastPrice: ticker.lastPrice,
      volume: ticker.volume,
      priceChange: ticker.priceChange,
      priceChangePct: ticker.priceChangePercent,
      sourceTimestamp: new Date(ticker.closeTime).toISOString(),
      provider: this.name,
    };
  }

  async getQuotes(symbols: string[]) {
    const results = await Promise.allSettled(symbols.map((symbol) => this.getQuote(symbol)));
    return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }

  async getCandles(symbol: string, granularity: number, limit: number): Promise<CandleData[]> {
    const intervals: Record<number, string> = { 60: "1m", 300: "5m", 900: "15m", 3600: "1h", 21600: "6h", 86400: "1d" };
    const interval = intervals[granularity] ?? "1h";
    const rows = await request<unknown[][]>(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${Math.min(limit, 1000)}`);
    const now = Date.now();
    return rows.filter((row) => row.length >= 6 && row.slice(0, 6).every(value => Number.isFinite(Number(value))) && Number(row[1]) > 0 && Number(row[2]) > 0 && Number(row[3]) > 0 && Number(row[4]) > 0).map((row) => ({
      time: Number(row[0]) / 1000,
      open: String(row[1]),
      high: String(row[2]),
      low: String(row[3]),
      close: String(row[4]),
      volume: String(row[5]),
      complete: Number(row[0]) + granularity * 1000 <= now,
    }));
  }
}
