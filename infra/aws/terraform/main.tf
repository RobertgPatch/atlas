locals {
  name_prefix              = "${var.project_name}-${var.environment_name}"
  configured_app_domain    = var.app_domain == null ? null : trimspace(var.app_domain)
  custom_domain_enabled    = local.configured_app_domain == null ? false : local.configured_app_domain != ""
  web_origin               = local.custom_domain_enabled ? "https://${local.configured_app_domain}" : ""
  k1_document_bucket_name  = "${local.name_prefix}-k1-documents-${data.aws_caller_identity.current.account_id}"
  k1_kms_alias_name        = "alias/${local.name_prefix}-k1-documents"
  k1_kms_alias_arn         = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${local.k1_kms_alias_name}"
  k1_start_queue_name      = "${local.name_prefix}-k1-start"
  k1_completion_queue_name = "${local.name_prefix}-k1-completion"
  k1_start_queue_url       = "https://sqs.${var.aws_region}.amazonaws.com/${data.aws_caller_identity.current.account_id}/${local.k1_start_queue_name}"
  k1_completion_queue_url  = "https://sqs.${var.aws_region}.amazonaws.com/${data.aws_caller_identity.current.account_id}/${local.k1_completion_queue_name}"
  k1_bda_profile_arn       = var.k1_bda_profile_arn == null ? "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:data-automation-profile/us.data-automation-v1" : var.k1_bda_profile_arn

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
    DATABASE_URL              = "${local.name_prefix}/DATABASE_URL"
    PERSISTENCE_SECRET_KEY    = "${local.name_prefix}/PERSISTENCE_SECRET_KEY"
    SESSION_SECRET            = "${local.name_prefix}/SESSION_SECRET"
    PLAID_CLIENT_ID           = "${local.name_prefix}/PLAID_CLIENT_ID"
    PLAID_SECRET              = "${local.name_prefix}/PLAID_SECRET"
    PLAID_ENV                 = "${local.name_prefix}/PLAID_ENV"
    ATLAS_SCHEDULER_TOKEN     = "${local.name_prefix}/ATLAS_SCHEDULER_TOKEN"
    ALPACA_MARKET_DATA_KEY_ID = "${local.name_prefix}/ALPACA_MARKET_DATA_KEY_ID"
    ALPACA_MARKET_DATA_SECRET = "${local.name_prefix}/ALPACA_MARKET_DATA_SECRET"
    ADMIN_PASSWORD            = "${local.name_prefix}/ADMIN_PASSWORD"
    USER_PASSWORD             = "${local.name_prefix}/USER_PASSWORD"
  }

  api_environment_variables = {
    NODE_ENV                        = "production"
    PORT                            = tostring(var.api_container_port)
    REQUIRE_DURABLE_PERSISTENCE     = "true"
    WEB_ORIGIN                      = local.web_origin
    SESSION_COOKIE_SECURE           = "true"
    SESSION_COOKIE_SAMESITE         = "lax"
    MFA_LOGIN_ENABLED               = tostring(var.mfa_login_enabled)
    PLAID_REFRESH_TIME_LOCAL        = var.plaid_refresh_time_local
    PLAID_REFRESH_TIMEZONE          = var.plaid_refresh_timezone
    PLAID_REFRESH_SCHEDULER_ENABLED = "true"
    PLAID_REFRESH_SCHEDULER_MODE    = "eventbridge"
    MARKET_DATA_PROVIDER            = var.market_data_provider
    MARKET_DATA_REFRESH_ON_READ     = tostring(var.market_data_refresh_on_read)
    MARKET_DATA_MAX_AGE_SECONDS     = tostring(var.market_data_max_age_seconds)
    MARKET_DATA_REQUEST_TIMEOUT_MS  = tostring(var.market_data_request_timeout_ms)
    ALPACA_MARKET_DATA_BASE_URL     = var.alpaca_market_data_base_url
    ALPACA_MARKET_DATA_FEED         = var.alpaca_market_data_feed
    RATE_LIMIT_ENABLED              = "true"
    API_SHARED_CACHE_POLICY         = "no_shared_cache"
    AWS_REGION                      = var.aws_region
    AWS_APP_DOMAIN                  = local.configured_app_domain == null ? "" : local.configured_app_domain
    AWS_ENVIRONMENT_NAME            = var.environment_name
    AWS_ENVIRONMENT_PROFILE         = var.environment_cost_profile
    K1_AWS_INGESTION_ENABLED        = tostring(var.k1_aws_ingestion_enabled)
    K1_EXTRACTOR                    = "aws_bda"
    K1_OBJECT_STORE                 = "s3"
    K1_QUEUE                        = "sqs"
    K1_S3_BUCKET                    = local.k1_document_bucket_name
    K1_KMS_KEY_ARN                  = local.k1_kms_alias_arn
    K1_S3_INPUT_PREFIX              = var.k1_input_prefix
    K1_S3_OUTPUT_PREFIX             = var.k1_output_prefix
    K1_WORK_QUEUE_URL               = local.k1_start_queue_url
    K1_COMPLETION_QUEUE_URL         = local.k1_completion_queue_url
    K1_MAPPING_SCHEMA_VERSION       = var.k1_mapping_schema_version
  }

  refresh_time_parts         = split(":", var.plaid_refresh_time_local)
  refresh_schedule_cron      = "cron(${tonumber(local.refresh_time_parts[1])} ${tonumber(local.refresh_time_parts[0])} * * ? *)"
  market_price_time_parts    = split(":", var.market_price_refresh_time_local)
  market_price_schedule_cron = "cron(${tonumber(local.market_price_time_parts[1])} ${tonumber(local.market_price_time_parts[0])} ? * MON-FRI *)"
  web_assets_bucket_name     = "${local.name_prefix}-web-assets"
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
    market_data_provider          = var.market_data_provider
    market_price_refresh_time     = var.market_price_refresh_time_local
    market_price_refresh_timezone = var.market_price_refresh_timezone
    market_price_schedule         = local.market_price_schedule_cron
  }
}

