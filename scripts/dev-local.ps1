[CmdletBinding()]
param(
  [ValidateSet('stub', 'bda')]
  [string]$K1Mode = 'stub',
  [string]$LocalBdaEnvironmentFile = 'apps/api/.env.local-bda',
  [switch]$LibraryOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LocalEnvironmentValue {
  param(
    [Parameter(Mandatory = $true)] [System.Collections.IDictionary] $Environment,
    [Parameter(Mandatory = $true)] [string] $Name
  )
  if ($Environment.Contains($Name)) { return [string]$Environment[$Name] }
  return ''
}

function Import-LocalBdaEnvironmentFile {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [string] $Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Local BDA configuration file not found: $Path. Copy apps/api/local-bda.env.example to apps/api/.env.local-bda and fill in the approved non-secret resource identifiers."
  }
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      throw "Invalid local BDA environment line for key-only dotenv parsing in $Path."
    }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Test-LoopbackPostgresUrl {
  param([Parameter(Mandatory = $true)] [string] $DatabaseUrl)
  try { $uri = [Uri]$DatabaseUrl } catch { return $false }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { return $false }
  $hostName = $uri.Host.Trim('[', ']').ToLowerInvariant()
  return $hostName -eq 'localhost' -or $hostName -eq '::1' -or $hostName -match '^127(?:\.\d{1,3}){3}$'
}

