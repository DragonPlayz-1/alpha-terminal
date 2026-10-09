import { describe, expect, it } from "vitest";
import { MarketDataMode } from "@prisma/client";
import { isFresh } from "@/server/market-data/service";

describe("market quote freshness", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");

  it("accepts a live quote only while source and receive timestamps are current", () => {
    const quote = {
      mode: MarketDataMode.LIVE,
      sourceTimestamp: new Date(now - 1000),
      receivedAt: new Date(now - 500),
    };
    expect(isFresh(quote, now, 5000)).toBe(true);
    expect(isFresh(quote, now + 5001, 5000)).toBe(false);
  });

  it("rejects cached, future, and delayed-receipt quotes", () => {
    expect(isFresh({ mode: MarketDataMode.UNAVAILABLE, sourceTimestamp: new Date(now), receivedAt: new Date(now) }, now, 5000)).toBe(false);
    expect(isFresh({ mode: MarketDataMode.LIVE, sourceTimestamp: new Date(now + 6000), receivedAt: new Date(now) }, now, 5000)).toBe(false);
    expect(isFresh({ mode: MarketDataMode.LIVE, sourceTimestamp: new Date(now), receivedAt: new Date(now + 6000) }, now, 5000)).toBe(false);
  });
});
