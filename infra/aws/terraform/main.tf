locals {
  name_prefix = "${var.project_name}-${var.environment_name}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment_name
      ManagedBy   = "terraform"
      Feature     = "plaid-refresh-policy"
    },
    var.additional_tags,
  )

  deployment_plan = {
    app_domain               = var.app_domain
    primary_region           = var.aws_region
    cloudfront_cert_region   = "us-east-1"
    api_container_port       = var.api_container_port
    plaid_refresh_time_local = var.plaid_refresh_time_local
    plaid_refresh_timezone   = var.plaid_refresh_timezone
  }
}

# Resource modules are intentionally added in later phases after the manual AWS
# environment is created and compared. This root module establishes the shared
# inputs, provider aliases, tags, and output shape for that comparison.
