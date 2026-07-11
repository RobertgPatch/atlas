<#
.SYNOPSIS
Imports apps/api/.env entries into a Bitwarden Secrets Manager project.

.DESCRIPTION
Reads dotenv-style KEY=VALUE lines from apps/api/.env and upserts them as
Bitwarden Secrets Manager secrets with the same key names. Secret values are
never written to the console.

Prerequisites:
- Install the Bitwarden Secrets Manager CLI as `bws`, or pass -UseDocker.
- Set BWS_ACCESS_TOKEN for a machine account with read/write access to the
  target project.
- Pass -ProjectId, or set BWS_PROJECT_ID in your shell.

.EXAMPLE
$env:BWS_ACCESS_TOKEN = '<machine-account-access-token>'
$env:BWS_PROJECT_ID = '<bitwarden-project-id>'
powershell -ExecutionPolicy Bypass -File scripts/bitwarden-sync-api-env.ps1

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/bitwarden-sync-api-env.ps1 `
  -ProjectId '<bitwarden-project-id>' `
  -EnvFile apps/api/.env `
  -DryRun
#>

[CmdletBinding()]
param(
  [string]$ProjectId = $env:BWS_PROJECT_ID,
  [string]$EnvFile = '',
  [string]$BwsPath = 'bws',
  [string]$Profile = '',
  [string]$ConfigFile = '',
  [string]$ServerUrl = '',
  [switch]$DryRun,
  [switch]$IncludeEmpty,
  [switch]$NoUpdateExisting,
  [switch]$UseDocker
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

if (-not $EnvFile) {
  $EnvFile = Join-Path $scriptRoot '..\apps\api\.env'
}

function Resolve-InputPath {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment file not found: $Path"
  }

  return (Resolve-Path -LiteralPath $Path).Path
}

function ConvertFrom-DotenvValue {
  param([string]$RawValue)

  $value = $RawValue.Trim()
  if ($value.Length -eq 0) {
    return ''
  }

  if ($value.StartsWith('"')) {
    $closingQuote = $value.LastIndexOf('"')
    if ($closingQuote -gt 0) {
      $value = $value.Substring(1, $closingQuote - 1)
    }

    return $value.
      Replace('\n', "`n").
      Replace('\r', "`r").
      Replace('\t', "`t").
      Replace('\"', '"').
      Replace('\\', '\')
  }

  if ($value.StartsWith("'")) {
    $closingQuote = $value.LastIndexOf("'")
    if ($closingQuote -gt 0) {
      return $value.Substring(1, $closingQuote - 1)
    }
  }

  return (($value -replace '\s+#.*$', '').Trim())
}

function Read-DotenvEntries {
  param([string]$Path)

  $entries = [ordered]@{}
  $lineNumber = 0

  foreach ($line in Get-Content -LiteralPath $Path) {
    $lineNumber += 1
    $trimmed = $line.Trim()

    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }

    $match = [regex]::Match(
      $line,
      '^\s*(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)$'
    )

    if (-not $match.Success) {
      throw "Unsupported dotenv syntax at ${Path}:$lineNumber. Expected KEY=VALUE."
    }

    $key = $match.Groups['key'].Value
    if ($entries.Contains($key)) {
      throw "Duplicate dotenv key '$key' found at ${Path}:$lineNumber. Remove the duplicate before syncing."
    }

    $entries[$key] = ConvertFrom-DotenvValue $match.Groups['value'].Value
  }

  return $entries
}

function Get-BwsCommonArgs {
  $args = @('--color', 'no')

  if ($Profile) {
    $args += @('--profile', $Profile)
  }

  if ($ConfigFile) {
    $args += @('--config-file', $ConfigFile)
  }

  if ($ServerUrl) {
    $args += @('--server-url', $ServerUrl)
  }

  return $args
}

function Invoke-Bws {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  if ($DryRun) {
    return ''
  }

  if ($UseDocker) {
    $dockerArgs = @('run', '--rm', '-e', 'BWS_ACCESS_TOKEN', 'ghcr.io/bitwarden/bws') + $Arguments
    $output = & docker @dockerArgs 2>&1
  } else {
    $output = & $BwsPath @Arguments 2>&1
  }

  if ($LASTEXITCODE -ne 0) {
    $target = if ($UseDocker) { 'docker run ghcr.io/bitwarden/bws' } else { $BwsPath }
    throw "$target failed while running a bws command. Review the CLI error above; secret values were not printed by this script."
  }

  return ($output | Out-String)
}

