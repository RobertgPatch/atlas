variable "name_prefix" {
  description = "Name prefix for security resources."
  type        = string
}

variable "rate_limit_requests_per_5_minutes" {
  description = "WAF rate limit per IP over a 5-minute window."
  type        = number
}

variable "waf_log_retention_days" {
  description = "CloudWatch retention for WAF logs."
  type        = number
}

output "web_acl_arn" {
  description = "CloudFront WAF web ACL ARN."
  value       = aws_wafv2_web_acl.this.arn
}

output "web_acl_name" {
  description = "CloudFront WAF web ACL name."
  value       = aws_wafv2_web_acl.this.name
}

output "waf_log_group_name" {
  description = "WAF log group name."
  value       = aws_cloudwatch_log_group.waf.name
}
