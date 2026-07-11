resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name_prefix}-db-subnets"
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = var.postgres_engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_encrypted     = true
  storage_type          = "gp3"

  db_name  = var.database_name
  username = var.master_username

  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false

  backup_retention_period = var.backup_retention_days
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : (
    "${var.name_prefix}-postgres-final"
  )

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  tags = {
    Name = "${var.name_prefix}-postgres"
  }
}
