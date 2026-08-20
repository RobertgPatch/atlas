$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot
$quotedRepoRoot = $repoRoot.Path.Replace("'", "''")

Write-Host 'Starting local Postgres...'
npm run dev:db

Write-Host 'Waiting for local Postgres health check...'
$postgresReady = $false
for ($attempt = 1; $attempt -le 60; $attempt += 1) {
  $postgresHealth = docker inspect --format='{{.State.Health.Status}}' atlas-postgres 2>$null
  if ($LASTEXITCODE -eq 0 -and $postgresHealth -eq 'healthy') {
    $postgresReady = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $postgresReady) {
  throw 'Local Postgres did not become healthy within 60 seconds. Run `docker compose -f docker-compose.dev.yml ps` and inspect the container logs.'
}

Write-Host 'Starting API, durable K-1 worker, and web dev servers in separate PowerShell windows...'
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$quotedRepoRoot'; `$env:K1_EXTRACTOR='stub'; `$env:K1_OBJECT_STORE='local'; `$env:K1_QUEUE='local'; npm run dev:api"
)

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$quotedRepoRoot'; `$env:K1_EXTRACTOR='stub'; `$env:K1_OBJECT_STORE='local'; `$env:K1_QUEUE='local'; npm run --workspace=api dev:k1-worker"
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
Write-Host '- Postgres: 127.0.0.1:15432'
Write-Host '- API:      http://localhost:3000'
Write-Host '- Web:      http://localhost:5173'
Write-Host '- K-1 extraction: deterministic local stub using the same Postgres queue/attempt/review pipeline as AWS'
