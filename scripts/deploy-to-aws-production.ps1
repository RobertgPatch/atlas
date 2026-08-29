[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Bootstrap', 'Prepare', 'Apply', 'Rollback')]
  [string] $Mode = 'Plan',
  [string] $RepoPath,
  [string] $AwsProfile,
  [string] $AwsRegion,
  [string] $ExpectedAccountId,
  [string] $TerraformStateBucket,
  [string] $TerraformStateKey,
  [string] $TerraformStateKmsKeyArn,
  [string] $ReleaseDirectory,
  [string] $ReleaseManifestPath,
  [bool] $RunFullTests = $true,
  [string] $PriceEvidencePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PowerShellExecutable = (Get-Process -Id $PID).Path

if ([string]::IsNullOrWhiteSpace($RepoPath)) { $RepoPath = Split-Path -Parent $PSScriptRoot }
$RepoPath = [System.IO.Path]::GetFullPath($RepoPath)
$releaseModulePath = Join-Path $RepoPath 'scripts\deployment\production-release.psm1'
if (-not (Test-Path -LiteralPath $releaseModulePath -PathType Leaf)) { throw 'Production release module is missing.' }
Import-Module $releaseModulePath -Force

function Stop-ProductionDeployment {
  param([string] $FailureClass, [string] $Message)
  $exception = [System.InvalidOperationException]::new($Message)
  $exception.Data['ExitCode'] = Get-ProductionExitCode -FailureClass $FailureClass
  throw $exception
}

function Invoke-ExternalCapture {
  param([string] $Command, [string[]] $Arguments, [string] $FailureClass, [string] $FailureMessage)
  $savedPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $Command @Arguments 2>$null)
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $savedPreference }
  if ($exitCode -ne 0) { Stop-ProductionDeployment $FailureClass $FailureMessage }
  return $output
}

function Invoke-ExternalQuiet {
  param([string] $Command, [string[]] $Arguments, [string] $FailureClass, [string] $FailureMessage)
  $null = Invoke-ExternalCapture $Command $Arguments $FailureClass $FailureMessage
}

function Write-JsonFile {
  param([string] $LiteralPath, [object] $Value, [switch] $Append)
  $json = $Value | ConvertTo-Json -Depth 50
  if ($Append) {
    [System.IO.File]::AppendAllText($LiteralPath, "$json`n", [System.Text.UTF8Encoding]::new($false))
  }
  else {
    [System.IO.File]::WriteAllText($LiteralPath, "$json`n", [System.Text.UTF8Encoding]::new($false))
  }
}

function Get-StringSha256 {
  param([string] $Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally { $sha.Dispose() }
}

function Assert-ProductionTools {
  $required = @('git', 'node', 'npm.cmd', 'terraform', 'aws')
  if ($Mode -eq 'Prepare') { $required += 'docker' }
  foreach ($command in $required) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      Stop-ProductionDeployment Preflight "Required production tool '$command' is unavailable."
    }
  }
  $nodeVersion = (Invoke-ExternalCapture node @('--version') Preflight 'Unable to inspect Node.js.')[0]
  if (-not (Test-ProductionToolVersion -Tool node -ActualVersion $nodeVersion -MinimumVersion '22.0.0')) {
    Stop-ProductionDeployment Preflight 'Node.js 22 or newer is required.'
  }
  $terraformJson = (Invoke-ExternalCapture terraform @('version', '-json') Preflight 'Unable to inspect Terraform.') -join "`n"
  try { $terraformVersion = ($terraformJson | ConvertFrom-Json).terraform_version }
  catch { Stop-ProductionDeployment Preflight 'Terraform returned invalid version metadata.' }
  if (-not (Test-ProductionToolVersion -Tool terraform -ActualVersion $terraformVersion -MinimumVersion '1.11.0' -MaximumExclusiveVersion '2.0.0')) {
    Stop-ProductionDeployment Preflight 'Terraform must be at least 1.11 and lower than 2.0.'
  }
  return $terraformVersion
}

function Assert-NoTrackedSensitiveArtifacts {
  $tracked = @(Invoke-ExternalCapture git @('-C', $RepoPath, 'ls-files') Preflight 'Unable to inspect tracked files.')
  $unsafe = @($tracked | Where-Object {
    $normalized = $_.Replace('\', '/').ToLowerInvariant()
    $normalized.EndsWith('.tfvars') -or
    $normalized -match '(^|/)\.artifacts/' -or
    $normalized -match '\.tfstate(\.|$)' -or
    $normalized -match '\.tfplan(\.|$)' -or
    $normalized.EndsWith('.terraform-plan.json')
  })
  if ($unsafe.Count -gt 0) { Stop-ProductionDeployment Preflight 'Git tracks a prohibited production variable, state, plan, or release artifact.' }
}

function Get-SourceIdentity {
  $commit = ((Invoke-ExternalCapture git @('-C', $RepoPath, 'rev-parse', 'HEAD') Preflight 'Unable to resolve the source commit.') -join '').Trim()
  if ($commit -notmatch '^[a-f0-9]{40}$') { Stop-ProductionDeployment Preflight 'The source commit is not a full immutable Git SHA.' }
  $branch = ((Invoke-ExternalCapture git @('-C', $RepoPath, 'rev-parse', '--abbrev-ref', 'HEAD') Preflight 'Unable to resolve the source branch.') -join '').Trim()
  $status = @(Invoke-ExternalCapture git @('-C', $RepoPath, 'status', '--porcelain') Preflight 'Unable to inspect the worktree.')
  return [pscustomobject]@{ commit = $commit; branch = $branch; clean = (Test-CleanWorktreeStatus $status) }
}

function Get-ProductionReleaseRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $RepoPath '.artifacts\production-releases'))
}

function Resolve-NewReleaseDirectory {
  param([string] $Candidate)
  if ([string]::IsNullOrWhiteSpace($Candidate)) { Stop-ProductionDeployment Preflight 'Bootstrap and Prepare require -ReleaseDirectory.' }
  $root = Get-ProductionReleaseRoot
  $candidatePath = if ([System.IO.Path]::IsPathRooted($Candidate)) { $Candidate } else { Join-Path $RepoPath $Candidate }
  $resolved = Resolve-ReleasePath -RootPath $root -CandidatePath ([System.IO.Path]::GetFullPath($candidatePath)) -AllowMissing
  if ($resolved -eq $root -or (Test-Path -LiteralPath $resolved)) { Stop-ProductionDeployment Artifact 'ReleaseDirectory must be a new child directory.' }
  $ignored = @(Invoke-ExternalCapture git @('-C', $RepoPath, 'check-ignore', '--no-index', $resolved) Preflight 'ReleaseDirectory must be covered by the repository ignore policy.')
  if ($ignored.Count -eq 0) { Stop-ProductionDeployment Preflight 'ReleaseDirectory is not ignored by Git.' }
  [System.IO.Directory]::CreateDirectory($resolved) | Out-Null
  return $resolved
}

