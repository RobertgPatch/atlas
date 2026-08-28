<#
.SYNOPSIS
Validates saved staging and production Terraform plan JSON without applying it.

.DESCRIPTION
Create saved plans with terraform plan -out, convert each with terraform show
-json, then pass the JSON paths to this script. The script is read-only and
fails closed when a required value is absent or still unknown.

.EXAMPLE
./scripts/security/validate-terraform-guardrails.ps1 `
  -StagingPlanJsonPath ./staging.tfplan.json `
  -ProductionPlanJsonPath ./production.tfplan.json
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string] $StagingPlanJsonPath,

  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string] $ProductionPlanJsonPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Failures = New-Object 'System.Collections.Generic.List[string]'

function Get-PropertyValue {
  param(
    [AllowNull()] [object] $Object,
    [Parameter(Mandatory = $true)] [string] $Name
  )

  if ($null -eq $Object) {
    return $null
  }

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }

  return $property.Value
}

function Get-PlanResources {
  param([AllowNull()] [object] $Module)

  if ($null -eq $Module) {
    return @()
  }

  $resources = @()
  $moduleResources = Get-PropertyValue -Object $Module -Name 'resources'
  if ($null -ne $moduleResources) {
    $resources += @($moduleResources)
  }

  $childModules = Get-PropertyValue -Object $Module -Name 'child_modules'
  if ($null -ne $childModules) {
    foreach ($childModule in @($childModules)) {
      $resources += @(Get-PlanResources -Module $childModule)
    }
  }

  return @($resources)
}

function Get-PlanVariable {
  param(
    [Parameter(Mandatory = $true)] [object] $Plan,
    [Parameter(Mandatory = $true)] [string] $Name
  )

  $variables = Get-PropertyValue -Object $Plan -Name 'variables'
  $entry = Get-PropertyValue -Object $variables -Name $Name
  return Get-PropertyValue -Object $entry -Name 'value'
}

function Get-ResourcesByType {
  param(
    [Parameter(Mandatory = $true)] [object] $Context,
    [Parameter(Mandatory = $true)] [string] $Type
  )

  return @($Context.Resources | Where-Object {
      (Get-PropertyValue -Object $_ -Name 'type') -eq $Type
    })
}

function Add-Failure {
  param(
    [Parameter(Mandatory = $true)] [string] $Environment,
    [Parameter(Mandatory = $true)] [string] $Guardrail,
    [Parameter(Mandatory = $true)] [string] $Message
  )

  $script:Failures.Add("[$Environment][$Guardrail] $Message")
}

function Test-NonEmptyString {
  param([AllowNull()] [object] $Value)

  return $null -ne $Value -and $Value -is [string] -and $Value.Trim().Length -gt 0
}

function Test-BooleanValue {
  param(
    [AllowNull()] [object] $Value,
    [Parameter(Mandatory = $true)] [bool] $Expected
  )

  if ($Value -is [bool]) {
    return $Value -eq $Expected
  }

  if ($Value -is [string]) {
    return $Value.Trim().ToLowerInvariant() -eq $Expected.ToString().ToLowerInvariant()
  }

  return $false
}

function Test-FiniteInteger {
  param(
    [AllowNull()] [object] $Value,
    [long] $Minimum = 0,
    [long] $Maximum = 1000000
  )

  if ($null -eq $Value) {
    return $false
  }

  $parsed = 0L
  if (-not [long]::TryParse($Value.ToString(), [ref] $parsed)) {
    return $false
  }

  return $parsed -ge $Minimum -and $parsed -le $Maximum
}

function Read-PlanContext {
  param(
    [Parameter(Mandatory = $true)] [string] $Environment,
    [Parameter(Mandatory = $true)] [string] $Path
  )

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  try {
    $plan = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
  }
  catch {
    throw "Unable to parse Terraform plan JSON '$resolvedPath': $($_.Exception.Message)"
  }

  $formatVersion = Get-PropertyValue -Object $plan -Name 'format_version'
  if (-not (Test-NonEmptyString -Value $formatVersion) -or $formatVersion -notmatch '^1\.') {
    throw "Terraform plan '$resolvedPath' uses unsupported or missing format_version '$formatVersion'."
  }

  if (Test-BooleanValue -Value (Get-PropertyValue -Object $plan -Name 'errored') -Expected $true) {
    throw "Terraform plan '$resolvedPath' is marked errored."
  }

  $plannedValues = Get-PropertyValue -Object $plan -Name 'planned_values'
  $rootModule = Get-PropertyValue -Object $plannedValues -Name 'root_module'
  if ($null -eq $rootModule) {
    throw "Terraform plan '$resolvedPath' does not contain planned_values.root_module."
  }

  $declaredEnvironment = Get-PlanVariable -Plan $plan -Name 'environment_name'
  if ($declaredEnvironment -ne $Environment) {
    throw "Terraform plan '$resolvedPath' declares environment_name '$declaredEnvironment'; expected '$Environment'."
  }

  return [pscustomobject]@{
    Environment = $Environment
    Path        = $resolvedPath
    Plan        = $plan
    Resources   = @(Get-PlanResources -Module $rootModule)
    Outputs     = Get-PropertyValue -Object $plannedValues -Name 'outputs'
  }
}

