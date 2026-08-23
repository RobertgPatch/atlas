locals {
  k1_blueprint_schema       = file("${path.module}/../../../bda/blueprints/k1-form-1065.json")
  fallback_blueprint_schema = file("${path.module}/../../../bda/blueprints/fallback.json")
  blueprint_version         = trimspace(var.bda_blueprint_version) == "" ? null : var.bda_blueprint_version
}

resource "awscc_bedrock_blueprint" "k1" {
  blueprint_name = "${replace(var.name_prefix, "-", "_")}_k1_1065"
  type           = "DOCUMENT"
  schema         = local.k1_blueprint_schema
  kms_key_id     = aws_kms_key.documents.arn
  kms_encryption_context = {
    workload = "k1-ingestion"
  }
  tags = [{ key = "Workload", value = "k1-ingestion" }]
}

resource "awscc_bedrock_blueprint" "fallback" {
  blueprint_name = "${replace(var.name_prefix, "-", "_")}_k1_fallback"
  type           = "DOCUMENT"
  schema         = local.fallback_blueprint_schema
  kms_key_id     = aws_kms_key.documents.arn
  kms_encryption_context = {
    workload = "k1-ingestion"
  }
  tags = [{ key = "Workload", value = "k1-ingestion" }]
}

resource "awscc_bedrock_data_automation_project" "k1" {
  project_name        = "${replace(var.name_prefix, "-", "_")}_k1_ingestion"
  project_description = "Schedule K-1 Form 1065 extraction with grounded document evidence"
  project_type        = "ASYNC"
  kms_key_id          = aws_kms_key.documents.arn
  kms_encryption_context = {
    workload = "k1-ingestion"
  }
  standard_output_configuration = {
    document = {
      extraction = {
        granularity  = { types = ["DOCUMENT", "PAGE", "ELEMENT"] }
        bounding_box = { state = "ENABLED" }
      }
      generative_field = { state = "DISABLED" }
      output_format = {
        text_format            = { types = ["PLAIN_TEXT"] }
        additional_file_format = { state = "DISABLED" }
      }
    }
  }
  custom_output_configuration = {
    blueprints = [{
      blueprint_arn     = awscc_bedrock_blueprint.k1.blueprint_arn
      blueprint_stage   = awscc_bedrock_blueprint.k1.blueprint_stage
      blueprint_version = local.blueprint_version
    }]
    document = {
      fallback_blueprints = [{
        blueprint_arn     = awscc_bedrock_blueprint.fallback.blueprint_arn
        blueprint_stage   = awscc_bedrock_blueprint.fallback.blueprint_stage
        blueprint_version = local.blueprint_version
      }]
    }
  }
  override_configuration = {
    document = { splitter = { state = "ENABLED" } }
  }
  tags = [{ key = "Workload", value = "k1-ingestion" }]
}
