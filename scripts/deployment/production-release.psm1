Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PropertyValue {
  param([AllowNull()] [object] $Object, [Parameter(Mandatory = $true)] [string] $Name)
  if ($null -eq $Object) { return $null }
  if ($Object -is [System.Collections.IDictionary]) {
    if ($Object.Contains($Name)) { return $Object[$Name] }
    return $null
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Test-PropertyPresent {
  param([AllowNull()] [object] $Object, [Parameter(Mandatory = $true)] [string] $Name)
  if ($null -eq $Object) { return $false }
  if ($Object -is [System.Collections.IDictionary]) { return $Object.Contains($Name) }
  return $null -ne $Object.PSObject.Properties[$Name]
}

function Get-TextSha256 {
  param([Parameter(Mandatory = $true)] [string] $Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally { $sha.Dispose() }
}

function Get-Sha256 {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [string] $LiteralPath)
  $resolved = (Resolve-Path -LiteralPath $LiteralPath -ErrorAction Stop).Path
  $stream = [System.IO.File]::OpenRead($resolved)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose(); $stream.Dispose() }
}

function Resolve-ReleasePath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $RootPath,
    [Parameter(Mandatory = $true)] [string] $CandidatePath,
    [switch] $AllowMissing
  )
  $root = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $candidate = [System.IO.Path]::GetFullPath($CandidatePath)
  $prefix = "$root$([System.IO.Path]::DirectorySeparatorChar)"
  if (-not $candidate.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -and -not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release path must remain inside the selected release directory.'
  }
  if (-not $AllowMissing -and -not (Test-Path -LiteralPath $candidate)) { throw 'Release path does not exist.' }
  if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
  return $candidate
}

function Get-BackendFingerprint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $Bucket,
    [Parameter(Mandatory = $true)] [string] $Key,
    [Parameter(Mandatory = $true)] [string] $Region,
    [Parameter(Mandatory = $true)] [string] $KmsKeyArn
  )
  $normalized = @(
    "bucket=$($Bucket.Trim().ToLowerInvariant())",
    "key=$($Key.Trim().Replace('\', '/').TrimStart('/'))",
    "region=$($Region.Trim().ToLowerInvariant())",
    "kms=$($KmsKeyArn.Trim())"
  ) -join "`n"
  return Get-TextSha256 -Text $normalized
}

function Protect-DeploymentText {
  [CmdletBinding()]
  param([AllowNull()] [string] $Text)
  if ($null -eq $Text) { return '' }
  $redacted = $Text
  $redacted = [regex]::Replace($redacted, '(?i)\b(secret|string|binary|password|token|credential|cookie|totp|authorization)\s*[=:]\s*[^\s;,]+', '$1=[REDACTED]')
  $redacted = [regex]::Replace($redacted, '(?i)(postgres(?:ql)?|mysql|mongodb)://[^\s/@:]+:[^\s/@]+@', '$1://[REDACTED]@')
  $redacted = [regex]::Replace($redacted, '(?i)SENTINEL_[A-Z0-9_]+', '[REDACTED]')
  return $redacted
}

function Test-CleanWorktreeStatus {
  [CmdletBinding()]
  param([AllowEmptyCollection()] [string[]] $StatusLines)
  return @($StatusLines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -eq 0
}

function Test-ProductionToolVersion {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $Tool,
    [Parameter(Mandatory = $true)] [string] $ActualVersion,
    [Parameter(Mandatory = $true)] [string] $MinimumVersion,
    [string] $MaximumExclusiveVersion
  )
  try {
    $actualMatch = [regex]::Match($ActualVersion, '(?<!\d)(\d+\.\d+(?:\.\d+)?)(?!\d)')
    if (-not $actualMatch.Success) { return $false }
    $actual = [version]$actualMatch.Groups[1].Value
    $minimum = [version]$MinimumVersion
    if ($actual -lt $minimum) { return $false }
    if (-not [string]::IsNullOrWhiteSpace($MaximumExclusiveVersion)) {
      if ($actual -ge [version]$MaximumExclusiveVersion) { return $false }
    }
    return $true
  }
  catch { return $false }
}

function Test-ProductionIdentityBinding {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [object] $Binding)
  foreach ($name in @('AccountId', 'Region', 'Workspace', 'BackendFingerprint', 'VariableFileSha256', 'SourceCommit')) {
    $expected = Get-PropertyValue $Binding "expected$name"
    $actual = Get-PropertyValue $Binding "actual$name"
    if ($null -eq $expected -or $null -eq $actual -or $expected -cne $actual) { return $false }
  }
  return $true
}

