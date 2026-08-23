[CmdletBinding()]
param(
  [string]$RepoPath,
  [string]$AwsProfile = 'atlas-staging',
  [string]$AwsRegion = 'us-west-2',
  [string]$ExpectedAccountId,
  [string]$StateBackupDirectory,
  [switch]$Apply,
  [switch]$RunTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
  $RepoPath = Split-Path -Parent $PSScriptRoot
}

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Invoke-TerraformPlan {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][ref]$ExitCode
  )

  $savedPreference = $ErrorActionPreference
  try {
    # Windows PowerShell can promote normal Terraform stderr diagnostics to
    # terminating errors. Terraform's exit code is the source of truth.
    $ErrorActionPreference = 'Continue'
    & terraform @Arguments
    $ExitCode.Value = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $savedPreference
  }
}

foreach ($command in @('git', 'node', 'npm.cmd', 'docker', 'terraform', 'aws')) {
  Assert-Command -Name $command
}

$RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
if (-not (Test-Path -LiteralPath (Join-Path $RepoPath '.git') -PathType Container)) {
  throw "Atlas Git repository not found at $RepoPath"
}

$terraformRoot = Join-Path $RepoPath 'infra\aws\terraform'
$tfvarsPath = Join-Path $terraformRoot 'staging.tfvars'
$statePath = Join-Path $terraformRoot 'terraform.tfstate'
$stateBackupPath = Join-Path $terraformRoot 'terraform.tfstate.backup'
$secretsModule = Join-Path $terraformRoot 'modules\secrets\main.tf'
foreach ($required in @($tfvarsPath, $statePath, $secretsModule)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required staging file is missing: $required. Restore the current laptop transfer kit first."
  }
}

$nodeVersion = (& node --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 22) {
  throw "Node.js 22 or newer is required; found $nodeVersion."
}

$env:AWS_PROFILE = $AwsProfile
$env:AWS_REGION = $AwsRegion
$identityJson = & aws sts get-caller-identity --profile $AwsProfile --output json
if ($LASTEXITCODE -ne 0 -or -not $identityJson) {
  throw "Unable to authenticate with AWS profile '$AwsProfile'."
}
$identity = $identityJson | ConvertFrom-Json

Write-Host "AWS account: $($identity.Account)"
Write-Host "AWS identity: $($identity.Arn)"
if ($ExpectedAccountId -and $identity.Account -ne $ExpectedAccountId) {
  throw "AWS account mismatch. Expected $ExpectedAccountId but authenticated to $($identity.Account)."
}
if ($Apply -and -not $ExpectedAccountId) {
  throw 'Live deployment requires -ExpectedAccountId with the staging AWS account ID you verified.'
}

Push-Location $terraformRoot
try {
  & terraform init -input=false
  if ($LASTEXITCODE -ne 0) { throw 'terraform init failed.' }

  $workspace = (& terraform workspace show).Trim()
  if ($workspace -ne 'default') {
    throw "Expected Terraform workspace 'default'; found '$workspace'."
  }

  & terraform validate
  if ($LASTEXITCODE -ne 0) { throw 'terraform validate failed.' }

  if (-not $Apply) {
    $planExit = 0
    Invoke-TerraformPlan -ExitCode ([ref]$planExit) -Arguments @(
      'plan',
      "-var-file=$tfvarsPath",
      '-detailed-exitcode',
      '-input=false'
    )
    if ($planExit -eq 0) {
      Write-Host 'Terraform reports no staging infrastructure drift.' -ForegroundColor Green
    }
    elseif ($planExit -eq 2) {
      Write-Host 'Terraform produced a change plan. Review it carefully above.' -ForegroundColor Yellow
    }
    else {
      throw "terraform plan failed with exit code $planExit."
    }

    Write-Host ''
    Write-Host 'PLAN ONLY: no AWS resources or web assets were changed.' -ForegroundColor Green
    Write-Host 'For a live deployment, rerun with -Apply and -ExpectedAccountId.'
    exit 0
  }
}
finally {
  Pop-Location
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop is not running with Linux containers.'
}

Push-Location $RepoPath
try {
  # A node_modules directory can be present but stale after changing branches.
  # Always converge it to package-lock.json before building a release.
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }

  if ($RunTests) {
    & npm.cmd run test:api
    if ($LASTEXITCODE -ne 0) { throw 'API tests failed.' }
    & npm.cmd run test:web
    if ($LASTEXITCODE -ne 0) { throw 'Web tests failed.' }
  }

  & npm.cmd run build:api
  if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
  & npm.cmd run build:web
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }

  $gitShort = (& git rev-parse --short=12 HEAD).Trim()
  $dirtySuffix = if (@(& git status --porcelain).Count -gt 0) { '-dirty' } else { '' }
  $releaseTag = '{0}{1}-{2}' -f $gitShort, $dirtySuffix, (Get-Date -Format 'yyyyMMddHHmmss')
  & docker build --platform linux/amd64 -f apps/api/Dockerfile -t "atlas-api:$releaseTag" .
  if ($LASTEXITCODE -ne 0) { throw 'API container build failed.' }
}
finally {
  Pop-Location
}

