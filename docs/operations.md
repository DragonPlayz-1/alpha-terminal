# Operations Runbook

This runbook covers a direct Node.js deployment or the included standalone/Docker packaging.

## Release procedure

1. Build and test the exact commit intended for release.
2. Create a PostgreSQL backup or confirm the managed backup checkpoint.
3. Apply committed migrations with `npx prisma migrate deploy`.
4. Deploy the web artifact.
5. Start or restart exactly one worker process per logical environment.
6. Confirm `/api/health` returns `200`.
7. Confirm `/api/ready` returns `200` only after the worker records a successful cycle.
8. Verify login, quote freshness, order idempotency, and reconciliation with a controlled test account.

## Health signals

| Signal | Meaning | Action |
| --- | --- | --- |
| `/api/health` = `200` | Web process can reach PostgreSQL. | Continue monitoring. |
| `/api/health` = `503` | Web process or database is unhealthy. | Inspect process, connection pool, and database availability. |
| `/api/ready` = `503` | Database may be healthy but worker is absent, stale, or fenced. | Inspect worker lease and worker logs. |
| Worker lease owner changes | A worker takeover occurred. | Confirm the previous process stopped or lost connectivity as expected. |
| Reconciliation drift | Derived state differs from the ledger or reservations. | Stop automated remediation; investigate the transaction history and database locks. |

## Worker recovery

If `/api/ready` remains unavailable:

1. Check worker logs for provider, database, or lease errors.
2. Confirm `DATABASE_URL`, `SESSION_SECRET`, and provider configuration are identical between web and worker processes.
3. Check PostgreSQL connections, locks, disk space, and clock health.
4. Restart the worker under the deployment supervisor.
5. Confirm a new lease owner and successful cycle.

Do not manually edit `WorkerLease`, balances, executions, or ledger rows to force readiness.

## Database recovery

- Restore into a controlled environment first.
- Validate migrations and reconciliation before routing traffic.
- Never rewrite immutable financial history to hide a discrepancy.
- Preserve the original records, identify the failing transaction, and ship a reviewed corrective migration if required.
- Test backup restoration periodically, not only after an incident.

## Secret rotation

1. Generate a new `SESSION_SECRET`.
2. Deploy it through the secret manager, not source control.
3. Expect existing sessions to become invalid if the session key changes.
4. Rotate SMTP, database, proxy, and GitHub credentials independently when required.
5. Review logs, shell history, CI output, and repository history for accidental exposure.

## Deployment boundaries

Use a TLS-terminating reverse proxy, restrict PostgreSQL network access, configure trusted origins only for controlled aliases, and set `TRUSTED_CLIENT_IP_HEADER` only when the proxy overwrites that header. Do not trust arbitrary client-supplied forwarding headers.
