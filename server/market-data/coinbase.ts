import type { CandleData, MarketDataProvider, MarketQuoteData } from "./types";
import { D } from "@/server/trading/math";

const BASE_URL = "https://api.exchange.coinbase.com";

type CoinbaseTicker = {
  trade_id: number;
  price: string;
  size: string;
  bid: string;
  ask: string;
  volume: string;
  time: string;
};

type CoinbaseStats = {
  open: string;
  high: string;
  low: string;
  volume: string;
};

let nextRequest = 0;
let blockedUntil = 0;
async function request<T>(path: string): Promise<T> {
  if (Date.now() < blockedUntil) throw new Error("Provider rate limit backoff active.");
  const start = Math.max(Date.now(), nextRequest); nextRequest = start + 180;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, start - Date.now())));
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "alpha-terminal/0.1" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 429) blockedUntil = Date.now() + Math.max(10, Number(response.headers.get("retry-after") ?? 10)) * 1000;
  if (!response.ok) throw new Error(`Coinbase market data returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function safeNumber(value: string | undefined, fallback = "0") {
  const n = Number(value);
  return Number.isFinite(n) ? value ?? fallback : fallback;
}

export class CoinbaseMarketDataProvider implements MarketDataProvider {
  readonly name = "Coinbase Exchange";

  async getQuote(symbol: string): Promise<MarketQuoteData> {
    const product = encodeURIComponent(symbol);
    const [ticker, stats] = await Promise.all([
      request<CoinbaseTicker>(`/products/${product}/ticker`),
      request<CoinbaseStats>(`/products/${product}/stats`),
    ]);

    const last = D(ticker.price);
    const open = D(stats.open);
    const change = last.minus(open);
    const changePct = open.gt(0) ? change.div(open).mul(100) : D(0);

    return {
      symbol,
      bid: safeNumber(ticker.bid, ticker.price),
      ask: safeNumber(ticker.ask, ticker.price),
      lastPrice: safeNumber(ticker.price),
      volume: safeNumber(stats.volume || ticker.volume),
      priceChange: change.toString(),
      priceChangePct: changePct.toString(),
      sourceTimestamp: ticker.time,
      provider: this.name,
    };
  }

  async getQuotes(symbols: string[]) {
    const results = await Promise.allSettled(symbols.map((symbol) => this.getQuote(symbol)));
    return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }

  async getCandles(symbol: string, granularity: number, limit: number): Promise<CandleData[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 300);
    const end = Math.floor(Date.now() / 1000);
    const start = end - granularity * safeLimit;
    const product = encodeURIComponent(symbol);
    const rows = await request<number[][]>(
      `/products/${product}/candles?granularity=${granularity}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`,
    );

    return rows
      .filter((row) => row.length >= 6 && row.slice(0, 6).every(value => Number.isFinite(Number(value))) && Number(row[1]) > 0 && Number(row[2]) > 0 && Number(row[3]) > 0 && Number(row[4]) > 0)
      .map((row) => ({
        time: row[0],
        low: String(row[1]),
        high: String(row[2]),
        open: String(row[3]),
        close: String(row[4]),
        volume: String(row[5] ?? 0),
        complete: row[0] + granularity < end,
      }))
      .sort((a, b) => a.time - b.time)
      .slice(-safeLimit);
  }
}
