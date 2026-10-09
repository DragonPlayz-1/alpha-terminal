# Security Policy

## Supported versions

The `main` branch is the actively maintained line. Release support is best-effort and depends on the severity and reproducibility of the issue.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub’s private vulnerability reporting feature from the repository **Security** tab when available. Include:

- A clear description of the impact.
- A minimal reproduction or proof of concept that does not access other users’ data.
- Affected route, component, commit, or configuration.
- Suggested remediation if you have one.

If private reporting is unavailable, open a minimal issue requesting a private contact channel without including exploit details or secrets.

Please allow maintainers reasonable time to investigate and release a fix before public disclosure.

## Secrets and local data

- Never commit `.env`, database URLs, session secrets, SMTP credentials, access tokens, private keys, or production logs.
- Use a dedicated local PostgreSQL role and isolated test schema.
- Rotate any credential that may have appeared in logs, screenshots, shell history, or an issue.
- Treat screenshots and test fixtures as public artifacts; use anonymized accounts and synthetic data.

## Security boundaries

ALPHA TERMINAL is a paper-trading simulator. It does not accept private exchange trading credentials and must not be extended to place real orders without a separate security review, threat model, and operational approval process.