function Test-ExactProductionConfirmation {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [ValidateSet('Apply', 'Bootstrap', 'Rollback')] [string] $Mode,
    [string] $SourceCommit,
    [string] $CheckpointReleaseId,
    [AllowEmptyString()] [string] $Confirmation
  )
  $expected = switch ($Mode) {
    'Apply' {
      if (-not (Test-GitShaValue $SourceCommit)) { return $false }
      "DEPLOY PRODUCTION $($SourceCommit.Substring(0, 8))"
    }
    'Bootstrap' {
      if (-not (Test-GitShaValue $SourceCommit)) { return $false }
      "BOOTSTRAP PRODUCTION $($SourceCommit.Substring(0, 8))"
    }
    'Rollback' {
      if ([string]::IsNullOrWhiteSpace($CheckpointReleaseId)) { return $false }
      "ROLLBACK PRODUCTION TO $CheckpointReleaseId"
    }
  }
  return $Confirmation -ceq $expected
}

function Get-ProductionModeCapabilities {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [ValidateSet('Plan', 'Bootstrap', 'Prepare', 'Apply', 'Rollback')] [string] $Mode)
  $capabilities = [ordered]@{
    awsMutation        = $false
    buildArtifact      = $false
    pushApiImage       = $false
    terraformApply     = $false
    activateApplication = $false
    regeneratePlan     = $false
    restoreCheckpoint  = $false
    databaseMutation   = $false
  }
  switch ($Mode) {
    'Bootstrap' { $capabilities.awsMutation = $true; $capabilities.terraformApply = $true }
    'Prepare' { $capabilities.awsMutation = $true; $capabilities.buildArtifact = $true; $capabilities.pushApiImage = $true; $capabilities.regeneratePlan = $true }
    'Apply' { $capabilities.awsMutation = $true; $capabilities.terraformApply = $true; $capabilities.activateApplication = $true }
    'Rollback' { $capabilities.awsMutation = $true; $capabilities.activateApplication = $true; $capabilities.restoreCheckpoint = $true }
  }
  return [pscustomobject]$capabilities
}

function Get-ProductionExitCode {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [ValidateSet('Preflight', 'Identity', 'Validation', 'Artifact', 'Approval', 'Activation', 'Smoke', 'Rollback')] [string] $FailureClass)
  return @{
    Preflight = 2; Identity = 3; Validation = 4; Artifact = 5
    Approval = 6; Activation = 7; Smoke = 8; Rollback = 9
  }[$FailureClass]
}

function Test-ImmutableArtifactBinding {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $LiteralPath,
    [Parameter(Mandatory = $true)] [string] $ExpectedSha256
  )
  if (-not (Test-Sha256Value $ExpectedSha256)) { return $false }
  try { return (Get-Sha256 -LiteralPath $LiteralPath) -ceq $ExpectedSha256 }
  catch { return $false }
}

