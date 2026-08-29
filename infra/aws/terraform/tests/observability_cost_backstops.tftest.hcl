mock_provider "aws" {}

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
      "AbuseProtectionDecision",
      "ProviderCalls",
      "RetryAttempts",
      "CostUnits",
      "CleanupFailures",
    ])
    error_message = "The aggregate application alarms must use the exact ProjectJackson/AbuseProtection metric contract."
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
