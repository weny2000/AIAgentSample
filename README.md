# AI Agent System

An AI Agent system that functions as a "digital twin" for team leaders within an organization, providing intelligent assistance, cross-team impact analysis, and automated artifact verification.

## Project Structure

```
ai-agent-system/
├── frontend/          # React SPA application
├── backend/           # Serverless backend services
├── infrastructure/    # AWS infrastructure as code
├── .kiro/            # Kiro specifications and configuration
└── package.json      # Root package configuration
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Install dependencies for all workspaces
npm install

# Install frontend dependencies
npm install --workspace=frontend

# Install backend dependencies
npm install --workspace=backend
```

### Development

```bash
# Start frontend development server
npm run dev

# Run tests across all workspaces
npm test

# Lint code across all workspaces
npm run lint

# Format code
npm run format
```

### Build

```bash
# Build all workspaces
npm run build

# Type check all workspaces
npm run type-check
```

## Architecture

The system follows a serverless architecture on AWS with:

- **Frontend**: React 18 + Vite SPA with Tailwind CSS
- **Backend**: AWS Lambda functions with API Gateway
- **Database**: DynamoDB + RDS PostgreSQL
- **Search**: Amazon Kendra
- **Storage**: S3 for documents and artifacts
- **Authentication**: IAM Identity Center/SAML

### Resource Tagging Strategy

All AWS resources are automatically tagged with a comprehensive tagging strategy that includes:

- **Mandatory Tags**: Project, Stage, ManagedBy, Component, Owner, CostCenter, Environment, CreatedDate, CreatedBy
- **Resource-Specific Tags**: Component-specific tags based on resource type (e.g., FunctionPurpose for Lambda, TablePurpose for DynamoDB)
- **Environment-Specific Tags**: Environment-appropriate values for cost allocation and lifecycle management
- **Compliance Tags**: DataClassification for data storage resources, ComplianceScope for production resources

For detailed information about the tagging strategy, see [infrastructure/TAGGING_GOVERNANCE_POLICY.md](infrastructure/TAGGING_GOVERNANCE_POLICY.md).

## Deployment

### Infrastructure Deployment

Deploy infrastructure using the deployment scripts:

```bash
# Deploy to staging
./scripts/deploy-infrastructure.sh staging

# Deploy to production (requires confirmation)
./scripts/deploy-infrastructure.sh production

# Show diff only (no deployment)
./scripts/deploy-infrastructure.sh staging --diff-only
```

The deployment process includes:
1. **Dependency installation** and testing
2. **Tag validation** to ensure compliance
3. **Security checks** and CloudFormation synthesis
4. **Infrastructure deployment** with progress tracking
5. **Post-deployment validation** including tag verification
6. **Documentation generation** for tags and resources

### Tag Validation

Before deployment, all resources are validated for:
- Mandatory tags (Project, Stage, Component, Owner, etc.)
- Resource-specific tags (FunctionPurpose, DataClassification, etc.)
- Environment-appropriate values
- Tag format and length constraints

Deployment will fail if tag validation does not pass.

## Development Guidelines

- Follow TypeScript strict mode
- Maintain 80% test coverage minimum
- Use Prettier for code formatting
- Follow ESLint rules for code quality
- Write meaningful commit messages
- Follow infrastructure code review checklist for AWS resources
- Ensure all AWS resources have proper tags before deployment

### Code Review Process

For infrastructure changes, follow the comprehensive checklist at [infrastructure/CODE_REVIEW_CHECKLIST.md](infrastructure/CODE_REVIEW_CHECKLIST.md), which includes:

- General code quality requirements
- AWS CDK specific guidelines
- **Resource tagging requirements** (mandatory for all AWS resources)
- Security and compliance validation
- Deployment and operations checks

### Resource Tagging Requirements

All AWS resources must have:
- **Mandatory tags**: Project, Stage, Component, Owner, CostCenter, etc.
- **Resource-specific tags**: Based on resource type (Lambda, DynamoDB, S3, etc.)
- **Data classification tags**: For all data storage resources
- **Environment-specific tags**: Appropriate for dev/staging/production

Tag validation runs automatically during deployment and will fail if required tags are missing.

# AIAgentSample
