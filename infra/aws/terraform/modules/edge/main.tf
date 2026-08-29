terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

locals {
  s3_origin_id          = "${var.name_prefix}-web-s3"
  api_origin_id         = "${var.name_prefix}-api-origin"
  configured_app_domain = var.app_domain == null ? null : trimspace(var.app_domain)
  custom_domain_enabled = local.configured_app_domain == null ? false : local.configured_app_domain != ""
  certificate_arn = var.acm_certificate_arn != null ? (
    var.acm_certificate_arn
  ) : local.custom_domain_enabled ? aws_acm_certificate.viewer[0].arn : null
}

resource "aws_s3_bucket" "web" {
  bucket = var.web_assets_bucket_name
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "web_recovery" {
  bucket = aws_s3_bucket.web.id

  rule {
    id     = "bounded-noncurrent-release-recovery"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      newer_noncurrent_versions = 10
      noncurrent_days           = 30
    }
  }

  depends_on = [aws_s3_bucket_versioning.web]
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name_prefix}-web-oac"
  description                       = "Restrict Project Jackson web assets to CloudFront."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_vpc_origin" "api" {
  vpc_origin_endpoint_config {
    name                   = "${var.name_prefix}-api-origin"
    arn                    = var.api_origin_arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

resource "aws_acm_certificate" "viewer" {
  provider = aws.us_east_1
  count    = local.custom_domain_enabled && var.acm_certificate_arn == null ? 1 : 0

  domain_name       = local.configured_app_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = local.custom_domain_enabled && var.acm_certificate_arn == null && var.route53_hosted_zone_id != null ? {
    for option in aws_acm_certificate.viewer[0].domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  zone_id = var.route53_hosted_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "viewer" {
  provider = aws.us_east_1
  count    = local.custom_domain_enabled && var.acm_certificate_arn == null && var.route53_hosted_zone_id != null ? 1 : 0

  certificate_arn         = aws_acm_certificate.viewer[0].arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = "Project Jackson web and API edge"
  aliases             = local.custom_domain_enabled ? [local.configured_app_domain] : []
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  web_acl_id          = var.web_acl_arn

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    domain_name = var.api_origin_domain_name
    origin_id   = local.api_origin_id

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.api.id
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = var.static_cache_policy_id
  }

  ordered_cache_behavior {
    path_pattern           = "/health"
    target_origin_id       = local.api_origin_id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = var.static_cache_policy_id
  }

  ordered_cache_behavior {
    path_pattern             = "/v1/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = var.api_cache_policy_id
    origin_request_policy_id = var.api_origin_request_policy_id
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.certificate_arn == null
    acm_certificate_arn            = local.certificate_arn
    ssl_support_method             = local.certificate_arn == null ? null : "sni-only"
    minimum_protocol_version       = local.certificate_arn == null ? null : "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.viewer]
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json
}

resource "aws_route53_record" "app" {
  count = local.custom_domain_enabled && var.route53_hosted_zone_id != null ? 1 : 0

  zone_id = var.route53_hosted_zone_id
  name    = local.configured_app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