function Assert-OriginRestriction {
  param([Parameter(Mandatory = $true)] [object] $Context)

  $environment = $Context.Environment
  $loadBalancers = @(Get-ResourcesByType -Context $Context -Type 'aws_lb')
  if ($loadBalancers.Count -eq 0) {
    Add-Failure $environment 'origin restriction' 'No API load balancer is present.'
  }
  foreach ($loadBalancer in $loadBalancers) {
    $values = Get-PropertyValue -Object $loadBalancer -Name 'values'
    if (-not (Test-BooleanValue -Value (Get-PropertyValue -Object $values -Name 'internal') -Expected $true)) {
      Add-Failure $environment 'origin restriction' "Load balancer '$((Get-PropertyValue -Object $loadBalancer -Name 'address'))' is not internal."
    }
  }

  $vpcOrigins = @(Get-ResourcesByType -Context $Context -Type 'aws_cloudfront_vpc_origin')
  if ($vpcOrigins.Count -eq 0) {
    Add-Failure $environment 'origin restriction' 'No CloudFront VPC origin is present for the API.'
  }

  $distributions = @(Get-ResourcesByType -Context $Context -Type 'aws_cloudfront_distribution')
  if ($distributions.Count -eq 0) {
    Add-Failure $environment 'origin restriction' 'No CloudFront distribution is present.'
  }
  foreach ($distribution in $distributions) {
    $values = Get-PropertyValue -Object $distribution -Name 'values'
    if (-not (Test-NonEmptyString -Value (Get-PropertyValue -Object $values -Name 'web_acl_id'))) {
      Add-Failure $environment 'origin restriction' "CloudFront distribution '$((Get-PropertyValue -Object $distribution -Name 'address'))' has no WAF web ACL."
    }

    $apiVpcOriginFound = $false
    foreach ($origin in @((Get-PropertyValue -Object $values -Name 'origin'))) {
      $vpcOriginConfig = @(Get-PropertyValue -Object $origin -Name 'vpc_origin_config')
      if ($vpcOriginConfig.Count -gt 0) {
        $apiVpcOriginFound = $true
      }
    }
    if (-not $apiVpcOriginFound) {
      Add-Failure $environment 'origin restriction' "CloudFront distribution '$((Get-PropertyValue -Object $distribution -Name 'address'))' has no VPC-backed API origin."
    }
  }

  $albSecurityGroups = @(Get-ResourcesByType -Context $Context -Type 'aws_security_group' | Where-Object {
      (Get-PropertyValue -Object $_ -Name 'address') -match '(\.|\[)alb(\.|\[|$)'
    })
  if ($albSecurityGroups.Count -eq 0) {
    Add-Failure $environment 'origin restriction' 'The ALB security group is missing from planned values.'
  }
  foreach ($securityGroup in $albSecurityGroups) {
    $ingressBlocks = @(Get-PropertyValue -Object (Get-PropertyValue -Object $securityGroup -Name 'values') -Name 'ingress')
    if ($ingressBlocks.Count -eq 0) {
      Add-Failure $environment 'origin restriction' 'The ALB security group has no CloudFront ingress rule.'
      continue
    }
    foreach ($ingress in $ingressBlocks) {
      $ipv4Cidrs = @(Get-PropertyValue -Object $ingress -Name 'cidr_blocks')
      $ipv6Cidrs = @(Get-PropertyValue -Object $ingress -Name 'ipv6_cidr_blocks')
      if ($ipv4Cidrs -contains '0.0.0.0/0' -or $ipv6Cidrs -contains '::/0') {
        Add-Failure $environment 'origin restriction' 'The ALB security group permits public listener ingress.'
      }
      if (@(Get-PropertyValue -Object $ingress -Name 'prefix_list_ids').Count -eq 0) {
        Add-Failure $environment 'origin restriction' 'The ALB listener ingress is not restricted to an AWS managed prefix list.'
      }
    }
  }

  if ($null -ne $Context.Outputs) {
    foreach ($outputProperty in $Context.Outputs.PSObject.Properties) {
      if ($outputProperty.Name -match '(?i)(load_balancer|alb|api_origin).*(dns|domain|url)|(dns|domain|url).*(load_balancer|alb|api_origin)') {
        Add-Failure $environment 'origin restriction' "Direct origin output '$($outputProperty.Name)' must not be exposed."
      }
    }
  }
}