function Test-LocalDevelopmentBoundary {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [System.Collections.IDictionary] $Environment,
    [ValidateSet('stub', 'bda')] [string] $Mode = 'stub'
  )

  $nodeEnvironment = Get-LocalEnvironmentValue $Environment 'NODE_ENV'
  if ($nodeEnvironment -and $nodeEnvironment -ne 'development') {
    throw 'The local launcher requires NODE_ENV=development.'
  }
  $runtimeClass = Get-LocalEnvironmentValue $Environment 'ATLAS_RUNTIME'
  if ($runtimeClass -and $runtimeClass -ne 'local') {
    throw 'The local launcher refuses a non-local runtime.'
  }

  $databaseUrl = Get-LocalEnvironmentValue $Environment 'DATABASE_URL'
  if ($databaseUrl -and -not (Test-LoopbackPostgresUrl $databaseUrl)) {
    throw 'The local launcher requires a loopback PostgreSQL DATABASE_URL.'
  }

  $exactLocal = if ($Mode -eq 'bda') {
    [ordered]@{
      ATLAS_LOCAL_BDA_ENABLED = 'true'
      K1_EXTRACTOR = 'aws_bda'
      K1_OBJECT_STORE = 's3'
      K1_QUEUE = 'local'
      K1_AWS_INGESTION_ENABLED = 'true'
      K1_UPLOADS_ENABLED = 'true'
      K1_EXTRACTION_ENABLED = 'true'
      K1_BDA_PROJECT_STAGE = 'LIVE'
      AWS_REGION = 'us-west-2'
      MARKET_DATA_PROVIDER = 'none'
    }
  } else {
    [ordered]@{
      ATLAS_LOCAL_BDA_ENABLED = 'false'
      K1_EXTRACTOR = 'stub'
      K1_OBJECT_STORE = 'local'
      K1_QUEUE = 'local'
      K1_AWS_INGESTION_ENABLED = 'false'
      MARKET_DATA_PROVIDER = 'none'
    }
  }
  foreach ($entry in $exactLocal.GetEnumerator()) {
    $value = Get-LocalEnvironmentValue $Environment $entry.Key
    if ($value -and $value -ne $entry.Value) {
      throw "The local launcher refuses provider setting $($entry.Key)."
    }
    if ($Mode -eq 'bda' -and $value -ne $entry.Value) {
      throw "The local BDA launcher requires $($entry.Key)=$($entry.Value)."
    }
  }

  $plaidEnvironment = Get-LocalEnvironmentValue $Environment 'PLAID_ENV'
  if ($plaidEnvironment -and $plaidEnvironment -ne 'sandbox') {
    throw 'The local launcher refuses non-sandbox Plaid environments.'
  }

  $alwaysRefusedResources = @(
    'AWS_APP_DOMAIN', 'AWS_CLOUDFRONT_DISTRIBUTION_ID', 'AWS_WEB_ASSETS_BUCKET'
  )
  $stubOnlyRefusedResources = @(
    'K1_S3_BUCKET', 'K1_KMS_KEY_ARN', 'K1_WORK_QUEUE_URL',
    'K1_COMPLETION_QUEUE_URL', 'K1_BDA_PROFILE_ARN', 'K1_BDA_PROJECT_ARN'
  )
  foreach ($key in @($alwaysRefusedResources) + $(if ($Mode -eq 'stub') { $stubOnlyRefusedResources } else { @() })) {
    if (Get-LocalEnvironmentValue $Environment $key) {
      throw "The local launcher refuses configured AWS resource $key."
    }
  }

  $awsProfile = Get-LocalEnvironmentValue $Environment 'AWS_PROFILE'
  if ($Mode -eq 'stub' -and $awsProfile -match '(?i)(^|[-_])prod(?:uction)?($|[-_])') {
    throw 'The local launcher refuses an AWS production profile.'
  }
  $accountId = Get-LocalEnvironmentValue $Environment 'AWS_ACCOUNT_ID'
  $productionAccountId = Get-LocalEnvironmentValue $Environment 'ATLAS_PRODUCTION_ACCOUNT_ID'
  if ($Mode -eq 'stub' -and $accountId -and $productionAccountId -and $accountId -eq $productionAccountId) {
    throw 'The local launcher refuses the production AWS account identity.'
  }
  if ($Mode -eq 'bda') {
    $approvedAccountId = Get-LocalEnvironmentValue $Environment 'ATLAS_LOCAL_BDA_ACCOUNT_ID'
    if ($approvedAccountId -notmatch '^\d{12}$') {
      throw 'The local BDA launcher requires a 12-digit ATLAS_LOCAL_BDA_ACCOUNT_ID.'
    }
    if ($accountId -and $accountId -ne $approvedAccountId) {
      throw 'The local BDA launcher found an AWS account marker that does not match the approved account.'
    }
    foreach ($key in @('K1_S3_BUCKET', 'K1_KMS_KEY_ARN', 'K1_BDA_PROFILE_ARN', 'K1_BDA_PROJECT_ARN')) {
      if (-not (Get-LocalEnvironmentValue $Environment $key)) {
        throw "The local BDA launcher requires AWS resource $key."
      }
    }
    $paidLimitRanges = [ordered]@{
      ABUSE_K1_GLOBAL_FILES_PER_MONTH = @(1, 50)
      ABUSE_K1_BDA_CALLS_PER_MONTH = @(1, 10)
      ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS = @(640, 25000)
      ABUSE_BDA_MAX_ATTEMPTS = @(1, 3)
      ABUSE_K1_USER_FILES_PER_DAY = @(1, 5)
      ABUSE_K1_GLOBAL_FILES_PER_DAY = @(1, 5)
      ABUSE_K1_USER_DOCUMENTS_PER_DAY = @(1, 3)
      ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY = @(1, 3)
      ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT = @(1, 1)
    }
    $parsedPaidLimits = @{}
    foreach ($entry in $paidLimitRanges.GetEnumerator()) {
      $raw = Get-LocalEnvironmentValue $Environment $entry.Key
      $value = 0
      if ($raw -notmatch '^\d+$' -or -not [int]::TryParse($raw, [ref]$value) `
          -or $value -lt $entry.Value[0] -or $value -gt $entry.Value[1]) {
        throw "The local BDA launcher requires explicit $($entry.Key) from $($entry.Value[0]) through $($entry.Value[1])."
      }
      $parsedPaidLimits[$entry.Key] = $value
    }
    $reservedCents = $parsedPaidLimits.ABUSE_K1_BDA_CALLS_PER_MONTH `
      * $parsedPaidLimits.ABUSE_BDA_MAX_ATTEMPTS * 640
    if ($parsedPaidLimits.ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS -lt $reservedCents) {
      throw "The local BDA monthly budget must cover the declared worst-case reservation of $reservedCents cents."
    }
    if ((Get-LocalEnvironmentValue $Environment 'K1_KMS_KEY_ARN') -notmatch "^arn:aws:kms:us-west-2:${approvedAccountId}:key/") {
      throw 'The local BDA KMS key must be in the approved us-west-2 account.'
    }
    if ((Get-LocalEnvironmentValue $Environment 'K1_BDA_PROJECT_ARN') -notmatch "^arn:aws:bedrock:us-west-2:${approvedAccountId}:data-automation-project/") {
      throw 'The local BDA project must be in the approved us-west-2 account.'
    }
    $profileArn = Get-LocalEnvironmentValue $Environment 'K1_BDA_PROFILE_ARN'
    if ($profileArn -notmatch "^arn:aws:bedrock:us-west-2:${approvedAccountId}:data-automation-profile/") {
      throw 'The local BDA profile must be an approved us-west-2 profile.'
    }
    if ((Get-LocalEnvironmentValue $Environment 'K1_WORK_QUEUE_URL') -or (Get-LocalEnvironmentValue $Environment 'K1_COMPLETION_QUEUE_URL')) {
      throw 'The local BDA launcher uses the PostgreSQL-backed local queue and refuses SQS URLs.'
    }
  }
  if ((Get-LocalEnvironmentValue $Environment 'TF_VAR_environment_name') -eq 'production') {
    throw 'The local launcher refuses production Terraform markers.'
  }
  if ((Get-LocalEnvironmentValue $Environment 'ATLAS_ALLOW_AWS_MUTATION') -eq 'true') {
    throw 'The local launcher refuses broad AWS mutation flags; local BDA uses only its scoped provider switch.'
  }

  return $true
}

function Invoke-LocalNativeCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $Command,
    [Parameter(Mandatory = $true)] [string[]] $Arguments,
    [Parameter(Mandatory = $true)] [string] $FailureMessage
  )

  # Do not invoke AWS through PowerShell's native-command pipeline. Windows
  # PowerShell 5.1 can promote aws.exe stderr to NativeCommandError before the
  # exit code can be translated into the stable preflight guidance below.
  # ProcessStartInfo captures both streams without involving PowerShell's error
  # stream while preserving the argument boundaries passed by the caller.
  $resolvedCommand = Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $resolvedCommand) { throw $FailureMessage }

  $quotedArguments = foreach ($argument in $Arguments) {
    if ($argument -notmatch '[\s"]') {
      $argument
      continue
    }
    $escapedArgument = [regex]::Replace($argument, '(\\*)"', '$1$1\"')
    $escapedArgument = [regex]::Replace($escapedArgument, '(\\+)$', '$1$1')
    '"' + $escapedArgument + '"'
  }

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $resolvedCommand.Source
  $startInfo.Arguments = $quotedArguments -join ' '
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { throw $FailureMessage }
    $standardOutput = $process.StandardOutput.ReadToEndAsync()
    $standardError = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $output = $standardOutput.Result
    $null = $standardError.Result
    $exitCode = $process.ExitCode
  } catch {
    throw $FailureMessage
  } finally {
    $process.Dispose()
  }

  if ($exitCode -ne 0) { throw $FailureMessage }
  return $output.TrimEnd("`r", "`n")
}

