import { afterEach, describe, expect, it, vi } from "vitest";
import { submitPaperOrder } from "@/lib/order-client";

afterEach(() => vi.unstubAllGlobals());
describe("browser order retry identity", () => {
  it("reuses an unresolved order key but starts a new key after confirmed success", async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) });
    const bodies: Array<{ clientOrderId: string }> = [];
    let fail = true;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options: RequestInit) => {
      bodies.push(JSON.parse(options.body as string));
      if (fail) { fail = false; throw new Error("response lost after commit"); }
      return Response.json({ data: { order: { id: "same-order", status: "FILLED" } } });
    }));
    const input = { symbol: "BTC-USD", quantity: "1", side: "BUY" };
    await expect(submitPaperOrder(input)).rejects.toThrow("Connection interrupted");
    await submitPaperOrder(input);
    expect(bodies[1].clientOrderId).toBe(bodies[0].clientOrderId);
    await submitPaperOrder(input);
    expect(bodies[2].clientOrderId).not.toBe(bodies[1].clientOrderId);
  });
});
