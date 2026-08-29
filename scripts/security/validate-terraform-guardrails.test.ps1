[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$wrapper = Join-Path $PSScriptRoot 'validate-terraform-guardrails.ps1'
$target = Join-Path $repoRoot 'infra\aws\production-target.json'
$secretContract = Join-Path $repoRoot 'infra\aws\terraform\production-secrets.contract.json'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("production-guardrail-wrapper-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  $costPath = Join-Path $tempRoot 'cost.json'
  [ordered]@{
    schemaVersion = '1.0.0'; region = 'us-west-2'; pricingRetrievedAt = '2026-08-29T00:00:00Z'
    hoursPerMonth = 730; fixedMonthlyUsd = 98.02; usageUpperBoundMonthlyUsd = 5.98
    estimatedMonthlyUsd = 104; targetMonthlyUsd = 110; budgetThresholdUsd = 125
    budgetActionCount = 0; workloadProfileMatched = $true; unpricedRecurringResources = @()
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $costPath -Encoding UTF8

  $hash = 'a' * 64
  $commit = 'b' * 40
  $resultPath = Join-Path $tempRoot 'policy.json'
  $common = @{
    PlanJsonPath = Join-Path $PSScriptRoot 'fixtures\production-plans\routine-pass.json'
    PolicyMode = 'Routine'; PlanSha256 = $hash
    TargetDescriptorPath = $target
    TargetDescriptorSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    VariableFileSha256 = $hash; ExpectedVariableFileSha256 = $hash
    BackendFingerprint = $hash; ExpectedBackendFingerprint = $hash
    SourceCommit = $commit; ExpectedSourceCommit = $commit
    CostEstimatePath = $costPath; SecretContractPath = $secretContract
    PolicyResultPath = $resultPath
  }

  & $wrapper @common
  Assert-True ($LASTEXITCODE -eq 0) 'The compatibility wrapper did not preserve the adapter success exit code.'
  $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
  Assert-True ($result.policyInvocationCount -eq 1) 'The wrapper did not delegate to the shared policy exactly once.'

  $common.PlanJsonPath = Join-Path $PSScriptRoot 'fixtures\production-plans\protected-delete.json'
  $output = (& $wrapper @common 2>&1 | Out-String)
  Assert-True ($LASTEXITCODE -eq 4) 'The compatibility wrapper did not preserve the adapter failure exit code.'
  Assert-True (-not $output.Contains('SENTINEL_SECRET_MUST_NOT_LEAK')) 'The wrapper leaked sensitive fixture content.'

  Write-Output 'PASS Terraform guardrail compatibility wrapper delegates without independent rules and preserves exit codes.'
}
finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
