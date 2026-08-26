variable "name_prefix" {
  description = "Name prefix for edge resources."
  type        = string
}

variable "app_domain" {
  description = "Optional public app domain. Set null to use the generated CloudFront domain and default CloudFront certificate."
  type        = string
  default     = null
}

variable "route53_hosted_zone_id" {
  description = "Route 53 hosted zone id. Leave null to skip DNS records."
  type        = string
  default     = null
}

variable "web_assets_bucket_name" {
  description = "S3 bucket name for static web assets."
  type        = string
}

variable "api_origin_domain_name" {
  description = "Private API load balancer DNS name used inside the CloudFront VPC origin."
  type        = string
}

variable "api_origin_arn" {
  description = "Internal API load balancer ARN attached to the CloudFront VPC origin."
  type        = string
}

variable "web_acl_arn" {
  description = "CloudFront WAF web ACL ARN."
  type        = string
}

variable "acm_certificate_arn" {
  description = "Optional existing us-east-1 ACM certificate ARN for the app domain."
  type        = string
  default     = null
}

variable "cloudfront_price_class" {
  description = "CloudFront price class."
  type        = string
}

variable "static_cache_policy_id" {
  description = "CloudFront cache policy id for static web assets."
  type        = string
}

variable "api_cache_policy_id" {
  description = "CloudFront cache policy id for /v1/* API traffic. Use CachingDisabled."
  type        = string
}

variable "api_origin_request_policy_id" {
  description = "CloudFront origin request policy id for /v1/* API traffic."
  type        = string
}

output "web_bucket_name" {
  description = "S3 web assets bucket name."
  value       = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "public_web_url" {
  description = "Public web URL for the environment."
  value = local.custom_domain_enabled ? (
    "https://${local.configured_app_domain}"
  ) : "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "domain_mode" {
  description = "Whether CloudFront uses a custom app domain or the generated default domain."
  value       = local.custom_domain_enabled ? "custom_domain" : "cloudfront_default"
}

output "viewer_certificate_arn" {
  description = "ACM certificate ARN used by CloudFront."
  value       = local.certificate_arn
}
