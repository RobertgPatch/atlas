variable "environment_name" {
  description = "Deployment environment name used in tags and resource names. Use staging or production for the Atlas AWS environments."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment_name)
    error_message = "environment_name must be staging or production."
  }
}

variable "environment_cost_profile" {
  description = "Cost profile for environment-specific sizing and review notes. Staging may use cheaper settings while preserving topology."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment_cost_profile)
    error_message = "environment_cost_profile must be staging or production."
  }
}

variable "project_name" {
  description = "Project name used in tags and resource names."
  type        = string
  default     = "atlas"
}

variable "aws_region" {
  description = "Primary AWS region for regional services such as ECS, RDS, ECR, and Secrets Manager."
  type        = string
  default     = "us-west-2"
}

variable "availability_zones" {
  description = "Availability zones for public and private subnets."
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b"]
}

variable "app_domain" {
  description = "Optional public app domain served by CloudFront for this environment, for example staging.example.com or app.example.com. Set null to use the generated CloudFront domain for early staging smoke tests."
  type        = string
  default     = null
}

variable "route53_hosted_zone_id" {
  description = "Route 53 hosted zone id for the app domain. Leave null until DNS is ready."
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  description = "Optional existing us-east-1 ACM certificate ARN for CloudFront viewer TLS."
  type        = string
  default     = null
}

variable "vpc_cidr" {
  description = "CIDR block for the Atlas VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets."
  type        = list(string)
  default     = ["10.42.0.0/24", "10.42.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private API and RDS subnets."
  type        = list(string)
  default     = ["10.42.10.0/24", "10.42.11.0/24"]
}

variable "api_origin_ingress_cidr_blocks" {
  description = "CIDR blocks allowed to reach the public API origin ALB. Tighten this after CloudFront origin controls are finalized."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_nat_gateway" {
  description = "Create a NAT gateway so private API tasks can reach ECR, Plaid, and AWS APIs."
  type        = bool
  default     = true
}

variable "api_container_port" {
  description = "Container port exposed by the Atlas API."
  type        = number
  default     = 3000
}

variable "api_container_name" {
  description = "Atlas API ECS container name."
  type        = string
  default     = "atlas-api"
}

variable "api_image_tag" {
  description = "API image tag to deploy from ECR."
  type        = string
  default     = "latest"
}

variable "api_task_cpu" {
  description = "Fargate CPU units for the API task. Staging can use smaller values when the app remains healthy."
  type        = string
  default     = "512"
}

variable "api_task_memory" {
  description = "Fargate memory for the API task. Staging can use smaller values when the app remains healthy."
  type        = string
  default     = "1024"
}

variable "api_desired_count" {
  description = "Desired number of API tasks for this environment."
  type        = number
  default     = 1
}

variable "api_health_check_path" {
  description = "API health check path."
  type        = string
  default     = "/health"
}

variable "ecr_image_tag_mutability" {
  description = "ECR image tag mutability."
  type        = string
  default     = "MUTABLE"
}

variable "ecr_force_delete" {
  description = "Allow ECR repository deletion with images present in non-production test environments."
  type        = bool
  default     = false
}

variable "database_name" {
  description = "Initial RDS database name."
  type        = string
  default     = "atlas"
}

variable "database_master_username" {
  description = "RDS master username. Password is generated and stored by AWS."
  type        = string
  default     = "atlas_admin"
}

variable "postgres_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "16"
}

variable "database_instance_class" {
  description = "RDS PostgreSQL instance class for this environment."
  type        = string
  default     = "db.t4g.micro"
}

variable "database_allocated_storage_gb" {
  description = "Initial RDS storage in GiB for this environment."
  type        = number
  default     = 20
}

variable "database_max_allocated_storage_gb" {
  description = "Maximum RDS autoscaled storage in GiB for this environment."
  type        = number
  default     = 100
}

variable "database_backup_retention_days" {
  description = "RDS backup retention period."
  type        = number
  default     = 7
}

variable "database_deletion_protection" {
  description = "Whether RDS deletion protection is enabled."
  type        = bool
  default     = true
}

