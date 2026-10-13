import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";
import { GET as preferences, PATCH as savePreferences } from "@/app/api/user/preferences/route";
import { GET as journal, POST as createEntry } from "@/app/api/journal/route";
import { PATCH as updateEntry, DELETE as deleteEntry } from "@/app/api/journal/[id]/route";
import { POST as createList } from "@/app/api/watchlists/route";
import { PATCH as updateList, DELETE as deleteList } from "@/app/api/watchlists/[id]/route";
import { POST as addItem } from "@/app/api/watchlists/[id]/items/route";
import { trader, market, clientOrderId } from "../fixtures";
import { createOrder } from "@/server/trading/service";
import { GET as exportData } from "@/app/api/exports/route";

vi.mock("@/server/auth/session", () => ({ requireApiUser: vi.fn() }));
const auth = vi.mocked(requireApiUser);
const req = (path: string, method = "GET", data?: unknown) => new NextRequest(`http://localhost${path}`, { method, ...(data ? { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } } : {}) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
afterEach(() => vi.resetAllMocks());

describe("owned product APIs", () => {
  it("merges concurrent chart and notification patches without losing saved fields", async () => {
    const { user } = await trader(); auth.mockResolvedValue({ ...user, preferences: null, tradingAccounts: [] });
    const responses = await Promise.all([
      savePreferences(req("/api/user/preferences", "PATCH", { chartPreferences: { timeframe: "6h", volume: false } })),
      savePreferences(req("/api/user/preferences", "PATCH", { chartPreferences: { type: "area", crosshair: false } })),
      savePreferences(req("/api/user/preferences", "PATCH", { notificationPreferences: { orderFilled: false } })),
      savePreferences(req("/api/user/preferences", "PATCH", { notificationPreferences: { priceAlert: false } })),
    ]);
    expect(responses.every(response => response.status === 200)).toBe(true);
    const body = await (await preferences()).json();
    expect(body.data.preferences.chartPreferences).toMatchObject({ timeframe: "6h", type: "area", volume: false, crosshair: false });
    expect(body.data.preferences.notificationPreferences).toMatchObject({ orderFilled: false, priceAlert: false });
    expect((await savePreferences(req("/api/user/preferences", "PATCH", { chartPreferences: { indicator: "not-supported" } }))).status).toBe(400);
  });

  it("protects journal links and mutations across users and keeps closed account notes readable", async () => {
    const first = await trader(), other = await trader(), instrument = await market();
    const order = await createOrder(first.user.id, { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: clientOrderId() });
    auth.mockResolvedValue({ ...first.user, preferences: null, tradingAccounts: [] });
    const created = await createEntry(req("/api/journal", "POST", { notes: "Entry reasoning", orderId: order.id, tags: ["setup", "setup"] }));
    expect(created.status).toBe(201);
    const entry = (await created.json()).data.entry;
    expect(entry.tags).toEqual(["setup"]);
    auth.mockResolvedValue({ ...other.user, preferences: null, tradingAccounts: [] });
    expect((await createEntry(req("/api/journal", "POST", { notes: "Wrong owner", orderId: order.id }))).status).toBe(404);
    expect((await updateEntry(req("/api/journal", "PATCH", { notes: "Overwrite" }), ctx(entry.id))).status).toBe(404);
    expect((await deleteEntry(req("/api/journal", "DELETE"), ctx(entry.id))).status).toBe(404);
    expect((await (await journal(req("/api/journal"))).json()).data.entries).toEqual([]);
    auth.mockResolvedValue({ ...first.user, preferences: null, tradingAccounts: [] });
    await db.tradingAccount.update({ where: { id: first.account.id }, data: { accountStatus: "CLOSED" } });
    expect((await (await journal(req("/api/journal"))).json()).data.entries[0].id).toBe(entry.id);
    expect((await updateEntry(req("/api/journal", "PATCH", { outcome: "WIN" }), ctx(entry.id))).status).toBe(200);
    const updated = await db.tradeJournalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.tags).toEqual(["setup"]);
  });

  it("serializes default list changes and validates reorder ownership", async () => {
    const { user } = await trader(); auth.mockResolvedValue({ ...user, preferences: null, tradingAccounts: [] });
    const a = (await (await createList(req("/api/watchlists", "POST", { name: "A" }))).json()).data.watchlist;
    const b = (await (await createList(req("/api/watchlists", "POST", { name: "B" }))).json()).data.watchlist;
    const defaults = await Promise.all([updateList(req("/api/watchlists", "PATCH", { isDefault: true }), ctx(a.id)), updateList(req("/api/watchlists", "PATCH", { isDefault: true }), ctx(b.id))]);
    expect(defaults.map(response => response.status)).toEqual([200, 200]);
    expect(await db.watchlist.count({ where: { userId: user.id, isDefault: true } })).toBe(1);
    const instrument = await market();
    const responses = await Promise.all([addItem(req("/api/watchlists", "POST", { symbol: instrument.symbol }), ctx(a.id)), addItem(req("/api/watchlists", "POST", { symbol: instrument.symbol }), ctx(a.id))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    const item = (await responses[0].json()).data.item;
    expect((await updateList(req("/api/watchlists", "PATCH", { itemOrder: [{ id: item.id, sortOrder: 0 }] }), ctx(b.id))).status).toBe(400);
    const active = await db.watchlist.findFirstOrThrow({ where: { userId: user.id, isDefault: true } });
    expect((await deleteList(req("/api/watchlists", "DELETE"), ctx(active.id))).status).toBe(200);
    expect(await db.watchlist.count({ where: { userId: user.id, isDefault: true } })).toBe(1);
  });

  it("exports beyond one page while keeping scope ownership and CSV escaping", async () => {
    const { user, account } = await trader();
    auth.mockResolvedValue({ ...user, preferences: null, tradingAccounts: [] });
    await db.portfolioSnapshot.createMany({ data: Array.from({ length: 501 }, () => ({ accountId: account.id, equity: "10000", cashBalance: "10000", reservedCash: "0", spotValue: "0", realizedPnl: "0", unrealizedPnl: "0" })) });
    const exported = await exportData(req("/api/exports?dataset=snapshots"));
    expect(exported.headers.get("Content-Type")).toContain("text/csv");
    expect((await exported.text()).trim().split("\r\n")).toHaveLength(503);
    expect((await exportData(req("/api/exports?dataset=snapshots&scope=unowned"))).status).toBe(404);
    await createEntry(req("/api/journal", "POST", { title: "=HYPERLINK(\"example\")", notes: "A note, with \"quotes\"" }));
    const text = await (await exportData(req("/api/exports?dataset=journal"))).text();
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain('"A note, with ""quotes"""');
  });
});
