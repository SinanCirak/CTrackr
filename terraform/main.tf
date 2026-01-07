terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Provider for us-east-1 (required for CloudFront certificates)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# DynamoDB Table for Job Applications
resource "aws_dynamodb_table" "applications" {
  name         = "${var.project_name}-applications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "${var.project_name}-applications"
    Project     = var.project_name
    Environment = var.environment
  }
}

# DynamoDB Table for User Profiles
resource "aws_dynamodb_table" "user_profiles" {
  name         = "${var.project_name}-user-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  tags = {
    Name        = "${var.project_name}-user-profiles"
    Project     = var.project_name
    Environment = var.environment
  }
}

# S3 Bucket for Frontend Hosting
resource "aws_s3_bucket" "website" {
  bucket = var.bucket_name

  tags = {
    Name        = var.bucket_name
    Project     = var.project_name
    Environment = var.environment
  }
}

# S3 Bucket for File Uploads (CV and Cover Letters)
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.project_name}-uploads-${var.environment}"

  tags = {
    Name        = "${var.project_name}-uploads"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_website_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM Role for Lambda Functions
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-lambda-role"
    Project = var.project_name
  }
}

# IAM Policy for Lambda to access DynamoDB and S3
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project_name}-lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.applications.arn,
          aws_dynamodb_table.user_profiles.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "${aws_s3_bucket.uploads.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListFoundationModels"
        ]
        Resource = "*"
      }
    ]
  })
}

# Archive Lambda Functions
data "archive_file" "create_application" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/create-application"
  output_path = "${path.module}/../lambda/create-application.zip"
}

data "archive_file" "get_application" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/get-application"
  output_path = "${path.module}/../lambda/get-application.zip"
}

data "archive_file" "list_applications" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/list-applications"
  output_path = "${path.module}/../lambda/list-applications.zip"
}

data "archive_file" "update_application" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/update-application"
  output_path = "${path.module}/../lambda/update-application.zip"
}

data "archive_file" "delete_application" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/delete-application"
  output_path = "${path.module}/../lambda/delete-application.zip"
}

data "archive_file" "get_upload_url" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/get-upload-url"
  output_path = "${path.module}/../lambda/get-upload-url.zip"
}

data "archive_file" "get_profile" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/get-profile"
  output_path = "${path.module}/../lambda/get-profile.zip"
}

data "archive_file" "update_profile" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/update-profile"
  output_path = "${path.module}/../lambda/update-profile.zip"
}

# Lambda Functions
resource "aws_lambda_function" "create_application" {
  filename         = data.archive_file.create_application.output_path
  function_name    = "${var.project_name}-create-application"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.create_application.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      APPLICATIONS_TABLE = aws_dynamodb_table.applications.name
    }
  }

  tags = {
    Name    = "${var.project_name}-create-application"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "get_application" {
  filename         = data.archive_file.get_application.output_path
  function_name    = "${var.project_name}-get-application"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.get_application.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      APPLICATIONS_TABLE = aws_dynamodb_table.applications.name
    }
  }

  tags = {
    Name    = "${var.project_name}-get-application"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "list_applications" {
  filename         = data.archive_file.list_applications.output_path
  function_name    = "${var.project_name}-list-applications"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.list_applications.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      APPLICATIONS_TABLE = aws_dynamodb_table.applications.name
    }
  }

  tags = {
    Name    = "${var.project_name}-list-applications"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "update_application" {
  filename         = data.archive_file.update_application.output_path
  function_name    = "${var.project_name}-update-application"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.update_application.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      APPLICATIONS_TABLE = aws_dynamodb_table.applications.name
    }
  }

  tags = {
    Name    = "${var.project_name}-update-application"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "delete_application" {
  filename         = data.archive_file.delete_application.output_path
  function_name    = "${var.project_name}-delete-application"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.delete_application.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      APPLICATIONS_TABLE = aws_dynamodb_table.applications.name
    }
  }

  tags = {
    Name    = "${var.project_name}-delete-application"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "get_upload_url" {
  filename         = data.archive_file.get_upload_url.output_path
  function_name    = "${var.project_name}-get-upload-url"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.get_upload_url.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      UPLOADS_BUCKET = aws_s3_bucket.uploads.id
    }
  }

  tags = {
    Name    = "${var.project_name}-get-upload-url"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "get_profile" {
  filename         = data.archive_file.get_profile.output_path
  function_name    = "${var.project_name}-get-profile"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.get_profile.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      USER_PROFILES_TABLE = aws_dynamodb_table.user_profiles.name
    }
  }

  tags = {
    Name    = "${var.project_name}-get-profile"
    Project = var.project_name
  }
}

resource "aws_lambda_function" "update_profile" {
  filename         = data.archive_file.update_profile.output_path
  function_name    = "${var.project_name}-update-profile"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.update_profile.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      USER_PROFILES_TABLE = aws_dynamodb_table.user_profiles.name
    }
  }

  tags = {
    Name    = "${var.project_name}-update-profile"
    Project = var.project_name
  }
}

# API Gateway
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  description   = "API Gateway for ${var.project_name}"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
  }

  tags = {
    Name    = "${var.project_name}-api"
    Project = var.project_name
  }
}

# API Gateway Integrations
resource "aws_apigatewayv2_integration" "create_application" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.create_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "get_application" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.get_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "list_applications" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.list_applications.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "update_application" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.update_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "delete_application" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.delete_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "get_upload_url" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.get_upload_url.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "get_profile" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.get_profile.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "update_profile" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.update_profile.invoke_arn
  integration_method = "POST"
}

