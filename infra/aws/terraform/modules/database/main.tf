resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name_prefix}-db-subnets"
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.name_prefix}-postgres"

  snapshot_identifier = var.snapshot_identifier
  engine              = var.snapshot_identifier == null ? "postgres" : null
  engine_version      = var.snapshot_identifier == null ? var.postgres_engine_version : null
  instance_class      = var.instance_class

  allocated_storage     = var.snapshot_identifier == null ? var.allocated_storage_gb : null
  max_allocated_storage = var.max_allocated_storage_gb
  storage_encrypted     = true
  storage_type          = "gp3"

  db_name  = var.snapshot_identifier == null ? var.database_name : null
  username = var.snapshot_identifier == null ? var.master_username : null

  # RDS cannot enable a managed master password in the same PostgreSQL
  # operation that restores a snapshot. Restore first with this false, then
  # set it true and apply again after the instance becomes available.
  manage_master_user_password = var.manage_master_user_password

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