function Resolve-ExistingManifest {
  param([string] $Candidate)
  if ([string]::IsNullOrWhiteSpace($Candidate)) { Stop-ProductionDeployment Artifact 'Apply and Rollback require -ReleaseManifestPath.' }
  $root = Get-ProductionReleaseRoot
  $candidatePath = if ([System.IO.Path]::IsPathRooted($Candidate)) { $Candidate } else { Join-Path $RepoPath $Candidate }
  $full = [System.IO.Path]::GetFullPath($candidatePath)
  return Resolve-ReleasePath -RootPath $root -CandidatePath $full
}

function Get-AwsIdentity {
  if ([string]::IsNullOrWhiteSpace($AwsProfile) -or $ExpectedAccountId -notmatch '^[0-9]{12}$') {
    Stop-ProductionDeployment Identity 'An AWS profile and exact 12-digit expected production account are required.'
  }
  $json = (Invoke-ExternalCapture aws @('sts', 'get-caller-identity', '--profile', $AwsProfile, '--output', 'json') Identity 'AWS production identity could not be verified.') -join "`n"
  try { $identity = $json | ConvertFrom-Json }
  catch { Stop-ProductionDeployment Identity 'AWS production identity metadata was invalid.' }
  if ($identity.Account -cne $ExpectedAccountId) { Stop-ProductionDeployment Identity 'Authenticated AWS account does not match the expected production account.' }
  return $identity
}

function Assert-BackendInputs {
  param([object] $Target)
  if (-not [string]::IsNullOrWhiteSpace($AwsRegion) -and $AwsRegion -cne $Target.awsRegion) {
    Stop-ProductionDeployment Identity 'The optional AWS region assertion does not match the committed production target.'
  }
  if ([string]::IsNullOrWhiteSpace($TerraformStateBucket)) { Stop-ProductionDeployment Identity 'The existing production state bucket is required.' }
  if ([string]::IsNullOrWhiteSpace($TerraformStateKey) -or $TerraformStateKey.StartsWith('/') -or $TerraformStateKey -match '(^|[\\/])\.\.([\\/]|$)') {
    Stop-ProductionDeployment Identity 'The production state key must be a nonempty relative object key.'
  }
  $kmsPattern = '^arn:aws:kms:' + [regex]::Escape($Target.awsRegion) + ':' + [regex]::Escape($ExpectedAccountId) + ':key/.+$'
  if ($TerraformStateKmsKeyArn -notmatch $kmsPattern) { Stop-ProductionDeployment Identity 'The production state KMS key is outside the expected account or region.' }
}

function Initialize-ProductionTerraform {
  param([string] $TerraformRoot, [object] $Target)
  $arguments = @(
    'init', '-input=false', '-reconfigure',
    "-backend-config=bucket=$TerraformStateBucket",
    "-backend-config=key=$TerraformStateKey",
    "-backend-config=region=$($Target.awsRegion)",
    "-backend-config=kms_key_id=$TerraformStateKmsKeyArn",
    '-backend-config=encrypt=true',
    '-backend-config=use_lockfile=true'
  )
  Push-Location $TerraformRoot
  try {
    Invoke-ExternalQuiet terraform $arguments Identity 'Terraform could not initialize the exact production backend.'
    $workspace = ((Invoke-ExternalCapture terraform @('workspace', 'show') Identity 'Terraform workspace could not be verified.') -join '').Trim()
    if ($workspace -cne $Target.terraformWorkspace) { Stop-ProductionDeployment Identity 'Terraform is not using the default production workspace.' }
  }
  finally { Pop-Location }
}

function Invoke-TerraformGates {
  param([string] $TerraformRoot)
  Push-Location $TerraformRoot
  try {
    Invoke-ExternalQuiet terraform @('fmt', '-check', '-recursive') Validation 'Terraform formatting validation failed.'
    Invoke-ExternalQuiet terraform @('validate', '-no-tests') Validation 'Terraform validation failed.'
    Invoke-ExternalQuiet terraform @('test') Validation 'Terraform native tests failed.'
  }
  finally { Pop-Location }
}

function Invoke-CostValidation {
  param([string] $OutputPath)
  $profilePath = Join-Path $RepoPath 'infra\aws\terraform\production-cost-profile.json'
  $ratesPath = if ([string]::IsNullOrWhiteSpace($PriceEvidencePath)) {
    Join-Path $RepoPath 'scripts\security\fixtures\production-cost-rates.json'
  }
  elseif ([System.IO.Path]::IsPathRooted($PriceEvidencePath)) {
    [System.IO.Path]::GetFullPath($PriceEvidencePath)
  }
  else {
    [System.IO.Path]::GetFullPath((Join-Path $RepoPath $PriceEvidencePath))
  }
  if (Test-Path -LiteralPath $OutputPath) { Stop-ProductionDeployment Artifact 'Cost evidence output already exists.' }
  Invoke-ExternalQuiet node @(
    (Join-Path $RepoPath 'scripts\security\validate-production-cost.mjs'),
    '--profile', $profilePath, '--rates', $ratesPath, '--output', $OutputPath
  ) Validation 'Production cost validation failed.'
  try { return Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json }
  catch { Stop-ProductionDeployment Validation 'Production cost evidence is invalid.' }
}

function Test-FeatureEnabled {
  param([string] $Condition)
  switch ($Condition) {
    'always' { return $true }
    'plaidEnabled' { return $true }
    'plaidSchedulerEnabled' { return $true }
    'marketDataAlpacaEnabled' { return $true }
    'k1AwsIngestionEnabled' { return $false }
    default { Stop-ProductionDeployment Validation "Unknown production secret feature condition '$Condition'." }
  }
}

