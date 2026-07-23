[CmdletBinding()]
param(
  [string]$Destination = 'E:\deploy_files',
  [string]$TargetRepoPath = 'C:\Users\rober\Documents\Projects\atlas',
  [switch]$ArchiveExisting,
  [switch]$SkipAwsCredentials,
  [switch]$SkipDatabase
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoPath = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Destination = [System.IO.Path]::GetFullPath($Destination)
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$buildRoot = "$Destination.build-$timestamp"
$archivePath = $null
$buildCompleted = $false

trap {
  $failureMessage = $_.Exception.Message
  try {
    if (-not $buildCompleted -and (Test-Path -LiteralPath $buildRoot)) {
      Remove-Item -LiteralPath $buildRoot -Recurse -Force
    }
    if ($archivePath -and -not (Test-Path -LiteralPath $Destination) -and (Test-Path -LiteralPath $archivePath)) {
      Move-Item -LiteralPath $archivePath -Destination $Destination
    }
  }
  catch {
    $failureMessage += " Cleanup also failed: $($_.Exception.Message)"
  }
  [Console]::Error.WriteLine("Transfer kit creation failed: $failureMessage")
  exit 1
}

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Copy-FileRelative {
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$DestinationRoot
  )

  $source = Join-Path $repoPath $RelativePath
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Required source file is missing: $RelativePath"
  }
  $destinationFile = Join-Path $DestinationRoot $RelativePath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destinationFile) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destinationFile -Force
}

function Copy-TreeChecked {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$DestinationPath
  )

  New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
  & robocopy $Source $DestinationPath /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE for $Source"
  }
}

function Copy-IniSections {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$DestinationPath,
    [Parameter(Mandatory)][string[]]$SectionNames
  )

  $requested = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($name in $SectionNames) { [void]$requested.Add($name) }
  $output = [System.Collections.Generic.List[string]]::new()
  $found = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $include = $false
  foreach ($line in [System.IO.File]::ReadAllLines($Source)) {
    $sectionMatch = [regex]::Match($line, '^\s*\[([^\]]+)\]\s*$')
    if ($sectionMatch.Success) {
      $sectionName = $sectionMatch.Groups[1].Value.Trim()
      $include = $requested.Contains($sectionName)
      if ($include) {
        if ($output.Count -gt 0 -and $output[$output.Count - 1] -ne '') { $output.Add('') }
        $output.Add($line)
        [void]$found.Add($sectionName)
      }
      continue
    }
    if ($include) { $output.Add($line) }
  }
  $missing = @($SectionNames | Where-Object { -not $found.Contains($_) })
  if ($missing.Count -gt 0) {
    throw "Required AWS profile sections are missing from ${Source}: $($missing -join ', ')"
  }
  [System.IO.File]::WriteAllLines($DestinationPath, $output, [System.Text.UTF8Encoding]::new($false))
}

foreach ($command in @('git', 'robocopy')) {
  Assert-Command -Name $command
}

