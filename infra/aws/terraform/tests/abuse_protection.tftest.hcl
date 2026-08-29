# Security topology contract for internet-facing Atlas traffic.
#
# Component plans inspect resource-level controls, while the root plan verifies
# that the public output boundary does not leak the private origin hostname.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:root"
      user_id    = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"
}

mock_provider "awscc" {}

run "private_api_origin" {
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
    api_image_tag               = "0000000000000000000000000000000000000000"
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
  }

  assert {
    condition = (
      aws_lb.api.internal &&
      toset(aws_lb.api.subnets) == toset(var.private_subnet_ids)
    )
    error_message = "The API ALB must be internal and attached only to private subnets."
  }
}

run "no_public_alb_ingress" {
  command = plan

  module {
    source = "./modules/network"
  }

  variables {
    name_prefix          = "atlas-test"
    vpc_cidr             = "10.42.0.0/16"
    availability_zones   = ["us-west-2a", "us-west-2b"]
    public_subnet_cidrs  = ["10.42.0.0/24", "10.42.1.0/24"]
    private_subnet_cidrs = ["10.42.10.0/24", "10.42.11.0/24"]
    api_container_port   = 3000
    enable_nat_gateway   = false
  }

  assert {
    condition = length(aws_security_group.alb.ingress) == 1 && alltrue([
      for ingress in aws_security_group.alb.ingress :
      try(length(ingress.prefix_list_ids) == 1, false) &&
      try(length(ingress.cidr_blocks) == 0, true) &&
      try(length(ingress.ipv6_cidr_blocks) == 0, true)
    ])
    error_message = "The API ALB security group must accept only the CloudFront origin-facing managed prefix list, never public IPv4 or IPv6 ingress."
  }
}

run "no_public_origin_output" {
  command = plan

  variables {
    environment_name             = "production"
    environment_cost_profile     = "production"
    enable_nat_gateway           = true
    k1_aws_ingestion_enabled     = false
    api_image_tag                = "0000000000000000000000000000000000000000"
    alarm_email                  = "ops@example.com"
    alarm_destination_confirmed  = true
    budget_alert_email           = "ops@example.com"
    budget_destination_confirmed = true
  }

  assert {
    condition     = !contains(keys(output.api), "load_balancer_dns_name")
    error_message = "Root outputs must not publish the private API ALB DNS name."
  }
}

run "cloudfront_vpc_origin" {
  command = plan

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  module {
    source = "./modules/edge"
  }

  variables {
    name_prefix                  = "atlas-test"
    web_assets_bucket_name       = "atlas-test-web-assets"
    api_origin_domain_name       = "internal-atlas-test.us-west-2.elb.amazonaws.com"
    api_origin_arn               = "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/atlas-test/0000000000000000"
    web_acl_arn                  = "arn:aws:wafv2:us-east-1:123456789012:global/webacl/atlas-test/00000000-0000-0000-0000-000000000000"
    cloudfront_price_class       = "PriceClass_100"
    static_cache_policy_id       = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    api_cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    api_origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  }

  assert {
    condition = length([
      for origin in aws_cloudfront_distribution.this.origin : origin
      if strcontains(origin.origin_id, "api-origin") &&
      length(origin.vpc_origin_config) == 1 &&
      length(origin.custom_origin_config) == 0
    ]) == 1
    error_message = "CloudFront must reach the API through exactly one VPC origin, never a public custom origin."
  }

  assert {
    condition = alltrue([
      for required_path in ["/health", "/v1/*"] : length([
        for behavior in aws_cloudfront_distribution.this.ordered_cache_behavior : behavior
        if behavior.path_pattern == required_path && strcontains(behavior.target_origin_id, "api-origin")
      ]) == 1
    ])
    error_message = "Both public liveness and /v1 API traffic must use the private CloudFront VPC origin."
  }
}

run "waf_managed_and_rate_rules" {
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
    rate_limit_requests_per_5_minutes = 500
    waf_log_retention_days            = 7
  }

  assert {
    condition = alltrue([
      for required_group in [
        "AWSManagedRulesCommonRuleSet",
        "AWSManagedRulesKnownBadInputsRuleSet",
        "AWSManagedRulesAmazonIpReputationList",
        "AWSManagedRulesAnonymousIpList",
        ] : anytrue([
          for rule in aws_wafv2_web_acl.this.rule :
          try(rule.statement[0].managed_rule_group_statement[0].name, "") == required_group
      ])
    ])
    error_message = "The WAF must enable the AWS common, known-bad-input, IP-reputation, and anonymous-IP managed rule groups."
  }

  assert {
    condition = alltrue([
      for required_rule in [
        "api_general_per_ip",
        "auth_per_ip",
        "paid_admission_per_ip",
        "paid_admission_global_emergency",
        ] : contains(
        [for rule in aws_wafv2_web_acl.this.rule : lower(rule.name)],
        required_rule,
      )
    ])
    error_message = "The WAF must define distinct general API, auth, paid-admission, and global emergency rate rules."
  }

  assert {
    condition = alltrue([
      for rule in aws_wafv2_web_acl.this.rule :
      contains(
        ["api_general_per_ip", "auth_per_ip", "paid_admission_per_ip"],
        lower(rule.name),
        ) ? (
        try(rule.statement[0].rate_based_statement[0].aggregate_key_type, "") == "IP" &&
        length(try(rule.statement[0].rate_based_statement[0].scope_down_statement, [])) == 1
        ) : lower(rule.name) == "paid_admission_global_emergency" ? (
        try(rule.statement[0].rate_based_statement[0].aggregate_key_type, "") == "CONSTANT" &&
        length(try(rule.statement[0].rate_based_statement[0].scope_down_statement, [])) == 1
      ) : true
    ])
    error_message = "Per-source WAF rules must aggregate by IP and the paid emergency ceiling must aggregate globally; every rate rule must be route-scoped."
  }
}

run "safe_waf_logging" {
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
    rate_limit_requests_per_5_minutes = 500
    waf_log_retention_days            = 7
  }

  assert {
    condition = (
      try(aws_wafv2_web_acl_logging_configuration.this.logging_filter[0].default_behavior, "") == "DROP" &&
      try(alltrue([
        for required_action in ["BLOCK", "COUNT", "CAPTCHA", "CHALLENGE"] :
        contains(flatten([
          for filter in aws_wafv2_web_acl_logging_configuration.this.logging_filter[0].filter : [
            for condition in filter.condition :
            try(condition.action_condition[0].action, "")
            if filter.behavior == "KEEP"
          ]
        ]), required_action)
      ]), false)
    )
    error_message = "WAF logging must drop ordinary allows while retaining BLOCK, COUNT, CAPTCHA, and CHALLENGE events."
  }

  assert {
    condition = (
      contains([
        for field in aws_wafv2_web_acl_logging_configuration.this.redacted_fields :
        try(lower(field.single_header[0].name), "")
      ], "authorization") &&
      contains([
        for field in aws_wafv2_web_acl_logging_configuration.this.redacted_fields :
        try(lower(field.single_header[0].name), "")
      ], "cookie") &&
      anytrue([
        for field in aws_wafv2_web_acl_logging_configuration.this.redacted_fields :
        length(try(field.query_string, [])) == 1
      ])
    )
    error_message = "WAF logs must redact authorization, cookie, and query-string data."
  }
}
