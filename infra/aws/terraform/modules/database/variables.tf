variable "name_prefix" {
  description = "Name prefix for database resources."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet ids for the RDS subnet group."
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "Security group id allowing PostgreSQL from the API tasks."
  type        = string
}

variable "database_name" {
  description = "Initial database name."
  type        = string
}

variable "master_username" {
  description = "RDS master username. Password is managed by AWS Secrets Manager."
  type        = string
}

variable "snapshot_identifier" {
  description = "Optional RDS snapshot identifier used for a one-time database restore."
  type        = string
  default     = null
  nullable    = true
}

variable "manage_master_user_password" {
  description = "Whether RDS manages the master password in Secrets Manager. Keep false for the initial snapshot restore, then set true on the next apply."
  type        = bool
  default     = true
}

variable "postgres_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string

  validation {
    condition     = var.instance_class == "db.t4g.micro"
    error_message = "Production database instance_class must be db.t4g.micro."
  }
}

variable "multi_az" {
  description = "Whether the initial database uses Multi-AZ. The approved one-user profile is explicitly Single-AZ."
  type        = bool
  default     = false

  validation {
    condition     = !var.multi_az
    error_message = "The approved production database profile is Single-AZ."
  }
}

variable "allocated_storage_gb" {
  description = "Initial RDS storage in GiB."
  type        = number

  validation {
    condition     = var.allocated_storage_gb == 20
    error_message = "Production allocated storage must start at 20 GiB."
  }
}

variable "max_allocated_storage_gb" {
  description = "Maximum RDS autoscaled storage in GiB."
  type        = number
}

variable "backup_retention_days" {
  description = "RDS point-in-time recovery retention period in days."
  type        = number

  validation {
    condition     = var.backup_retention_days == 35
    error_message = "Production RDS backup retention must remain at the 35-day maximum."
  }
}

variable "deletion_protection" {
  description = "Whether RDS deletion protection is enabled."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Whether to skip a final snapshot when destroying the RDS instance."
  type        = bool
}

output "db_instance_identifier" {
  description = "RDS instance identifier."
  value       = aws_db_instance.postgres.identifier
}

output "db_instance_arn" {
  description = "RDS instance ARN."
  value       = aws_db_instance.postgres.arn
}

output "db_endpoint" {
  description = "RDS endpoint hostname."
  value       = aws_db_instance.postgres.address
}

output "db_port" {
  description = "RDS PostgreSQL port."
  value       = aws_db_instance.postgres.port
}

output "master_user_secret_arn" {
  description = "AWS-managed RDS master user secret ARN."
  value       = try(aws_db_instance.postgres.master_user_secret[0].secret_arn, null)
}
