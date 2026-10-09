import { env } from "@/lib/env";
import { BinanceMarketDataProvider } from "./binance";
import { CoinbaseMarketDataProvider } from "./coinbase";
import type { MarketDataProvider } from "./types";

let provider: MarketDataProvider | undefined;

export function getMarketDataProvider(): MarketDataProvider {
  if (!provider) {
    provider = env.MARKET_PROVIDER === "binance"
      ? new BinanceMarketDataProvider()
      : new CoinbaseMarketDataProvider();
  }
  return provider;
}
