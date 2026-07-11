# Atlas Environment Strategy

Atlas uses separate databases per environment and keeps them in sync through migrations, not by sharing data.

## Environments

| Environment | Branch source | App runtime | Database | Purpose |
|---|---|---|---|---|
| Local development | Feature branch from `main` | npm and Vite dev servers | Docker Postgres on localhost | Fast development with hot reload |
| Staging | `staging` branch or selected release commit | AWS managed stack | Staging RDS PostgreSQL | Pre-production testing and sign-off |
| Production | `main` branch or promoted tested commit | AWS managed stack | Production RDS PostgreSQL | Real users and durable data |

## Local Development

Start only Postgres in Docker:

```powershell
npm run dev:db
```

Run the API and web app with hot reload:

```powershell
npm run dev:api
npm run --workspace=web dev
```

Default local API database:

```text
postgres://postgres:postgres@127.0.0.1:55432/atlas
```

The API runs SQL migrations on startup when `DATABASE_URL` is configured. Local data is disposable and can be reset with:

```powershell
npm run dev:db:reset
```

## Staging And Production

Staging and production must use different AWS resources:

- separate RDS PostgreSQL databases
- separate Secrets Manager secrets
- separate ECS services
- separate S3 buckets and CloudFront distributions
- separate EventBridge schedules
- separate WAF/logging/budget evidence

Keep schema aligned by deploying the same migration files to each environment. Do not point local or staging code at the production database.

## Database Sync Policy

- Schema sync: handled by versioned SQL migrations in `apps/api/src/infra/db/migrations`.
- Reference/bootstrap auth: handled by API startup bootstrap after migrations.
- Data sync: local, staging, and production data stay separate.
- Production-like test data: create sanitized staging fixtures or restore sanitized snapshots only.
- Production backups: use RDS snapshots/backups; do not use production as a development database.

## Bootstrap Logins

The API inserts bootstrap users into each durable database on startup:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
USER_EMAIL
USER_PASSWORD
```

Use the same email addresses across environments if you want the same login identity everywhere, but use environment-specific passwords stored in local `.env` or AWS Secrets Manager. The bootstrap password is used when the user is first created; do not rely on it as a long-term production password rotation mechanism.
