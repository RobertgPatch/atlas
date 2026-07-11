locals {
  name_prefix           = "${var.project_name}-${var.environment_name}"
  configured_app_domain = var.app_domain == null ? null : trimspace(var.app_domain)
  custom_domain_enabled = local.configured_app_domain == null ? false : local.configured_app_domain != ""
  web_origin            = local.custom_domain_enabled ? "https://${local.configured_app_domain}" : ""

  common_tags = merge(
    {
      Project            = var.project_name
      Environment        = var.environment_name
      EnvironmentProfile = var.environment_cost_profile
      ManagedBy          = "terraform"
      Feature            = "plaid-refresh-policy"
    },
    local.custom_domain_enabled ? { AppDomain = local.configured_app_domain } : {},
    var.additional_tags,
  )

  runtime_secret_names = {
    DATABASE_URL           = "${local.name_prefix}/DATABASE_URL"
    PERSISTENCE_SECRET_KEY = "${local.name_prefix}/PERSISTENCE_SECRET_KEY"
    SESSION_SECRET         = "${local.name_prefix}/SESSION_SECRET"
    PLAID_CLIENT_ID        = "${local.name_prefix}/PLAID_CLIENT_ID"
    PLAID_SECRET           = "${local.name_prefix}/PLAID_SECRET"
    PLAID_ENV              = "${local.name_prefix}/PLAID_ENV"
    ATLAS_SCHEDULER_TOKEN  = "${local.name_prefix}/ATLAS_SCHEDULER_TOKEN"
    ADMIN_PASSWORD         = "${local.name_prefix}/ADMIN_PASSWORD"
    USER_PASSWORD          = "${local.name_prefix}/USER_PASSWORD"
  }

  api_environment_variables = {
    NODE_ENV                        = "production"
    PORT                            = tostring(var.api_container_port)
    REQUIRE_DURABLE_PERSISTENCE     = "true"
    WEB_ORIGIN                      = local.web_origin
    SESSION_COOKIE_SECURE           = "true"
    SESSION_COOKIE_SAMESITE         = "lax"
    PLAID_REFRESH_TIME_LOCAL        = var.plaid_refresh_time_local
    PLAID_REFRESH_TIMEZONE          = var.plaid_refresh_timezone
    PLAID_REFRESH_SCHEDULER_ENABLED = "true"
    PLAID_REFRESH_SCHEDULER_MODE    = "eventbridge"
    RATE_LIMIT_ENABLED              = "true"
    API_SHARED_CACHE_POLICY         = "no_shared_cache"
    AWS_REGION                      = var.aws_region
    AWS_APP_DOMAIN                  = local.configured_app_domain == null ? "" : local.configured_app_domain
    AWS_ENVIRONMENT_NAME            = var.environment_name
    AWS_ENVIRONMENT_PROFILE         = var.environment_cost_profile
  }

  refresh_time_parts     = split(":", var.plaid_refresh_time_local)
  refresh_schedule_cron  = "cron(${tonumber(local.refresh_time_parts[1])} ${tonumber(local.refresh_time_parts[0])} * * ? *)"
  web_assets_bucket_name = "${local.name_prefix}-web-assets"
  deployment_plan = {
    environment_name              = var.environment_name
    environment_cost_profile      = var.environment_cost_profile
    name_prefix                   = local.name_prefix
    domain_mode                   = local.custom_domain_enabled ? "custom_domain" : "cloudfront_default"
    app_domain                    = local.configured_app_domain
    web_origin                    = local.web_origin
    primary_region                = var.aws_region
    cloudfront_cert_region        = "us-east-1"
    route53_configured            = local.custom_domain_enabled && var.route53_hosted_zone_id != null
    supplied_acm_certificate      = var.acm_certificate_arn != null
    api_container_port            = var.api_container_port
    api_desired_count             = var.api_desired_count
    api_task_cpu                  = var.api_task_cpu
    api_task_memory               = var.api_task_memory
    database_instance_class       = var.database_instance_class
    database_allocated_storage_gb = var.database_allocated_storage_gb
    database_max_storage_gb       = var.database_max_allocated_storage_gb
    log_retention_days            = var.log_retention_days
    waf_log_retention_days        = var.waf_log_retention_days
    monthly_budget_limit_usd      = var.monthly_budget_limit_usd
    plaid_refresh_time_local      = var.plaid_refresh_time_local
    plaid_refresh_timezone        = var.plaid_refresh_timezone
    scheduler_expression          = local.refresh_schedule_cron
  }
}

module "network" {
  source = "./modules/network"

  name_prefix                    = local.name_prefix
  vpc_cidr                       = var.vpc_cidr
  availability_zones             = var.availability_zones
  public_subnet_cidrs            = var.public_subnet_cidrs
  private_subnet_cidrs           = var.private_subnet_cidrs
  api_container_port             = var.api_container_port
  api_origin_ingress_cidr_blocks = var.api_origin_ingress_cidr_blocks
  enable_nat_gateway             = var.enable_nat_gateway
}

module "database" {
  source = "./modules/database"

