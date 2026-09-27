mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333", arn = "arn:aws:iam::111122223333:root", user_id = "111122223333" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}
mock_provider "aws" { alias = "us_east_1" }
mock_provider "awscc" {}

run "csv_storage_and_default_off_prices" {
  command   = plan
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1, awscc = awscc }
  variables {
    environment_name             = "production"
    environment_cost_profile     = "production"
    enable_nat_gateway           = true
    k1_aws_ingestion_enabled     = false
    api_image_tag                = "0000000000000000000000000000000000000000"
    alarm_email                  = "ops@example.com"
    alarm_destination_confirmed  = true
    budget_alert_email           = "ops@example.com"
    budget_destination_confirmed = true
  }
  assert {
    condition     = local.api_environment_variables.REAL_TIME_EQUITIES_ENABLED == "false" && local.api_environment_variables.MARKET_PRICE_SCHEDULER_ENABLED == "false"
    error_message = "Both API and scheduler environment must default to CSV-only prices."
  }
  assert {
    condition     = local.api_environment_variables.LIQUIDITY_CSV_MAX_ROWS == "5000" && local.api_environment_variables.LIQUIDITY_CSV_PARSE_CONCURRENCY == "1"
    error_message = "CSV ingestion must keep its qualified capacity limits."
  }
  assert {
    condition     = aws_s3_bucket_versioning.liquidity_csv.versioning_configuration[0].status == "Enabled" && aws_s3_bucket_public_access_block.liquidity_csv.block_public_policy && aws_kms_key.liquidity_csv.enable_key_rotation
    error_message = "Originals must be private, encrypted and versioned."
  }
  assert {
    condition     = length(aws_s3_bucket_cors_configuration.liquidity_csv.cors_rule) == 1 && !var.real_time_equities_enabled
    error_message = "CSV CORS must be explicit and real-time prices remain opt-in."
  }
}