function Invoke-LocalBdaAwsJson {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string[]] $Arguments,
    [Parameter(Mandatory = $true)] [string] $FailureMessage
  )

  $output = Invoke-LocalNativeCommand -Command 'aws' -Arguments $Arguments -FailureMessage $FailureMessage
  try { return $output | ConvertFrom-Json } catch { throw $FailureMessage }
}

function Set-LocalBdaAwsSdkCredentialEnvironment {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [object] $Credentials)

  $accessKeyIdProperty = $Credentials.PSObject.Properties['AccessKeyId']
  $secretAccessKeyProperty = $Credentials.PSObject.Properties['SecretAccessKey']
  $sessionTokenProperty = $Credentials.PSObject.Properties['SessionToken']
  $expirationProperty = $Credentials.PSObject.Properties['Expiration']
  $accessKeyId = if ($null -ne $accessKeyIdProperty) { [string]$accessKeyIdProperty.Value } else { '' }
  $secretAccessKey = if ($null -ne $secretAccessKeyProperty) { [string]$secretAccessKeyProperty.Value } else { '' }
  $sessionToken = if ($null -ne $sessionTokenProperty) { [string]$sessionTokenProperty.Value } else { '' }
  $expiration = if ($null -ne $expirationProperty) { [string]$expirationProperty.Value } else { '' }
  if (-not $accessKeyId -or -not $secretAccessKey -or -not $sessionToken) {
    throw 'AWS CLI did not return complete short-lived credentials for the Node AWS SDK.'
  }
  if ($expiration) {
    $expirationTime = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($expiration, [ref]$expirationTime) `
        -or $expirationTime -le [DateTimeOffset]::UtcNow) {
      throw 'AWS CLI returned expired credentials for the Node AWS SDK.'
    }
  }

  [Environment]::SetEnvironmentVariable('AWS_ACCESS_KEY_ID', $accessKeyId, 'Process')
  [Environment]::SetEnvironmentVariable('AWS_SECRET_ACCESS_KEY', $secretAccessKey, 'Process')
  [Environment]::SetEnvironmentVariable('AWS_SESSION_TOKEN', $sessionToken, 'Process')
  [Environment]::SetEnvironmentVariable(
    'AWS_CREDENTIAL_EXPIRATION',
    $(if ($expiration) { $expiration } else { $null }),
    'Process'
  )

  # AWS SDK for JavaScript currently skips environment credentials whenever
  # AWS_PROFILE is present. The CLI understands `aws login`/login_session and
  # exports its short-lived credentials above; child Node processes must use
  # those in-memory values instead of trying to parse the login profile.
  [Environment]::SetEnvironmentVariable('AWS_PROFILE', $null, 'Process')
  [Environment]::SetEnvironmentVariable('AWS_DEFAULT_PROFILE', $null, 'Process')
  return $true
}

function Export-LocalBdaAwsSdkCredentials {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [System.Collections.IDictionary] $Environment)

  $profile = Get-LocalEnvironmentValue $Environment 'AWS_PROFILE'
  [Environment]::SetEnvironmentVariable('ATLAS_LOCAL_BDA_AWS_PROFILE', $(if ($profile) { $profile } else { 'default' }), 'Process')
  $arguments = @('configure', 'export-credentials')
  if ($profile) { $arguments += @('--profile', $profile) }
  $arguments += @('--format', 'process')
  $credentials = Invoke-LocalBdaAwsJson `
    -Arguments $arguments `
    -FailureMessage 'AWS login credentials could not be exported for the Node AWS SDK. Refresh the approved AWS profile and retry.'
  return Set-LocalBdaAwsSdkCredentialEnvironment -Credentials $credentials
}

function Test-LocalBdaS3Contract {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [object] $Location,
    [Parameter(Mandatory = $true)] [object] $Encryption,
    [Parameter(Mandatory = $true)] [string] $ExpectedRegion,
    [Parameter(Mandatory = $true)] [string] $ExpectedKmsKeyArn
  )

  $bucketRegion = [string]$Location.LocationConstraint
  if (-not $bucketRegion) { $bucketRegion = 'us-east-1' }
  if ($bucketRegion -ne $ExpectedRegion) {
    throw "The approved K-1 S3 bucket must be in $ExpectedRegion."
  }

  $matchingRules = @($Encryption.ServerSideEncryptionConfiguration.Rules | Where-Object {
    [string]$_.ApplyServerSideEncryptionByDefault.SSEAlgorithm -eq 'aws:kms' `
      -and [string]$_.ApplyServerSideEncryptionByDefault.KMSMasterKeyID -eq $ExpectedKmsKeyArn
  })
  if ($matchingRules.Count -eq 0) {
    throw 'The approved K-1 S3 bucket must use the configured KMS key for default encryption.'
  }

  return $true
}

