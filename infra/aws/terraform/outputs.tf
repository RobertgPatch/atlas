output "deployment_plan" {
  description = "Non-secret summary of the planned AWS Liquidity deployment."
  value       = local.deployment_plan
}

output "common_tags" {
  description = "Tags applied to supported AWS resources."
  value       = local.common_tags
}

output "environment_review" {
  description = "Non-secret environment identifiers used for staging/production comparison."
  value = {
    environment_name         = var.environment_name
    environment_cost_profile = var.environment_cost_profile
    name_prefix              = local.name_prefix
    domain_mode              = local.custom_domain_enabled ? "custom_domain" : "cloudfront_default"
    app_domain               = local.configured_app_domain
    web_origin               = local.web_origin
    route53_configured       = local.custom_domain_enabled && var.route53_hosted_zone_id != null
    supplied_acm_certificate = var.acm_certificate_arn != null
    public_web_url           = module.edge.public_web_url
  }
}

output "network" {
  description = "Non-secret network resource ids for manual comparison."
  value = {
    environment_name      = var.environment_name
    vpc_id                = module.network.vpc_id
    public_subnet_ids     = module.network.public_subnet_ids
    private_subnet_ids    = module.network.private_subnet_ids
    alb_security_group_id = module.network.alb_security_group_id
    api_security_group_id = module.network.api_security_group_id
    rds_security_group_id = module.network.rds_security_group_id
  }
}

output "database" {
  description = "Non-secret RDS identifiers for manual comparison."
  value = {
    environment_name       = var.environment_name
    identifier             = module.database.db_instance_identifier
    endpoint               = module.database.db_endpoint
    port                   = module.database.db_port
    master_user_secret_arn = module.database.master_user_secret_arn
  }
}

output "runtime_secret_names" {
  description = "Secrets Manager names keyed by runtime environment variable. Values are not included."
  value = {
    environment_name = var.environment_name
    secret_names     = module.secrets.secret_names
  }
}

output "api" {
  description = "Non-secret API deployment identifiers."
  value = {
    environment_name         = var.environment_name
    ecr_repository_url       = module.api.ecr_repository_url
    ecs_cluster_arn          = module.api.ecs_cluster_arn
    task_definition_arn      = module.api.api_task_definition_arn
    log_group_name           = module.api.api_log_group_name
    load_balancer_dns_name   = module.api.api_load_balancer_dns_name
    load_balancer_arn_suffix = module.api.api_load_balancer_arn_suffix
    target_group_arn_suffix  = module.api.api_target_group_arn_suffix
  }
}

output "edge" {
  description = "Non-secret web and edge identifiers."
  value = {
    environment_name               = var.environment_name
    domain_mode                    = module.edge.domain_mode
    public_web_url                 = module.edge.public_web_url
    web_bucket_name                = module.edge.web_bucket_name
    cloudfront_distribution_id     = module.edge.cloudfront_distribution_id
    cloudfront_distribution_domain = module.edge.cloudfront_distribution_domain_name
    viewer_certificate_arn         = module.edge.viewer_certificate_arn
    waf_web_acl_arn                = module.security.web_acl_arn
  }
}

output "scheduler" {
  description = "Non-secret scheduler identifiers."
  value = {
    environment_name                 = var.environment_name
    schedule_name                    = module.scheduler.schedule_name
    schedule_arn                     = module.scheduler.schedule_arn
    refresh_task_definition_arn      = module.scheduler.refresh_task_definition_arn
    refresh_log_group_name           = module.scheduler.refresh_log_group_name
    market_price_schedule_name       = module.scheduler.market_price_schedule_name
    market_price_schedule_arn        = module.scheduler.market_price_schedule_arn
    market_price_task_definition_arn = module.scheduler.market_price_task_definition_arn
    market_price_log_group_name      = module.scheduler.market_price_log_group_name
  }
}

output "observability" {
  description = "Alarm, WAF log, and budget identifiers."
  value = {
    environment_name   = var.environment_name
    alarm_topic_arn    = module.observability.alarm_topic_arn
    alarm_names        = module.observability.alarm_names
    waf_log_group_name = module.security.waf_log_group_name
    budget_name        = module.budgets.budget_name
  }
}