function Confirm-Prerequisites {
  if (-not $ProjectId) {
    throw 'Set BWS_PROJECT_ID or pass -ProjectId <bitwarden-project-id>.'
  }

  if ($DryRun) {
    return
  }

  if ($UseDocker) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
      throw 'Docker was not found on PATH. Install Docker or omit -UseDocker to use native bws.'
    }

    if (-not $env:BWS_ACCESS_TOKEN) {
      throw 'Set BWS_ACCESS_TOKEN before using -UseDocker.'
    }

    return
  }

  if (-not (Get-Command $BwsPath -ErrorAction SilentlyContinue)) {
    throw "Bitwarden Secrets Manager CLI '$BwsPath' was not found on PATH. Install bws or pass -UseDocker."
  }

  if (-not $env:BWS_ACCESS_TOKEN) {
    Write-Warning 'BWS_ACCESS_TOKEN is not set; continuing in case bws already has usable local state/config.'
  }
}

function Get-ExistingSecretsByKey {
  $args = @('secret', 'list', $ProjectId, '--output', 'json') + (Get-BwsCommonArgs)
  $json = Invoke-Bws -Arguments $args

  if ([string]::IsNullOrWhiteSpace($json)) {
    return @{}
  }

  try {
    $parsed = $json | ConvertFrom-Json
  } catch {
    throw 'Unable to parse JSON from bws secret list. No changes were made after listing secrets.'
  }

  $secrets = @($parsed)
  $duplicates = $secrets |
    Group-Object -Property key |
    Where-Object { $_.Count -gt 1 } |
    Select-Object -ExpandProperty Name

  if ($duplicates.Count -gt 0) {
    throw "Duplicate secret key(s) already exist in the Bitwarden project: $($duplicates -join ', '). Resolve duplicates before syncing."
  }

  $byKey = @{}
  foreach ($secret in $secrets) {
    $byKey[$secret.key] = $secret
  }

  return $byKey
}

$envFilePath = Resolve-InputPath $EnvFile
Confirm-Prerequisites

$entries = Read-DotenvEntries -Path $envFilePath
$keysToSync = @($entries.Keys | Where-Object { $IncludeEmpty -or $entries[$_] -ne '' })
$emptyKeys = @($entries.Keys | Where-Object { -not $IncludeEmpty -and $entries[$_] -eq '' })

Write-Host "Bitwarden project: $ProjectId"
Write-Host "Environment file:  $envFilePath"
Write-Host "Entries loaded:    $($entries.Count)"
Write-Host "Entries to sync:   $($keysToSync.Count)"

if ($emptyKeys.Count -gt 0) {
  Write-Host "Empty skipped:     $($emptyKeys -join ', ')"
}

if ($DryRun) {
  foreach ($key in $keysToSync) {
    Write-Host "[dry-run] Would create or update $key"
  }

  Write-Host 'Dry run complete. No Bitwarden changes were made.'
  exit 0
}

$existingByKey = Get-ExistingSecretsByKey
$note = 'Managed from Atlas apps/api/.env by scripts/bitwarden-sync-api-env.ps1.'
$created = 0
$updated = 0
$unchanged = 0
$skipped = 0

foreach ($key in $keysToSync) {
  $value = $entries[$key]

  if ($existingByKey.ContainsKey($key)) {
    $existing = $existingByKey[$key]

    if ($NoUpdateExisting) {
      Write-Host "Skipped existing $key"
      $skipped += 1
      continue
    }

    if ($existing.value -eq $value) {
      Write-Host "Unchanged $key"
      $unchanged += 1
      continue
    }

    $args = @('secret', 'edit', $existing.id, '--value', $value, '--output', 'none') + (Get-BwsCommonArgs)
    Invoke-Bws -Arguments $args | Out-Null
    Write-Host "Updated $key"
    $updated += 1
  } else {
    $args = @('secret', 'create', $key, $value, $ProjectId, '--note', $note, '--output', 'none') + (Get-BwsCommonArgs)
    Invoke-Bws -Arguments $args | Out-Null
    Write-Host "Created $key"
    $created += 1
  }
}

Write-Host ''
Write-Host "Sync complete. Created: $created; updated: $updated; unchanged: $unchanged; skipped: $skipped."
Write-Host "Runtime injection example: bws run --project-id $ProjectId -- npm run dev:api"
