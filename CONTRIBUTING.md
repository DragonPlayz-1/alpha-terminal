# Contributing to ALPHA TERMINAL

Thank you for helping improve ALPHA TERMINAL. Contributions should preserve the project’s accounting guarantees, security boundaries, and simulator-first scope.

## Before opening a pull request

1. Search existing issues and pull requests.
2. For security-sensitive work, read [`SECURITY.md`](SECURITY.md) and use private reporting.
3. Keep changes focused and explain the user or operational problem they solve.
4. Add or update meaningful tests for behavior changes.
5. Update documentation and environment examples when configuration changes.

## Development setup

```bash
npm ci
cp .env.example .env
# Set a private local PostgreSQL DATABASE_URL and SESSION_SECRET.
npx prisma migrate dev
npm run db:seed
```

Start the web process and worker in separate terminals:

```bash
npm run dev
npm run dev:worker
```

## Quality gates

Run the same checks used by CI before submitting:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit
```

The test runner creates an isolated PostgreSQL schema per invocation. Do not bypass `npm test` or `npm run test:e2e` with a database URL that points at a shared environment.

## Domain guidelines

- Keep all balance-changing behavior inside authoritative server-side transactions.
- Use `Decimal`/string-backed values for financial arithmetic; do not introduce floating-point settlement logic.
- Preserve idempotency for retryable mutations.
- Treat quote freshness, ownership, account scope, and instrument constraints as server-side rules.
- Add a migration for schema changes and test both the migration and the affected service behavior.
- Never add real exchange credentials or private keys. Market data integrations are public-data adapters only.
- Keep challenge and public-profile privacy rules enforced on the server, not only in the UI.
- Document operational implications for worker, readiness, SMTP, PostgreSQL, and proxy changes.

## Pull request expectations

Each pull request should include:

- A concise problem statement and implementation summary.
- Test commands and their results.
- Screenshots or a short recording for visible UI changes.
- Migration, rollback, and deployment notes for database or runtime changes.
- Any new environment variables added to `.env.example` and the README.

Use a small number of logically grouped commits. Do not commit `.env`, build output, dependency directories, test artifacts, credentials, or generated local database files.

## Commit style

Use an imperative subject with an optional conventional prefix, for example:

```text
feat: add challenge finalization review state
fix: reject stale quotes before market execution
docs: expand production operations guide
```

## Review philosophy

Reviewers prioritize correctness of financial state, authorization, data privacy, failure recovery, observability, and testability. A visually polished change still needs server-side enforcement and regression coverage.
