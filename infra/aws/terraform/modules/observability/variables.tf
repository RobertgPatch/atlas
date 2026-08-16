variable "name_prefix" {
  description = "Name prefix for observability resources."
  type        = string
}

variable "alarm_email" {
  description = "Optional email address for CloudWatch alarm notifications."
  type        = string
  default     = null
  sensitive   = true
}

variable "api_load_balancer_arn_suffix" {
  description = "API ALB ARN suffix for metrics."
  type        = string
}

variable "api_target_group_arn_suffix" {
  description = "API target group ARN suffix for metrics."
  type        = string
}

variable "api_5xx_threshold" {
  description = "API target 5xx count threshold over five minutes."
  type        = number
}

variable "db_instance_identifier" {
  description = "RDS instance identifier."
  type        = string
}

variable "rds_cpu_threshold_percent" {
  description = "RDS CPU alarm threshold."
  type        = number
}

variable "rds_free_storage_threshold_bytes" {
  description = "RDS free storage alarm threshold in bytes."
  type        = number
}

variable "rds_connections_threshold" {
  description = "RDS connection count alarm threshold."
  type        = number
}

variable "scheduler_schedule_name" {
  description = "EventBridge Scheduler schedule name."
  type        = string
}

variable "market_price_scheduler_schedule_name" {
  description = "EventBridge Scheduler market price schedule name."
  type        = string
}

variable "waf_web_acl_name" {
  description = "WAF web ACL name."
  type        = string
}

variable "waf_blocked_requests_threshold" {
  description = "Blocked request threshold over five minutes."
  type        = number
}

output "alarm_topic_arn" {
  description = "SNS alarm topic ARN, if configured."
  value       = length(aws_sns_topic.alarms) == 0 ? null : aws_sns_topic.alarms[0].arn
}

output "alarm_names" {
  description = "CloudWatch alarm names."
  value = [
    aws_cloudwatch_metric_alarm.api_unhealthy_targets.alarm_name,
    aws_cloudwatch_metric_alarm.api_5xx.alarm_name,
    aws_cloudwatch_metric_alarm.rds_cpu.alarm_name,
    aws_cloudwatch_metric_alarm.rds_free_storage.alarm_name,
    aws_cloudwatch_metric_alarm.rds_connections.alarm_name,
    aws_cloudwatch_metric_alarm.scheduler_target_errors.alarm_name,
    aws_cloudwatch_metric_alarm.market_price_scheduler_target_errors.alarm_name,
    aws_cloudwatch_metric_alarm.waf_blocked_requests.alarm_name,
  ]
}
