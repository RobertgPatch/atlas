[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$modulePath = Join-Path $PSScriptRoot 'production-plan-policy.psm1'
if (-not (Test-Path -LiteralPath $modulePath -PathType Leaf)) { throw "Missing policy module: $modulePath" }
Import-Module $modulePath -Force

function Assert-True { param([bool] $Condition, [string] $Message); if (-not $Condition) { throw $Message } }
function Format-Findings {
  param([AllowEmptyCollection()] [object[]] $Findings)
  return (@($Findings | ForEach-Object { $_.message }) -join '; ')
}

$fixtureRoot = Join-Path $PSScriptRoot 'fixtures\production-plans'
$sha = 'a' * 64
$sourceCommit = 'b' * 40
$cost = [pscustomobject]@{ region = 'us-west-2'; estimatedMonthlyUsd = 104; targetMonthlyUsd = 110; budgetThresholdUsd = 125; budgetActionCount = 0; workloadProfileMatched = $true; unpricedRecurringResources = @() }
$secrets = [pscustomobject]@{ schemaVersion = '1.0.0'; secrets = @([pscustomobject]@{ key = 'SESSION_SECRET'; consumers = @('api') }) }

$routine = Get-Content (Join-Path $fixtureRoot 'routine-pass.json') -Raw | ConvertFrom-Json
$routineResult = Invoke-ProductionPlanPolicy -Plan $routine -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True $routineResult.Passed ("Routine fixture failed: {0}" -f (Format-Findings $routineResult.Findings))
Assert-True ($routineResult.Result.policyMode -eq 'Routine') 'Routine policy mode was not recorded.'

$bootstrap = Get-Content (Join-Path $fixtureRoot 'bootstrap-pass.json') -Raw | ConvertFrom-Json
$bootstrapResult = Invoke-ProductionPlanPolicy -Plan $bootstrap -PolicyMode Bootstrap -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets -BootstrapEligible
Assert-True $bootstrapResult.Passed ("Bootstrap fixture failed: {0}" -f (Format-Findings $bootstrapResult.Findings))

$replayResult = Invoke-ProductionPlanPolicy -Plan $bootstrap -PolicyMode Bootstrap -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True (-not $replayResult.Passed) 'Bootstrap without explicit eligibility must fail.'

$delete = Get-Content (Join-Path $fixtureRoot 'protected-delete.json') -Raw | ConvertFrom-Json
$deleteResult = Invoke-ProductionPlanPolicy -Plan $delete -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True (-not $deleteResult.Passed) 'Protected deletion must fail.'
$deleteJson = $deleteResult | ConvertTo-Json -Depth 20
Assert-True (-not $deleteJson.Contains('SENTINEL_SECRET_MUST_NOT_LEAK')) 'Policy diagnostics leaked sensitive before values.'
Assert-True ($deleteResult.Result.deletionCount -eq 1) 'Deletion count was not recorded.'

$unknown = $routine | ConvertTo-Json -Depth 100 | ConvertFrom-Json
$unknown.resource_changes[0].change.actions = @('mystery')
$unknownResult = Invoke-ProductionPlanPolicy -Plan $unknown -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True (-not $unknownResult.Passed) 'Unknown action sequence must fail.'

$oldFormat = $routine | ConvertTo-Json -Depth 100 | ConvertFrom-Json
$oldFormat.format_version = '0.2'
$oldFormatResult = Invoke-ProductionPlanPolicy -Plan $oldFormat -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True (-not $oldFormatResult.Passed) 'Unsupported Terraform JSON format must fail.'

$wrongImage = $routine | ConvertTo-Json -Depth 100 | ConvertFrom-Json
$wrongImage.variables.api_image_tag.value = 'c' * 40
$wrongImageResult = Invoke-ProductionPlanPolicy -Plan $wrongImage -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True (-not $wrongImageResult.Passed) 'A plan using an API image tag other than the approved source commit must fail.'

$mfaDisabled = $routine | ConvertTo-Json -Depth 100 | ConvertFrom-Json
$mfaDisabled.variables.mfa_login_enabled.value = $false
$mfaDisabledResult = Invoke-ProductionPlanPolicy -Plan $mfaDisabled -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
Assert-True (-not $mfaDisabledResult.Passed) 'A production plan with login MFA disabled must fail.'

function Copy-RoutinePlan { return ($routine | ConvertTo-Json -Depth 100 | ConvertFrom-Json) }
function Assert-PlanRule {
  param([object] $Plan, [string] $Rule, [string] $Message)
  $result = Invoke-ProductionPlanPolicy -Plan $Plan -PolicyMode Routine -PlanSha256 $sha -SourceCommit $sourceCommit -CostEstimate $cost -SecretContract $secrets
  Assert-True (-not $result.Passed) $Message
  Assert-True (@($result.Findings | Where-Object { $_.rule -eq $Rule }).Count -gt 0) "Expected rule '$Rule' was not reported."
}

$publicDatabase = Copy-RoutinePlan
($publicDatabase.planned_values.root_module.resources | Where-Object type -eq 'aws_db_instance').values.publicly_accessible = $true
Assert-PlanRule $publicDatabase 'database-protection' 'A public database must fail.'

$publicAlb = Copy-RoutinePlan
($publicAlb.planned_values.root_module.resources | Where-Object type -eq 'aws_lb').values.internal = $false
Assert-PlanRule $publicAlb 'alb-protection' 'A public ALB must fail.'

$publicTask = Copy-RoutinePlan
($publicTask.planned_values.root_module.resources | Where-Object type -eq 'aws_ecs_service').values.network_configuration[0].assign_public_ip = $true
Assert-PlanRule $publicTask 'public-api-task' 'A public API task must fail.'

$broadIngress = Copy-RoutinePlan
($broadIngress.planned_values.root_module.resources | Where-Object address -eq 'module.network.aws_security_group.api').values.ingress[0].cidr_blocks = @('0.0.0.0/0')
Assert-PlanRule $broadIngress 'broad-origin-ingress' 'Broad origin ingress must fail.'

$alternateGateway = Copy-RoutinePlan
$alternateGateway.planned_values.root_module.resources += [pscustomobject]@{ address = 'aws_apigatewayv2_api.public'; type = 'aws_apigatewayv2_api'; values = [pscustomobject]@{} }
Assert-PlanRule $alternateGateway 'alternate-public-gateway' 'An alternate public gateway must fail.'

$customOrigin = Copy-RoutinePlan
$apiOrigin = (($customOrigin.planned_values.root_module.resources | Where-Object type -eq 'aws_cloudfront_distribution').values.origin | Where-Object origin_id -match 'api-origin')
$apiOrigin.vpc_origin_config = @()
$apiOrigin.custom_origin_config = @([pscustomobject]@{ origin_protocol_policy = 'https-only' })
Assert-PlanRule $customOrigin 'private-api-origin' 'A custom public API origin must fail.'

$missingWaf = Copy-RoutinePlan
($missingWaf.planned_values.root_module.resources | Where-Object type -eq 'aws_cloudfront_distribution').values.web_acl_id = ''
Assert-PlanRule $missingWaf 'cloudfront-waf' 'A distribution without WAF must fail.'

$internalForwarding = Copy-RoutinePlan
($internalForwarding.planned_values.root_module.resources | Where-Object type -eq 'aws_cloudfront_distribution').values.ordered_cache_behavior += [pscustomobject]@{ path_pattern = '/internal/*'; target_origin_id = 'atlas-api-origin' }
Assert-PlanRule $internalForwarding 'internal-edge-forwarding' 'An internal edge behavior must fail.'

$requestAutoscaling = Copy-RoutinePlan
$requestAutoscaling.planned_values.root_module.resources += [pscustomobject]@{ address = 'module.api.aws_appautoscaling_target.api'; type = 'aws_appautoscaling_target'; values = [pscustomobject]@{ resource_id = 'service/atlas/api' } }
Assert-PlanRule $requestAutoscaling 'request-autoscaling' 'Request-driven API autoscaling must fail.'

$originOutput = Copy-RoutinePlan
$originOutput | Add-Member -NotePropertyName output_changes -NotePropertyValue ([pscustomobject]@{
  api_origin = [pscustomobject]@{ after = 'internal-api.us-west-2.elb.amazonaws.com' }
})
Assert-PlanRule $originOutput 'origin-output' 'A private origin output must fail.'

Write-Output 'PASS production plan policy core fixtures.'
