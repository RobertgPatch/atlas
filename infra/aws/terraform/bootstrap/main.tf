terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.82.0, < 6.0.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge({
      Project   = "atlas"
      Component = "terraform-state"
      ManagedBy = "terraform-bootstrap"
    }, var.additional_tags)
  }
}

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  normalized_state_key_prefix = "${trim(var.state_key_prefix, "/")}/"
  state_bucket_arn            = "arn:${data.aws_partition.current.partition}:s3:::${var.state_bucket_name}"
  state_object_arn            = "${local.state_bucket_arn}/${local.normalized_state_key_prefix}*"
}

data "aws_iam_policy_document" "state_kms" {
  statement {
    sid    = "AccountKeyAdministration"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "TerraformStateCryptographicAccess"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.terraform_principal_arns
    }

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["s3.${var.aws_region}.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:s3:arn"
      # S3 uses the bucket ARN as the encryption context when Bucket Keys are
      # enabled and the object ARN otherwise. Permit both forms, scoped to this
      # state bucket and state prefix.
      values = [
        local.state_bucket_arn,
        local.state_object_arn,
      ]
    }
  }
}

resource "aws_kms_key" "terraform_state" {
  description             = "Atlas Terraform state encryption"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.state_kms.json
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/atlas-terraform-state"
  target_key_id = aws_kms_key.terraform_state.key_id
}

resource "aws_s3_bucket" "terraform_state" {
  bucket        = var.state_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.terraform_state.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "recoverable-state-history"
    status = "Enabled"

    filter {
      prefix = local.normalized_state_key_prefix
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    noncurrent_version_expiration {
      newer_noncurrent_versions = var.noncurrent_versions_to_retain
      noncurrent_days           = var.noncurrent_version_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.terraform_state]
}

data "aws_iam_policy_document" "state_bucket" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      local.state_bucket_arn,
      "${local.state_bucket_arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "DenyNonKmsStateWrites"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:PutObject"]
    resources = [local.state_object_arn]

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }

  statement {
    sid    = "DenyWrongStateKmsKey"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:PutObject"]
    resources = [local.state_object_arn]

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption-aws-kms-key-id"
      values   = [aws_kms_key.terraform_state.arn]
    }
  }

  statement {
    sid    = "AllowBackendBucketMetadata"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.terraform_principal_arns
    }

    actions = [
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
    ]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid    = "AllowBackendPrefixListing"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.terraform_principal_arns
    }

    actions = [
      "s3:ListBucket",
      "s3:ListBucketVersions",
    ]
    resources = [local.state_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [local.normalized_state_key_prefix, "${local.normalized_state_key_prefix}*"]
    }
  }

  statement {
    sid    = "AllowBackendStateAccess"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.terraform_principal_arns
    }

    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
    ]
    resources = [local.state_object_arn]
  }

  statement {
    sid    = "AllowLockfileDeletion"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.terraform_principal_arns
    }

    actions   = ["s3:DeleteObject"]
    resources = ["${local.state_bucket_arn}/${local.normalized_state_key_prefix}*.tflock"]
  }
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = data.aws_iam_policy_document.state_bucket.json

  depends_on = [
    aws_s3_bucket_ownership_controls.terraform_state,
    aws_s3_bucket_public_access_block.terraform_state,
    aws_s3_bucket_server_side_encryption_configuration.terraform_state,
  ]
}
