variable "name_prefix" {
  description = "Name prefix for scheduler resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region for scheduler task logs."
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ECS cluster ARN."
  type        = string
}

variable "container_name" {
  description = "Scheduler container name."
  type        = string
}

variable "container_image" {
  description = "Container image containing the refresh CLI."
  type        = string
}

variable "task_execution_role_arn" {
  description = "ECS task execution role ARN."
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN."
  type        = string
}

variable "task_cpu" {
  description = "Fargate refresh task CPU units."
  type        = string
}

variable "task_memory" {
  description = "Fargate refresh task memory."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet ids for the refresh task."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group ids for the refresh task."
  type        = list(string)
}

variable "environment_variables" {
  description = "Non-secret environment variables for the refresh task."
  type        = map(string)
}

variable "secret_arns" {
  description = "Secret environment variables mapped to Secrets Manager ARNs."
  type        = map(string)
}

variable "schedule_expression" {
  description = "EventBridge Scheduler cron or rate expression."
  type        = string
}

variable "schedule_timezone" {
  description = "Timezone for the scheduler expression."
  type        = string
}

variable "scheduler_enabled" {
  description = "Whether the EventBridge schedule is enabled."
  type        = bool
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
}

output "schedule_arn" {
  description = "EventBridge Scheduler schedule ARN."
  value       = aws_scheduler_schedule.plaid_refresh.arn
}

output "schedule_name" {
  description = "EventBridge Scheduler schedule name."
  value       = aws_scheduler_schedule.plaid_refresh.name
}

output "refresh_task_definition_arn" {
  description = "Refresh task definition ARN."
  value       = aws_ecs_task_definition.refresh.arn
}

output "refresh_log_group_name" {
  description = "Refresh task log group name."
  value       = aws_cloudwatch_log_group.refresh.name
}
