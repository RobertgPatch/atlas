[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Import-Module (Join-Path $PSScriptRoot 'production-release.psm1') -Force
Import-Module (Join-Path $repoPath 'scripts\security\production-plan-policy.psm1') -Force

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }

$sha = 'b' * 40
$hash = 'b' * 64
$cost = [pscustomobject]@{ region = 'us-west-2'; estimatedMonthlyUsd = 104; targetMonthlyUsd = 110; budgetThresholdUsd = 125; budgetActionCount = 0; workloadProfileMatched = $true; unpricedRecurringResources = @() }
$secrets = [pscustomobject]@{ schemaVersion = '1.0.0'; secrets = @([pscustomobject]@{ key = 'SESSION_SECRET'; consumers = @('api') }) }
$fixtureRoot = Join-Path $repoPath 'scripts\security\fixtures\production-plans'

$planCapabilities = Get-ProductionModeCapabilities Plan
$routine = Get-Content -LiteralPath (Join-Path $fixtureRoot 'routine-pass.json') -Raw | ConvertFrom-Json
$planPolicy = Invoke-ProductionPlanPolicy -Plan $routine -PolicyMode Routine -PlanSha256 $hash -SourceCommit $sha -CostEstimate $cost -SecretContract $secrets
Assert-True ($planPolicy.Passed -and -not $planCapabilities.awsMutation -and -not $planCapabilities.buildArtifact) 'Fixture Plan crossed its read-only boundary.'

$bootstrapCapabilities = Get-ProductionModeCapabilities Bootstrap
$bootstrap = Get-Content -LiteralPath (Join-Path $fixtureRoot 'bootstrap-pass.json') -Raw | ConvertFrom-Json
$bootstrapPolicy = Invoke-ProductionPlanPolicy -Plan $bootstrap -PolicyMode Bootstrap -PlanSha256 $hash -SourceCommit $sha -CostEstimate $cost -SecretContract $secrets -BootstrapEligible
Assert-True ($bootstrapPolicy.Passed -and $bootstrapCapabilities.terraformApply -and -not $bootstrapCapabilities.activateApplication) 'Fixture Bootstrap did not remain create-only and inactive.'
Assert-True (Test-ExactProductionConfirmation -Mode Bootstrap -SourceCommit $sha -Confirmation "BOOTSTRAP PRODUCTION $($sha.Substring(0, 8))") 'Fixture Bootstrap confirmation changed.'

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("atlas-production-flow-{0}" -f [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $planPath = Join-Path $tempRoot 'production.tfplan'
  $webPath = Join-Path $tempRoot 'web.zip'
  Set-Content -LiteralPath $planPath -Value 'opaque reviewed plan fixture' -NoNewline -Encoding UTF8
  Set-Content -LiteralPath $webPath -Value 'immutable web fixture' -NoNewline -Encoding UTF8
  $planHash = Get-Sha256 -LiteralPath $planPath
  $webHash = Get-Sha256 -LiteralPath $webPath

  $prepareCapabilities = Get-ProductionModeCapabilities Prepare
  Assert-True ($prepareCapabilities.pushApiImage -and -not $prepareCapabilities.terraformApply -and -not $prepareCapabilities.activateApplication) 'Fixture Prepare crossed its mutation boundary.'
  Assert-True (Test-ImmutableArtifactBinding -LiteralPath $planPath -ExpectedSha256 $planHash) 'Prepared plan hash was not reproducible.'
  Assert-True (Test-ImmutableArtifactBinding -LiteralPath $webPath -ExpectedSha256 $webHash) 'Prepared web hash was not reproducible.'

  $binding = [ordered]@{
    expectedAccountId = '111122223333'; actualAccountId = '111122223333'
    expectedRegion = 'us-west-2'; actualRegion = 'us-west-2'
    expectedWorkspace = 'default'; actualWorkspace = 'default'
    expectedBackendFingerprint = $hash; actualBackendFingerprint = $hash
    expectedVariableFileSha256 = $hash; actualVariableFileSha256 = $hash
    expectedSourceCommit = $sha; actualSourceCommit = $sha
  }
  $applyCapabilities = Get-ProductionModeCapabilities Apply
  Assert-True ((Test-ProductionIdentityBinding $binding) -and $applyCapabilities.terraformApply -and $applyCapabilities.activateApplication -and -not $applyCapabilities.regeneratePlan) 'Fixture Apply did not consume only prepared bindings.'
  Assert-True (Test-ExactProductionConfirmation -Mode Apply -SourceCommit $sha -Confirmation "DEPLOY PRODUCTION $($sha.Substring(0, 8))") 'Fixture Apply confirmation changed.'
  Assert-True (Test-ImmutableArtifactBinding -LiteralPath $planPath -ExpectedSha256 $planHash) 'Fixture Apply plan changed after preparation.'

  $checkpoint = [pscustomobject]@{
    releaseId = 'previous-release'; apiImageTag = $sha; apiImageDigest = "sha256:$hash"
    taskDefinitionArn = 'arn:aws:ecs:us-west-2:111122223333:task-definition/atlas-production-api:1'
    webArchivePath = 'web.zip'; webArchiveSha256 = $webHash; migrationSha256 = $hash
    activatedAt = '2026-08-28T00:00:00Z'
  }
  $rollbackCapabilities = Get-ProductionModeCapabilities Rollback
  $checkpointResult = Test-ProductionRollbackCheckpoint -Checkpoint $checkpoint -CurrentMigrationSha256 $hash -ReleaseRoot $tempRoot
  Assert-True ($checkpointResult.Valid -and $rollbackCapabilities.restoreCheckpoint -and -not $rollbackCapabilities.terraformApply -and -not $rollbackCapabilities.databaseMutation) 'Fixture Rollback permitted state/data rewind or rejected its compatible artifact checkpoint.'
  Assert-True (Test-ExactProductionConfirmation -Mode Rollback -CheckpointReleaseId 'previous-release' -Confirmation 'ROLLBACK PRODUCTION TO previous-release') 'Fixture Rollback confirmation changed.'

  Write-Output 'PASS fixture Plan, Bootstrap, Prepare, exact-artifact Apply, and artifact-only Rollback boundaries without AWS mutation.'
}
finally {
  if (Test-Path -LiteralPath $tempRoot -PathType Container) {
    $resolved = [System.IO.Path]::GetFullPath($tempRoot)
    $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolved.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -and $resolved -ne $tempBase) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
