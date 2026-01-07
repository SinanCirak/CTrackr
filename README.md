# CTrackr - Job Application Tracker

A comprehensive full-stack application for tracking job applications, managing user profiles, and generating professional CVs and cover letters. Built with React, TypeScript, AWS Serverless Architecture, and Infrastructure as Code.

## 🚀 Features

### Job Application Management
- **CRUD Operations**: Create, read, update, and delete job applications
- **Status Tracking**: Track applications through various stages (Applied, Interview, Offer, Rejected, etc.)
- **Advanced Filtering**: Filter applications by status, company, date, and more
- **Detailed Information**: Store company details, position, salary, location, contact information, notes, and more
- **Interview Management**: Track interview dates, times, places, and links
- **File Attachments**: Upload and manage CV and Cover Letter files for each application
- **S3 File Management**: Automatic file deletion when applications are removed

### User Profile Management
- **Comprehensive Profile**: Manage personal information, contact details, and professional links
- **Categorized Skills**: Organize technical skills by categories with descriptions
- **Work Experience**: Track employment history with detailed descriptions
- **Education**: Manage educational background
- **Certifications**: Store professional certifications
- **Projects**: Showcase academic and technical projects with achievements
- **Languages**: Track language proficiencies
- **PDF Generation**: Generate professional CV/Resume PDFs from profile data

### Document Generation
- **AI-Powered Generation**: Generate CVs and Cover Letters using job descriptions and requirements
- **PDF Export**: Download generated documents as PDF files
- **Customizable Templates**: Professional formatting with proper sections and styling

### Authentication & Security
- **AWS Cognito Integration**: Secure user authentication and authorization
- **Email Verification**: Email-based account verification via AWS SES
- **Protected Routes**: Secure access to application features
- **User-Specific Data**: All data is isolated per user

## 🏗️ Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router
- **State Management**: React Context API
- **UI Components**: Custom components with modern CSS
- **PDF Generation**: jsPDF for client-side PDF generation
- **Authentication**: AWS Amplify (Cognito)

### Backend (Serverless)
- **Compute**: AWS Lambda (Node.js 20)
- **API**: AWS API Gateway (HTTP API)
- **Database**: AWS DynamoDB
- **File Storage**: AWS S3
- **CDN**: AWS CloudFront
- **DNS**: AWS Route 53
- **SSL/TLS**: AWS Certificate Manager (ACM)
- **Email**: AWS SES (Simple Email Service)
- **Authentication**: AWS Cognito

### Infrastructure
- **IaC**: Terraform
- **Region**: ca-central-1 (primary), us-east-1 (CloudFront certificates)
- **Domain**: Custom domain support via Route 53

## 📁 Project Structure

```
CTrackr/
├── src/                          # React frontend source
│   ├── components/              # Reusable React components
│   │   ├── Layout.tsx          # Main layout with navigation
│   │   └── ProtectedRoute.tsx  # Route protection component
│   ├── pages/                   # Page components
│   │   ├── Home.tsx            # Landing page
│   │   ├── Login.tsx           # Authentication page
│   │   ├── Applications.tsx    # Application list page
│   │   ├── ApplicationDetail.tsx # Application detail page
│   │   ├── NewApplication.tsx  # Create application page
│   │   ├── Profile.tsx         # User profile management
│   │   └── GenerateDocuments.tsx # Document generation
│   ├── contexts/                # React contexts
│   │   └── AuthContext.tsx     # Authentication context
│   ├── utils/                   # Utility functions
│   │   ├── api.ts              # API client functions
│   │   └── auth.ts             # Authentication utilities
│   ├── types/                   # TypeScript type definitions
│   │   ├── application.ts      # Application types
│   │   └── user.ts             # User profile types
│   └── vite-env.d.ts           # Vite environment types
├── lambda/                       # AWS Lambda functions
│   ├── create-application/     # Create new application
│   ├── get-application/        # Get single application
│   ├── list-applications/      # List applications (with user filtering)
│   ├── update-application/     # Update application
│   ├── delete-application/     # Delete application + S3 files
│   ├── get-profile/            # Get user profile
│   ├── update-profile/         # Update user profile
│   ├── get-upload-url/         # Generate S3 presigned URLs
│   └── delete-file/            # Delete files from S3
├── terraform/                    # Infrastructure as Code
│   ├── main.tf                 # Main Terraform configuration
│   ├── variables.tf            # Variable definitions
│   ├── outputs.tf              # Output values
│   └── terraform.tfvars.example # Example configuration
├── public/                       # Static assets
│   └── logo.svg                # Application logo
└── package.json                 # Frontend dependencies
```

