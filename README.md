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
- AWS CLI configured with appropriate credentials
- Terraform installed (>= 1.0)
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/SinanCirak/CTrackr.git
cd CTrackr
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install Lambda function dependencies:
```bash
cd lambda/create-application && npm install && cd ../..
cd lambda/get-application && npm install && cd ../..
cd lambda/list-applications && npm install && cd ../..
cd lambda/update-application && npm install && cd ../..
cd lambda/delete-application && npm install && cd ../..
```

4. Configure Terraform variables:
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your AWS details
```

5. Deploy infrastructure:
```bash
terraform init
terraform plan
terraform apply
```

6. Configure frontend environment:
After deployment, update `.env` file with the API Gateway URL from Terraform outputs:
```bash
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com
```

7. Build and deploy frontend:
```bash
npm run build
# Upload dist/ folder contents to S3 bucket
aws s3 sync dist/ s3://your-bucket-name --delete
```

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## API Endpoints

After deployment, the following endpoints will be available:

- `POST /applications` - Create a new job application
- `GET /applications` - List all job applications
- `GET /applications/{id}` - Get a specific application
- `PUT /applications/{id}` - Update an application
- `DELETE /applications/{id}` - Delete an application

## Project Structure Details

### Frontend (`src/`)
- `pages/` - React page components (Home, Applications, ApplicationDetail, NewApplication)
- `components/` - Reusable React components (Layout)
- `types/` - TypeScript type definitions
- `utils/` - API utility functions

### Backend (`lambda/`)
Each Lambda function is self-contained with its own `package.json`:
- `create-application/` - Creates new job applications
- `get-application/` - Retrieves a single application by ID
- `list-applications/` - Lists all applications
- `update-application/` - Updates an existing application
- `delete-application/` - Deletes an application

### Infrastructure (`terraform/`)
- `main.tf` - Main Terraform configuration
- `variables.tf` - Variable definitions
- `outputs.tf` - Output values (API URL, table name, etc.)
- `terraform.tfvars.example` - Example configuration file

## Technologies Used

- **Frontend**: React 18, TypeScript, Vite, React Router
- **Backend**: AWS Lambda (Node.js 20)
- **Database**: AWS DynamoDB
- **API**: AWS API Gateway (HTTP API)
- **Hosting**: AWS S3
- **Infrastructure**: Terraform
- **Package Management**: npm

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT

