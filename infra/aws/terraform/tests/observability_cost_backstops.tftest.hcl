mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

run "waf_observability_is_labeled_filtered_and_redacted" {
  command = plan

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  module {
    source = "./modules/security"
  }

  variables {
    name_prefix                       = "atlas-test"
    rate_limit_requests_per_5_minutes = 500
    waf_log_retention_days            = 30
  }

  assert {
    condition = alltrue([
      for required_label in [
        "atlas:rate:api-general-source",
        "atlas:rate:api-general-global",
        "atlas:rate:auth-source",
        "atlas:rate:auth-global",
        "atlas:rate:paid-source",
        "atlas:rate:paid-global",
      ] : strcontains(jsonencode(aws_wafv2_web_acl.this.rule), required_label)
      ]) && length(distinct([
        for rule in aws_wafv2_web_acl.this.rule : rule.visibility_config[0].metric_name
    ])) == length(aws_wafv2_web_acl.this.rule)
    error_message = "Every custom WAF rate rule needs a stable label and distinct metric."
  }

  assert {
    condition = (
      aws_wafv2_web_acl_logging_configuration.this.logging_filter[0].default_behavior == "DROP" &&
      length([
        for filter in aws_wafv2_web_acl_logging_configuration.this.logging_filter[0].filter : filter
        if filter.behavior == "DROP" && length(filter.condition) == 2
      ]) == 6 &&
      !strcontains(jsonencode(aws_wafv2_web_acl_logging_configuration.this.logging_filter), "CAPTCHA") &&
      !strcontains(jsonencode(aws_wafv2_web_acl_logging_configuration.this.logging_filter), "CHALLENGE")
    )
    error_message = "Rate-block drop filters must precede the bounded BLOCK/COUNT evidence filter without CAPTCHA or Challenge controls."
  }

  assert {
    condition = alltrue([
      for required_header in [
        "authorization",
        "cookie",
        "x-scheduler-token",
        "x-csrf-token",
        "x-idempotency-key",
        ] : contains([
          for field in aws_wafv2_web_acl_logging_configuration.this.redacted_fields :
          try(lower(field.single_header[0].name), "")
      ], required_header)
      ]) && anytrue([
      for field in aws_wafv2_web_acl_logging_configuration.this.redacted_fields :
      length(try(field.query_string, [])) == 1
    ])
    error_message = "WAF logging must redact credential headers and query strings that may contain presigned secrets; inspected body content is not serialized by WAF request logs."
  }
}

run "five_minute_operational_alarms" {
  command = plan

  module {
    source = "./modules/observability"
  }

  variables {
    name_prefix                          = "atlas-test"
    environment_name                     = "production"
    cloudfront_distribution_id           = "E1234567890"
    api_load_balancer_arn_suffix         = "app/atlas-test/0000000000000000"
    api_target_group_arn_suffix          = "targetgroup/atlas-test/0000000000000000"
    api_5xx_threshold                    = 5
    ecs_cluster_name                     = "atlas-test-cluster"
    api_ecs_service_name                 = "atlas-test-api"
    k1_worker_ecs_service_name           = "atlas-test-k1-worker"
    db_instance_identifier               = "atlas-test-db"
    rds_cpu_threshold_percent            = 80
    rds_free_storage_threshold_bytes     = 2147483648
    rds_connections_threshold            = 40
    scheduler_schedule_name              = "atlas-test-refresh"
    market_price_scheduler_schedule_name = "atlas-test-market-price"
    waf_web_acl_name                     = "atlas-test-waf"
    waf_blocked_requests_threshold       = 100
    k1_start_queue_name                  = "atlas-test-k1-start"
    k1_completion_queue_name             = "atlas-test-k1-completion"
    k1_document_bucket_name              = "atlas-test-k1-documents"
    alarm_email                          = "ops@example.com"
    alarm_destination_confirmed          = true
  }

  assert {
    condition = alltrue(concat(
      [
        aws_cloudwatch_metric_alarm.cloudfront_requests.period * aws_cloudwatch_metric_alarm.cloudfront_requests.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.cloudfront_5xx_rate.period * aws_cloudwatch_metric_alarm.cloudfront_5xx_rate.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.api_requests.period * aws_cloudwatch_metric_alarm.api_requests.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.api_target_latency.period * aws_cloudwatch_metric_alarm.api_target_latency.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.api_unhealthy_targets.period * aws_cloudwatch_metric_alarm.api_unhealthy_targets.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.api_5xx.period * aws_cloudwatch_metric_alarm.api_5xx.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.rds_cpu.period * aws_cloudwatch_metric_alarm.rds_cpu.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.rds_free_storage.period * aws_cloudwatch_metric_alarm.rds_free_storage.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.rds_connections.period * aws_cloudwatch_metric_alarm.rds_connections.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.waf_blocked_requests.period * aws_cloudwatch_metric_alarm.waf_blocked_requests.evaluation_periods <= 300,
        aws_cloudwatch_metric_alarm.s3_put_requests[0].period * aws_cloudwatch_metric_alarm.s3_put_requests[0].evaluation_periods <= 300,
      ],
      [for alarm in aws_cloudwatch_metric_alarm.ecs_utilization : alarm.period * alarm.evaluation_periods <= 300],
      [for alarm in aws_cloudwatch_metric_alarm.waf_rate_rule_blocks : alarm.period * alarm.evaluation_periods <= 300],
      [for alarm in aws_cloudwatch_metric_alarm.k1_queue_age : alarm.period * alarm.evaluation_periods <= 300],
      [for alarm in aws_cloudwatch_metric_alarm.k1_queue_depth : alarm.period * alarm.evaluation_periods <= 300],
      [for alarm in aws_cloudwatch_metric_alarm.k1_dlq_depth : alarm.period * alarm.evaluation_periods <= 300],
      [for alarm in aws_cloudwatch_metric_alarm.k1_workflow : alarm.period * alarm.evaluation_periods <= 300],
      [for alarm in aws_cloudwatch_metric_alarm.abuse_protection : alarm.period * alarm.evaluation_periods <= 300],
    ))
    error_message = "Operational alarms must evaluate within five minutes."
  }

  assert {
    condition = toset([
      for alarm in aws_cloudwatch_metric_alarm.abuse_protection : alarm.metric_name
      ]) == toset([
      "AbuseProtectionCritical",
      "ProviderCalls",
      "RetryAttempts",
      "CostUnits",
      "CleanupFailures",
    ])
    error_message = "The aggregate application alarms must use the exact ProjectJackson/AbuseProtection metric contract."
  }

  assert {
    condition = (
      toset([for alarm in aws_cloudwatch_metric_alarm.waf_rate_rule_blocks : alarm.dimensions.Rule]) == toset(["api_general_per_ip", "auth_per_ip"]) &&
      alltrue([for alarm in aws_cloudwatch_metric_alarm.waf_rate_rule_blocks : length(alarm.alarm_actions) == 1]) &&
      alltrue([for alarm in aws_cloudwatch_metric_alarm.abuse_protection : length(alarm.alarm_actions) == 1]) &&
      length(aws_cloudwatch_metric_alarm.s3_put_requests[0].alarm_actions) == 1
    )
    error_message = "Rule-specific edge, critical application, and S3 growth alarms must route to the confirmed operator destination."
  }

  assert {
    condition = alltrue([
      for required_signal in [
        "api_general_per_ip",
        "auth_per_ip",
        "AbuseProtectionCritical",
        "PutRequests",
        "NumberOfObjects",
        "ProviderCalls",
        "RetryAttempts",
      ] : strcontains(aws_cloudwatch_dashboard.k1_ingestion.dashboard_body, required_signal)
    ])
    error_message = "The operations dashboard must correlate edge, application protection, S3 growth, and downstream cost signals."
  }
}

