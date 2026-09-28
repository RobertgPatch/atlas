# Source and runtime inventory

- Current holdings: `consolidatedHoldings.service.ts` reads selected accounts/source holdings from `plaid.repository.ts`; `reports.handler.ts` supplies account filter options. Dashboard and export flow through reports. Preserve scoped filtering and presentation.
- History: `liquidityPerformance.service.ts` currently selects global portfolio snapshots; `liquidity-valuation.repository.ts` stores subsequent pricing evidence. New composition must select each account independently.
- Quotes: `market-data.service.ts` read enrichment and closing/backfill paths; `server.ts` scheduler and `run-market-price-refresh.ts`/`backfill-market-price-snapshots.ts`. Existing default-off guards are retained and extended for source eligibility.
- Plaid calls: routes/handler/provider, `plaid.holdings-sync.ts`, `plaid.refresh-scheduler.ts`, `run-plaid-refresh.ts`. Retain compatibility until account adoption and verified retirement; don't copy credentials.
- Legacy visibility is connection/user based; neutral accounts require explicit entity binding. Backfill cannot invent an entity from a ticker, mask, or name.
- Original storage: reuse narrow conditional-write/version/checksum/encryption patterns from `modules/k1/storage/s3K1ObjectStore.ts`. CSV has its own namespace/configuration and no extraction imports.
- Live deployment: `deploy-live-production.mjs` invokes `live-production.mjs` with `infra/aws/live-production-target.json`. API/site in us-west-1; preserve K-1 regional overrides. Runtime default merge preserves current environment. Existing planned Terraform tfvars does not drive the live release. See `docs/deployment/live-aws-production.md`.
- Planned Terraform remains a separate us-west-2 topology. Both configuration paths need CSV flag/storage tests; no live release is performed during implementation.
- Repository ignore files already cover dependencies, build outputs, credentials, environment files, Terraform state and local storage. The web ESLint flat configuration excludes generated directories. No ignore changes needed.
