import { describe, expect, it } from "vitest";
import { orderSchema } from "@/server/trading/service";

describe("order input validation", () => {
  it("rejects a zero or malformed quantity", () => {
    expect(orderSchema.safeParse({ symbol: "BTC-USD", side: "BUY", orderType: "MARKET", quantity: "0", clientOrderId: "client-12345678" }).success).toBe(false);
    expect(orderSchema.safeParse({ symbol: "BTC-USD", side: "BUY", orderType: "MARKET", quantity: "1.123456789", clientOrderId: "client-12345678" }).success).toBe(false);
  });
  it("requires trigger and limit prices for conditional limit orders at the service boundary", () => {
    const parsed = orderSchema.safeParse({ symbol: "BTC-USD", side: "SELL", orderType: "STOP_LIMIT", quantity: "0.01", clientOrderId: "client-12345678" });
    expect(parsed.success).toBe(false);
    expect(orderSchema.safeParse({ symbol: "BTC-USD", side: "SELL", orderType: "STOP_LIMIT", quantity: "0.01", stopPrice: "100", limitPrice: "99", clientOrderId: "client-12345678" }).success).toBe(true);
  });
  it("rejects unknown keys to prevent unvalidated accounting controls", () => {
    expect(orderSchema.safeParse({ symbol: "BTC-USD", side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: "client-12345678", availableCash: "999999" }).success).toBe(false);
  });
});
