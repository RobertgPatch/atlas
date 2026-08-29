variable "name_prefix" {
  description = "Name prefix for security resources."
  type        = string
}

variable "environment_name" {
  description = "Deployment environment used to select mandatory runtime infrastructure guardrails."
  type        = string
  default     = "production"

  validation {
    condition     = var.environment_name == "production"
    error_message = "environment_name must be production."
  }
}

variable "rate_limit_requests_per_5_minutes" {
  description = "General /v1 API WAF rate limit per IP over a 5-minute window."
  type        = number

  validation {
    condition     = var.rate_limit_requests_per_5_minutes >= 10 && floor(var.rate_limit_requests_per_5_minutes) == var.rate_limit_requests_per_5_minutes
    error_message = "rate_limit_requests_per_5_minutes must be an integer of at least 10."
  }
}

variable "api_general_rate_action" {
  description = "Rollout action for the general /v1 per-IP rate rule. Use count during observation, then block."
  type        = string
  default     = "block"

  validation {
    condition     = contains(["count", "block"], var.api_general_rate_action)
    error_message = "api_general_rate_action must be count or block."
  }
}

variable "auth_rate_limit_requests_per_5_minutes" {
  description = "Authentication-path WAF rate limit per IP over a 5-minute window."
  type        = number
  default     = 100

  validation {
    condition     = var.auth_rate_limit_requests_per_5_minutes >= 10 && floor(var.auth_rate_limit_requests_per_5_minutes) == var.auth_rate_limit_requests_per_5_minutes
    error_message = "auth_rate_limit_requests_per_5_minutes must be an integer of at least 10."
  }
}

variable "auth_rate_action" {
  description = "Rollout action for the auth per-IP rate rule. Use count during observation, then block."
  type        = string
  default     = "count"

  validation {
    condition     = contains(["count", "block"], var.auth_rate_action)
    error_message = "auth_rate_action must be count or block."
  }
}

variable "paid_admission_rate_limit_requests_per_5_minutes" {
  description = "Paid-admission-path WAF rate limit per IP over a 5-minute window."
  type        = number
  default     = 100

  validation {
    condition     = var.paid_admission_rate_limit_requests_per_5_minutes >= 10 && floor(var.paid_admission_rate_limit_requests_per_5_minutes) == var.paid_admission_rate_limit_requests_per_5_minutes
    error_message = "paid_admission_rate_limit_requests_per_5_minutes must be an integer of at least 10."
  }
}

variable "paid_admission_rate_action" {
  description = "Rollout action for the paid-admission per-IP rate rule. Use count during observation, then block."
  type        = string
  default     = "count"

  validation {
    condition     = contains(["count", "block"], var.paid_admission_rate_action)
    error_message = "paid_admission_rate_action must be count or block."
  }
}

variable "paid_admission_global_emergency_requests_per_5_minutes" {
  description = "Count-all emergency ceiling for paid-admission paths over a 5-minute window."
  type        = number
  default     = 500

  validation {
    condition     = var.paid_admission_global_emergency_requests_per_5_minutes >= 10 && floor(var.paid_admission_global_emergency_requests_per_5_minutes) == var.paid_admission_global_emergency_requests_per_5_minutes
    error_message = "paid_admission_global_emergency_requests_per_5_minutes must be an integer of at least 10."
  }
}

variable "paid_admission_global_emergency_action" {
  description = "Rollout action for the count-all paid-admission emergency rule. Use count during observation, then block."
  type        = string
  default     = "count"

  validation {
    condition     = contains(["count", "block"], var.paid_admission_global_emergency_action)
    error_message = "paid_admission_global_emergency_action must be count or block."
  }
}

variable "waf_log_retention_days" {
  description = "CloudWatch retention for WAF logs."
  type        = number
}

output "web_acl_arn" {
  description = "CloudFront WAF web ACL ARN."
  value       = aws_wafv2_web_acl.this.arn
}

output "web_acl_name" {
  description = "CloudFront WAF web ACL name."
  value       = aws_wafv2_web_acl.this.name
}

output "waf_log_group_name" {
  description = "WAF log group name."
  value       = aws_cloudwatch_log_group.waf.name
}

output "runtime_capacity_guardrails" {
  description = "Non-overridable ALB and ECS cost/security posture consumed by the API module."
  value       = local.runtime_capacity_guardrails
}
