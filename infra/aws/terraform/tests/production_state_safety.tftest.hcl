mock_provider "aws" {
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333", arn = "arn:aws:iam::111122223333:root", user_id = "111122223333" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

run "preserved_encrypted_native_locking_backend" {
  command = plan
  module { source = "./bootstrap" }

  variables {
    state_bucket_name        = "atlas-terraform-state-example"
    terraform_principal_arns = ["arn:aws:iam::111122223333:role/terraform-production"]
  }

  assert {
    condition = (
      output.state_bucket_region == "us-west-2" &&
      output.state_key_prefix == "atlas/" &&
      output.backend_config_example.key == "atlas/production/terraform.tfstate" &&
      output.backend_config_example.use_lockfile &&
      output.backend_config_example.encrypt
    )
    error_message = "Bootstrap must preserve the approved us-west-2 atlas backend and native lockfile."
  }

  assert {
    condition = (
      aws_kms_alias.terraform_state.name == "alias/atlas-terraform-state" &&
      aws_kms_key.terraform_state.enable_key_rotation &&
      aws_s3_bucket_versioning.terraform_state.versioning_configuration[0].status == "Enabled" &&
      alltrue([
        for rule in aws_s3_bucket_server_side_encryption_configuration.terraform_state.rule : alltrue([
          for setting in rule.apply_server_side_encryption_by_default : setting.sse_algorithm == "aws:kms"
        ])
      ])
    )
    error_message = "State must remain KMS-encrypted, versioned, and bound to the preserved alias."
  }
}
