locals {
  worker_environment = merge(var.environment_variables, {
    K1_AWS_INGESTION_ENABLED      = tostring(var.enabled)
    K1_EXTRACTOR                  = "aws_bda"
    K1_OBJECT_STORE               = "s3"
    K1_QUEUE                      = "sqs"
    K1_S3_BUCKET                  = aws_s3_bucket.documents.id
    K1_KMS_KEY_ARN                = aws_kms_key.documents.arn
    K1_S3_INPUT_PREFIX            = var.input_prefix
    K1_S3_OUTPUT_PREFIX           = var.output_prefix
    K1_WORK_QUEUE_URL             = aws_sqs_queue.start.url
    K1_COMPLETION_QUEUE_URL       = aws_sqs_queue.completion.url
    K1_WORKER_CONCURRENCY         = tostring(var.worker_concurrency)
    K1_BDA_PROFILE_ARN            = var.bda_profile_arn
    K1_BDA_PROJECT_ARN            = var.enabled ? awscc_bedrock_data_automation_project.k1[0].project_arn : ""
    K1_BDA_PROJECT_STAGE          = var.enabled ? awscc_bedrock_data_automation_project.k1[0].project_stage : ""
    K1_BDA_BLUEPRINT_ARN          = var.enabled ? awscc_bedrock_blueprint.k1[0].blueprint_arn : ""
    K1_BDA_BLUEPRINT_VERSION      = var.bda_blueprint_version
    K1_MAPPING_SCHEMA_VERSION     = var.mapping_schema_version
    K1_BEDROCK_CHECKBOX_MODEL_ID  = "us.amazon.nova-2-lite-v1:0"
    K1_BEDROCK_CHECKBOX_MAX_BYTES = "5242880"
  })
  worker_environment_list = [for key, value in local.worker_environment : { name = key, value = value }]
  worker_secrets          = [for key, arn in var.secret_arns : { name = key, valueFrom = arn }]
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/ecs/${var.name_prefix}/k1-worker"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.name_prefix}-k1-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = aws_iam_role.worker.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([{
    name        = "k1-worker"
    image       = var.container_image
    essential   = true
    command     = ["node", "dist/workers/k1-extraction-worker.js"]
    environment = local.worker_environment_list
    secrets     = local.worker_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.worker.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "${var.name_prefix}-k1-worker"
  cluster         = var.ecs_cluster_arn
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.enabled ? var.worker_desired_count : 0
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }
}

resource "aws_cloudwatch_event_rule" "reconciler" {
  name                = "${var.name_prefix}-k1-reconciler"
  description         = "Recovers missed BDA completion events"
  schedule_expression = var.reconciliation_schedule_expression
  state               = var.enabled ? "ENABLED" : "DISABLED"
}

resource "aws_cloudwatch_event_target" "reconciler" {
  rule      = aws_cloudwatch_event_rule.reconciler.name
  target_id = "k1-reconciler-task"
  arn       = var.ecs_cluster_arn
  role_arn  = aws_iam_role.reconciler_events.arn
  ecs_target {
    task_definition_arn = aws_ecs_task_definition.worker.arn
    launch_type         = "FARGATE"
    task_count          = 1
    network_configuration {
      subnets          = var.private_subnet_ids
      security_groups  = var.security_group_ids
      assign_public_ip = false
    }
  }
  input = jsonencode({
    containerOverrides = [{
      name    = "k1-worker"
      command = ["node", "dist/scripts/run-k1-extraction-reconciler.js"]
    }]
  })
}
