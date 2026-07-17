# Quickstart: Partnership Aggregation

## 1. Prerequisites

From the repository root on branch `018-partnership-aggregation`:

```powershell
npm install
npm run dev:db
```

Set `ATLAS_TEST_DATABASE_URL` to the local test database used by the existing API integration suites. The database must include migrations through `022_partnership_aggregation_groups.sql`; migration 022 backfills a durable group identity while preserving every owner-specific partnership record.

Confirm the selected planning context:

```powershell
git branch --show-current
Get-Content .specify/feature.json
Get-Content AGENTS.md
```

Expected branch and plan directory: `018-partnership-aggregation` and `specs/018-partnership-aggregation`.

## 2. Build the Verification Fixture

Use existing integration-test factories to create two permitted owners and one out-of-scope owner. Seed these rows with deterministic UUIDs and dates:

| Partnership | Scope | Owner | Type | Status | Current commitment | Paid in | Distributions | Latest NAV | NAV date | Unfunded | Warnings | Latest workflow |
|---|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---|
| Alpha Growth I | in | Alder Family | Private Equity | ACTIVE | $100,000 | $60,000 | $15,000 | $75,000 | 2025-12-31 | $40,000 | 0 | RECONCILED |
| Beacon Credit | in | Beacon Holdings | Credit | ACTIVE | $200,000 | $120,000 | $30,000 | $150,000 | 2026-03-31 | $80,000 | 0 | NEEDS_REVIEW |
| Cedar Legacy | in | Alder Family | Real Estate | CLOSED | missing | missing | missing | missing | missing | missing | 0 | no K-1 year |
| Delta Warning | in | Beacon Holdings | Infrastructure | PENDING | $50,000 | $55,000 | $5,000 | $45,000 | 2024-12-31 | -$5,000 | 2 | NEEDS_REVIEW |
| External Fund | out | Outside Owner | Credit | ACTIVE | $900,000 | $800,000 | $200,000 | $1,000,000 | 2026-06-30 | $100,000 | 0 | RECONCILED |

Ensure Alpha and Beacon have deterministic cash-flow histories that produce known row IRRs. The exact IRR values are asserted at row level only and are not included in the portfolio rollup.

Expected quality buckets:

- Alpha Growth I: `COMPLETE`
- Beacon Credit: `COMPLETE`
- Cedar Legacy: `MISSING_DATA`
- Delta Warning: `WARNINGS` (warning priority applies even if another metric is missing)
- External Fund: never visible or counted for the scoped non-Admin request

## 3. Verify Exact Complete-Scope Rollup

Request the default aggregation as a user scoped to Alder Family and Beacon Holdings:

```text
GET /v1/partnership-tracker/aggregation
```

Expected normalized query:

```json
{
  "ownerIds": [],
  "partnershipTypes": [],
  "statuses": [],
  "workflowStatuses": [],
  "dataQuality": [],
  "sort": "partnership",
  "direction": "asc",
  "page": 1,
  "pageSize": 50
}
```

Expected complete filtered rollup:

| KPI | Amount/value | Coverage/status |
|---|---:|---|
| Partnership count | 4 | complete scoped set |
| Committed capital | $350,000.00 | 3 / 4 |
| Paid-in capital | $235,000.00 | 3 / 4 |
| Distributions | $50,000.00 | 3 / 4 |
| Latest NAV | $270,000.00 | 3 / 4; range 2024-12-31 through 2026-03-31 |
| Unfunded commitment | $115,000.00 | 3 / 4; includes Delta's -$5,000 |
| Portfolio DPI | 0.21276596 | `PARTIAL_COVERAGE` |
| Portfolio TVPI | 1.36170213 | `PARTIAL_COVERAGE` |

Formula checks:

```text
DPI  = 50,000 / 235,000 = 0.212765957... -> 0.21276596
TVPI = (50,000 + 270,000) / 235,000 = 1.361702127... -> 1.36170213
```

Also verify:

- `items.length` is 4 grouped partnerships and rows are ordered Alpha, Beacon, Cedar, Delta.
- `pageInfo.totalItems` and `rollup.partnershipCount` are both 4.
- No rollup field named `irr` exists.
- External Fund affects no amount, facet count, owner option, result count, or date range.
- Known zero values, if added to any fixture, increment coverage and serialize as `"0.00"`.

## 4. Verify Full-Coverage and Zero-Denominator Ratios

Filter to Alpha and Beacon by partnership type:

```text
GET /v1/partnership-tracker/aggregation?partnershipTypes=Private%20Equity,Credit
```

Expected in-scope totals (External Fund remains excluded):

```text
paid in = 180,000.00
distributions = 45,000.00
NAV = 225,000.00
DPI = 0.25000000 AVAILABLE
TVPI = 1.50000000 AVAILABLE
```

Create or adapt a fixture whose only known paid-in value is `0.00`; verify DPI/TVPI return `value: null` with `ZERO_DENOMINATOR`, not zero or infinity. Filter to a set with no paid-in values and verify `NO_DATA`.

