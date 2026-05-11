# Atlas API Architecture Notes

## Consolidated Holdings and Plaid

The Consolidated Holdings feature adds a narrow Plaid boundary module under
`apps/api/src/modules/plaid`. Browser code requests a Link token from Atlas,
opens Plaid Link, and sends only the resulting public token back to Atlas. The
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
