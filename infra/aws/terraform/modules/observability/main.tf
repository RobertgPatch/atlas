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
