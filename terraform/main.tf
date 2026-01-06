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

# DynamoDB Table for Job Applications
resource "aws_dynamodb_table" "applications" {
  name           = "${var.project_name}-applications"
  billing_mode  = "PAY_PER_REQUEST"
  hash_key      = "id"

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

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "website" {
  bucket = aws_s3_bucket.website.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.website.arn}/*"
      }
    ]
  })
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
          aws_dynamodb_table.applications.arn
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
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.create_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "get_application" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "list_applications" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.list_applications.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "update_application" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.update_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "delete_application" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.delete_application.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "get_upload_url" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_upload_url.invoke_arn
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
  api_id    = aws_apigatewayv2_api.id
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

# API Gateway Stage
resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

