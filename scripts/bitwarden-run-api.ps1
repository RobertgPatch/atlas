<#
.SYNOPSIS
Runs the Atlas API with Bitwarden Secrets Manager secrets injected.

.DESCRIPTION
Use this on a laptop that does not have apps/api/.env. The Bitwarden Secrets
Manager CLI runs the API command with secrets from one project exposed as
environment variables.

Prerequisites:
- Install the native Bitwarden Secrets Manager CLI as `bws`.
- Set BWS_ACCESS_TOKEN for a machine account with read access to the project.
- Pass -ProjectId, or set BWS_PROJECT_ID in your shell.

.EXAMPLE
$env:BWS_ACCESS_TOKEN = '<machine-account-access-token>'
$env:BWS_PROJECT_ID = '<bitwarden-project-id>'
powershell -ExecutionPolicy Bypass -File scripts/bitwarden-run-api.ps1
#>

[CmdletBinding()]
param(
  [string]$ProjectId = $env:BWS_PROJECT_ID,
  [string]$Command = 'npm run dev:api',
  [string]$BwsPath = 'bws',
  [string]$Profile = '',
  [string]$ConfigFile = '',
  [string]$ServerUrl = '',
  [switch]$NoInheritEnv
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoRoot = Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')

if (-not $ProjectId) {
  throw 'Set BWS_PROJECT_ID or pass -ProjectId <bitwarden-project-id>.'
}

if (-not (Get-Command $BwsPath -ErrorAction SilentlyContinue)) {
  throw "Bitwarden Secrets Manager CLI '$BwsPath' was not found on PATH. Install bws first."
}

if (-not $env:BWS_ACCESS_TOKEN) {
  throw 'Set BWS_ACCESS_TOKEN to a Bitwarden machine account access token before running this script.'
}

Set-Location $repoRoot

$bwsArgs = @('run', '--project-id', $ProjectId, '--color', 'no')

if ($NoInheritEnv) {
  $bwsArgs += '--no-inherit-env'
}

if ($Profile) {
  $bwsArgs += @('--profile', $Profile)
}

if ($ConfigFile) {
  $bwsArgs += @('--config-file', $ConfigFile)
}

if ($ServerUrl) {
  $bwsArgs += @('--server-url', $ServerUrl)
}

$bwsArgs += @('--', $Command)

Write-Host "Running API with Bitwarden project: $ProjectId"
Write-Host "Command: $Command"
& $BwsPath @bwsArgs
exit $LASTEXITCODE
