# Atlas AWS cost-abuse response runbook

## Purpose and authority

Use this runbook when traffic, retries, queue growth, provider calls, storage growth, or billing signals suggest abuse or accidental cost amplification. Runtime workload controls are the fastest containment mechanism. AWS Budgets and Cost Anomaly Detection confirm financial impact later; they are not real-time admission controls.

Only an authenticated Atlas `Admin` may change runtime controls. Use an approved incident ticket, retain the API audit events, and have a second operator review any break-glass allow. Do not paste session cookies, provider credentials, document identifiers, or raw request data into tickets, terminals, dashboards, or chat.

## First five minutes

1. Confirm the production AWS account, `us-west-2` Region, and incident ID before changing anything. Local development is not an AWS target.

   ```powershell
   $AwsProfile = 'atlas-production'
   $AwsRegion = 'us-west-2'
   $IncidentId = 'INC-000000'
   aws sts get-caller-identity --profile $AwsProfile
   ```

2. Open the `${name_prefix}-abuse-cost-operations` CloudWatch dashboard. List active alarms and recent transitions.

   ```powershell
   $AlarmPrefix = 'atlas-production'
   aws cloudwatch describe-alarms `
     --alarm-name-prefix $AlarmPrefix `
     --state-value ALARM `
     --region $AwsRegion `
     --profile $AwsProfile

   aws cloudwatch describe-alarm-history `
     --alarm-name "$AlarmPrefix-abuse-cost-units" `
     --history-item-type StateUpdate `
     --max-records 20 `
     --region $AwsRegion `
     --profile $AwsProfile
   ```

3. Identify the smallest affected workload from the alarm correlations below. Disable that workload through the audited Admin API. If attribution is unclear and provider-cost signals are rising, disable all seven controls; completed-data reads remain available.
4. Confirm the control reads `enabled: false`, provider/cost-unit growth stops, and rejected mutations return bounded `503 WORKLOAD_DISABLED` responses with `Retry-After` and `X-Request-Id`.
5. Preserve evidence: alarm transition time, safe aggregated metrics, control response, incident ticket, and the first/last request IDs. Never include raw IP addresses, cookies, authorization headers, emails, document names, or bodies.

## Alarm interpretation

Alarm names use the deployed `${name_prefix}-<suffix>` pattern.

| Signal | Interpretation | Immediate response |
|---|---|---|
| `cloudfront-requests`, `waf-blocked-requests` | A simultaneous rise with stable ALB/API metrics means the edge is absorbing the traffic. High CloudFront traffic without proportional WAF blocks means allowed traffic is reaching the origin. | Keep WAF protection enabled. Correlate paths with low-cardinality app decisions. Enable the paid-admission global WAF block if paid paths are flooding. |
| `cloudfront-5xx-rate`, `alb-requests`, `alb-target-p95-latency`, `api-5xx`, `api-unhealthy-targets` | Origin saturation, dependency failure, or allowed abusive traffic. | Disable the implicated cost-producing workloads. Check ECS/RDS before increasing capacity; request-driven scaling can increase the bill. |
| `ecs-api-cpu`, `ecs-api-memory`, `ecs-worker-cpu`, `ecs-worker-memory` | Compute pressure. Worker pressure plus BDA/queue growth usually points to K-1 processing; API pressure plus export/provider signals identifies the web workload. | Disable the matching switch and confirm fixed desired counts have not been raised. |
| `rds-cpu`, `rds-connections`, `rds-free-storage` | Admission, session, export, backfill, or cleanup pressure. Low free storage is a capacity incident even if request traffic is normal. | Stop exports/backfills first, then other writes as evidence dictates. Keep cheap completed-data reads available. Do not fail open paid work if admission storage is unhealthy. |
| `abuse-protection-decisions` | A rise in throttled/quota-rejected events is expected containment. A rise in protection-unavailable is a control-plane incident; paid work must remain fail closed. | Inspect decision/reason dimensions only. Do not loosen limits merely to clear the alarm. |
| `abuse-provider-calls`, `abuse-retry-attempts`, `abuse-cost-units` | Direct indicators of variable-cost amplification. Retries rising faster than successful operations suggest a provider outage or unknown outcomes. | Disable the named workload. Do not replay unknown operations; reconcile using existing idempotency/provider tokens. |
| K-1 queue age/depth/DLQ, `k1-worker-errors`, `k1-extraction-failures`, `k1-apply-failures`, `k1-reconciliation-lag`, `k1-page-count` | Queue backlog, poisoned messages, reconciliation failure, or BDA page-cost growth. | Disable `k1_extraction`; disable `k1_bedrock_checkbox` separately if extraction is healthy and only model verification is increasing. Preserve the DLQ. |
| `abuse-cleanup-failures` and `${name_prefix}-s3-put-requests` | Retention cleanup is failing or unaccepted uploads are accumulating. S3 `PutRequests` is a request-growth proxy, so correlate it with admitted K-1 file/storage units before attribution. | Disable `k1_uploads`, inspect quarantine lifecycle/cleanup, and avoid deleting accepted evidence during incident response. |
| Scheduler target errors | A scheduled Plaid or market-data invocation failed. Repeated delivery can compound retries. | Disable `plaid_refresh` or `market_data_refresh`; leave cached observations readable. |
| Total/Bedrock actual or forecast budget, Cost Anomaly Detection | Financial backstop based on delayed billing data, not proof that traffic is still active. | Contain with runtime/edge signals immediately, then use Cost Explorer and the cost envelope to quantify impact. |

## Runtime kill switches

The API is the preferred immediate control plane because every change is Admin-authorized and audited. Use the CloudFront application URL, never the private origin. Obtain an Admin session cookie jar through the normal approved login flow and keep the file access-restricted.

```powershell
$ApiBase = 'https://app.example.com/v1'
$CookieJar = Join-Path $env:TEMP 'atlas-admin-session.cookies'
$DisableUntil = (Get-Date).ToUniversalTime().AddHours(4).ToString('o')

