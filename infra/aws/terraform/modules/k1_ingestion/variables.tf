variable "name_prefix" { type = string }
variable "aws_region" { type = string }
variable "aws_account_id" { type = string }
variable "enabled" { type = bool }
variable "document_bucket_name" { type = string }
variable "kms_alias_name" { type = string }
variable "input_prefix" { type = string }
variable "output_prefix" { type = string }
variable "retention_days" { type = number }
variable "noncurrent_retention_days" { type = number }
variable "force_destroy" { type = bool }
variable "start_queue_name" { type = string }
variable "completion_queue_name" { type = string }
variable "ecs_cluster_arn" { type = string }
variable "container_image" { type = string }
variable "task_execution_role_arn" { type = string }
variable "api_task_role_arn" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "security_group_ids" { type = list(string) }
variable "environment_variables" { type = map(string) }
variable "secret_arns" { type = map(string) }
variable "worker_cpu" { type = string }
variable "worker_memory" { type = string }
variable "worker_desired_count" { type = number }
variable "worker_concurrency" { type = number }
variable "log_retention_days" { type = number }
variable "reconciliation_schedule_expression" { type = string }
variable "bda_profile_arn" { type = string }
variable "bda_stage" {
  type = string
  validation {
    condition     = contains(["DEVELOPMENT", "LIVE"], var.bda_stage)
    error_message = "bda_stage must be DEVELOPMENT or LIVE."
  }
}
variable "bda_blueprint_version" { type = string }
variable "mapping_schema_version" { type = string }

variable "upload_allowed_origins" {
  description = "Browser origins allowed by the K-1 document bucket."
  type        = list(string)
}
