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
  default     = "ctrackr"
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model ID for document generation"
  type        = string
  default     = "anthropic.claude-3-sonnet-20240229-v1:0"
}

variable "bedrock_haiku_model_id" {
  description = "Amazon Bedrock model ID for Haiku parsing/extraction"
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "domain_name" {
  description = "Domain name for the website (e.g., ctrackr.cirak.ca)"
  type        = string
  default     = ""
}



