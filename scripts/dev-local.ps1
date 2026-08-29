[CmdletBinding()]
param(
  [switch]$LibraryOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LocalEnvironmentValue {
  param(
    [Parameter(Mandatory = $true)] [System.Collections.IDictionary] $Environment,
    [Parameter(Mandatory = $true)] [string] $Name
  )
  if ($Environment.Contains($Name)) { return [string]$Environment[$Name] }
  return ''
}

function Test-LoopbackPostgresUrl {
  param([Parameter(Mandatory = $true)] [string] $DatabaseUrl)
  try { $uri = [Uri]$DatabaseUrl } catch { return $false }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { return $false }
  $hostName = $uri.Host.Trim('[', ']').ToLowerInvariant()
  return $hostName -eq 'localhost' -or $hostName -eq '::1' -or $hostName -match '^127(?:\.\d{1,3}){3}$'
}

function Test-LocalDevelopmentBoundary {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [System.Collections.IDictionary] $Environment)

  $nodeEnvironment = Get-LocalEnvironmentValue $Environment 'NODE_ENV'
  if ($nodeEnvironment -and $nodeEnvironment -ne 'development') {
    throw 'The local launcher requires NODE_ENV=development.'
  }
  $runtimeClass = Get-LocalEnvironmentValue $Environment 'ATLAS_RUNTIME'
  if ($runtimeClass -and $runtimeClass -ne 'local') {
    throw 'The local launcher refuses a non-local runtime.'
  }

  $databaseUrl = Get-LocalEnvironmentValue $Environment 'DATABASE_URL'
  if ($databaseUrl -and -not (Test-LoopbackPostgresUrl $databaseUrl)) {
    throw 'The local launcher requires a loopback PostgreSQL DATABASE_URL.'
  }

  $exactLocal = [ordered]@{
    K1_EXTRACTOR = 'stub'
    K1_OBJECT_STORE = 'local'
    K1_QUEUE = 'local'
    K1_AWS_INGESTION_ENABLED = 'false'
    MARKET_DATA_PROVIDER = 'none'
  }
  foreach ($entry in $exactLocal.GetEnumerator()) {
    $value = Get-LocalEnvironmentValue $Environment $entry.Key
    if ($value -and $value -ne $entry.Value) {
      throw "The local launcher refuses provider setting $($entry.Key)."
    }
  }

  $plaidEnvironment = Get-LocalEnvironmentValue $Environment 'PLAID_ENV'
  if ($plaidEnvironment -and $plaidEnvironment -ne 'sandbox') {
    throw 'The local launcher refuses non-sandbox Plaid environments.'
  }

  foreach ($key in @(
    'K1_S3_BUCKET', 'K1_KMS_KEY_ARN', 'K1_WORK_QUEUE_URL',
    'K1_COMPLETION_QUEUE_URL', 'K1_BDA_PROFILE_ARN', 'K1_BDA_PROJECT_ARN',
    'AWS_APP_DOMAIN', 'AWS_CLOUDFRONT_DISTRIBUTION_ID', 'AWS_WEB_ASSETS_BUCKET'
  )) {
    if (Get-LocalEnvironmentValue $Environment $key) {
      throw "The local launcher refuses configured AWS resource $key."
    }
  }

  $awsProfile = Get-LocalEnvironmentValue $Environment 'AWS_PROFILE'
  if ($awsProfile -match '(?i)(^|[-_])prod(?:uction)?($|[-_])') {
    throw 'The local launcher refuses an AWS production profile.'
  }
  $accountId = Get-LocalEnvironmentValue $Environment 'AWS_ACCOUNT_ID'
  $productionAccountId = Get-LocalEnvironmentValue $Environment 'ATLAS_PRODUCTION_ACCOUNT_ID'
  if ($accountId -and $productionAccountId -and $accountId -eq $productionAccountId) {
    throw 'The local launcher refuses the production AWS account identity.'
  }
  if ((Get-LocalEnvironmentValue $Environment 'TF_VAR_environment_name') -eq 'production') {
    throw 'The local launcher refuses production Terraform markers.'
  }
  if ((Get-LocalEnvironmentValue $Environment 'ATLAS_ALLOW_AWS_MUTATION') -eq 'true') {
    throw 'The local launcher refuses AWS mutation flags.'
  }

  return $true
}

