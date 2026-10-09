import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { db } from "@/lib/db";
import { market, quote } from "../fixtures";
import { reconcile } from "@/server/trading/ledger";

const origin = "http://127.0.0.1:3100";
test.afterAll(() => db.$disconnect());

test("production API: sessions, orders, isolation, validation and privacy", async ({ request }) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const credentials = { username: `api_${suffix}`, email: `${suffix}@example.test`, password: "api-test-password-2026", initialCapital: 10000 };
  const registered = await request.post("/api/auth/register", { headers: { Origin: origin }, data: credentials });
  expect(registered.status()).toBe(201);
  const cookie = registered.headers()["set-cookie"];
  expect(cookie).toContain("__Host-alpha_terminal_session=");
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax");
  const { data: { user } } = await registered.json();
  expect((await request.get("/api/auth/me")).status()).toBe(200);
  expect((await request.get("/api/admin/config")).status()).toBe(403);
  const instrument = await market();
  const input = { symbol: instrument.symbol, side: "BUY", orderType: "MARKET", quantity: "1", clientOrderId: randomUUID() };
  const responses = await Promise.all(Array.from({ length: 4 }, () => request.post("/api/orders", { headers: { Origin: origin }, data: input })));
  for (const response of responses) expect(response.status(), await response.text()).toBe(201);
  const orders = await Promise.all(responses.map(async r => (await r.json()).data.order));
  expect(new Set(orders.map(o => o.id)).size).toBe(1);
  expect(orders[0].executions).toHaveLength(1);
  expect((await request.post("/api/orders", { headers: { Origin: origin }, data: { ...input, quantity: "2" } })).status()).toBe(409);
  const limitResponse = await request.post("/api/orders", { headers: { Origin: origin }, data: { ...input, orderType: "LIMIT", quantity: "2", limitPrice: "90", clientOrderId: randomUUID() } });
  expect(limitResponse.status()).toBe(201);
  const limit = (await limitResponse.json()).data.order;
  expect(limit.reservedAmount).toBe("180.18");
  expect((await request.delete(`/api/orders/${limit.id}`, { headers: { Origin: origin } })).status()).toBe(200);
  expect((await request.delete(`/api/orders/${limit.id}`, { headers: { Origin: origin } })).status()).toBe(200);

  const secondCredentials = { ...credentials, username: `other_${suffix}`, email: `other_${suffix}@example.test` };
  const otherContext = await playwrightRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  try {
    expect((await otherContext.post("/api/auth/register", { data: secondCredentials })).status()).toBe(201);
    expect((await otherContext.get(`/api/orders/${orders[0].id}`)).status()).toBe(404);
    expect((await otherContext.delete(`/api/orders/${limit.id}`)).status()).toBe(400);
  } finally { await otherContext.dispose(); }
  const profile = (await (await request.get(`/api/users/${credentials.username}/public-profile`)).json()).data.profile;
  expect(profile).not.toHaveProperty("returnPercentage");
  expect(profile).not.toHaveProperty("tradeCount");
  const account = await db.tradingAccount.findUniqueOrThrow({ where: { userId_scope: { userId: user.id, scope: "main" } } });
  expect(await reconcile(account.id)).toMatchObject({ ok: true });
  expect((await request.get(`/api/markets/${instrument.symbol}/candles?limit=-1`)).status()).toBe(400);
  expect((await request.get("/api/portfolio?scope=not-owned")).status()).toBeLessThan(500);
  expect((await request.post("/api/auth/logout", { headers: { Origin: "https://untrusted.example" } })).status()).toBe(403);
  expect((await request.post("/api/auth/logout", { headers: { Origin: origin } })).status()).toBe(200);
  expect((await request.get("/api/auth/me")).status()).toBe(401);
  expect((await request.post("/api/auth/login", { data: { email: credentials.email, password: credentials.password } })).status()).toBe(200);
  await quote(instrument.id, "120", "121");
  const sold = await request.post("/api/orders", { data: { ...input, side: "SELL", clientOrderId: randomUUID() } });
  expect(sold.status()).toBe(201);
  expect((await sold.json()).data.order.executions[0].realizedPnl).toBe("19");
  expect(await reconcile(account.id)).toMatchObject({ ok: true });
});

test("production proxy rejects large chunked bodies without corrupting normal JSON", async ({ request }) => {
  const regular = await request.post("/api/auth/login", { data: { email: "nobody@example.test", password: "wrong-password" } });
  expect(regular.status()).toBe(401);
  expect((await regular.json()).error.code).toBe("INVALID_CREDENTIALS");
  const oversized = await request.post("/api/auth/login", { headers: { "Content-Type": "application/json" }, data: JSON.stringify({ junk: "x".repeat(40000) }) });
  expect(oversized.status()).toBe(413);
  const status = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked", Origin: origin } }, res => { res.resume(); resolve(res.statusCode!); });
    req.setTimeout(10000, () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);
    req.write('{"junk":"');
    for (let n = 0; n < 40; n++) req.write("x".repeat(1024));
    req.end('"}');
  });
  expect(status).toBe(413);
});
