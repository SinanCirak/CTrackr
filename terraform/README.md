# CTrackr Infrastructure

This directory contains Terraform configuration for deploying CTrackr infrastructure on AWS.

## Resources Created

- **DynamoDB Table**: Stores job applications
- **Lambda Functions**: 5 functions for CRUD operations
  - `create-application`: Create a new job application
  - `get-application`: Get a single application by ID
  - `list-applications`: List all applications
  - `update-application`: Update an existing application
  - `delete-application`: Delete an application
- **API Gateway**: HTTP API for Lambda functions
- **S3 Bucket**: For hosting the frontend website
- **IAM Roles & Policies**: Permissions for Lambda functions

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform installed (>= 1.0)
3. Node.js installed (for Lambda function dependencies)

## Setup

1. Copy the example variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Edit `terraform.tfvars` with your values:
```hcl
aws_region   = "us-east-1"
project_name = "ctrackr"
environment  = "prod"
bucket_name  = "ctrackr-website-prod"
domain_name  = ""  # Optional: your domain name
```

3. Install Lambda dependencies:
```bash
cd ../lambda/create-application && npm install && cd ../..
cd ../lambda/get-application && npm install && cd ../..
cd ../lambda/list-applications && npm install && cd ../..
cd ../lambda/update-application && npm install && cd ../..
cd ../lambda/delete-application && npm install && cd ../..
```

4. Initialize Terraform:
```bash
terraform init
```

5. Review the plan:
```bash
terraform plan
```

6. Apply the configuration:
```bash
terraform apply
```

## Outputs

After deployment, Terraform will output:
- `api_gateway_url`: The API Gateway endpoint URL
- `dynamodb_table_name`: The DynamoDB table name
- `s3_bucket_name`: The S3 bucket name
- `s3_bucket_website_url`: The S3 website URL

## Updating Lambda Functions

After making changes to Lambda functions:

1. Install dependencies in each Lambda directory
2. Run `terraform apply` to rebuild and deploy

## Frontend Configuration

After deployment, update your frontend `.env` file with the API Gateway URL:

```
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com
```

## Cleanup

To destroy all resources:
```bash
terraform destroy
```

**Warning**: This will delete all data in DynamoDB and remove all infrastructure.




