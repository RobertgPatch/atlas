Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PolicyProperty {
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

function Get-PlanVariableValue {
  param([object] $Plan, [string] $Name)
  $variables = Get-PolicyProperty $Plan 'variables'
  return Get-PolicyProperty (Get-PolicyProperty $variables $Name) 'value'
}

function Get-PlanResourcesRecursive {
  param([AllowNull()] [object] $Module)
  if ($null -eq $Module) { return @() }
  $result = @()
  $resources = Get-PolicyProperty $Module 'resources'
  if ($null -ne $resources) { $result += @($resources) }
  $children = Get-PolicyProperty $Module 'child_modules'
  foreach ($child in @($children)) { $result += @(Get-PlanResourcesRecursive $child) }
  return @($result)
}

function Get-ResourcesByType {
  param([object[]] $Resources, [string] $Type)
  return @($Resources | Where-Object { (Get-PolicyProperty $_ 'type') -eq $Type })
}

function Get-ResourceValues {
  param([object] $Resource)
  return Get-PolicyProperty $Resource 'values'
}

function Test-PolicyBoolean {
  param([AllowNull()] [object] $Value, [bool] $Expected)
  if ($Value -is [bool]) { return $Value -eq $Expected }
  if ($Value -is [string]) { return $Value.ToLowerInvariant() -eq $Expected.ToString().ToLowerInvariant() }
  return $false
}

function Invoke-ProductionPlanPolicy {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)] [object] $Plan,
    [Parameter(Mandatory = $true)] [ValidateSet('Routine', 'Bootstrap')] [string] $PolicyMode,
    [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{64}$')] [string] $PlanSha256,
    [Parameter(Mandatory = $true)] [ValidatePattern('^[a-f0-9]{40}$')] [string] $SourceCommit,
    [Parameter(Mandatory = $true)] [object] $CostEstimate,
    [Parameter(Mandatory = $true)] [object] $SecretContract,
    [switch] $BootstrapEligible
  )
  $findings = New-Object 'System.Collections.Generic.List[object]'
  $deletionCount = 0
  $replacementCount = 0
  function Add-Finding([string] $Rule, [string] $Message, [string] $Address = '') {
    $findings.Add([pscustomobject]@{ rule = $Rule; address = $Address; message = $Message })
  }

  $formatVersion = Get-PolicyProperty $Plan 'format_version'
  if ($formatVersion -notmatch '^1\.') { Add-Finding 'terraform-format' 'Unsupported or missing Terraform JSON format version.' }
  if (Test-PolicyBoolean (Get-PolicyProperty $Plan 'errored') $true) { Add-Finding 'errored-plan' 'Terraform marked the plan errored.' }
  if ((Get-PlanVariableValue $Plan 'environment_name') -ne 'production') { Add-Finding 'environment' 'environment_name must be production.' }
  if ((Get-PlanVariableValue $Plan 'environment_cost_profile') -ne 'production') { Add-Finding 'cost-profile' 'environment_cost_profile must be production.' }
  if ((Get-PlanVariableValue $Plan 'aws_region') -ne 'us-west-2') { Add-Finding 'region' 'aws_region must match the committed us-west-2 target.' }
  if ((Get-PlanVariableValue $Plan 'api_image_tag') -cne $SourceCommit) { Add-Finding 'image-source' 'The planned API image tag must equal the approved source commit.' }
  if (-not (Test-PolicyBoolean (Get-PlanVariableValue $Plan 'mfa_login_enabled') $true)) { Add-Finding 'production-mfa' 'Production login MFA must be enabled.' }

  foreach ($change in @(Get-PolicyProperty $Plan 'resource_changes')) {
    $address = [string](Get-PolicyProperty $change 'address')
    $actions = @((Get-PolicyProperty (Get-PolicyProperty $change 'change') 'actions'))
    $key = $actions -join ','
    switch ($key) {
      { $_ -in @('', 'no-op', 'read', 'create', 'update') } { }
      'delete' { $deletionCount++; Add-Finding 'destructive-action' 'Resource deletion is prohibited.' $address }
      'delete,create' { $replacementCount++; Add-Finding 'replacement-action' 'Destroy-before-create replacement is prohibited.' $address }
      'create,delete' { $replacementCount++; Add-Finding 'replacement-action' 'Create-before-destroy replacement is prohibited.' $address }
      default { Add-Finding 'unknown-action' 'Unrecognized Terraform action sequence.' $address }
    }
  }

  $plannedValues = Get-PolicyProperty $Plan 'planned_values'
  $resources = @(Get-PlanResourcesRecursive (Get-PolicyProperty $plannedValues 'root_module'))

  $desired = [int](Get-PlanVariableValue $Plan 'api_desired_count')
  $services = @(Get-ResourcesByType $resources 'aws_ecs_service')
  $apiService = $services | Where-Object { (Get-PolicyProperty $_ 'address') -match 'module\.api\.' } | Select-Object -First 1
  $apiValues = Get-ResourceValues $apiService
  if ($PolicyMode -eq 'Routine') {
    if ($desired -ne 1 -or [int](Get-PolicyProperty $apiValues 'desired_count') -ne 1) { Add-Finding 'routine-capacity' 'Routine production requires API desired count exactly one.' }
  }
  else {
    if (-not $BootstrapEligible) { Add-Finding 'bootstrap-eligibility' 'Bootstrap requires explicit proof of a new, never-activated stack.' }
    if ($desired -ne 0 -or [int](Get-PolicyProperty $apiValues 'desired_count') -ne 0) { Add-Finding 'bootstrap-capacity' 'Bootstrap requires API desired count zero.' }
    $apiChange = @(Get-PolicyProperty $Plan 'resource_changes') | Where-Object { (Get-PolicyProperty $_ 'address') -match 'module\.api\.aws_ecs_service' } | Select-Object -First 1
    if ((@((Get-PolicyProperty (Get-PolicyProperty $apiChange 'change') 'actions')) -join ',') -ne 'create') { Add-Finding 'bootstrap-create-only' 'Bootstrap API service must be create-only.' }
  }
  if ([string](Get-PlanVariableValue $Plan 'api_task_cpu') -ne '256' -or [string](Get-PlanVariableValue $Plan 'api_task_memory') -ne '512') { Add-Finding 'api-shape' 'API task must use the validated 256 CPU and 512 MiB shape.' }

  $databases = @(Get-ResourcesByType $resources 'aws_db_instance')
  if ($databases.Count -ne 1) { Add-Finding 'database-count' 'Exactly one RDS database is required.' }
  foreach ($database in $databases) {
    $values = Get-ResourceValues $database
    $address = [string](Get-PolicyProperty $database 'address')
    if ((Get-PolicyProperty $values 'instance_class') -ne 'db.t4g.micro') { Add-Finding 'database-class' 'RDS must use db.t4g.micro.' $address }
    if (-not (Test-PolicyBoolean (Get-PolicyProperty $values 'multi_az') $false)) { Add-Finding 'database-az' 'RDS must be explicitly Single-AZ.' $address }
    if ([int](Get-PolicyProperty $values 'allocated_storage') -ne 20) { Add-Finding 'database-storage' 'RDS initial storage must be 20 GiB.' $address }
    foreach ($check in @(@('storage_encrypted', $true), @('publicly_accessible', $false), @('deletion_protection', $true), @('skip_final_snapshot', $false))) {
      if (-not (Test-PolicyBoolean (Get-PolicyProperty $values $check[0]) $check[1])) { Add-Finding 'database-protection' "RDS control '$($check[0])' is invalid." $address }
    }
    if ([int](Get-PolicyProperty $values 'backup_retention_period') -lt 35) { Add-Finding 'database-backup' 'RDS backup retention must be the 35-day maximum.' $address }
  }

  if ($null -eq $apiService) { Add-Finding 'api-service' 'Production API ECS service is missing.' }
  else {
    $breaker = @(Get-PolicyProperty $apiValues 'deployment_circuit_breaker') | Select-Object -First 1
    if (-not (Test-PolicyBoolean (Get-PolicyProperty $breaker 'enable') $true) -or -not (Test-PolicyBoolean (Get-PolicyProperty $breaker 'rollback') $true)) { Add-Finding 'ecs-rollback' 'ECS deployment circuit breaker and rollback must be enabled.' }
    $network = @(Get-PolicyProperty $apiValues 'network_configuration') | Select-Object -First 1
    if (-not (Test-PolicyBoolean (Get-PolicyProperty $network 'assign_public_ip') $false)) { Add-Finding 'public-api-task' 'The API task must not receive a public IP.' ([string](Get-PolicyProperty $apiService 'address')) }
  }

  foreach ($type in @('aws_apigatewayv2_api', 'aws_api_gateway_rest_api', 'aws_lambda_function_url')) {
    foreach ($resource in @(Get-ResourcesByType $resources $type)) {
      Add-Finding 'alternate-public-gateway' "Alternate public gateway type '$type' is prohibited." ([string](Get-PolicyProperty $resource 'address'))
    }
  }
  foreach ($resource in @($resources | Where-Object { (Get-PolicyProperty $_ 'type') -match '^aws_appautoscaling_(target|policy)$' })) {
    $values = Get-ResourceValues $resource
    $identity = @(
      [string](Get-PolicyProperty $resource 'address'),
      [string](Get-PolicyProperty $values 'resource_id'),
      [string](Get-PolicyProperty $values 'policy_type')
    ) -join ' '
    if ($identity -match '(?i)api|ecs') { Add-Finding 'request-autoscaling' 'Request-driven API autoscaling is prohibited; capacity must remain fixed.' ([string](Get-PolicyProperty $resource 'address')) }
  }

  $repositories = @(Get-ResourcesByType $resources 'aws_ecr_repository')
  if ($repositories.Count -eq 0) { Add-Finding 'ecr' 'Production ECR repository is missing.' }
  foreach ($repository in $repositories) {
    $values = Get-ResourceValues $repository
    if ((Get-PolicyProperty $values 'image_tag_mutability') -ne 'IMMUTABLE') { Add-Finding 'ecr-immutability' 'Production ECR tags must be immutable.' ([string](Get-PolicyProperty $repository 'address')) }
  }

  $loadBalancers = @(Get-ResourcesByType $resources 'aws_lb')
  if ($loadBalancers.Count -eq 0) { Add-Finding 'alb' 'Internal production ALB is missing.' }
  foreach ($loadBalancer in $loadBalancers) {
    $values = Get-ResourceValues $loadBalancer
    if (-not (Test-PolicyBoolean (Get-PolicyProperty $values 'internal') $true) -or -not (Test-PolicyBoolean (Get-PolicyProperty $values 'enable_deletion_protection') $true)) { Add-Finding 'alb-protection' 'ALB must be internal with deletion protection.' ([string](Get-PolicyProperty $loadBalancer 'address')) }
  }

  $securityGroups = @(Get-ResourcesByType $resources 'aws_security_group')
  foreach ($securityGroup in $securityGroups) {
    $address = [string](Get-PolicyProperty $securityGroup 'address')
    foreach ($ingress in @(Get-PolicyProperty (Get-ResourceValues $securityGroup) 'ingress')) {
      $cidrs = @((Get-PolicyProperty $ingress 'cidr_blocks')) + @((Get-PolicyProperty $ingress 'ipv6_cidr_blocks'))
      if ($cidrs -contains '0.0.0.0/0' -or $cidrs -contains '::/0') { Add-Finding 'broad-origin-ingress' 'Origin-chain ingress cannot accept a public CIDR.' $address }
    }
  }
  foreach ($required in @(
    @('module.network.aws_security_group.alb', 'prefix_list_ids'),
    @('module.network.aws_security_group.api', 'security_groups'),
    @('module.network.aws_security_group.rds', 'security_groups')
  )) {
    $group = $securityGroups | Where-Object { (Get-PolicyProperty $_ 'address') -eq $required[0] } | Select-Object -First 1
    $ingress = @(Get-PolicyProperty (Get-ResourceValues $group) 'ingress')
    if ($null -eq $group -or $ingress.Count -ne 1 -or @((Get-PolicyProperty $ingress[0] $required[1])).Count -ne 1) {
      Add-Finding 'immediate-upstream-ingress' "Security group '$($required[0])' must accept exactly its immediate upstream identity." ([string]$required[0])
    }
  }

  $distributions = @(Get-ResourcesByType $resources 'aws_cloudfront_distribution')
  if ($distributions.Count -ne 1) { Add-Finding 'cloudfront' 'Exactly one CloudFront distribution is required.' }
  foreach ($distribution in $distributions) {
    $values = Get-ResourceValues $distribution
    $address = [string](Get-PolicyProperty $distribution 'address')
    if ([string]::IsNullOrWhiteSpace([string](Get-PolicyProperty $values 'web_acl_id'))) { Add-Finding 'cloudfront-waf' 'CloudFront must reference WAF.' $address }
    $apiOrigins = @((Get-PolicyProperty $values 'origin') | Where-Object { [string](Get-PolicyProperty $_ 'origin_id') -match 'api-origin' })
    if ($apiOrigins.Count -ne 1 -or @(Get-PolicyProperty $apiOrigins[0] 'vpc_origin_config').Count -ne 1 -or @(Get-PolicyProperty $apiOrigins[0] 'custom_origin_config').Count -ne 0) { Add-Finding 'private-api-origin' 'CloudFront must use exactly one VPC API origin and no custom public API origin.' $address }
    $behaviors = @(Get-PolicyProperty $values 'ordered_cache_behavior')
    foreach ($requiredPath in @('/health', '/v1/*')) {
      $matches = @($behaviors | Where-Object { (Get-PolicyProperty $_ 'path_pattern') -eq $requiredPath -and [string](Get-PolicyProperty $_ 'target_origin_id') -match 'api-origin' })
      if ($matches.Count -ne 1) { Add-Finding 'api-cache-behavior' "CloudFront requires exactly one '$requiredPath' VPC-origin behavior." $address }
    }
    foreach ($behavior in $behaviors) {
      if ([string](Get-PolicyProperty $behavior 'path_pattern') -match '^/internal') { Add-Finding 'internal-edge-forwarding' 'CloudFront must not forward an internal route behavior.' $address }
    }
    if (@(Get-PolicyProperty $values 'custom_error_response').Count -ne 0) { Add-Finding 'api-spa-substitution' 'Distribution-wide custom errors can convert API responses to SPA HTML and are prohibited.' $address }
  }

  $vpcOrigins = @(Get-ResourcesByType $resources 'aws_cloudfront_vpc_origin')
  if ($vpcOrigins.Count -ne 1) { Add-Finding 'vpc-origin-count' 'Exactly one CloudFront VPC origin is required.' }
  $publicBlocks = @(Get-ResourcesByType $resources 'aws_s3_bucket_public_access_block' | Where-Object { (Get-PolicyProperty $_ 'address') -match 'module\.edge\.' })
  if ($publicBlocks.Count -ne 1) { Add-Finding 'private-static-origin' 'The static edge bucket requires one public-access block.' }
  foreach ($block in $publicBlocks) {
    $values = Get-ResourceValues $block
    foreach ($name in @('block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets')) {
      if (-not (Test-PolicyBoolean (Get-PolicyProperty $values $name) $true)) { Add-Finding 'private-static-origin' "Static bucket control '$name' must be true." ([string](Get-PolicyProperty $block 'address')) }
    }
  }

  foreach ($record in @(Get-ResourcesByType $resources 'aws_route53_record')) {
    $values = Get-ResourceValues $record
    $encoded = $values | ConvertTo-Json -Depth 20 -Compress
    if ($encoded -match '(?i)elb\.amazonaws\.com|api-origin|internal-') { Add-Finding 'alternate-origin-dns' 'DNS must not expose or alias the private API origin.' ([string](Get-PolicyProperty $record 'address')) }
  }
  $outputChanges = Get-PolicyProperty $Plan 'output_changes'
  if ($null -ne $outputChanges) {
    foreach ($property in $outputChanges.PSObject.Properties) {
      $encoded = $property.Value | ConvertTo-Json -Depth 20 -Compress
      if ($property.Name -match '(?i)origin|load.?balancer|alb' -or $encoded -match '(?i)elb\.amazonaws\.com|api-origin|internal-') { Add-Finding 'origin-output' 'Plan outputs must not publish a private origin address.' $property.Name }
    }
  }

  $wafs = @(Get-ResourcesByType $resources 'aws_wafv2_web_acl')
  if ($wafs.Count -ne 1) { Add-Finding 'waf' 'Exactly one CloudFront WAF ACL is required.' }
  foreach ($waf in $wafs) {
    $ruleNames = @((Get-PolicyProperty (Get-ResourceValues $waf) 'rule') | ForEach-Object { Get-PolicyProperty $_ 'name' })
    foreach ($name in @('api_general_per_ip', 'api_general_global', 'auth_per_ip', 'auth_global', 'paid_admission_per_ip', 'paid_admission_global_emergency')) {
      if ($name -notin $ruleNames) { Add-Finding 'waf-rule' "Required WAF rule '$name' is missing." }
    }
  }

  $budgets = @(Get-ResourcesByType $resources 'aws_budgets_budget' | Where-Object { (Get-PolicyProperty $_ 'address') -match '\.monthly' })
  if ($budgets.Count -ne 1) { Add-Finding 'budget' 'Exactly one monthly production Budget is required.' }
  foreach ($budget in $budgets) {
    $values = Get-ResourceValues $budget
    if ([decimal](Get-PolicyProperty $values 'limit_amount') -ne 125) { Add-Finding 'budget-threshold' 'Monthly Budget must be $125.' }
    $notifications = @(Get-PolicyProperty $values 'notification')
    if ($notifications.Count -eq 0) { Add-Finding 'budget-subscriber' 'Monthly Budget requires a subscriber.' }
  }

  if ((Get-PolicyProperty $CostEstimate 'region') -ne 'us-west-2' -or [decimal](Get-PolicyProperty $CostEstimate 'estimatedMonthlyUsd') -gt 110 -or [decimal](Get-PolicyProperty $CostEstimate 'targetMonthlyUsd') -ne 110 -or [decimal](Get-PolicyProperty $CostEstimate 'budgetThresholdUsd') -ne 125 -or [int](Get-PolicyProperty $CostEstimate 'budgetActionCount') -ne 0 -or (Get-PolicyProperty $CostEstimate 'workloadProfileMatched') -ne $true -or @(Get-PolicyProperty $CostEstimate 'unpricedRecurringResources').Count -ne 0) { Add-Finding 'cost-estimate' 'Production cost estimate does not satisfy the approved workload and budget contract.' }
  if ((Get-PolicyProperty $SecretContract 'schemaVersion') -ne '1.0.0' -or @(Get-PolicyProperty $SecretContract 'secrets').Count -eq 0) { Add-Finding 'secret-contract' 'Production secret contract is missing or invalid.' }

  $passed = $findings.Count -eq 0
  $protectedFindings = $findings.ToArray()
  $result = [pscustomobject]@{
    schemaVersion = '1.0.0'
    planSha256 = $PlanSha256
    evaluatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    policyMode = $PolicyMode
    environmentVerified = $passed
    guardrailsVerified = $passed
    deletionCount = $deletionCount
    replacementCount = $replacementCount
    protectedFindings = $protectedFindings
    warnings = @()
  }
  return [pscustomobject]@{ Passed = $passed; Findings = $protectedFindings; Result = $result }
}

Export-ModuleMember -Function Invoke-ProductionPlanPolicy