function Test-ProductionSecretPreflight {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [object] $Contract,
    [Parameter(Mandatory = $true)] [AllowEmptyCollection()] [object[]] $Inventory,
    [Parameter(Mandatory = $true)] [object] $Wiring,
    [Parameter(Mandatory = $true)] [object] $Features,
    [Parameter(Mandatory = $true)] [string] $ExpectedAccountId,
    [Parameter(Mandatory = $true)] [string] $ExpectedRegion,
    [object] $PreparedAttestation
  )
  $errors = New-Object 'System.Collections.Generic.List[string]'
  $attestedSecrets = New-Object 'System.Collections.Generic.List[object]'
  $requiredRows = New-Object 'System.Collections.Generic.List[object]'

  foreach ($row in @(Get-PropertyValue $Contract 'secrets')) {
    $condition = [string](Get-PropertyValue $row 'requiredWhen')
    $required = $condition -eq 'always'
    if (-not $required) {
      $featureProperty = $Features.PSObject.Properties[$condition]
      if ($null -eq $featureProperty) {
        $errors.Add("Secret contract condition '$condition' has no feature binding.")
        continue
      }
      $required = $featureProperty.Value -eq $true
    }
    if ($required) { $requiredRows.Add($row) }
  }

  $secretKeys = @((Get-PropertyValue $Wiring 'secretKeys'))
  $plaintextKeys = @((Get-PropertyValue $Wiring 'plaintextKeys'))
  $retiredWiringKeys = @((Get-PropertyValue $Wiring 'retiredKeys'))
  $iamArns = @((Get-PropertyValue $Wiring 'iamSecretArns'))
  if ((Get-PropertyValue $Wiring 'iamWildcard') -eq $true -or @($iamArns | Where-Object { $_ -match '[*?]' }).Count -gt 0) {
    $errors.Add('Secret IAM resources must be exact ARNs without wildcards.')
  }

  foreach ($key in @((Get-PropertyValue $Contract 'runtimeNonSecretVariables'))) {
    if ($key -notin $plaintextKeys) { $errors.Add("Runtime non-secret '$key' is not wired as plaintext configuration.") }
  }
  foreach ($retired in @((Get-PropertyValue $Contract 'retiredSecretKeys'))) {
    if ($retired -in $secretKeys -or $retired -in $retiredWiringKeys) {
      $errors.Add("Retired secret key '$retired' is still wired.")
    }
  }

  foreach ($row in $requiredRows) {
    $key = [string](Get-PropertyValue $row 'key')
    $matches = @($Inventory | Where-Object { (Get-PropertyValue $_ 'key') -ceq $key })
    if ($matches.Count -ne 1) {
      $errors.Add("Secret '$key' must have exactly one inventory entry.")
      continue
    }
    $item = $matches[0]
    if ($null -ne (Get-PropertyValue $item 'providerError')) {
      $errors.Add("Secret '$key' could not be verified by the provider.")
      continue
    }

    $namePrefix = Get-PropertyValue $Contract 'namePrefix'
    $expectedName = if ([string]::IsNullOrWhiteSpace($namePrefix)) { $null } else { "$namePrefix/$([string](Get-PropertyValue $row 'nameSuffix'))" }
    if ($null -ne $expectedName -and (Get-PropertyValue $item 'name') -cne $expectedName) {
      $errors.Add("Secret '$key' does not use its canonical name.")
    }
    $arn = [string](Get-PropertyValue $item 'arn')
    $arnPattern = '^arn:aws:secretsmanager:' + [regex]::Escape($ExpectedRegion) + ':' + [regex]::Escape($ExpectedAccountId) + ':secret:.+$'
    if ($arn -notmatch $arnPattern) { $errors.Add("Secret '$key' is outside the expected account or region.") }
    if ($null -ne (Get-PropertyValue $item 'deletedDate')) { $errors.Add("Secret '$key' is pending deletion.") }

    $currentVersions = @((Get-PropertyValue $item 'versions') | Where-Object { @((Get-PropertyValue $_ 'stages')) -contains 'AWSCURRENT' })
    if ($currentVersions.Count -ne 1) {
      $errors.Add("Secret '$key' must have exactly one AWSCURRENT version.")
      continue
    }
    $version = $currentVersions[0]
    $versionId = [string](Get-PropertyValue $version 'versionId')
    if ([string]::IsNullOrWhiteSpace($versionId)) { $errors.Add("Secret '$key' AWSCURRENT VersionId is missing.") }

    $stringValue = Get-PropertyValue $version 'secretString'
    $binaryValue = Get-PropertyValue $version 'secretBinary'
    $hasString = $null -ne $stringValue -and -not [string]::IsNullOrEmpty([string]$stringValue)
    $hasBinary = if ($null -eq $binaryValue) { $false } elseif ($binaryValue -is [byte[]]) { $binaryValue.Length -gt 0 } else { -not [string]::IsNullOrEmpty([string]$binaryValue) }
    if ($hasString -eq $hasBinary) { $errors.Add("Secret '$key' must contain exactly one nonempty string or binary value.") }

    if ($key -notin $secretKeys) { $errors.Add("Secret '$key' is missing from runtime secret wiring.") }
    if ($key -in $plaintextKeys) { $errors.Add("Secret '$key' is exposed as plaintext configuration.") }
    foreach ($consumer in @((Get-PropertyValue $row 'consumers'))) {
      $consumerKeys = @((Get-PropertyValue (Get-PropertyValue $Wiring 'consumers') ([string]$consumer)))
      if ($key -notin $consumerKeys) { $errors.Add("Secret '$key' is missing consumer wiring for '$consumer'.") }
    }
    if ($arn -notin $iamArns) { $errors.Add("Secret '$key' is missing exact IAM access.") }

    if (-not [string]::IsNullOrWhiteSpace($versionId) -and $arn -match $arnPattern) {
      $attestedSecrets.Add([pscustomobject][ordered]@{
        key = $key; secretArn = $arn; versionId = $versionId
        consumers = @((Get-PropertyValue $row 'consumers'))
        exists = $true; currentVersionUnique = $true; nonempty = ($hasString -xor $hasBinary); wiringVerified = $true
      })
    }
  }

  $requiredKeys = @($requiredRows | ForEach-Object { [string](Get-PropertyValue $_ 'key') })
  foreach ($key in $secretKeys) {
    if ($key -notin $requiredKeys) { $errors.Add("Unexpected runtime secret wiring '$key'.") }
  }
  $attestedArns = @($attestedSecrets | ForEach-Object { $_.secretArn })
  foreach ($arn in $iamArns) {
    if ($arn -notin $attestedArns) { $errors.Add('Secret IAM includes an undeclared or inactive ARN.') }
  }

  if ($null -ne $PreparedAttestation) {
    foreach ($prepared in @((Get-PropertyValue $PreparedAttestation 'secrets'))) {
      $key = [string](Get-PropertyValue $prepared 'key')
      $current = @($attestedSecrets | Where-Object { $_.key -ceq $key })
      if ($current.Count -ne 1 -or
          $current[0].secretArn -cne (Get-PropertyValue $prepared 'secretArn') -or
          $current[0].versionId -cne (Get-PropertyValue $prepared 'versionId')) {
        $errors.Add("Secret '$key' changed after preparation.")
      }
    }
  }

  return [pscustomobject][ordered]@{
    Valid = $errors.Count -eq 0
    Errors = $errors.ToArray()
    Attestation = [pscustomobject][ordered]@{
      verifiedAt = [DateTime]::UtcNow.ToString('o')
      secrets = $attestedSecrets.ToArray()
    }
  }
}

