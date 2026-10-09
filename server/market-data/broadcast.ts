import { db } from "@/lib/db";
import { getTradingConfig } from "@/server/config";
import { isFresh } from "./service";

type Subscriber = { userId: string; symbols: string[]; send: (event: string, data: unknown) => void };
const subscribers = new Set<Subscriber>();
let polling = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function poll() {
  if (polling || subscribers.size === 0) return;
  polling = true;
  try {
    const symbols = [...new Set([...subscribers].flatMap(s => s.symbols))];
    const [rows, settings] = await Promise.all([
      db.marketQuote.findMany({ where: { instrument: { symbol: { in: symbols } } }, include: { instrument: { select: { symbol: true } } } }),
      getTradingConfig(),
    ]);
    const data = rows.map(row => ({ symbol: row.instrument.symbol, bid: row.bid?.toString() ?? null, ask: row.ask?.toString() ?? null, lastPrice: row.lastPrice?.toString() ?? null, volume: row.volume?.toString() ?? null, priceChangePct: row.priceChangePct?.toString() ?? null, freshness: isFresh(row, Date.now(), settings.quoteMaxAgeMs) ? "LIVE" : "CACHED", receivedAt: row.receivedAt.toISOString(), sourceTimestamp: row.sourceTimestamp?.toISOString() ?? null }));
    for (const subscriber of subscribers) subscriber.send("quotes", data.filter(row => subscriber.symbols.includes(row.symbol)));
  } catch {
    for (const subscriber of subscribers) subscriber.send("status", { status: "degraded" });
  } finally {
    polling = false;
    if (subscribers.size) timer = setTimeout(() => void poll(), 2000);
  }
}

export function subscribeQuotes(subscriber: Subscriber) {
  if (subscribers.size >= 500 || [...subscribers].filter(s => s.userId === subscriber.userId).length >= 5) throw new Error("Too many quote streams.");
  subscribers.add(subscriber);
  if (!polling && !timer) void poll();
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size && timer) { clearTimeout(timer); timer = undefined; }
  };
}
