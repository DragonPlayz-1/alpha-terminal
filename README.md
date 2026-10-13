# ALPHA TERMINAL

<p align="center">
  <strong>Practice the decision. Understand the execution.</strong><br />
  An open-source paper-trading workspace with interactive charts, server-validated orders,<br />
  portfolio analytics, and a journal for the reasoning behind every trade.
</p>

<p align="center">
  <a href="https://github.com/DragonPlayz-1/alpha-terminal/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/DragonPlayz-1/alpha-terminal/ci.yml?branch=main&amp;label=CI" alt="Quality and build status" /></a>
  <a href="https://github.com/DragonPlayz-1/alpha-terminal/actions/workflows/e2e.yml"><img src="https://img.shields.io/github/actions/workflow/status/DragonPlayz-1/alpha-terminal/e2e.yml?branch=main&amp;label=E2E" alt="Production browser test status" /></a>
  <a href="https://github.com/DragonPlayz-1/alpha-terminal/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/DragonPlayz-1/alpha-terminal/codeql.yml?branch=main&amp;label=CodeQL" alt="CodeQL analysis status" /></a>
  <a href="https://github.com/DragonPlayz-1/alpha-terminal/releases"><img src="https://img.shields.io/github/v/release/DragonPlayz-1/alpha-terminal?color=8b83ff" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b83ff" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#quick-start">Get started</a> ·
  <a href="docs/product-tour.md">Product tour</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/api.md">API reference</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

[![ALPHA TERMINAL: BTC chart, named watchlist, server-side order preview, and open positions](docs/screenshots/terminal.png)](docs/screenshots/terminal.png)

> **Virtual funds. Simulated execution.** ALPHA TERMINAL does not send orders to an exchange or require private exchange keys. Screenshots use an isolated demonstration account and synthetic market/history data; they are product illustrations, not performance claims.

## Contents

