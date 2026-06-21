# Feature Specification: Plaid Refresh Policy

**Feature Branch**: `codex/014-write-liquidity-page-prompt`  
**Created**: 2026-06-21  
**Status**: Draft  
**Input**: User description: "Fix Liquidity so Plaid data is saved durably, dashboard views use saved data instead of refreshing every time, freshness rules determine when new data is requested, the default refresh is daily at 5:00 AM Pacific time, saved values include the date they came from for historical trends, and any infrastructure impact is called out."

## Clarifications

### Session 2026-06-21

- Q: Which AWS provisioning approach should guide the initial deployment? -> A: Manual AWS console setup first, with equivalent Terraform produced for comparison and future codification.
- Q: What should the initial AWS deployment scope include? -> A: Liquidity plus the auth/admin basics required to use it, with production logging, alerts, caching, cost controls, rate limiting, security hardening, secret management, token rotation, row-level access controls, and abuse/DDoS protection included.
- Q: What public domain and edge-routing model should the AWS deployment use? -> A: Use one public app domain with the web app as the default origin and `/v1/*` routed to the API origin.
- Q: What API response caching boundary should the AWS deployment enforce? -> A: Edge-cache static web assets only; authenticated `/v1/*` API responses must not use shared CDN caching.
- Q: What row-level security scope should the first AWS Liquidity deployment use? -> A: Enforce user/entity/account scoping in the API and repository layer for the first AWS deployment, with Postgres RLS planned as a hardening follow-up after the access model is stable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load Liquidity From Saved Data (Priority: P1)

As an Atlas user, I want the Liquidity page to open from the latest saved Plaid holdings instead of calling Plaid every time I view the dashboard, so the page is fast, reliable, and not dependent on a third-party request during normal browsing.

**Why this priority**: This is the core behavior change. Viewing holdings should be a read from Atlas data unless a refresh rule explicitly says new Plaid data is needed.

**Independent Test**: Seed saved Plaid holdings for selected accounts, open the Liquidity page repeatedly, and verify the same saved snapshot is displayed without initiating a new Plaid refresh.

**Acceptance Scenarios**:

1. **Given** a selected Plaid account has a successful saved holdings snapshot, **When** a user opens Liquidity before the refresh window expires, **Then** the page shows the saved snapshot without requesting new Plaid holdings.
2. **Given** multiple users open Liquidity around the same time, **When** the latest saved snapshot is still fresh, **Then** each user sees saved data and no duplicate Plaid refresh is started for those reads.
3. **Given** saved holdings exist, **When** the Liquidity page displays them, **Then** the page clearly shows the data-as-of date and latest refresh status.

---

### User Story 2 - Refresh Holdings On A Daily Policy (Priority: P1)

As an Atlas user, I want Plaid holdings refreshed on a predictable daily cadence, defaulting to 5:00 AM Pacific time, so the dashboard is current enough without unnecessary Plaid calls.

**Why this priority**: The freshness policy determines when saved data should be trusted and when Atlas should pay the cost and risk of refreshing from Plaid.

**Independent Test**: Configure a daily 5:00 AM Pacific refresh rule, create saved holdings from before and after the cutoff, and verify Atlas only refreshes when the rule says the snapshot is stale.

**Acceptance Scenarios**:

1. **Given** the latest successful snapshot was captured after today's 5:00 AM Pacific cutoff, **When** a user opens Liquidity, **Then** Atlas returns saved data and marks it fresh.
2. **Given** the latest successful snapshot was captured before today's 5:00 AM Pacific cutoff, **When** the daily refresh job runs, **Then** Atlas requests fresh Plaid holdings, saves a new snapshot, and uses that snapshot for future views.
3. **Given** the scheduled refresh fails, **When** a user opens Liquidity, **Then** Atlas still shows the latest successful saved snapshot with a visible stale or failed-refresh status instead of showing an empty dashboard.
4. **Given** an authorized user manually refreshes holdings, **When** Plaid returns new data, **Then** Atlas saves a new dated snapshot and the dashboard switches to that snapshot.

---

### User Story 3 - Preserve Historical Liquidity Snapshots (Priority: P2)

As an Atlas operator or user reviewing portfolio movement, I want each saved Plaid refresh to keep the date the data represents, so future reports can show historical trends instead of only the latest values.

**Why this priority**: Durable historical snapshots turn the refresh process into an audit and trend source, not just a cache.

