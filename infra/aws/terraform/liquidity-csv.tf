variable "liquidity_csv_uploads_enabled" { default = true }
variable "liquidity_csv_parsing_enabled" { default = true }
variable "liquidity_csv_apply_enabled" { default = true }

resource "aws_kms_key" "liquidity_csv" {
  description             = "Liquidity CSV originals"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket" "liquidity_csv" {
  bucket = "${local.name_prefix}-liquidity-csv-${data.aws_caller_identity.current.account_id}"
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "liquidity_csv" {
  bucket = aws_s3_bucket.liquidity_csv.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_public_access_block" "liquidity_csv" {
  bucket                  = aws_s3_bucket.liquidity_csv.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "liquidity_csv" {
  bucket = aws_s3_bucket.liquidity_csv.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.liquidity_csv.arn
    }
  }
}
resource "aws_s3_bucket_cors_configuration" "liquidity_csv" {
  bucket = aws_s3_bucket.liquidity_csv.id
  cors_rule {
    allowed_origins = [local.web_origin]
    allowed_methods = ["PUT"]
    allowed_headers = ["content-type", "if-none-match", "x-amz-checksum-sha256", "x-amz-server-side-encryption", "x-amz-server-side-encryption-aws-kms-key-id"]
    expose_headers  = ["x-amz-version-id", "etag"]
    max_age_seconds = 300
  }
}
resource "aws_s3_bucket_policy" "liquidity_csv" {
  bucket = aws_s3_bucket.liquidity_csv.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.liquidity_csv.arn, "${aws_s3_bucket.liquidity_csv.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } },
    { Sid = "RequireConditionalCreate", Effect = "Deny", Principal = "*", Action = "s3:PutObject", Resource = "${aws_s3_bucket.liquidity_csv.arn}/liquidity-csv/*", Condition = { Null = { "s3:if-none-match" = "true" } } }
  ] })
}
resource "aws_iam_role_policy" "liquidity_csv" {
  name = "liquidity-csv-originals"
  role = element(reverse(split("/", module.api.api_task_role_arn)), 0)
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion"], Resource = "${aws_s3_bucket.liquidity_csv.arn}/liquidity-csv/*" },
    { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = aws_kms_key.liquidity_csv.arn, Condition = {
      StringEquals = { "kms:ViaService" = "s3.${var.aws_region}.amazonaws.com" },
      StringLike   = { "kms:EncryptionContext:aws:s3:arn" = [aws_s3_bucket.liquidity_csv.arn, "${aws_s3_bucket.liquidity_csv.arn}/liquidity-csv/*"] }
    } }
  ] })
}
