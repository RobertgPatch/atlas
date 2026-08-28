[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$validatorPath = Join-Path $PSScriptRoot 'validate-terraform-guardrails.ps1'
$powerShellPath = (Get-Process -Id $PID).Path
$temporaryFiles = New-Object 'System.Collections.Generic.List[string]'

function New-RateRule {
  param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $Action,
    [Parameter(Mandatory = $true)] [int] $Limit,
    [Parameter(Mandatory = $true)] [string] $AggregateKeyType
  )

  $actionValue = [ordered]@{}
  $actionValue[$Action] = @([ordered]@{})
  return [ordered]@{
    name = $Name
    action = @($actionValue)
    statement = @([ordered]@{
        rate_based_statement = @([ordered]@{
            limit = $Limit
            aggregate_key_type = $AggregateKeyType
          })
      })
  }
}

function New-ManagedRule {
  param([Parameter(Mandatory = $true)] [string] $Name)

  return [ordered]@{
    name = $Name
    override_action = @([ordered]@{ none = @([ordered]@{}) })
  }
}

function New-LifecycleRule {
  param(
    [Parameter(Mandatory = $true)] [string] $Id,
    [Parameter(Mandatory = $true)] [int] $ExpirationDays,
    [Parameter(Mandatory = $true)] [int] $NoncurrentDays
  )

  return [ordered]@{
    id = $Id
    status = 'Enabled'
    expiration = @([ordered]@{ days = $ExpirationDays })
    noncurrent_version_expiration = @([ordered]@{ noncurrent_days = $NoncurrentDays })
  }
}

