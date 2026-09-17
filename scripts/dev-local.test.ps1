[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'dev-local.ps1') -LibraryOnly

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }
function Assert-Throws { param([scriptblock] $Action, [string] $Pattern); try { & $Action; throw 'Expected action to fail.' } catch { if ($_.Exception.Message -eq 'Expected action to fail.' -or $_.Exception.Message -notmatch $Pattern) { throw } } }

$safe = [ordered]@{
  NODE_ENV = 'development'
  ATLAS_RUNTIME = 'local'
  DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:15432/atlas'
}
Assert-True (Test-LocalDevelopmentBoundary -Environment $safe) 'Safe local configuration should pass.'

$bda = [ordered]@{} + $safe
foreach ($entry in ([ordered]@{
  ATLAS_LOCAL_BDA_ENABLED = 'true'
  ATLAS_LOCAL_BDA_ACCOUNT_ID = '111122223333'
  AWS_REGION = 'us-west-2'
  K1_EXTRACTOR = 'aws_bda'
  K1_OBJECT_STORE = 's3'
  K1_QUEUE = 'local'
  K1_AWS_INGESTION_ENABLED = 'true'
  K1_UPLOADS_ENABLED = 'true'
  K1_EXTRACTION_ENABLED = 'true'
  K1_BDA_PROJECT_STAGE = 'LIVE'
  MARKET_DATA_PROVIDER = 'none'
  K1_S3_BUCKET = 'atlas-production-k1-documents'
  K1_KMS_KEY_ARN = 'arn:aws:kms:us-west-2:111122223333:key/00000000-0000-0000-0000-000000000001'
  K1_BDA_PROFILE_ARN = 'arn:aws:bedrock:us-west-2:111122223333:data-automation-profile/us.data-automation-v1'
  K1_BDA_PROJECT_ARN = 'arn:aws:bedrock:us-west-2:111122223333:data-automation-project/000000000001'
  ABUSE_K1_GLOBAL_FILES_PER_MONTH = '5'
  ABUSE_K1_BDA_CALLS_PER_MONTH = '10'
  ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS = '25000'
  ABUSE_BDA_MAX_ATTEMPTS = '1'
  ABUSE_K1_USER_FILES_PER_DAY = '3'
  ABUSE_K1_GLOBAL_FILES_PER_DAY = '3'
  ABUSE_K1_USER_DOCUMENTS_PER_DAY = '3'
  ABUSE_K1_GLOBAL_DOCUMENTS_PER_DAY = '3'
  ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT = '1'
}).GetEnumerator()) { $bda[$entry.Key] = $entry.Value }
Assert-True (Test-LocalDevelopmentBoundary -Environment $bda -Mode bda) 'Explicit local BDA configuration should pass.'

