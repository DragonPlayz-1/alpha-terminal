import { describe, expect, it } from "vitest";
import { movingAverage, normalizeCandles } from "@/lib/chart-data";
import { withScope } from "@/lib/account-scope";

describe("chart and navigation boundaries", () => {
  it("sorts and deduplicates valid OHLC candles while rejecting impossible prices", () => {
    const candle = { time: 10, open: "10", high: "12", low: "9", close: "11", volume: "1" };
    expect(normalizeCandles([{ ...candle, time: 20 }, candle, { ...candle, close: "12" }, { ...candle, time: 30, high: "8" }, { ...candle, time: 40, low: "Infinity" }]).map(item => [item.time, item.close])).toEqual([[10, 12], [20, 11]]);
  });
  it("waits for a complete SMA/EMA window and seeds EMA with its initial SMA", () => {
    const candles = [2, 4, 6, 12, 10].map((close, time) => ({ time, close }));
    expect(movingAverage(candles, 3)).toEqual([{ time: 2, value: 4 }, { time: 3, value: 22 / 3 }, { time: 4, value: 28 / 3 }]);
    expect(movingAverage(candles, 3, true)).toEqual([{ time: 2, value: 4 }, { time: 3, value: 8 }, { time: 4, value: 9 }]);
  });
  it("preserves symbols and fragments without overriding an explicit account", () => {
    expect(withScope("/terminal?symbol=ETH-USD#ticket", "challenge")).toBe("/terminal?symbol=ETH-USD&scope=challenge#ticket");
    expect(withScope("/portfolio?scope=main", "challenge")).toBe("/portfolio?scope=main");
    expect(withScope("https://example.com", "challenge")).toBe("https://example.com");
  });
});
