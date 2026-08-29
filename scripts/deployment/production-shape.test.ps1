[CmdletBinding()]
param(
  [string]$ImageTag = 'atlas-api:feature-029-production-shape',
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 12)
$networkName = "atlas-029-shape-$suffix"
$databaseName = "atlas-029-shape-db-$suffix"
$apiName = "atlas-029-shape-api-$suffix"
$environmentFile = Join-Path ([IO.Path]::GetTempPath()) "atlas-029-shape-$suffix.env"
$networkCreated = $false

Import-Module (Join-Path $PSScriptRoot 'production-release.psm1') -Force

function Invoke-DockerChecked {
  param([Parameter(Mandatory = $true)] [string[]] $Arguments, [string] $FailureMessage)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

try {
  if (-not $SkipBuild) {
    Invoke-DockerChecked -Arguments @(
      'build', '--platform', 'linux/amd64', '-f', 'apps/api/Dockerfile',
      '-t', $ImageTag, '.'
    ) -FailureMessage 'Production-shape API image build failed.'
  }

  Invoke-DockerChecked -Arguments @('network', 'create', $networkName) -FailureMessage 'Could not create the isolated shape-test network.'
  $networkCreated = $true
  Invoke-DockerChecked -Arguments @(
    'run', '--detach', '--name', $databaseName, '--network', $networkName,
    '--env', 'POSTGRES_DB=atlas', '--env', 'POSTGRES_USER=postgres',
    '--env', 'POSTGRES_PASSWORD=shape-password', 'postgres:16'
  ) -FailureMessage 'Could not start the isolated shape-test database.'

  $databaseReady = $false
  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    & docker exec $databaseName pg_isready -U postgres -d atlas 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $databaseReady) { throw 'Production-shape PostgreSQL did not become ready.' }

  @"
NODE_ENV=production
ATLAS_RUNTIME=production
PORT=3000
DATABASE_URL=postgres://postgres:shape-password@$databaseName`:5432/atlas
REQUIRE_DURABLE_PERSISTENCE=true
PERSISTENCE_SECRET_KEY=shape-persistence-key-material-000000000000000000000000
SESSION_SECRET=shape-session-key-material-000000000000000000000000000
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
SESSION_IDLE_TIMEOUT_SECONDS=1800
SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS=60
SESSION_ABSOLUTE_TIMEOUT_SECONDS=28800
TRUSTED_PROXY_CIDRS=127.0.0.0/8
WEB_ORIGIN=https://shape.example.invalid
ADMIN_EMAIL=shape-admin@example.invalid
ADMIN_PASSWORD=shape-local-password
USER_EMAIL=shape-user@example.invalid
USER_PASSWORD=shape-local-password
AWS_REGION=us-west-2
K1_AWS_INGESTION_ENABLED=false
K1_EXTRACTOR=stub
K1_OBJECT_STORE=local
K1_QUEUE=local
MARKET_DATA_PROVIDER=none
PLAID_ENV=sandbox
ABUSE_HMAC_KEY_ID=shape-v1
ABUSE_HMAC_ACTIVE_KEY=shape-abuse-hmac-key-material-000000000000000000000000
ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS=2500
ABUSE_K1_GLOBAL_FILES_PER_MONTH=50
ABUSE_K1_BDA_CALLS_PER_MONTH=1
ABUSE_K1_CHECKBOX_CALLS_PER_MONTH=4
ABUSE_PLAID_LINK_TOKENS_PER_MONTH=10
ABUSE_PLAID_EXCHANGES_PER_MONTH=5
ABUSE_PLAID_REFRESHES_PER_MONTH=2
ABUSE_MARKET_PROVIDER_CALLS_PER_MONTH=25
ABUSE_EXPORTS_PER_MONTH=40
ABUSE_BACKFILL_RUNS_PER_MONTH=1
ABUSE_K1_USER_BATCHES_PER_HOUR=5
ABUSE_K1_USER_FILES_PER_DAY=100
ABUSE_K1_GLOBAL_FILES_PER_DAY=500
ABUSE_K1_GLOBAL_UNACCEPTED_BYTES=5368709120
ABUSE_K1_ACTIVE_BATCHES_PER_USER=3
ABUSE_K1_USER_DOCUMENTS_PER_DAY=25
ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY=100
ABUSE_K1_RETRIES_PER_DOCUMENT_PER_DAY=2
ABUSE_K1_LIFETIME_RETRIES_PER_DOCUMENT=5
ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT=5
ABUSE_K1_EXTRACTION_GLOBAL_BACKLOG=100
ABUSE_K1_CHECKBOX_CALLS_GLOBAL_PER_DAY=50
ABUSE_PLAID_LINK_TOKENS_USER_PER_DAY=5
ABUSE_PLAID_EXCHANGES_USER_PER_DAY=5
ABUSE_PLAID_REFRESHES_ACCOUNT_PER_DAY=4
ABUSE_PLAID_REFRESHES_GLOBAL_PER_DAY=25
ABUSE_MARKET_REFRESH_RUNS_GLOBAL_PER_DAY=24
ABUSE_MARKET_PROVIDER_CALLS_GLOBAL_PER_DAY=200
ABUSE_PROVIDER_GLOBAL_CONCURRENCY=2
ABUSE_EXPORT_USER_PER_DAY=10
ABUSE_EXPORT_GLOBAL_PER_DAY=50
ABUSE_EXPORT_GLOBAL_CONCURRENCY=2
ABUSE_EXPORT_USER_ROWS_PER_DAY=250000
ABUSE_EXPORT_USER_BYTES_PER_DAY=536870912
ABUSE_BACKFILL_GLOBAL_RUNS_PER_DAY=1
ABUSE_BACKFILL_GLOBAL_CONCURRENCY=1
ABUSE_BACKFILL_MAX_ROWS_PER_RUN=100000
ABUSE_SCHEDULER_OPERATIONS_PER_WINDOW=1
ABUSE_SCHEDULER_WINDOW_SECONDS=300
ABUSE_SCHEDULER_GLOBAL_CONCURRENCY=1
ABUSE_BDA_MAX_ATTEMPTS=3
ABUSE_BEDROCK_MAX_ATTEMPTS=2
ABUSE_PLAID_MAX_ATTEMPTS=2
ABUSE_MARKET_DATA_MAX_ATTEMPTS=2
ABUSE_SQS_MAX_RECEIVES=5
ABUSE_BDA_TIMEOUT_MS=60000
ABUSE_BEDROCK_TIMEOUT_MS=30000
ABUSE_PLAID_TIMEOUT_MS=10000
ABUSE_MARKET_DATA_TIMEOUT_MS=10000
ABUSE_EXPORT_TIMEOUT_MS=30000
ABUSE_BACKFILL_TIMEOUT_MS=60000
K1_UPLOADS_ENABLED=false
K1_EXTRACTION_ENABLED=false
K1_BEDROCK_CHECKBOX_ENABLED=false
PLAID_REFRESH_ENABLED=false
MARKET_DATA_REFRESH_ENABLED=false
REPORT_EXPORTS_ENABLED=false
BACKFILLS_ENABLED=false
"@ | Set-Content -LiteralPath $environmentFile -Encoding ascii

  Invoke-DockerChecked -Arguments @(
    'run', '--detach', '--name', $apiName, '--network', $networkName,
    '--cpus', '0.25', '--memory', '512m', '--publish', '127.0.0.1::3000',
    '--env-file', $environmentFile, $ImageTag
  ) -FailureMessage 'Could not start the production-shape API container.'

  $limits = (& docker inspect --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}' $apiName).Trim()
  if ($limits -ne '250000000 536870912') { throw 'Docker did not apply the required 0.25 vCPU/0.5 GiB limits.' }
  $portMapping = (& docker port $apiName 3000/tcp).Trim()
  if ($portMapping -notmatch ':(\d+)$') { throw 'Could not resolve the production-shape API port.' }
  $port = $Matches[1]

  $ready = $false
  for ($attempt = 1; $attempt -le 120; $attempt += 1) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/internal/readiness" -TimeoutSec 1
      if ($response.status -eq 'ready' -and $response.persistence.databaseReachable -eq $true) { $ready = $true; break }
    } catch { }
    $running = (& docker inspect --format '{{.State.Running}}' $apiName 2>$null).Trim()
    if ($running -ne 'true') { break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $rawLogs = (& docker logs --tail 40 $apiName 2>&1 | Out-String)
    $ErrorActionPreference = $previousErrorAction
    $safeLogs = Protect-DeploymentText -Text $rawLogs
    throw "Production-shape API did not complete migrations and readiness. Redacted logs: $safeLogs"
  }

  $apiRoot = "http://127.0.0.1:$port"
  & node (Join-Path $PSScriptRoot 'production-shape-smoke.mjs') $apiRoot
  if ($LASTEXITCODE -ne 0) { throw 'Production-shape retained reads failed.' }

  Write-Output 'PASS production-shaped linux/amd64 image: 0.25 vCPU/0.5 GiB, migrations, readiness, and retained reads.'
}
finally {
  & docker rm --force $apiName 2>$null | Out-Null
  & docker rm --force $databaseName 2>$null | Out-Null
  if ($networkCreated) { & docker network rm $networkName 2>$null | Out-Null }
  if (Test-Path -LiteralPath $environmentFile) { Remove-Item -LiteralPath $environmentFile -Force }
}
