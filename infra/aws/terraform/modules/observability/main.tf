locals {
  alarm_actions = var.alarm_email == null ? [] : [aws_sns_topic.alarms[0].arn]
}

resource "aws_sns_topic" "alarms" {
  count = var.alarm_email == null ? 0 : 1

  name = "${var.name_prefix}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email == null ? 0 : 1

  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_requests" {
  alarm_name          = "${var.name_prefix}-cloudfront-requests"
  alarm_description   = "Sustained edge request volume may indicate bot traffic or an unexpected traffic-cost increase."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Requests"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Sum"
  threshold           = var.cloudfront_requests_threshold
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = var.cloudfront_distribution_id
    Region         = "Global"
  }
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx_rate" {
  alarm_name          = "${var.name_prefix}-cloudfront-5xx-rate"
  alarm_description   = "CloudFront 5xx responses exceeded the five-minute error-rate envelope."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = var.cloudfront_5xx_rate_threshold_percent
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = var.cloudfront_distribution_id
    Region         = "Global"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_requests" {
  alarm_name          = "${var.name_prefix}-alb-requests"
  alarm_description   = "ALB request volume exceeded the five-minute API traffic envelope."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "RequestCount"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.alb_requests_threshold
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.api_load_balancer_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_target_latency" {
  alarm_name          = "${var.name_prefix}-alb-target-p95-latency"
  alarm_description   = "API target p95 latency exceeded the five-minute service envelope."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  threshold           = var.alb_target_p95_latency_threshold_seconds
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.api_load_balancer_arn_suffix
    TargetGroup  = var.api_target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy_targets" {
  alarm_name          = "${var.name_prefix}-api-unhealthy-targets"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_actions       = local.alarm_actions

  dimensions = {
    LoadBalancer = var.api_load_balancer_arn_suffix
    TargetGroup  = var.api_target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.name_prefix}-api-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.api_5xx_threshold
  alarm_actions       = local.alarm_actions

  dimensions = {
    LoadBalancer = var.api_load_balancer_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.name_prefix}-rds-cpu"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_cpu_threshold_percent
  alarm_actions       = local.alarm_actions

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.name_prefix}-rds-free-storage"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_free_storage_threshold_bytes
  alarm_actions       = local.alarm_actions

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.name_prefix}-rds-connections"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_connections_threshold
  alarm_actions       = local.alarm_actions

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

locals {
  ecs_utilization_alarms = {
    api-cpu       = { metric = "CPUUtilization", service = var.api_ecs_service_name, threshold = var.ecs_cpu_threshold_percent }
    api-memory    = { metric = "MemoryUtilization", service = var.api_ecs_service_name, threshold = var.ecs_memory_threshold_percent }
    worker-cpu    = { metric = "CPUUtilization", service = var.k1_worker_ecs_service_name, threshold = var.ecs_cpu_threshold_percent }
    worker-memory = { metric = "MemoryUtilization", service = var.k1_worker_ecs_service_name, threshold = var.ecs_memory_threshold_percent }
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_utilization" {
  for_each            = local.ecs_utilization_alarms
  alarm_name          = "${var.name_prefix}-ecs-${each.key}"
  alarm_description   = "ECS ${each.key} exceeded its five-minute utilization envelope."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.value.metric
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = each.value.threshold
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.value.service
  }
}

resource "aws_cloudwatch_metric_alarm" "scheduler_target_errors" {
  alarm_name          = "${var.name_prefix}-scheduler-target-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TargetErrorCount"
  namespace           = "AWS/Scheduler"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions

  dimensions = {
    ScheduleGroup = "default"
    ScheduleName  = var.scheduler_schedule_name
  }
}

resource "aws_cloudwatch_metric_alarm" "market_price_scheduler_target_errors" {
  alarm_name          = "${var.name_prefix}-market-price-scheduler-target-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TargetErrorCount"
  namespace           = "AWS/Scheduler"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions

  dimensions = {
    ScheduleGroup = "default"
    ScheduleName  = var.market_price_scheduler_schedule_name
  }
}

resource "aws_cloudwatch_metric_alarm" "waf_blocked_requests" {
  alarm_name          = "${var.name_prefix}-waf-blocked-requests"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = var.waf_blocked_requests_threshold
  alarm_actions       = local.alarm_actions

  dimensions = {
    Region = "Global"
    Rule   = "ALL"
    WebACL = var.waf_web_acl_name
  }
}

locals {
  k1_queues = { start = var.k1_start_queue_name, completion = var.k1_completion_queue_name }
  k1_dlqs   = { start = "${var.k1_start_queue_name}-dlq", completion = "${var.k1_completion_queue_name}-dlq" }
}

resource "aws_cloudwatch_metric_alarm" "k1_queue_age" {
  for_each            = local.k1_queues
  alarm_name          = "${var.name_prefix}-k1-${each.key}-queue-age"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.k1_queue_age_threshold_seconds
  alarm_actions       = local.alarm_actions
  dimensions          = { QueueName = each.value }
}

