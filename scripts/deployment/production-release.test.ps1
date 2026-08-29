[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$modulePath = Join-Path $PSScriptRoot 'production-release.psm1'

if (-not (Test-Path -LiteralPath $modulePath -PathType Leaf)) {
  throw "Missing production release module: $modulePath"
}

Import-Module $modulePath -Force

function Assert-True {
  param([bool] $Condition, [string] $Message)
  if (-not $Condition) { throw $Message }
}

function Assert-Throws {
  param([scriptblock] $Action, [string] $Message)
  try { & $Action; throw $Message } catch {
    if ($_.Exception.Message -eq $Message) { throw }
  }
}

$target = Get-ProductionTarget -RepoPath $repoPath
Assert-True ($target.environment -eq 'production') 'Target environment must be production.'
Assert-True ($target.awsRegion -eq 'us-west-2') 'Target region must be us-west-2.'
Assert-True ($target.terraformWorkspace -eq 'default') 'Target workspace must be default.'
Assert-True ($target.cloudFrontCertificateRegion -eq 'us-east-1') 'Certificate region must be us-east-1.'

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("jackson-release-test-{0}" -f [guid]::NewGuid().ToString('N'))
$inside = Join-Path $tempRoot 'release\manifest.json'
try {
  New-Item -ItemType Directory -Path (Split-Path $inside -Parent) -Force | Out-Null
  Set-Content -LiteralPath $inside -Value 'abc' -NoNewline -Encoding UTF8

  $resolved = Resolve-ReleasePath -RootPath $tempRoot -CandidatePath $inside
  Assert-True ($resolved -eq (Resolve-Path $inside).Path) 'Contained path resolution changed the expected path.'
  Assert-Throws { Resolve-ReleasePath -RootPath $tempRoot -CandidatePath (Join-Path $tempRoot '..\escape.json') } 'Traversal path should fail.'

  $hash = Get-Sha256 -LiteralPath $inside
  Assert-True ($hash -match '^[a-f0-9]{64}$') 'File hash must be lowercase SHA-256.'

  $fingerprintA = Get-BackendFingerprint -Bucket 'state-bucket' -Key 'atlas/production/terraform.tfstate' -Region 'us-west-2' -KmsKeyArn 'arn:aws:kms:us-west-2:111122223333:key/example'
  $fingerprintB = Get-BackendFingerprint -Bucket 'state-bucket' -Key 'atlas/production/terraform.tfstate' -Region 'us-west-2' -KmsKeyArn 'arn:aws:kms:us-west-2:111122223333:key/example'
  Assert-True ($fingerprintA -eq $fingerprintB) 'Backend fingerprints must be deterministic.'
  Assert-True ($fingerprintA -match '^[a-f0-9]{64}$') 'Backend fingerprint must be SHA-256.'

  $sentinel = 'SENTINEL_SECRET_MUST_NOT_LEAK'
  $redacted = Protect-DeploymentText -Text "provider failed secret=$sentinel password=hunter2 postgresql://user:pass@example/db"
  Assert-True (-not $redacted.Contains($sentinel)) 'Redaction leaked the sentinel.'
  Assert-True (-not $redacted.Contains('hunter2')) 'Redaction leaked a password.'
  Assert-True (-not $redacted.Contains('user:pass')) 'Redaction leaked database credentials.'

  Assert-True (Test-CleanWorktreeStatus -StatusLines @()) 'Empty Git status must be clean.'
  Assert-True (-not (Test-CleanWorktreeStatus -StatusLines @(' M package.json'))) 'Dirty Git status must be rejected.'

  $sha = 'a' * 40
  $sha256 = 'b' * 64

  Assert-True (Test-ProductionToolVersion -Tool node -ActualVersion 'v22.20.0' -MinimumVersion '22.0.0') 'Supported Node version was rejected.'
  Assert-True (-not (Test-ProductionToolVersion -Tool terraform -ActualVersion '1.10.9' -MinimumVersion '1.11.0' -MaximumExclusiveVersion '2.0.0')) 'Old Terraform version was accepted.'
  Assert-True (-not (Test-ProductionToolVersion -Tool terraform -ActualVersion '2.0.0' -MinimumVersion '1.11.0' -MaximumExclusiveVersion '2.0.0')) 'Unsupported Terraform major version was accepted.'

  $binding = [ordered]@{
    expectedAccountId = '111122223333'; actualAccountId = '111122223333'
    expectedRegion = 'us-west-2'; actualRegion = 'us-west-2'
    expectedWorkspace = 'default'; actualWorkspace = 'default'
    expectedBackendFingerprint = $sha256; actualBackendFingerprint = $sha256
    expectedVariableFileSha256 = $sha256; actualVariableFileSha256 = $sha256
    expectedSourceCommit = $sha; actualSourceCommit = $sha
  }
  Assert-True (Test-ProductionIdentityBinding -Binding $binding) 'Matching production identity binding failed.'
  $binding.actualRegion = 'us-east-1'
  Assert-True (-not (Test-ProductionIdentityBinding -Binding $binding)) 'Wrong production region was accepted.'
  $binding.actualRegion = 'us-west-2'

  Assert-True (Test-ExactProductionConfirmation -Mode Apply -SourceCommit $sha -Confirmation ("DEPLOY PRODUCTION {0}" -f $sha.Substring(0, 8))) 'Exact Apply confirmation failed.'
  Assert-True (-not (Test-ExactProductionConfirmation -Mode Apply -SourceCommit $sha -Confirmation 'yes')) 'Inexact Apply confirmation was accepted.'
  Assert-True (Test-ExactProductionConfirmation -Mode Bootstrap -SourceCommit $sha -Confirmation ("BOOTSTRAP PRODUCTION {0}" -f $sha.Substring(0, 8))) 'Exact Bootstrap confirmation failed.'

  $planCapabilities = Get-ProductionModeCapabilities -Mode Plan
  Assert-True (-not $planCapabilities.awsMutation -and -not $planCapabilities.buildArtifact) 'Plan mode permits mutation or artifact builds.'
  $prepareCapabilities = Get-ProductionModeCapabilities -Mode Prepare
  Assert-True ($prepareCapabilities.pushApiImage -and -not $prepareCapabilities.terraformApply -and -not $prepareCapabilities.activateApplication) 'Prepare mutation boundary is incorrect.'
  $applyCapabilities = Get-ProductionModeCapabilities -Mode Apply
  Assert-True ($applyCapabilities.terraformApply -and $applyCapabilities.activateApplication -and -not $applyCapabilities.regeneratePlan) 'Apply mutation boundary is incorrect.'
  Assert-True ((Get-ProductionExitCode -FailureClass Preflight) -eq 2) 'Preflight exit code changed.'
  Assert-True ((Get-ProductionExitCode -FailureClass Smoke) -eq 8) 'Smoke exit code changed.'

  Assert-True (Test-ImmutableArtifactBinding -LiteralPath $inside -ExpectedSha256 $hash) 'Matching immutable artifact was rejected.'
  Assert-True (-not (Test-ImmutableArtifactBinding -LiteralPath $inside -ExpectedSha256 ('0' * 64))) 'Altered immutable artifact was accepted.'

  $rollbackCapabilities = Get-ProductionModeCapabilities -Mode Rollback
  Assert-True ($rollbackCapabilities.restoreCheckpoint -and -not $rollbackCapabilities.terraformApply -and -not $rollbackCapabilities.databaseMutation) 'Rollback must restore only application artifacts.'
  Assert-True (Test-ExactProductionConfirmation -Mode Rollback -CheckpointReleaseId 'previous-release' -Confirmation 'ROLLBACK PRODUCTION TO previous-release') 'Exact Rollback confirmation failed.'

  $checkpointWeb = Join-Path $tempRoot 'release\previous-web.zip'
  Set-Content -LiteralPath $checkpointWeb -Value 'previous immutable web bundle' -NoNewline -Encoding UTF8
  $migrationHash = 'c' * 64
  $checkpoint = [pscustomobject]@{
    releaseId = 'previous-release'; apiImageTag = $sha; apiImageDigest = "sha256:$sha256"
    taskDefinitionArn = 'arn:aws:ecs:us-west-2:111122223333:task-definition/atlas-production-api:1'
    webArchivePath = 'release/previous-web.zip'; webArchiveSha256 = Get-Sha256 -LiteralPath $checkpointWeb
    migrationSha256 = $migrationHash; activatedAt = '2026-08-28T00:00:00Z'
  }
  $checkpointResult = Test-ProductionRollbackCheckpoint -Checkpoint $checkpoint -CurrentMigrationSha256 $migrationHash -ReleaseRoot $tempRoot
  Assert-True $checkpointResult.Valid ("Valid rollback checkpoint failed: {0}" -f ($checkpointResult.Errors -join '; '))
  Assert-True (-not (Test-ProductionRollbackCheckpoint -Checkpoint $checkpoint -CurrentMigrationSha256 ('d' * 64) -ReleaseRoot $tempRoot).Valid) 'Migration-incompatible rollback was accepted.'
  $checkpoint.webArchiveSha256 = '0' * 64
  Assert-True (-not (Test-ProductionRollbackCheckpoint -Checkpoint $checkpoint -CurrentMigrationSha256 $migrationHash -ReleaseRoot $tempRoot).Valid) 'Corrupted rollback bundle was accepted.'
  $checkpoint.webArchiveSha256 = Get-Sha256 -LiteralPath $checkpointWeb

  $recordPath = Join-Path $tempRoot 'release\execution-records.jsonl'
  $recordA = [ordered]@{ releaseId = 'release-a'; operation = 'apply'; outcome = 'failed'; terraformApplyExitCode = 1; smokeChecks = @() }
  $recordB = [ordered]@{ releaseId = 'release-a'; operation = 'rollback'; outcome = 'rolled_back'; terraformApplyExitCode = $null; smokeChecks = @() }
  Add-ProductionExecutionRecord -LiteralPath $recordPath -Record $recordA -ReleaseRoot $tempRoot
  $firstRecord = Get-Content -LiteralPath $recordPath -Raw
  Add-ProductionExecutionRecord -LiteralPath $recordPath -Record $recordB -ReleaseRoot $tempRoot
  $records = @(Get-Content -LiteralPath $recordPath)
  Assert-True ($records.Count -eq 2 -and $records[0] -eq $firstRecord.TrimEnd()) 'Execution records were overwritten instead of appended.'

  $manifest = [ordered]@{
    schemaVersion = '1.0.0'
    releaseId = "$sha-20260829T000000Z"
    preparedAt = '2026-08-29T00:00:00Z'
    source = [ordered]@{ commit = $sha; branch = '029-local-dev-aws-production'; cleanWorktree = $true }
    target = [ordered]@{
      environment = 'production'; accountId = '111122223333'; callerArn = 'arn:aws:iam::111122223333:user/test'
      region = 'us-west-2'; certificateRegion = 'us-east-1'; regionAuthorityPath = 'infra/aws/production-target.json'
      targetDescriptorSha256 = $sha256; terraformWorkspace = 'default'; stateBucket = 'state-bucket'
      stateKey = 'atlas/production/terraform.tfstate'; stateKmsKeyArn = 'arn:aws:kms:us-west-2:111122223333:key/example'
      backendFingerprint = $sha256
    }
    apiArtifact = [ordered]@{ repositoryUri = '111122223333.dkr.ecr.us-west-2.amazonaws.com/atlas'; tag = $sha; digest = "sha256:$sha256"; platform = 'linux/amd64'; dockerfileSha256 = $sha256 }
    webArtifact = [ordered]@{ archivePath = 'web.zip'; sha256 = $sha256; fileManifestPath = 'web-files.json'; fileCount = 1; totalBytes = 1 }
    terraformArtifact = [ordered]@{ planPath = 'production.tfplan'; planSha256 = $sha256; redactedSummaryPath = 'plan-summary.json'; policyResultPath = 'policy.json'; terraformVersion = '1.11.4'; sourceCommit = $sha; backendFingerprint = $sha256; variableFileSha256 = $sha256 }
    secretAttestation = [ordered]@{ contractSha256 = $sha256; verifiedAt = '2026-08-29T00:00:00Z'; secrets = @([ordered]@{ key = 'SESSION_SECRET'; secretArn = 'arn:aws:secretsmanager:us-west-2:111122223333:secret:atlas/session'; versionId = 'version-1'; consumers = @('api'); exists = $true; currentVersionUnique = $true; nonempty = $true; wiringVerified = $true }) }
    costEstimate = [ordered]@{ region = 'us-west-2'; pricingRetrievedAt = '2026-08-29T00:00:00Z'; hoursPerMonth = 730; fixedMonthlyUsd = 98.02; usageUpperBoundMonthlyUsd = 5.98; estimatedMonthlyUsd = 104; targetMonthlyUsd = 110; budgetThresholdUsd = 125; budgetActionCount = 0; workloadProfileMatched = $true; unpricedRecurringResources = @() }
    migrationSet = [ordered]@{ files = @(); sha256 = $sha256; backwardCompatible = $true; requiresSnapshot = $false; snapshotIdentifier = $null; approvalReference = $null }
    previousCheckpoint = $null
  }

  $validResult = Test-ProductionReleaseManifest -Manifest $manifest -RepoPath $repoPath
  Assert-True $validResult.Valid ("Valid manifest failed: {0}" -f ($validResult.Errors -join '; '))
  $manifest.costEstimate.estimatedMonthlyUsd = 111
  $invalidResult = Test-ProductionReleaseManifest -Manifest $manifest -RepoPath $repoPath
  Assert-True (-not $invalidResult.Valid) 'Over-budget manifest must fail validation.'

  Write-Output 'PASS production release primitives, rollback checkpoint safety, append-only evidence, and redaction.'
}
finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
