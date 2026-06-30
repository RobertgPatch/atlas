$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot
$quotedRepoRoot = $repoRoot.Path.Replace("'", "''")

Write-Host 'Starting local Postgres...'
npm run dev:db

Write-Host 'Starting API and web dev servers in separate PowerShell windows...'
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$quotedRepoRoot'; npm run dev:api"
)

Write-Host 'Waiting for API health check...'
$apiReady = $false
for ($attempt = 1; $attempt -le 60; $attempt += 1) {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/health' -UseBasicParsing -TimeoutSec 1
    if ($response.StatusCode -eq 200) {
      $apiReady = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $apiReady) {
  Write-Warning 'API did not pass /health within 60 seconds. Starting web anyway.'
}

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$quotedRepoRoot'; npm run --workspace=web dev"
)

Write-Host ''
Write-Host 'Local development services requested:'
Write-Host '- Postgres: 127.0.0.1:55432'
Write-Host '- API:      http://localhost:3000'
Write-Host '- Web:      http://localhost:5173'
