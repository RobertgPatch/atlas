variable "name_prefix" {
  description = "Name prefix for API resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region for logs and ECS resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC id."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet ids for the internal API load balancer and API tasks."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group id for the API load balancer."
  type        = string
}

variable "api_security_group_id" {
  description = "Security group id for API tasks."
  type        = string
}

variable "container_name" {
  description = "API container name."
  type        = string
}

variable "container_port" {
  description = "API container port."
  type        = number
}

variable "health_check_path" {
  description = "HTTP health check path."
  type        = string
}

variable "api_image_tag" {
  description = "API image tag to deploy."
  type        = string
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = string
}

variable "task_memory" {
  description = "Fargate task memory."
  type        = string
}

variable "desired_count" {
  description = "Desired API task count."
  type        = number

  validation {
    condition     = var.desired_count >= 0 && var.desired_count <= 4 && floor(var.desired_count) == var.desired_count
    error_message = "desired_count must be a fixed integer from 0 through 4."
  }
}

variable "runtime_capacity_guardrails" {
  description = "Mandatory ALB hardening and fixed ECS capacity posture from the security module."
  type = object({
    alb_deletion_protection    = bool
    alb_drop_invalid_headers   = bool
    alb_desync_mitigation_mode = string
    ecs_scaling_policy         = string
    request_count_autoscaling  = bool
  })
  default = {
    alb_deletion_protection    = false
    alb_drop_invalid_headers   = true
    alb_desync_mitigation_mode = "strictest"
    ecs_scaling_policy         = "fixed"
    request_count_autoscaling  = false
  }

  validation {
    condition = (
      var.runtime_capacity_guardrails.alb_drop_invalid_headers &&
      var.runtime_capacity_guardrails.alb_desync_mitigation_mode == "strictest" &&
      var.runtime_capacity_guardrails.ecs_scaling_policy == "fixed" &&
      !var.runtime_capacity_guardrails.request_count_autoscaling
    )
    error_message = "API runtime guardrails require invalid-header dropping, strictest desync mitigation, fixed ECS capacity, and no request-count autoscaling."
  }
}

variable "environment_variables" {
  description = "Non-secret environment variables for the API container."
  type        = map(string)
}

variable "secret_arns" {
  description = "Secret environment variables mapped to Secrets Manager ARNs."
  type        = map(string)
}

variable "additional_secret_arns" {
  description = "Additional secret ARNs the execution role may read."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
}

variable "ecr_image_tag_mutability" {
  description = "ECR image tag mutability."
  type        = string
}

variable "ecr_force_delete" {
  description = "Whether ECR can be deleted with images present."
  type        = bool
}

output "ecr_repository_url" {
  description = "ECR repository URL."
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "api_task_definition_arn" {
  description = "API task definition ARN."
  value       = aws_ecs_task_definition.api.arn
}

output "api_task_execution_role_arn" {
  description = "API task execution role ARN."
  value       = aws_iam_role.task_execution.arn
}

output "api_task_role_arn" {
  description = "API task role ARN."
  value       = aws_iam_role.task.arn
}

output "api_container_image" {
  description = "API container image reference."
  value       = local.api_image
}

output "api_log_group_name" {
  description = "API CloudWatch log group name."
  value       = aws_cloudwatch_log_group.api.name
}

output "api_load_balancer_dns_name" {
  description = "Private DNS name used only to wire the internal API load balancer to CloudFront."
  value       = aws_lb.api.dns_name
}

variable "ecr_max_images" {
  description = "Maximum recent ECR images retained after lifecycle expiration."
  type        = number
  default     = 30

  validation {
    condition     = var.ecr_max_images >= 2 && floor(var.ecr_max_images) == var.ecr_max_images
    error_message = "ecr_max_images must be an integer of at least 2."
  }
}

variable "ecr_untagged_retention_days" {
  description = "Days to retain untagged ECR images before lifecycle expiration."
  type        = number
  default     = 7

  validation {
    condition     = var.ecr_untagged_retention_days >= 1 && floor(var.ecr_untagged_retention_days) == var.ecr_untagged_retention_days
    error_message = "ecr_untagged_retention_days must be a positive integer."
  }
}

output "api_load_balancer_arn" {
  description = "Internal API load balancer ARN used to create the CloudFront VPC origin."
  value       = aws_lb.api.arn
}

output "api_load_balancer_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metric dimensions."
  value       = aws_lb.api.arn_suffix
}

output "api_target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch metric dimensions."
  value       = aws_lb_target_group.api.arn_suffix
}
