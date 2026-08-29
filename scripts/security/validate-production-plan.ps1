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

Import-Module (Join-Path $PSScriptRoot 'production-plan-policy.psm1') -Force

function Stop-PolicyValidation {
  param([string] $Rule, [string] $Message)
  [Console]::Out.WriteLine("[$Rule] $Message")
  exit 4
}

try {
  foreach ($path in @($PlanJsonPath, $TargetDescriptorPath, $CostEstimatePath, $SecretContractPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-PolicyValidation 'input' 'A required policy input is missing.' }
  }
  if ($TargetDescriptorSha256 -cne (Get-FileHash -LiteralPath $TargetDescriptorPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
    Stop-PolicyValidation 'target-hash' 'The production target descriptor hash changed.'
  }
  if ($VariableFileSha256 -cne $ExpectedVariableFileSha256) {
    Stop-PolicyValidation 'tfvars-hash' 'The production variable-file hash changed.'
  }
  if ($BackendFingerprint -cne $ExpectedBackendFingerprint) {
    Stop-PolicyValidation 'backend-hash' 'The production backend fingerprint changed.'
  }
  if ($SourceCommit -cne $ExpectedSourceCommit) {
    Stop-PolicyValidation 'source-commit' 'The prepared source commit changed.'
  }

  $target = Get-Content -LiteralPath $TargetDescriptorPath -Raw | ConvertFrom-Json
  if ($target.schemaVersion -ne '1.0.0' -or $target.environment -ne 'production' -or
      $target.awsRegion -ne 'us-west-2' -or $target.terraformWorkspace -ne 'default' -or
      $target.cloudFrontCertificateRegion -ne 'us-east-1') {
    Stop-PolicyValidation 'target' 'The production target descriptor does not match the approved destination.'
  }

  $plan = Get-Content -LiteralPath $PlanJsonPath -Raw | ConvertFrom-Json
  $cost = Get-Content -LiteralPath $CostEstimatePath -Raw | ConvertFrom-Json
  $secretContract = Get-Content -LiteralPath $SecretContractPath -Raw | ConvertFrom-Json

  $arguments = @{
    Plan = $plan
    PolicyMode = $PolicyMode
    PlanSha256 = $PlanSha256
    SourceCommit = $SourceCommit
    CostEstimate = $cost
    SecretContract = $secretContract
  }
  if ($BootstrapEligible) { $arguments.BootstrapEligible = $true }

  # This is the adapter's only call into the shared production policy engine.
  $policy = Invoke-ProductionPlanPolicy @arguments
  if (-not $policy.Passed) {
    foreach ($finding in @($policy.Findings)) {
      $rule = if ([string]::IsNullOrWhiteSpace([string]$finding.rule)) { 'policy' } else { [string]$finding.rule }
      $address = if ([string]::IsNullOrWhiteSpace([string]$finding.address)) { '' } else { " $([string]$finding.address)" }
      [Console]::Out.WriteLine("[$rule]$address $([string]$finding.message)")
    }
    exit 4
  }

  $result = $policy.Result
  $result | Add-Member -NotePropertyName policyInvocationCount -NotePropertyValue 1
  $result | Add-Member -NotePropertyName targetDescriptorSha256 -NotePropertyValue $TargetDescriptorSha256
  $result | Add-Member -NotePropertyName variableFileSha256 -NotePropertyValue $VariableFileSha256
  $result | Add-Member -NotePropertyName backendFingerprint -NotePropertyValue $BackendFingerprint
  $result | Add-Member -NotePropertyName sourceCommit -NotePropertyValue $SourceCommit
  $json = $result | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($PolicyResultPath), "$json`n", [System.Text.UTF8Encoding]::new($false))
  Write-Output 'PASS production plan policy binding and guardrails.'
  exit 0
}
catch {
  [Console]::Out.WriteLine('[validation] Production plan validation failed closed.')
  exit 4
}
