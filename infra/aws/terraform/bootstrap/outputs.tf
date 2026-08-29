output "state_bucket_name" {
  description = "S3 bucket used by the Project Jackson Terraform backend."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN of the Project Jackson Terraform state bucket."
  value       = aws_s3_bucket.terraform_state.arn
}

output "state_bucket_region" {
  description = "Region to pass to the S3 backend."
  value       = var.aws_region
}

output "state_key_prefix" {
  description = "Key prefix to use for environment state and native .tflock objects."
  value       = local.normalized_state_key_prefix
}

output "state_kms_key_arn" {
  description = "KMS key ARN that must be passed as kms_key_id to the S3 backend."
  value       = aws_kms_key.terraform_state.arn
}

output "backend_config_example" {
  description = "Non-secret partial backend settings for the sole AWS production state."
  value = {
    bucket       = aws_s3_bucket.terraform_state.id
    key          = "${local.normalized_state_key_prefix}production/terraform.tfstate"
    region       = var.aws_region
    encrypt      = true
    kms_key_id   = aws_kms_key.terraform_state.arn
    use_lockfile = true
  }
}

output "state_migration_command_example" {
  description = "One-time PowerShell command that migrates an existing local state after reviewing the backend values."
  value = join(" ", [
    "terraform -chdir=infra/aws/terraform init -migrate-state",
    "-backend-config=\"bucket=${aws_s3_bucket.terraform_state.id}\"",
    "-backend-config=\"key=${local.normalized_state_key_prefix}production/terraform.tfstate\"",
    "-backend-config=\"region=${var.aws_region}\"",
    "-backend-config=\"kms_key_id=${aws_kms_key.terraform_state.arn}\"",
  ])
}
