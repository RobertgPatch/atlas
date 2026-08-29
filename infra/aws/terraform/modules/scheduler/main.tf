locals {
  container_environment = [
    for key, value in var.environment_variables : {
      name  = key
      value = value
    }
  ]

  plaid_container_secrets = [
    for key, arn in var.plaid_secret_arns : {
      name      = key
      valueFrom = arn
    }
  ]

  market_price_container_secrets = [
    for key, arn in var.market_price_secret_arns : {
      name      = key
      valueFrom = arn
    }
  ]
}

resource "aws_cloudwatch_log_group" "refresh" {
  name              = "/aws/ecs/${var.name_prefix}/plaid-refresh"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "market_price_refresh" {
  name              = "/aws/ecs/${var.name_prefix}/market-price-refresh"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "refresh" {
  family                   = "${var.name_prefix}-plaid-refresh"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name        = var.container_name
      image       = var.container_image
      essential   = true
      command     = ["node", "dist/scripts/run-plaid-refresh.js"]
      environment = local.container_environment
      secrets     = local.plaid_container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.refresh.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "refresh"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "market_price_refresh" {
  family                   = "${var.name_prefix}-market-price-refresh"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name        = var.container_name
      image       = var.container_image
      essential   = true
      command     = ["node", "dist/scripts/run-market-price-refresh.js"]
      environment = local.container_environment
      secrets     = local.market_price_container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.market_price_refresh.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "refresh"
        }
      }
    }
  ])
}

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name_prefix}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    actions = ["ecs:RunTask"]
    resources = [
      aws_ecs_task_definition.refresh.arn,
      aws_ecs_task_definition.market_price_refresh.arn,
    ]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.ecs_cluster_arn]
    }
  }

  statement {
    actions = ["iam:PassRole"]
    resources = [
      var.task_execution_role_arn,
      var.task_role_arn,
    ]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${var.name_prefix}-scheduler-run-task"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

resource "aws_scheduler_schedule" "plaid_refresh" {
  name                         = "${var.name_prefix}-plaid-refresh"
  description                  = "Daily Project Jackson Plaid holdings refresh."
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone
  state                        = var.scheduler_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.ecs_cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.refresh.arn
      launch_type         = "FARGATE"
      platform_version    = "LATEST"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = var.security_group_ids
        assign_public_ip = false
      }
    }

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 1
    }
  }
}

resource "aws_scheduler_schedule" "market_price_refresh" {
  name                         = "${var.name_prefix}-market-price-refresh"
  description                  = "Weekday Project Jackson closing-price refresh and liquidity valuation snapshot."
  schedule_expression          = var.market_price_schedule_expression
  schedule_expression_timezone = var.market_price_schedule_timezone
  state                        = var.market_price_scheduler_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.ecs_cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.market_price_refresh.arn
      launch_type         = "FARGATE"
      platform_version    = "LATEST"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = var.security_group_ids
        assign_public_ip = false
      }
    }

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 1
    }
  }
}
