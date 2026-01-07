variable "aws_region" {
  description = "AWS region for resources (CloudFront certificates will be created in us-east-1 automatically)"
  type        = string
  default     = "ca-central-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "ctrackr"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "bucket_name" {
  description = "S3 bucket name for website hosting"
  type        = string
  default     = "ctrackr-website"
}

variable "domain_name" {
  description = "Domain name for the website (e.g., ctrackr.cirak.ca)"
  type        = string
  default     = ""
}