function Get-WafRuleAction {
  param([Parameter(Mandatory = $true)] [object] $Rule)

  $actionBlocks = @(Get-PropertyValue -Object $Rule -Name 'action')
  if ($actionBlocks.Count -eq 0) {
    return ''
  }

  foreach ($actionName in @('block', 'count', 'allow', 'captcha', 'challenge')) {
    if (@(Get-PropertyValue -Object $actionBlocks[0] -Name $actionName).Count -gt 0) {
      return $actionName
    }
  }

  return ''
}

function Get-WafRateStatement {
  param([Parameter(Mandatory = $true)] [object] $Rule)

  $statements = @(Get-PropertyValue -Object $Rule -Name 'statement')
  if ($statements.Count -eq 0) {
    return $null
  }
  $rateStatements = @(Get-PropertyValue -Object $statements[0] -Name 'rate_based_statement')
  if ($rateStatements.Count -eq 0) {
    return $null
  }
  return $rateStatements[0]
}

function Assert-Waf {
  param([Parameter(Mandatory = $true)] [object] $Context)

  $environment = $Context.Environment
  $requiredManagedRules = @(
    'AWSManagedRulesCommonRuleSet',
    'AWSManagedRulesKnownBadInputsRuleSet',
    'AWSManagedRulesAmazonIpReputationList',
    'AWSManagedRulesAnonymousIpList'
  )
  $requiredRateRules = [ordered]@{
    api_general_per_ip               = 'IP'
    auth_per_ip                      = 'IP'
    paid_admission_per_ip            = 'IP'
    paid_admission_global_emergency  = 'CONSTANT'
  }
  $requiredRules = @($requiredManagedRules) + @($requiredRateRules.Keys)

  $webAcls = @(Get-ResourcesByType -Context $Context -Type 'aws_wafv2_web_acl')
  if ($webAcls.Count -ne 1) {
    Add-Failure $environment 'WAF parity' "Expected exactly one WAF web ACL; found $($webAcls.Count)."
    return @()
  }

  $values = Get-PropertyValue -Object $webAcls[0] -Name 'values'
  if ((Get-PropertyValue -Object $values -Name 'scope') -ne 'CLOUDFRONT') {
    Add-Failure $environment 'WAF parity' 'The WAF web ACL is not CloudFront-scoped.'
  }

  $rules = @(Get-PropertyValue -Object $values -Name 'rule')
  $ruleNames = @($rules | ForEach-Object { Get-PropertyValue -Object $_ -Name 'name' } | Sort-Object -Unique)
  foreach ($requiredRule in $requiredRules) {
    if ($ruleNames -notcontains $requiredRule) {
      Add-Failure $environment 'WAF parity' "Required WAF rule '$requiredRule' is missing."
    }
  }

  foreach ($ruleName in $requiredRateRules.Keys) {
    $rule = @($rules | Where-Object { (Get-PropertyValue -Object $_ -Name 'name') -eq $ruleName }) | Select-Object -First 1
    if ($null -eq $rule) {
      continue
    }

    $action = Get-WafRuleAction -Rule $rule
    if ($environment -eq 'production' -and $action -ne 'block') {
      Add-Failure $environment 'WAF parity' "Rate rule '$ruleName' must use block in production; found '$action'."
    }
    elseif ($environment -eq 'staging' -and $action -notin @('count', 'block')) {
      Add-Failure $environment 'WAF parity' "Rate rule '$ruleName' must use count or block in staging; found '$action'."
    }

    $rateStatement = Get-WafRateStatement -Rule $rule
    if ($null -eq $rateStatement) {
      Add-Failure $environment 'WAF parity' "Rate rule '$ruleName' has no rate_based_statement."
      continue
    }
    if (-not (Test-FiniteInteger -Value (Get-PropertyValue -Object $rateStatement -Name 'limit') -Minimum 1 -Maximum 1000000)) {
      Add-Failure $environment 'WAF parity' "Rate rule '$ruleName' has no finite positive request limit."
    }
    $aggregateKeyType = Get-PropertyValue -Object $rateStatement -Name 'aggregate_key_type'
    if ($aggregateKeyType -ne $requiredRateRules[$ruleName]) {
      Add-Failure $environment 'WAF parity' "Rate rule '$ruleName' must aggregate by '$($requiredRateRules[$ruleName])'; found '$aggregateKeyType'."
    }
  }

  return @($ruleNames)
}

