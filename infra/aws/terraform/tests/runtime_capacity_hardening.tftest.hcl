mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"
}

run "production_security_posture" {
  command = plan

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  module {
    source = "./modules/security"
  }

  variables {
    name_prefix                       = "atlas-test"
    environment_name                  = "production"
    rate_limit_requests_per_5_minutes = 500
    waf_log_retention_days            = 30
  }

  assert {
    condition = (
      output.runtime_capacity_guardrails.alb_deletion_protection &&
      output.runtime_capacity_guardrails.alb_drop_invalid_headers &&
      output.runtime_capacity_guardrails.alb_desync_mitigation_mode == "strictest" &&
      output.runtime_capacity_guardrails.ecs_scaling_policy == "fixed" &&
      !output.runtime_capacity_guardrails.request_count_autoscaling
    )
    error_message = "Production security posture must harden the ALB and prohibit request-count ECS autoscaling."
  }
}

run "api_alb_ecr_and_fixed_capacity" {
  command = plan

  module {
    source = "./modules/api"
  }

  variables {
    name_prefix                 = "atlas-test"
    aws_region                  = "us-west-2"
    vpc_id                      = "vpc-0123456789abcdef0"
    private_subnet_ids          = ["subnet-private-a", "subnet-private-b"]
    alb_security_group_id       = "sg-0123456789abcdef0"
    api_security_group_id       = "sg-0123456789abcdef1"
    container_name              = "atlas-api"
    container_port              = 3000
    health_check_path           = "/health"
    api_image_tag               = "test"
    task_cpu                    = "512"
    task_memory                 = "1024"
    desired_count               = 2
    environment_variables       = {}
    secret_arns                 = {}
    log_retention_days          = 30
    ecr_image_tag_mutability    = "MUTABLE"
    ecr_force_delete            = false
    ecr_max_images              = 30
    ecr_untagged_retention_days = 7
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
      aws_lb.api.internal &&
      aws_lb.api.enable_deletion_protection &&
      aws_lb.api.drop_invalid_header_fields &&
      aws_lb.api.desync_mitigation_mode == "strictest"
    )
    error_message = "The production API ALB must be private, deletion-protected, reject invalid headers, and use strictest desync mitigation."
  }

  assert {
    condition = (
      aws_ecs_service.api.desired_count == var.desired_count &&
      var.runtime_capacity_guardrails.ecs_scaling_policy == "fixed" &&
      !var.runtime_capacity_guardrails.request_count_autoscaling
    )
    error_message = "The API service must use the fixed configured task count and prohibit request-count autoscaling."
  }

  assert {
    condition = (
      anytrue([
        for rule in jsondecode(aws_ecr_lifecycle_policy.api.policy).rules :
        rule.selection.tagStatus == "untagged" &&
        rule.selection.countType == "sinceImagePushed" &&
        rule.selection.countNumber == 7
      ]) &&
      anytrue([
        for rule in jsondecode(aws_ecr_lifecycle_policy.api.policy).rules :
        rule.selection.tagStatus == "any" &&
        rule.selection.countType == "imageCountMoreThan" &&
        rule.selection.countNumber == 30
      ])
    )
    error_message = "ECR must expire stale untagged images and cap the total retained image count."
  }
}
