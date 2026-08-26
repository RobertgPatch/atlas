variable "aws_region" {
  description = "AWS region that stores Atlas Terraform state. Keep this aligned with the deployment backend configuration."
  type        = string
  default     = "us-west-2"
}

variable "state_bucket_name" {
  description = "Globally unique, DNS-compatible name for the Atlas Terraform state bucket."
  type        = string

  validation {
    condition = (
      length(var.state_bucket_name) >= 3
      && length(var.state_bucket_name) <= 63
      && can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.state_bucket_name))
    )
    error_message = "state_bucket_name must be a 3-63 character, lowercase DNS-compatible S3 bucket name."
  }
}

variable "state_key_prefix" {
  description = "Bucket key prefix reserved for Atlas state and .tflock objects."
  type        = string
  default     = "atlas"

  validation {
    condition = (
      trim(var.state_key_prefix, "/") != ""
      && !strcontains(var.state_key_prefix, "..")
    )
    error_message = "state_key_prefix must contain a non-empty relative prefix without '..'."
  }
}

variable "terraform_principal_arns" {
  description = "Existing IAM role or user ARNs allowed to read/write Atlas state and use its KMS key. Do not supply STS assumed-role session ARNs."
  type        = set(string)

  validation {
    condition = (
      length(var.terraform_principal_arns) > 0
      && alltrue([
        for arn in var.terraform_principal_arns :
        can(regex("^arn:[^:]+:iam::[0-9]{12}:(role|user)/.+$", arn))
      ])
    )
    error_message = "terraform_principal_arns must contain at least one IAM role or user ARN."
  }
}

variable "noncurrent_version_retention_days" {
  description = "Minimum age before old state object versions can expire. Current state versions never expire."
  type        = number
  default     = 90

  validation {
    condition     = var.noncurrent_version_retention_days >= 30
    error_message = "noncurrent_version_retention_days must be at least 30 days."
  }
}

variable "noncurrent_versions_to_retain" {
  description = "Minimum number of newer noncurrent state versions retained regardless of age."
  type        = number
  default     = 10

  validation {
    condition     = var.noncurrent_versions_to_retain >= 5
    error_message = "noncurrent_versions_to_retain must be at least 5."
  }
}

variable "kms_deletion_window_days" {
  description = "Recovery window if deletion of the Terraform-state KMS key is requested."
  type        = number
  default     = 30

  validation {
    condition     = var.kms_deletion_window_days >= 7 && var.kms_deletion_window_days <= 30
    error_message = "kms_deletion_window_days must be between 7 and 30 days."
  }
}

variable "additional_tags" {
  description = "Additional non-secret tags for bootstrap resources."
  type        = map(string)
  default     = {}
}