function Assert-WafParity {
  param(
    [Parameter(Mandatory = $true)] [object] $StagingContext,
    [Parameter(Mandatory = $true)] [object] $ProductionContext,
    [Parameter(Mandatory = $true)] [string[]] $StagingRuleNames,
    [Parameter(Mandatory = $true)] [string[]] $ProductionRuleNames
  )

  $stagingSignature = (@($StagingRuleNames | Sort-Object -Unique) -join '|')
  $productionSignature = (@($ProductionRuleNames | Sort-Object -Unique) -join '|')
  if ($stagingSignature -ne $productionSignature) {
    Add-Failure 'staging/production' 'WAF parity' 'The staging and production WAF rule sets differ.'
  }
}

function Assert-Subscribers {
  param([Parameter(Mandatory = $true)] [object] $Context)

  $environment = $Context.Environment
  foreach ($pair in @(
      @{ Email = 'alarm_email'; Confirmed = 'alarm_destination_confirmed'; Label = 'alarm' },
      @{ Email = 'budget_alert_email'; Confirmed = 'budget_destination_confirmed'; Label = 'budget' }
    )) {
    $email = Get-PlanVariable -Plan $Context.Plan -Name $pair.Email
    $confirmed = Get-PlanVariable -Plan $Context.Plan -Name $pair.Confirmed
    if (-not (Test-NonEmptyString -Value $email) -or $email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
      Add-Failure $environment 'non-null subscribers' "The $($pair.Label) subscriber is null, blank, or invalid."
    }
    if (-not (Test-BooleanValue -Value $confirmed -Expected $true)) {
      Add-Failure $environment 'non-null subscribers' "The $($pair.Label) destination is not explicitly confirmed."
    }
  }

  $subscriptions = @(Get-ResourcesByType -Context $Context -Type 'aws_sns_topic_subscription')
  $emailSubscriptions = @($subscriptions | Where-Object {
      $values = Get-PropertyValue -Object $_ -Name 'values'
      (Get-PropertyValue -Object $values -Name 'protocol') -eq 'email' -and
      (Test-NonEmptyString -Value (Get-PropertyValue -Object $values -Name 'endpoint'))
    })
  if ($emailSubscriptions.Count -eq 0) {
    Add-Failure $environment 'non-null subscribers' 'No concrete SNS email alarm subscription is planned.'
  }

  $budgets = @(Get-ResourcesByType -Context $Context -Type 'aws_budgets_budget')
  if ($budgets.Count -lt 2) {
    Add-Failure $environment 'non-null subscribers' "Expected total and Bedrock budgets; found $($budgets.Count)."
  }
  foreach ($budget in $budgets) {
    $notifications = @(Get-PropertyValue -Object (Get-PropertyValue -Object $budget -Name 'values') -Name 'notification')
    $address = Get-PropertyValue -Object $budget -Name 'address'
    if ($notifications.Count -eq 0) {
      Add-Failure $environment 'non-null subscribers' "Budget '$address' has no notification subscriber."
      continue
    }
    foreach ($notification in $notifications) {
      $emails = @(Get-PropertyValue -Object $notification -Name 'subscriber_email_addresses')
      if ($emails.Count -eq 0 -or -not (Test-NonEmptyString -Value $emails[0])) {
        Add-Failure $environment 'non-null subscribers' "Budget '$address' contains an empty notification subscriber."
      }
    }
  }

  $anomalySubscriptions = @(Get-ResourcesByType -Context $Context -Type 'aws_ce_anomaly_subscription')
  if ($anomalySubscriptions.Count -eq 0) {
    Add-Failure $environment 'non-null subscribers' 'No Cost Anomaly Detection subscription is planned.'
  }
}