function Invoke-LocalDevelopmentSequence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [scriptblock] $StartDatabaseAction,
    [Parameter(Mandatory = $true)] [scriptblock] $DatabaseReadyAction,
    [Parameter(Mandatory = $true)] [scriptblock] $MigrationAction,
    [Parameter(Mandatory = $true)] [scriptblock] $StartApiAction,
    [Parameter(Mandatory = $true)] [scriptblock] $ReadinessAction,
    [Parameter(Mandatory = $true)] [scriptblock] $StartWorkerAction,
    [Parameter(Mandatory = $true)] [scriptblock] $StartWebAction
  )

  & $StartDatabaseAction
  if (-not (& $DatabaseReadyAction)) {
    throw 'Local PostgreSQL readiness failed; no application child process was started.'
  }
  & $MigrationAction
  $apiProcess = & $StartApiAction
  if (-not (& $ReadinessAction)) {
    throw 'API /internal/readiness timed out; worker and web startup were suppressed.'
  }
  & $StartWorkerAction
  & $StartWebAction
  return $apiProcess
}

function Set-CanonicalLocalEnvironment {
  $env:NODE_ENV = 'development'
  $env:ATLAS_RUNTIME = 'local'
  if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:15432/atlas' }
  $env:K1_EXTRACTOR = 'stub'
  $env:K1_OBJECT_STORE = 'local'
  $env:K1_QUEUE = 'local'
  $env:K1_AWS_INGESTION_ENABLED = 'false'
  $env:MARKET_DATA_PROVIDER = 'none'
  if (-not $env:PLAID_ENV) { $env:PLAID_ENV = 'sandbox' }
}

function Start-LocalDevelopment {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  Set-Location $repoRoot

  $currentEnvironment = [Environment]::GetEnvironmentVariables('Process')
  $null = Test-LocalDevelopmentBoundary -Environment $currentEnvironment
  Set-CanonicalLocalEnvironment

  $quotedRepoRoot = $repoRoot.Replace("'", "''")
  $script:localApiProcess = $null

  Write-Host 'Starting deterministic local development (PostgreSQL, stub adapters, local files and queue)...'
  try {
    Invoke-LocalDevelopmentSequence `
      -StartDatabaseAction {
        & npm run dev:db
        if ($LASTEXITCODE -ne 0) { throw 'Failed to start local PostgreSQL.' }
      } `
      -DatabaseReadyAction {
        for ($attempt = 1; $attempt -le 60; $attempt += 1) {
          $postgresHealth = docker inspect --format='{{.State.Health.Status}}' atlas-postgres 2>$null
          if ($LASTEXITCODE -eq 0 -and $postgresHealth -eq 'healthy') { return $true }
          Start-Sleep -Seconds 1
        }
        return $false
      } `
      -MigrationAction {
        Write-Host 'Running database migrations synchronously...'
        & npm run --workspace=api migrate
        if ($LASTEXITCODE -ne 0) { throw 'Local database migrations failed.' }
      } `
      -StartApiAction {
        Write-Host 'Starting API...'
        $script:localApiProcess = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
          '-NoProfile', '-Command', "Set-Location '$quotedRepoRoot'; npm run dev:api"
        )
        return $script:localApiProcess
      } `
      -ReadinessAction {
        Write-Host 'Waiting for API /internal/readiness...'
        for ($attempt = 1; $attempt -le 60; $attempt += 1) {
          try {
            $response = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/internal/readiness' -TimeoutSec 1
            if ($response.status -eq 'ready' -and $response.persistence.databaseReachable -eq $true) { return $true }
          } catch { }
          Start-Sleep -Seconds 1
        }
        return $false
      } `
      -StartWorkerAction {
        Write-Host 'Starting durable local K-1 worker...'
        Start-Process powershell -WindowStyle Hidden -ArgumentList @(
          '-NoProfile', '-Command', "Set-Location '$quotedRepoRoot'; npm run --workspace=api dev:k1-worker"
        ) | Out-Null
      } `
      -StartWebAction {
        Write-Host 'Starting web development server...'
        Start-Process powershell -WindowStyle Hidden -ArgumentList @(
          '-NoProfile', '-Command', "Set-Location '$quotedRepoRoot'; npm run --workspace=web dev"
        ) | Out-Null
      } | Out-Null
  } catch {
    if ($script:localApiProcess -and -not $script:localApiProcess.HasExited) {
      Stop-Process -Id $script:localApiProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw
  }

  Write-Host ''
  Write-Host 'Local development is ready:'
  Write-Host '- PostgreSQL: 127.0.0.1:15432'
  Write-Host '- API:        http://localhost:3000'
  Write-Host '- Web:        http://localhost:5173'
  Write-Host '- Providers:  deterministic local/stub adapters; no AWS calls'
}

if (-not $LibraryOnly) {
  Start-LocalDevelopment
}
