output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for applications"
  value       = aws_dynamodb_table.applications.name
}

output "dynamodb_user_profiles_table_name" {
  description = "DynamoDB table name for user profiles"
  value       = aws_dynamodb_table.user_profiles.name
}

output "s3_bucket_name" {
  description = "S3 bucket name for website"
  value       = aws_s3_bucket.website.id
}

output "s3_uploads_bucket_name" {
  description = "S3 bucket name for file uploads (CV, cover letters)"
  value       = aws_s3_bucket.uploads.id
}

output "s3_bucket_website_url" {
  description = "S3 bucket website URL"
  value       = "http://${aws_s3_bucket.website.bucket}.s3-website-${var.aws_region}.amazonaws.com"
}

output "cloudfront_distribution_url" {
  description = "CloudFront distribution URL"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.main.id
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.main.id
}

output "cognito_user_pool_domain" {
  description = "Cognito User Pool Domain (for hosted UI)"
  value       = var.domain_name != "" ? aws_cognito_user_pool_domain.main[0].domain : null
}