- [Why ALPHA TERMINAL](#why-alpha-terminal)
- [Product highlights](#product-highlights)
- [Screenshot gallery](#screenshot-gallery)
- [Technology and architecture](#technology-and-architecture)
- [Quick start](#quick-start)
- [Your first session](#your-first-session)
- [Configuration](#configuration)
- [Commands](#commands)
- [Simulation and accounting](#simulation-and-accounting)
- [Testing and quality](#testing-and-quality)
- [Deployment](#deployment)
- [Upgrading to v0.2.0](#upgrading-to-v020)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Documentation and community](#documentation-and-community)
- [License and acknowledgements](#license-and-acknowledgements)

## Why ALPHA TERMINAL

A good practice environment should make it easy to connect a decision with its consequences. ALPHA TERMINAL brings market context, an authoritative order preview, an execution timeline, portfolio history, and a trade journal into one responsive workspace.

It is also a full-stack reference for developers exploring transactional accounting, idempotent APIs, scoped accounts, worker coordination, and production-style browser testing. The browser submits intent; server-side services and PostgreSQL decide what is valid and persist the result.

## Product highlights

| Area | What you can do |
| --- | --- |
| **Trading terminal** | Prepare six spot order types, review fees and reservations, add bracket exits, and inspect the resulting order. |
| **Interactive charts** | Switch between candles, line, and area; choose six timeframes; configure SMA/EMA, volume, and crosshair. Preferences persist across sessions. |
| **Watchlists** | Create, rename, reorder, and delete named lists; select a default; keep Markets stars and terminal selections synchronized. |
| **Account scopes** | Move between your main account and joined challenges. Navigation preserves the selected account in the URL. |
| **Order audit** | Inspect immutable lifecycle events, execution fees, released reservations, triggers, and linked bracket orders. |
| **Portfolio analytics** | Explore period returns, drawdown, gross closing-fill outcomes, funding, allocation, and persisted equity/exposure history. |
| **Trade journal** | Record titles, notes, tags, emotional state, and outcomes; link entries to owned instruments and orders. |
| **Futures simulation** | Open long/short isolated perpetual positions with previews, leverage limits, synthetic funding, and recorded liquidation events. |
| **Exports** | Download complete execution, snapshot, and journal CSV datasets; export current holdings and analytics from Portfolio. |
| **Account controls** | Manage profile privacy, active sessions, password changes, price alerts, and notification preferences. |
| **Navigation and accessibility** | Use Ctrl/⌘K, keyboard navigation, focus-managed dialogs, reduced-motion support, and mobile navigation. |
| **Competition** | Join rule-based challenges and view privacy-aware leaderboards and achievements. |

See the [product tour](docs/product-tour.md) for workflows, screenshots, and feature boundaries.

## Screenshot gallery

| Portfolio analytics | Trade journal |
| :---: | :---: |
| [![Portfolio with equity history, allocation, and performance metrics](docs/screenshots/portfolio.png)](docs/screenshots/portfolio.png) | [![Journal with tagged trade reviews and an entry editor](docs/screenshots/journal.png)](docs/screenshots/journal.png) |

| Execution audit | Futures workspace |
| :---: | :---: |
| [![Filled order with execution events and linked bracket exits](docs/screenshots/order-detail.png)](docs/screenshots/order-detail.png) | [![Isolated perpetual workspace with an authoritative order preview](docs/screenshots/futures.png)](docs/screenshots/futures.png) |

<details>
<summary><strong>Mobile experience</strong></summary>
<br />
<p align="center">
  <img src="docs/screenshots/mobile-dashboard.png" width="240" alt="Mobile account dashboard and bottom navigation" />
  <img src="docs/screenshots/mobile-terminal.png" width="240" alt="Mobile BTC chart with EMA and timeframe controls" />
  <img src="docs/screenshots/mobile-journal.png" width="240" alt="Mobile trade journal with outcomes, notes, and export" />
</p>
</details>

[View all 15 screenshots and capture instructions →](docs/product-tour.md)

## Technology and architecture

| Layer | Technology |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Interface | Tailwind CSS 4, Lucide icons, Lightweight Charts |
| Persistence | PostgreSQL 15+, Prisma 6, Decimal.js |
| Validation and identity | Zod, bcrypt, opaque server-side sessions |
| Public data | Coinbase by default; Binance polling adapter for a fresh registry |
| Verification | Vitest, Playwright Chromium, GitHub Actions, CodeQL |
| Packaging | Standalone Next.js artifact; separate web and worker Docker targets |

```mermaid
flowchart LR
  Browser[Browser workspace] --> Web[Next.js web and API]
  Web --> Services[Authenticated domain services]
  Services --> DB[(PostgreSQL)]
  Providers[Public market data] --> Worker[Leased market worker]
  Worker --> DB
  DB --> SSE[Web-process quote polling and SSE]
  SSE --> Browser
  Services --> SMTP[Optional SMTP delivery]
```

**Two long-running processes:** the web application serves pages/APIs; the worker ingests market data and performs scheduled execution, maintenance, alerts, and snapshots. Both share PostgreSQL. See [architecture](docs/architecture.md) for the transaction, account-scope, and worker-fencing model.

## Quick start

### Prerequisites

- **Node.js 22 or 24** and **npm 10+**. `.nvmrc` selects Node 22; CI runs Node 22.
- **PostgreSQL 15+**, running locally or on a database you control.
- Git and access to public Coinbase endpoints for normal live-data operation.
- Chromium and its OS dependencies only when running browser tests or screenshot capture.

Docker is optional. These steps use Node.js and PostgreSQL directly.

### 1. Clone and install

```bash
git clone https://github.com/DragonPlayz-1/alpha-terminal.git
cd alpha-terminal
npm ci
```

### 2. Create the database

Using an administrative PostgreSQL connection, create an application role and database. Replace the example password with a local secret:

```sql
CREATE ROLE alpha_terminal LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE alpha_terminal OWNER alpha_terminal;
```

The application role must own its schema and be able to apply migrations. Tests create temporary schemas in the selected database. Creating **new** development migrations with `migrate dev` additionally requires a shadow database; applying the committed migrations below does not.

### 3. Configure a local environment

Copy the template only if you do not already have `.env`:

```bash
# macOS / Linux / Git Bash
test -f .env || cp .env.example .env
```

```powershell
# PowerShell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Set these values in your local file:

```dotenv
DATABASE_URL="postgresql://alpha_terminal:YOUR_URL_ENCODED_PASSWORD@localhost:5432/alpha_terminal?schema=public"
SESSION_SECRET="YOUR_RANDOM_SECRET_WITH_AT_LEAST_32_CHARACTERS"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Generate a session secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

URL-encode reserved characters in a database password. `.env` is ignored by Git; [.env.example](.env.example) contains placeholders only. SMTP is optional for local trading, but required for recovery and verification emails.

### 4. Apply migrations and seed

```bash
npm run db:deploy
npm run db:seed
```

The seed creates ten spot instruments, three synthetic perpetuals, achievements, and a starter challenge. It creates **no shared login or administrator password**. Existing instrument rows remain authoritative; changing `MARKET_PROVIDER` does not rewrite them.

### 5. Start the application

Terminal 1:

```bash
npm run dev
```

Terminal 2, from the same project directory:

```bash
npm run dev:worker
```

Open **[localhost:3000](http://localhost:3000)** and create your own account. Choose virtual starting capital between **$100 and $1,000,000**.

### 6. Verify the services

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

`/api/health` checks database connectivity. `/api/ready` returns `503` until a worker owns a valid lease and has completed a recent successful cycle. Initial quote loading also depends on provider availability.

## Your first session

1. Open **Markets**, review data freshness, and add a symbol to your default watchlist.
2. Open **Terminal** for spot or **Futures** for a synthetic perpetual.
3. Confirm the **Trading account** selector before preparing an order.
4. Choose an order type and quantity. Review the **server preview**, including fees, reservations, and available cash afterward.
5. Submit the simulated order. The server revalidates the request against current quotes and balances.
6. Open the order details to inspect fills, lifecycle events, and any linked exits.
7. Add a **journal note**, then use **Portfolio** and **History** to review the result.

Use **Ctrl+K** on Windows/Linux or **⌘K** on macOS for quick navigation. Challenge accounts have their own virtual balances and rules. Joining a challenge adds it to the account selector.

## Configuration

| Variable | Default / requirement | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection string. |
| `SESSION_SECRET` | Required in production; configure locally too | At least 32 characters for session HMACs. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical browser origin and recovery-link base. |
| `APP_URL` | Optional | Server-side canonical-origin override. Use the browser-facing origin. |
| `MARKET_PROVIDER` | `coinbase` | Provider used when creating a fresh instrument registry. |
| `QUOTE_MAX_AGE_MS` | `15000` | Maximum accepted quote age; valid range 1,000–300,000 ms. |
| `TRADING_FEE_RATE` | `0.001` | Simulated proportional fee; `0.001` means 0.1%. |
| `SMTP_URL`, `MAIL_FROM` | Optional | Recovery and verification email delivery. |
| `TRUSTED_ORIGINS` | Empty | Explicit additional trusted browser origins. |
| `TRUSTED_CLIENT_IP_HEADER` | Empty | Client-IP header overwritten by a trusted reverse proxy. |

See the [complete configuration reference](docs/configuration.md) for runtime binding, tests, administrator bootstrap, provider behavior, and settings precedence. Redis and Binance WebSocket environment switches are not implemented.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development web server. |
| `npm run dev:worker` | Start the separate worker; also usable under a production supervisor. |
| `npm run build` | Generate Prisma, build Next.js, and prepare the standalone artifact. |
| `npm start` | Run the built standalone web server. |
| `npm run db:generate` | Regenerate the Prisma client. |
| `npm run db:deploy` | Apply committed migrations. |
| `npm run db:migrate` | Create/apply migrations during schema development. |
| `npm run db:seed` | Seed instruments, achievements, and starter challenge. |
| `npm run db:admin` | Bootstrap/reset an administrator using explicit environment variables. |
| `npm run typecheck` | Check TypeScript. |
| `npm run lint` | Check source with ESLint. |
| `npm run docs:check` | Validate local documentation links, anchors, and gallery files. |
| `npm test` | Run unit/integration tests in a fresh schema. |
| `npm run test:e2e` | Build and test a copied production artifact with Chromium. |
| `npm run screenshots` | Rebuild the isolated demonstration gallery. |

## Simulation and accounting

- **Spot orders:** `MARKET`, `LIMIT`, `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT`, and `TAKE_PROFIT_LIMIT`. Applicable time-in-force options include GTC, DAY, IOC, and FOK; conditional orders accept GTC/DAY.
- **Prices:** buys execute against the ask and sells against the bid. Fills use the full quantity at top of book; depth, queue position, real latency, and market impact are not modeled.
- **Previews:** use the same validation rules as submission under account locking. A preview does not write an order or reserve funds and is not a guaranteed future price.
- **Transactions:** orders, reservations, balances, positions, executions, fees, and ledger movements are committed atomically with decimal arithmetic.
- **Retries:** a `clientOrderId` is unique within an account. Reusing it with a changed request is rejected; the same request cannot produce duplicate financial effects.
- **Auditability:** database triggers protect immutable financial identities and append-only order events. Old orders are not retroactively assigned lifecycle events.
- **Synthetic perpetuals:** BTC, ETH, and SOL linear USD contracts use isolated margin, up to 20× leverage, midpoint marks, 2.5% maintenance margin, a 0.5% liquidation fee, and synthetic 0.01% funding per observed eight-hour boundary.
- **Analytics:** use account snapshots and recorded executions. Closing-fill win/loss metrics are gross of fees/funding, and partial closes count separately. Unavailable baselines are shown as missing rather than invented.

The supported seeded universe is crypto. Schema enum values for other asset classes or dated futures do not imply implemented providers or execution support. See [architecture](docs/architecture.md) and [API semantics](docs/api.md) for details.

## Testing and quality

Install Chromium once:

```bash
npx playwright install --with-deps chromium
```

Run the release checks:

```bash
npm run typecheck
npm run lint
npm run docs:check
npm test
npm run test:e2e
npm audit --audit-level=high
```

The E2E command includes a production build. Tests create a unique `alpha_test_*` schema and remove only that schema. A remote database requires an explicit `TEST_DATABASE_URL`; never select production for testing. Browser tests cover auth/recovery, account isolation, orders, chart persistence, journal, analytics, watchlists, worker takeover, and responsive navigation from 320px to 1920px.

GitHub Actions runs quality/build, production E2E, and CodeQL. The [development guide](docs/development.md) explains focused tests, browser diagnostics, and screenshot reproduction.

## Deployment

Deploy a **Node.js web process, a separate persistent worker, and PostgreSQL**. A static export or a web-only deployment does not provide scheduled execution.

```bash
npm ci
npm run db:deploy
npm run build
npm start
```

Run `npm run dev:worker` separately under your process supervisor with `NODE_ENV=production`. Provide both processes the same database, session secret, and canonical HTTPS origin. Apply seeding explicitly when provisioning a fresh environment.

The multi-stage [Dockerfile](Dockerfile) provides `web` and `worker` targets. Environment files are excluded from the build context and removed from standalone output. Container database URLs must resolve from **inside** the container; `localhost` refers to the container itself.

The [operations runbook](docs/operations.md) covers runtime configuration, Docker commands, TLS/proxy behavior, SMTP, readiness, upgrades, monitoring, and recovery.

## Upgrading to v0.2.0

1. Back up the database and review the [changelog](CHANGELOG.md).
2. Install the release dependencies with `npm ci`.
3. Run `npm run db:deploy` before starting the new web and worker processes.
4. Build, restart both services, and verify health/readiness and account access.

The new migration adds `OrderEvent`, `TradeJournalEntry`, order links, and append-only event protection. Existing accounts and trades are retained. Lifecycle history begins with newly recorded events; there is no historical backfill. Keep existing environment files and credentials when upgrading.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Database unavailable / Prisma cannot connect | PostgreSQL service, URL/password encoding, database ownership, and committed migrations. |
| `/api/ready` returns `503` | Start the worker and inspect its lease, provider connectivity, and recent successful cycles. |
| Cached quotes or rejected orders | Public provider access, quote timestamps, and `QUOTE_MAX_AGE_MS`; cached chart data does not authorize a fill. |
| Login reports a cross-origin rejection | Align the running canonical URL with the browser origin; review proxy headers and explicit trusted origins. |
| Recovery mail unavailable | Configure both `SMTP_URL` and `MAIL_FROM`; inspect transport delivery logs. |
| Browser executable missing | Run `npx playwright install --with-deps chromium`. |
| A challenge account cannot trade | Check its status, deadline, supported symbols, leverage, and order-type rules. |
| A new portfolio has no chart | History requires persisted snapshots. Keep the worker running while using the account. |

For reporting guidelines and diagnostic commands, see [development](docs/development.md), [operations](docs/operations.md), and [support](SUPPORT.md).

## Project structure

```text
app/          Pages, layouts, API route handlers, and error boundaries
components/   Responsive workspace, charts, account controls, and dialogs
lib/          Environment, database, client requests, formatting, and validation helpers
server/       Trading, auth, market data, notifications, journal, and competition services
worker/       Leased background ingestion, execution, alerts, and maintenance
prisma/       Schema, migrations, and seed data
scripts/      Build packaging, startup, test isolation, docs checks, and gallery capture
tests/        Unit, integration, and production browser regression suites
docs/         Product tour, configuration, API, architecture, operations, and screenshots
.github/      CI, CodeQL, dependency updates, and contribution templates
```

## Documentation and community

| Resource | Use it for |
| --- | --- |
| [Product tour](docs/product-tour.md) | Workflows, full gallery, and screenshot provenance. |
| [Configuration](docs/configuration.md) | Supported environment variables and runtime behavior. |
| [API reference](docs/api.md) | Routes, account scopes, payloads, errors, and exports. |
| [Architecture](docs/architecture.md) | Transactions, data flow, concurrency, and worker coordination. |
| [Development](docs/development.md) | Local checks, meaningful tests, and screenshot tooling. |
| [Operations](docs/operations.md) | Deployment, monitoring, upgrades, and recovery. |
| [Contributing](CONTRIBUTING.md) | Contribution workflow and review expectations. |
| [Support](SUPPORT.md) | Questions, reproducible bug reports, and feature proposals. |
| [Security](SECURITY.md) | Private vulnerability reporting. |
| [Changelog](CHANGELOG.md) | Release-by-release changes. |

Questions and ideas are welcome in [Discussions](https://github.com/DragonPlayz-1/alpha-terminal/discussions). Use [Issues](https://github.com/DragonPlayz-1/alpha-terminal/issues) for reproducible bugs and focused feature proposals. If the project is useful, a star helps others discover it.

## License and acknowledgements

Released under the [MIT License](LICENSE). Contributions follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Built with [Next.js](https://nextjs.org/), [Prisma](https://www.prisma.io/), [PostgreSQL](https://www.postgresql.org/), [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/), [Lucide](https://lucide.dev/), [Vitest](https://vitest.dev/), and [Playwright](https://playwright.dev/). Provider and library names identify integrations; they do not imply endorsement.

ALPHA TERMINAL is an educational simulator. It is not an exchange, brokerage, or investment advisory service. Simulated results do not predict real-world outcomes.