# Native stderr must not escape as a PowerShell NativeCommandError before the
# launcher can replace it with its stable, sanitized preflight guidance. This
# command also verifies that a whitespace-containing argument stays intact.
Assert-Throws {
  Invoke-LocalNativeCommand `
    -Command $env:ComSpec `
    -Arguments @('/d', '/c', 'echo simulated AWS failure 1>&2 & exit /b 7') `
    -FailureMessage 'Sanitized AWS preflight failure.'
} '^Sanitized AWS preflight failure\.$'

# `aws login` profiles are understood by the AWS CLI but not by the Node SDK's
# shared-config provider. The launcher bridges the CLI's short-lived session
# into child processes without persisting credentials or leaving AWS_PROFILE
# set (which would cause the SDK to skip environment credentials).
$credentialEnvironmentNames = @(
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_CREDENTIAL_EXPIRATION',
  'AWS_PROFILE',
  'AWS_DEFAULT_PROFILE'
)
$savedCredentialEnvironment = @{}
foreach ($name in $credentialEnvironmentNames) {
  $savedCredentialEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
  $env:AWS_PROFILE = 'login-profile-that-node-cannot-load-directly'
  $env:AWS_DEFAULT_PROFILE = 'login-profile-that-node-cannot-load-directly'
  $expiration = [DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
  Assert-True (Set-LocalBdaAwsSdkCredentialEnvironment -Credentials ([pscustomobject]@{
    AccessKeyId = 'ASIAEXAMPLELOCALBDA'
    SecretAccessKey = 'fake-secret-access-key-for-tests'
    SessionToken = 'fake-session-token-for-tests'
    Expiration = $expiration
  })) 'Complete short-lived CLI credentials should be exported for Node.'
  Assert-True ($env:AWS_ACCESS_KEY_ID -eq 'ASIAEXAMPLELOCALBDA') 'The access key was not exported.'
  Assert-True ($env:AWS_SESSION_TOKEN -eq 'fake-session-token-for-tests') 'The session token was not exported.'
  Assert-True (-not $env:AWS_PROFILE -and -not $env:AWS_DEFAULT_PROFILE) 'Node must not retain a login_session profile.'
  Assert-Throws {
    Set-LocalBdaAwsSdkCredentialEnvironment -Credentials ([pscustomobject]@{
      AccessKeyId = 'ASIAEXAMPLELOCALBDA'
      SecretAccessKey = 'fake-secret-access-key-for-tests'
    })
  } 'complete short-lived credentials'
} finally {
  foreach ($name in $credentialEnvironmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedCredentialEnvironment[$name], 'Process')
  }
}

$s3Location = [pscustomobject]@{ LocationConstraint = 'us-west-2' }
$s3Encryption = [pscustomobject]@{
  ServerSideEncryptionConfiguration = [pscustomobject]@{
    Rules = @([pscustomobject]@{
      ApplyServerSideEncryptionByDefault = [pscustomobject]@{
        SSEAlgorithm = 'aws:kms'
        KMSMasterKeyID = $bda.K1_KMS_KEY_ARN
      }
    })
  }
}
Assert-True (Test-LocalBdaS3Contract `
  -Location $s3Location `
  -Encryption $s3Encryption `
  -ExpectedRegion 'us-west-2' `
  -ExpectedKmsKeyArn $bda.K1_KMS_KEY_ARN) 'The local BDA S3 contract should pass.'
Assert-Throws {
  Test-LocalBdaS3Contract `
    -Location ([pscustomobject]@{ LocationConstraint = 'us-west-1' }) `
    -Encryption $s3Encryption `
    -ExpectedRegion 'us-west-2' `
    -ExpectedKmsKeyArn $bda.K1_KMS_KEY_ARN
} 'must be in us-west-2'

foreach ($fixture in @(
  [ordered]@{ ATLAS_LOCAL_BDA_ACCOUNT_ID = '999900001111' },
  [ordered]@{ K1_QUEUE = 'sqs' },
  [ordered]@{ K1_WORK_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/111122223333/k1' },
  [ordered]@{ K1_BDA_PROJECT_STAGE = 'DEVELOPMENT' },
  [ordered]@{ ABUSE_K1_BDA_CALLS_PER_MONTH = '11' },
  [ordered]@{ ABUSE_PAID_WORKLOAD_MONTHLY_BUDGET_CENTS = '1000' },
  [ordered]@{ MARKET_DATA_PROVIDER = 'alpaca' },
  [ordered]@{ ATLAS_ALLOW_AWS_MUTATION = 'true' }
)) {
  $candidate = [ordered]@{} + $bda
  foreach ($entry in $fixture.GetEnumerator()) { $candidate[$entry.Key] = $entry.Value }
  Assert-Throws { Test-LocalDevelopmentBoundary -Environment $candidate -Mode bda } 'local|BDA|AWS|mutation|provider'
}

foreach ($fixture in @(
  [ordered]@{ NODE_ENV = 'production' },
  [ordered]@{ ATLAS_RUNTIME = 'production' },
  [ordered]@{ DATABASE_URL = 'postgres://user:password@atlas.production.rds.amazonaws.com/atlas' },
  [ordered]@{ AWS_PROFILE = 'atlas-production' },
  [ordered]@{ AWS_ACCOUNT_ID = '111122223333'; ATLAS_PRODUCTION_ACCOUNT_ID = '111122223333' },
  [ordered]@{ K1_S3_BUCKET = 'atlas-production-documents' },
  [ordered]@{ TF_VAR_environment_name = 'production' },
  [ordered]@{ ATLAS_ALLOW_AWS_MUTATION = 'true' }
)) {
  $candidate = [ordered]@{} + $safe
  foreach ($entry in $fixture.GetEnumerator()) { $candidate[$entry.Key] = $entry.Value }
  Assert-Throws { Test-LocalDevelopmentBoundary -Environment $candidate } 'local|production|AWS|mutation'
}

$events = New-Object System.Collections.Generic.List[string]
Invoke-LocalDevelopmentSequence `
  -StartDatabaseAction { $events.Add('database') } `
  -DatabaseReadyAction { $events.Add('database-ready'); return $true } `
  -MigrationAction { $events.Add('migrations') } `
  -StartApiAction { $events.Add('api'); return [pscustomobject]@{ Id = 1 } } `
  -ReadinessAction { $events.Add('readiness'); return $true } `
  -StartWorkerAction { $events.Add('worker') } `
  -StartWebAction { $events.Add('web') } | Out-Null
Assert-True (($events -join ',') -eq 'database,database-ready,migrations,api,readiness,worker,web') 'Local services started out of order.'

# Exercise the native command path used by the real launcher. Calling npm.ps1
# from a strict-mode scriptblock fails on Windows PowerShell 5.1 because its
# $MyInvocation object does not expose Statement.
$npmVersion = Invoke-LocalDevelopmentSequence `
  -StartDatabaseAction { & npm.cmd --version } `
  -DatabaseReadyAction { return $true } `
  -MigrationAction { } `
  -StartApiAction { return [pscustomobject]@{ Id = 1 } } `
  -ReadinessAction { return $true } `
  -StartWorkerAction { } `
  -StartWebAction { }
Assert-True ([bool]($npmVersion | Where-Object { $_ -match '^\d+\.\d+' })) 'The local launcher must invoke npm through npm.cmd.'

$events.Clear()
Assert-Throws {
  Invoke-LocalDevelopmentSequence `
    -StartDatabaseAction { $events.Add('database') } `
    -DatabaseReadyAction { $events.Add('database-ready'); return $true } `
    -MigrationAction { throw 'broken migration' } `
    -StartApiAction { $events.Add('api') } `
    -ReadinessAction { return $true } `
    -StartWorkerAction { $events.Add('worker') } `
    -StartWebAction { $events.Add('web') }
} 'broken migration'
Assert-True (($events -join ',') -eq 'database,database-ready') 'A migration failure started a child process.'

$events.Clear()
Assert-Throws {
  Invoke-LocalDevelopmentSequence `
    -StartDatabaseAction { $events.Add('database') } `
    -DatabaseReadyAction { return $true } `
    -MigrationAction { $events.Add('migrations') } `
    -StartApiAction { $events.Add('api'); return [pscustomobject]@{ Id = 1 } } `
    -ReadinessAction { return $false } `
    -StartWorkerAction { $events.Add('worker') } `
    -StartWebAction { $events.Add('web') }
} 'readiness'
Assert-True (-not $events.Contains('worker') -and -not $events.Contains('web')) 'A readiness failure started the worker or web.'

Write-Output 'PASS local launcher boundary, ordering, fatal failures, and child suppression.'
