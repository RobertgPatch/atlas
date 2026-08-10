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

variable "public_subnet_ids" {
  description = "Public subnet ids for the API load balancer."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet ids for API tasks."
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

variable "task_secret_arns" {
  description = "Secret ARNs the running application may retrieve at runtime."
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
  description = "Public DNS name for the API origin load balancer."
  value       = aws_lb.api.dns_name
}

output "api_load_balancer_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metric dimensions."
  value       = aws_lb.api.arn_suffix
}

output "api_target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch metric dimensions."
  value       = aws_lb_target_group.api.arn_suffix
}
