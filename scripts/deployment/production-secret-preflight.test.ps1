[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'production-release.psm1') -Force
function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }

function Copy-JsonObject { param([object] $Value); return $Value | ConvertTo-Json -Depth 30 | ConvertFrom-Json }

$accountId = '111122223333'
$region = 'us-west-2'
$sentinel = 'SENTINEL_SECRET_MUST_NOT_LEAK'
$contract = [pscustomobject]@{
  schemaVersion = '1.0.0'
  secrets = @(
    [pscustomobject]@{ key = 'SESSION_SECRET'; nameSuffix = 'SESSION_SECRET'; consumers = @('api'); requiredWhen = 'always'; persistenceCritical = $true },
    [pscustomobject]@{ key = 'PROJECT_JACKSON_SCHEDULER_TOKEN'; nameSuffix = 'PROJECT_JACKSON_SCHEDULER_TOKEN'; consumers = @('plaid-scheduler'); requiredWhen = 'plaidSchedulerEnabled'; persistenceCritical = $false }
  )
  runtimeNonSecretVariables = @('PLAID_ENV')
  retiredSecretKeys = @('PLAID_ENV', 'ATLAS_SCHEDULER_TOKEN')
}
$inventory = @(
  [pscustomobject]@{
    key = 'SESSION_SECRET'; name = 'atlas-production/SESSION_SECRET'
    arn = "arn:aws:secretsmanager:${region}:${accountId}:secret:atlas-production/SESSION_SECRET-example"
    deletedDate = $null; versions = @([pscustomobject]@{ versionId = 'session-v1'; stages = @('AWSCURRENT'); secretString = $sentinel; secretBinary = $null })
  },
  [pscustomobject]@{
    key = 'PROJECT_JACKSON_SCHEDULER_TOKEN'; name = 'atlas-production/PROJECT_JACKSON_SCHEDULER_TOKEN'
    arn = "arn:aws:secretsmanager:${region}:${accountId}:secret:atlas-production/PROJECT_JACKSON_SCHEDULER_TOKEN-example"
    deletedDate = $null; versions = @([pscustomobject]@{ versionId = 'scheduler-v1'; stages = @('AWSCURRENT'); secretString = $sentinel; secretBinary = $null })
  }
)
$wiring = [pscustomobject]@{
  secretKeys = @('SESSION_SECRET', 'PROJECT_JACKSON_SCHEDULER_TOKEN')
  plaintextKeys = @('PLAID_ENV')
  consumers = [pscustomobject]@{ api = @('SESSION_SECRET'); 'plaid-scheduler' = @('PROJECT_JACKSON_SCHEDULER_TOKEN') }
  iamSecretArns = @($inventory.arn)
  iamWildcard = $false
  retiredKeys = @()
}
$features = [pscustomobject]@{ plaidSchedulerEnabled = $true }

$pass = Test-ProductionSecretPreflight -Contract $contract -Inventory $inventory -Wiring $wiring -Features $features -ExpectedAccountId $accountId -ExpectedRegion $region
Assert-True $pass.Valid ("Valid secret fixture failed: {0}" -f ($pass.Errors -join '; '))
Assert-True ($pass.Attestation.secrets.Count -eq 2) 'Required secret attestation count is wrong.'
$serialized = $pass | ConvertTo-Json -Depth 20
Assert-True (-not $serialized.Contains($sentinel)) 'Secret preflight leaked a secret value.'
Assert-True (-not $serialized.Contains('secretString')) 'Secret preflight retained a provider value field.'

$apply = Test-ProductionSecretPreflight -Contract $contract -Inventory $inventory -Wiring $wiring -Features $features -ExpectedAccountId $accountId -ExpectedRegion $region -PreparedAttestation $pass.Attestation
Assert-True $apply.Valid 'Unchanged AWSCURRENT VersionIds should pass Apply revalidation.'

