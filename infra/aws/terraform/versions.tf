terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.82.0, < 6.0.0"
    }
    awscc = {
      source  = "hashicorp/awscc"
      version = "~> 1.92"
    }
  }
}
