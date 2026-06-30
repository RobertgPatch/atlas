variable "environment_name" {
  description = "Deployment environment name used in tags and resource names."
  type        = string
  default     = "production"
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

variable "app_domain" {
  description = "Single public app domain served by CloudFront, for example app.example.com."
  type        = string
}

variable "route53_hosted_zone_id" {
  description = "Route 53 hosted zone id for the app domain. Leave null until DNS is ready."
  type        = string
  default     = null
}

variable "budget_alert_email" {
  description = "Email address for AWS Budget notifications. Leave null until budget alerts are configured."
  type        = string
  default     = null
  sensitive   = true
}

variable "monthly_budget_limit_usd" {
  description = "Initial monthly AWS budget limit for the Liquidity deployment."
  type        = number
  default     = 100
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

variable "api_container_port" {
  description = "Container port exposed by the Atlas API."
  type        = number
  default     = 3000
}

variable "additional_tags" {
  description = "Additional tags applied to supported AWS resources."
  type        = map(string)
  default     = {}
}
