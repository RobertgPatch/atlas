variable "secret_names" {
  description = "Map of runtime environment variable names to Secrets Manager secret names."
  type        = map(string)
}

variable "recovery_window_in_days" {
  description = "Secrets Manager recovery window for deleted secrets."
  type        = number
}

variable "enable_rotation" {
  description = "Whether to configure rotation for placeholder secrets."
  type        = bool
}

variable "rotation_lambda_arn" {
  description = "Optional rotation Lambda ARN. Leave null until rotation is explicitly implemented."
  type        = string
  default     = null
}

variable "rotation_interval_days" {
  description = "Rotation interval in days when rotation is enabled."
  type        = number
}

output "secret_arns" {
  description = "Map of runtime environment variable names to Secrets Manager ARNs."
  value       = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.arn }
}

output "secret_names" {
  description = "Map of runtime environment variable names to Secrets Manager names."
  value       = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.name }
}