resource "aws_cloudwatch_metric_alarm" "k1_queue_depth" {
  for_each            = local.k1_queues
  alarm_name          = "${var.name_prefix}-k1-${each.key}-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.k1_queue_depth_threshold
  alarm_actions       = local.alarm_actions
  dimensions          = { QueueName = each.value }
}

resource "aws_cloudwatch_metric_alarm" "k1_dlq_depth" {
  for_each            = local.k1_dlqs
  alarm_name          = "${var.name_prefix}-k1-${each.key}-dlq"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  dimensions          = { QueueName = each.value }
}

resource "aws_s3_bucket_metric" "k1_requests" {
  bucket = var.k1_document_bucket_name
  name   = "EntireBucket"
}

resource "aws_cloudwatch_metric_alarm" "s3_put_requests" {
  alarm_name          = "${var.name_prefix}-s3-put-requests"
  alarm_description   = "K-1 object-write volume exceeded the five-minute storage-growth envelope."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "PutRequests"
  namespace           = "AWS/S3"
  period              = 300
  statistic           = "Sum"
  threshold           = var.s3_put_requests_threshold
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    BucketName = var.k1_document_bucket_name
    FilterId   = aws_s3_bucket_metric.k1_requests.name
  }
}

resource "aws_cloudwatch_metric_alarm" "k1_workflow" {
  for_each = {
    worker-errors       = { metric = "WorkerErrors", threshold = 1, statistic = "Sum" }
    extraction-failures = { metric = "ExtractionFailures", threshold = 1, statistic = "Sum" }
    apply-failures      = { metric = "ApplyFailures", threshold = 1, statistic = "Sum" }
    reconciliation-lag  = { metric = "ReconciliationLagSeconds", threshold = var.k1_reconciliation_lag_threshold_seconds, statistic = "Maximum" }
    page-count          = { metric = "PagesProcessed", threshold = var.k1_page_count_threshold, statistic = "Sum" }
  }
  alarm_name          = "${var.name_prefix}-k1-${each.key}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.value.metric
  namespace           = "Atlas/K1Ingestion"
  period              = 300
  statistic           = each.value.statistic
  threshold           = each.value.threshold
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    Environment = var.environment_name
  }
}

