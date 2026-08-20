resource "aws_cloudwatch_event_rule" "bda_completion" {
  name        = "${var.name_prefix}-k1-bda-completion"
  description = "Routes terminal Bedrock Data Automation jobs to the K-1 completion queue"
  event_pattern = jsonencode({
    account = [var.aws_account_id]
    region  = [var.aws_region]
    source  = ["aws.bedrock"]
    detail-type = [
      "Bedrock Data Automation Job Succeeded",
      "Bedrock Data Automation Job Failed With Client Error",
      "Bedrock Data Automation Job Failed With Service Error"
    ]
  })
}

resource "aws_cloudwatch_event_target" "bda_completion" {
  rule      = aws_cloudwatch_event_rule.bda_completion.name
  target_id = "k1-completion-queue"
  arn       = aws_sqs_queue.completion.arn
}

data "aws_iam_policy_document" "completion_queue" {
  statement {
    sid       = "AllowEventBridgeBDACompletion"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.completion.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.bda_completion.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "completion" {
  queue_url = aws_sqs_queue.completion.id
  policy    = data.aws_iam_policy_document.completion_queue.json
}