run "production_alarm_destination_required" {
  command = plan

  module {
    source = "./modules/observability"
  }

  variables {
    name_prefix                          = "atlas-test"
    environment_name                     = "production"
    cloudfront_distribution_id           = "E1234567890"
    api_load_balancer_arn_suffix         = "app/atlas-test/0000000000000000"
    api_target_group_arn_suffix          = "targetgroup/atlas-test/0000000000000000"
    api_5xx_threshold                    = 5
    ecs_cluster_name                     = "atlas-test-cluster"
    api_ecs_service_name                 = "atlas-test-api"
    k1_worker_ecs_service_name           = "atlas-test-k1-worker"
    db_instance_identifier               = "atlas-test-db"
    rds_cpu_threshold_percent            = 80
    rds_free_storage_threshold_bytes     = 2147483648
    rds_connections_threshold            = 40
    scheduler_schedule_name              = "atlas-test-refresh"
    market_price_scheduler_schedule_name = "atlas-test-market-price"
    waf_web_acl_name                     = "atlas-test-waf"
    waf_blocked_requests_threshold       = 100
    k1_start_queue_name                  = "atlas-test-k1-start"
    k1_completion_queue_name             = "atlas-test-k1-completion"
    k1_document_bucket_name              = "atlas-test-k1-documents"
    alarm_email                          = "ops@example.com"
    alarm_destination_confirmed          = false
  }

  expect_failures = [aws_cloudwatch_dashboard.k1_ingestion]
}

run "actual_forecast_budgets_and_anomaly_detection" {
  command = plan

  module {
    source = "./modules/budgets"
  }

  variables {
    name_prefix                              = "atlas-test"
    environment_name                         = "production"
    monthly_limit_usd                        = 125
    bedrock_monthly_limit_usd                = 25
    alert_email                              = "ops@example.com"
    notification_thresholds                  = [50, 80, 100]
    forecast_notification_thresholds         = [80, 100]
    bedrock_notification_thresholds          = [50, 80, 100]
    bedrock_forecast_notification_thresholds = [80, 100]
    cost_anomaly_threshold_usd               = 10
    budget_destination_confirmed             = true
  }

  assert {
    condition = (
      length([for item in aws_budgets_budget.monthly.notification : item if item.notification_type == "ACTUAL"]) == 3 &&
      length([for item in aws_budgets_budget.monthly.notification : item if item.notification_type == "FORECASTED"]) == 2 &&
      length([for item in aws_budgets_budget.k1_bedrock.notification : item if item.notification_type == "ACTUAL"]) == 3 &&
      length([for item in aws_budgets_budget.k1_bedrock.notification : item if item.notification_type == "FORECASTED"]) == 2
    )
    error_message = "Total and Bedrock budgets must both notify on configured actual and forecast thresholds."
  }

  assert {
    condition = (
      aws_ce_anomaly_monitor.services.monitor_dimension == "SERVICE" &&
      length(aws_ce_anomaly_subscription.services) == 1
    )
    error_message = "Service-level Cost Anomaly Detection must notify the configured destination."
  }
}

run "production_budget_destination_required" {
  command = plan

  module {
    source = "./modules/budgets"
  }

  variables {
    name_prefix                  = "atlas-test"
    environment_name             = "production"
    monthly_limit_usd            = 100
    bedrock_monthly_limit_usd    = 25
    notification_thresholds      = [50, 80, 100]
    alert_email                  = "ops@example.com"
    budget_destination_confirmed = false
  }

  expect_failures = [aws_budgets_budget.monthly]
}