if ($Destination.Equals($repoPath, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Destination.StartsWith($repoPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'The transfer destination must be outside the repository.'
}
if (Test-Path -LiteralPath $buildRoot) {
  throw "Temporary build path already exists: $buildRoot"
}

if (Test-Path -LiteralPath $Destination) {
  if (-not $ArchiveExisting) {
    throw "Destination already exists. Rerun with -ArchiveExisting to preserve it under a timestamped name."
  }
  $archivePath = "$Destination.previous-$timestamp"
  Move-Item -LiteralPath $Destination -Destination $archivePath
}

New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
$overlayRoot = Join-Path $buildRoot 'repo-overlay'
$repositoryRoot = Join-Path $buildRoot 'repository'
$databaseRoot = Join-Path $buildRoot 'database'
$profileRoot = Join-Path $buildRoot 'user-profile-overlay\.aws'
New-Item -ItemType Directory -Force -Path $overlayRoot, $repositoryRoot, $databaseRoot, $profileRoot | Out-Null

$branch = (& git -C $repoPath branch --show-current).Trim()
$baseCommit = (& git -C $repoPath rev-parse HEAD).Trim()
$origin = (& git -C $repoPath remote get-url origin).Trim()
if (-not $branch -or -not $baseCommit -or -not $origin) {
  throw 'Could not determine the current Git branch, commit, and origin.'
}

$bundlePath = Join-Path $repositoryRoot 'atlas.bundle'
& git -C $repoPath bundle create $bundlePath $branch
if ($LASTEXITCODE -ne 0) { throw 'git bundle create failed.' }
$savedPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  & git -C $repoPath bundle verify $bundlePath 2>&1 | Out-Null
  $bundleVerifyExit = $LASTEXITCODE
}
finally {
  $ErrorActionPreference = $savedPreference
}
if ($bundleVerifyExit -ne 0) { throw 'The generated Git bundle failed verification.' }

$overlaySet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$changedPaths = @(& git -C $repoPath diff --no-renames --name-only --diff-filter=ACMRTUXB HEAD --)
$untrackedPaths = @(& git -C $repoPath ls-files --others --exclude-standard)
foreach ($relative in @($changedPaths + $untrackedPaths)) {
  if (-not [string]::IsNullOrWhiteSpace($relative)) {
    [void]$overlaySet.Add($relative.Replace('/', '\'))
  }
}

foreach ($relative in $overlaySet) {
  Copy-FileRelative -RelativePath $relative -DestinationRoot $overlayRoot
}

$deletedPaths = @(& git -C $repoPath diff --no-renames --name-only --diff-filter=D HEAD -- | ForEach-Object { $_.Replace('/', '\') })

$requiredLocalFiles = @(
  'apps\api\.env',
  'infra\aws\terraform\staging.tfvars',
  'infra\aws\terraform\terraform.tfstate',
  'infra\aws\terraform\terraform.tfstate.backup'
)

# Refuse to package a variables file that would make the next Terraform plan
# roll the API back to a different image than the one recorded in local state.
$tfvarsPath = Join-Path $repoPath 'infra\aws\terraform\staging.tfvars'
$statePath = Join-Path $repoPath 'infra\aws\terraform\terraform.tfstate'
try {
  $terraformState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}
catch {
  throw "Terraform state is not valid JSON: $statePath"
}
$tagMatch = [regex]::Match(
  (Get-Content -LiteralPath $tfvarsPath -Raw),
  '(?m)^\s*api_image_tag\s*=\s*"([^"]+)"'
)
if (-not $tagMatch.Success) { throw 'Could not read api_image_tag from staging.tfvars.' }
$tfvarsImageTag = $tagMatch.Groups[1].Value
$stateRepositoryUrl = [string]$terraformState.outputs.api.value.ecr_repository_url
if ([string]::IsNullOrWhiteSpace($stateRepositoryUrl)) {
  throw 'Terraform state has no API ECR repository output.'
}
$stateImageTags = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$resourceInstanceCount = 0
foreach ($resource in @($terraformState.resources)) {
  $instances = @($resource.instances)
  $resourceInstanceCount += $instances.Count
  if ($resource.type -ne 'aws_ecs_task_definition') { continue }
  foreach ($instance in $instances) {
    $definitionsJson = [string]$instance.attributes.container_definitions
    if ([string]::IsNullOrWhiteSpace($definitionsJson)) { continue }
    foreach ($definition in @(ConvertFrom-Json $definitionsJson)) {
      $image = [string]$definition.image
      $imagePrefix = "${stateRepositoryUrl}:"
      if ($image.StartsWith($imagePrefix, [System.StringComparison]::Ordinal)) {
        [void]$stateImageTags.Add($image.Substring($imagePrefix.Length))
      }
    }
  }
}
if ($stateImageTags.Count -eq 0) {
  throw 'Could not find the current API image tag in Terraform state.'
}
if ($stateImageTags.Count -ne 1 -or -not $stateImageTags.Contains($tfvarsImageTag)) {
  throw 'staging.tfvars api_image_tag does not match the deployed image recorded in Terraform state.'
}
$stateSummary = [ordered]@{
  lineage = [string]$terraformState.lineage
  serial = [int]$terraformState.serial
  terraformVersion = [string]$terraformState.terraform_version
  resourceInstances = $resourceInstanceCount
  apiImageTag = $tfvarsImageTag
}
if ([string]::IsNullOrWhiteSpace($stateSummary.lineage) -or $stateSummary.serial -lt 1) {
  throw 'Terraform state lineage or serial is missing.'
}

foreach ($relative in $requiredLocalFiles) {
  Copy-FileRelative -RelativePath $relative -DestinationRoot $overlayRoot
}

foreach ($relative in @('apps\api\.storage', '.storage')) {
  $sourceDirectory = Join-Path $repoPath $relative
  if (Test-Path -LiteralPath $sourceDirectory -PathType Container) {
    Copy-TreeChecked -Source $sourceDirectory -DestinationPath (Join-Path $overlayRoot $relative)
  }
}

$awsIncluded = $false
if (-not $SkipAwsCredentials) {
  $awsSource = Join-Path $env:USERPROFILE '.aws'
  $missingAwsFiles = [System.Collections.Generic.List[string]]::new()
  foreach ($name in @('config', 'credentials')) {
    $source = Join-Path $awsSource $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $missingAwsFiles.Add($name); continue }
  }
  if ($missingAwsFiles.Count -gt 0) {
    throw "AWS credential transfer requested, but .aws is missing: $($missingAwsFiles -join ', '). Use -SkipAwsCredentials only if the laptop will authenticate separately."
  }
  Copy-IniSections -Source (Join-Path $awsSource 'config') -DestinationPath (Join-Path $profileRoot 'config') -SectionNames @('profile atlas-staging')
  Copy-IniSections -Source (Join-Path $awsSource 'credentials') -DestinationPath (Join-Path $profileRoot 'credentials') -SectionNames @('atlas-staging')
  $awsIncluded = $true
}

$databaseIncluded = $false
if (-not $SkipDatabase) {
  foreach ($command in @('docker', 'npm.cmd')) { Assert-Command -Name $command }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running with Linux containers.' }

  Push-Location $repoPath
  try {
    & npm.cmd run dev:db
    if ($LASTEXITCODE -ne 0) { throw 'Failed to start local PostgreSQL.' }
  }
  finally {
    Pop-Location
  }

  $ready = $false
  for ($attempt = 1; $attempt -le 20; $attempt++) {
    & docker exec atlas-postgres pg_isready -U postgres -d atlas *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 3
  }
  if (-not $ready) { throw 'Local PostgreSQL did not become ready within 60 seconds.' }

  $containerDump = "/tmp/atlas-transfer-$timestamp.dump"
  & docker exec atlas-postgres pg_dump -U postgres -d atlas -Fc -f $containerDump
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
  $dumpPath = Join-Path $databaseRoot 'atlas-local.dump'
  & docker cp "atlas-postgres:$containerDump" $dumpPath
  if ($LASTEXITCODE -ne 0) { throw 'Failed to copy the PostgreSQL dump.' }
  & docker cp $dumpPath 'atlas-postgres:/tmp/atlas-transfer-verify.dump' | Out-Null
  & docker exec atlas-postgres pg_restore --list /tmp/atlas-transfer-verify.dump *> $null
  if ($LASTEXITCODE -ne 0) { throw 'The PostgreSQL dump failed validation.' }
  $databaseIncluded = $true
}

Copy-Item -LiteralPath (Join-Path $repoPath 'scripts\restore-atlas-transfer.ps1') -Destination (Join-Path $buildRoot 'restore-atlas.ps1') -Force
Copy-Item -LiteralPath (Join-Path $repoPath 'docs\laptop-transfer.md') -Destination (Join-Path $buildRoot 'README.md') -Force

$awsProfilesIncluded = @()
if ($awsIncluded) { $awsProfilesIncluded = @('atlas-staging') }
$manifest = [ordered]@{
  bundleVersion = 2
  createdAt = (Get-Date).ToString('o')
  sourceRepository = $repoPath
  targetRepository = $TargetRepoPath
  origin = $origin
  branch = $branch
  baseCommit = $baseCommit
  gitBundle = 'repository/atlas.bundle'
  repoOverlay = 'repo-overlay'
  databaseDump = if ($databaseIncluded) { 'database/atlas-local.dump' } else { $null }
  awsCredentialsIncluded = $awsIncluded
  awsProfilesIncluded = $awsProfilesIncluded
  awsProfile = 'atlas-staging'
  awsRegion = 'us-west-2'
  terraformState = $stateSummary
  deletedRepositoryPaths = @($deletedPaths)
  overlaySourcePaths = @($overlaySet | Sort-Object)
  requiredLocalPaths = @($requiredLocalFiles + @('apps\api\.storage', '.storage'))
}
$manifestJson = $manifest | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
  (Join-Path $buildRoot 'transfer-manifest.json'),
  $manifestJson + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)

$securityText = @"
SECURITY WARNING

This kit contains application secrets, AWS credentials (when included),
Terraform state, uploaded financial documents, and a PostgreSQL dump.

Transport it only on an encrypted, healthy USB drive. Do not email it, upload
it to cloud storage, commit it, or keep the recovery key on the same drive.
After restoration, rotate static AWS access keys when practical.
"@
[System.IO.File]::WriteAllText(
  (Join-Path $buildRoot 'SECURITY-WARNING.txt'),
  $securityText,
  [System.Text.UTF8Encoding]::new($false)
)

$checksumPath = Join-Path $buildRoot 'checksums.sha256'
$checksumLines = foreach ($file in Get-ChildItem -LiteralPath $buildRoot -File -Recurse -Force | Where-Object { $_.FullName -ne $checksumPath } | Sort-Object FullName) {
  $relative = $file.FullName.Substring($buildRoot.Length).TrimStart('\').Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $relative"
}
[System.IO.File]::WriteAllLines($checksumPath, [string[]]$checksumLines, [System.Text.UTF8Encoding]::new($false))

Move-Item -LiteralPath $buildRoot -Destination $Destination
$buildCompleted = $true

$allFiles = @(Get-ChildItem -LiteralPath $Destination -File -Recurse -Force)
$totalBytes = ($allFiles | Measure-Object Length -Sum).Sum
Write-Host ''
Write-Host "Transfer kit created: $Destination" -ForegroundColor Green
Write-Host "Branch: $branch"
Write-Host "Commit: $baseCommit"
Write-Host "Files: $($allFiles.Count)"
Write-Host ('Size: {0:N2} MiB' -f ($totalBytes / 1MB))
if ($archivePath) { Write-Host "Previous kit archived at: $archivePath" }
Write-Host 'Run restore-atlas.ps1 from the encrypted USB drive on the laptop.'
exit 0