**Independent Test**: Save holdings snapshots for different as-of dates, query the latest dashboard view, and query historical data to confirm both latest and prior snapshots remain available.

**Acceptance Scenarios**:

1. **Given** Plaid returns holdings with an as-of date, **When** Atlas saves the refresh, **Then** each source holding and snapshot records the data-as-of date separately from the time Atlas fetched it.
2. **Given** multiple daily refreshes have succeeded, **When** Atlas builds the current Liquidity dashboard, **Then** it uses the latest successful snapshot for each selected account while retaining older snapshots.
3. **Given** a future trend view needs prior values, **When** it requests historical holdings by date range, **Then** Atlas can retrieve saved snapshots without calling Plaid.

---

### User Story 4 - Make Refresh Configuration Visible (Priority: P3)

As an operator, I want to know the active Plaid refresh cadence, last run result, and whether the app needs scheduler infrastructure, so I can keep production predictable.

**Why this priority**: The daily refresh rule affects operations and Plaid usage. Operators need visibility without reading logs or code.

**Independent Test**: Review refresh status and configuration through diagnostics and confirm it reports the next scheduled refresh, last successful refresh, and any infrastructure warnings.

**Acceptance Scenarios**:

1. **Given** refresh scheduling is configured, **When** an admin checks diagnostics, **Then** Atlas reports the refresh timezone, cutoff time, last successful refresh, last attempted refresh, and next expected refresh.
2. **Given** production has no scheduler configured, **When** diagnostics are checked, **Then** Atlas warns that automatic daily refreshes will not run and manual/on-demand refresh is the fallback.

### Edge Cases

- Plaid is unavailable or rate-limited during the scheduled 5:00 AM refresh.
- A user opens Liquidity while a refresh is already running.
- A selected account has never had a successful holdings snapshot.
- A Plaid account is disconnected or requires update mode before the scheduled refresh.
- Refresh data arrives with mixed or missing as-of dates across accounts or securities.
- The app is deployed or restarted during the scheduled refresh window.
- More than one application instance or job runner attempts the same scheduled refresh.
- A manual refresh is requested shortly before or after the scheduled refresh.
- Malicious or abusive requests attempt XSS, CSRF, SQL injection, credential stuffing, bot scraping, excessive refresh calls, or denial-of-service behavior.
- A secret, token, or persisted encryption key approaches its rotation window or is suspected to be exposed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display Liquidity holdings from the latest successful saved snapshot by default.
- **FR-002**: The system MUST NOT call Plaid as part of ordinary Liquidity page reads when a saved snapshot is available.
- **FR-003**: The system MUST save Plaid holdings responses before reporting a refresh as successful.
- **FR-004**: The system MUST record both the time a refresh was fetched and the date the holdings data represents.
- **FR-005**: The system MUST keep prior successful snapshots so historical trends can be built later.
- **FR-006**: The system MUST default the automatic refresh cadence to daily at 5:00 AM Pacific time.
- **FR-007**: The system MUST determine freshness from the latest successful snapshot compared with the active refresh policy.
- **FR-008**: The system MUST show users whether displayed holdings are fresh, stale, refreshing, failed, or unavailable.
- **FR-009**: The system MUST return the latest successful saved snapshot when refresh fails, with clear stale or failed-refresh status.
- **FR-010**: The system MUST support an authorized manual refresh that saves a new snapshot and updates the displayed data after success.
- **FR-011**: The system MUST prevent duplicate concurrent refreshes for the same Plaid connection or selected account set.
- **FR-012**: The system MUST record refresh attempts, status, error reason, start time, completion time, and triggering source.
- **FR-013**: The system MUST expose the active refresh policy and refresh diagnostics to administrators without exposing Plaid tokens or sensitive data.
- **FR-014**: The system MUST allow the refresh cadence and timezone to be changed through configuration without code changes.
- **FR-015**: The system MUST make automatic scheduling requirements explicit in production diagnostics.
- **FR-016**: The system MUST avoid introducing additional infrastructure unless it provides clear value for this feature's expected 5-10 user scale.
- **FR-017**: The initial AWS deployment runbook MUST guide manual service creation and produce equivalent Terraform that can be compared against the manual setup before being used as the production source of truth.
- **FR-018**: The initial AWS deployment MUST include only the services required for Liquidity plus the authentication and administrator workflows needed to access and operate Liquidity.
- **FR-019**: The production baseline MUST include centralized logs, error visibility, health checks, alarms, cost budgets, and cost-aware resource sizing.
- **FR-020**: The production baseline MUST include rate limiting, bot/abuse controls, DDoS protection, and security rules for common web vulnerabilities including XSS, CSRF, SQL injection, and credential abuse.
- **FR-021**: The production baseline MUST store secrets outside committed environment files, inject them securely at runtime, and document rotation policies for Plaid credentials, session secrets, persistence encryption keys, scheduler tokens, and database credentials.
- **FR-022**: The production baseline MUST minimize third-party token/API usage by serving ordinary Liquidity reads from saved data, caching only safe responses, and preventing repeated or abusive refresh requests.
- **FR-023**: The production baseline MUST enforce least-privilege access controls across users, application roles, database access, infrastructure permissions, and administrative operations.
- **FR-024**: The AWS edge layer MUST serve the web app and API behind one public app domain, forwarding `/v1/*` requests to the API origin while keeping web assets as the default origin.
- **FR-025**: The AWS edge layer MUST cache static web assets only and MUST NOT place authenticated `/v1/*` financial API responses in a shared CDN cache.
- **FR-026**: The first AWS deployment MUST validate user/entity/account data scoping in the application and repository layer before launch, and MUST track Postgres row-level security as a required hardening follow-up rather than a first-launch blocker.

