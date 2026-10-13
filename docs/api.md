# API reference

[Back to README](../README.md)

This is the application HTTP API for v0.2.0. Route implementations in `app/api/` and Zod schemas are the source of truth. The API uses cookie sessions, not GitHub tokens or exchange API keys.

## Conventions

- Requests and ordinary responses use JSON. Mutations must pass same-origin validation; cookie-authenticated command-line clients should send the canonical `Origin` explicitly.
- Success responses use `{ "data": ... }`. Errors use `{ "error": { "code": "...", "message": "..." } }`.
- Financial values are serialized as decimal strings. Submit quantity/prices as decimal strings, not binary floating-point values.
- Dates are ISO-8601 strings. Account-scoped reads use `?scope=main` or an owned challenge ID. Creation bodies specify `scope`; omitted scope defaults to `main`.
- Session ownership is enforced separately from the scope value. Knowing another account/order ID does not grant access.
- CSV exports and SSE have their own response formats. Ordinary API responses use `Cache-Control: no-store`.
- Rate-limited endpoints return `429`; honor `Retry-After` when provided. Do not retry a changed order under the same idempotency key.

## Route directory

### Identity and account controls

| Method | Route | Access / purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Public; create a user and virtual main account. |
| POST | `/api/auth/login` | Public; establish a cookie session. |
| POST | `/api/auth/logout` | Clear the current session. |
| GET | `/api/auth/me` | Session identity. |
| GET, DELETE | `/api/auth/sessions` | Authenticated; list/revoke owned sessions. |
| POST | `/api/auth/password` | Authenticated; change password and revoke other sessions. |
| POST | `/api/auth/forgot-password` | Request a recovery email. |
| POST | `/api/auth/send-verification` | Request a verification email. |
| POST | `/api/auth/reset-password` | Consume a reset token. |
| POST | `/api/auth/verify-email` | Consume a verification token. |
| GET | `/api/accounts` | Authenticated; owned account scopes and challenge metadata. |
| GET, PATCH | `/api/user/profile` | Authenticated; profile/privacy settings. |
| GET, PATCH | `/api/user/preferences` | Authenticated; chart and notification preferences. |

Registration accepts `username`, `email`, `password`, and `initialCapital`. Passwords require at least 10 characters and at most 72 UTF-8 bytes. Starting capital must be between 100 and 1,000,000. Recovery tokens are hashed, single-use, and time-limited.

Session revocation accepts `{ "id": "SESSION_ID" }` or `{ "revokeOthers": true }`. Password changes accept `currentPassword`, `newPassword`, and `confirmation`.

### Markets and trading

| Method | Route | Access / purpose |
| --- | --- | --- |
| GET | `/api/markets` | Public instruments/quotes; `search` and `refresh=0` supported. |
| GET | `/api/markets/movers` | Public market movers. |
| GET | `/api/markets/[symbol]` | Public instrument quote/details. |
| GET | `/api/markets/[symbol]/candles` | Public OHLC data; `timeframe` and `limit`. |
| GET | `/api/stream/quotes` | Authenticated SSE; comma-separated `symbols`, at most 30. |
| GET, POST | `/api/orders` | Authenticated; scoped order list/create. |
| POST | `/api/orders/preview` | Authenticated authoritative preview without reservation/order writes. |
| GET, DELETE | `/api/orders/[id]` | Authenticated scoped detail/cancellation. |
| GET | `/api/portfolio` | Authenticated account valuation. |
| GET | `/api/portfolio/history` | Authenticated persisted snapshots, at most 500. |
| GET | `/api/portfolio/analytics` | Authenticated metrics; `period=1d`, `7d`, `30d`, or `all`. |
| GET | `/api/positions` | Authenticated scoped positions. |
| GET | `/api/futures` | Authenticated derivative instruments, scoped positions, and margin. |

Orders support a `status` filter. `OPEN` includes pending and partially filled orders; `all` includes all statuses. Detail responses include executions, append-only events, linked exits, instrument type, and account scope.

### Journal, watchlists, alerts, and competition

| Method | Route | Purpose (authenticated unless stated) |
| --- | --- | --- |
| GET, POST | `/api/journal` | Scoped journal list/create; latest 500 entries in the list. |
| PATCH, DELETE | `/api/journal/[id]` | Edit/delete an owned scoped entry. |
| GET, POST | `/api/watchlists` | List/create named watchlists. |
| PATCH, DELETE | `/api/watchlists/[id]` | Rename, set default, reorder, or delete. |
| POST, DELETE | `/api/watchlists/[id]/items` | Add by symbol; remove by `itemId` or `symbol`. |
| GET, POST | `/api/alerts` | List/create price alerts. |
| DELETE | `/api/alerts/[id]` | Delete an owned alert. |
| GET, PATCH | `/api/notifications` | Latest 100 notifications and total unread count; mark read. |
| GET | `/api/challenges` | Public challenge directory; includes participation context when signed in. |
| POST | `/api/challenges/[id]/join` | Join a challenge with an isolated account. |
| GET | `/api/challenges/[id]/leaderboard` | Public challenge standings. |
| GET | `/api/leaderboards` | Privacy-filtered public standings. |
| GET | `/api/users/[username]/public-profile` | Privacy-filtered public profile. |
| GET | `/api/exports` | Scoped execution, snapshot, or journal CSV. |