function Test-ProductionRollbackCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [object] $Checkpoint,
    [Parameter(Mandatory = $true)] [string] $CurrentMigrationSha256,
    [Parameter(Mandatory = $true)] [string] $ReleaseRoot
  )
  $errors = New-Object 'System.Collections.Generic.List[string]'
  if ([string]::IsNullOrWhiteSpace((Get-PropertyValue $Checkpoint 'releaseId'))) { $errors.Add('Checkpoint releaseId is missing.') }
  if (-not (Test-GitShaValue (Get-PropertyValue $Checkpoint 'apiImageTag'))) { $errors.Add('Checkpoint API tag is not an immutable commit.') }
  if ((Get-PropertyValue $Checkpoint 'apiImageDigest') -notmatch '^sha256:[a-f0-9]{64}$') { $errors.Add('Checkpoint API digest is invalid.') }
  if ((Get-PropertyValue $Checkpoint 'taskDefinitionArn') -notmatch '^arn:aws[a-zA-Z-]*:ecs:us-west-2:[0-9]{12}:task-definition/') { $errors.Add('Checkpoint task definition is invalid.') }
  if (-not (Test-Sha256Value $CurrentMigrationSha256) -or (Get-PropertyValue $Checkpoint 'migrationSha256') -cne $CurrentMigrationSha256) { $errors.Add('Checkpoint application is not proven compatible with the current migration set.') }
  try { $null = [DateTimeOffset]::Parse([string](Get-PropertyValue $Checkpoint 'activatedAt')) }
  catch { $errors.Add('Checkpoint activation timestamp is invalid.') }

  $webPathValue = Get-PropertyValue $Checkpoint 'webArchivePath'
  if (-not (Test-RelativeArtifactPath $webPathValue)) { $errors.Add('Checkpoint web archive path is invalid.') }
  else {
    try {
      $webPath = Resolve-ReleasePath -RootPath $ReleaseRoot -CandidatePath (Join-Path $ReleaseRoot $webPathValue)
      if (-not (Test-ImmutableArtifactBinding -LiteralPath $webPath -ExpectedSha256 (Get-PropertyValue $Checkpoint 'webArchiveSha256'))) { $errors.Add('Checkpoint web archive is missing or corrupted.') }
    }
    catch { $errors.Add('Checkpoint web archive is unavailable.') }
  }
  return [pscustomobject]@{ Valid = $errors.Count -eq 0; Errors = $errors.ToArray() }
}

function Add-ProductionExecutionRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $LiteralPath,
    [Parameter(Mandatory = $true)] [object] $Record,
    [Parameter(Mandatory = $true)] [string] $ReleaseRoot
  )
  $resolved = Resolve-ReleasePath -RootPath $ReleaseRoot -CandidatePath $LiteralPath -AllowMissing
  $parent = Split-Path -Parent $resolved
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'Execution-record parent directory does not exist.' }
  $operation = Get-PropertyValue $Record 'operation'
  $outcome = Get-PropertyValue $Record 'outcome'
  if ($operation -notin @('bootstrap', 'apply', 'rollback') -or $outcome -notin @('succeeded', 'failed', 'rolled_back', 'rollback_failed')) { throw 'Execution record operation or outcome is invalid.' }
  $json = $Record | ConvertTo-Json -Depth 30 -Compress
  [System.IO.File]::AppendAllText($resolved, "$json`n", [System.Text.UTF8Encoding]::new($false))
}

