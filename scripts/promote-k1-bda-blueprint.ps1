[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $BlueprintArn,
  [Parameter(Mandatory = $true)] [string] $FallbackBlueprintArn,
  [Parameter(Mandatory = $true)] [string] $ProjectArn,
  [Parameter(Mandatory = $true)] [string] $EvaluationReportPath,
  [string] $Region = 'us-west-2',
  [double] $MinimumExactMatch = 0.95,
  [switch] $ApprovePromotion
)

$ErrorActionPreference = 'Stop'

if (-not $ApprovePromotion) {
  throw 'Promotion is gated. Re-run with -ApprovePromotion after an approved sanitized evaluation.'
}

$reportFile = Resolve-Path -LiteralPath $EvaluationReportPath
$report = Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json

$required = @('sourceFieldAccounting', 'normalizedExactMatch', 'falseSafeMismatches', 'unknownRevisionReviewRate')
foreach ($property in $required) {
  if ($null -eq $report.$property) { throw "Evaluation report is missing $property." }
}
if ([double]$report.sourceFieldAccounting -ne 1.0) { throw 'Source-field accounting must equal 100%.' }
if ([double]$report.normalizedExactMatch -lt $MinimumExactMatch) { throw 'Normalized exact match is below the release threshold.' }
if ([int]$report.falseSafeMismatches -ne 0) { throw 'False-safe mismatches must equal zero.' }
if ([double]$report.unknownRevisionReviewRate -ne 1.0) { throw 'Unknown forms and revisions must route to review 100% of the time.' }
if ($report.containsProductionData -eq $true) { throw 'A production-data evaluation report cannot be used by this promotion script.' }

function New-ImmutableBlueprintVersion([string] $Arn) {
  $tokenSeed = [System.Text.Encoding]::UTF8.GetBytes("$Arn|$($report.mappingSchemaVersion)|$($report.evaluatedAt)")
  $hash = [System.Security.Cryptography.SHA256]::HashData($tokenSeed)
  $token = 'k1' + [Convert]::ToHexString($hash).ToLowerInvariant()
  $version = aws bedrock-data-automation create-blueprint-version `
    --region $Region `
    --blueprint-arn $Arn `
    --client-token $token `
    --query 'blueprint.blueprintVersion' `
    --output text
  if ($LASTEXITCODE -ne 0 -or -not $version) { throw "Could not create an immutable version for $Arn." }
  aws bedrock-data-automation update-blueprint `
    --region $Region `
    --blueprint-arn $Arn `
    --blueprint-stage LIVE | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not promote $Arn to LIVE." }
  return $version.Trim()
}

$blueprintVersion = New-ImmutableBlueprintVersion $BlueprintArn
$fallbackVersion = New-ImmutableBlueprintVersion $FallbackBlueprintArn

$standardOutput = @{
  document = @{
    extraction = @{
      granularity = @{ types = @('DOCUMENT') }
      boundingBox = @{ state = 'ENABLED' }
    }
    generativeField = @{ state = 'DISABLED' }
    outputFormat = @{
      textFormat = @{ types = @('PLAIN_TEXT') }
      additionalFileFormat = @{ state = 'DISABLED' }
    }
  }
} | ConvertTo-Json -Depth 12 -Compress
$customOutput = @{
  blueprints = @(@{
    blueprintArn = $BlueprintArn
    blueprintVersion = $blueprintVersion
    blueprintStage = 'LIVE'
  })
  document = @{
    fallbackBlueprints = @(@{
      blueprintArn = $FallbackBlueprintArn
      blueprintVersion = $fallbackVersion
      blueprintStage = 'LIVE'
    })
  }
} | ConvertTo-Json -Depth 12 -Compress

aws bedrock-data-automation update-data-automation-project `
  --region $Region `
  --project-arn $ProjectArn `
  --project-stage LIVE `
  --standard-output-configuration $standardOutput `
  --custom-output-configuration $customOutput | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not promote the BDA project to LIVE.' }

[pscustomobject]@{
  blueprintArn = $BlueprintArn
  blueprintVersion = $blueprintVersion
  fallbackBlueprintArn = $FallbackBlueprintArn
  fallbackBlueprintVersion = $fallbackVersion
  projectArn = $ProjectArn
  projectStage = 'LIVE'
  mappingSchemaVersion = $report.mappingSchemaVersion
  evaluatedAt = $report.evaluatedAt
} | ConvertTo-Json -Depth 4
