import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createOrder, cancelOrder, previewOrder, type OrderInput } from "@/server/trading/service";
import { reconcile } from "@/server/trading/ledger";
import { trader, market, quote, clientOrderId } from "../fixtures";

afterEach(() => vi.unstubAllGlobals());
describe("authoritative order preview", () => {
  it("previews every spot order type on both sides without writing reservations", async () => {
    const { user, account } = await trader(); const instrument = await market();
    await createOrder(user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "20", clientOrderId: clientOrderId() });
    for (const side of ["BUY", "SELL"] as const) for (const orderType of ["MARKET", "LIMIT", "STOP_MARKET", "STOP_LIMIT", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"] as const) {
      const stop = orderType.startsWith("TAKE") ? side === "BUY" ? "90" : "110" : side === "BUY" ? "110" : "90";
      const input: OrderInput = { symbol: instrument.symbol, side, orderType, quantity: "1", clientOrderId: clientOrderId(), ...(orderType.includes("LIMIT") ? { limitPrice: side === "BUY" ? "90" : "110" } : {}), ...(!["MARKET", "LIMIT"].includes(orderType) ? { stopPrice: stop } : {}) };
      const before = await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } });
      const count = await db.order.count({ where: { accountId: account.id } });
      const preview = await previewOrder(user.id, input);
      expect(await db.order.count({ where: { accountId: account.id } })).toBe(count);
      expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).reservedCash.toString()).toBe(before.reservedCash.toString());
      const order = await createOrder(user.id, input);
      if (order.status === "OPEN") { expect(order.reservedAmount.toString()).toBe(preview.reservedAmount); expect(order.reservedQuantity.toString()).toBe(preview.reservedQuantity); await cancelOrder(user.id, order.id); }
      else expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).availableCash.toString()).toBe(preview.availableCashAfter);
      expect(await reconcile(account.id)).toMatchObject({ ok: true });
    }
  });
  it("matches long and short opening/closing margin and rejects stale quotes", async () => {
    const { user, account } = await trader(); const instrument = await market(true, "100", "101");
    for (const positionSide of ["LONG", "SHORT"] as const) {
      const opening: OrderInput = { symbol: instrument.symbol, side: positionSide === "LONG" ? "BUY" : "SELL", positionSide, leverage: 5, orderType: "MARKET", quantity: "2", clientOrderId: clientOrderId() };
      const preview = await previewOrder(user.id, opening);
      await createOrder(user.id, opening);
      expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).availableCash.toString()).toBe(preview.availableCashAfter);
      const closing = { ...opening, side: positionSide === "LONG" ? "SELL" as const : "BUY" as const, reduceOnly: true, clientOrderId: clientOrderId() };
      const closePreview = await previewOrder(user.id, closing);
      await createOrder(user.id, closing);
      expect((await db.tradingAccount.findUniqueOrThrow({ where: { id: account.id } })).availableCash.toString()).toBe(closePreview.availableCashAfter);
      expect(await reconcile(account.id)).toMatchObject({ ok: true });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await quote(instrument.id, "100", "101", new Date(Date.now() - 600000));
    const input = { symbol: instrument.symbol, side: "BUY" as const, orderType: "MARKET" as const, quantity: "1", clientOrderId: clientOrderId() };
    await expect(previewOrder(user.id, input)).rejects.toThrow("stale");
    await expect(createOrder(user.id, input)).rejects.toThrow("stale");
  });
});