function Get-LiveSecretAttestation {
  param([object] $Contract, [object] $PreparedAttestation)
  $inventory = New-Object 'System.Collections.Generic.List[object]'
  $requiredRows = @($Contract.secrets | Where-Object { Test-FeatureEnabled ([string]$_.requiredWhen) })
  foreach ($secret in $requiredRows) {
    $name = "$($Contract.namePrefix)/$($secret.nameSuffix)"
    try {
      $descriptionJson = (Invoke-ExternalCapture aws @('secretsmanager', 'describe-secret', '--profile', $AwsProfile, '--region', 'us-west-2', '--secret-id', $name, '--query', '{ARN:ARN,Name:Name,DeletedDate:DeletedDate}', '--output', 'json') Validation "Secret '$($secret.key)' could not be described.") -join "`n"
      $versionsJson = (Invoke-ExternalCapture aws @('secretsmanager', 'list-secret-version-ids', '--profile', $AwsProfile, '--region', 'us-west-2', '--secret-id', $name, '--include-deprecated', '--query', 'Versions[].{VersionId:VersionId,VersionStages:VersionStages}', '--output', 'json') Validation "Secret '$($secret.key)' versions could not be inspected.") -join "`n"
      $description = $descriptionJson | ConvertFrom-Json
      $versions = @($versionsJson | ConvertFrom-Json)
      $currentVersions = @($versions | Where-Object { @($_.VersionStages) -contains 'AWSCURRENT' })
      $normalizedVersions = New-Object 'System.Collections.Generic.List[object]'
      foreach ($version in $versions) {
        $secretString = $null
        $secretBinary = $null
        if (@($version.VersionStages) -contains 'AWSCURRENT' -and $currentVersions.Count -eq 1 -and -not [string]::IsNullOrWhiteSpace($version.VersionId)) {
          $valueJson = (Invoke-ExternalCapture aws @('secretsmanager', 'get-secret-value', '--profile', $AwsProfile, '--region', 'us-west-2', '--secret-id', $name, '--version-id', $version.VersionId, '--query', '{VersionId:VersionId,SecretString:SecretString,SecretBinary:SecretBinary}', '--output', 'json') Validation "Secret '$($secret.key)' current value could not be verified.") -join "`n"
          $value = $valueJson | ConvertFrom-Json
          $secretString = $value.SecretString
          $secretBinary = $value.SecretBinary
          $value = $null
          $valueJson = $null
        }
        $normalizedVersions.Add([pscustomobject]@{ versionId = $version.VersionId; stages = @($version.VersionStages); secretString = $secretString; secretBinary = $secretBinary })
      }
      $inventory.Add([pscustomobject]@{ key = $secret.key; name = $description.Name; arn = $description.ARN; deletedDate = $description.DeletedDate; versions = $normalizedVersions.ToArray() })
    }
    catch {
      $inventory.Add([pscustomobject]@{ key = $secret.key; providerError = 'provider verification failed' })
    }
  }

  $consumerMap = [ordered]@{ api = @(); 'plaid-scheduler' = @(); 'market-scheduler' = @(); 'k1-worker' = @() }
  foreach ($row in $requiredRows) {
    foreach ($consumer in @($row.consumers)) { $consumerMap[$consumer] += $row.key }
  }
  $wiring = [pscustomobject]@{
    secretKeys = @($requiredRows.key)
    plaintextKeys = @($Contract.runtimeNonSecretVariables)
    consumers = [pscustomobject]$consumerMap
    iamSecretArns = @($inventory | ForEach-Object {
      $arnProperty = $_.PSObject.Properties['arn']
      if ($null -ne $arnProperty) { $arnProperty.Value }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    iamWildcard = $false
    retiredKeys = @()
  }
  $features = [pscustomobject]@{ plaidEnabled = $true; plaidSchedulerEnabled = $true; marketDataAlpacaEnabled = $true; k1AwsIngestionEnabled = $false }
  $result = Test-ProductionSecretPreflight -Contract $Contract -Inventory $inventory.ToArray() -Wiring $wiring -Features $features -ExpectedAccountId $ExpectedAccountId -ExpectedRegion 'us-west-2' -PreparedAttestation $PreparedAttestation
  $inventory = $null
  if (-not $result.Valid) { Stop-ProductionDeployment Validation (Protect-DeploymentText ($result.Errors -join '; ')) }
  $result.Attestation | Add-Member -NotePropertyName contractSha256 -NotePropertyValue (Get-Sha256 -LiteralPath (Join-Path $RepoPath 'infra\aws\terraform\production-secrets.contract.json'))
  return $result.Attestation
}

function New-ValidatedPlan {
  param(
    [string] $TerraformRoot,
    [string] $TfvarsPath,
    [string] $PolicyMode,
    [string] $PlanPath,
    [string] $PolicyResultPath,
    [string] $CostPath,
    [string] $SourceCommit,
    [string] $VariableHash,
    [string] $BackendFingerprint,
    [switch] $BootstrapEligible
  )
  $arguments = @('plan', '-input=false', "-var-file=$TfvarsPath", "-var=api_image_tag=$SourceCommit", "-out=$PlanPath")
  if ($PolicyMode -eq 'Bootstrap') {
    $arguments += @('-var=api_desired_count=0', '-var=k1_worker_desired_count=0', '-var=scheduler_enabled=false', '-var=market_price_scheduler_enabled=false', '-var=k1_aws_ingestion_enabled=false')
  }
  Push-Location $TerraformRoot
  try {
    Invoke-ExternalQuiet terraform $arguments Validation 'Terraform production planning failed.'
    $rawJson = (Invoke-ExternalCapture terraform @('show', '-json', $PlanPath) Validation 'Terraform plan JSON generation failed.') -join "`n"
  }
  finally { Pop-Location }

  $rawPlanPath = Join-Path ([System.IO.Path]::GetTempPath()) ("atlas-production-plan-{0}.json" -f [guid]::NewGuid().ToString('N'))
  try {
    [System.IO.File]::WriteAllText($rawPlanPath, $rawJson, [System.Text.UTF8Encoding]::new($false))
    $rawJson = $null
    $planHash = Get-Sha256 -LiteralPath $PlanPath
    $arguments = @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $RepoPath 'scripts\security\validate-production-plan.ps1'),
      '-PlanJsonPath', $rawPlanPath, '-PolicyMode', $PolicyMode, '-PlanSha256', $planHash,
      '-TargetDescriptorPath', (Join-Path $RepoPath 'infra\aws\production-target.json'),
      '-TargetDescriptorSha256', (Get-Sha256 -LiteralPath (Join-Path $RepoPath 'infra\aws\production-target.json')),
      '-VariableFileSha256', $VariableHash, '-ExpectedVariableFileSha256', $VariableHash,
      '-BackendFingerprint', $BackendFingerprint, '-ExpectedBackendFingerprint', $BackendFingerprint,
      '-SourceCommit', $SourceCommit, '-ExpectedSourceCommit', $SourceCommit,
      '-CostEstimatePath', $CostPath,
      '-SecretContractPath', (Join-Path $RepoPath 'infra\aws\terraform\production-secrets.contract.json'),
      '-PolicyResultPath', $PolicyResultPath
    )
    if ($BootstrapEligible) { $arguments += '-BootstrapEligible' }
    Invoke-ExternalQuiet $PowerShellExecutable $arguments Validation 'The shared production plan policy rejected the plan.'
    return [pscustomobject]@{ planSha256 = $planHash; policyResult = (Get-Content -LiteralPath $PolicyResultPath -Raw | ConvertFrom-Json) }
  }
  finally {
    if (Test-Path -LiteralPath $rawPlanPath -PathType Leaf) { Remove-Item -LiteralPath $rawPlanPath -Force }
  }
}