Push-Location $terraformRoot
$planPath = $null
try {
  $apiOutput = & terraform output -json api | ConvertFrom-Json
  $edgeOutput = & terraform output -json edge | ConvertFrom-Json
  if (-not $apiOutput.ecr_repository_url) { throw 'Terraform ECR output is empty.' }

  $registry = ($apiOutput.ecr_repository_url -split '/')[0]
  $registryAccountId = ($registry -split '\.')[0]
  if ($registryAccountId -ne $identity.Account) {
    throw "ECR/account mismatch. Terraform state points to account $registryAccountId, but AWS authentication is for $($identity.Account)."
  }
  & aws ecr get-login-password --region $AwsRegion --profile $AwsProfile |
    docker login --username AWS --password-stdin $registry
  if ($LASTEXITCODE -ne 0) { throw 'ECR login failed.' }

  & docker tag "atlas-api:$releaseTag" "$($apiOutput.ecr_repository_url):$releaseTag"
  & docker push "$($apiOutput.ecr_repository_url):$releaseTag"
  if ($LASTEXITCODE -ne 0) { throw 'ECR push failed.' }

  $planPath = Join-Path $env:TEMP "atlas-staging-$releaseTag.tfplan"
  $releasePlanExit = 0
  Invoke-TerraformPlan -ExitCode ([ref]$releasePlanExit) -Arguments @(
    'plan',
    "-var-file=$tfvarsPath",
    "-var=api_image_tag=$releaseTag",
    "-out=$planPath",
    '-input=false'
  )
  if ($releasePlanExit -ne 0) { throw 'Release Terraform plan failed.' }

  Write-Host ''
  Write-Host "Release image pushed: $releaseTag" -ForegroundColor Yellow
  Write-Host 'Review the saved Terraform plan above.' -ForegroundColor Yellow
  $confirmation = Read-Host 'Type DEPLOY-STAGING to apply it and replace the staging web assets'
  if ($confirmation -ne 'DEPLOY-STAGING') {
    throw 'Deployment cancelled before Terraform apply.'
  }

  if (-not $StateBackupDirectory) {
    $StateBackupDirectory = Join-Path (Split-Path -Parent $RepoPath) 'atlas-staging-state-backups'
  }
  New-Item -ItemType Directory -Force -Path $StateBackupDirectory | Out-Null
  $backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item -LiteralPath $statePath -Destination (Join-Path $StateBackupDirectory "terraform-before-$backupStamp.tfstate") -Force
  if (Test-Path -LiteralPath $stateBackupPath -PathType Leaf) {
    Copy-Item -LiteralPath $stateBackupPath -Destination (Join-Path $StateBackupDirectory "terraform-before-$backupStamp.tfstate.backup") -Force
  }

  $savedPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & terraform apply -input=false $planPath
    $applyExit = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $savedPreference
  }
  if ($applyExit -ne 0) { throw 'Terraform apply failed.' }

  # Keep the ignored local variables file aligned with the image now recorded
  # in state so the next plan does not propose reverting to an old tag.
  $tfvarsText = Get-Content -LiteralPath $tfvarsPath -Raw
  if ($tfvarsText -notmatch '(?m)^\s*api_image_tag\s*=') {
    throw 'staging.tfvars has no api_image_tag assignment to update.'
  }
  $tfvarsText = [regex]::Replace(
    $tfvarsText,
    '(?m)^\s*api_image_tag\s*=.*$',
    "api_image_tag = `"$releaseTag`""
  )
  [System.IO.File]::WriteAllText($tfvarsPath, $tfvarsText, [System.Text.UTF8Encoding]::new($false))

  Copy-Item -LiteralPath $statePath -Destination (Join-Path $StateBackupDirectory "terraform-after-$backupStamp.tfstate") -Force
  if (Test-Path -LiteralPath $stateBackupPath -PathType Leaf) {
    Copy-Item -LiteralPath $stateBackupPath -Destination (Join-Path $StateBackupDirectory "terraform-after-$backupStamp.tfstate.backup") -Force
  }

  $apiOutput = & terraform output -json api | ConvertFrom-Json
  $edgeOutput = & terraform output -json edge | ConvertFrom-Json
}
finally {
  Pop-Location
  if ($planPath -and (Test-Path -LiteralPath $planPath -PathType Leaf)) {
    Remove-Item -LiteralPath $planPath -Force
  }
}

Push-Location $RepoPath
try {
  & aws s3 sync 'apps/web/dist' "s3://$($edgeOutput.web_bucket_name)" --delete --region $AwsRegion --profile $AwsProfile
  if ($LASTEXITCODE -ne 0) { throw 'S3 web deployment failed.' }

  & aws cloudfront create-invalidation --distribution-id $edgeOutput.cloudfront_distribution_id --paths '/*' --profile $AwsProfile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'CloudFront invalidation failed.' }
}
finally {
  Pop-Location
}

$clusterName = ($apiOutput.ecs_cluster_arn -split '/')[-1]
$serviceName = ($clusterName -replace '-cluster$', '-api')
& aws ecs wait services-stable --cluster $clusterName --services $serviceName --region $AwsRegion --profile $AwsProfile
if ($LASTEXITCODE -ne 0) { throw 'ECS did not become stable.' }

try {
  $health = Invoke-WebRequest -UseBasicParsing -Uri "http://$($apiOutput.load_balancer_dns_name)/health" -TimeoutSec 30
  Write-Host "API health returned HTTP $($health.StatusCode)." -ForegroundColor Green
}
catch {
  throw "ECS is stable, but the direct ALB health request did not succeed: $($_.Exception.Message)"
}

Write-Host ''
Write-Host "Staging deployment completed with API image tag $releaseTag" -ForegroundColor Green
Write-Host "Web URL: $($edgeOutput.public_web_url)"
Write-Host "API health: http://$($apiOutput.load_balancer_dns_name)/health"
Write-Host "Terraform state backups: $StateBackupDirectory" -ForegroundColor Yellow
Write-Host 'Only this state copy should be used for the next apply until a remote backend is configured.' -ForegroundColor Yellow
exit 0