## 5. Verify Facets and Combined Filters

For the default response, verify base-scope facets are stable:

- Owner counts: Alder Family 2, Beacon Holdings 2; Outside Owner absent.
- Type counts: Private Equity 1, Credit 1, Real Estate 1, Infrastructure 1.
- Lifecycle counts: ACTIVE 2, CLOSED 1, PENDING 1.
- Workflow counts: RECONCILED 1, NEEDS_REVIEW 2, NO_K1_YEAR 1.
- Quality counts: COMPLETE 2, MISSING_DATA 1, WARNINGS 1; counts sum to 4.

Apply a combined query:

```text
GET /v1/partnership-tracker/aggregation?search=a&ownerIds={alderOwnerId}&partnershipTypes=Private%20Equity,Real%20Estate&statuses=ACTIVE,CLOSED&dataQuality=COMPLETE,MISSING_DATA&sort=nav&direction=desc&page=1&pageSize=25
```

Verify:

- Categories use AND; values inside lifecycle and quality use OR.
- Grouped result count, owner-record coverage, rollup, and `pageInfo.totalItems` describe the same filtered scope.
- Facets retain all four base-scope counts/options rather than shrinking to the active result.
- A malformed/out-of-scope owner UUID and unknown enum are absent from response `query` and do not cause a 500.
- Changing any filter in the UI resets `page` to 1.

## 6. Verify Global Sort and Pagination

Expand the fixture to at least 130 scoped partnerships with repeated/null values. For each supported sort key and direction:

1. Request pages 1 through the last page at `pageSize=25`.
2. Concatenate returned IDs.
3. Verify every matching ID appears exactly once.
4. Verify known values are correctly ordered and null values remain last in both directions.
5. Verify ties resolve by case-insensitive partnership name and stable ID.
6. Verify the rollup and facets are identical across page changes.

Request a page beyond the final page and verify the server echoes the last valid page. For zero matches, verify page 1, total pages 0, and both navigation flags false.

## 7. Verify API Authorization and Query Count

Integration tests must cover:

- 401 without an authenticated session.
- No leakage from an owner outside a non-Admin membership scope.
- Admin sees all owners allowed by existing Admin scope semantics.
- PostgreSQL unavailable returns the established 503 tracker error.
- One aggregate request performs one set-based candidate projection and no detail endpoint or repository query per partnership.
- The 500-partnership fixture returns page, rollup, and facets within 2 seconds in the integration environment.

Use the existing database query spy/instrumentation if available; otherwise wrap the test pool query function for the request and assert the aggregate repository does not execute in a row loop.

## 8. Verify Web URL and Navigation

Start Atlas:

```powershell
npm run dev:local
```

Open `/partnership-aggregation` and verify:

1. `All partnerships` is selected in the view switcher.
2. Search/filter/sort/page changes appear in the URL using canonical values.
3. Refresh restores the same view.
4. Opening Alpha uses `/partnership-tracker?partnership={alphaId}`.
5. Browser Back restores aggregate filters, sort, and page from the prior URL.
6. `Partnership workspace` switches to the existing tracker without rendering aggregation inside its editor.
7. Admin sees Add partnership; creating one routes to its individual workspace and a later aggregate visit includes it.
8. A User does not see add/edit actions.

### Multi-owner grouping and creation

Create two independent owner records for `AC Bell Investors, LLC` with one shared `aggregation_group_id`, different owners, and different commitment/K-1/NAV values. Verify:

1. All Partnerships shows one collapsed AC Bell row and `pageInfo.totalItems` counts it once.
2. Parent commitment, paid in, distributions, NAV, unfunded, DPI, and TVPI equal exact compositions of both owner records.
3. Parent IRR says to use owner detail rather than averaging the two IRRs.
4. Expanding the parent shows two owner rows and each link opens its own partnership ID in the workspace.
5. The Partnership workspace still lists both owner records independently.
6. In Add Partnership, select `Existing partnership, new owner`, choose AC Bell, and confirm owners already represented are unavailable.
7. Creating the available owner record inherits AC Bell's name, type, and aggregation group, then opens the new independent workspace record.

## 9. Verify Cache Consistency

Prime an aggregation query, then exercise existing mutations. After each success, confirm `partnershipTrackerKeys.aggregations()` is invalidated and a refetch updates affected rows, totals, facets, sort/page membership, and quality:

- create or rename a partnership;
- change owner, type, or lifecycle status;
- create/update/delete commitment;
- create/update/delete NAV;
- create/update/delete a K-1 year or change a sign-off/workflow state;
- rename an owner.

Do not optimistically patch one aggregate page. A mutation can change several cached filter combinations and total/facet values at once.

## 10. Verify Responsive and Visual Contracts

At 1440px and 1024px:

- the gold index rail, KPI band, active-filter summary, 17rem filter rail, and table align to one visible grid;
- the filter rail remains visible while scrolling results without trapping page scroll;
- amounts use tabular numerics and align by decimal/currency presentation;
- table overflow, when needed, is local and the partnership column remains sticky;
- no unrelated floating card style or decorative chart competes with the ledger.