function Disable-AtlasWorkload {
  param(
    [Parameter(Mandatory)]
    [ValidateSet(
      'k1_uploads',
      'k1_extraction',
      'k1_bedrock_checkbox',
      'plaid_refresh',
      'market_data_refresh',
      'report_exports',
      'backfills'
    )]
    [string]$ControlKey,
    [Parameter(Mandatory)][string]$Reason
  )

  $body = @{
    mode = 'disable'
    value = @{}
    reason = $Reason
    ticketReference = $IncidentId
    expiresAt = $DisableUntil
  } | ConvertTo-Json -Compress

  curl.exe --silent --show-error --fail-with-body `
    --request PUT `
    --cookie $CookieJar `
    --header 'Content-Type: application/json' `
    --data-binary $body `
    "$ApiBase/admin/protection-controls/$ControlKey"
  if ($LASTEXITCODE -ne 0) { throw "Failed to disable $ControlKey" }
}

curl.exe --silent --show-error --fail-with-body `
  --cookie $CookieJar `
  "$ApiBase/admin/protection-controls"
```

The default maximum override duration is 24 hours. Use a shorter incident window and renew only after review.

| Control key | Disable command | New side effects stopped | Safe completed-data behavior |
|---|---|---|---|
| `k1_uploads` | `Disable-AtlasWorkload k1_uploads "$IncidentId stop new K-1 upload slots"` | New upload batches, presigned S3 slots, unaccepted object/storage growth. | Existing accepted K-1 documents, review sessions, and tracker reads remain available. |
| `k1_extraction` | `Disable-AtlasWorkload k1_extraction "$IncidentId stop queue and BDA extraction"` | New extraction admission, queue/BDA submission, reparse/retry provider work. An already accepted provider call might finish. | Existing extraction results and accepted evidence remain readable. Preserve queued/DLQ messages for reconciliation. |
| `k1_bedrock_checkbox` | `Disable-AtlasWorkload k1_bedrock_checkbox "$IncidentId stop Bedrock checkbox verification"` | New optional Bedrock model verification and its retries. | BDA extraction and existing reviewed evidence can continue independently. |
| `plaid_refresh` | `Disable-AtlasWorkload plaid_refresh "$IncidentId stop Plaid calls"` | New link tokens, token exchanges, manual/scheduled holdings refreshes, and provider retries. | Durable saved holdings and reports remain readable, with normal freshness metadata. |
| `market_data_refresh` | `Disable-AtlasWorkload market_data_refresh "$IncidentId stop market provider calls"` | Scheduled/manual market-provider refresh calls and retries. | Saved closing-price observations and Liquidity reports remain readable; production must not refresh on read. |
| `report_exports` | `Disable-AtlasWorkload report_exports "$IncidentId stop report generation"` | New report, consolidated-holdings, and K-1 CSV exports. | Paginated/ordinary completed-data report views remain available. |
| `backfills` | `Disable-AtlasWorkload backfills "$IncidentId stop backfill runs"` | New market-price backfill runs. | Existing observations and reports remain available. Market provider calls can be stopped independently. |

If workload attribution is not yet safe, disable all cost-producing controls:

```powershell
@(
  'k1_uploads',
  'k1_extraction',
  'k1_bedrock_checkbox',
  'plaid_refresh',
  'market_data_refresh',
  'report_exports',
  'backfills'
) | ForEach-Object {
  Disable-AtlasWorkload $_ "$IncidentId emergency variable-cost containment"
}
```

Environment variables with the same hard-stop authority are `K1_UPLOADS_ENABLED`, `K1_EXTRACTION_ENABLED`, `K1_BEDROCK_CHECKBOX_ENABLED`, `PLAID_REFRESH_ENABLED`, `MARKET_DATA_REFRESH_ENABLED`, `REPORT_EXPORTS_ENABLED`, and `BACKFILLS_ENABLED`. Setting one to `false` in the reviewed production Terraform inputs and deploying the exact saved plan is a durable hard disable. A runtime override cannot bypass it. Do not make an untracked console-only task definition the long-term source of truth.

## Edge emergency circuit breaker

If paid-admission paths are flooding across rotating sources, ensure the global paid WAF rule is in `block` mode. This is broad and should accompany, not replace, workload controls.

Set `waf_paid_admission_global_emergency_action=block` in the ignored production
operator input, then use `npm run deploy:aws:production -- -Mode Prepare` and
the separately confirmed `-Mode Apply` flow. The shared plan policy, immutable
manifest, and execution evidence remain mandatory during an incident.

Verify the rule action and CloudFront/WAF metrics after propagation. Never change managed reputation/input rules to count or allow during an active cost-abuse event.

## Break glass

`temporary_allow` is only for a confirmed false positive affecting one named workload. It cannot override an environment hard disable. Require an incident/change ticket beginning with `BREAKGLASS-`, a second human approver, a narrow expiry (normally 30 minutes), and monitoring for the entire window. It never raises the separately configured global emergency ceiling.

```powershell
$ControlKey = 'report_exports'
$BreakGlassTicket = "BREAKGLASS-$IncidentId"
$body = @{
  mode = 'temporary_allow'
  value = @{}
  reason = "$IncidentId confirmed false positive; approved narrow recovery window"
  ticketReference = $BreakGlassTicket
  expiresAt = (Get-Date).ToUniversalTime().AddMinutes(30).ToString('o')
} | ConvertTo-Json -Compress

curl.exe --silent --show-error --fail-with-body `
  --request PUT `
  --cookie $CookieJar `
  --header 'Content-Type: application/json' `
  --data-binary $body `
  "$ApiBase/admin/protection-controls/$ControlKey"
```

Do not use break glass to clear alarms, process a backlog faster, bypass an unavailable admission store, or replay operations with unknown provider outcomes.

## Verification and rollback

1. List controls and confirm the expected source/mode/expiry.
2. Observe at least two five-minute metric periods. Provider calls, retry attempts, cost units, and new queue/object work for the disabled workload must stop. In-flight calls may finish once.
3. Check cheap liveness and one authorized completed-data read. Do not use a provider refresh, export, upload, or backfill as a smoke test.
4. Reconcile unknown provider operations and queued messages using existing operation IDs, fencing tokens, and provider idempotency tokens. Never bulk replay.
5. Correct the cause and update `.security/cost-guardrails.yml` if a price, retry limit, workload key, or ceiling changed. Run `npm run security:cost-envelope` before recovery.
6. Revoke only the affected runtime override and monitor for at least 15 minutes:

   ```powershell
   $ControlKey = 'report_exports'
   curl.exe --silent --show-error --fail-with-body `
     --request DELETE `
     --cookie $CookieJar `
     "$ApiBase/admin/protection-controls/$ControlKey"

   curl.exe --silent --show-error --fail-with-body `
     --cookie $CookieJar `
     "$ApiBase/admin/protection-controls"
   ```

7. Re-enable a hard environment switch only through a reviewed task-definition/Terraform deployment. Return the global WAF rule to its approved rollout action only after traffic and cost-unit signals remain normal.

## Budget and anomaly-delay caveats

- AWS Budgets uses delayed billing data. AWS documents that budget data is refreshed at least daily, with updates commonly 8-12 hours apart, and charges can continue beyond a notification threshold before an alert arrives. Forecast alerts also need roughly five weeks of usage history. See [AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) and [Managing costs with AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).
- Cost Anomaly Detection runs after billing data is processed and can take up to 24 hours to identify usage; a new monitor can take 24 hours to start, and a new service needs historical usage before detection. See [AWS Cost Anomaly Detection](https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html).
- Actual/forecast total budgets, Bedrock-specific budgets, and anomaly subscriptions are confirmation and governance controls. Five-minute CloudWatch alarms, WAF, exact application admissions, and workload kill switches are the containment controls.
- The validated maximum daily cost is a conservative upper bound, not a promise that AWS or vendor invoices will equal it. It excludes fixed baseline service cost and must be re-reviewed before its dated deadline.
