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

variable "mfa_login_enabled" {
  description = "Require the existing MFA enrollment or verification flow after password validation. Evaluated when the API process starts."
  type        = bool
  default     = false
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

variable "market_data_provider" {
  description = "Server-side public-market data provider. Set to alpaca after populating its Secrets Manager credentials."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "alpaca"], var.market_data_provider)
    error_message = "market_data_provider must be none or alpaca."
  }
}

variable "market_data_refresh_on_read" {
  description = "Refresh stale market prices when a user reads the Liquidity report."
  type        = bool
  default     = true
}

variable "market_data_max_age_seconds" {
  description = "Maximum age of a cached quote before a user read requests a fresh price."
  type        = number
  default     = 60
}

variable "market_data_request_timeout_ms" {
  description = "Timeout for a market data provider request."
  type        = number
  default     = 4000
}

variable "alpaca_market_data_base_url" {
  description = "Alpaca Market Data API base URL."
  type        = string
  default     = "https://data.alpaca.markets"
}

variable "alpaca_market_data_feed" {
  description = "Alpaca stock feed: sip for consolidated coverage, iex for IEX-only, or delayed_sip."
  type        = string
  default     = "sip"

  validation {
    condition     = contains(["sip", "iex", "delayed_sip"], var.alpaca_market_data_feed)
    error_message = "alpaca_market_data_feed must be sip, iex, or delayed_sip."
  }
}

variable "market_price_refresh_time_local" {
  description = "Weekday closing-price refresh and Liquidity valuation snapshot time."
  type        = string
  default     = "16:20"

  validation {
    condition     = can(regex("^[0-2][0-9]:[0-5][0-9]$", var.market_price_refresh_time_local))
    error_message = "market_price_refresh_time_local must be HH:MM."
  }
}

variable "market_price_refresh_timezone" {
  description = "IANA timezone for the end-of-day market price refresh."
  type        = string
  default     = "America/New_York"
}

variable "market_price_scheduler_enabled" {
  description = "Whether the weekday closing-price and Liquidity snapshot schedule is enabled."
  type        = bool
  default     = false
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

variable "k1_aws_ingestion_enabled" {
  description = "Run the AWS K-1 worker and enable the staged AWS ingestion cohort; resources remain provisioned when false."
  type        = bool
  default     = false
}

variable "k1_input_prefix" {
  description = "Opaque prefix for original K-1 PDF objects."
  type        = string
  default     = "originals"
}

variable "k1_output_prefix" {
  description = "Opaque prefix for BDA raw results and evidence."
  type        = string
  default     = "extraction-results"
}

variable "k1_document_retention_days" {
  description = "Retention for K-1 originals and evidence; align with the approved tax-document policy."
  type        = number
  default     = 2555
}

variable "k1_noncurrent_retention_days" {
  description = "Retention for noncurrent versions of K-1 objects."
  type        = number
  default     = 365
}

variable "k1_force_destroy" {
  description = "Allow deletion of a non-empty K-1 bucket only in a disposable environment."
  type        = bool
  default     = false
}

variable "k1_worker_cpu" {
  type    = string
  default = "512"
}

variable "k1_worker_memory" {
  type    = string
  default = "1024"
}

variable "k1_worker_desired_count" {
  type    = number
  default = 1
}

variable "k1_worker_concurrency" {
  type    = number
  default = 10
}

variable "k1_reconciliation_schedule_expression" {
  type    = string
  default = "rate(5 minutes)"
}

variable "k1_bda_profile_arn" {
  description = "Optional approved BDA cross-Region inference profile ARN."
  type        = string
  default     = null
}

variable "k1_bda_stage" {
  type    = string
  default = "DEVELOPMENT"
  validation {
    condition     = contains(["DEVELOPMENT", "LIVE"], var.k1_bda_stage)
    error_message = "k1_bda_stage must be DEVELOPMENT or LIVE."
  }
}

variable "k1_bda_blueprint_version" {
  description = "Immutable evaluated version required when the BDA stage is LIVE."
  type        = string
  default     = ""
  validation {
    condition     = var.k1_bda_stage != "LIVE" || can(regex("^[0-9]+$", var.k1_bda_blueprint_version))
    error_message = "A numeric immutable K-1 blueprint version is required for LIVE."
  }
}

variable "k1_mapping_schema_version" {
  type    = string
  default = "k1-form-1065-v1"
}

variable "k1_upload_allowed_origins" {
  description = "Browser origins allowed to upload K-1 PDFs directly to S3."
  type        = list(string)
  default     = []
}