At 768px and 390px:

- the desktop filter rail is replaced by one clearly labeled filter button and focus-managed drawer;
- opening the drawer moves focus inside, Escape closes it, and focus returns to the trigger;
- touch targets are at least 44px;
- KPIs wrap without clipped coverage labels;
- the page itself has no horizontal overflow; only the table viewport may scroll;
- every row has a persistent partnership link/action that does not rely on hover.

## 11. Verify Accessibility

Use keyboard-only interaction and the existing automated accessibility approach:

- exactly one page `h1` and logical headings;
- every search/select/checkbox has a visible or programmatic label;
- filter groups use fieldset/legend or equivalent group names;
- sort buttons update `aria-sort` on the correct column header;
- a polite live region announces result-count changes without stealing focus;
- loading, base-empty, no-match, partial-data, and error/retry states are distinguishable;
- focus is visible on switcher, filters, clear, sort, row links, pagination, add, retry, and drawer controls;
- reduced-motion mode removes nonessential entry/filter transitions;
- text, status, focus, and disabled states meet WCAG AA contrast.

## 12. Run Focused and Full Gates

Focused commands after implementation:

```powershell
npm run --workspace=api test -- partnership-tracker.aggregation.test.ts
npm run --workspace=api test -- partnership-tracker.aggregation.integration.test.ts
npm run --workspace=api test -- partnership-tracker.aggregation.authz.integration.test.ts
npm run --workspace=web test -- PartnershipAggregationPage.test.tsx
npm run --workspace=web test -- PartnershipAggregationUrlState.test.tsx
npm run --workspace=web test -- PartnershipAggregationAccessibility.test.tsx
```

Full regression/build gates:

```powershell
npm run test:api
npm run test:web
npm run build:api
npm run build:web
```

The feature is ready for task generation only when exact arithmetic, authorization, response consistency, pagination stability, mutation refresh, responsive overflow, keyboard use, and full builds all pass.

## 13. Implementation Verification — 2026-07-16

Implementation and automated verification were completed on branch `018-partnership-aggregation`.

- Focused aggregation API coverage: 22 passed; 10 PostgreSQL-only tests skipped because `ATLAS_TEST_DATABASE_URL` was not configured. The skipped suites include authorization leakage, 130-row pagination, one-query projection, and the 500-row/two-second budget.
- Focused aggregation web coverage: all new rendering, URL state, client, navigation, cache, accessibility, responsive, and owner-invalidation tests passed.
- Full web regression: 51 test files passed, 136 tests passed.
- Full API regression: 82 test files passed, 305 tests passed, and 46 database-dependent tests skipped. One unrelated existing test, `partnerships.accounting-values.integration.test.ts`, failed because it invokes a durable fixture without guarding for the missing `ATLAS_TEST_DATABASE_URL`; its cleanup then also runs without an initialized fixture.
- `npm run build:api`: passed.
- `npm run build:web`: passed. Vite reported only its existing large-chunk advisory.
- Focused ESLint across all new and directly modified aggregation files: passed.

Environment-only checks still requiring a workstation with Docker/PostgreSQL are the durable integration/performance cases above. Docker Desktop was unavailable during this run. A live Chrome responsive smoke check was also attempted against the local route, but Chrome blocked automation while another extension panel was open. Automated JSDOM coverage verified the 17rem desktop rail, 44px mobile trigger, focus-managed Escape/return lifecycle, sticky identity column, local table overflow, one-h1 hierarchy, live results, and reduced-motion classes; the 1440/1024/768/390 visual pass should be repeated once the browser panel and database are available.

## 14. Multi-Owner Grouping Verification — 2026-07-17

- Pure API grouping coverage verifies two `AC Bell Investors, LLC` owner records return one page item, retain two members, sum exact money values, and recompute DPI/TVPI; all 20 aggregation composer tests pass.
- Focused API aggregation/contract run: 23 passed and 11 PostgreSQL-only tests skipped because `ATLAS_TEST_DATABASE_URL` is not set in the shell.
- Full Partnership Tracker web suite: 20 files and 55 tests passed, including collapsed parent totals, two expanded owner links, creation modes, accessibility, URL state, and unchanged workspace behavior.
- Full web regression: 52 files and 143 tests passed.
- Full API regression: 82 files and 306 tests passed, with 47 database-dependent tests skipped. The same unrelated `partnerships.accounting-values.integration.test.ts` missing-environment guard remains the only failure.
- API and web production builds passed; Vite emitted only the existing large-chunk advisory. Focused ESLint across all modified aggregation/create-flow files passed.
- Local Docker PostgreSQL is healthy and migration `022_partnership_aggregation_groups.sql` is recorded as applied. The authenticated visual route redirected to sign-in after the local API restart invalidated the prior in-memory session; browser console inspection found no application errors, and interactive rendering remains covered by the passing component suites.
