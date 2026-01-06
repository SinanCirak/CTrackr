output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.applications.name
}

output "s3_bucket_name" {
  description = "S3 bucket name for website"
  value       = aws_s3_bucket.website.id
}

output "s3_bucket_website_url" {
  description = "S3 bucket website URL"
  value       = "http://${aws_s3_bucket.website.bucket}.s3-website-${var.aws_region}.amazonaws.com"
}