$cases = @()
$missing = Copy-JsonObject $inventory; $missing = @($missing | Where-Object key -ne 'SESSION_SECRET'); $cases += ,@('missing canonical secret', $missing, $wiring, $null)
$duplicate = Copy-JsonObject $inventory; $duplicate += Copy-JsonObject $inventory[0]; $cases += ,@('duplicate canonical secret', $duplicate, $wiring, $null)
$pending = Copy-JsonObject $inventory; $pending[0].deletedDate = '2026-08-29T00:00:00Z'; $cases += ,@('pending deletion', $pending, $wiring, $null)
$noCurrent = Copy-JsonObject $inventory; $noCurrent[0].versions[0].stages = @('AWSPREVIOUS'); $cases += ,@('missing AWSCURRENT', $noCurrent, $wiring, $null)
$multiCurrent = Copy-JsonObject $inventory; $multiCurrent[0].versions += Copy-JsonObject $multiCurrent[0].versions[0]; $cases += ,@('multiple AWSCURRENT', $multiCurrent, $wiring, $null)
$emptyString = Copy-JsonObject $inventory; $emptyString[0].versions[0].secretString = ''; $cases += ,@('empty string', $emptyString, $wiring, $null)
$emptyBinary = Copy-JsonObject $inventory; $emptyBinary[0].versions[0].secretString = $null; $emptyBinary[0].versions[0].secretBinary = ''; $cases += ,@('empty binary', $emptyBinary, $wiring, $null)
$missingVersion = Copy-JsonObject $inventory; $missingVersion[0].versions[0].versionId = ''; $cases += ,@('missing VersionId', $missingVersion, $wiring, $null)
$wrongRegion = Copy-JsonObject $inventory; $wrongRegion[0].arn = $wrongRegion[0].arn.Replace('us-west-2', 'us-east-1'); $cases += ,@('wrong region', $wrongRegion, $wiring, $null)
$wrongAccount = Copy-JsonObject $inventory; $wrongAccount[0].arn = $wrongAccount[0].arn.Replace($accountId, '999900001111'); $cases += ,@('wrong account', $wrongAccount, $wiring, $null)
$missingConsumer = Copy-JsonObject $wiring; $missingConsumer.consumers.api = @(); $cases += ,@('missing consumer', $inventory, $missingConsumer, $null)
$plaintext = Copy-JsonObject $wiring; $plaintext.plaintextKeys += 'SESSION_SECRET'; $cases += ,@('plaintext secret', $inventory, $plaintext, $null)
$broadIam = Copy-JsonObject $wiring; $broadIam.iamWildcard = $true; $cases += ,@('broad IAM', $inventory, $broadIam, $null)
$retiredAlias = Copy-JsonObject $wiring; $retiredAlias.retiredKeys += 'ATLAS_SCHEDULER_TOKEN'; $cases += ,@('retired alias', $inventory, $retiredAlias, $null)
$drifted = Copy-JsonObject $inventory; $drifted[0].versions[0].versionId = 'session-v2'; $cases += ,@('VersionId drift', $drifted, $wiring, $pass.Attestation)

foreach ($case in $cases) {
  $result = Test-ProductionSecretPreflight -Contract $contract -Inventory $case[1] -Wiring $case[2] -Features $features -ExpectedAccountId $accountId -ExpectedRegion $region -PreparedAttestation $case[3]
  Assert-True (-not $result.Valid) ("Negative fixture passed: {0}" -f $case[0])
  Assert-True (-not (($result | ConvertTo-Json -Depth 20).Contains($sentinel))) ("Negative fixture leaked sentinel: {0}" -f $case[0])
}

$disabledFeatures = [pscustomobject]@{ plaidSchedulerEnabled = $false }
$disabledInventory = @($inventory | Where-Object key -eq 'SESSION_SECRET')
$disabledWiring = Copy-JsonObject $wiring
$disabledWiring.secretKeys = @('SESSION_SECRET')
$disabledWiring.iamSecretArns = @($disabledInventory.arn)
$disabledWiring.consumers.'plaid-scheduler' = @()
$disabled = Test-ProductionSecretPreflight -Contract $contract -Inventory $disabledInventory -Wiring $disabledWiring -Features $disabledFeatures -ExpectedAccountId $accountId -ExpectedRegion $region
Assert-True $disabled.Valid 'Disabled feature incorrectly required its conditional secret.'

$providerFailure = [pscustomobject]@{ key = 'SESSION_SECRET'; providerError = "request failed token=$sentinel" }
$failure = Test-ProductionSecretPreflight -Contract $contract -Inventory @($providerFailure, $inventory[1]) -Wiring $wiring -Features $features -ExpectedAccountId $accountId -ExpectedRegion $region
Assert-True (-not $failure.Valid) 'Malformed provider failure should fail closed.'
Assert-True (-not (($failure | ConvertTo-Json -Depth 20).Contains($sentinel))) 'Provider error leaked a sentinel.'

Write-Output 'PASS production secret preflight existence, version, value-presence, wiring, drift, and redaction fixtures.'
