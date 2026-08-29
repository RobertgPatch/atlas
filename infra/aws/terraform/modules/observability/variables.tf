variable "name_prefix" {
  description = "Name prefix for observability resources."
  type        = string
}

variable "environment_name" {
  description = "Deployment environment emitted as the aggregate application metric dimension."
  type        = string

  validation {
    condition     = var.environment_name == "production"
    error_message = "environment_name must be production."
  }
}

variable "alarm_email" {
  description = "Optional email address for CloudWatch alarm notifications."
  type        = string
  default     = null
  sensitive   = true
}

variable "alarm_destination_confirmed" {
  description = "Operator attestation that the production SNS email subscription has been confirmed."
  type        = bool
  default     = false
}

variable "cloudfront_distribution_id" {
  description = "CloudFront distribution id for edge traffic and error metrics."
  type        = string
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

variable "cloudfront_requests_threshold" {
  description = "CloudFront request-count threshold over five minutes."
  type        = number
  default     = 10000
}

variable "cloudfront_5xx_rate_threshold_percent" {
  description = "CloudFront 5xx error-rate threshold as a percentage over five minutes."
  type        = number
  default     = 5
}

variable "alb_requests_threshold" {
  description = "ALB request-count threshold over five minutes."
  type        = number
  default     = 5000
}

variable "alb_target_p95_latency_threshold_seconds" {
  description = "ALB target p95 response-time threshold in seconds over five minutes."
  type        = number
  default     = 2
}

variable "ecs_cluster_name" {
  description = "ECS cluster name shared by the API and K-1 worker."
  type        = string
}

variable "api_ecs_service_name" {
  description = "API ECS service name."
  type        = string
}

variable "k1_worker_ecs_service_name" {
  description = "K-1 worker ECS service name."
  type        = string
}

variable "k1_aws_ingestion_enabled" {
  description = "Whether K-1 AWS ingestion resources and their paid-service alarms are active."
  type        = bool
  default     = true
}

variable "ecs_cpu_threshold_percent" {
  description = "ECS service CPU utilization threshold over five minutes."
  type        = number
  default     = 80
}

variable "ecs_memory_threshold_percent" {
  description = "ECS service memory utilization threshold over five minutes."
  type        = number
  default     = 80
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

variable "k1_start_queue_name" {
  type = string
}

variable "k1_completion_queue_name" {
  type = string
}

variable "k1_document_bucket_name" {
  description = "S3 bucket containing K-1 inputs and provider output."
  type        = string
}

variable "s3_put_requests_threshold" {
  description = "S3 object-write request threshold over five minutes as the near-real-time storage-growth proxy."
  type        = number
  default     = 1000
}

variable "k1_queue_age_threshold_seconds" {
  type    = number
  default = 600
}

variable "k1_queue_depth_threshold" {
  type    = number
  default = 25
}

variable "k1_reconciliation_lag_threshold_seconds" {
  type    = number
  default = 900
}

variable "k1_page_count_threshold" {
  type    = number
  default = 10000
}

variable "abuse_protection_decision_threshold" {
  description = "Combined application throttle, admission rejection, and protection-decision threshold over five minutes."
  type        = number
  default     = 100
}

variable "provider_calls_threshold" {
  description = "Paid provider invocation threshold over five minutes."
  type        = number
  default     = 100
}

variable "retry_attempts_threshold" {
  description = "Paid-work retry threshold over five minutes."
  type        = number
  default     = 25
}

variable "cost_units_threshold" {
  description = "Estimated paid-work cost-unit threshold over five minutes."
  type        = number
  default     = 10000
}

variable "cleanup_failures_threshold" {
  description = "Retention cleanup failure threshold over five minutes."
  type        = number
  default     = 1
}

output "alarm_topic_arn" {
  description = "SNS alarm topic ARN, if configured."
  value       = length(aws_sns_topic.alarms) == 0 ? null : aws_sns_topic.alarms[0].arn
}

output "alarm_names" {
  description = "CloudWatch alarm names."
  value = concat(
    [
      aws_cloudwatch_metric_alarm.cloudfront_requests.alarm_name,
      aws_cloudwatch_metric_alarm.cloudfront_5xx_rate.alarm_name,
      aws_cloudwatch_metric_alarm.api_requests.alarm_name,
      aws_cloudwatch_metric_alarm.api_target_latency.alarm_name,
      aws_cloudwatch_metric_alarm.api_unhealthy_targets.alarm_name,
      aws_cloudwatch_metric_alarm.api_5xx.alarm_name,
      aws_cloudwatch_metric_alarm.rds_cpu.alarm_name,
      aws_cloudwatch_metric_alarm.rds_free_storage.alarm_name,
      aws_cloudwatch_metric_alarm.rds_connections.alarm_name,
      aws_cloudwatch_metric_alarm.scheduler_target_errors.alarm_name,
      aws_cloudwatch_metric_alarm.market_price_scheduler_target_errors.alarm_name,
      aws_cloudwatch_metric_alarm.waf_blocked_requests.alarm_name,
    ],
    [for alarm in aws_cloudwatch_metric_alarm.ecs_utilization : alarm.alarm_name],
    [for alarm in aws_cloudwatch_metric_alarm.s3_put_requests : alarm.alarm_name],
    [for alarm in aws_cloudwatch_metric_alarm.k1_queue_age : alarm.alarm_name],
    [for alarm in aws_cloudwatch_metric_alarm.k1_queue_depth : alarm.alarm_name],
    [for alarm in aws_cloudwatch_metric_alarm.k1_dlq_depth : alarm.alarm_name],
    [for alarm in aws_cloudwatch_metric_alarm.k1_workflow : alarm.alarm_name],
    [for alarm in aws_cloudwatch_metric_alarm.abuse_protection : alarm.alarm_name],
  )
}

output "dashboard_name" {
  description = "CloudWatch operations and cost dashboard name."
  value       = aws_cloudwatch_dashboard.k1_ingestion.dashboard_name
}
