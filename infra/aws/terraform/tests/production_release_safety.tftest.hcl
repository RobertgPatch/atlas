mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

mock_provider "aws" { alias = "us_east_1" }

run "versioned_private_web_recovery" {
  command   = plan
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }
  module { source = "./modules/edge" }

  variables {
    name_prefix                  = "atlas-production"
    web_assets_bucket_name       = "atlas-production-web-assets"
    api_origin_domain_name       = "internal-atlas-production.us-west-2.elb.amazonaws.com"
    api_origin_arn               = "arn:aws:elasticloadbalancing:us-west-2:111122223333:loadbalancer/app/atlas-production/0000000000000000"
    web_acl_arn                  = "arn:aws:wafv2:us-east-1:111122223333:global/webacl/atlas-production/00000000-0000-0000-0000-000000000000"
    cloudfront_price_class       = "PriceClass_100"
    static_cache_policy_id       = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    api_cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    api_origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  }

  assert {
    condition = (
      aws_s3_bucket_versioning.web.versioning_configuration[0].status == "Enabled" &&
      aws_s3_bucket_public_access_block.web.block_public_acls &&
      aws_s3_bucket_public_access_block.web.block_public_policy &&
      aws_s3_bucket_public_access_block.web.restrict_public_buckets &&
      aws_cloudfront_distribution.this.web_acl_id == var.web_acl_arn
    )
    error_message = "Production web recovery requires private versioned objects behind CloudFront and WAF."
  }
}

run "api_automatic_rollback_and_immutable_artifacts" {
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
      alb_deletion_protection    = true, alb_drop_invalid_headers = true,
      alb_desync_mitigation_mode = "strictest", ecs_scaling_policy = "fixed",
      request_count_autoscaling  = false
    }
  }

  assert {
    condition = (
      aws_ecs_service.api.desired_count == 1 &&
      aws_ecs_service.api.deployment_circuit_breaker[0].enable &&
      aws_ecs_service.api.deployment_circuit_breaker[0].rollback &&
      aws_lb.api.enable_deletion_protection &&
      aws_ecr_repository.api.image_tag_mutability == "IMMUTABLE" &&
      aws_cloudwatch_log_group.api.retention_in_days == 30
    )
    error_message = "Production API activation requires automatic rollback, deletion protection, immutable artifacts, and retained logs."
  }
}
