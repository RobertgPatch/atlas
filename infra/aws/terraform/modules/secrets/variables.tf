variable "secret_names" {
  description = "Runtime environment variable names mapped to Secrets Manager names."
  type        = map(string)
}

variable "recovery_window_in_days" {
  description = "Number of days Secrets Manager retains deleted secrets for recovery."
  type        = number

  validation {
    condition = (
      var.recovery_window_in_days == 0 ||
      (
        var.recovery_window_in_days >= 7 &&
        var.recovery_window_in_days <= 30
      )
    )
    error_message = "recovery_window_in_days must be 0 or between 7 and 30."
  }
}

variable "enable_rotation" {
  description = "Whether to attach the configured rotation Lambda to every runtime secret."
  type        = bool
  default     = false
}

variable "rotation_lambda_arn" {
  description = "Optional Secrets Manager rotation Lambda ARN."
  type        = string
  default     = null
}

variable "rotation_interval_days" {
  description = "Automatic rotation interval in days."
  type        = number
  default     = 90

  validation {
    condition     = var.rotation_interval_days >= 1 && var.rotation_interval_days <= 1000
    error_message = "rotation_interval_days must be between 1 and 1000."
  }
}

output "secret_names" {
  description = "Runtime environment variable names mapped to Secrets Manager names."
  value       = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.name }
}

output "secret_arns" {
  description = "Runtime environment variable names mapped to Secrets Manager ARNs."
  value       = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.arn }
}
