# CTrackr - Job Application Tracker

A full-stack application for tracking job applications, built with React, TypeScript, AWS Lambda, API Gateway, DynamoDB, and S3.

## Features

- Track job applications with details (company, position, status, dates, etc.)
- CRUD operations for job applications
- Search and filter applications
- Status tracking (Applied, Interview, Offer, Rejected, etc.)
- Notes and attachments support

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: AWS Lambda functions
- **API**: AWS API Gateway
- **Database**: AWS DynamoDB
- **Hosting**: AWS S3 + CloudFront

## Project Structure

```
CTrackr/
├── src/                    # React frontend source
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── contexts/          # React contexts
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript types
├── lambda/                 # AWS Lambda functions
│   ├── create-application/
│   ├── get-application/
│   ├── list-applications/
│   ├── update-application/
│   └── delete-application/
├── terraform/              # Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
└── package.json
```

## Setup

### Prerequisites

- Node.js 18+
- AWS CLI configured
- Terraform installed

### Installation

1. Install frontend dependencies:
```bash
npm install
```

2. Configure Terraform variables:
```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit terraform.tfvars with your AWS details
```

3. Deploy infrastructure:
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

4. Build and deploy frontend:
```bash
npm run build
# Deploy to S3 using the output from terraform
```

## Development

```bash
npm run dev
```

## License

MIT