  name_prefix              = local.name_prefix
  private_subnet_ids       = module.network.private_subnet_ids
  rds_security_group_id    = module.network.rds_security_group_id
  database_name            = var.database_name
  master_username          = var.database_master_username
  postgres_engine_version  = var.postgres_engine_version
  instance_class           = var.database_instance_class
  allocated_storage_gb     = var.database_allocated_storage_gb
  max_allocated_storage_gb = var.database_max_allocated_storage_gb
  backup_retention_days    = var.database_backup_retention_days
  deletion_protection      = var.database_deletion_protection
  skip_final_snapshot      = var.database_skip_final_snapshot
}

module "secrets" {
  source = "./modules/secrets"

  secret_names            = local.runtime_secret_names
  recovery_window_in_days = var.secret_recovery_window_days
  enable_rotation         = var.enable_secret_rotation_placeholders
  rotation_lambda_arn     = var.secret_rotation_lambda_arn
  rotation_interval_days  = var.secret_rotation_interval_days
}

module "api" {
  source = "./modules/api"

  name_prefix              = local.name_prefix
  aws_region               = var.aws_region
  vpc_id                   = module.network.vpc_id
  public_subnet_ids        = module.network.public_subnet_ids
  private_subnet_ids       = module.network.private_subnet_ids
  alb_security_group_id    = module.network.alb_security_group_id
  api_security_group_id    = module.network.api_security_group_id
  container_name           = var.api_container_name
  container_port           = var.api_container_port
  health_check_path        = var.api_health_check_path
  api_image_tag            = var.api_image_tag
  task_cpu                 = var.api_task_cpu
  task_memory              = var.api_task_memory
  desired_count            = var.api_desired_count
  environment_variables    = local.api_environment_variables
  secret_arns              = module.secrets.secret_arns
  additional_secret_arns   = [module.database.master_user_secret_arn]
  log_retention_days       = var.log_retention_days
  ecr_image_tag_mutability = var.ecr_image_tag_mutability
  ecr_force_delete         = var.ecr_force_delete
}

module "security" {
  source = "./modules/security"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix                       = local.name_prefix
  rate_limit_requests_per_5_minutes = var.waf_rate_limit_requests_per_5_minutes
  waf_log_retention_days            = var.waf_log_retention_days
}

module "edge" {
  source = "./modules/edge"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix                  = local.name_prefix
  app_domain                   = local.configured_app_domain
  route53_hosted_zone_id       = var.route53_hosted_zone_id
  web_assets_bucket_name       = local.web_assets_bucket_name
  api_origin_domain_name       = module.api.api_load_balancer_dns_name
  api_origin_protocol_policy   = var.api_origin_protocol_policy
  web_acl_arn                  = module.security.web_acl_arn
  acm_certificate_arn          = var.acm_certificate_arn
  cloudfront_price_class       = var.cloudfront_price_class
  static_cache_policy_id       = var.static_cache_policy_id
  api_cache_policy_id          = var.api_cache_policy_id
  api_origin_request_policy_id = var.api_origin_request_policy_id
}

module "scheduler" {
  source = "./modules/scheduler"

  name_prefix             = local.name_prefix
  aws_region              = var.aws_region
  ecs_cluster_arn         = module.api.ecs_cluster_arn
  container_name          = "plaid-refresh"
  container_image         = module.api.api_container_image
  task_execution_role_arn = module.api.api_task_execution_role_arn
  task_role_arn           = module.api.api_task_role_arn
  task_cpu                = var.api_task_cpu
  task_memory             = var.api_task_memory
  private_subnet_ids      = module.network.private_subnet_ids
  security_group_ids      = [module.network.api_security_group_id]
  environment_variables   = local.api_environment_variables
  secret_arns             = module.secrets.secret_arns
  schedule_expression     = local.refresh_schedule_cron
  schedule_timezone       = var.plaid_refresh_timezone
  scheduler_enabled       = var.scheduler_enabled
  log_retention_days      = var.log_retention_days
}

module "observability" {
  source = "./modules/observability"

  name_prefix                      = local.name_prefix
  alarm_email                      = var.alarm_email
  api_load_balancer_arn_suffix     = module.api.api_load_balancer_arn_suffix
  api_target_group_arn_suffix      = module.api.api_target_group_arn_suffix
  api_5xx_threshold                = var.api_5xx_threshold
  db_instance_identifier           = module.database.db_instance_identifier
  rds_cpu_threshold_percent        = var.rds_cpu_threshold_percent
  rds_free_storage_threshold_bytes = var.rds_free_storage_threshold_bytes
  rds_connections_threshold        = var.rds_connections_threshold
  scheduler_schedule_name          = module.scheduler.schedule_name
  waf_web_acl_name                 = module.security.web_acl_name
  waf_blocked_requests_threshold   = var.waf_blocked_requests_threshold
}

module "budgets" {
  source = "./modules/budgets"

  name_prefix             = local.name_prefix
  monthly_limit_usd       = var.monthly_budget_limit_usd
  alert_email             = var.budget_alert_email
  notification_thresholds = var.budget_notification_thresholds
}
