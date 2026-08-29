[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'production-release.psm1') -Force

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }

$sentinel = 'SENTINEL_SMOKE_CREDENTIAL_MUST_NOT_LEAK'
$requiredNames = @(
  'edge-home', 'edge-assets', 'auth-anonymous', 'auth-login', 'auth-session',
  'dashboard-read', 'liquidity-holdings-read', 'liquidity-performance-read',
  'investment-aggregation-read', 'tic-properties-read', 'entities-list-read',
  'entity-detail-read', 'auth-logout', 'auth-post-logout'
)

function New-FixtureInvoker {
  param([string] $FailName)
  $calls = New-Object 'System.Collections.Generic.List[object]'
  $invoker = {
    param($Request)
    $calls.Add([pscustomobject]@{ name = $Request.name; method = $Request.method; path = $Request.path })
    if ($Request.name -eq $FailName) { return [pscustomobject]@{ statusCode = 503; contentType = 'application/json'; body = [pscustomobject]@{ error = $sentinel } } }
    switch ($Request.name) {
      'edge-home' { return [pscustomobject]@{ statusCode = 200; contentType = 'text/html'; body = '<html><script src="/assets/app-a1.js"></script><link rel="stylesheet" href="/assets/app-b2.css"></html>' } }
      'edge-assets' { return [pscustomobject]@{ statusCode = 200; contentType = if ($Request.path.EndsWith('.css')) { 'text/css' } else { 'application/javascript' }; body = 'asset' } }
      'auth-anonymous' { return [pscustomobject]@{ statusCode = 401; contentType = 'application/json'; body = [pscustomobject]@{ error = 'UNAUTHORIZED' } } }
      'auth-login' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ authenticated = $true; opaque = $sentinel } } }
      'auth-session' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ user = [pscustomobject]@{ id = 'smoke-user'; role = 'admin' } } } }
      'dashboard-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ kpis = [pscustomobject]@{} } } }
      'liquidity-holdings-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ kpis = [pscustomobject]@{}; items = @(); page = 1 } } }
      'liquidity-performance-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ series = @() } } }
      'investment-aggregation-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ items = @(); page = 1 } } }
      'tic-properties-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ items = @() } } }
      'entities-list-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ items = @([pscustomobject]@{ id = 'entity-1' }) } } }
      'entity-detail-read' { return [pscustomobject]@{ statusCode = 200; contentType = 'application/json'; body = [pscustomobject]@{ id = 'entity-1' } } }
      'auth-logout' { return [pscustomobject]@{ statusCode = 204; contentType = 'application/json'; body = $null } }
      'auth-post-logout' { return [pscustomobject]@{ statusCode = 401; contentType = 'application/json'; body = [pscustomobject]@{ error = 'UNAUTHORIZED' } } }
      default { throw "Unexpected fixture request $($Request.name)." }
    }
  }.GetNewClosure()
  return [pscustomobject]@{ Invoke = $invoker; Calls = $calls }
}

$fixture = New-FixtureInvoker
$pass = Invoke-ProductionSmokeContract -BaseUri 'https://app.example.com' -Username 'smoke-user' -Password $sentinel -RequestInvoker $fixture.Invoke
Assert-True $pass.Passed ("Valid smoke fixture failed: {0}" -f ($pass.Results | ConvertTo-Json -Compress))
Assert-True ((@($pass.Results.name) -join ',') -eq ($requiredNames -join ',')) 'Smoke result ordering or retained-flow coverage changed.'
$serialized = $pass | ConvertTo-Json -Depth 20
Assert-True (-not $serialized.Contains($sentinel)) 'Smoke evidence leaked credential or body content.'
Assert-True (@($fixture.Calls | Where-Object { $_.method -notin @('GET', 'POST') }).Count -eq 0) 'Smoke used a prohibited HTTP method.'
Assert-True (@($fixture.Calls | Where-Object { $_.method -eq 'POST' -and $_.name -notin @('auth-login', 'auth-logout') }).Count -eq 0) 'Smoke performed a business-data mutation.'
Assert-True (@($fixture.Calls | Where-Object { $_.path -match 'refresh|pricingMode=refresh' }).Count -eq 0) 'Smoke invoked a real provider or refresh path.'

foreach ($name in $requiredNames) {
  $failureFixture = New-FixtureInvoker -FailName $name
  $failure = Invoke-ProductionSmokeContract -BaseUri 'https://app.example.com' -Username 'smoke-user' -Password $sentinel -RequestInvoker $failureFixture.Invoke
  Assert-True (-not $failure.Passed) "Smoke failure fixture '$name' passed."
  Assert-True (-not (($failure | ConvertTo-Json -Depth 20).Contains($sentinel))) "Smoke failure '$name' leaked sensitive content."
}

Write-Output 'PASS ordered production smoke retained reads, failure stops, prohibited-call enforcement, and redaction.'
