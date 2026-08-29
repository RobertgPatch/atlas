mock_provider "aws" {}

run "single_az_private_recoverable_database" {
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
      aws_db_instance.postgres.instance_class == "db.t4g.micro" &&
      aws_db_instance.postgres.allocated_storage == 20 &&
      aws_db_instance.postgres.storage_type == "gp3" &&
      !aws_db_instance.postgres.multi_az
    )
    error_message = "Production RDS must be explicit Single-AZ db.t4g.micro with 20 GiB gp3."
  }

  assert {
    condition = (
      aws_db_instance.postgres.storage_encrypted &&
      !aws_db_instance.postgres.publicly_accessible &&
      aws_db_instance.postgres.deletion_protection &&
      aws_db_instance.postgres.backup_retention_period == 35 &&
      !aws_db_instance.postgres.skip_final_snapshot &&
      aws_db_instance.postgres.final_snapshot_identifier != null &&
      length(aws_db_instance.postgres.vpc_security_group_ids) == 1
    )
    error_message = "Production RDS encryption, private access, deletion protection, backups, and final snapshot are mandatory."
  }
}