function New-PlanFixture {
  param([Parameter(Mandatory = $true)] [ValidateSet('staging', 'production')] [string] $Environment)

  $isProduction = $Environment -eq 'production'
  $wafAction = if ($isProduction) { 'block' } else { 'count' }
  $apiDesiredCount = if ($isProduction) { 1 } else { 0 }
  $retentionDays = if ($isProduction) { 2555 } else { 365 }
  $noncurrentDays = if ($isProduction) { 365 } else { 90 }

  $runtimeEnvironment = [ordered]@{
    NODE_ENV = 'production'
    REQUIRE_DURABLE_PERSISTENCE = 'true'
    WEB_ORIGIN = "https://$Environment.atlas.example"
    SESSION_COOKIE_SECURE = 'true'
    SESSION_COOKIE_SAMESITE = 'lax'
    RATE_LIMIT_ENABLED = 'true'
    API_SHARED_CACHE_POLICY = 'no_shared_cache'
    MARKET_DATA_REFRESH_ON_READ = if ($isProduction) { 'false' } else { 'true' }
    K1_UPLOADS_ENABLED = 'false'
    K1_EXTRACTION_ENABLED = 'false'
    K1_BEDROCK_CHECKBOX_ENABLED = 'false'
    PLAID_REFRESH_ENABLED = 'false'
    MARKET_DATA_REFRESH_ENABLED = 'false'
    REPORT_EXPORTS_ENABLED = 'false'
    BACKFILLS_ENABLED = 'false'
    ABUSE_AUTH_SOURCE_REQUESTS = '20'
    ABUSE_AUTH_ACCOUNT_REQUESTS = '5'
    ABUSE_AUTH_HASH_GLOBAL_CONCURRENCY = '4'
    ABUSE_WORKBOOK_GLOBAL_PER_DAY = '25'
    ABUSE_WORKBOOK_GLOBAL_CONCURRENCY = '2'
    ABUSE_K1_GLOBAL_FILES_PER_DAY = '500'
    ABUSE_K1_EXTRACTION_GLOBAL_IN_FLIGHT = '5'
    ABUSE_K1_EXTRACTION_GLOBAL_BACKLOG = '100'
    ABUSE_K1_CHECKBOX_CALLS_GLOBAL_PER_DAY = '50'
    ABUSE_PLAID_REFRESHES_GLOBAL_PER_DAY = '25'
    ABUSE_MARKET_PROVIDER_CALLS_GLOBAL_PER_DAY = '200'
    ABUSE_PROVIDER_GLOBAL_CONCURRENCY = '2'
    ABUSE_EXPORT_GLOBAL_PER_DAY = '50'
    ABUSE_EXPORT_GLOBAL_CONCURRENCY = '2'
    ABUSE_BACKFILL_GLOBAL_RUNS_PER_DAY = '1'
    ABUSE_BACKFILL_GLOBAL_CONCURRENCY = '1'
    ABUSE_SCHEDULER_GLOBAL_CONCURRENCY = '1'
    ABUSE_BDA_MAX_ATTEMPTS = '3'
    ABUSE_BEDROCK_MAX_ATTEMPTS = '2'
    ABUSE_PLAID_MAX_ATTEMPTS = '2'
    ABUSE_MARKET_DATA_MAX_ATTEMPTS = '2'
    ABUSE_BDA_TIMEOUT_MS = '60000'
    ABUSE_BEDROCK_TIMEOUT_MS = '30000'
    ABUSE_PLAID_TIMEOUT_MS = '10000'
    ABUSE_MARKET_DATA_TIMEOUT_MS = '10000'
  }
  $environmentList = @($runtimeEnvironment.GetEnumerator() | ForEach-Object {
      [ordered]@{ name = $_.Key; value = $_.Value }
    })
  $secretList = @(
    [ordered]@{ name = 'DATABASE_URL'; value = 'arn:aws:secretsmanager:us-west-2:111122223333:secret:database' },
    [ordered]@{ name = 'PERSISTENCE_SECRET_KEY'; value = 'arn:aws:secretsmanager:us-west-2:111122223333:secret:persistence' },
    [ordered]@{ name = 'SESSION_SECRET'; value = 'arn:aws:secretsmanager:us-west-2:111122223333:secret:session' },
    [ordered]@{ name = 'ABUSE_HMAC_ACTIVE_KEY'; value = 'arn:aws:secretsmanager:us-west-2:111122223333:secret:abuse-hmac' }
  )
  $containerDefinitions = @([ordered]@{
      name = 'api'
      environment = $environmentList
      secrets = $secretList
    }) | ConvertTo-Json -Depth 100 -Compress

  $rules = @(
    (New-ManagedRule -Name 'AWSManagedRulesCommonRuleSet'),
    (New-ManagedRule -Name 'AWSManagedRulesKnownBadInputsRuleSet'),
    (New-ManagedRule -Name 'AWSManagedRulesAmazonIpReputationList'),
    (New-ManagedRule -Name 'AWSManagedRulesAnonymousIpList'),
    (New-RateRule -Name 'api_general_per_ip' -Action $wafAction -Limit 1000 -AggregateKeyType 'IP'),
    (New-RateRule -Name 'auth_per_ip' -Action $wafAction -Limit 100 -AggregateKeyType 'IP'),
    (New-RateRule -Name 'paid_admission_per_ip' -Action $wafAction -Limit 100 -AggregateKeyType 'IP'),
    (New-RateRule -Name 'paid_admission_global_emergency' -Action $wafAction -Limit 500 -AggregateKeyType 'CONSTANT')
  )

  $resources = @(
    [ordered]@{
      address = 'module.api.aws_lb.api'
      type = 'aws_lb'
      values = [ordered]@{ internal = $true }
    },
    [ordered]@{
      address = 'module.edge.aws_cloudfront_vpc_origin.api'
      type = 'aws_cloudfront_vpc_origin'
      values = [ordered]@{ vpc_origin_endpoint_config = @([ordered]@{ name = 'api-origin' }) }
    },
    [ordered]@{
      address = 'module.edge.aws_cloudfront_distribution.this'
      type = 'aws_cloudfront_distribution'
      values = [ordered]@{
        web_acl_id = 'arn:aws:wafv2:us-east-1:111122223333:global/webacl/atlas/example'
        origin = @(
          [ordered]@{ origin_id = 'web'; custom_origin_config = @([ordered]@{}) },
          [ordered]@{ origin_id = 'api-origin'; vpc_origin_config = @([ordered]@{ vpc_origin_id = 'example' }) }
        )
      }
    },
    [ordered]@{
      address = 'module.network.aws_security_group.alb'
      type = 'aws_security_group'
      values = [ordered]@{
        ingress = @([ordered]@{
            from_port = 80
            to_port = 80
            protocol = 'tcp'
            cidr_blocks = @()
            ipv6_cidr_blocks = @()
            prefix_list_ids = @('pl-aws-cloudfront-origin-facing')
          })
      }
    },
    [ordered]@{
      address = 'module.security.aws_wafv2_web_acl.this'
      type = 'aws_wafv2_web_acl'
      values = [ordered]@{ scope = 'CLOUDFRONT'; rule = $rules }
    },
    [ordered]@{
      address = 'module.observability.aws_sns_topic_subscription.email[0]'
      type = 'aws_sns_topic_subscription'
      values = [ordered]@{ protocol = 'email'; endpoint = 'alerts@atlas.example' }
    },
    [ordered]@{
      address = 'module.budgets.aws_budgets_budget.monthly'
      type = 'aws_budgets_budget'
      values = [ordered]@{ notification = @([ordered]@{ subscriber_email_addresses = @('billing@atlas.example') }) }
    },
    [ordered]@{
      address = 'module.budgets.aws_budgets_budget.k1_bedrock'
      type = 'aws_budgets_budget'
      values = [ordered]@{ notification = @([ordered]@{ subscriber_email_addresses = @('billing@atlas.example') }) }
    },
    [ordered]@{
      address = 'module.budgets.aws_ce_anomaly_subscription.services[0]'
      type = 'aws_ce_anomaly_subscription'
      values = [ordered]@{ subscriber = @([ordered]@{ type = 'EMAIL'; address = 'billing@atlas.example' }) }
    },
    [ordered]@{
      address = 'module.api.aws_ecs_service.api'
      type = 'aws_ecs_service'
      values = [ordered]@{ desired_count = $apiDesiredCount }
    },
    [ordered]@{
      address = 'module.k1_ingestion.aws_ecs_service.worker'
      type = 'aws_ecs_service'
      values = [ordered]@{ desired_count = 0 }
    },
    [ordered]@{
      address = 'module.api.aws_ecs_task_definition.api'
      type = 'aws_ecs_task_definition'
      values = [ordered]@{ container_definitions = $containerDefinitions }
    },
    [ordered]@{
      address = 'module.k1_ingestion.aws_s3_bucket.documents'
      type = 'aws_s3_bucket'
      values = [ordered]@{ force_destroy = $false }
    },
    [ordered]@{
      address = 'module.k1_ingestion.aws_s3_bucket_lifecycle_configuration.documents'
      type = 'aws_s3_bucket_lifecycle_configuration'
      values = [ordered]@{
        rule = @(
          (New-LifecycleRule -Id 'expire-unaccepted-quarantine' -ExpirationDays 7 -NoncurrentDays 1),
          (New-LifecycleRule -Id 'retain-accepted-k1-evidence' -ExpirationDays $retentionDays -NoncurrentDays $noncurrentDays),
          (New-LifecycleRule -Id 'retain-k1-extraction-results' -ExpirationDays $retentionDays -NoncurrentDays $noncurrentDays)
        )
      }
    }
  )

  return [ordered]@{
    format_version = '1.2'
    terraform_version = '1.11.0'
    errored = $false
    variables = [ordered]@{
      environment_name = [ordered]@{ value = $Environment }
      alarm_email = [ordered]@{ value = 'alerts@atlas.example' }
      alarm_destination_confirmed = [ordered]@{ value = $true }
      budget_alert_email = [ordered]@{ value = 'billing@atlas.example' }
      budget_destination_confirmed = [ordered]@{ value = $true }
      api_desired_count = [ordered]@{ value = $apiDesiredCount }
      k1_worker_desired_count = [ordered]@{ value = 1 }
      k1_worker_concurrency = [ordered]@{ value = 5 }
      k1_document_retention_days = [ordered]@{ value = $retentionDays }
      k1_noncurrent_retention_days = [ordered]@{ value = $noncurrentDays }
    }
    planned_values = [ordered]@{
      outputs = [ordered]@{ public_web_url = [ordered]@{ value = "https://$Environment.atlas.example" } }
      root_module = [ordered]@{ resources = $resources }
    }
  }
}