function Test-LocalBdaAwsPreflight {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [System.Collections.IDictionary] $Environment)

  if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI v2 is required for local BDA preflight.'
  }
  $accountId = Get-LocalEnvironmentValue $Environment 'ATLAS_LOCAL_BDA_ACCOUNT_ID'
  $region = Get-LocalEnvironmentValue $Environment 'AWS_REGION'
  $bucket = Get-LocalEnvironmentValue $Environment 'K1_S3_BUCKET'
  $kmsKeyArn = Get-LocalEnvironmentValue $Environment 'K1_KMS_KEY_ARN'
  $projectArn = Get-LocalEnvironmentValue $Environment 'K1_BDA_PROJECT_ARN'

  $identity = Invoke-LocalBdaAwsJson `
    -Arguments @('sts', 'get-caller-identity', '--output', 'json') `
    -FailureMessage 'AWS credentials are missing or expired. Run aws login (or refresh the approved AWS profile) and retry.'
  if ([string]$identity.Account -ne $accountId) {
    throw 'The active AWS identity does not match ATLAS_LOCAL_BDA_ACCOUNT_ID; no local process was started.'
  }

  $null = Invoke-LocalNativeCommand `
    -Command 'aws' `
    -Arguments @('s3api', 'head-bucket', '--bucket', $bucket, '--expected-bucket-owner', $accountId) `
    -FailureMessage 'The approved K-1 S3 bucket is missing or inaccessible to the active AWS identity.'
  $location = Invoke-LocalBdaAwsJson `
    -Arguments @('s3api', 'get-bucket-location', '--bucket', $bucket, '--expected-bucket-owner', $accountId, '--output', 'json') `
    -FailureMessage 'The approved K-1 S3 bucket region is missing or inaccessible.'
  $encryption = Invoke-LocalBdaAwsJson `
    -Arguments @('s3api', 'get-bucket-encryption', '--bucket', $bucket, '--expected-bucket-owner', $accountId, '--output', 'json') `
    -FailureMessage 'The approved K-1 S3 bucket encryption configuration is missing or inaccessible.'
  $null = Test-LocalBdaS3Contract `
    -Location $location `
    -Encryption $encryption `
    -ExpectedRegion $region `
    -ExpectedKmsKeyArn $kmsKeyArn

  $kms = Invoke-LocalBdaAwsJson `
    -Arguments @('kms', 'describe-key', '--key-id', $kmsKeyArn, '--region', $region, '--output', 'json') `
    -FailureMessage 'The approved K-1 KMS key is missing or inaccessible to the active AWS identity.'
  if ([string]$kms.KeyMetadata.Arn -ne $kmsKeyArn -or [string]$kms.KeyMetadata.KeyState -ne 'Enabled') {
    throw 'The approved K-1 KMS key ARN/state did not pass preflight.'
  }

  $project = Invoke-LocalBdaAwsJson `
    -Arguments @(
      'bedrock-data-automation', 'get-data-automation-project',
      '--project-arn', $projectArn,
      '--project-stage', 'LIVE',
      '--region', $region,
      '--output', 'json'
    ) `
    -FailureMessage 'The LIVE BDA project is missing, inaccessible, or unsupported by the installed AWS CLI.'
  $projectDetails = if ($project.project) { $project.project } else { $project }
  if ([string]$projectDetails.projectArn -ne $projectArn `
      -or [string]$projectDetails.projectStage -ne 'LIVE' `
      -or [string]$projectDetails.status -ne 'COMPLETED') {
    throw 'The approved BDA project ARN/stage/status did not pass preflight.'
  }

  return $true
}

function Invoke-LocalDevelopmentSequence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [scriptblock] $StartDatabaseAction,
    [Parameter(Mandatory = $true)] [scriptblock] $DatabaseReadyAction,
    [Parameter(Mandatory = $true)] [scriptblock] $MigrationAction,
    [Parameter(Mandatory = $true)] [scriptblock] $StartApiAction,
    [Parameter(Mandatory = $true)] [scriptblock] $ReadinessAction,
    [Parameter(Mandatory = $true)] [scriptblock] $StartWorkerAction,
    [Parameter(Mandatory = $true)] [scriptblock] $StartWebAction
  )

  & $StartDatabaseAction
  if (-not (& $DatabaseReadyAction)) {
    throw 'Local PostgreSQL readiness failed; no application child process was started.'
  }
  & $MigrationAction
  $apiProcess = & $StartApiAction
  if (-not (& $ReadinessAction)) {
    throw 'API /internal/readiness timed out; worker and web startup were suppressed.'
  }
  & $StartWorkerAction
  & $StartWebAction
  return $apiProcess
}

function Set-CanonicalLocalEnvironment {
  [CmdletBinding()]
  param([ValidateSet('stub', 'bda')] [string] $Mode = 'stub')

  $env:NODE_ENV = 'development'
  $env:ATLAS_RUNTIME = 'local'
  if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:15432/atlas' }
  $env:ATLAS_LOCAL_BDA_ENABLED = if ($Mode -eq 'bda') { 'true' } else { 'false' }
  $env:K1_EXTRACTOR = if ($Mode -eq 'bda') { 'aws_bda' } else { 'stub' }
  $env:K1_OBJECT_STORE = if ($Mode -eq 'bda') { 's3' } else { 'local' }
  $env:K1_QUEUE = 'local'
  $env:K1_AWS_INGESTION_ENABLED = if ($Mode -eq 'bda') { 'true' } else { 'false' }
  if ($Mode -eq 'bda') {
    $env:K1_UPLOADS_ENABLED = 'true'
    $env:K1_EXTRACTION_ENABLED = 'true'
    $env:K1_BEDROCK_CHECKBOX_ENABLED = 'false'
    $env:K1_BDA_PROJECT_STAGE = 'LIVE'
    $env:AWS_REGION = 'us-west-2'
  }
  $env:MARKET_DATA_PROVIDER = 'none'
  if (-not $env:PLAID_ENV) { $env:PLAID_ENV = 'sandbox' }
}

function Start-LocalDevelopment {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  Set-Location $repoRoot

  if ($K1Mode -eq 'bda') {
    $resolvedBdaEnvironmentFile = if ([IO.Path]::IsPathRooted($LocalBdaEnvironmentFile)) {
      $LocalBdaEnvironmentFile
    } else {
      Join-Path $repoRoot $LocalBdaEnvironmentFile
    }
    Import-LocalBdaEnvironmentFile -Path $resolvedBdaEnvironmentFile
  }
  Set-CanonicalLocalEnvironment -Mode $K1Mode
  $currentEnvironment = [Environment]::GetEnvironmentVariables('Process')
  $null = Test-LocalDevelopmentBoundary -Environment $currentEnvironment -Mode $K1Mode
  if ($K1Mode -eq 'bda') {
    Write-Host 'Verifying approved AWS account and K-1 S3/KMS/BDA resources (read-only preflight)...'
    $null = Test-LocalBdaAwsPreflight -Environment $currentEnvironment
    $null = Export-LocalBdaAwsSdkCredentials -Environment $currentEnvironment
  }

  $quotedRepoRoot = $repoRoot.Replace("'", "''")
  $script:localApiProcess = $null
  $script:localWorkerProcess = $null

  $providerSummary = if ($K1Mode -eq 'bda') {
    'AWS S3/KMS/BDA with the PostgreSQL-backed local queue'
  } else {
    'stub adapters, local files and queue'
  }
  Write-Host "Starting local development ($providerSummary)..."
  try {
    Invoke-LocalDevelopmentSequence `
      -StartDatabaseAction {
        # Windows PowerShell can resolve `npm` to npm.ps1. Under strict mode,
        # that wrapper reads a missing $MyInvocation.Statement property when
        # invoked from this scriptblock. The command shim avoids that wrapper.
        & npm.cmd run dev:db
        if ($LASTEXITCODE -ne 0) {
          throw 'Failed to start local PostgreSQL. Ensure Docker Desktop is running, then retry.'
        }
      } `
      -DatabaseReadyAction {
        for ($attempt = 1; $attempt -le 60; $attempt += 1) {
          $postgresHealth = docker inspect --format='{{.State.Health.Status}}' atlas-postgres 2>$null
          if ($LASTEXITCODE -eq 0 -and $postgresHealth -eq 'healthy') { return $true }
          Start-Sleep -Seconds 1
        }
        return $false
      } `
      -MigrationAction {
        Write-Host 'Running database migrations synchronously...'
        & npm.cmd run --workspace=api migrate
        if ($LASTEXITCODE -ne 0) { throw 'Local database migrations failed.' }
      } `
      -StartApiAction {
        Write-Host 'Starting API...'
        $logDirectory = Join-Path $repoRoot 'logs'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $script:localApiProcess = Start-Process powershell -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $logDirectory 'local-api.stdout.log') `
          -RedirectStandardError (Join-Path $logDirectory 'local-api.stderr.log') `
          -ArgumentList @(
          '-NoProfile', '-Command', "Set-Location '$quotedRepoRoot'; npm.cmd run dev:api"
        )
        return $script:localApiProcess
      } `
      -ReadinessAction {
        Write-Host 'Waiting for API /internal/readiness...'
        for ($attempt = 1; $attempt -le 60; $attempt += 1) {
          try {
            $response = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/internal/readiness' -TimeoutSec 1
            if ($response.status -eq 'ready' -and $response.persistence.databaseReachable -eq $true) { return $true }
          } catch { }
          Start-Sleep -Seconds 1
        }
        return $false
      } `
      -StartWorkerAction {
        Write-Host 'Starting durable local K-1 worker...'
        $logDirectory = Join-Path $repoRoot 'logs'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $script:localWorkerProcess = Start-Process powershell -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $logDirectory 'local-k1-worker.stdout.log') `
          -RedirectStandardError (Join-Path $logDirectory 'local-k1-worker.stderr.log') `
          -ArgumentList @(
            '-NoProfile', '-Command', "Set-Location '$quotedRepoRoot'; npm.cmd run --workspace=api dev:k1-worker"
          )
        Start-Sleep -Seconds 2
        if ($script:localWorkerProcess.HasExited) {
          throw 'The local K-1 worker exited during startup. Inspect logs/local-k1-worker.stderr.log.'
        }
      } `
      -StartWebAction {
        Write-Host 'Starting web development server...'
        Start-Process powershell -WindowStyle Hidden -ArgumentList @(
          '-NoProfile', '-Command', "Set-Location '$quotedRepoRoot'; npm.cmd run --workspace=web dev"
        ) | Out-Null
      } | Out-Null
  } catch {
    if ($script:localApiProcess -and -not $script:localApiProcess.HasExited) {
      Stop-Process -Id $script:localApiProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($script:localWorkerProcess -and -not $script:localWorkerProcess.HasExited) {
      Stop-Process -Id $script:localWorkerProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw
  }

  Write-Host ''
  Write-Host 'Local development is ready:'
  Write-Host '- PostgreSQL: 127.0.0.1:15432'
  Write-Host '- API:        http://localhost:3000'
  Write-Host '- Web:        http://localhost:5173'
  if ($K1Mode -eq 'bda') {
    Write-Host '- K-1 mode:  local PostgreSQL queue -> approved AWS S3/KMS/BDA'
    Write-Host '- Worker log: logs/local-k1-worker.stderr.log'
  } else {
    Write-Host '- Providers:  deterministic local/stub adapters; no AWS calls'
  }
}

if (-not $LibraryOnly) {
  Start-LocalDevelopment
}
