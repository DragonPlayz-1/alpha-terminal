# Development guide

[Back to README](../README.md) · [Contributing](../CONTRIBUTING.md)

## Reproducible environment

Follow the README quick start. Use Node 22 (`.nvmrc`) or Node 24, npm 10+, and PostgreSQL 15+. Install with `npm ci`. The lockfile is committed; change it deliberately when dependencies or package metadata change.

Development output uses `.next-dev`; production builds use `.next`. Start web and worker in separate terminals. Use a database owned by a development role. `npm run db:deploy` applies committed migrations without requiring a shadow database; use `npm run db:migrate` only when developing schema changes.

## Local quality gates

```bash
npm run typecheck
npm run lint
npm run docs:check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --audit-level=high
```

The browser command builds the production application and verifies a copied standalone artifact outside the project directory. The runtime origin intentionally differs from the build origin, guarding against deployment-time login regressions. A standalone package must contain no `.env` files.

## Isolated tests

Always use the wrappers. Each invocation creates a unique `alpha_test_*` schema, deploys all migrations, runs tests, and drops only its own schema. It never truncates application data or disables immutable-record triggers. `TEST_DATABASE_URL` is required when the selected test database is remote.

Focused runs:

```bash
npm test -- tests/integration/order-preview.test.ts
npm test -- tests/integration/product-api.test.ts
npm run test:e2e -- tests/e2e/market-navigation.spec.ts
npm run test:e2e -- tests/e2e/workspace.spec.ts
```

To reuse a production artifact only when it matches the source exactly:

```bash
E2E_SKIP_BUILD=1 npm run test:e2e -- tests/e2e/smoke.spec.ts
```

The E2E suite uses one Chromium worker, port 3100, and a temporary SMTP server on port 2526 for recovery tests. It resets only rate-limit rows between tests in a validated isolated schema; rate limits remain active within each test.

### What to cover

- Domain changes: meaningful accounting invariants, authorization, scope, retries, rollback, and reconciliation.
- Trading previews: no order/reservation writes and agreement with subsequent execution under fixed quotes.
- Worker changes: lease ownership, fencing, takeover, and shutdown.
- UI changes: actual state persistence, keyboard/focus behavior, loaded responsive layouts, and console/page errors.
- Exports: ownership, multiple pages, cancellation, quoting, and spreadsheet formula escaping.

Avoid tests that simply repeat the implementation. Check the observable behavior and failure mode that motivated the change.

## Browser diagnostics

Failures retain traces and error context under `test-results/`; CI uploads them on failure. Workspace tests also capture representative screenshots. These files are ignored by Git. The public gallery is generated separately under `docs/screenshots/` using disposable synthetic data.

```bash
npx playwright show-trace test-results/PATH_TO_FAILURE/trace.zip
```

Replace the example path with the actual retained trace. Do not publish traces from personal or production accounts.

## Documentation and screenshots

`npm run docs:check` validates local Markdown/HTML links and anchors, declared package scripts, and PNG gallery integrity/size. It does not depend on external network availability.

```bash
npm run screenshots
npm run docs:check
```

The gallery requires port 3200 and rebuilds before capture. It uses a unique `alpha_screenshots_*` schema, applies the same migrations, and captures real rendered pages with synthetic fixtures. See [provenance and capture details](product-tour.md#reproduce-the-gallery).

Keep captions and feature claims aligned with implemented behavior. Update configuration documentation and `.env.example` when adding supported settings; never replace a developer's private environment file.

## Schema changes

1. Change `prisma/schema.prisma`.
2. Create a named migration with `npm run db:migrate -- --name descriptive_change` using a development database and a permitted shadow database.
3. Inspect the SQL, especially constraints, indexes, data conversions, and triggers.
4. Verify the full migration chain in the isolated test runner.
5. Document deployment order and upgrade implications.

Production uses `npm run db:deploy`. Never use `migrate reset`, `db push`, or disabled triggers as a substitute for validating the migration chain against important data.

## Repository workflow

Create a focused branch, make logically grouped commits, and open a PR with the problem, solution, verification, screenshots, and migration notes. Main requires quality/build, production Chromium, and CodeQL checks. Preserve these checks when changing automation.

The commit subject should name the change. The body should explain **why**, describe important implementation choices, and list verification. Use `feat:`, `fix:`, `docs:`, `test:`, `ci:`, or `chore:` consistently. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for review expectations.
