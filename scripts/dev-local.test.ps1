[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'dev-local.ps1') -LibraryOnly

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }
function Assert-Throws { param([scriptblock] $Action, [string] $Pattern); try { & $Action; throw 'Expected action to fail.' } catch { if ($_.Exception.Message -eq 'Expected action to fail.' -or $_.Exception.Message -notmatch $Pattern) { throw } } }

$safe = [ordered]@{
  NODE_ENV = 'development'
  ATLAS_RUNTIME = 'local'
  DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:15432/atlas'
}
Assert-True (Test-LocalDevelopmentBoundary -Environment $safe) 'Safe local configuration should pass.'

foreach ($fixture in @(
  [ordered]@{ NODE_ENV = 'production' },
  [ordered]@{ ATLAS_RUNTIME = 'production' },
  [ordered]@{ DATABASE_URL = 'postgres://user:password@atlas.production.rds.amazonaws.com/atlas' },
  [ordered]@{ AWS_PROFILE = 'atlas-production' },
  [ordered]@{ AWS_ACCOUNT_ID = '111122223333'; ATLAS_PRODUCTION_ACCOUNT_ID = '111122223333' },
  [ordered]@{ K1_S3_BUCKET = 'atlas-production-documents' },
  [ordered]@{ TF_VAR_environment_name = 'production' },
  [ordered]@{ ATLAS_ALLOW_AWS_MUTATION = 'true' }
)) {
  $candidate = [ordered]@{} + $safe
  foreach ($entry in $fixture.GetEnumerator()) { $candidate[$entry.Key] = $entry.Value }
  Assert-Throws { Test-LocalDevelopmentBoundary -Environment $candidate } 'local|production|AWS|mutation'
}

$events = New-Object System.Collections.Generic.List[string]
Invoke-LocalDevelopmentSequence `
  -StartDatabaseAction { $events.Add('database') } `
  -DatabaseReadyAction { $events.Add('database-ready'); return $true } `
  -MigrationAction { $events.Add('migrations') } `
  -StartApiAction { $events.Add('api'); return [pscustomobject]@{ Id = 1 } } `
  -ReadinessAction { $events.Add('readiness'); return $true } `
  -StartWorkerAction { $events.Add('worker') } `
  -StartWebAction { $events.Add('web') } | Out-Null
Assert-True (($events -join ',') -eq 'database,database-ready,migrations,api,readiness,worker,web') 'Local services started out of order.'

$events.Clear()
Assert-Throws {
  Invoke-LocalDevelopmentSequence `
    -StartDatabaseAction { $events.Add('database') } `
    -DatabaseReadyAction { $events.Add('database-ready'); return $true } `
    -MigrationAction { throw 'broken migration' } `
    -StartApiAction { $events.Add('api') } `
    -ReadinessAction { return $true } `
    -StartWorkerAction { $events.Add('worker') } `
    -StartWebAction { $events.Add('web') }
} 'broken migration'
Assert-True (($events -join ',') -eq 'database,database-ready') 'A migration failure started a child process.'

$events.Clear()
Assert-Throws {
  Invoke-LocalDevelopmentSequence `
    -StartDatabaseAction { $events.Add('database') } `
    -DatabaseReadyAction { return $true } `
    -MigrationAction { $events.Add('migrations') } `
    -StartApiAction { $events.Add('api'); return [pscustomobject]@{ Id = 1 } } `
    -ReadinessAction { return $false } `
    -StartWorkerAction { $events.Add('worker') } `
    -StartWebAction { $events.Add('web') }
} 'readiness'
Assert-True (-not $events.Contains('worker') -and -not $events.Contains('web')) 'A readiness failure started the worker or web.'

Write-Output 'PASS local launcher boundary, ordering, fatal failures, and child suppression.'