variable "database_skip_final_snapshot" {
  description = "Whether to skip the final RDS snapshot on destroy."
  type        = bool
  default     = false
}

variable "secret_recovery_window_days" {
  description = "Secrets Manager deletion recovery window."
  type        = number
  default     = 30
}

variable "enable_secret_rotation_placeholders" {
  description = "Configure Secrets Manager rotation placeholders when a rotation Lambda ARN is supplied."
  type        = bool
  default     = false
}

variable "secret_rotation_lambda_arn" {
  description = "Optional rotation Lambda ARN."
  type        = string
  default     = null
}

variable "secret_rotation_interval_days" {
  description = "Secret rotation interval in days."
  type        = number
  default     = 90
}

variable "plaid_refresh_time_local" {
  description = "Local daily Plaid refresh time."
  type        = string
  default     = "05:00"

  validation {
    condition     = can(regex("^[0-2][0-9]:[0-5][0-9]$", var.plaid_refresh_time_local))
    error_message = "plaid_refresh_time_local must be HH:MM."
  }
}

variable "plaid_refresh_timezone" {
  description = "IANA timezone for the daily Plaid refresh."
  type        = string
  default     = "America/Los_Angeles"
}

variable "scheduler_enabled" {
  description = "Whether the EventBridge Scheduler rule is enabled."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention for API and refresh task logs. Staging can use shorter retention."
  type        = number
  default     = 30
}

variable "waf_log_retention_days" {
  description = "CloudWatch log retention for WAF logs. Staging can use shorter retention."
  type        = number
  default     = 30
}

variable "waf_rate_limit_requests_per_5_minutes" {
  description = "WAF rate limit per IP over a 5-minute window."
  type        = number
  default     = 1000
}

variable "cloudfront_price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

variable "api_origin_protocol_policy" {
  description = "CloudFront protocol policy for the API ALB origin."
  type        = string
  default     = "http-only"
}

variable "static_cache_policy_id" {
  description = "CloudFront managed CachingOptimized policy id."
  type        = string
  default     = "658327ea-f89d-4fab-a63d-7e88639e58f6"
}

variable "api_cache_policy_id" {
  description = "CloudFront managed CachingDisabled policy id for /v1/*."
  type        = string
  default     = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
}

variable "api_origin_request_policy_id" {
  description = "CloudFront managed AllViewer policy id so authenticated API headers/cookies reach the origin."
  type        = string
  default     = "216adef6-5c7f-47e4-b989-5492eafa07d3"
}

variable "alarm_email" {
  description = "Optional email address for CloudWatch alarm notifications."
  type        = string
  default     = null
  sensitive   = true
}

variable "api_5xx_threshold" {
  description = "API target 5xx count threshold over five minutes."
  type        = number
  default     = 5
}

variable "rds_cpu_threshold_percent" {
  description = "RDS CPU alarm threshold."
  type        = number
  default     = 80
}

variable "rds_free_storage_threshold_bytes" {
  description = "RDS free storage alarm threshold in bytes."
  type        = number
  default     = 2147483648
}

variable "rds_connections_threshold" {
  description = "RDS connection count alarm threshold."
  type        = number
  default     = 40
}

variable "waf_blocked_requests_threshold" {
  description = "WAF blocked request alarm threshold over five minutes."
  type        = number
  default     = 100
}

variable "budget_alert_email" {
  description = "Email address for AWS Budget notifications. Leave null until budget alerts are configured."
  type        = string
  default     = null
  sensitive   = true
}

variable "monthly_budget_limit_usd" {
  description = "Monthly AWS budget limit for this environment."
  type        = number
  default     = 100
}

variable "budget_notification_thresholds" {
  description = "Budget alert thresholds as percentages of the monthly limit for this environment."
  type        = list(number)
  default     = [50, 80, 100]
}

variable "additional_tags" {
  description = "Additional tags applied to supported AWS resources. Use non-secret ownership or cost allocation tags only."
  type        = map(string)
  default     = {}
}