function New-ProductionRollbackCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [object] $Manifest,
    [Parameter(Mandatory = $true)] [string] $TaskDefinitionArn,
    [Parameter(Mandatory = $true)] [string] $WebArchivePath
  )
  return [pscustomobject][ordered]@{
    releaseId = Get-PropertyValue $Manifest 'releaseId'
    apiImageTag = Get-PropertyValue (Get-PropertyValue $Manifest 'apiArtifact') 'tag'
    apiImageDigest = Get-PropertyValue (Get-PropertyValue $Manifest 'apiArtifact') 'digest'
    taskDefinitionArn = $TaskDefinitionArn
    webArchivePath = $WebArchivePath
    webArchiveSha256 = Get-PropertyValue (Get-PropertyValue $Manifest 'webArtifact') 'sha256'
    migrationSha256 = Get-PropertyValue (Get-PropertyValue $Manifest 'migrationSet') 'sha256'
    activatedAt = [DateTimeOffset]::UtcNow.ToString('o')
  }
}

function Invoke-ProductionSmokeContract {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [string] $BaseUri,
    [Parameter(Mandatory = $true)] [string] $Username,
    [Parameter(Mandatory = $true)] [AllowNull()] [object] $Password,
    [AllowNull()] [object] $Totp,
    [Parameter(Mandatory = $true)] [scriptblock] $RequestInvoker
  )
  $results = New-Object 'System.Collections.Generic.List[object]'
  $normalizedBase = $BaseUri.TrimEnd('/')
  $entityId = $null

  function Invoke-SmokeRequest {
    param([string] $Name, [string] $Method, [string] $Path, [object] $Body, [scriptblock] $Validator)
    if ($Method -notin @('GET', 'POST') -or ($Method -eq 'POST' -and $Name -notin @('auth-login', 'auth-logout')) -or $Path -match '(?i)refresh|pricingMode=refresh') {
      throw 'Production smoke request violates the read-only method/path contract.'
    }
    $started = [DateTimeOffset]::UtcNow
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $statusCode = 0
    $passed = $false
    try {
      $response = & $RequestInvoker ([pscustomobject]@{ name = $Name; method = $Method; uri = "$normalizedBase$Path"; path = $Path; body = $Body })
      $statusCode = [int](Get-PropertyValue $response 'statusCode')
      $passed = & $Validator $response
    }
    catch { $passed = $false }
    finally { $timer.Stop() }
    $results.Add([pscustomobject][ordered]@{
      name = $Name; startedAt = $started.ToString('o'); completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      status = if ($passed) { 'passed' } else { 'failed' }; responseStatus = $statusCode
      latencyMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 3)
      diagnosticCode = if ($passed) { 'ok' } else { "${Name}_failed" }
    })
    return [pscustomobject]@{ Passed = $passed; Response = if ($passed) { $response } else { $null } }
  }

  $home = Invoke-SmokeRequest 'edge-home' 'GET' '/' $null {
    param($response)
    [int](Get-PropertyValue $response 'statusCode') -eq 200 -and
      [string](Get-PropertyValue $response 'contentType') -match 'text/html' -and
      [string](Get-PropertyValue $response 'body') -match '<html'
  }
  if (-not $home.Passed) { return [pscustomobject]@{ Passed = $false; Results = $results.ToArray() } }
  $homeBody = [string](Get-PropertyValue $home.Response 'body')
  $assetPaths = @([regex]::Matches($homeBody, '(?i)(?:src|href)=["'']([^"'']+\.(?:js|css))(?:\?[^"'']*)?["'']') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
  $homeBody = $null
  if ($assetPaths.Count -eq 0) {
    $results.Add([pscustomobject]@{ name = 'edge-assets'; startedAt = [DateTimeOffset]::UtcNow.ToString('o'); completedAt = [DateTimeOffset]::UtcNow.ToString('o'); status = 'failed'; responseStatus = 0; latencyMs = 0; diagnosticCode = 'edge-assets_failed' })
    return [pscustomobject]@{ Passed = $false; Results = $results.ToArray() }
  }
  $assetPassed = $true
  $assetStarted = [DateTimeOffset]::UtcNow
  $assetTimer = [Diagnostics.Stopwatch]::StartNew()
  $assetStatus = 200
  foreach ($assetPath in $assetPaths) {
    try {
      $asset = & $RequestInvoker ([pscustomobject]@{ name = 'edge-assets'; method = 'GET'; uri = "$normalizedBase$assetPath"; path = $assetPath; body = $null })
      $assetStatus = [int](Get-PropertyValue $asset 'statusCode')
      $assetContent = [string](Get-PropertyValue $asset 'body')
      $contentType = [string](Get-PropertyValue $asset 'contentType')
      if ($assetStatus -ne 200 -or [string]::IsNullOrEmpty($assetContent) -or ($assetPath.EndsWith('.css') -and $contentType -notmatch 'css') -or ($assetPath.EndsWith('.js') -and $contentType -notmatch 'javascript')) { $assetPassed = $false; break }
      $assetContent = $null
    }
    catch { $assetPassed = $false; break }
  }
  $assetTimer.Stop()
  $results.Add([pscustomobject]@{ name = 'edge-assets'; startedAt = $assetStarted.ToString('o'); completedAt = [DateTimeOffset]::UtcNow.ToString('o'); status = if ($assetPassed) { 'passed' } else { 'failed' }; responseStatus = $assetStatus; latencyMs = [math]::Round($assetTimer.Elapsed.TotalMilliseconds, 3); diagnosticCode = if ($assetPassed) { 'ok' } else { 'edge-assets_failed' } })
  if (-not $assetPassed) { return [pscustomobject]@{ Passed = $false; Results = $results.ToArray() } }

  $checks = @(
    @('auth-anonymous', 'GET', '/v1/auth/session', $null, { param($r) [int](Get-PropertyValue $r 'statusCode') -eq 401 }),
    @('auth-login', 'POST', '/v1/auth/login', [pscustomobject]@{ email = $Username; password = $Password; totp = $Totp }, { param($r) [int](Get-PropertyValue $r 'statusCode') -in @(200, 204) }),
    @('auth-session', 'GET', '/v1/auth/session', $null, { param($r) $body = Get-PropertyValue $r 'body'; [int](Get-PropertyValue $r 'statusCode') -eq 200 -and -not [string]::IsNullOrWhiteSpace([string](Get-PropertyValue (Get-PropertyValue $body 'user') 'id')) }),
    @('dashboard-read', 'GET', '/v1/dashboard', $null, { param($r) [int](Get-PropertyValue $r 'statusCode') -eq 200 -and $null -ne (Get-PropertyValue $r 'body') }),
    @('liquidity-holdings-read', 'GET', '/v1/reports/consolidated-holdings?pricingMode=saved&page=1&pageSize=1', $null, { param($r) $b = Get-PropertyValue $r 'body'; [int](Get-PropertyValue $r 'statusCode') -eq 200 -and (Test-PropertyPresent $b 'items') }),
    @('liquidity-performance-read', 'GET', '/v1/reports/consolidated-holdings/performance', $null, { param($r) $b = Get-PropertyValue $r 'body'; [int](Get-PropertyValue $r 'statusCode') -eq 200 -and (Test-PropertyPresent $b 'series') }),
    @('investment-aggregation-read', 'GET', '/v1/partnership-tracker/aggregation?page=1&pageSize=25', $null, { param($r) $b = Get-PropertyValue $r 'body'; [int](Get-PropertyValue $r 'statusCode') -eq 200 -and (Test-PropertyPresent $b 'items') }),
    @('tic-properties-read', 'GET', '/v1/tic-registry/properties', $null, { param($r) $b = Get-PropertyValue $r 'body'; [int](Get-PropertyValue $r 'statusCode') -eq 200 -and (Test-PropertyPresent $b 'items') }),
    @('entities-list-read', 'GET', '/v1/entities', $null, { param($r) $b = Get-PropertyValue $r 'body'; [int](Get-PropertyValue $r 'statusCode') -eq 200 -and (Test-PropertyPresent $b 'items') })
  )
  foreach ($check in $checks) {
    $outcome = Invoke-SmokeRequest $check[0] $check[1] $check[2] $check[3] $check[4]
    if (-not $outcome.Passed) { $Password = $null; $Totp = $null; return [pscustomobject]@{ Passed = $false; Results = $results.ToArray() } }
    if ($check[0] -eq 'entities-list-read') {
      $items = @((Get-PropertyValue (Get-PropertyValue $outcome.Response 'body') 'items'))
      if ($items.Count -gt 0) { $entityId = [string](Get-PropertyValue $items[0] 'id') }
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($entityId)) {
    $detail = Invoke-SmokeRequest 'entity-detail-read' 'GET' "/v1/entities/$entityId" $null { param($r) [int](Get-PropertyValue $r 'statusCode') -eq 200 -and [string](Get-PropertyValue (Get-PropertyValue $r 'body') 'id') -ceq $entityId }
    if (-not $detail.Passed) { return [pscustomobject]@{ Passed = $false; Results = $results.ToArray() } }
  }
  $logout = Invoke-SmokeRequest 'auth-logout' 'POST' '/v1/auth/logout' $null { param($r) [int](Get-PropertyValue $r 'statusCode') -in @(200, 204) }
  if (-not $logout.Passed) { return [pscustomobject]@{ Passed = $false; Results = $results.ToArray() } }
  $postLogout = Invoke-SmokeRequest 'auth-post-logout' 'GET' '/v1/auth/session' $null { param($r) [int](Get-PropertyValue $r 'statusCode') -eq 401 }
  $Password = $null; $Totp = $null
  return [pscustomobject]@{ Passed = $postLogout.Passed; Results = $results.ToArray() }
}

function Get-ProductionTarget {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [string] $RepoPath)
  $path = Join-Path ([System.IO.Path]::GetFullPath($RepoPath)) 'infra\aws\production-target.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Missing committed production target descriptor.' }
  try { $target = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
  catch { throw "Invalid production target JSON: $(Protect-DeploymentText $_.Exception.Message)" }

  $expected = [ordered]@{
    schemaVersion = '1.0.0'
    environment = 'production'
    awsRegion = 'us-west-2'
    terraformWorkspace = 'default'
    cloudFrontCertificateRegion = 'us-east-1'
  }
  foreach ($entry in $expected.GetEnumerator()) {
    if ((Get-PropertyValue $target $entry.Key) -ne $entry.Value) { throw "Production target field '$($entry.Key)' does not match the committed contract." }
  }
  $allowed = @($expected.Keys)
  foreach ($property in $target.PSObject.Properties.Name) {
    if ($property -notin $allowed) { throw "Production target contains unsupported field '$property'." }
  }
  return $target
}

