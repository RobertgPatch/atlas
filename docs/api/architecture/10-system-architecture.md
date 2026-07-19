# Jackson API Architecture Notes

## Consolidated Holdings and Plaid

The Consolidated Holdings feature adds a narrow Plaid boundary module under
`apps/api/src/modules/plaid`. Browser code requests a Link token from Jackson,
opens Plaid Link, and sends only the resulting public token back to Jackson. The
API exchanges that public token server-side and never returns Plaid access
tokens to the browser.

The report read path remains under `apps/api/src/modules/reports`. Plaid account
selection and source holdings are retrieved through the Plaid repository, then
`consolidatedHoldings.service.ts` normalizes securities and builds parent rows
with child custodian/account detail rows.

For local development and tests, the Plaid module has an offline sandbox path
when `PLAID_CLIENT_ID` or `PLAID_SECRET` is missing. Production deployments must
provide Plaid credentials and should use encrypted token storage. The database
migration stores the token column as `access_token_ciphertext` to make that
production boundary explicit.

### Required Environment

```env
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_PRODUCTS=investments
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=
```

### Key Endpoints

- `POST /v1/plaid/link-token`
- `POST /v1/plaid/exchange-public-token`
- `GET /v1/plaid/investment-accounts`
- `PATCH /v1/plaid/investment-accounts`
- `POST /v1/reports/consolidated-holdings/refresh`
- `GET /v1/reports/consolidated-holdings`
- `GET /v1/reports/consolidated-holdings/export`

### Refresh, Cache, and AWS Boundary Decisions

Liquidity reads are backed by PostgreSQL holdings snapshots. Redis is intentionally not part of the first deployment because the expected 5-10 user scale is served by durable snapshots, PostgreSQL refresh locks, and TanStack Query reuse without adding another production service.

Plaid calls are limited to explicit refresh paths: manual refresh, the daily scheduler, or an operator-approved fallback. Ordinary Liquidity reads should not call Plaid when a saved snapshot exists.

For the initial AWS deployment, CloudFront may cache static web assets from S3, but authenticated `/v1/*` API responses must use private/no-store application headers and a CloudFront caching-disabled behavior. Financial API responses are user-specific and must not be placed in a shared CDN cache.

The daily refresh is modeled as an EventBridge Scheduler ECS task that runs `node dist/scripts/run-plaid-refresh.js` from the API image. This gives the scheduler a one-shot process while keeping the refresh code in the existing API/Plaid modules.