function Write-PlanFixture {
  param([Parameter(Mandatory = $true)] [object] $Plan)

  $path = [System.IO.Path]::GetTempFileName()
  $temporaryFiles.Add($path)
  $Plan | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding UTF8
  return $path
}

function Invoke-Validator {
  param(
    [Parameter(Mandatory = $true)] [string] $StagingPath,
    [Parameter(Mandatory = $true)] [string] $ProductionPath
  )

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell promotes native stderr to an ErrorRecord. Keep it in
    # captured output so expected validator failures do not terminate this test.
    $ErrorActionPreference = 'Continue'
    $output = & $powerShellPath -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
      -StagingPlanJsonPath $StagingPath `
      -ProductionPlanJsonPath $ProductionPath 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $output
  }
}

try {
  $stagingPlan = New-PlanFixture -Environment 'staging'
  $productionPlan = New-PlanFixture -Environment 'production'
  $stagingPath = Write-PlanFixture -Plan $stagingPlan
  $productionPath = Write-PlanFixture -Plan $productionPlan

  $passingResult = Invoke-Validator -StagingPath $stagingPath -ProductionPath $productionPath
  if ($passingResult.ExitCode -ne 0) {
    throw "Expected valid fixtures to pass, but validator exited $($passingResult.ExitCode):`n$($passingResult.Output)"
  }
  if ($passingResult.Output -notmatch 'PASS \[staging/production\]') {
    throw "Expected validator PASS summary was missing:`n$($passingResult.Output)"
  }

  $badProductionPlan = $productionPlan | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  $badResources = @($badProductionPlan.planned_values.root_module.resources)
  ($badResources | Where-Object { $_.address -eq 'module.api.aws_lb.api' }).values.internal = $false
  $waf = $badResources | Where-Object { $_.address -eq 'module.security.aws_wafv2_web_acl.this' }
  $waf.values.rule = @($waf.values.rule | Where-Object { $_.name -ne 'auth_per_ip' })
  $badProductionPlan.variables.budget_alert_email.value = $null
  $badProductionPlan.variables.budget_destination_confirmed.value = $false
  $badProductionPlan.planned_values.root_module.resources += [pscustomobject]@{
    address = 'aws_appautoscaling_target.api'
    type = 'aws_appautoscaling_target'
    values = [pscustomobject]@{ max_capacity = 100 }
  }
  $lifecycle = $badResources | Where-Object { $_.address -eq 'module.k1_ingestion.aws_s3_bucket_lifecycle_configuration.documents' }
  $lifecycle.values.rule = @($lifecycle.values.rule | Where-Object { $_.id -ne 'expire-unaccepted-quarantine' })
  $taskDefinition = $badResources | Where-Object { $_.address -eq 'module.api.aws_ecs_task_definition.api' }
  $containers = @($taskDefinition.values.container_definitions | ConvertFrom-Json)
  $containers[0].environment = @($containers[0].environment | Where-Object { $_.name -ne 'RATE_LIMIT_ENABLED' })
  $taskDefinition.values.container_definitions = $containers | ConvertTo-Json -Depth 100 -Compress
  $badProductionPath = Write-PlanFixture -Plan $badProductionPlan

  $failingResult = Invoke-Validator -StagingPath $stagingPath -ProductionPath $badProductionPath
  if ($failingResult.ExitCode -eq 0) {
    throw 'Expected broken production fixture to fail, but validator exited successfully.'
  }
  foreach ($guardrail in @(
      'origin restriction',
      'WAF parity',
      'non-null subscribers',
      'finite ECS scaling',
      'K-1 lifecycle',
      'runtime setting wiring'
    )) {
    if ($failingResult.Output -notmatch [regex]::Escape("[$guardrail]")) {
      throw "Expected negative fixture output for '$guardrail':`n$($failingResult.Output)"
    }
  }

  Write-Output 'PASS Terraform guardrail validator self-test: valid staging/production fixtures pass and six-category drift fails closed.'
}
finally {
  foreach ($temporaryFile in $temporaryFiles) {
    if (Test-Path -LiteralPath $temporaryFile -PathType Leaf) {
      Remove-Item -LiteralPath $temporaryFile -Force
    }
  }
}
