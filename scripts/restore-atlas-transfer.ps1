[CmdletBinding()]
param(
  [string]$RepoPath,
  [switch]$InstallAwsCredentials,
  [switch]$InstallDependencies,
  [switch]$RestoreDatabase,
  [switch]$VerifyBuilds,
  [switch]$VerifyStagingPlan,
  [switch]$SkipHashVerification
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$transferRoot = $PSScriptRoot
$manifestPath = Join-Path $transferRoot 'transfer-manifest.json'
$checksumPath = Join-Path $transferRoot 'checksums.sha256'

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Copy-TreeChecked {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$DestinationPath,
    [switch]$Mirror
  )
  New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
  $copyMode = if ($Mirror) { '/MIR' } else { '/E' }
  & robocopy $Source $DestinationPath $copyMode /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE for $Source"
  }
}

function Test-TransferHashes {
  if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
    throw "Checksum manifest is missing: $checksumPath"
  }
  $failures = [System.Collections.Generic.List[string]]::new()
  $expectedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($line in Get-Content -LiteralPath $checksumPath) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $separator = $line.IndexOf('  ', [System.StringComparison]::Ordinal)
    if ($separator -lt 64) { $failures.Add("Malformed checksum line: $line"); continue }
    $expected = $line.Substring(0, $separator).Trim().ToUpperInvariant()
    $relative = $line.Substring($separator + 2).Replace('/', '\')
    if (-not $expectedFiles.Add($relative)) { $failures.Add("Duplicate checksum entry: $relative"); continue }
    $file = Join-Path $transferRoot $relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { $failures.Add("Missing: $relative"); continue }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $expected) { $failures.Add("Hash mismatch: $relative") }
  }
  foreach ($file in Get-ChildItem -LiteralPath $transferRoot -File -Recurse -Force) {
    if ($file.FullName -eq $checksumPath) { continue }
    $relative = $file.FullName.Substring($transferRoot.Length).TrimStart('\')
    if (-not $expectedFiles.Contains($relative)) { $failures.Add("Unexpected file: $relative") }
  }
  if ($failures.Count -gt 0) {
    throw "Transfer integrity verification failed:`n$($failures -join "`n")"
  }
  Write-Host 'Transfer integrity check passed.' -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Transfer manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.bundleVersion -ne 2) { throw "Unsupported transfer bundle version: $($manifest.bundleVersion)" }
if (-not $SkipHashVerification) { Test-TransferHashes }

foreach ($command in @('git', 'robocopy')) { Assert-Command -Name $command }

if ([string]::IsNullOrWhiteSpace($RepoPath)) { $RepoPath = [string]$manifest.targetRepository }
if ([string]::IsNullOrWhiteSpace($RepoPath)) { throw 'No target repository path was supplied or recorded in the manifest.' }
$RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
$bundlePath = Join-Path $transferRoot $manifest.gitBundle.Replace('/', '\')
$overlayRoot = Join-Path $transferRoot $manifest.repoOverlay.Replace('/', '\')
if (-not (Test-Path -LiteralPath $bundlePath -PathType Leaf)) { throw "Git bundle is missing: $bundlePath" }
if (-not (Test-Path -LiteralPath $overlayRoot -PathType Container)) { throw "Repository overlay is missing: $overlayRoot" }
& git bundle list-heads $bundlePath *> $null
if ($LASTEXITCODE -ne 0) { throw 'Git bundle inspection failed.' }

$gitDirectory = Join-Path $RepoPath '.git'
if (-not (Test-Path -LiteralPath $gitDirectory -PathType Container)) {
  if (Test-Path -LiteralPath $RepoPath) {
    if (@(Get-ChildItem -LiteralPath $RepoPath -Force).Count -gt 0) {
      throw "Target exists but is not an empty Git repository: $RepoPath"
    }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RepoPath) | Out-Null
  & git clone --branch $manifest.branch --single-branch $bundlePath $RepoPath
  if ($LASTEXITCODE -ne 0) { throw 'Cloning from the transfer Git bundle failed.' }
  $remotes = @(& git -C $RepoPath remote)
  if ($remotes -contains 'origin') {
    & git -C $RepoPath remote set-url origin $manifest.origin
  }
  else {
    & git -C $RepoPath remote add origin $manifest.origin
  }
}
else {
  $existingStatus = @(& git -C $RepoPath status --porcelain --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { throw "Git could not inspect $RepoPath" }
  if ($existingStatus.Count -gt 0) {
    $stashMessage = 'pre-transfer-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    & git -C $RepoPath stash push --include-untracked --message $stashMessage
    if ($LASTEXITCODE -ne 0) { throw 'Could not preserve the existing laptop worktree in a Git stash.' }
    Write-Host "Existing local changes preserved in Git stash '$stashMessage'." -ForegroundColor Yellow
  }

  & git -C $RepoPath fetch $bundlePath "+refs/heads/$($manifest.branch):refs/remotes/transfer/$($manifest.branch)"
  if ($LASTEXITCODE -ne 0) { throw 'Fetching the current branch from the transfer bundle failed.' }

  $oldHead = (& git -C $RepoPath rev-parse HEAD).Trim()
  if ($oldHead -ne $manifest.baseCommit) {
    $backupBranch = 'transfer-backup-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    & git -C $RepoPath branch $backupBranch $oldHead
    if ($LASTEXITCODE -ne 0) { throw 'Could not create a recovery branch for the prior laptop HEAD.' }
    Write-Host "Prior laptop HEAD preserved as branch '$backupBranch'." -ForegroundColor Yellow
  }

  & git -C $RepoPath switch -C $manifest.branch $manifest.baseCommit
  if ($LASTEXITCODE -ne 0) { throw "Could not switch to transferred branch $($manifest.branch)." }
  $remotes = @(& git -C $RepoPath remote)
  if ($remotes -contains 'origin') {
    & git -C $RepoPath remote set-url origin $manifest.origin
  }
  else {
    & git -C $RepoPath remote add origin $manifest.origin
  }
}

& git -C $RepoPath config "branch.$($manifest.branch).remote" origin
& git -C $RepoPath config "branch.$($manifest.branch).merge" "refs/heads/$($manifest.branch)"
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the restored branch upstream.' }

$currentCommit = (& git -C $RepoPath rev-parse HEAD).Trim()
if ($currentCommit -ne $manifest.baseCommit) {
  throw "Expected commit $($manifest.baseCommit), but restored repository is at $currentCommit."
}

$existingStatePath = Join-Path $RepoPath 'infra\aws\terraform\terraform.tfstate'
if (Test-Path -LiteralPath $existingStatePath -PathType Leaf) {
  try { $existingState = Get-Content -LiteralPath $existingStatePath -Raw | ConvertFrom-Json }
  catch { throw "Existing laptop Terraform state is not valid JSON: $existingStatePath" }
  if ([string]$existingState.lineage -ne [string]$manifest.terraformState.lineage) {
    throw 'Existing laptop Terraform state has a different lineage. It was not overwritten.'
  }
  if ([int]$existingState.serial -gt [int]$manifest.terraformState.serial) {
    throw "Existing laptop Terraform state serial $($existingState.serial) is newer than incoming serial $($manifest.terraformState.serial). It was not overwritten; rebuild the transfer kit from the authoritative state."
  }
}

$localBackupRoot = Join-Path (Split-Path -Parent $RepoPath) ('atlas-pre-transfer-files-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$localFilesBackedUp = $false
foreach ($relative in @(
  'apps\api\.env',
  'apps\api\.storage',
  '.storage',
  'infra\aws\terraform\staging.tfvars',
  'infra\aws\terraform\terraform.tfstate',
  'infra\aws\terraform\terraform.tfstate.backup'
)) {
  $existing = Join-Path $RepoPath $relative
  if (-not (Test-Path -LiteralPath $existing)) { continue }
  $backupTarget = Join-Path $localBackupRoot $relative
  if (Test-Path -LiteralPath $existing -PathType Container) {
    Copy-TreeChecked -Source $existing -DestinationPath $backupTarget
  }
  else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupTarget) | Out-Null
    Copy-Item -LiteralPath $existing -Destination $backupTarget -Force
  }
  $localFilesBackedUp = $true
}
if ($localFilesBackedUp) {
  Write-Host "Existing ignored app, storage, and Terraform files backed up to $localBackupRoot" -ForegroundColor Yellow
}

foreach ($relative in @('apps\api\.storage', '.storage')) {
  $incomingStorage = Join-Path $overlayRoot $relative
  if (Test-Path -LiteralPath $incomingStorage -PathType Container) {
    Copy-TreeChecked -Source $incomingStorage -DestinationPath (Join-Path $RepoPath $relative) -Mirror
  }
}
Copy-TreeChecked -Source $overlayRoot -DestinationPath $RepoPath

foreach ($relative in @($manifest.deletedRepositoryPaths)) {
  if ([string]::IsNullOrWhiteSpace($relative)) { continue }
  $target = [System.IO.Path]::GetFullPath((Join-Path $RepoPath $relative))
  if (-not $target.StartsWith($RepoPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refused deletion outside repository: $relative"
  }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

foreach ($relative in @(
  'apps\api\.env',
  'infra\aws\terraform\staging.tfvars',
  'infra\aws\terraform\terraform.tfstate',
  'infra\aws\terraform\modules\secrets\main.tf',
  'scripts\deploy-to-aws-staging.ps1'
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoPath $relative))) {
    throw "Required restored file is missing: $relative"
  }
}
Write-Host "Current branch and repository overlay restored to $RepoPath" -ForegroundColor Green

if ($InstallAwsCredentials) {
  if (-not $manifest.awsCredentialsIncluded) { throw 'This bundle does not include AWS profile files.' }
  $awsSource = Join-Path $transferRoot 'user-profile-overlay\.aws'
  $awsDestination = Join-Path $env:USERPROFILE '.aws'
  if (-not (Test-Path -LiteralPath $awsSource -PathType Container)) { throw "AWS profile overlay is missing: $awsSource" }
  if (Test-Path -LiteralPath $awsDestination -PathType Container) {
    $awsBackup = Join-Path $env:USERPROFILE ('.aws.backup-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Copy-Item -LiteralPath $awsDestination -Destination $awsBackup -Recurse -Force
    Write-Host "Existing AWS configuration backed up to $awsBackup"
  }
  Copy-TreeChecked -Source $awsSource -DestinationPath $awsDestination
  Write-Host "AWS profile files restored to $awsDestination" -ForegroundColor Green
}

if ($InstallDependencies) {
  foreach ($command in @('node', 'npm.cmd')) { Assert-Command -Name $command }
  $nodeVersion = (& node --version).TrimStart('v')
  if ([int]($nodeVersion.Split('.')[0]) -lt 22) { throw "Node.js 22 or newer is required; found $nodeVersion." }
  Push-Location $RepoPath
  try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
  }
  finally { Pop-Location }
}

if ($RestoreDatabase) {
  foreach ($command in @('docker', 'npm.cmd')) { Assert-Command -Name $command }
  if (-not $manifest.databaseDump) { throw 'This bundle does not contain a PostgreSQL dump.' }
  $dumpPath = Join-Path $transferRoot $manifest.databaseDump.Replace('/', '\')
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $apiListener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($apiListener) { throw 'Port 3000 is in use. Stop the local API before restoring PostgreSQL, then rerun this command.' }
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running with Linux containers.' }

  Push-Location $RepoPath
  try {
    & npm.cmd run dev:db
    if ($LASTEXITCODE -ne 0) { throw 'Failed to start local PostgreSQL.' }
  }
  finally { Pop-Location }

  $ready = $false
  for ($attempt = 1; $attempt -le 20; $attempt++) {
    & docker exec atlas-postgres pg_isready -U postgres -d atlas *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 3
  }
  if (-not $ready) { throw 'Local PostgreSQL did not become ready within 60 seconds.' }

  $backupRoot = Join-Path (Split-Path -Parent $RepoPath) 'atlas-local-backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $backupName = 'atlas-before-transfer-{0}.dump' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
  & docker exec atlas-postgres pg_dump -U postgres -d atlas -Fc -f "/tmp/$backupName"
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the pre-restore PostgreSQL safety dump. The database was not changed.' }
  & docker cp "atlas-postgres:/tmp/$backupName" (Join-Path $backupRoot $backupName) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the pre-restore PostgreSQL safety dump. The database was not changed.' }

  & docker cp $dumpPath 'atlas-postgres:/tmp/atlas-local.dump'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to copy the database dump into PostgreSQL.' }
  & docker exec atlas-postgres pg_restore --list /tmp/atlas-local.dump *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Incoming PostgreSQL dump validation failed. The database was not changed.' }
  & docker exec atlas-postgres pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -U postgres -d atlas /tmp/atlas-local.dump
  if ($LASTEXITCODE -ne 0) { throw "Database restore failed. Recovery dump: $backupRoot\$backupName" }
  Write-Host 'Local PostgreSQL data restored.' -ForegroundColor Green
}

if ($VerifyBuilds) {
  Push-Location $RepoPath
  try {
    & npm.cmd run build:api
    if ($LASTEXITCODE -ne 0) { throw 'API build verification failed.' }
    & npm.cmd run build:web
    if ($LASTEXITCODE -ne 0) { throw 'Web build verification failed.' }
  }
  finally { Pop-Location }
}

if ($VerifyStagingPlan) {
  Push-Location $RepoPath
  try {
    & npm.cmd run deploy:aws:staging
    if ($LASTEXITCODE -ne 0) { throw 'Staging plan verification failed.' }
  }
  finally { Pop-Location }
}

Write-Host ''
Write-Host 'Laptop restore complete.' -ForegroundColor Green
Write-Host "Repository: $RepoPath"
Write-Host 'Local application: npm.cmd run dev:local'
Write-Host 'Safe AWS plan: npm.cmd run deploy:aws:staging'
Write-Host 'Live deploy: npm.cmd run deploy:aws:staging -- -Apply -ExpectedAccountId YOUR_ACCOUNT_ID'
Write-Host 'Review git status; transfer-created source files remain uncommitted until you intentionally commit them.'
exit 0
