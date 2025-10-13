# AI Agent System - Infrastructure

This directory contains the Infrastructure as Code (IaC) for the AI Agent System using AWS CDK.

## Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS CDK CLI installed globally: `npm install -g aws-cdk`

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Bootstrap CDK (first time only):

   ```bash
   cdk bootstrap
   ```

3. Deploy the stack:
   ```bash
   npm run deploy
   ```

## Available Scripts

- `npm run build` - Compile TypeScript
- `npm run deploy` - Deploy the stack
- `npm run destroy` - Destroy the stack
- `npm run diff` - Show differences between deployed and local stack
- `npm run synth` - Synthesize CloudFormation template
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler check
- `npm run validate-tags` - Validate resource tags before deployment
- `npm run docs:generate` - Generate tag documentation

## Architecture

The infrastructure includes:

- VPC with private subnets
- Lambda functions for API operations
- DynamoDB tables for metadata storage
- RDS PostgreSQL for relational data
- S3 buckets for document storage
- API Gateway for REST API
- IAM roles and policies
- KMS keys for encryption

## Resource Tagging

All AWS resources are automatically tagged using a comprehensive tagging strategy:

### Mandatory Tags
- **Project**: "AiAgentSystem"
- **Stage**: Environment (dev/staging/production)
- **ManagedBy**: "CDK"
- **Component**: Resource component (e.g., "Compute-Lambda", "Database-DynamoDB")
- **Owner**: Team responsible (e.g., "Platform", "Backend")
- **CostCenter**: Cost allocation identifier
- **Environment**: Deployment environment type
- **CreatedDate**: ISO 8601 timestamp
- **CreatedBy**: Deployment mechanism

### Resource-Specific Tags
- **Lambda Functions**: FunctionPurpose, Runtime
- **DynamoDB Tables**: TablePurpose, DataClassification
- **S3 Buckets**: BucketPurpose, DataClassification, BackupPolicy
- **RDS Instances**: Engine, DataClassification, BackupPolicy
- **VPC Resources**: NetworkTier
- **API Gateway**: ApiPurpose
- **Step Functions**: WorkflowPurpose
- **CloudWatch**: MonitoringType
- **KMS Keys**: KeyPurpose
- **Cognito**: AuthPurpose

### Tag Validation

Tag validation runs automatically during deployment to ensure:
- All mandatory tags are present
- Data storage resources have DataClassification tags
- Production resources have ComplianceScope tags
- Tag format and length constraints are met

### Documentation

- [TAGGING_GOVERNANCE_POLICY.md](TAGGING_GOVERNANCE_POLICY.md) - Comprehensive tagging policy
- [TAG_MAINTENANCE_PROCEDURES.md](TAG_MAINTENANCE_PROCEDURES.md) - Tag maintenance procedures
- [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md) - Code review checklist with tagging requirements
- [docs/TAG_REFERENCE.md](docs/TAG_REFERENCE.md) - Tag reference guide
- [docs/COST_ALLOCATION_GUIDE.md](docs/COST_ALLOCATION_GUIDE.md) - Cost allocation setup
- [docs/COMPLIANCE_TAGGING_REPORT.md](docs/COMPLIANCE_TAGGING_REPORT.md) - Compliance reporting

## Deployment Process

### Pre-Deployment Checklist

1. **Code Review**: Follow [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md)
2. **Tag Validation**: Run `npm run validate-tags` to ensure all resources have required tags
3. **Testing**: Ensure all tests pass with `npm run test`
4. **Security**: Run security checks with `npm run lint`

### Deployment Steps

1. **Development Environment**
   ```bash
   npm run deploy:dev
   ```

2. **Staging Environment**
   ```bash
   npm run deploy:staging
   ```

3. **Production Environment**
   ```bash
   npm run deploy:production
   ```

### Post-Deployment Validation

The deployment script automatically:
- Validates resource tags
- Generates tag documentation
- Verifies resource creation
- Outputs deployment summary

### Tag Maintenance

- **Daily**: Automated tag validation in CI/CD
- **Weekly**: Tag compliance reports
- **Monthly**: Cost allocation review
- **Quarterly**: Tag strategy review

See [TAG_MAINTENANCE_PROCEDURES.md](TAG_MAINTENANCE_PROCEDURES.md) for detailed procedures.