Watchlists allow at most 30 lists/user and 200 items/list. Adding an existing item is idempotent (`200`); a new item returns `201`. The first list becomes default, and deleting the default promotes another list. A reorder must contain every owned item exactly once with unique valid positions.

### Operations

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Public application/database liveness. |
| GET | `/api/ready` | Public database and worker readiness. |
| GET | `/api/admin/health` | Administrator operational overview. |
| GET | `/api/admin/reconcile` | Administrator account reconciliation. |
| GET, PATCH | `/api/admin/config` | Administrator validated runtime trading settings. |
| GET, PATCH | `/api/admin/instruments` | Administrator instrument configuration. |

## Preview and submit an order

From the same-origin authenticated browser, a spot preview can be requested as follows:

```javascript
const intent = {
  scope: "main",
  symbol: "BTC-USD",
  side: "BUY",
  orderType: "LIMIT",
  quantity: "0.01",
  limitPrice: "80000",
  timeInForce: "GTC",
};

const response = await fetch("/api/orders/preview", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(intent),
});
const body = await response.json();
if (!response.ok) throw new Error(body.error.message);
console.log(body.data.preview);
```

To submit intentionally, send the same payload to `POST /api/orders` with a newly generated `clientOrderId`. Retain that ID for retries of **the same intent**. A successful creation/retry returns `201` and `data.order`; a changed fingerprint under the same ID is rejected.

### Order fields

| Field | Rules |
| --- | --- |
| `symbol`, `side` | Supported uppercase symbol; `BUY` or `SELL`. |
| `orderType` | `MARKET`, `LIMIT`, `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT`, `TAKE_PROFIT_LIMIT`. |
| `quantity` | Positive decimal string, up to eight decimal places; instrument minimum enforced. |
| `limitPrice` | Required only for limit-bearing order types; tick size enforced. |
| `stopPrice` | Required only for conditional order types. |
| `timeInForce` | GTC by default; conditional orders permit only GTC/DAY. |
| `clientOrderId` | 8–80 characters for submission; preview supplies its own nonpersistent value. |
| `bracketStop`, `bracketTarget` | Optional eligible opening-order exits with validated placement. |
| `leverage` | Integer 1–20, further limited by instrument and challenge. |
| `positionSide` | LONG by default; SHORT supported for derivatives. |
| `reduceOnly` | Defaults false; derivative closes must match owned position semantics. |
| `expiresAt` | Optional ISO datetime subject to server validation. |
| `scope` | `main` or an owned challenge account scope. |

Unsupported combinations and unknown fields are rejected. Server validation checks existing reservations and immediate execution affordability, not just a displayed estimate.

## Journal and preferences

A journal creation body accepts `scope`, `notes`, optional `title`, `tags`, `emotionalState`, `outcome`, `instrumentSymbol`, and `orderId`. An instrument and linked order must agree. PATCH supports content changes and preserves omitted fields. Tags are normalized/deduplicated; the journal schema bounds content size.

Preference PATCH requests should contain only changed fields. Chart preferences and notification categories merge under a user lock so concurrent partial updates do not overwrite unrelated fields. Disabling a notification category does not disable trading or audit events.

## CSV and streaming

```text
GET /api/exports?dataset=executions&scope=main
GET /api/exports?dataset=snapshots&scope=main
GET /api/exports?dataset=journal&scope=main
```

Exports use 500-row pages and an upper timestamp cutoff. Responses are CSV attachments with `no-store`; cancellation releases the iterator. Spreadsheet formula prefixes are neutralized. The journal is editable, so its export is not a transactionally frozen database backup.

Quote SSE emits `quotes` events and may emit a degraded `status`. Connections are bounded and periodically closed for session revalidation; clients should reconnect. Market freshness metadata is separate from connection status.

## Error handling

Expect `400` for invalid input, `401` for missing/invalid authentication, `403` for authorization/origin violations, `404` for missing owned resources, `409` for rejected order intent, `413` for oversized bodies, `429` for rate limits, and `503` for unavailable dependencies where classified. Read the returned error code/message instead of assuming all errors share one status. Preview rejection uses `PREVIEW_REJECTED`; submission rejection uses `ORDER_REJECTED`.

Financial retries must preserve idempotency. Do not turn a rejected market order into an automatic new order with a fresh ID without renewed user intent.
