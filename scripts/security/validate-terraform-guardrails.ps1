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
  [switch] $BootstrapEligible
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
