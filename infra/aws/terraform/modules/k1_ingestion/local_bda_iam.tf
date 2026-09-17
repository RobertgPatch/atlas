data "aws_iam_policy_document" "local_bda" {
  statement {
    sid = "LocalK1ObjectEvidence"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "${aws_s3_bucket.documents.arn}/${var.input_prefix}/*",
      "${aws_s3_bucket.documents.arn}/${var.output_prefix}/*",
    ]
  }

  statement {
    sid = "LocalK1BucketPreflight"
    actions = [
      "s3:GetBucketCORS",
      "s3:GetBucketLocation",
      "s3:ListBucket",
    ]
    resources = [aws_s3_bucket.documents.arn]
  }

  dynamic "statement" {
    for_each = var.enabled ? [1] : []
    content {
      sid = "LocalInvokePinnedK1BDA"
      actions = [
        "bedrock:GetDataAutomationProject",
        "bedrock:InvokeDataAutomationAsync",
      ]
      resources = compact([
        awscc_bedrock_data_automation_project.k1[0].project_arn,
        awscc_bedrock_blueprint.k1[0].blueprint_arn,
        awscc_bedrock_blueprint.fallback[0].blueprint_arn,
        var.bda_profile_arn,
      ])
    }
  }

  dynamic "statement" {
    for_each = var.enabled ? [1] : []
    content {
      sid       = "LocalReadK1BDAStatus"
      actions   = ["bedrock:GetDataAutomationStatus"]
      resources = ["arn:aws:bedrock:${var.aws_region}::data-automation-invocation/*"]
    }
  }

  statement {
    sid = "LocalK1Kms"
    actions = [
      "kms:CreateGrant",
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.documents.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

# This policy grants nothing by itself. An operator may attach it to a
# short-lived developer role after reviewing the production plan. Keeping the
# policy separate avoids reusing the ECS worker role or granting SQS/runtime
# permissions to a local session.
resource "aws_iam_policy" "local_bda" {
  name        = "${var.name_prefix}-local-k1-bda"
  description = "Scoped local K-1 S3/KMS/BDA access; attach only to an approved short-lived role"
  policy      = data.aws_iam_policy_document.local_bda.json
}
