variable "name_prefix" {
  description = "Name prefix for network resources."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the Atlas VPC."
  type        = string
}

variable "availability_zones" {
  description = "Availability zones used for public and private subnets."
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets."
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private API and RDS subnets."
  type        = list(string)
}

variable "api_container_port" {
  description = "Atlas API container port."
  type        = number
}

variable "api_origin_ingress_cidr_blocks" {
  description = "CIDR blocks allowed to reach the API origin load balancer."
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Create a single NAT gateway so private API tasks can reach ECR, Plaid, and AWS APIs."
  type        = bool
}

output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet ids."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet ids."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "API origin load balancer security group id."
  value       = aws_security_group.alb.id
}

output "api_security_group_id" {
  description = "API task security group id."
  value       = aws_security_group.api.id
}

output "rds_security_group_id" {
  description = "RDS security group id."
  value       = aws_security_group.rds.id
}
