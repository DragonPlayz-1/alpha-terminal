# Configuration reference

[Back to README](../README.md)

Local scripts read `.env` through dotenv. Production secrets may instead be injected by the process supervisor or platform. The [template](../.env.example) contains placeholders; preserve your own file during upgrades. The application does not use GitHub credentials or private exchange keys.

## Application settings

| Variable | Default | Behavior |
| --- | --- | --- |
| `DATABASE_URL` | Required | `postgresql://` or `postgres://` URL used by Prisma. Apply all committed migrations. |
| `SESSION_SECRET` | Required in production | Minimum 32 characters. Use a randomly generated value; changing it invalidates existing session HMACs. Configure the same value in all processes. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical browser-facing HTTP(S) origin. Used by server origin checks and recovery links. |
| `APP_URL` | Unset | Overrides the canonical origin on the server. This is not a database address or arbitrary internal proxy hostname. |
| `NEXT_PUBLIC_APP_NAME` | `ALPHA TERMINAL` | Accepted configuration value; the interface currently uses fixed ALPHA TERMINAL branding. It is not a complete white-label setting. |
| `TRUSTED_ORIGINS` | Empty | Comma-separated, explicitly trusted additional origins for browser mutations. |
| `TRUSTED_CLIENT_IP_HEADER` | Empty | Header used for client-IP rate keys. Configure only when your reverse proxy overwrites that header. |
| `SMTP_URL` | Unset | `smtp://` or `smtps://` Nodemailer transport URL. URL-encode credentials. |
| `MAIL_FROM` | Unset | Sender identity, for example `ALPHA TERMINAL <no-reply@example.com>`. Required together with SMTP. |

The server reads the canonical origin from the **running environment**, including for a standalone artifact built under another origin. Production cookies are Secure, HttpOnly, SameSite=Lax, and use the `__Host-` prefix. Deploy behind HTTPS. Local development uses development cookie settings.

Without SMTP, registration, login, trading, and authenticated password changes work. Requests to send recovery/verification mail return `503 EMAIL_NOT_CONFIGURED`. Production mail needs a real provider and sender configuration; the browser suite uses a temporary SMTP test server.

## Market and trading settings

| Variable | Default | Behavior |
| --- | --- | --- |
| `MARKET_PROVIDER` | `coinbase` | `coinbase` or `binance`; selects defaults when the instrument registry is first created. |
| `BINANCE_REST_URL` | `https://data-api.binance.vision` | Public Binance REST endpoint when using the Binance adapter. |
| `QUOTE_MAX_AGE_MS` | `15000` | Integer from 1,000 to 300,000. Freshness checks consider both source and receipt timestamps and reject invalid future timestamps. |
| `TRADING_FEE_RATE` | `0.001` | Proportional fee from 0 to 0.1. The default is 0.1% of notional. |

Saved administrator trading configuration takes precedence over environment defaults where supported by `server/config.ts`. Existing instruments retain their provider and provider symbol. Changing `MARKET_PROVIDER` does not migrate an existing registry. Binance's USDT public reference is treated as the simulator's USD reference and disclosed in instrument metadata.

There is no implemented Redis transport or Binance WebSocket environment switch. The web SSE broadcaster polls shared PostgreSQL quotes; the default Coinbase worker also uses its public streaming adapter.

## Startup and testing

| Variable | Used by | Meaning |
| --- | --- | --- |
| `NODE_ENV` | Node/Next.js | `development`, `test`, or `production`; run the deployed worker in production mode. |
| `PORT` | Standalone web | HTTP port, normally `3000`. |
| `LISTEN_HOST` | `npm start` | Bind address, defaults to `0.0.0.0`. Use `127.0.0.1` behind a same-host reverse proxy. |
| `HOSTNAME` | Direct `node server.js` / Docker web | Next standalone bind address. `npm start` derives it from `LISTEN_HOST`. |
| `STANDALONE_DIR` | Startup/test tooling | Alternate standalone artifact directory; defaults to `.next/standalone`. |
| `TEST_DATABASE_URL` | Tests and screenshots | Explicit test database; otherwise a local `DATABASE_URL` is used. A remote database requires this variable. |
| `E2E_SKIP_BUILD` | E2E runner | Set to `1` only when `.next/standalone` already matches the exact source under test. |
| `TMPDIR` | Test/gallery tooling | Optional location for disposable copied standalone artifacts. |

The runners supply their own random schema, session secret, local origin, and test configuration. `TEST_SCHEMA` is an internal isolation marker; do not invent it to bypass the wrapper. Ports `3100` (E2E), `2526` (test SMTP), and `3200` (gallery) must be free for the corresponding commands.

## Administrator bootstrap

`npm run db:admin` reads these explicit variables:

| Variable | Requirement |
| --- | --- |
| `ADMIN_EMAIL` | Required valid email. |
| `ADMIN_PASSWORD` | Required, 10–72 UTF-8 bytes. |
| `ADMIN_USERNAME` | Defaults to `operator`. |
| `ADMIN_INITIAL_CAPITAL` | Defaults to `10000`. |

The command can create **or reset** an administrator. Use it deliberately, provide credentials through your secret manager or process environment, and remove bootstrap credentials from long-running process configurations afterward. The standard seed does not run administrator bootstrap.