### Key Entities *(include if feature involves data)*

- **Plaid Refresh Policy**: The configured cadence, timezone, daily cutoff time, freshness rules, and whether automatic refresh is enabled.
- **Holdings Refresh Attempt**: A single attempt to refresh Plaid holdings, including trigger source, timestamps, status, and safe error information.
- **Holdings Snapshot**: A saved set of holdings values tied to selected accounts, fetch time, data-as-of date, and success status.
- **Source Holding**: Account-level holding facts from a saved snapshot, including value, quantity, price, identifiers, classification, and data-as-of date.
- **Refresh Diagnostic**: Operator-facing status showing freshness, last run, next expected run, scheduler availability, and warnings.
- **Production Security Control**: A deployment-level guardrail such as secret storage, token rotation, request filtering, rate limiting, role-based access, database access boundary, logging, alerting, budget control, or abuse protection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening Liquidity 10 times in a row with fresh saved data causes 0 Plaid holdings refreshes.
- **SC-002**: With fresh saved data available, 95% of Liquidity page loads show holdings in under 2 seconds for the expected 5-10 user audience.
- **SC-003**: A scheduled refresh after the 5:00 AM Pacific cutoff saves a new dated snapshot and uses it for subsequent dashboard views.
- **SC-004**: If Plaid refresh fails, users still see the last successful saved snapshot and a clear stale or failed status.
- **SC-005**: At least 30 days of successful daily snapshots can be retained and distinguished by data-as-of date.
- **SC-006**: Production diagnostics identify whether automatic refresh scheduling is active and whether any additional scheduler infrastructure is required.
- **SC-007**: The initial AWS deployment can be validated with health checks, log review, alert delivery, budget alarms, blocked abusive requests, and no committed production secrets.

## Assumptions

- "5am PST" means 5:00 AM Pacific business time using the `America/Los_Angeles` timezone, including daylight saving time.
- The expected production audience remains small, approximately 5-10 users.
- The existing durable data store remains the source of truth for Plaid connections, snapshots, and dashboard reads.
- Additional caching infrastructure is not required for the initial implementation unless future concurrency, queueing, or multi-instance scale changes.
- AWS provisioning starts as a manual learning deployment, with Terraform generated in parallel for review and later adoption.
- The first AWS deployment intentionally excludes K-1 document upload/PDF persistence unless it is required for authentication, administration, or Liquidity operation.
- The AWS public URL model uses one app domain rather than separate app and API subdomains.
- Liquidity performance comes from saved database snapshots and browser/query reuse, not shared CDN caching of authenticated API responses.
- Production secrets are managed by cloud secret storage and local `.env` files remain development-only.
- Postgres row-level security is deferred until after the first AWS Liquidity deployment, but application/repository access scoping is required before launch.
- Saved snapshots may be stale but should be labeled rather than hidden when refresh fails.
- Manual refresh remains available to authorized users even when automatic scheduling is configured.