function Get-TerraformOutput {
  param([string] $TerraformRoot, [string] $Name)
  Push-Location $TerraformRoot
  try {
    $json = (Invoke-ExternalCapture terraform @('output', '-json', $Name) Artifact "Terraform output '$Name' is unavailable; Bootstrap may be required first.") -join "`n"
    return $json | ConvertFrom-Json
  }
  catch { Stop-ProductionDeployment Artifact "Terraform output '$Name' is unavailable or invalid." }
  finally { Pop-Location }
}

function New-WebArtifact {
  param([string] $ReleasePath)
  $dist = Join-Path $RepoPath 'apps\web\dist'
  if (-not (Test-Path -LiteralPath $dist -PathType Container)) { Stop-ProductionDeployment Artifact 'The built web output is missing.' }
  $entries = @()
  $totalBytes = [long]0
  foreach ($file in @(Get-ChildItem -LiteralPath $dist -File -Recurse | Sort-Object FullName)) {
    $relative = [System.IO.Path]::GetRelativePath($dist, $file.FullName).Replace('\', '/')
    $totalBytes += $file.Length
    $entries += [ordered]@{ path = $relative; sha256 = Get-Sha256 -LiteralPath $file.FullName; bytes = $file.Length }
  }
  if ($entries.Count -eq 0 -or $totalBytes -le 0) { Stop-ProductionDeployment Artifact 'The built web output is empty.' }
  $manifestPath = Join-Path $ReleasePath 'web-files.json'
  Write-JsonFile $manifestPath ([ordered]@{ schemaVersion = '1.0.0'; files = $entries; fileCount = $entries.Count; totalBytes = $totalBytes })
  $archivePath = Join-Path $ReleasePath 'web.zip'
  Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $archivePath -CompressionLevel Optimal
  return [pscustomobject]@{ archivePath = $archivePath; fileManifestPath = $manifestPath; fileCount = $entries.Count; totalBytes = $totalBytes; sha256 = Get-Sha256 -LiteralPath $archivePath }
}

function Get-MigrationSet {
  $migrationRoot = Join-Path $RepoPath 'apps\api\src\infra\db\migrations'
  $files = @(Get-ChildItem -LiteralPath $migrationRoot -File | Sort-Object Name)
  $parts = @()
  $relativeFiles = @()
  foreach ($file in $files) {
    $relative = [System.IO.Path]::GetRelativePath($RepoPath, $file.FullName).Replace('\', '/')
    $relativeFiles += $relative
    $parts += "$relative`n$(Get-Sha256 -LiteralPath $file.FullName)"
  }
  return [ordered]@{
    files = $relativeFiles
    sha256 = Get-StringSha256 ($parts -join "`n")
    backwardCompatible = $true
    requiresSnapshot = $false
    snapshotIdentifier = $null
    approvalReference = if ($files.Count -eq 0) { $null } else { 'Prepare migration inventory review' }
  }
}

function Get-ManifestCostEvidence {
  param([object] $Cost)
  return [ordered]@{
    region = $Cost.region; pricingRetrievedAt = $Cost.pricingRetrievedAt; hoursPerMonth = $Cost.hoursPerMonth
    fixedMonthlyUsd = $Cost.fixedMonthlyUsd; usageUpperBoundMonthlyUsd = $Cost.usageUpperBoundMonthlyUsd
    estimatedMonthlyUsd = $Cost.estimatedMonthlyUsd; targetMonthlyUsd = $Cost.targetMonthlyUsd
    budgetThresholdUsd = $Cost.budgetThresholdUsd; budgetActionCount = $Cost.budgetActionCount
    workloadProfileMatched = $Cost.workloadProfileMatched; unpricedRecurringResources = @($Cost.unpricedRecurringResources)
  }
}

function Invoke-LiveProductionSmoke {
  param([string] $BaseUri)
  $email = Read-Host 'Production smoke user email'
  $passwordSecure = Read-Host 'Production smoke user password' -AsSecureString
  $totpSecure = Read-Host 'Current MFA code (press Enter only when production MFA is disabled)' -AsSecureString
  $password = [System.Net.NetworkCredential]::new('', $passwordSecure).Password
  $totp = [System.Net.NetworkCredential]::new('', $totpSecure).Password
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

  $invokeHttp = {
    param($Method, $Uri, $Body)
    try {
      $arguments = @{ Uri = $Uri; Method = $Method; WebSession = $session; UseBasicParsing = $true }
      if ($null -ne $Body) {
        $arguments.ContentType = 'application/json'
        $arguments.Body = ($Body | ConvertTo-Json -Compress -Depth 10)
      }
      $response = Invoke-WebRequest @arguments
      $statusCode = [int]$response.StatusCode
      $contentType = [string]$response.Headers['Content-Type']
      $content = [string]$response.Content
    }
    catch {
      $webResponse = $_.Exception.Response
      if ($null -eq $webResponse) { return [pscustomobject]@{ statusCode = 0; contentType = ''; body = $null } }
      $statusCode = [int]$webResponse.StatusCode
      $contentType = [string]$webResponse.ContentType
      $reader = [System.IO.StreamReader]::new($webResponse.GetResponseStream())
      try { $content = $reader.ReadToEnd() }
      finally { $reader.Dispose() }
    }
    $bodyValue = $content
    if ($contentType -match 'json' -and -not [string]::IsNullOrWhiteSpace($content)) {
      try { $bodyValue = $content | ConvertFrom-Json } catch { $bodyValue = $null }
    }
    $content = $null
    return [pscustomobject]@{ statusCode = $statusCode; contentType = $contentType; body = $bodyValue }
  }.GetNewClosure()

  $requestInvoker = {
    param($Request)
    $body = $Request.body
    if ($Request.name -eq 'auth-login') {
      $login = & $invokeHttp 'POST' $Request.uri ([pscustomobject]@{ email = $body.email; password = $body.password })
      if ($login.statusCode -eq 200 -and $null -ne $login.body -and $login.body.PSObject.Properties['status'] -and $login.body.status -eq 'MFA_REQUIRED') {
        if ([string]::IsNullOrWhiteSpace($body.totp) -or -not $login.body.PSObject.Properties['challengeId']) { return [pscustomobject]@{ statusCode = 401; contentType = 'application/json'; body = $null } }
        return & $invokeHttp 'POST' "$($BaseUri.TrimEnd('/'))/v1/auth/mfa/verify" ([pscustomobject]@{ challengeId = $login.body.challengeId; code = $body.totp })
      }
      if ($login.statusCode -eq 200 -and $null -ne $login.body -and $login.body.PSObject.Properties['status'] -and $login.body.status -eq 'MFA_ENROLL_REQUIRED') {
        return [pscustomobject]@{ statusCode = 401; contentType = 'application/json'; body = $null }
      }
      return $login
    }
    return & $invokeHttp $Request.method $Request.uri $body
  }.GetNewClosure()

  try { return Invoke-ProductionSmokeContract -BaseUri $BaseUri -Username $email -Password $password -Totp $totp -RequestInvoker $requestInvoker }
  finally {
    $password = $null; $totp = $null; $passwordSecure = $null; $totpSecure = $null; $session = $null
  }
}

function Invoke-WebArtifactActivation {
  param([string] $ArchivePath, [object] $EdgeOutput, [string] $WorkingDirectory)
  $webStage = Join-Path $WorkingDirectory 'web'
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $webStage
  Invoke-ExternalQuiet aws @('s3', 'sync', $webStage, "s3://$($EdgeOutput.web_bucket_name)", '--delete', '--profile', $AwsProfile, '--region', 'us-west-2') Activation 'The exact prepared web artifact could not be uploaded.'
  $invalidationId = ((Invoke-ExternalCapture aws @('cloudfront', 'create-invalidation', '--profile', $AwsProfile, '--distribution-id', $EdgeOutput.cloudfront_distribution_id, '--paths', '/*', '--query', 'Invalidation.Id', '--output', 'text') Activation 'CloudFront invalidation failed.') -join '').Trim()
  if ([string]::IsNullOrWhiteSpace($invalidationId)) { Stop-ProductionDeployment Activation 'CloudFront returned no invalidation identifier.' }
  Invoke-ExternalQuiet aws @('cloudfront', 'wait', 'invalidation-completed', '--profile', $AwsProfile, '--distribution-id', $EdgeOutput.cloudfront_distribution_id, '--id', $invalidationId) Activation 'CloudFront did not finish deploying the exact web artifact.'
}

$temporaryRoot = $null
try {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoPath '.git') -PathType Container)) { Stop-ProductionDeployment Preflight 'RepoPath is not the Atlas Git repository.' }
  $terraformVersion = Assert-ProductionTools
  Assert-NoTrackedSensitiveArtifacts
  $target = Get-ProductionTarget -RepoPath $RepoPath
  Assert-BackendInputs $target
  $identity = Get-AwsIdentity
  $source = Get-SourceIdentity
  if ($Mode -in @('Bootstrap', 'Prepare', 'Apply') -and -not $source.clean) { Stop-ProductionDeployment Preflight "$Mode requires a clean committed worktree." }
  if ($Mode -eq 'Prepare' -and -not $RunFullTests) { Stop-ProductionDeployment Preflight 'Production Prepare cannot disable full tests.' }

  $terraformRoot = Join-Path $RepoPath 'infra\aws\terraform'
  $tfvarsPath = Join-Path $terraformRoot 'production.tfvars'
  if (-not (Test-Path -LiteralPath $tfvarsPath -PathType Leaf)) { Stop-ProductionDeployment Preflight 'The ignored production.tfvars file is required.' }
  $targetHash = Get-Sha256 -LiteralPath (Join-Path $RepoPath 'infra\aws\production-target.json')
  $variableHash = Get-Sha256 -LiteralPath $tfvarsPath
  $backendFingerprint = Get-BackendFingerprint -Bucket $TerraformStateBucket -Key $TerraformStateKey -Region $target.awsRegion -KmsKeyArn $TerraformStateKmsKeyArn
  Initialize-ProductionTerraform $terraformRoot $target
  Invoke-TerraformGates $terraformRoot

  if ($Mode -eq 'Plan') {
    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("atlas-production-plan-{0}" -f [guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    $costPath = Join-Path $temporaryRoot 'cost.json'
    $null = Invoke-CostValidation $costPath
    $planPath = Join-Path $temporaryRoot 'production.tfplan'
    $policyPath = Join-Path $temporaryRoot 'policy.json'
    $plan = New-ValidatedPlan $terraformRoot $tfvarsPath Routine $planPath $policyPath $costPath $source.commit $variableHash $backendFingerprint
    Write-Output "Verified production account, us-west-2 target, default workspace, backend fingerprint, and plan policy $($plan.planSha256.Substring(0, 12))."
    Write-Output 'PLAN ONLY: no production resources or application artifacts were changed.'
    exit 0
  }

  if ($Mode -eq 'Bootstrap') {
    $releasePath = Resolve-NewReleaseDirectory $ReleaseDirectory
    Push-Location $terraformRoot
    try { $stateAddresses = @(Invoke-ExternalCapture terraform @('state', 'list') Identity 'Production state could not be inspected for Bootstrap eligibility.') }
    finally { Pop-Location }
    if (@($stateAddresses | Where-Object { $_ -match 'module\.api\.aws_ecs_service\.api' }).Count -gt 0) { Stop-ProductionDeployment Approval 'Bootstrap is single-use and cannot modify an existing API service.' }
    $costPath = Join-Path $releasePath 'bootstrap-cost.json'
    $cost = Invoke-CostValidation $costPath
    $planPath = Join-Path $releasePath 'bootstrap.tfplan'
    $policyPath = Join-Path $releasePath 'bootstrap-policy.json'
    $plan = New-ValidatedPlan $terraformRoot $tfvarsPath Bootstrap $planPath $policyPath $costPath $source.commit $variableHash $backendFingerprint -BootstrapEligible
    $evidencePath = Join-Path $releasePath 'bootstrap-evidence.json'
    $evidence = [ordered]@{
      schemaVersion = '1.0.0'; status = 'prepared'; sourceCommit = $source.commit; accountId = $identity.Account
      region = $target.awsRegion; workspace = $target.terraformWorkspace; backendFingerprint = $backendFingerprint
      targetDescriptorSha256 = $targetHash; variableFileSha256 = $variableHash; planSha256 = $plan.planSha256
      policyResultPath = 'bootstrap-policy.json'; apiDesiredCount = 0; workerDesiredCount = 0
      schedulesEnabled = $false; webActivated = $false; preparedAt = [DateTime]::UtcNow.ToString('o')
    }
    Write-JsonFile $evidencePath $evidence
    $confirmation = Read-Host "Type BOOTSTRAP PRODUCTION $($source.commit.Substring(0, 8)) to apply the create-only inactive shell"
    if (-not (Test-ExactProductionConfirmation -Mode Bootstrap -SourceCommit $source.commit -Confirmation $confirmation)) { Stop-ProductionDeployment Approval 'Bootstrap confirmation was rejected.' }
    Push-Location $terraformRoot
    try { Invoke-ExternalQuiet terraform @('apply', '-input=false', $planPath) Activation 'The exact saved Bootstrap plan failed.' }
    finally { Pop-Location }
    $evidence.status = 'succeeded'; $evidence.completedAt = [DateTime]::UtcNow.ToString('o')
    Write-JsonFile $evidencePath $evidence
    Write-Output 'Bootstrap completed with API/workers at zero, schedules disabled, and no web activation.'
    exit 0
  }

  if ($Mode -eq 'Prepare') {
    $releasePath = Resolve-NewReleaseDirectory $ReleaseDirectory
    Push-Location $RepoPath
    try {
      Invoke-ExternalQuiet npm.cmd @('ci') Validation 'npm ci failed.'
      Invoke-ExternalQuiet npm.cmd @('run', 'security:audit:runtime') Validation 'Runtime dependency audit failed.'
      Invoke-ExternalQuiet npm.cmd @('run', 'test:api') Validation 'API tests failed.'
      Invoke-ExternalQuiet npm.cmd @('run', 'test:web') Validation 'Web tests failed.'
      Invoke-ExternalQuiet npm.cmd @('run', 'build:api') Validation 'API build failed.'
      Invoke-ExternalQuiet npm.cmd @('run', 'build:web') Validation 'Web build failed.'
    }
    finally { Pop-Location }
    Invoke-ExternalQuiet docker @('info') Preflight 'Docker is not ready for a linux/amd64 production build.'

    $apiOutput = Get-TerraformOutput $terraformRoot api
    $repositoryUri = [string]$apiOutput.ecr_repository_url
    if (-not $repositoryUri.StartsWith("$($identity.Account).dkr.ecr.us-west-2.amazonaws.com/")) { Stop-ProductionDeployment Identity 'ECR repository is outside the expected production account or region.' }
    $localTag = "atlas-api:$($source.commit)"
    Invoke-ExternalQuiet docker @('build', '--platform', 'linux/amd64', '-f', (Join-Path $RepoPath 'apps\api\Dockerfile'), '-t', $localTag, $RepoPath) Artifact 'Production API image build failed.'
    $registry = ($repositoryUri -split '/')[0]
    $loginPassword = (Invoke-ExternalCapture aws @('ecr', 'get-login-password', '--profile', $AwsProfile, '--region', 'us-west-2') Identity 'ECR login token could not be obtained.') -join ''
    $savedPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $loginPassword | & docker login --username AWS --password-stdin $registry *> $null
      $loginExit = $LASTEXITCODE
    }
    finally { $loginPassword = $null; $ErrorActionPreference = $savedPreference }
    if ($loginExit -ne 0) { Stop-ProductionDeployment Identity 'ECR login failed.' }
    Invoke-ExternalQuiet docker @('tag', $localTag, "$repositoryUri`:$($source.commit)") Artifact 'Production API image tagging failed.'
    Invoke-ExternalQuiet docker @('push', "$repositoryUri`:$($source.commit)") Artifact 'Production API image push failed.'
    $repositoryName = ($repositoryUri -split '/', 2)[1]
    $digest = ((Invoke-ExternalCapture aws @('ecr', 'describe-images', '--profile', $AwsProfile, '--region', 'us-west-2', '--repository-name', $repositoryName, '--image-ids', "imageTag=$($source.commit)", '--query', 'imageDetails[0].imageDigest', '--output', 'text') Artifact 'The pushed API digest could not be resolved.') -join '').Trim()
    if ($digest -notmatch '^sha256:[a-f0-9]{64}$') { Stop-ProductionDeployment Artifact 'ECR returned an invalid immutable image digest.' }

    $web = New-WebArtifact $releasePath
    $contractPath = Join-Path $terraformRoot 'production-secrets.contract.json'
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    $attestation = Get-LiveSecretAttestation $contract $null
    $costPath = Join-Path $releasePath 'cost.json'
    $cost = Invoke-CostValidation $costPath
    $planPath = Join-Path $releasePath 'production.tfplan'
    $policyPath = Join-Path $releasePath 'policy.json'
    $plan = New-ValidatedPlan $terraformRoot $tfvarsPath Routine $planPath $policyPath $costPath $source.commit $variableHash $backendFingerprint
    $summaryPath = Join-Path $releasePath 'plan-summary.json'
    Write-JsonFile $summaryPath ([ordered]@{ schemaVersion = '1.0.0'; policyMode = 'Routine'; planSha256 = $plan.planSha256; deletionCount = $plan.policyResult.deletionCount; replacementCount = $plan.policyResult.replacementCount; guardrailsVerified = $plan.policyResult.guardrailsVerified })

    $timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    $releaseId = "$($source.commit)-$timestamp"
    $checkpointPath = Join-Path (Get-ProductionReleaseRoot) 'active-checkpoint.json'
    $previousCheckpoint = if (Test-Path -LiteralPath $checkpointPath -PathType Leaf) { Get-Content -LiteralPath $checkpointPath -Raw | ConvertFrom-Json } else { $null }
    $manifest = [ordered]@{
      schemaVersion = '1.0.0'; releaseId = $releaseId; preparedAt = [DateTime]::UtcNow.ToString('o')
      source = [ordered]@{ commit = $source.commit; branch = $source.branch; cleanWorktree = $true }
      target = [ordered]@{
        environment = 'production'; accountId = [string]$identity.Account; callerArn = [string]$identity.Arn
        region = 'us-west-2'; certificateRegion = 'us-east-1'; regionAuthorityPath = 'infra/aws/production-target.json'
        targetDescriptorSha256 = $targetHash; terraformWorkspace = 'default'; stateBucket = $TerraformStateBucket
        stateKey = $TerraformStateKey; stateKmsKeyArn = $TerraformStateKmsKeyArn; backendFingerprint = $backendFingerprint
      }
      apiArtifact = [ordered]@{ repositoryUri = $repositoryUri; tag = $source.commit; digest = $digest; platform = 'linux/amd64'; dockerfileSha256 = Get-Sha256 -LiteralPath (Join-Path $RepoPath 'apps\api\Dockerfile') }
      webArtifact = [ordered]@{ archivePath = 'web.zip'; sha256 = $web.sha256; fileManifestPath = 'web-files.json'; fileCount = $web.fileCount; totalBytes = $web.totalBytes }
      terraformArtifact = [ordered]@{ planPath = 'production.tfplan'; planSha256 = $plan.planSha256; redactedSummaryPath = 'plan-summary.json'; policyResultPath = 'policy.json'; terraformVersion = $terraformVersion; sourceCommit = $source.commit; backendFingerprint = $backendFingerprint; variableFileSha256 = $variableHash }
      secretAttestation = $attestation
      costEstimate = Get-ManifestCostEvidence $cost
      migrationSet = Get-MigrationSet
      previousCheckpoint = $previousCheckpoint
    }
    $manifestResult = Test-ProductionReleaseManifest -Manifest ([pscustomobject]$manifest) -RepoPath $RepoPath
    if (-not $manifestResult.Valid) { Stop-ProductionDeployment Artifact ($manifestResult.Errors -join '; ') }
    $manifestPath = Join-Path $releasePath 'release-manifest.json'
    Write-JsonFile $manifestPath $manifest
    Write-Output "Prepared immutable production release $releaseId. No Terraform apply, web upload, CloudFront invalidation, or workload activation occurred."
    exit 0
  }

  if ($Mode -eq 'Apply') {
    $manifestPath = Resolve-ExistingManifest $ReleaseManifestPath
    $releasePath = Split-Path -Parent $manifestPath
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json }
    catch { Stop-ProductionDeployment Artifact 'Release manifest JSON is invalid.' }
    $manifestResult = Test-ProductionReleaseManifest -Manifest $manifest -RepoPath $RepoPath
    if (-not $manifestResult.Valid) { Stop-ProductionDeployment Artifact ($manifestResult.Errors -join '; ') }
    $binding = [ordered]@{
      expectedAccountId = [string]$manifest.target.accountId; actualAccountId = [string]$identity.Account
      expectedRegion = [string]$manifest.target.region; actualRegion = [string]$target.awsRegion
      expectedWorkspace = [string]$manifest.target.terraformWorkspace; actualWorkspace = 'default'
      expectedBackendFingerprint = [string]$manifest.target.backendFingerprint; actualBackendFingerprint = $backendFingerprint
      expectedVariableFileSha256 = [string]$manifest.terraformArtifact.variableFileSha256; actualVariableFileSha256 = $variableHash
      expectedSourceCommit = [string]$manifest.source.commit; actualSourceCommit = $source.commit
    }
    if (-not (Test-ProductionIdentityBinding $binding) -or $manifest.target.targetDescriptorSha256 -cne $targetHash) { Stop-ProductionDeployment Identity 'Prepared release identity or hash binding changed.' }
    if ($manifest.apiArtifact.repositoryUri -notmatch ('^' + [regex]::Escape($ExpectedAccountId) + '\.dkr\.ecr\.us-west-2\.amazonaws\.com/')) { Stop-ProductionDeployment Identity 'Prepared ECR repository is outside the expected account or region.' }
    if ((Get-Sha256 -LiteralPath (Join-Path $RepoPath 'apps\api\Dockerfile')) -cne $manifest.apiArtifact.dockerfileSha256) { Stop-ProductionDeployment Artifact 'The production Dockerfile changed after Prepare.' }
    $planPath = Resolve-ReleasePath -RootPath $releasePath -CandidatePath (Join-Path $releasePath $manifest.terraformArtifact.planPath)
    $webArchivePath = Resolve-ReleasePath -RootPath $releasePath -CandidatePath (Join-Path $releasePath $manifest.webArtifact.archivePath)
    $webManifestPath = Resolve-ReleasePath -RootPath $releasePath -CandidatePath (Join-Path $releasePath $manifest.webArtifact.fileManifestPath)
    $policyPath = Resolve-ReleasePath -RootPath $releasePath -CandidatePath (Join-Path $releasePath $manifest.terraformArtifact.policyResultPath)
    foreach ($artifact in @(@($planPath, $manifest.terraformArtifact.planSha256), @($webArchivePath, $manifest.webArtifact.sha256))) {
      if (-not (Test-ImmutableArtifactBinding -LiteralPath $artifact[0] -ExpectedSha256 $artifact[1])) { Stop-ProductionDeployment Artifact 'A prepared immutable artifact hash changed.' }
    }
    $webInventory = Get-Content -LiteralPath $webManifestPath -Raw | ConvertFrom-Json
    if ($webInventory.fileCount -ne $manifest.webArtifact.fileCount -or $webInventory.totalBytes -ne $manifest.webArtifact.totalBytes) { Stop-ProductionDeployment Artifact 'The prepared web file inventory changed.' }
    $policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
    if ($policy.planSha256 -cne $manifest.terraformArtifact.planSha256 -or $policy.guardrailsVerified -ne $true) { Stop-ProductionDeployment Artifact 'The prepared policy result is not bound to the saved plan.' }
    $repositoryName = ($manifest.apiArtifact.repositoryUri -split '/', 2)[1]
    $liveDigest = ((Invoke-ExternalCapture aws @('ecr', 'describe-images', '--profile', $AwsProfile, '--region', 'us-west-2', '--repository-name', $repositoryName, '--image-ids', "imageTag=$($manifest.apiArtifact.tag)", '--query', 'imageDetails[0].imageDigest', '--output', 'text') Artifact 'Prepared API artifact could not be revalidated.') -join '').Trim()
    if ($liveDigest -cne $manifest.apiArtifact.digest) { Stop-ProductionDeployment Artifact 'Prepared API tag no longer resolves to the reviewed digest.' }
    $contractPath = Join-Path $terraformRoot 'production-secrets.contract.json'
    if ((Get-Sha256 -LiteralPath $contractPath) -cne $manifest.secretAttestation.contractSha256) { Stop-ProductionDeployment Artifact 'The production secret contract changed after Prepare.' }
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    $null = Get-LiveSecretAttestation $contract $manifest.secretAttestation
    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("atlas-production-apply-{0}" -f [guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    $currentCost = Invoke-CostValidation (Join-Path $temporaryRoot 'cost.json')
    if ($currentCost.estimatedMonthlyUsd -ne $manifest.costEstimate.estimatedMonthlyUsd -or $currentCost.estimatedMonthlyUsd -gt 110) { Stop-ProductionDeployment Validation 'Production cost evidence changed after Prepare.' }
    $confirmation = Read-Host "Type DEPLOY PRODUCTION $($source.commit.Substring(0, 8)) to apply the exact reviewed release"
    if (-not (Test-ExactProductionConfirmation -Mode Apply -SourceCommit $source.commit -Confirmation $confirmation)) { Stop-ProductionDeployment Approval 'Production deployment confirmation was rejected.' }
    $applyStartedAt = [DateTime]::UtcNow.ToString('o')
    Push-Location $terraformRoot
    try { Invoke-ExternalQuiet terraform @('apply', '-input=false', $planPath) Activation 'The exact saved production plan failed.' }
    finally { Pop-Location }
    $apiOutput = Get-TerraformOutput $terraformRoot api
    $edgeOutput = Get-TerraformOutput $terraformRoot edge
    Invoke-ExternalQuiet aws @('ecs', 'wait', 'services-stable', '--profile', $AwsProfile, '--region', 'us-west-2', '--cluster', $apiOutput.ecs_cluster_arn, '--services', 'atlas-production-api') Activation 'ECS did not reach a stable production deployment.'
    Invoke-WebArtifactActivation $webArchivePath $edgeOutput $temporaryRoot
    $smoke = Invoke-LiveProductionSmoke $edgeOutput.public_web_url
    $recordPath = Join-Path $releasePath 'execution-records.jsonl'
    if (-not $smoke.Passed) {
      Add-ProductionExecutionRecord -LiteralPath $recordPath -ReleaseRoot (Get-ProductionReleaseRoot) -Record ([ordered]@{ releaseId = $manifest.releaseId; operation = 'apply'; startedAt = $applyStartedAt; completedAt = [DateTime]::UtcNow.ToString('o'); operatorCallerArn = $identity.Arn; confirmationCommit = $source.commit; terraformApplyExitCode = 0; smokeChecks = @($smoke.Results); outcome = 'failed' })
      Stop-ProductionDeployment Smoke 'Production smoke failed; activation stopped. Use the validated previous checkpoint with Rollback mode.'
    }
    Add-ProductionExecutionRecord -LiteralPath $recordPath -ReleaseRoot (Get-ProductionReleaseRoot) -Record ([ordered]@{ releaseId = $manifest.releaseId; operation = 'apply'; startedAt = $applyStartedAt; completedAt = [DateTime]::UtcNow.ToString('o'); operatorCallerArn = $identity.Arn; confirmationCommit = $source.commit; terraformApplyExitCode = 0; smokeChecks = @($smoke.Results); outcome = 'succeeded' })
    $relativeWebArchive = [System.IO.Path]::GetRelativePath((Get-ProductionReleaseRoot), $webArchivePath).Replace('\', '/')
    $checkpoint = New-ProductionRollbackCheckpoint -Manifest $manifest -TaskDefinitionArn $apiOutput.task_definition_arn -WebArchivePath $relativeWebArchive
    Write-JsonFile (Join-Path (Get-ProductionReleaseRoot) 'active-checkpoint.json') $checkpoint
    Write-Output "Applied immutable production release $($manifest.releaseId)."
    exit 0
  }

  if ($Mode -eq 'Rollback') {
    $manifestPath = Resolve-ExistingManifest $ReleaseManifestPath
    $releasePath = Split-Path -Parent $manifestPath
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json }
    catch { Stop-ProductionDeployment Rollback 'Rollback release manifest JSON is invalid.' }
    $manifestResult = Test-ProductionReleaseManifest -Manifest $manifest -RepoPath $RepoPath
    if (-not $manifestResult.Valid -or $null -eq $manifest.previousCheckpoint) { Stop-ProductionDeployment Rollback 'Rollback requires a schema-valid release with a previous checkpoint.' }
    if ($manifest.target.accountId -cne $identity.Account -or $manifest.target.backendFingerprint -cne $backendFingerprint -or $manifest.target.targetDescriptorSha256 -cne $targetHash) { Stop-ProductionDeployment Identity 'Rollback target identity does not match the prepared release.' }
    $checkpointResult = Test-ProductionRollbackCheckpoint -Checkpoint $manifest.previousCheckpoint -CurrentMigrationSha256 $manifest.migrationSet.sha256 -ReleaseRoot (Get-ProductionReleaseRoot)
    if (-not $checkpointResult.Valid) { Stop-ProductionDeployment Rollback ($checkpointResult.Errors -join '; ') }
    $confirmation = Read-Host "Type ROLLBACK PRODUCTION TO $($manifest.previousCheckpoint.releaseId) to restore the prior compatible application"
    if (-not (Test-ExactProductionConfirmation -Mode Rollback -CheckpointReleaseId $manifest.previousCheckpoint.releaseId -Confirmation $confirmation)) { Stop-ProductionDeployment Approval 'Rollback confirmation was rejected.' }
    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("atlas-production-rollback-{0}" -f [guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    $rollbackStartedAt = [DateTime]::UtcNow.ToString('o')
    $apiOutput = Get-TerraformOutput $terraformRoot api
    $edgeOutput = Get-TerraformOutput $terraformRoot edge
    Invoke-ExternalQuiet aws @('ecs', 'update-service', '--profile', $AwsProfile, '--region', 'us-west-2', '--cluster', $apiOutput.ecs_cluster_arn, '--service', 'atlas-production-api', '--task-definition', $manifest.previousCheckpoint.taskDefinitionArn, '--desired-count', '1') Rollback 'Rollback could not restore the prior API task definition.'
    Invoke-ExternalQuiet aws @('ecs', 'wait', 'services-stable', '--profile', $AwsProfile, '--region', 'us-west-2', '--cluster', $apiOutput.ecs_cluster_arn, '--services', 'atlas-production-api') Rollback 'Rolled-back ECS service did not stabilize.'
    $previousWeb = Resolve-ReleasePath -RootPath (Get-ProductionReleaseRoot) -CandidatePath (Join-Path (Get-ProductionReleaseRoot) $manifest.previousCheckpoint.webArchivePath)
    Invoke-WebArtifactActivation $previousWeb $edgeOutput $temporaryRoot
    $smoke = Invoke-LiveProductionSmoke $edgeOutput.public_web_url
    $recordPath = Join-Path $releasePath 'execution-records.jsonl'
    $outcome = if ($smoke.Passed) { 'rolled_back' } else { 'rollback_failed' }
    Add-ProductionExecutionRecord -LiteralPath $recordPath -ReleaseRoot (Get-ProductionReleaseRoot) -Record ([ordered]@{ releaseId = $manifest.releaseId; operation = 'rollback'; startedAt = $rollbackStartedAt; completedAt = [DateTime]::UtcNow.ToString('o'); operatorCallerArn = $identity.Arn; confirmationCommit = $source.commit; terraformApplyExitCode = $null; smokeChecks = @($smoke.Results); outcome = $outcome })
    if (-not $smoke.Passed) { Stop-ProductionDeployment Rollback 'Rollback smoke verification failed; Terraform state and database were not rewound.' }
    Write-Output "Rolled back application artifacts to $($manifest.previousCheckpoint.releaseId) without changing Terraform state or database contents."
    exit 0
  }
}
catch {
  $exitCode = if ($_.Exception.Data.Contains('ExitCode')) { [int]$_.Exception.Data['ExitCode'] } else { 2 }
  [Console]::Error.WriteLine((Protect-DeploymentText $_.Exception.Message))
  exit $exitCode
}
finally {
  if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot -PathType Container)) {
    $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryRoot)
    $systemTemporary = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemporary.StartsWith($systemTemporary, [System.StringComparison]::OrdinalIgnoreCase) -and $resolvedTemporary -ne $systemTemporary) {
      Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    }
  }
}
