export type MarketQuoteData = {
  symbol: string;
  bid: string;
  ask: string;
  lastPrice: string;
  volume?: string;
  priceChange?: string;
  priceChangePct?: string;
  sourceTimestamp: string;
  provider: string;
};

export type CandleData = {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  complete: boolean;
};

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<MarketQuoteData>;
  getQuotes(symbols: string[]): Promise<MarketQuoteData[]>;
  getCandles(symbol: string, granularity: number, limit: number): Promise<CandleData[]>;
}
