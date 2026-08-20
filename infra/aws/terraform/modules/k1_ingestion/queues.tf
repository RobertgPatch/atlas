resource "aws_sqs_queue" "start_dlq" {
  name                      = "${var.start_queue_name}-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "start" {
  name                       = var.start_queue_name
  visibility_timeout_seconds = 900
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.start_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue" "completion_dlq" {
  name                      = "${var.completion_queue_name}-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "completion" {
  name                       = var.completion_queue_name
  visibility_timeout_seconds = 900
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.completion_dlq.arn
    maxReceiveCount     = 5
  })
}
