mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

run "always_on_right_sized_api" {
  command = plan

  module { source = "./modules/api" }

  variables {
    name_prefix                 = "atlas-production"
    aws_region                  = "us-west-2"
    vpc_id                      = "vpc-0123456789abcdef0"
    private_subnet_ids          = ["subnet-private-a", "subnet-private-b"]
    alb_security_group_id       = "sg-0123456789abcdef0"
    api_security_group_id       = "sg-0123456789abcdef1"
    container_name              = "atlas-api"
    container_port              = 3000
    health_check_path           = "/internal/readiness"
    api_image_tag               = "0123456789abcdef0123456789abcdef01234567"
    task_cpu                    = "256"
    task_memory                 = "512"
    desired_count               = 1
    environment_variables       = {}
    secret_arns                 = {}
    log_retention_days          = 30
    ecr_image_tag_mutability    = "IMMUTABLE"
    ecr_force_delete            = false
    ecr_max_images              = 10
    ecr_untagged_retention_days = 3
    runtime_capacity_guardrails = {
      alb_deletion_protection    = true
      alb_drop_invalid_headers   = true
      alb_desync_mitigation_mode = "strictest"
      ecs_scaling_policy         = "fixed"
      request_count_autoscaling  = false
    }
  }

  assert {
    condition = (
      aws_ecs_service.api.desired_count == 1 &&
      aws_ecs_task_definition.api.cpu == "256" &&
      aws_ecs_task_definition.api.memory == "512" &&
      aws_ecs_task_definition.api.runtime_platform[0].cpu_architecture == "X86_64"
    )
    error_message = "Routine production must keep one always-on x86 task at 256 CPU/512 MiB."
  }

  assert {
    condition = (
      aws_ecr_repository.api.image_tag_mutability == "IMMUTABLE" &&
      anytrue([for rule in jsondecode(aws_ecr_lifecycle_policy.api.policy).rules : rule.selection.countType == "imageCountMoreThan" && rule.selection.countNumber == 10]) &&
      anytrue([for rule in jsondecode(aws_ecr_lifecycle_policy.api.policy).rules : rule.selection.countType == "sinceImagePushed" && rule.selection.countNumber == 3])
    )
    error_message = "Production ECR must retain ten immutable releases and expire untagged images after three days."
  }

  assert {
    condition = (
      aws_ecs_service.api.deployment_circuit_breaker[0].enable &&
      aws_ecs_service.api.deployment_circuit_breaker[0].rollback
    )
    error_message = "Production ECS must enable deployment circuit-breaker rollback."
  }
}

run "notification_only_125_budget" {
  command = plan
  module { source = "./modules/budgets" }

  variables {
    name_prefix                              = "atlas-production"
    environment_name                         = "production"
    monthly_limit_usd                        = 125
    bedrock_monthly_limit_usd                = 25
    alert_email                              = "ops@example.com"
    budget_destination_confirmed             = true
    notification_thresholds                  = [80, 100]
    forecast_notification_thresholds         = [100]
    bedrock_notification_thresholds          = [100]
    bedrock_forecast_notification_thresholds = [100]
  }

  assert {
    condition = (
      aws_budgets_budget.monthly.limit_amount == "125" &&
      length(aws_budgets_budget.monthly.notification) > 0
    )
    error_message = "Production requires a notification-backed $125 monthly Budget."
  }
}

run "disabled_k1_omits_paid_component_alarms" {
  command = plan
  module { source = "./modules/observability" }

  variables {
    name_prefix                          = "atlas-production"
    environment_name                     = "production"
    alarm_email                          = "ops@example.com"
    alarm_destination_confirmed          = true
    cloudfront_distribution_id           = "E1234567890"
    api_load_balancer_arn_suffix         = "app/atlas-production/0000000000000000"
    api_target_group_arn_suffix          = "targetgroup/atlas-production/0000000000000000"
    api_5xx_threshold                    = 5
    ecs_cluster_name                     = "atlas-production-cluster"
    api_ecs_service_name                 = "atlas-production-api"
    k1_worker_ecs_service_name           = "atlas-production-k1-worker"
    k1_aws_ingestion_enabled             = false
    db_instance_identifier               = "atlas-production-postgres"
    rds_cpu_threshold_percent            = 80
    rds_free_storage_threshold_bytes     = 2147483648
    rds_connections_threshold            = 40
    scheduler_schedule_name              = "atlas-production-refresh"
    market_price_scheduler_schedule_name = "atlas-production-market-price"
    waf_web_acl_name                     = "atlas-production-waf"
    waf_blocked_requests_threshold       = 100
    k1_start_queue_name                  = "atlas-production-k1-start"
    k1_completion_queue_name             = "atlas-production-k1-completion"
    k1_document_bucket_name              = "atlas-production-k1-documents"
  }

  assert {
    condition = (
      length(aws_cloudwatch_metric_alarm.s3_put_requests) == 0 &&
      length(aws_cloudwatch_metric_alarm.k1_queue_age) == 0 &&
      length(aws_cloudwatch_metric_alarm.k1_queue_depth) == 0 &&
      length(aws_cloudwatch_metric_alarm.k1_dlq_depth) == 0 &&
      length(aws_cloudwatch_metric_alarm.k1_workflow) == 0 &&
      length(aws_cloudwatch_metric_alarm.ecs_utilization) == 2 &&
      length(aws_cloudwatch_metric_alarm.abuse_protection) == 5
    )
    error_message = "Disabled K-1 ingestion must omit K-1 paid-component alarms without removing active production alarms."
  }
}
