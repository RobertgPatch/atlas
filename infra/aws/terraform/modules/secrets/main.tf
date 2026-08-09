resource "aws_secretsmanager_secret" "runtime" {
  for_each = var.secret_names

  name                    = each.value
  recovery_window_in_days = var.recovery_window_in_days
}

resource "aws_secretsmanager_secret_rotation" "runtime" {
  for_each = var.enable_rotation && var.rotation_lambda_arn != null ? aws_secretsmanager_secret.runtime : {}

  secret_id           = each.value.id
  rotation_lambda_arn = var.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = var.rotation_interval_days
  }
}