function Assert-FiniteEcsScaling {
  param([Parameter(Mandatory = $true)] [object] $Context)

  $environment = $Context.Environment
  $services = @(Get-ResourcesByType -Context $Context -Type 'aws_ecs_service')
  if ($services.Count -lt 2) {
    Add-Failure $environment 'finite ECS scaling' "Expected API and K-1 worker ECS services; found $($services.Count)."
  }
  foreach ($service in $services) {
    $address = Get-PropertyValue -Object $service -Name 'address'
    $desiredCount = Get-PropertyValue -Object (Get-PropertyValue -Object $service -Name 'values') -Name 'desired_count'
    $hasFiniteDesiredCount = Test-FiniteInteger -Value $desiredCount -Minimum 0 -Maximum 100
    if (-not $hasFiniteDesiredCount) {
      Add-Failure $environment 'finite ECS scaling' "ECS service '$address' desired_count must be a fixed integer from 0 through 100."
    }
    if ($hasFiniteDesiredCount -and $environment -eq 'production' -and $address -match 'module\.api\.aws_ecs_service\.api' -and [long] $desiredCount -lt 1) {
      Add-Failure $environment 'finite ECS scaling' 'The production API ECS service must have desired_count of at least 1.'
    }
  }

  $autoscalingResources = @($Context.Resources | Where-Object {
      (Get-PropertyValue -Object $_ -Name 'type') -in @('aws_appautoscaling_target', 'aws_appautoscaling_policy')
    })
  if ($autoscalingResources.Count -gt 0) {
    Add-Failure $environment 'finite ECS scaling' 'Application Auto Scaling resources are present; request-driven ECS scaling must remain absent.'
  }

  foreach ($variableName in @('api_desired_count', 'k1_worker_desired_count', 'k1_worker_concurrency')) {
    if (-not (Test-FiniteInteger -Value (Get-PlanVariable -Plan $Context.Plan -Name $variableName) -Minimum 0 -Maximum 100)) {
      Add-Failure $environment 'finite ECS scaling' "Terraform variable '$variableName' must be an explicit integer from 0 through 100."
    }
  }
}

function Get-LifecycleRuleById {
  param(
    [Parameter(Mandatory = $true)] [object[]] $Rules,
    [Parameter(Mandatory = $true)] [string] $Id
  )

  return @($Rules | Where-Object { (Get-PropertyValue -Object $_ -Name 'id') -eq $Id }) | Select-Object -First 1
}

function Get-FirstNestedValue {
  param(
    [Parameter(Mandatory = $true)] [object] $Object,
    [Parameter(Mandatory = $true)] [string] $BlockName,
    [Parameter(Mandatory = $true)] [string] $ValueName
  )

  $blocks = @(Get-PropertyValue -Object $Object -Name $BlockName)
  if ($blocks.Count -eq 0) {
    return $null
  }
  return Get-PropertyValue -Object $blocks[0] -Name $ValueName
}