## 🛠️ Setup & Installation

### Prerequisites

- **Node.js**: 18+ (for frontend and Lambda functions)
- **AWS CLI**: Configured with appropriate credentials
- **Terraform**: >= 1.0
- **Git**: For version control
- **AWS Account**: With appropriate permissions
- **Domain**: (Optional) For custom domain setup

### Installation Steps

1. **Clone the repository:**
```bash
git clone https://github.com/SinanCirak/CTrackr.git
cd CTrackr
```

2. **Install frontend dependencies:**
```bash
npm install
```

3. **Install Lambda function dependencies:**
```bash
cd lambda/create-application && npm install && cd ../..
cd lambda/get-application && npm install && cd ../..
cd lambda/list-applications && npm install && cd ../..
cd lambda/update-application && npm install && cd ../..
cd lambda/delete-application && npm install && cd ../..
cd lambda/get-profile && npm install && cd ../..
cd lambda/update-profile && npm install && cd ../..
cd lambda/get-upload-url && npm install && cd ../..
cd lambda/delete-file && npm install && cd ../..
```

4. **Configure Terraform variables:**
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your AWS details:
# - aws_region: ca-central-1
# - domain_name: your-domain.com (optional)
# - ses_sender_email: your-verified-email@domain.com
```

5. **Deploy infrastructure:**
```bash
terraform init
terraform plan
terraform apply
```

6. **Configure frontend environment:**
After deployment, create a `.env` file in the root directory:
```bash
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.ca-central-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ca-central-1_xxxxx
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxx
VITE_AWS_REGION=ca-central-1
```

7. **Build and deploy frontend:**
```bash
npm run build
# Upload to S3 (bucket name from Terraform outputs)
aws s3 sync dist/ s3://ctrackr-website-prod --delete
# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

## 🚀 Development

### Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.ca-central-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=your-user-pool-id
VITE_COGNITO_USER_POOL_CLIENT_ID=your-client-id
VITE_AWS_REGION=ca-central-1
```

## 📡 API Endpoints

### Applications
- `POST /applications` - Create a new job application
- `GET /applications?userId={userId}` - List applications (filtered by user)
- `GET /applications/{id}` - Get a specific application
- `PUT /applications/{id}` - Update an application
- `DELETE /applications/{id}` - Delete an application and associated S3 files

### Profile
- `GET /profile?userId={userId}` - Get user profile
- `PUT /profile?userId={userId}` - Update user profile

### File Management
- `POST /upload-url` - Generate presigned URL for S3 upload
  - Body: `{ fileName, fileType, userId, companyName, fileCategory, timezoneOffset }`
  - Returns: `{ uploadUrl, fileUrl, fileKey }`
- `DELETE /file` - Delete file from S3
  - Body: `{ fileKey }`

## 🗄️ Database Schema

### DynamoDB Tables

#### Applications Table (`ctrackr-applications`)
- **Partition Key**: `id` (String)
- **Attributes**:
  - `userId` (String) - User identifier
  - `company` (String) - Company name
  - `position` (String) - Job position
  - `status` (String) - Application status
  - `appliedDate` (String) - Application date
  - `cvUrl` (String) - CV file URL
  - `cvFileKey` (String) - S3 key for CV file
  - `coverLetterUrl` (String) - Cover letter file URL
  - `coverLetterFileKey` (String) - S3 key for cover letter file
  - `createdAt` (String) - Creation timestamp
  - `updatedAt` (String) - Last update timestamp
  - And more...

#### User Profiles Table (`ctrackr-user-profiles`)
- **Partition Key**: `userId` (String)
- **Attributes**:
  - `fullName` (String)
  - `email` (String)
  - `phone` (String)
  - `address` (String)
  - `linkedinUrl` (String)
  - `githubUrl` (String)
  - `portfolioUrl` (String)
  - `summary` (String)
  - `skillCategories` (List) - Categorized skills
  - `experience` (List) - Work experience
  - `education` (List) - Education history
  - `certifications` (List) - Certifications
  - `projects` (List) - Projects
  - `languages` (List) - Languages
  - `createdAt` (String)
  - `updatedAt` (String)

## 📦 S3 Bucket Structure

### Website Bucket (`ctrackr-website-prod`)
- Static website files (HTML, CSS, JS)
- Served via CloudFront CDN
- Origin Access Control (OAC) for secure access

### Uploads Bucket (`ctrackr-uploads-prod`)
- User-uploaded files organized by user ID
- Structure: `{userId}/{fileCategory}_{companyName}_{DDMMYYYY}_{HHMM}.{ext}`
- Example: `user-123/CV_Google_07012026_1615.pdf`
- Versioning enabled
- CORS configured for browser uploads

## ☁️ AWS Services & Resources

### Compute & API
- **AWS Lambda** (8 functions):
  - `create-application` - Create new job applications
  - `get-application` - Retrieve single application
  - `list-applications` - List applications with user filtering
  - `update-application` - Update application details
  - `delete-application` - Delete application and S3 files
  - `get-profile` - Get user profile
  - `update-profile` - Update user profile
  - `get-upload-url` - Generate S3 presigned URLs
  - `delete-file` - Delete files from S3
- **AWS API Gateway** (HTTP API):
  - 9 API routes
  - CORS enabled
  - Auto-deploy stage
  - Lambda integrations

### Database
- **AWS DynamoDB** (2 tables):
  - `ctrackr-applications` - Job applications data
  - `ctrackr-user-profiles` - User profile data
  - Pay-per-request billing mode

### Storage
- **AWS S3** (2 buckets):
  - `ctrackr-website-prod` - Frontend static files
    - Website configuration
    - Public access block (CloudFront only)
    - Bucket policy for CloudFront OAC
  - `ctrackr-uploads-prod` - User file uploads
    - CORS configuration
    - Versioning enabled

### Content Delivery
- **AWS CloudFront**:
  - Distribution for website bucket
  - Origin Access Control (OAC)
  - Custom domain support
  - SSL/TLS via ACM
  - IPv4 and IPv6 support

### Authentication
- **AWS Cognito**:
  - User Pool for authentication
  - User Pool Client for application
  - User Pool Domain (hosted UI)
  - Email verification via SES
  - Password policy configured
  - Account recovery settings

### Networking & DNS
- **AWS Route 53**:
  - Hosted zone lookup
  - A record for CloudFront
  - AAAA record for IPv6
  - CNAME records for certificate validation
- **AWS Certificate Manager (ACM)**:
  - SSL/TLS certificate for CloudFront
  - Certificate validation via Route 53
  - Region: us-east-1 (required for CloudFront)

### Email
- **AWS SES (Simple Email Service)**:
  - Email identity for Cognito
  - Email verification codes
  - Account recovery emails

### Security & Access
- **AWS IAM**:
  - Lambda execution role
  - IAM role policy for:
    - DynamoDB access (applications & user_profiles tables)
    - S3 access (uploads bucket)
    - Bedrock access (for future AI features)
- **Lambda Permissions**:
  - API Gateway invoke permissions for all Lambda functions

### Infrastructure as Code
- **Terraform Providers**:
  - AWS Provider (v5.0+)
  - Archive Provider (for Lambda packaging)
- **Terraform Resources**: 71+ resources
- **Terraform Data Sources**: 10+ data sources

## 🔐 Security Features

- **AWS Cognito**: User authentication and authorization
- **IAM Roles**: Least privilege access for Lambda functions
- **S3 Bucket Policies**: Secure file access via presigned URLs
- **CORS Configuration**: Proper CORS setup for API Gateway and S3
- **Origin Access Control**: CloudFront OAC for S3 access
- **User Data Isolation**: All queries filtered by userId
- **Password Policy**: Strong password requirements via Cognito
- **Email Verification**: Secure email-based verification

## 🎨 Key Features in Detail

### File Upload System
- **Presigned URLs**: Secure, time-limited upload URLs
- **Structured Naming**: Automatic file naming with user ID, category, company, date, and time
- **Timezone Support**: Local timezone-aware file naming
- **Automatic Cleanup**: Files deleted when applications are removed
- **Versioning**: S3 versioning enabled for file recovery

### Profile Management
- **Categorized Skills**: Organize skills into categories (e.g., "Frontend", "Backend", "DevOps")
- **Rich Text Support**: Detailed descriptions for experience, projects, etc.
- **PDF Export**: Generate professional CVs with all profile data
- **Real-time Updates**: Instant profile updates with DynamoDB

### Application Tracking
- **Status Workflow**: Track applications through multiple stages
- **Interview Scheduling**: Store interview details (date, time, place, link)
- **File Attachments**: Associate CV and cover letter with each application
- **Notes & Requirements**: Store job descriptions and requirements for AI generation

## 🛠️ Technologies Used

### Frontend
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **React Router**: Client-side routing
- **jsPDF**: PDF generation
- **AWS Amplify**: Cognito integration
- **React Icons**: Icon library

### Backend
- **AWS Lambda**: Serverless compute (Node.js 20)
- **AWS API Gateway**: REST API (HTTP API)
- **AWS DynamoDB**: NoSQL database
- **AWS S3**: File storage
- **AWS CloudFront**: CDN
- **AWS Cognito**: Authentication
- **AWS SES**: Email service
- **AWS Route 53**: DNS management
- **AWS ACM**: SSL/TLS certificates
- **AWS IAM**: Access management

### Infrastructure
- **Terraform**: Infrastructure as Code
- **Archive Provider**: Lambda function packaging

## 📝 Environment Variables

### Frontend (.env)
```env
VITE_API_BASE_URL=https://api-gateway-url.execute-api.ca-central-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ca-central-1_xxxxx
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxx
VITE_AWS_REGION=ca-central-1
```

### Terraform (terraform.tfvars)
```hcl
aws_region = "ca-central-1"
domain_name = "ctrackr.example.com"
ses_sender_email = "noreply@example.com"
project_name = "ctrackr"
environment = "prod"
bucket_name = "ctrackr-website-prod"
```

## 🚀 Deployment

### Initial Deployment

1. **Deploy Infrastructure:**
```bash
cd terraform
terraform init
terraform apply
```

2. **Build Frontend:**
```bash
npm run build
```

3. **Deploy Frontend:**
```bash
aws s3 sync dist/ s3://ctrackr-website-prod --delete
aws cloudfront create-invalidation --distribution-id E3OJLQS0UXAUC5 --paths "/*"
```

### Updating Lambda Functions

Lambda functions are automatically deployed via Terraform when you run `terraform apply`. The Terraform configuration packages and uploads each Lambda function.

### Updating Frontend

After making frontend changes:
```bash
npm run build
aws s3 sync dist/ s3://ctrackr-website-prod --delete
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

