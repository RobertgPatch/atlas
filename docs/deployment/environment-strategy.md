# Atlas Environment Strategy

Atlas has exactly two active runtime classes: developer-owned `local` and the
sole remote runtime, AWS `production`. There is no long-lived AWS development
or staging environment.

| Runtime | Application | Database | Provider behavior | Durability |
|---|---|---|---|---|
| Local | npm/Vite/Fastify processes | Docker PostgreSQL on loopback | Deterministic stub/local adapters | Disposable developer data |
| Production | Managed AWS stack | Private encrypted RDS PostgreSQL | Explicit production adapters | Backups, deletion protection, immutable releases |

Historical specifications can retain earlier environment names as records, but
current commands, Terraform examples, CI gates, and runbooks must expose only
these two runtime classes.

## Local development

From the repository root, run:

```powershell
npm run dev:local
```

The launcher validates the local boundary before starting Docker or a child
process. It then performs this sequence:

1. Start the PostgreSQL 16 container and require its health check.
2. Run every ordered SQL migration synchronously under the migration advisory lock.
3. Start the API and require `GET /internal/readiness` to report a reachable database.
4. Start the local K-1 worker and web server.

Database unavailability, a failed migration, or readiness timeout stops the
sequence. The web app is never opened against a partially initialized API.
Repeated startup is safe because the migration ledger and advisory lock are the
same ones used by API startup.

Local defaults are `K1_EXTRACTOR=stub`, `K1_OBJECT_STORE=local`,
`K1_QUEUE=local`, `MARKET_DATA_PROVIDER=none`, and a loopback `DATABASE_URL`.
The launcher refuses production databases, active AWS adapters/resources,
production AWS profiles/accounts, production Terraform markers, and AWS
mutation flags before any child process or provider call. Merely having unused
AWS credentials in the shell does not make the local flow depend on AWS.

Local data can be reset deliberately with:

```powershell
npm run dev:db:reset
```

This removes only the named Docker development volume. It does not interact
with AWS or any production resource.

## AWS production

Production is always available and retains the managed boundaries: private
RDS, Fargate, Application Load Balancer, NAT gateway, CloudFront, WAF, encrypted
storage, Secrets Manager, schedulers, and observability. Deployments are
operator-run from an immutable, clean source commit; merging a branch does not
apply infrastructure automatically.

The production workflow uses the committed target descriptor, the preserved
remote backend, ignored operator-supplied production variables, live secret
version attestation, a cost/policy-approved saved Terraform plan, immutable API
and web artifacts, and an exact production confirmation. Routine production
keeps one API task and the database running continuously. Bootstrap capacity
zero is allowed only for the single-use create-only bootstrap before first
activation.

Production schema changes use the same versioned migration files as local
development. Routine migrations must be backward compatible with the prior
application artifact because rollback restores application artifacts only; it
never rewinds production data or Terraform state.

## Provider and data policy

- Local and CI use stubs, mocks, recorded fixtures, or isolated local services.
- Real-provider, destructive, reset, load, and bounded-abuse tools must refuse production.
- Local processes must never point to production databases, buckets, queues, provider projects, or endpoints.
- Production values live in ignored operator inputs or AWS secret/configuration services, not committed `.env` files.
- Production data is not copied to local development. Use synthetic fixtures.
- Production recovery uses RDS backups and tested artifact rollback; local volume reset is unrelated.

## Bootstrap identities

Local PostgreSQL may create the documented disposable bootstrap users. AWS
production obtains credentials through its release and secret contracts. Do not
reuse local passwords in production or treat a bootstrap password as a rotation
mechanism.
