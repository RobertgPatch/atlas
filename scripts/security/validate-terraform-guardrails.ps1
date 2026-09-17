<#
.SYNOPSIS
Compatibility entry point for the production Terraform plan policy.

.DESCRIPTION
This wrapper intentionally defines no policy rules. It forwards every input to
validate-production-plan.ps1, whose single shared rule engine is
production-plan-policy.psm1. New callers should use validate-production-plan.ps1
directly.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $PlanJsonPath,
  [Parameter(Mandatory = $true)] [ValidateSet('Routine', 'Bootstrap')] [string] $PolicyMode,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $PlanSha256,
  [Parameter(Mandatory = $true)] [string] $TargetDescriptorPath,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $TargetDescriptorSha256,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $VariableFileSha256,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $ExpectedVariableFileSha256,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $BackendFingerprint,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $ExpectedBackendFingerprint,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{40}$')] [string] $SourceCommit,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{40}$')] [string] $ExpectedSourceCommit,
  [Parameter(Mandatory = $true)] [string] $CostEstimatePath,
  [Parameter(Mandatory = $true)] [string] $SecretContractPath,
  [Parameter(Mandatory = $true)] [string] $PolicyResultPath,
  [string] $AuthRouteContractPath,
  [switch] $BootstrapEligible
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($AuthRouteContractPath)) {
  $AuthRouteContractPath = Join-Path $repoRoot 'infra\aws\terraform\auth-route-scope.json'
}
$securityModulePath = Join-Path $repoRoot 'infra\aws\terraform\modules\security\main.tf'

try {
  $authContract = Get-Content -LiteralPath $AuthRouteContractPath -Raw | ConvertFrom-Json
  if ($authContract.schemaVersion -cne '1.0.0' -or $authContract.method -cne 'POST') {
    throw 'The authentication WAF contract has an unsupported schema or method.'
  }
  $routes = @($authContract.routes)
  if ($routes.Count -eq 0 -or @($routes | Select-Object -Unique).Count -ne $routes.Count) {
    throw 'The authentication WAF contract must contain unique routes.'
  }
  $compiled = [regex]::new(
    [string]$authContract.regex,
    [Text.RegularExpressions.RegexOptions]::CultureInvariant
  )
  foreach ($route in $routes) {
    if (-not ([string]$route).StartsWith('/v1/auth/') -or -not $compiled.IsMatch([string]$route)) {
      throw "Authentication route '$route' is not exactly covered by the WAF contract."
    }
  }
  $securitySource = Get-Content -LiteralPath $securityModulePath -Raw
  $assignmentPattern = 'regex_string\s*=\s*"' + [regex]::Escape([string]$authContract.regex) + '"'
  if ([regex]::Matches($securitySource, $assignmentPattern).Count -ne 2) {
    throw 'Both authentication WAF rules must use the exact canonical authentication route regex.'
  }
}
catch {
  Write-Output "Authentication WAF route guard failed: $($_.Exception.Message)"
  exit 4
}

$adapter = Join-Path $PSScriptRoot 'validate-production-plan.ps1'
$forward = @{
  PlanJsonPath = $PlanJsonPath
  PolicyMode = $PolicyMode
  PlanSha256 = $PlanSha256
  TargetDescriptorPath = $TargetDescriptorPath
  TargetDescriptorSha256 = $TargetDescriptorSha256
  VariableFileSha256 = $VariableFileSha256
  ExpectedVariableFileSha256 = $ExpectedVariableFileSha256
  BackendFingerprint = $BackendFingerprint
  ExpectedBackendFingerprint = $ExpectedBackendFingerprint
  SourceCommit = $SourceCommit
  ExpectedSourceCommit = $ExpectedSourceCommit
  CostEstimatePath = $CostEstimatePath
  SecretContractPath = $SecretContractPath
  PolicyResultPath = $PolicyResultPath
}
if ($BootstrapEligible) { $forward.BootstrapEligible = $true }

& $adapter @forward
exit $LASTEXITCODE
