output "deployment_plan" {
  description = "Non-secret summary of the planned AWS Liquidity deployment."
  value       = local.deployment_plan
}

output "common_tags" {
  description = "Tags applied to supported AWS resources."
  value       = local.common_tags
}
