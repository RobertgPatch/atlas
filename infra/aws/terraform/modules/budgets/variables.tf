variable "name_prefix" {
  description = "Name prefix for budget resources."
  type        = string
}

variable "monthly_limit_usd" {
  description = "Monthly budget limit in USD."
  type        = number
}

variable "alert_email" {
  description = "Optional email address for budget notifications."
  type        = string
  default     = null
  sensitive   = true
}

variable "notification_thresholds" {
  description = "Budget notification thresholds as percentages."
  type        = list(number)
}

output "budget_name" {
  description = "Monthly AWS Budget name."
  value       = aws_budgets_budget.monthly.name
}