function Test-RelativeArtifactPath {
  param([AllowNull()] [object] $Value)
  if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) { return $false }
  if ([System.IO.Path]::IsPathRooted($Value)) { return $false }
  return @($Value -split '[\\/]' | Where-Object { $_ -eq '..' }).Count -eq 0
}

function Test-Sha256Value { param([AllowNull()] [object] $Value); return $Value -is [string] -and $Value -match '^[a-f0-9]{64}$' }
function Test-GitShaValue { param([AllowNull()] [object] $Value); return $Value -is [string] -and $Value -match '^[a-f0-9]{40}$' }

function Test-ProductionReleaseManifest {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] [object] $Manifest, [Parameter(Mandatory = $true)] [string] $RepoPath)
  $errors = New-Object 'System.Collections.Generic.List[string]'
  try { $null = Get-ProductionTarget -RepoPath $RepoPath } catch { $errors.Add($_.Exception.Message) }

  if ((Get-PropertyValue $Manifest 'schemaVersion') -ne '1.0.0') { $errors.Add('schemaVersion must be 1.0.0.') }
  if ((Get-PropertyValue $Manifest 'releaseId') -notmatch '^[a-f0-9]{40}-[0-9]{8}T[0-9]{6}Z$') { $errors.Add('releaseId is invalid.') }
  $source = Get-PropertyValue $Manifest 'source'
  if (-not (Test-GitShaValue (Get-PropertyValue $source 'commit'))) { $errors.Add('source.commit is invalid.') }
  if ((Get-PropertyValue $source 'cleanWorktree') -ne $true) { $errors.Add('source.cleanWorktree must be true.') }

  $target = Get-PropertyValue $Manifest 'target'
  if ((Get-PropertyValue $target 'environment') -ne 'production') { $errors.Add('target.environment must be production.') }
  if ((Get-PropertyValue $target 'region') -ne 'us-west-2') { $errors.Add('target.region must be us-west-2.') }
  if ((Get-PropertyValue $target 'certificateRegion') -ne 'us-east-1') { $errors.Add('target.certificateRegion must be us-east-1.') }
  if ((Get-PropertyValue $target 'terraformWorkspace') -ne 'default') { $errors.Add('target.terraformWorkspace must be default.') }
  if ((Get-PropertyValue $target 'accountId') -notmatch '^[0-9]{12}$') { $errors.Add('target.accountId is invalid.') }
  foreach ($field in @('targetDescriptorSha256', 'backendFingerprint')) {
    if (-not (Test-Sha256Value (Get-PropertyValue $target $field))) { $errors.Add("target.$field is invalid.") }
  }

  $api = Get-PropertyValue $Manifest 'apiArtifact'
  if (-not (Test-GitShaValue (Get-PropertyValue $api 'tag'))) { $errors.Add('apiArtifact.tag is invalid.') }
  if ((Get-PropertyValue $api 'digest') -notmatch '^sha256:[a-f0-9]{64}$') { $errors.Add('apiArtifact.digest is invalid.') }
  if ((Get-PropertyValue $api 'platform') -ne 'linux/amd64') { $errors.Add('apiArtifact.platform must be linux/amd64.') }

  $web = Get-PropertyValue $Manifest 'webArtifact'
  $terraform = Get-PropertyValue $Manifest 'terraformArtifact'
  foreach ($pair in @(@($web, 'archivePath'), @($web, 'fileManifestPath'), @($terraform, 'planPath'), @($terraform, 'redactedSummaryPath'), @($terraform, 'policyResultPath'))) {
    if (-not (Test-RelativeArtifactPath (Get-PropertyValue $pair[0] $pair[1]))) { $errors.Add("Artifact path '$($pair[1])' is invalid.") }
  }
  foreach ($field in @('planSha256', 'backendFingerprint', 'variableFileSha256')) {
    if (-not (Test-Sha256Value (Get-PropertyValue $terraform $field))) { $errors.Add("terraformArtifact.$field is invalid.") }
  }

  $attestation = Get-PropertyValue $Manifest 'secretAttestation'
  if (-not (Test-Sha256Value (Get-PropertyValue $attestation 'contractSha256'))) { $errors.Add('secretAttestation.contractSha256 is invalid.') }
  $secrets = @(Get-PropertyValue $attestation 'secrets')
  if ($secrets.Count -eq 0) { $errors.Add('secretAttestation.secrets must not be empty.') }
  foreach ($secret in $secrets) {
    foreach ($flag in @('exists', 'currentVersionUnique', 'nonempty', 'wiringVerified')) {
      if ((Get-PropertyValue $secret $flag) -ne $true) { $errors.Add("Secret attestation '$flag' must be true.") }
    }
    if ([string]::IsNullOrWhiteSpace((Get-PropertyValue $secret 'versionId'))) { $errors.Add('Secret VersionId is required.') }
  }

  $cost = Get-PropertyValue $Manifest 'costEstimate'
  if ((Get-PropertyValue $cost 'region') -ne 'us-west-2') { $errors.Add('costEstimate.region must be us-west-2.') }
  if ([decimal](Get-PropertyValue $cost 'estimatedMonthlyUsd') -gt 110) { $errors.Add('costEstimate exceeds $110.') }
  if ([decimal](Get-PropertyValue $cost 'targetMonthlyUsd') -ne 110) { $errors.Add('cost target must be $110.') }
  if ([decimal](Get-PropertyValue $cost 'budgetThresholdUsd') -ne 125) { $errors.Add('budget threshold must be $125.') }
  if ([int](Get-PropertyValue $cost 'budgetActionCount') -ne 0) { $errors.Add('Budget actions are prohibited.') }
  if ((Get-PropertyValue $cost 'workloadProfileMatched') -ne $true) { $errors.Add('Cost workload profile must match.') }
  if (@(Get-PropertyValue $cost 'unpricedRecurringResources').Count -ne 0) { $errors.Add('Unpriced recurring resources are prohibited.') }

  $migrations = Get-PropertyValue $Manifest 'migrationSet'
  if ((Get-PropertyValue $migrations 'backwardCompatible') -ne $true) { $errors.Add('Migration set must be backward compatible.') }

  return [pscustomobject]@{ Valid = $errors.Count -eq 0; Errors = $errors.ToArray() }
}

Export-ModuleMember -Function Get-Sha256, Resolve-ReleasePath, Get-BackendFingerprint, Protect-DeploymentText, Test-CleanWorktreeStatus, Test-ProductionToolVersion, Test-ProductionIdentityBinding, Test-ExactProductionConfirmation, Get-ProductionModeCapabilities, Get-ProductionExitCode, Test-ImmutableArtifactBinding, Get-ProductionTarget, Test-ProductionSecretPreflight, Test-ProductionRollbackCheckpoint, Add-ProductionExecutionRecord, New-ProductionRollbackCheckpoint, Invoke-ProductionSmokeContract, Test-ProductionReleaseManifest
