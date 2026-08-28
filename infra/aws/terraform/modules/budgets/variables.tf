variable "name_prefix" {
  description = "Name prefix for budget resources."
  type        = string
}

variable "environment_name" {
  description = "Deployment environment used to require confirmed production destinations."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment_name)
    error_message = "environment_name must be staging or production."
  }
}

variable "monthly_limit_usd" {
  description = "Monthly budget limit in USD."
  type        = number

  validation {
    condition     = var.monthly_limit_usd > 0
    error_message = "monthly_limit_usd must be greater than zero."
  }
}

variable "alert_email" {
  description = "Optional email address for budget notifications."
  type        = string
  default     = null
  sensitive   = true
}

variable "budget_destination_confirmed" {
  description = "Operator attestation that the production budget destination is correct and monitored."
  type        = bool
  default     = false
}

variable "notification_thresholds" {
  description = "Actual total-budget notification thresholds as percentages."
  type        = list(number)

  validation {
    condition     = length(var.notification_thresholds) > 0 && alltrue([for threshold in var.notification_thresholds : threshold > 0])
    error_message = "notification_thresholds must contain positive percentages."
  }
}

variable "forecast_notification_thresholds" {
  description = "Forecast total-budget notification thresholds as percentages."
  type        = list(number)
  default     = [80, 100]

  validation {
    condition     = length(var.forecast_notification_thresholds) > 0 && alltrue([for threshold in var.forecast_notification_thresholds : threshold > 0])
    error_message = "forecast_notification_thresholds must contain positive percentages."
  }
}

variable "bedrock_monthly_limit_usd" {
  description = "Monthly Bedrock budget limit in USD."
  type        = number

  validation {
    condition     = var.bedrock_monthly_limit_usd > 0
    error_message = "bedrock_monthly_limit_usd must be greater than zero."
  }
}

variable "bedrock_notification_thresholds" {
  description = "Actual Bedrock-budget notification thresholds as percentages."
  type        = list(number)
  default     = [50, 80, 100]

  validation {
    condition     = length(var.bedrock_notification_thresholds) > 0 && alltrue([for threshold in var.bedrock_notification_thresholds : threshold > 0])
    error_message = "bedrock_notification_thresholds must contain positive percentages."
  }
}

variable "bedrock_forecast_notification_thresholds" {
  description = "Forecast Bedrock-budget notification thresholds as percentages."
  type        = list(number)
  default     = [80, 100]

  validation {
    condition     = length(var.bedrock_forecast_notification_thresholds) > 0 && alltrue([for threshold in var.bedrock_forecast_notification_thresholds : threshold > 0])
    error_message = "bedrock_forecast_notification_thresholds must contain positive percentages."
  }
}

variable "cost_anomaly_threshold_usd" {
  description = "Minimum absolute service anomaly impact in USD before notification."
  type        = number
  default     = 10

  validation {
    condition     = var.cost_anomaly_threshold_usd > 0
    error_message = "cost_anomaly_threshold_usd must be greater than zero."
  }
}

output "budget_name" {
  description = "Monthly AWS Budget name."
  value       = aws_budgets_budget.monthly.name
}

output "k1_bedrock_budget_name" {
  description = "K-1 Bedrock-specific monthly budget name."
  value       = aws_budgets_budget.k1_bedrock.name
}

output "cost_anomaly_monitor_arn" {
  description = "Cost Anomaly Detection service monitor ARN."
  value       = aws_ce_anomaly_monitor.services.arn
}

output "cost_anomaly_subscription_arn" {
  description = "Cost Anomaly Detection subscription ARN, if configured."
  value       = length(aws_ce_anomaly_subscription.services) == 0 ? null : aws_ce_anomaly_subscription.services[0].arn
}
