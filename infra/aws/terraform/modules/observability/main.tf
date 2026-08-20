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
  evaluation_periods  = 3
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
  evaluation_periods  = 2
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
  evaluation_periods  = 2
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
  evaluation_periods  = 2
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
  evaluation_periods  = 2
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
  evaluation_periods  = each.key == "page-count" ? 1 : 2
  metric_name         = each.value.metric
  namespace           = "Atlas/K1Ingestion"
  period              = each.key == "page-count" ? 3600 : 300
  statistic           = each.value.statistic
  threshold           = each.value.threshold
  alarm_actions       = local.alarm_actions
}

data "aws_region" "current" {}

resource "aws_cloudwatch_dashboard" "k1_ingestion" {
  dashboard_name = "${var.name_prefix}-k1-ingestion"
  dashboard_body = jsonencode({ widgets = [
    { type = "metric", width = 12, height = 6, properties = { title = "K-1 queue age and depth", region = data.aws_region.current.name, metrics = [
      ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.k1_start_queue_name],
      [".", "ApproximateNumberOfMessagesVisible", ".", "."],
      ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.k1_completion_queue_name],
      [".", "ApproximateNumberOfMessagesVisible", ".", "."]
    ] } },
    { type = "metric", width = 12, height = 6, properties = { title = "K-1 extraction and apply health", region = data.aws_region.current.name, metrics = [
      ["Atlas/K1Ingestion", "ExtractionFailures"], [".", "ApplyFailures"], [".", "WorkerErrors"],
      [".", "ReconciliationLagSeconds"], [".", "PagesProcessed"]
    ] } }
  ] })
}
