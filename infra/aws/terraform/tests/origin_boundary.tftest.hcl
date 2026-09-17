# Native component assertions for the only-public-edge production boundary.

mock_provider "aws" {
  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-cloudfront-origin-facing" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

run "immediate_upstream_security_groups" {
  command = plan
  module { source = "./modules/network" }

  override_resource {
    target          = aws_security_group.alb
    override_during = plan
    values          = { id = "sg-alb" }
  }

  override_resource {
    target          = aws_security_group.api
    override_during = plan
    values          = { id = "sg-api" }
  }

  variables {
    name_prefix          = "atlas-test"
    vpc_cidr             = "10.42.0.0/16"
    availability_zones   = ["us-west-2a", "us-west-2b"]
    public_subnet_cidrs  = ["10.42.0.0/24", "10.42.1.0/24"]
    private_subnet_cidrs = ["10.42.10.0/24", "10.42.11.0/24"]
    api_container_port   = 3000
    enable_nat_gateway   = false
  }

  assert {
    condition = (
      length(aws_security_group.alb.ingress) == 1 &&
      toset(one(aws_security_group.alb.ingress).prefix_list_ids) == toset(["pl-cloudfront-origin-facing"]) &&
      length(aws_security_group.api.ingress) == 1 &&
      toset(one(aws_security_group.api.ingress).security_groups) == toset(["sg-alb"]) &&
      length(aws_security_group.rds.ingress) == 1 &&
      toset(one(aws_security_group.rds.ingress).security_groups) == toset(["sg-api"]) &&
      alltrue(flatten([
        for group in [aws_security_group.alb, aws_security_group.api, aws_security_group.rds] : [
          for ingress in group.ingress :
          try(length(ingress.cidr_blocks), 0) == 0 && try(length(ingress.ipv6_cidr_blocks), 0) == 0
        ]
      ]))
    )
    error_message = "Ingress must follow CloudFront -> ALB -> API -> RDS with no broad source CIDR."
  }
}

run "private_api_task_and_origin" {
  command = plan
  module { source = "./modules/api" }

  variables {
    name_prefix                 = "atlas-test"
    aws_region                  = "us-west-2"
    vpc_id                      = "vpc-0123456789abcdef0"
    private_subnet_ids          = ["subnet-private-a", "subnet-private-b"]
    alb_security_group_id       = "sg-0123456789abcdef0"
    api_security_group_id       = "sg-0123456789abcdef1"
    container_name              = "atlas-api"
    container_port              = 3000
    health_check_path           = "/health"
    api_image_tag               = "0000000000000000000000000000000000000000"
    task_cpu                    = "256"
    task_memory                 = "512"
    desired_count               = 1
    environment_variables       = {}
    secret_arns                 = {}
    log_retention_days          = 30
    ecr_image_tag_mutability    = "IMMUTABLE"
    ecr_force_delete            = false
    ecr_max_images              = 10
    ecr_untagged_retention_days = 3
  }

  assert {
    condition = (
      aws_lb.api.internal &&
      toset(aws_lb.api.subnets) == toset(var.private_subnet_ids) &&
      !aws_ecs_service.api.network_configuration[0].assign_public_ip &&
      toset(aws_ecs_service.api.network_configuration[0].subnets) == toset(var.private_subnet_ids) &&
      aws_ecs_service.api.desired_count == 1
    )
    error_message = "The ALB and fixed one-task API service must remain private."
  }
}

run "private_database" {
  command = plan
  module { source = "./modules/database" }

  variables {
    name_prefix              = "atlas-production"
    private_subnet_ids       = ["subnet-private-a", "subnet-private-b"]
    rds_security_group_id    = "sg-0123456789abcdef0"
    database_name            = "atlas"
    master_username          = "atlas_admin"
    postgres_engine_version  = "16"
    instance_class           = "db.t4g.micro"
    multi_az                 = false
    allocated_storage_gb     = 20
    max_allocated_storage_gb = 100
    backup_retention_days    = 35
    deletion_protection      = true
    skip_final_snapshot      = false
  }

  assert {
    condition = (
      !aws_db_instance.postgres.publicly_accessible &&
      toset(aws_db_subnet_group.this.subnet_ids) == toset(var.private_subnet_ids)
    )
    error_message = "PostgreSQL must remain private and use only private subnets."
  }
}