locals {
  abuse_protection_alarms = {
    protection-decisions = {
      metric      = "AbuseProtectionDecision"
      threshold   = var.abuse_protection_decision_threshold
      description = "Combined throttle, admission rejection, and protection-decision activity exceeded its five-minute envelope."
    }
    provider-calls = {
      metric      = "ProviderCalls"
      threshold   = var.provider_calls_threshold
      description = "Paid provider calls, including BDA and Bedrock activity, exceeded the five-minute envelope."
    }
    retry-attempts = {
      metric      = "RetryAttempts"
      threshold   = var.retry_attempts_threshold
      description = "Paid-work retry attempts exceeded the five-minute envelope."
    }
    cost-units = {
      metric      = "CostUnits"
      threshold   = var.cost_units_threshold
      description = "Estimated paid-work cost units exceeded the five-minute envelope."
    }
    cleanup-failures = {
      metric      = "CleanupFailures"
      threshold   = var.cleanup_failures_threshold
      description = "Retention cleanup failures may allow unbounded storage growth."
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "abuse_protection" {
  for_each            = local.abuse_protection_alarms
  alarm_name          = "${var.name_prefix}-abuse-${each.key}"
  alarm_description   = each.value.description
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.value.metric
  namespace           = "Atlas/AbuseProtection"
  period              = 300
  statistic           = "Sum"
  threshold           = each.value.threshold
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"

  dimensions = {
    Environment = var.environment_name
  }
}

data "aws_region" "current" {}

resource "aws_cloudwatch_dashboard" "k1_ingestion" {
  dashboard_name = "${var.name_prefix}-abuse-cost-operations"
  dashboard_body = jsonencode({ widgets = [
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "Edge traffic, error rates, and WAF decisions", region = data.aws_region.current.name, period = 300
        metrics = [
          ["AWS/CloudFront", "Requests", "DistributionId", var.cloudfront_distribution_id, "Region", "Global", { stat = "Sum" }],
          ["AWS/CloudFront", "4xxErrorRate", "DistributionId", var.cloudfront_distribution_id, "Region", "Global", { stat = "Average" }],
          ["AWS/CloudFront", "5xxErrorRate", "DistributionId", var.cloudfront_distribution_id, "Region", "Global", { stat = "Average" }],
          ["AWS/WAFV2", "AllowedRequests", "WebACL", var.waf_web_acl_name, "Region", "Global", "Rule", "ALL", { stat = "Sum" }],
          ["AWS/WAFV2", "BlockedRequests", "WebACL", var.waf_web_acl_name, "Region", "Global", "Rule", "ALL", { stat = "Sum" }],
          ["AWS/WAFV2", "CountedRequests", "WebACL", var.waf_web_acl_name, "Region", "Global", "Rule", "ALL", { stat = "Sum" }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "API request volume, latency, and target health", region = data.aws_region.current.name, period = 300
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.api_load_balancer_arn_suffix, { stat = "Sum" }],
          ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", var.api_load_balancer_arn_suffix, { stat = "Sum" }],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.api_load_balancer_arn_suffix, { stat = "Sum" }],
          ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.api_load_balancer_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { stat = "p95" }],
          ["AWS/ApplicationELB", "UnHealthyHostCount", "LoadBalancer", var.api_load_balancer_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { stat = "Maximum" }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "Application throttles, admissions, and authentication protection", region = data.aws_region.current.name, period = 300
        metrics = [
          ["Atlas/AbuseProtection", "AbuseProtectionDecision", "Environment", var.environment_name, { stat = "Sum" }],
          [{ expression = "SEARCH('{Atlas/AbuseProtection} MetricName=\"AbuseProtectionDecision\" Environment=\"${var.environment_name}\"', 'Sum', 300)", id = "decision_detail", label = "Decision detail", region = data.aws_region.current.name }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "Provider calls, retries, cost units, and cleanup", region = data.aws_region.current.name, period = 300, stat = "Sum"
        metrics = [
          ["Atlas/AbuseProtection", "ProviderCalls", "Environment", var.environment_name],
          ["Atlas/AbuseProtection", "RetryAttempts", "Environment", var.environment_name],
          ["Atlas/AbuseProtection", "CostUnits", "Environment", var.environment_name],
          ["Atlas/AbuseProtection", "CleanupFailures", "Environment", var.environment_name],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "ECS API and worker utilization", region = data.aws_region.current.name, period = 300, stat = "Average"
        metrics = [
          ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.api_ecs_service_name],
          ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.api_ecs_service_name],
          ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.k1_worker_ecs_service_name],
          ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.k1_worker_ecs_service_name],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "RDS capacity and connections", region = data.aws_region.current.name, period = 300
        metrics = [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_identifier, { stat = "Average" }],
          ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.db_instance_identifier, { stat = "Average" }],
          ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", var.db_instance_identifier, { stat = "Minimum" }],
          ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", var.db_instance_identifier, { stat = "Minimum" }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "K-1 queue age, depth, and dead-letter backlog", region = data.aws_region.current.name, period = 300
        metrics = [
          ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.k1_start_queue_name, { stat = "Maximum" }],
          ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.k1_start_queue_name, { stat = "Maximum" }],
          ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.k1_completion_queue_name, { stat = "Maximum" }],
          ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.k1_completion_queue_name, { stat = "Maximum" }],
          ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${var.k1_start_queue_name}-dlq", { stat = "Maximum" }],
          ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${var.k1_completion_queue_name}-dlq", { stat = "Maximum" }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title = "S3 writes (5m) and retained bytes/objects (daily)", region = data.aws_region.current.name
        metrics = [
          ["AWS/S3", "PutRequests", "BucketName", var.k1_document_bucket_name, "FilterId", aws_s3_bucket_metric.k1_requests.name, { period = 300, stat = "Sum" }],
          ["AWS/S3", "BucketSizeBytes", "BucketName", var.k1_document_bucket_name, "StorageType", "StandardStorage", { period = 86400, stat = "Average" }],
          ["AWS/S3", "NumberOfObjects", "BucketName", var.k1_document_bucket_name, "StorageType", "AllStorageTypes", { period = 86400, stat = "Average" }],
        ]
      }
    },
    {
      type = "metric", width = 24, height = 6
      properties = {
        title = "BDA/Bedrock extraction jobs, throughput, retries, and failures", region = data.aws_region.current.name, period = 300
        metrics = [
          ["Atlas/K1Ingestion", "DocumentsProcessed", "Environment", var.environment_name, { stat = "Sum" }],
          ["Atlas/K1Ingestion", "PagesProcessed", "Environment", var.environment_name, { stat = "Sum" }],
          ["Atlas/K1Ingestion", "ExtractionFailures", "Environment", var.environment_name, { stat = "Sum" }],
          ["Atlas/K1Ingestion", "WorkerErrors", "Environment", var.environment_name, { stat = "Sum" }],
          ["Atlas/K1Ingestion", "ApplyFailures", "Environment", var.environment_name, { stat = "Sum" }],
          ["Atlas/K1Ingestion", "ReconciliationLagSeconds", "Environment", var.environment_name, { stat = "Maximum" }],
          ["Atlas/AbuseProtection", "RetryAttempts", "Environment", var.environment_name, { stat = "Sum" }],
          ["Atlas/AbuseProtection", "ProviderCalls", "Environment", var.environment_name, { stat = "Sum" }],
        ]
      }
    },
  ] })

  lifecycle {
    precondition {
      condition = var.environment_name != "production" || (
        try(trimspace(var.alarm_email), "") != "" && var.alarm_destination_confirmed
      )
      error_message = "Production requires a non-empty alarm_email and alarm_destination_confirmed=true after the SNS subscription is confirmed."
    }
  }
}
