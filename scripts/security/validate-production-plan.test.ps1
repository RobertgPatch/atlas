[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$validator = Join-Path $PSScriptRoot 'validate-production-plan.ps1'
$powerShellHost = (Get-Process -Id $PID).Path
if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) { throw "Missing production plan adapter: $validator" }
$fixture = Join-Path $PSScriptRoot 'fixtures\production-plans\routine-pass.json'
$target = Join-Path $repoRoot 'infra\aws\production-target.json'
$secretContract = Join-Path $repoRoot 'infra\aws\terraform\production-secrets.contract.json'
if (-not (Test-Path -LiteralPath $secretContract -PathType Leaf)) { throw "Missing production secret contract: $secretContract" }

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("production-plan-adapter-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $costPath = Join-Path $tempRoot 'cost.json'
  $resultPath = Join-Path $tempRoot 'policy.json'
  [ordered]@{
    schemaVersion = '1.0.0'; region = 'us-west-2'; pricingRetrievedAt = '2026-08-29T00:00:00Z'
    hoursPerMonth = 730; fixedMonthlyUsd = 98.02; usageUpperBoundMonthlyUsd = 5.98
    estimatedMonthlyUsd = 104; targetMonthlyUsd = 110; budgetThresholdUsd = 125
    budgetActionCount = 0; workloadProfileMatched = $true; unpricedRecurringResources = @()
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $costPath -Encoding UTF8

  $hash = 'a' * 64
  $commit = 'b' * 40
  $common = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $validator,
    '-PlanJsonPath', $fixture,
    '-PolicyMode', 'Routine',
    '-PlanSha256', $hash,
    '-TargetDescriptorPath', $target,
    '-TargetDescriptorSha256', (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant(),
    '-VariableFileSha256', $hash,
    '-ExpectedVariableFileSha256', $hash,
    '-BackendFingerprint', $hash,
    '-ExpectedBackendFingerprint', $hash,
    '-SourceCommit', $commit,
    '-ExpectedSourceCommit', $commit,
    '-CostEstimatePath', $costPath,
    '-SecretContractPath', $secretContract,
    '-PolicyResultPath', $resultPath
  )
  & $powerShellHost @common
  Assert-True ($LASTEXITCODE -eq 0) 'Valid adapter fixture failed.'
  $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
  Assert-True ($result.planSha256 -eq $hash) 'Policy result is not bound to the plan hash.'
  Assert-True ($result.policyMode -eq 'Routine') 'Policy mode was not forwarded.'
  Assert-True ($result.policyInvocationCount -eq 1) 'Adapter did not delegate exactly once.'

  $badHashArguments = @($common)
  $index = [Array]::IndexOf($badHashArguments, '-ExpectedVariableFileSha256') + 1
  $badHashArguments[$index] = 'c' * 64
  $badOutput = (& $powerShellHost @badHashArguments 2>&1 | Out-String)
  Assert-True ($LASTEXITCODE -ne 0) 'Variable-file hash mismatch was accepted.'

  $bootstrapFixture = Join-Path $PSScriptRoot 'fixtures\production-plans\bootstrap-pass.json'
  $bootstrapResult = Join-Path $tempRoot 'bootstrap-policy.json'
  $bootstrapArguments = @($common)
  $bootstrapArguments[[Array]::IndexOf($bootstrapArguments, $fixture)] = $bootstrapFixture
  $bootstrapArguments[[Array]::IndexOf($bootstrapArguments, 'Routine')] = 'Bootstrap'
  $bootstrapArguments[[Array]::IndexOf($bootstrapArguments, $resultPath)] = $bootstrapResult
  $bootstrapArguments += '-BootstrapEligible'
  & $powerShellHost @bootstrapArguments
  Assert-True ($LASTEXITCODE -eq 0) 'Bootstrap policy mode was not forwarded with eligibility.'

  $sensitivePlan = Join-Path $PSScriptRoot 'fixtures\production-plans\protected-delete.json'
  $redactionArguments = @($common)
  $redactionArguments[[Array]::IndexOf($redactionArguments, $fixture)] = $sensitivePlan
  $redactedOutput = (& $powerShellHost @redactionArguments 2>&1 | Out-String)
  Assert-True ($LASTEXITCODE -ne 0) 'Protected delete fixture was accepted.'
  Assert-True (-not $redactedOutput.Contains('SENTINEL_SECRET_MUST_NOT_LEAK')) 'Adapter leaked sensitive plan content.'

  Write-Output 'PASS production plan adapter hash binding, mode forwarding, single delegation, and redaction.'
}
finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
