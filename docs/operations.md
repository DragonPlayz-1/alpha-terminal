# Operations runbook

[Back to README](../README.md) · [Configuration reference](configuration.md)

## Deployment contract

Run three services: PostgreSQL, the Next.js web process, and a persistent market worker. Web and worker share the database and session/canonical-origin configuration. Use a process supervisor for restarts and graceful shutdown; the database lease coordinates worker leadership but is not a supervisor.

Requirements: Node 22 or 24, PostgreSQL 15+, an HTTPS endpoint, public-provider egress, and optional SMTP. A static site host cannot run this application. A platform hosting only web requests also needs a persistent worker service elsewhere.

## Release procedure

1. Choose the release commit and review its migration/changelog notes.
2. Confirm a restorable database backup.
3. Install dependencies with `npm ci`.
4. Apply committed migrations using `npm run db:deploy` from a release job with database access.
5. On a fresh environment, run `npm run db:seed` once. Do not assume reseeding renews an existing challenge deadline.
6. Build with `npm run build` and deploy the standalone artifact or web image.
7. Start web and worker with runtime secrets and `NODE_ENV=production`.
8. Verify `/api/health`, then `/api/ready` after a successful worker cycle.
9. Verify login, quote freshness, a controlled simulated order, and reconciliation.

Direct Node.js example, with secrets supplied by the environment or existing private `.env`:

```bash
npm ci
npm run db:deploy
npm run build
npm start
```

Run the worker under a separate supervisor entry:

```bash
NODE_ENV=production npm run dev:worker
```

The worker command uses `tsx`; keep the required runtime dependencies available. The repository's worker Docker target includes them. The name `dev:worker` does not itself enable development behavior; `NODE_ENV` controls the runtime mode.

## Standalone packaging

`npm run build` generates Prisma, builds Next.js, copies static/public assets into `.next/standalone`, and removes dotenv files from that artifact. `npm start` launches `server.js` from the artifact directory and forwards termination signals.

When shipping only the standalone directory, provide environment variables and run `node server.js` there. Set `HOSTNAME=0.0.0.0` and the intended `PORT`. When using the repository's `npm start` wrapper, configure `LISTEN_HOST` instead; it defaults to `0.0.0.0`.

Migrations and the worker are separate release/runtime concerns; the web artifact alone is not the entire deployment.

## Docker targets

```bash
docker build --target web -t alpha-terminal-web:0.2.0 .
docker build --target worker -t alpha-terminal-worker:0.2.0 .
```

Supply runtime values through your deployment secret mechanism. For a private deployment environment file, use a **separate deployment file**, preserving your development `.env`:

```bash
docker run -d --name alpha-web --restart unless-stopped \
  --env-file /absolute/private/path/terminal-runtime.env \
  -p 3000:3000 alpha-terminal-web:0.2.0

docker run -d --name alpha-worker --restart unless-stopped \
  --env-file /absolute/private/path/terminal-runtime.env \
  alpha-terminal-worker:0.2.0
```

Both containers must be able to resolve/reach the database hostname. A host-side `localhost` database URL does not automatically work inside Docker. Use a shared Docker network/service name or a reachable private database endpoint. Apply migrations before starting the new application version.

The web image runs as the `node` user and exposes an HTTP health check. The worker target inherits the builder and includes development tooling needed for `tsx`; it is not a minimal distroless image. No Compose stack is supplied.

## TLS, proxy, and realtime

- Use `NEXT_PUBLIC_APP_URL` or `APP_URL` for the canonical **browser-facing HTTPS origin**.
- List only controlled aliases in `TRUSTED_ORIGINS`.
- Set `TRUSTED_CLIENT_IP_HEADER` only when the proxy replaces the incoming value with a verified client IP. Without it, conservative shared rate keys apply.
- Forward cookies correctly and avoid caching authenticated APIs or HTML.
- Disable proxy buffering for `/api/stream/quotes`; preserve `text/event-stream` and allow long-lived responses/reconnection.
- Keep clocks synchronized: quote freshness, token expiry, funding boundaries, and worker leases depend on timestamps.

Production cookies are Secure, HttpOnly, SameSite=Lax, and `__Host-` scoped. A mismatch between browser origin and runtime configuration can reject login mutations. The build machine's origin is not the deployment's canonical origin.

## Health and monitoring

| Signal | Meaning | Response |
| --- | --- | --- |
| `/api/health` = `200` | Web can reach PostgreSQL. | Continue monitoring. |
| `/api/health` = `503` | Database/application dependency unavailable. | Inspect connectivity, pool, credentials, and database health. |
| `/api/ready` = `503` | Database or worker ownership/success is not ready. | Inspect the worker, lease, cycle logs, and dependencies. |
| Cached quotes | Source/receipt freshness failed for that symbol. | Check provider access/timestamps; do not weaken freshness to hide an outage. |
| Worker owner changes | Lease takeover. | Confirm the previous owner stopped or lost leadership. |
| Reconciliation drift | Ledger/materialized-state mismatch. | Preserve records and investigate the responsible transactions. |
| Email delivery failure | SMTP transport could not deliver. | Check sender, credentials, provider policy, and connectivity. |

Monitor PostgreSQL storage, active connections, locks, backup age, worker cycle success, provider failures, API errors, and reconciliation. Readiness is a process-level signal, not proof that every symbol is currently executable.

## Worker recovery

1. Inspect structured worker events and confirm the process is alive.
2. Check database/provider access and clock synchronization.
3. Confirm web and worker target the same database/schema and settings.
4. Restart the worker through its supervisor and allow lease takeover.
5. Confirm a successful cycle and readiness.

Do not manually edit lease, balance, execution, or ledger records to force a healthy status. Expected lease loss is reported as leadership loss and terminates leadership rather than producing continued protected writes.

## Backup and rollback

Back up PostgreSQL and test restoration periodically. Restore into a separate controlled environment first, apply the intended migration chain, and verify reconciliation before routing traffic.

For v0.2.0, the migration adds journal/events/order links and append-only event protection. Existing trades remain; no event backfill is performed. Prefer a forward fix. A code rollback must be checked against the deployed schema; do not drop new financial/audit records merely to match an older release.

## Credential rotation

Rotate through the secret manager and restart affected processes. Rotating `SESSION_SECRET` invalidates session HMACs. Database and SMTP credentials have separate lifecycles. Recovery tokens are hashed and single-use. Keep environment files, connection strings, session material, and runtime logs out of commits and public support reports.

## Capacity and scaling

Web replicas share PostgreSQL and independently poll quote rows for local SSE clients. Subscriber limits are per process. Scale deliberately around database connection capacity and polling/query load; a Redis transport is not implemented. Multiple worker instances may contend for leadership, but only one owner should perform scheduled work at a time.
