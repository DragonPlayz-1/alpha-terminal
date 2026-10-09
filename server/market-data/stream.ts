import WebSocket from "ws";
import { getInstruments, persistQuote } from "./service";
import type { MarketQuoteData } from "./types";
import { D } from "@/server/trading/math";

type StreamHandle = { close: () => void };
type TickerMessage = { type?: string; product_id?: string; price?: string; best_bid?: string; best_ask?: string; volume_24h?: string; open_24h?: string; time?: string };

export async function startCoinbaseTickerStream(): Promise<StreamHandle | null> {
  const instruments = await getInstruments();
  const products = [...new Set(instruments.filter(i => i.dataProvider === "coinbase").map(i => i.providerSymbol))];
  if (!products.length) return null;
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let lastMessageAt = Date.now();
  const watchdog = setInterval(() => { if (!closed && Date.now() - lastMessageAt > 45000) socket?.terminate(); }, 15000);
  const pending = new Map<string, MarketQuoteData>();
  const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const flush = (quote: MarketQuoteData) => {
    pending.set(quote.symbol, quote);
    if (flushTimers.has(quote.symbol)) return;
    const timer = setTimeout(async () => {
      flushTimers.delete(quote.symbol);
      const next = pending.get(quote.symbol); pending.delete(quote.symbol);
      if (next && !closed) await persistQuote(next, "coinbase").catch(error => console.warn("[market-stream] persist failed", error));
    }, 1000);
    flushTimers.set(quote.symbol, timer);
  };
  const connect = () => {
    if (closed) return;
    socket = new WebSocket("wss://ws-feed.exchange.coinbase.com", { handshakeTimeout: 10000, maxPayload: 1024 * 1024 });
    lastMessageAt = Date.now();
    socket.on("open", () => { retry = 1000; socket?.send(JSON.stringify({ type: "subscribe", product_ids: products, channels: ["ticker"] })); console.log(`[market-stream] subscribed to ${products.length} Coinbase USD products`); });
    socket.on("message", data => {
      lastMessageAt = Date.now();
      try {
        const message = JSON.parse(data.toString()) as TickerMessage;
        if (message.type !== "ticker" || !message.product_id || !message.price || !message.best_bid || !message.best_ask || !message.time) return;
        const price = D(message.price), open = D(message.open_24h ?? message.price), change = price.minus(open);
        flush({ symbol: message.product_id, bid: message.best_bid, ask: message.best_ask, lastPrice: message.price, volume: message.volume_24h, priceChange: change.toString(), priceChangePct: open.gt(0) ? change.div(open).mul(100).toString() : "0", sourceTimestamp: message.time, provider: "Coinbase Exchange" });
      } catch { /* malformed provider events are ignored */ }
    });
    socket.on("error", () => socket?.close());
    socket.on("close", () => { if (closed) return; reconnectTimer = setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); });
  };
  connect();
  return { close: () => { closed = true; clearInterval(watchdog); if (reconnectTimer) clearTimeout(reconnectTimer); for (const timer of flushTimers.values()) clearTimeout(timer); socket?.terminate(); } };
}
