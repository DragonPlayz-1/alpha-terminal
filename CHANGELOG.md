# Changelog

All notable changes to ALPHA TERMINAL are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning where practical.

## [0.2.0] - 2026-10-13

### Added

- Persistent candle/line/area charts, SMA/EMA settings, volume/crosshair controls, and validated OHLC normalization.
- Named watchlist management, synchronized default stars, and URL-authoritative account switching.
- Server-authoritative spot/futures order previews sharing submission validation.
- Append-only order lifecycle events, execution-detail pages, and linked bracket-order navigation.
- Scoped trade journal with titles, notes, tags, emotion, outcomes, and order links.
- Period analytics with full-history drawdown, execution outcomes, funding, comparisons, and exposure charts.
- Streaming CSV exports for executions, portfolio snapshots, and journal entries.
- Keyboard command palette, native modal focus handling, responsive navigation, and reduced-motion support.
- Session management, authenticated password changes, price-alert controls, and preference-aware notifications.
- Expanded accounting/API/browser regressions and reproducible desktop/mobile product screenshots.
- Setup, configuration, API, development, operations, and support documentation.

### Changed

- Dashboard and portfolio charts now use persisted account history rather than illustrative interface data.
- Markets and terminal render cached quotes first while refreshing providers in the background.
- Preference/watchlist mutations serialize competing updates; analytics use consistent transaction snapshots.
- Worker alert evaluation is freshness-aware and fenced against lost leadership.

### Fixed

- Runtime-origin handling for authentication in promoted standalone builds.
- Network/error recovery, auth navigation, rate-limit messaging, and database-outage classification.
- Omitted journal tags being cleared during partial updates.
- Derivative market/order links opening the spot workspace and account scope being lost during navigation.
- Filled-order reservation labels and mobile watchlist rename sizing.

### Upgrade notes

- Run `npm ci` and `npm run db:deploy` before deploying the new application.
- Migration `20261012120000_order_events_and_journal` adds journal/event tables, order links, and append-only event protection.
- Existing accounts/trades remain intact. Historical order events are not backfilled.
- Preserve existing `.env` files and runtime credentials. SMTP is required only for recovery/verification delivery.

## [0.1.0] - 2026-10-09

### Added

- Full-stack paper-trading terminal with virtual spot and synthetic perpetual accounts.
- Public Coinbase market data and Binance polling adapter.
- Atomic orders, executions, balances, reservations, positions, fees, and ledger transactions.
- Idempotent order requests, stale-quote protection, reconciliation, and immutable financial-record safeguards.
- Authenticated sessions, recovery and verification flows, privacy controls, challenges, leaderboards, and achievements.
- Database-backed worker lease, readiness endpoint, bounded quote streaming, and standalone deployment packaging.
- Unit, integration, and production-style Playwright test suites.

[0.2.0]: https://github.com/DragonPlayz-1/alpha-terminal/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/DragonPlayz-1/alpha-terminal/releases/tag/v0.1.0
