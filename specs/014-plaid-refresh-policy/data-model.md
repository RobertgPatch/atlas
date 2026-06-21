# Data Model: Plaid Refresh Policy

## Plaid Refresh Policy

**Purpose**: Defines when saved Plaid holdings become stale and when automatic refresh should run.

**Fields**: `id`, `name`, `enabled`, `cadence`, `refresh_time_local`, `timezone`, `stale_after_cutoff`, `manual_refresh_enabled`, `created_at`, `updated_at`.

**Relationships**: Referenced by holdings refresh attempts so each attempt can be traced to the policy that triggered it.

**Validation**:

- Default policy is daily at `05:00` in `America/Los_Angeles`.
- Timezone must be an IANA timezone.
- Only one default active policy should apply to Liquidity in v1.
- Policy values must be visible in admin diagnostics.

## Holdings Refresh Attempt

**Purpose**: Tracks each scheduled, manual, or fallback attempt to refresh Plaid holdings.

**Fields**: `id`, `policy_id`, `requested_by_user_id`, `trigger_source`, `refresh_reason`, `status`, `started_at`, `completed_at`, `scheduled_for`, `freshness_cutoff_at`, `selected_account_ids`, `plaid_request_ids`, `error_type`, `error_code`, `error_message`, `created_at`.

**Relationships**: May produce one successful holdings snapshot; references selected investment accounts by id.

**State Transitions**:

- `pending` when the attempt starts.
- `success` when all selected accounts save holdings successfully.
- `partial_success` when at least one selected account saves holdings and another fails.
- `failed` when no new holdings are saved.
- `skipped` when another refresh already holds the lock or data is already fresh.

**Validation**:

- Only one active refresh attempt may run for the same selected account set.
- Safe error information may be stored, but no Plaid access tokens or raw sensitive payloads.
- A terminal state must include `completed_at`.

## Holdings Snapshot

**Purpose**: A saved successful or partially successful set of holdings facts for selected Plaid accounts.

**Fields**: `id`, `refresh_attempt_id`, `status`, `fetched_at`, `data_as_of_date`, `data_as_of_min_date`, `data_as_of_max_date`, `selected_account_ids`, `created_at`.

**Relationships**: Has many source holdings; belongs to one refresh attempt.

**Validation**:

- Snapshot is considered dashboard-eligible only when status is `success` or `partial_success` and at least one source holding was saved.
- `data_as_of_date` should be derived from Plaid holding/security dates when available; fallback to refresh date only when Plaid does not provide dates.
- Older snapshots must remain queryable for historical trend use.

## Source Holding

**Purpose**: Account-level holding facts from a saved snapshot.

**Fields**: Existing fields plus `sync_snapshot_id`, `plaid_investment_account_id`, `plaid_account_id`, security identifiers, classification fields, numeric holding values, `as_of_date`, and `created_at`.

**Relationships**: Belongs to one holdings snapshot and one investment account.

**Validation**:

- Refresh insertion is append-only for historical snapshots; do not delete previous source holdings during a normal refresh.
- Current dashboard queries select holdings from the latest dashboard-eligible snapshot for each selected account.
- `as_of_date` must be preserved per holding when Plaid provides it.

## Plaid Investment Account

**Purpose**: Display-safe account metadata and report-selection state for a connected Plaid investment account.

**Fields**: Existing fields plus `last_successful_holdings_snapshot_id` or equivalent lookup support, `last_synced_at`, `sync_status`, and `selected_for_holdings_report`.

**Relationships**: Belongs to one Plaid connection; has many source holdings through snapshots.

**Validation**:

- Selection state determines which accounts refresh and display.
- `last_synced_at` is updated only after a successful or partially successful saved refresh for that account.
- Failed refreshes update status without discarding the previous successful snapshot.

## Refresh Diagnostic

**Purpose**: Operator-facing view of refresh health and scheduler readiness.

**Fields**: `refreshPolicy`, `schedulerConfigured`, `schedulerMode`, `freshnessStatus`, `lastAttemptedRefreshAt`, `lastSuccessfulRefreshAt`, `nextRefreshAt`, `activeRefreshId`, `warnings`, `checkedAt`.

**Validation**:

- Diagnostics must not include Plaid access tokens, connection strings, or raw Plaid payloads.
- Production reports a warning when automatic refresh is enabled but no scheduler trigger is configured.
- Users may see freshness status; full scheduler configuration is admin-only.