## 🧪 Testing

### Manual Testing Checklist

- [ ] User registration and login
- [ ] Create new application
- [ ] Upload CV and Cover Letter files
- [ ] Delete files from S3
- [ ] Update application details
- [ ] Filter applications by status
- [ ] Create and update user profile
- [ ] Generate PDF CV
- [ ] Generate AI-powered documents
- [ ] Delete application (should also delete S3 files)

## 📊 Terraform Outputs

After deployment, Terraform provides the following outputs:

- `api_gateway_url` - API Gateway endpoint URL
- `dynamodb_table_name` - Applications table name
- `dynamodb_user_profiles_table_name` - User profiles table name
- `s3_bucket_name` - Website bucket name
- `s3_uploads_bucket_name` - Uploads bucket name
- `s3_bucket_website_url` - S3 website URL
- `cloudfront_distribution_url` - CloudFront distribution URL
- `cloudfront_distribution_id` - CloudFront distribution ID
- `cognito_user_pool_id` - Cognito User Pool ID
- `cognito_user_pool_client_id` - Cognito User Pool Client ID
- `cognito_user_pool_domain` - Cognito User Pool Domain

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT

## 👤 Author

Sinan Cirak

## 🙏 Acknowledgments

- AWS for serverless infrastructure
- React team for the amazing framework
- Terraform for Infrastructure as Code
- All open-source contributors
