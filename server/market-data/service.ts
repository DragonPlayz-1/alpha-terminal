import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomUUID } from "node:crypto";
import type { MarketQuote } from "@prisma/client";
import { D, fixed } from "@/server/trading/math";
import { CoinbaseMarketDataProvider } from "./coinbase";
import { BinanceMarketDataProvider } from "./binance";
import type { MarketQuoteData } from "./types";
import { ensureDefaultInstruments } from "@/server/auth/account";
import { getTradingConfig } from "@/server/config";

const coinbase = new CoinbaseMarketDataProvider();
const binance = new BinanceMarketDataProvider();
function providerFor(name: string) {
  if (name === "coinbase") return coinbase;
  if (name === "binance") return binance;
  return null;
}
let registryReady = false;
export const quoteMaxAge = () => env.QUOTE_MAX_AGE_MS;
export function isFresh(quote: Pick<MarketQuote, "sourceTimestamp" | "receivedAt" | "mode">, now = Date.now(), maxAgeMs = quoteMaxAge()) {
  return Number.isFinite(maxAgeMs) && maxAgeMs > 0 && quote.mode === "LIVE" && !!quote.sourceTimestamp && now - quote.sourceTimestamp.getTime() <= maxAgeMs && quote.sourceTimestamp.getTime() <= now + 5000 && now - quote.receivedAt.getTime() <= maxAgeMs && quote.receivedAt.getTime() <= now + 5000;
}
export async function getInstruments(search?: string) {
  if (!registryReady) { await ensureDefaultInstruments(); registryReady = true; }
  const normalizedSearch = search?.trim().slice(0, 50);
  const rows = await db.instrument.findMany({ where: normalizedSearch ? { OR: [{ symbol: { contains: normalizedSearch.toUpperCase() } }, { name: { contains: normalizedSearch, mode: "insensitive" } }] } : undefined, include: { quote: true } });
  const order = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "DOT"];
  return rows.sort((a, b) => Number(a.instrumentType !== "SPOT") - Number(b.instrumentType !== "SPOT") || order.indexOf(a.baseAsset) - order.indexOf(b.baseAsset));
}

export async function persistQuote(quote: MarketQuoteData, provider = "coinbase") {
  const timestamp = new Date(quote.sourceTimestamp);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() > Date.now() + 5000) return;
  let bid, ask, last;
  try { bid = D(quote.bid); ask = D(quote.ask); last = D(quote.lastPrice); } catch { return; }
  if (!bid.isFinite() || !ask.isFinite() || !last.isFinite() || bid.lte(0) || ask.lt(bid) || last.lte(0) || ask.gt("1000000000") || last.gt("1000000000")) return;
  const optionalDecimal = (value: string | undefined, nonnegative = false) => {
    if (value === undefined) return null;
    try { const d = D(value); return d.isFinite() && d.abs().lt("1000000000") && (!nonnegative || d.gte(0)) ? fixed(d) : null; } catch { return null; }
  };
  const instruments = await db.instrument.findMany({ where: { providerSymbol: quote.symbol, dataProvider: provider } });
  for (const i of instruments) {
    const mark = fixed(i.instrumentType === "SPOT" ? last : bid.plus(ask).div(2));
    // Atomic timestamp compare prevents REST and WebSocket writers (including
    // other replicas) from replacing a newer quote with a late event.
    await db.$executeRaw`
      INSERT INTO "MarketQuote" (id, "instrumentId", bid, ask, "lastPrice", "markPrice", volume, "priceChange", "priceChangePct", mode, "sourceTimestamp", "receivedAt")
      VALUES (${randomUUID()}, ${i.id}, ${fixed(bid)}::numeric, ${fixed(ask)}::numeric, ${fixed(last)}::numeric, ${mark}::numeric,
        ${optionalDecimal(quote.volume, true)}::numeric, ${optionalDecimal(quote.priceChange)}::numeric, ${optionalDecimal(quote.priceChangePct)}::numeric, 'LIVE', ${timestamp}, NOW())
      ON CONFLICT ("instrumentId") DO UPDATE SET bid = EXCLUDED.bid, ask = EXCLUDED.ask, "lastPrice" = EXCLUDED."lastPrice", "markPrice" = EXCLUDED."markPrice",
        volume = COALESCE(EXCLUDED.volume, "MarketQuote".volume), "priceChange" = COALESCE(EXCLUDED."priceChange", "MarketQuote"."priceChange"), "priceChangePct" = COALESCE(EXCLUDED."priceChangePct", "MarketQuote"."priceChangePct"),
        mode = EXCLUDED.mode, "sourceTimestamp" = EXCLUDED."sourceTimestamp", "receivedAt" = EXCLUDED."receivedAt"
      WHERE "MarketQuote"."sourceTimestamp" IS NULL OR "MarketQuote"."sourceTimestamp" < EXCLUDED."sourceTimestamp"`;
  }
}