## Consolidated Holdings Response Metadata

**Purpose**: Adds snapshot freshness context to the existing Liquidity response.

**Fields**: `status`, `freshnessStatus`, `dataAsOfDate`, `dataFetchedAt`, `lastSuccessfulSyncAt`, `nextRefreshAt`, `refreshing`, `activeRefreshId`, `warnings`.

**Validation**:

- Ordinary Liquidity reads populate this metadata from saved snapshots only.
- If no saved snapshot exists, status is `unavailable` or `never_synced` and the UI prompts for manual refresh or Plaid connection.
- If refresh fails, metadata reports stale/failed state while rows come from the last successful snapshot.

## AWS Deployment Baseline

**Purpose**: Captures the production services and relationships required to run the initial Liquidity deployment safely.

**Fields**: `environment_name`, `app_domain`, `region`, `web_origin`, `api_origin`, `database_endpoint`, `scheduler_enabled`, `waf_enabled`, `budget_alerts_enabled`, `manual_setup_completed_at`, `terraform_comparison_status`.

**Relationships**:

- Owns one CloudFront distribution with static web default behavior and `/v1/*` API behavior.
- References one ECS Express Mode/Fargate API service and one private RDS PostgreSQL database.
- References Secrets Manager entries for runtime configuration.
- References CloudWatch log groups, alarms, WAF web ACL, Route 53 records, ACM certificates, and AWS Budgets.

**Validation**:

- One public app domain serves both static web assets and `/v1/*` API requests.
- Authenticated `/v1/*` responses must bypass shared CloudFront caching.
- RDS accepts inbound database traffic only from the API service security group.
- K-1 PDF persistence is not part of the initial baseline unless required by auth/admin/Liquidity.

## Production Security Control

**Purpose**: Deployment-level guardrail for operating sensitive financial and authentication workflows in AWS.

**Fields**: `id`, `category`, `name`, `status`, `enforcement_point`, `evidence`, `last_checked_at`, `owner`, `follow_up_required`.

**Categories**:

- `logging`: API logs, WAF logs, load balancer logs if available, and scheduler logs.
- `alerting`: health check alarms, API error-rate alarms, scheduler failure alarms, database alarms, and budget alerts.
- `secrets`: runtime injection, no committed production `.env`, rotation schedule, and emergency rotation runbook.
- `edge_security`: WAF managed rules, rate-based rules, DDoS baseline, security headers, and TLS policy.
- `application_security`: CSRF controls, XSS-safe rendering, SQL parameterization, secure cookies, auth/session hardening, and refresh abuse prevention.
- `access_control`: IAM least privilege, admin-only diagnostics, API/repository scoping, and Postgres RLS follow-up.
- `cost_control`: budget thresholds, resource sizing, and token/API usage minimization.

**Validation**:

- Launch requires all required controls to be `configured` or `accepted_deferred`.
- Postgres RLS may be `accepted_deferred` only when API/repository scoping tests pass.
- Secrets and tokens must never appear in evidence values.

## Terraform Comparison Artifact

**Purpose**: Documents generated Terraform that mirrors the manually created AWS learning deployment.

**Fields**: `resource_group`, `aws_resource_id`, `terraform_address`, `manual_value`, `terraform_value`, `match_status`, `notes`, `reviewed_at`.

**Relationships**: Tied to the AWS Deployment Baseline and manual runbook steps.

**Validation**:

- Terraform must represent S3, CloudFront, ECS/ECR, RDS, Secrets Manager, EventBridge Scheduler, CloudWatch, WAF, Route 53/ACM, IAM, security groups, and Budgets before adoption as source of truth.
- Differences between manual resources and Terraform must be documented before applying Terraform to production.
- Terraform state and outputs must not expose secret values.

## Production Readiness Diagnostic

**Purpose**: Admin-facing application response describing whether the deployed API sees the production prerequisites it can safely inspect.

**Fields**: `environment`, `durablePersistence`, `schedulerConfigured`, `secretsConfigured`, `secureCookies`, `allowedOrigin`, `rateLimitConfigured`, `apiCachingPolicy`, `scopingStatus`, `warnings`, `checkedAt`.

**Validation**:

- Diagnostic is admin-only and contains no secret values.
- Diagnostic can report app-visible gaps, while external AWS controls such as WAF and Budgets remain validated by the runbook/Terraform comparison.
- `scopingStatus` must distinguish launch-required API/repository scoping from deferred Postgres RLS.
