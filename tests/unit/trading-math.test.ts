import { describe, expect, it } from "vitest";
import { D, averageCost, conditionalState, liquidationPrice, linearPnl, normalizedReturn } from "@/server/trading/math";

describe("precision trading math", () => {
  it("uses weighted-average cost for incremental spot buys", () => {
    expect(averageCost(D("2"), D("100"), D("1"), D("130")).toFixed(8)).toBe("110.00000000");
  });
  it("realizes the correct directional futures pnl", () => {
    expect(linearPnl(D("3"), D("100"), D("115"), "LONG").toFixed(8)).toBe("45.00000000");
    expect(linearPnl(D("3"), D("100"), D("85"), "SHORT").toFixed(8)).toBe("45.00000000");
  });
  it("normalizes returns against starting capital and external flows", () => {
    expect(normalizedReturn(D("1250"), D("1000"), D("100")).toFixed(4)).toBe("15.0000");
  });
  it("calculates isolated liquidation prices below long entry and above short entry", () => {
    expect(liquidationPrice(D("1"), D("100"), D("20"), "LONG").lt(100)).toBe(true);
    expect(liquidationPrice(D("1"), D("100"), D("20"), "SHORT").gt(100)).toBe(true);
  });
  it("does not fill a stop-limit until both trigger and limit conditions are satisfied", () => {
    const before = conditionalState("STOP_LIMIT", "SELL", D("101"), D("102"), D("98"), D("100"), false);
    const afterTrigger = conditionalState("STOP_LIMIT", "SELL", D("99"), D("100"), D("100"), D("100"), false);
    const fillable = conditionalState("STOP_LIMIT", "SELL", D("100"), D("101"), D("100"), D("100"), true);
    expect(before.triggered).toBe(false);
    expect(afterTrigger.triggered).toBe(true);
    expect(afterTrigger.executable).toBe(false);
    expect(fillable.executable).toBe(true);
  });
});
