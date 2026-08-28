terraform {
  # The backend is intentionally partial: operators supply the bucket, key,
  # region, and KMS key ARN at init time so no environment-specific state
  # coordinates are committed to source control. Native S3 lockfiles avoid a
  # separate DynamoDB locking dependency.
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

# One-time local-to-S3 migration procedure:
#
# 1. Apply infra/aws/terraform/bootstrap with a globally unique bucket name and
#    the IAM role/user ARNs that run Terraform. Record its backend outputs.
# 2. From infra/aws/terraform, run the following interactively (do not add
#    -input=false because Terraform must confirm the state migration):
#
#      terraform init -migrate-state `
#        -backend-config="bucket=<state-bucket>" `
#        -backend-config="key=atlas/<environment>/terraform.tfstate" `
#        -backend-config="region=<aws-region>" `
#        -backend-config="kms_key_id=<state-kms-key-arn>"
#
# 3. Run `terraform state pull` and `terraform plan` to verify the remote copy,
#    then confirm the state object and its .tflock object/version history in S3.
#    Only after that verification, remove the obsolete local terraform.tfstate
#    and terraform.tfstate.backup files. Subsequent deployment runs must supply
#    the same backend coordinates; the deployment script does not use or copy
#    local state.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

provider "awscc" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