# API Gateway Routes
resource "aws_apigatewayv2_route" "create_application" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /applications"
  target    = "integrations/${aws_apigatewayv2_integration.create_application.id}"
}

resource "aws_apigatewayv2_route" "get_application" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /applications/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.get_application.id}"
}

resource "aws_apigatewayv2_route" "list_applications" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /applications"
  target    = "integrations/${aws_apigatewayv2_integration.list_applications.id}"
}

resource "aws_apigatewayv2_route" "update_application" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "PUT /applications/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.update_application.id}"
}

resource "aws_apigatewayv2_route" "delete_application" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "DELETE /applications/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.delete_application.id}"
}

resource "aws_apigatewayv2_route" "get_upload_url" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /upload-url"
  target    = "integrations/${aws_apigatewayv2_integration.get_upload_url.id}"
}

resource "aws_apigatewayv2_route" "get_profile" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /profile"
  target    = "integrations/${aws_apigatewayv2_integration.get_profile.id}"
}

resource "aws_apigatewayv2_route" "update_profile" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "PUT /profile"
  target    = "integrations/${aws_apigatewayv2_integration.update_profile.id}"
}

# Lambda Permissions
resource "aws_lambda_permission" "create_application" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_application.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_application" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_application.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "list_applications" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_applications.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_application" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_application.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_application" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_application.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_upload_url" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_upload_url.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_profile" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_profile.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_profile" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_profile.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  # Email verification configuration
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "CTrackr - Verification Code"
    email_message        = "Your verification code is {####}"
  }

  # Email configuration - Use COGNITO_DEFAULT (works after SES sandbox removal)
  # Note: COGNITO_DEFAULT uses SES under the hood but doesn't require explicit configuration
  # If emails still don't arrive, check:
  # 1. Email spam folder
  # 2. SES sending limits
  # 3. Cognito service limits

  tags = {
    Name    = "${var.project_name}-user-pool"
    Project = var.project_name
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  supported_identity_providers = ["COGNITO"]

  callback_urls = var.domain_name != "" ? [
    "https://${var.domain_name}",
    "https://${var.domain_name}/",
    "http://localhost:5173",
    "http://localhost:5173/"
    ] : [
    "http://localhost:5173",
    "http://localhost:5173/"
  ]

  logout_urls = var.domain_name != "" ? [
    "https://${var.domain_name}",
    "https://${var.domain_name}/",
    "http://localhost:5173",
    "http://localhost:5173/"
    ] : [
    "http://localhost:5173",
    "http://localhost:5173/"
  ]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  prevent_user_existence_errors = "ENABLED"
}

# Cognito User Pool Domain (for hosted UI)
resource "aws_cognito_user_pool_domain" "main" {
  count        = var.domain_name != "" ? 1 : 0
  domain       = "${var.project_name}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

# Route 53 Hosted Zone (if domain is provided)
# Extract root domain from subdomain (e.g., ctrackr.cirak.ca -> cirak.ca)
data "aws_route53_zone" "main" {
  count = var.domain_name != "" ? 1 : 0
  name  = join(".", slice(split(".", var.domain_name), length(split(".", var.domain_name)) - 2, length(split(".", var.domain_name))))
}

# ACM Certificate for CloudFront (must be in us-east-1)
resource "aws_acm_certificate" "cloudfront" {
  count             = var.domain_name != "" ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = []

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name    = "${var.project_name}-cloudfront-cert"
    Project = var.project_name
  }
}

# ACM Certificate Validation
resource "aws_acm_certificate_validation" "cloudfront" {
  count           = var.domain_name != "" ? 1 : 0
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [
    for record in aws_route53_record.cert_validation : record.fqdn
  ]
}

# Route 53 Record for Certificate Validation
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.cloudfront[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main[0].zone_id
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${var.project_name}-s3-oac"
  description                       = "OAC for ${var.project_name} S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 Bucket Policy for CloudFront OAC
resource "aws_s3_bucket_policy" "website_cloudfront" {
  bucket = aws_s3_bucket.website.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.website.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_cloudfront_distribution.main]
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} CloudFront Distribution"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # Use only North America and Europe

  aliases = var.domain_name != "" ? [var.domain_name] : []

  origin {
    domain_name              = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.website.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.website.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # Cache behavior for JavaScript files
  ordered_cache_behavior {
    path_pattern     = "*.js"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.website.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 31536000 # 1 year
    max_ttl                = 31536000
    compress               = true
  }

  # Cache behavior for CSS files (must come before default to match first)
  ordered_cache_behavior {
    path_pattern     = "*.css"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.website.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 31536000 # 1 year
    max_ttl                = 31536000
    compress               = true
  }

  # Custom error responses for SPA
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.domain_name != "" ? aws_acm_certificate_validation.cloudfront[0].certificate_arn : null
    ssl_support_method       = var.domain_name != "" ? "sni-only" : null
    cloudfront_default_certificate = var.domain_name == "" ? true : null
    minimum_protocol_version = var.domain_name != "" ? "TLSv1.2_2021" : null
  }

  tags = {
    Name    = "${var.project_name}-cloudfront"
    Project = var.project_name
  }
}

# Route 53 Record for CloudFront
resource "aws_route53_record" "cloudfront" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# Route 53 Record for CloudFront (AAAA for IPv6)
resource "aws_route53_record" "cloudfront_ipv6" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