function Assert-K1Lifecycle {
  param([Parameter(Mandatory = $true)] [object] $Context)

  $environment = $Context.Environment
  $lifecycleResources = @(Get-ResourcesByType -Context $Context -Type 'aws_s3_bucket_lifecycle_configuration' | Where-Object {
      (Get-PropertyValue -Object $_ -Name 'address') -match 'k1_ingestion.*documents'
    })
  if ($lifecycleResources.Count -ne 1) {
    Add-Failure $environment 'K-1 lifecycle' "Expected one K-1 document lifecycle configuration; found $($lifecycleResources.Count)."
    return
  }

  $rules = @(Get-PropertyValue -Object (Get-PropertyValue -Object $lifecycleResources[0] -Name 'values') -Name 'rule')
  $quarantineRule = Get-LifecycleRuleById -Rules $rules -Id 'expire-unaccepted-quarantine'
  $acceptedRule = Get-LifecycleRuleById -Rules $rules -Id 'retain-accepted-k1-evidence'
  $resultsRule = Get-LifecycleRuleById -Rules $rules -Id 'retain-k1-extraction-results'

  foreach ($entry in @(
      @{ Rule = $quarantineRule; Id = 'expire-unaccepted-quarantine' },
      @{ Rule = $acceptedRule; Id = 'retain-accepted-k1-evidence' },
      @{ Rule = $resultsRule; Id = 'retain-k1-extraction-results' }
    )) {
    if ($null -eq $entry.Rule) {
      Add-Failure $environment 'K-1 lifecycle' "Lifecycle rule '$($entry.Id)' is missing."
    }
    elseif ((Get-PropertyValue -Object $entry.Rule -Name 'status') -ne 'Enabled') {
      Add-Failure $environment 'K-1 lifecycle' "Lifecycle rule '$($entry.Id)' is not enabled."
    }
  }

  if ($null -ne $quarantineRule) {
    $quarantineDays = Get-FirstNestedValue -Object $quarantineRule -BlockName 'expiration' -ValueName 'days'
    $quarantineNoncurrentDays = Get-FirstNestedValue -Object $quarantineRule -BlockName 'noncurrent_version_expiration' -ValueName 'noncurrent_days'
    if (-not (Test-FiniteInteger -Value $quarantineDays -Minimum 1 -Maximum 7)) {
      Add-Failure $environment 'K-1 lifecycle' 'Unaccepted quarantine objects must expire within seven days.'
    }
    if (-not (Test-FiniteInteger -Value $quarantineNoncurrentDays -Minimum 1 -Maximum 7)) {
      Add-Failure $environment 'K-1 lifecycle' 'Noncurrent quarantine objects must expire within seven days.'
    }
  }

  $retentionDays = Get-PlanVariable -Plan $Context.Plan -Name 'k1_document_retention_days'
  $noncurrentRetentionDays = Get-PlanVariable -Plan $Context.Plan -Name 'k1_noncurrent_retention_days'
  if (-not (Test-FiniteInteger -Value $retentionDays -Minimum 8 -Maximum 3650)) {
    Add-Failure $environment 'K-1 lifecycle' 'k1_document_retention_days must be finite and longer than quarantine retention.'
  }
  if (-not (Test-FiniteInteger -Value $noncurrentRetentionDays -Minimum 1 -Maximum 3650)) {
    Add-Failure $environment 'K-1 lifecycle' 'k1_noncurrent_retention_days must be finite and positive.'
  }

  foreach ($retainedRule in @($acceptedRule, $resultsRule)) {
    if ($null -eq $retainedRule) {
      continue
    }
    $days = Get-FirstNestedValue -Object $retainedRule -BlockName 'expiration' -ValueName 'days'
    $noncurrentDays = Get-FirstNestedValue -Object $retainedRule -BlockName 'noncurrent_version_expiration' -ValueName 'noncurrent_days'
    if ($days -ne $retentionDays) {
      Add-Failure $environment 'K-1 lifecycle' "Lifecycle rule '$((Get-PropertyValue -Object $retainedRule -Name 'id'))' does not use k1_document_retention_days."
    }
    if ($noncurrentDays -ne $noncurrentRetentionDays) {
      Add-Failure $environment 'K-1 lifecycle' "Lifecycle rule '$((Get-PropertyValue -Object $retainedRule -Name 'id'))' does not use k1_noncurrent_retention_days."
    }
  }

  $documentBuckets = @(Get-ResourcesByType -Context $Context -Type 'aws_s3_bucket' | Where-Object {
      (Get-PropertyValue -Object $_ -Name 'address') -match 'k1_ingestion.*documents'
    })
  foreach ($bucket in $documentBuckets) {
    if (-not (Test-BooleanValue -Value (Get-PropertyValue -Object (Get-PropertyValue -Object $bucket -Name 'values') -Name 'force_destroy') -Expected $false)) {
      Add-Failure $environment 'K-1 lifecycle' 'The K-1 documents bucket must not use force_destroy.'
    }
  }
}

function Convert-ContainerDefinitions {
  param(
    [Parameter(Mandatory = $true)] [object] $TaskDefinition,
    [Parameter(Mandatory = $true)] [string] $Environment
  )

  $address = Get-PropertyValue -Object $TaskDefinition -Name 'address'
  $encoded = Get-PropertyValue -Object (Get-PropertyValue -Object $TaskDefinition -Name 'values') -Name 'container_definitions'
  if (-not (Test-NonEmptyString -Value $encoded)) {
    Add-Failure $Environment 'runtime setting wiring' "ECS task definition '$address' has unknown or empty container_definitions."
    return @()
  }
  try {
    return @(ConvertFrom-Json -InputObject $encoded)
  }
  catch {
    Add-Failure $Environment 'runtime setting wiring' "ECS task definition '$address' has invalid container_definitions JSON."
    return @()
  }
}

