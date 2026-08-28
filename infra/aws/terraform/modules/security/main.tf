terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

resource "aws_cloudwatch_log_group" "waf" {
  provider = aws.us_east_1

  name              = "aws-waf-logs-${var.name_prefix}"
  retention_in_days = var.waf_log_retention_days
}

resource "aws_wafv2_web_acl" "this" {
  provider = aws.us_east_1

  name        = "${var.name_prefix}-web-acl"
  description = "Atlas CloudFront WAF for managed rules and abusive request volume."
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-common"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-bad-inputs"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 30

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-ip-reputation"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "AWSManagedRulesAnonymousIpList"
    priority = 40

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAnonymousIpList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-anonymous-ip"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "api_general_per_ip"
    priority = 100

    action {
      dynamic "block" {
        for_each = var.api_general_rate_action == "block" ? [1] : []
        content {}
      }
      dynamic "count" {
        for_each = var.api_general_rate_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_requests_per_5_minutes
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            positional_constraint = "STARTS_WITH"
            search_string         = "/v1/"

            field_to_match {
              uri_path {}
            }

            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-api-general-per-ip"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "auth_per_ip"
    priority = 110

    action {
      dynamic "block" {
        for_each = var.auth_rate_action == "block" ? [1] : []
        content {}
      }
      dynamic "count" {
        for_each = var.auth_rate_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit              = var.auth_rate_limit_requests_per_5_minutes
        aggregate_key_type = "IP"

        scope_down_statement {
          and_statement {
            statement {
              byte_match_statement {
                positional_constraint = "EXACTLY"
                search_string         = "POST"

                field_to_match {
                  method {}
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }

            statement {
              regex_match_statement {
                regex_string = "^/v1/auth/(login|mfa/(enroll/complete|verify))$"

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-auth-per-ip"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "paid_admission_per_ip"
    priority = 120

    action {
      dynamic "block" {
        for_each = var.paid_admission_rate_action == "block" ? [1] : []
        content {}
      }
      dynamic "count" {
        for_each = var.paid_admission_rate_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit              = var.paid_admission_rate_limit_requests_per_5_minutes
        aggregate_key_type = "IP"

        scope_down_statement {
          or_statement {
            statement {
              and_statement {
                statement {
                  byte_match_statement {
                    positional_constraint = "EXACTLY"
                    search_string         = "POST"

                    field_to_match {
                      method {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }

                statement {
                  regex_match_statement {
                    regex_string = "^/v1/(k1-ingestion-batches(?:/[^/]+/complete-uploads)?|k1-documents/[^/]+/(reparse|retry-extraction)|plaid/(link-token|exchange-public-token)|reports/consolidated-holdings/refresh)$"

                    field_to_match {
                      uri_path {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }

            statement {
              and_statement {
                statement {
                  byte_match_statement {
                    positional_constraint = "EXACTLY"
                    search_string         = "GET"

                    field_to_match {
                      method {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }

                statement {
                  regex_match_statement {
                    regex_string = "^/v1/(reports/(consolidated-holdings/export|export)|k1-documents/export\\.csv)$"

                    field_to_match {
                      uri_path {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-paid-admission-per-ip"
      sampled_requests_enabled   = false
    }
  }

  rule {
    name     = "paid_admission_global_emergency"
    priority = 130

    action {
      dynamic "block" {
        for_each = var.paid_admission_global_emergency_action == "block" ? [1] : []
        content {}
      }
      dynamic "count" {
        for_each = var.paid_admission_global_emergency_action == "count" ? [1] : []
        content {}
      }
    }

    statement {
      rate_based_statement {
        limit              = var.paid_admission_global_emergency_requests_per_5_minutes
        aggregate_key_type = "CONSTANT"

        scope_down_statement {
          or_statement {
            statement {
              and_statement {
                statement {
                  byte_match_statement {
                    positional_constraint = "EXACTLY"
                    search_string         = "POST"

                    field_to_match {
                      method {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }

                statement {
                  regex_match_statement {
                    regex_string = "^/v1/(k1-ingestion-batches(?:/[^/]+/complete-uploads)?|k1-documents/[^/]+/(reparse|retry-extraction)|plaid/(link-token|exchange-public-token)|reports/consolidated-holdings/refresh)$"

                    field_to_match {
                      uri_path {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }

            statement {
              and_statement {
                statement {
                  byte_match_statement {
                    positional_constraint = "EXACTLY"
                    search_string         = "GET"

                    field_to_match {
                      method {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }

                statement {
                  regex_match_statement {
                    regex_string = "^/v1/(reports/(consolidated-holdings/export|export)|k1-documents/export\\.csv)$"

                    field_to_match {
                      uri_path {}
                    }

                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-paid-admission-global-emergency"
      sampled_requests_enabled   = false
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-web-acl"
    sampled_requests_enabled   = false
  }
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  provider = aws.us_east_1

  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.this.arn

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }

  redacted_fields {
    query_string {}
  }

  logging_filter {
    default_behavior = "DROP"

    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"

      condition {
        action_condition {
          action = "BLOCK"
        }
      }

      condition {
        action_condition {
          action = "COUNT"
        }
      }

      condition {
        action_condition {
          action = "CAPTCHA"
        }
      }

      condition {
        action_condition {
          action = "CHALLENGE"
        }
      }
    }
  }
}

locals {
  runtime_capacity_guardrails = {
    alb_deletion_protection    = var.environment_name == "production"
    alb_drop_invalid_headers   = true
    alb_desync_mitigation_mode = "strictest"
    ecs_scaling_policy         = "fixed"
    request_count_autoscaling  = false
  }
}