const refreshing = new Map<string, Promise<void>>();
const lastRefresh = new Map<string, number>();
export async function refreshQuotes(symbols: string[]) {
    const { quoteMaxAgeMs } = await getTradingConfig();
    const instruments = await db.instrument.findMany({ where: { symbol: { in: symbols } }, include: { quote: true } });
    const seen = new Set<string>();
    for (const instrument of instruments) {
      const key = `${instrument.dataProvider}:${instrument.providerSymbol}`;
      if (seen.has(key) || instrument.quote && isFresh(instrument.quote, Date.now(), quoteMaxAgeMs)) continue;
      seen.add(key);
      if (refreshing.has(key)) { await refreshing.get(key); continue; }
      if (Date.now() - (lastRefresh.get(key) ?? 0) < 2000) continue;
      lastRefresh.set(key, Date.now());
      const task = (async () => {
        try {
          const provider = providerFor(instrument.dataProvider);
          if (!provider) { console.warn(JSON.stringify({ event: "unsupported_market_data_provider", provider: instrument.dataProvider, symbol: instrument.symbol })); return; }
          const quote = await provider.getQuote(instrument.providerSymbol); await persistQuote(quote, instrument.dataProvider);
        }
        catch (error) { console.warn(JSON.stringify({ event: "provider_unavailable", symbol: instrument.symbol, message: error instanceof Error ? error.message : "unknown" })); }
      })().finally(() => refreshing.delete(key));
      refreshing.set(key, task);
      await task;
    }
}
export async function getQuote(symbol: string, refresh = true) {
  const { quoteMaxAgeMs } = await getTradingConfig();
  const instrument = await db.instrument.findUnique({ where: { symbol }, include: { quote: true } });
  if (!instrument) throw new Error("Instrument not found.");
  if (refresh && (!instrument.quote || !isFresh(instrument.quote, Date.now(), quoteMaxAgeMs))) await refreshQuotes([symbol]);
  const quote = await db.marketQuote.findUnique({ where: { instrumentId: instrument.id } });
  return { instrument, quote, fresh: !!quote && isFresh(quote, Date.now(), quoteMaxAgeMs), ageMs: quote?.sourceTimestamp ? Date.now() - quote.sourceTimestamp.getTime() : null };
}

const granularities: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400 };
const candleRequests = new Map<string, Promise<Awaited<ReturnType<typeof loadCandles>>>>();
const candleFetched = new Map<string, number>();
async function loadCandles(symbol: string, timeframe: string, limit: number) {
  const instrument = await db.instrument.findUniqueOrThrow({ where: { symbol } });
  const key = `${symbol}:${timeframe}`;
  const granularity = granularities[timeframe];
  if (!granularity) throw new Error("Unsupported timeframe. Supported: 1m, 5m, 15m, 1h, 6h, 1d.");
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 300);
  let cached = Date.now() - (candleFetched.get(key) ?? 0) < 60000;
  if (!cached) {
    try {
      const provider = providerFor(instrument.dataProvider);
      if (!provider) throw new Error("Unsupported market-data provider.");
      const candles = await provider.getCandles(instrument.providerSymbol, granularity, 300);
      const unique = new Map(candles.map(c => [c.time, c]));
      await db.$transaction([...unique.values()].map(c => db.marketCandle.upsert({
        where: { instrumentId_timeframe_openTime: { instrumentId: instrument.id, timeframe, openTime: new Date(c.time * 1000) } },
        create: { instrumentId: instrument.id, timeframe, openTime: new Date(c.time * 1000), closeTime: new Date((c.time + granularity) * 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, isComplete: c.complete },
        update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, isComplete: c.complete },
      })));
      candleFetched.set(key, Date.now());
    } catch { cached = true; }
  }
  const stored = await db.marketCandle.findMany({ where: { instrumentId: instrument.id, timeframe }, orderBy: { openTime: "desc" }, take: safeLimit });
  return stored.reverse().map(c => ({ time: c.openTime.getTime() / 1000, open: c.open.toString(), high: c.high.toString(), low: c.low.toString(), close: c.close.toString(), volume: c.volume.toString(), complete: c.isComplete, cached }));
}
export async function getCandles(symbol: string, timeframe = "1h", limit = 160) {
  if (!Number.isFinite(limit) || limit < 1 || !Number.isInteger(limit)) throw new Error("Invalid candle limit.");
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 300);
  const key = `${symbol}:${timeframe}:${safeLimit}`;
  if (!candleRequests.has(key)) candleRequests.set(key, loadCandles(symbol, timeframe, safeLimit).finally(() => candleRequests.delete(key)));
  return candleRequests.get(key)!;
}