function Convert-NameValueListToMap {
  param([AllowNull()] [object] $Entries)

  $map = @{}
  foreach ($entry in @($Entries)) {
    $name = Get-PropertyValue -Object $entry -Name 'name'
    if (Test-NonEmptyString -Value $name) {
      $map[$name] = Get-PropertyValue -Object $entry -Name 'value'
    }
  }
  return $map
}

function Assert-RuntimeSettings {
  param([Parameter(Mandatory = $true)] [object] $Context)

  $environment = $Context.Environment
  $taskDefinitions = @(Get-ResourcesByType -Context $Context -Type 'aws_ecs_task_definition')
  $apiTaskDefinitions = @($taskDefinitions | Where-Object {
      (Get-PropertyValue -Object $_ -Name 'address') -match 'module\.api\.aws_ecs_task_definition\.api'
    })
  if ($apiTaskDefinitions.Count -ne 1) {
    Add-Failure $environment 'runtime setting wiring' "Expected one API ECS task definition; found $($apiTaskDefinitions.Count)."
    return
  }

  $containers = @(Convert-ContainerDefinitions -TaskDefinition $apiTaskDefinitions[0] -Environment $environment)
  if ($containers.Count -eq 0) {
    return
  }

  $environmentMap = Convert-NameValueListToMap -Entries (Get-PropertyValue -Object $containers[0] -Name 'environment')
  $secretMap = Convert-NameValueListToMap -Entries (Get-PropertyValue -Object $containers[0] -Name 'secrets')

  $requiredExactSettings = [ordered]@{
    NODE_ENV                    = 'production'
    REQUIRE_DURABLE_PERSISTENCE = 'true'
    SESSION_COOKIE_SECURE       = 'true'
    RATE_LIMIT_ENABLED          = 'true'
    API_SHARED_CACHE_POLICY     = 'no_shared_cache'
  }
  foreach ($settingName in $requiredExactSettings.Keys) {
    $settingValue = if ($environmentMap.ContainsKey($settingName)) { $environmentMap[$settingName] } else { $null }
    if (-not (Test-NonEmptyString -Value $settingValue) -or $settingValue.ToLowerInvariant() -ne $requiredExactSettings[$settingName]) {
      Add-Failure $environment 'runtime setting wiring' "Runtime setting '$settingName' is missing or is not '$($requiredExactSettings[$settingName])'."
    }
  }

  if (-not $environmentMap.ContainsKey('WEB_ORIGIN') -or -not (Test-NonEmptyString -Value $environmentMap['WEB_ORIGIN']) -or $environmentMap['WEB_ORIGIN'] -notmatch '^https://') {
    Add-Failure $environment 'runtime setting wiring' 'WEB_ORIGIN must be an explicit HTTPS origin.'
  }
  $sameSiteValue = if ($environmentMap.ContainsKey('SESSION_COOKIE_SAMESITE')) { $environmentMap['SESSION_COOKIE_SAMESITE'] } else { $null }
  if (-not (Test-NonEmptyString -Value $sameSiteValue) -or $sameSiteValue.ToLowerInvariant() -notin @('lax', 'strict')) {
    Add-Failure $environment 'runtime setting wiring' 'SESSION_COOKIE_SAMESITE must be lax or strict.'
  }
  $marketRefreshOnRead = if ($environmentMap.ContainsKey('MARKET_DATA_REFRESH_ON_READ')) { $environmentMap['MARKET_DATA_REFRESH_ON_READ'] } else { $null }
  if (-not (Test-NonEmptyString -Value $marketRefreshOnRead) -or $marketRefreshOnRead.ToLowerInvariant() -notin @('true', 'false')) {
    Add-Failure $environment 'runtime setting wiring' 'MARKET_DATA_REFRESH_ON_READ must be explicitly wired as true or false.'
  }
  elseif ($environment -eq 'production' -and $marketRefreshOnRead.ToLowerInvariant() -ne 'false') {
    Add-Failure $environment 'runtime setting wiring' 'MARKET_DATA_REFRESH_ON_READ must be false in production.'
  }

  foreach ($switchName in @(
      'K1_UPLOADS_ENABLED',
      'K1_EXTRACTION_ENABLED',
      'K1_BEDROCK_CHECKBOX_ENABLED',
      'PLAID_REFRESH_ENABLED',
      'MARKET_DATA_REFRESH_ENABLED',
      'REPORT_EXPORTS_ENABLED',
      'BACKFILLS_ENABLED'
    )) {
    $switchValue = if ($environmentMap.ContainsKey($switchName)) { $environmentMap[$switchName] } else { $null }
    if (-not (Test-NonEmptyString -Value $switchValue) -or $switchValue.ToLowerInvariant() -notin @('true', 'false')) {
      Add-Failure $environment 'runtime setting wiring' "Hard workload switch '$switchName' is not explicitly wired."
    }
  }

  $finiteRuntimeSettings = @(
    'ABUSE_AUTH_SOURCE_REQUESTS',
    'ABUSE_AUTH_ACCOUNT_REQUESTS',
    'ABUSE_AUTH_HASH_GLOBAL_CONCURRENCY',
    'ABUSE_K1_GLOBAL_FILES_PER_DAY',
    'ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT',
    'ABUSE_K1_EXTRACTION_GLOBAL_BACKLOG',
    'ABUSE_K1_CHECKBOX_CALLS_GLOBAL_PER_DAY',
    'ABUSE_PLAID_REFRESHES_GLOBAL_PER_DAY',
    'ABUSE_MARKET_PROVIDER_CALLS_GLOBAL_PER_DAY',
    'ABUSE_PROVIDER_GLOBAL_CONCURRENCY',
    'ABUSE_EXPORT_GLOBAL_PER_DAY',
    'ABUSE_EXPORT_GLOBAL_CONCURRENCY',
    'ABUSE_BACKFILL_GLOBAL_RUNS_PER_DAY',
    'ABUSE_BACKFILL_GLOBAL_CONCURRENCY',
    'ABUSE_SCHEDULER_GLOBAL_CONCURRENCY',
    'ABUSE_BDA_MAX_ATTEMPTS',
    'ABUSE_BEDROCK_MAX_ATTEMPTS',
    'ABUSE_PLAID_MAX_ATTEMPTS',
    'ABUSE_MARKET_DATA_MAX_ATTEMPTS',
    'ABUSE_BDA_TIMEOUT_MS',
    'ABUSE_BEDROCK_TIMEOUT_MS',
    'ABUSE_PLAID_TIMEOUT_MS',
    'ABUSE_MARKET_DATA_TIMEOUT_MS'
  )
  foreach ($settingName in $finiteRuntimeSettings) {
    if (-not $environmentMap.ContainsKey($settingName) -or -not (Test-FiniteInteger -Value $environmentMap[$settingName] -Minimum 1 -Maximum 2147483647)) {
      Add-Failure $environment 'runtime setting wiring' "Cost-control setting '$settingName' is missing or not a finite positive integer."
    }
  }

  foreach ($secretName in @('DATABASE_URL', 'PERSISTENCE_SECRET_KEY', 'SESSION_SECRET', 'ABUSE_HMAC_ACTIVE_KEY')) {
    if (-not $secretMap.ContainsKey($secretName) -or -not (Test-NonEmptyString -Value $secretMap[$secretName])) {
      Add-Failure $environment 'runtime setting wiring' "Runtime secret '$secretName' is not wired through the ECS secrets block."
    }
  }
}

$staging = Read-PlanContext -Environment 'staging' -Path $StagingPlanJsonPath
$production = Read-PlanContext -Environment 'production' -Path $ProductionPlanJsonPath

foreach ($context in @($staging, $production)) {
  Assert-OriginRestriction -Context $context
}

$stagingWafRules = @(Assert-Waf -Context $staging)
$productionWafRules = @(Assert-Waf -Context $production)
Assert-WafParity -StagingContext $staging -ProductionContext $production -StagingRuleNames $stagingWafRules -ProductionRuleNames $productionWafRules

foreach ($context in @($staging, $production)) {
  Assert-Subscribers -Context $context
  Assert-FiniteEcsScaling -Context $context
  Assert-K1Lifecycle -Context $context
  Assert-RuntimeSettings -Context $context
}

if ($script:Failures.Count -gt 0) {
  foreach ($failure in $script:Failures) {
    Write-Output "FAIL $failure"
  }
  throw "Terraform guardrail validation failed with $($script:Failures.Count) violation(s)."
}

Write-Output 'PASS [staging/production] Terraform plan guardrails validated: origin restriction, WAF parity, non-null subscribers, finite ECS scaling, K-1 lifecycle, and runtime setting wiring.'
