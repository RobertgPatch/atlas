data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${var.name_prefix}-k1-worker"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid     = "K1ObjectEvidence"
    actions = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.documents.arn}/${var.input_prefix}/*",
      "${aws_s3_bucket.documents.arn}/${var.output_prefix}/*"
    ]
  }
  statement {
    sid       = "K1BucketMetadata"
    actions   = ["s3:GetBucketLocation", "s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }
  statement {
    sid = "K1Queues"
    actions = [
      "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes", "sqs:SendMessage"
    ]
    resources = [aws_sqs_queue.start.arn, aws_sqs_queue.completion.arn]
  }
  dynamic "statement" {
    for_each = var.enabled ? [1] : []
    content {
      sid     = "InvokePinnedK1BDA"
      actions = ["bedrock:InvokeDataAutomationAsync"]
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
      sid       = "ReadK1BDAStatus"
      actions   = ["bedrock:GetDataAutomationStatus"]
      resources = ["arn:aws:bedrock:${var.aws_region}::data-automation-invocation/*"]
    }
  }
  dynamic "statement" {
    for_each = var.enabled ? [1] : []
    content {
      sid     = "VerifyK1CheckboxesWithBedrock"
      actions = ["bedrock:InvokeModel"]
      resources = [
        "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-2-lite-v1:0",
        "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
      ]
    }
  }
  statement {
    sid = "K1Kms"
    actions = [
      "kms:Encrypt", "kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey", "kms:CreateGrant"
    ]
    resources = [aws_kms_key.documents.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "${var.name_prefix}-k1-worker"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

data "aws_iam_policy_document" "api" {
  statement {
    sid = "K1DirectUploads"
    actions = [
      "s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject",
      "s3:GetBucketLocation", "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/${var.input_prefix}/*"]
  }
  statement {
    sid       = "K1StartQueue"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.start.arn]
  }
  statement {
    sid       = "K1UploadKms"
    actions   = ["kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [aws_kms_key.documents.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.name_prefix}-k1-ingestion"
  role   = element(reverse(split("/", var.api_task_role_arn)), 0)
  policy = data.aws_iam_policy_document.api.json
}

data "aws_iam_policy_document" "events_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "reconciler_events" {
  name               = "${var.name_prefix}-k1-reconciler-events"
  assume_role_policy = data.aws_iam_policy_document.events_assume_role.json
}

data "aws_iam_policy_document" "reconciler_events" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = [aws_ecs_task_definition.worker.arn]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [var.task_execution_role_arn, aws_iam_role.worker.arn]
  }
}

resource "aws_iam_role_policy" "reconciler_events" {
  name   = "${var.name_prefix}-k1-reconciler-events"
  role   = aws_iam_role.reconciler_events.id
  policy = data.aws_iam_policy_document.reconciler_events.json
}