data "aws_caller_identity" "current" {}

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

  name_prefix           = local.name_prefix
  aws_region            = var.aws_region
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  api_security_group_id = module.network.api_security_group_id
  container_name        = var.api_container_name
  container_port        = var.api_container_port
  health_check_path     = var.api_health_check_path
  api_image_tag         = var.api_image_tag
  task_cpu              = var.api_task_cpu
  task_memory           = var.api_task_memory
  desired_count         = var.api_desired_count
  environment_variables = local.api_environment_variables
  secret_arns = {
    for key, arn in module.secrets.secret_arns : key => arn
    if var.market_data_provider == "alpaca" || !startswith(key, "ALPACA_MARKET_DATA_")
  }
  additional_secret_arns   = [module.database.master_user_secret_arn]
  log_retention_days       = var.log_retention_days
  ecr_image_tag_mutability = var.ecr_image_tag_mutability
  ecr_force_delete         = var.ecr_force_delete
}

module "k1_ingestion" {
  source = "./modules/k1_ingestion"

  providers = {
    aws   = aws
    awscc = awscc
  }

  name_prefix               = local.name_prefix
  aws_region                = var.aws_region
  aws_account_id            = data.aws_caller_identity.current.account_id
  enabled                   = var.k1_aws_ingestion_enabled
  document_bucket_name      = local.k1_document_bucket_name
  kms_alias_name            = local.k1_kms_alias_name
  input_prefix              = var.k1_input_prefix
  output_prefix             = var.k1_output_prefix
  retention_days            = var.k1_document_retention_days
  noncurrent_retention_days = var.k1_noncurrent_retention_days
  force_destroy             = var.k1_force_destroy
  start_queue_name          = local.k1_start_queue_name
  completion_queue_name     = local.k1_completion_queue_name
  ecs_cluster_arn           = module.api.ecs_cluster_arn
  container_image           = module.api.api_container_image
  task_execution_role_arn   = module.api.api_task_execution_role_arn
  api_task_role_arn         = module.api.api_task_role_arn
  private_subnet_ids        = module.network.private_subnet_ids
  security_group_ids        = [module.network.api_security_group_id]
  environment_variables     = local.api_environment_variables
  secret_arns = var.k1_aws_ingestion_enabled ? {
    for key, arn in module.secrets.secret_arns : key => arn
    if var.market_data_provider == "alpaca" || !startswith(key, "ALPACA_MARKET_DATA_")
  } : {}
  worker_cpu                         = var.k1_worker_cpu
  worker_memory                      = var.k1_worker_memory
  worker_desired_count               = var.k1_worker_desired_count
  worker_concurrency                 = var.k1_worker_concurrency
  log_retention_days                 = var.log_retention_days
  reconciliation_schedule_expression = var.k1_reconciliation_schedule_expression
  bda_profile_arn                    = local.k1_bda_profile_arn
  bda_stage                          = var.k1_bda_stage
  bda_blueprint_version              = var.k1_bda_blueprint_version
  mapping_schema_version             = var.k1_mapping_schema_version
  # CloudFront distribution hostnames can change when an environment is
  # recreated (for example, after moving AWS accounts). Always permit the
  # public URL provisioned by this stack in addition to any explicit local or
  # custom origins so direct browser uploads do not retain a stale CORS entry.
  upload_allowed_origins = distinct(concat(
    var.k1_upload_allowed_origins,
    [module.edge.public_web_url],
  ))
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
  secret_arns = {
    for key, arn in module.secrets.secret_arns : key => arn
    if var.market_data_provider == "alpaca" || !startswith(key, "ALPACA_MARKET_DATA_")
  }
  schedule_expression              = local.refresh_schedule_cron
  schedule_timezone                = var.plaid_refresh_timezone
  scheduler_enabled                = var.scheduler_enabled
  market_price_schedule_expression = local.market_price_schedule_cron
  market_price_schedule_timezone   = var.market_price_refresh_timezone
  market_price_scheduler_enabled   = var.market_price_scheduler_enabled
  log_retention_days               = var.log_retention_days
}

module "observability" {
  source = "./modules/observability"

  name_prefix                          = local.name_prefix
  alarm_email                          = var.alarm_email
  api_load_balancer_arn_suffix         = module.api.api_load_balancer_arn_suffix
  api_target_group_arn_suffix          = module.api.api_target_group_arn_suffix
  api_5xx_threshold                    = var.api_5xx_threshold
  db_instance_identifier               = module.database.db_instance_identifier
  rds_cpu_threshold_percent            = var.rds_cpu_threshold_percent
  rds_free_storage_threshold_bytes     = var.rds_free_storage_threshold_bytes
  rds_connections_threshold            = var.rds_connections_threshold
  scheduler_schedule_name              = module.scheduler.schedule_name
  market_price_scheduler_schedule_name = module.scheduler.market_price_schedule_name
  waf_web_acl_name                     = module.security.web_acl_name
  waf_blocked_requests_threshold       = var.waf_blocked_requests_threshold
  k1_start_queue_name                  = local.k1_start_queue_name
  k1_completion_queue_name             = local.k1_completion_queue_name
}

module "budgets" {
  source = "./modules/budgets"

  name_prefix             = local.name_prefix
  monthly_limit_usd       = var.monthly_budget_limit_usd
  alert_email             = var.budget_alert_email
  notification_thresholds = var.budget_notification_thresholds
}
