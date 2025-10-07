import * as fs from 'fs';
import * as path from 'path';

// Create docs directory
const docsDir = path.join(__dirname, 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Generate TAG_REFERENCE.md
const tagReference = `# AWS Resource Tagging Reference

This document provides a comprehensive reference for all tags used in the AI Agent System infrastructure.

**Environment:** dev
**Generated:** ${new Date().toISOString()}

## Table of Contents

1. [Mandatory Tags](#mandatory-tags)
2. [Optional Tags](#optional-tags)
3. [Resource-Specific Tags](#resource-specific-tags)
4. [Environment-Specific Tags](#environment-specific-tags)
5. [Tag Usage Guidelines](#tag-usage-guidelines)
6. [Cost Allocation Tags](#cost-allocation-tags)

## Mandatory Tags

These tags MUST be applied to all AWS resources:

| Tag Key | Description | Example Value | Purpose |
|---------|-------------|---------------|---------|
| Project | Project name identifier | AiAgentSystem | Identify resources belonging to this project |
| Stage | Deployment stage | dev | Distinguish resources by environment |
| ManagedBy | Management tool | CDK | Indicate infrastructure as code management |
| Component | Logical component classification | Compute-Lambda | Group resources by functional component |
| Owner | Team or individual responsible | Platform | Assign ownership and accountability |
| CostCenter | Cost allocation identifier | Development | Enable cost tracking and allocation |
| Environment | Environment type | Development | Classify resources by environment type |
| CreatedDate | Resource creation timestamp | 2025-10-06T12:00:00Z | Track resource age and lifecycle |
| CreatedBy | Creation mechanism | CDK-Deployment | Audit resource creation source |

## Optional Tags

These tags MAY be applied based on resource type and requirements:

| Tag Key | Description | Valid Values | Applies To |
|---------|-------------|--------------|------------|
| DataClassification | Data sensitivity level | Public, Internal, Confidential, Restricted | S3, DynamoDB, RDS, Kendra |
| BackupPolicy | Backup retention policy | Daily, Weekly, Monthly, None | S3, DynamoDB, RDS |
| ComplianceScope | Applicable compliance frameworks | HIPAA, SOC2, GDPR, None | All resources |
| AutoShutdown | Automatic shutdown eligibility | true, false | Lambda, RDS, EC2 |
| MaintenanceWindow | Preferred maintenance window | Sunday-02:00-04:00 | RDS, EC2 |
| LastModifiedDate | Last modification timestamp | Any | All resources |

## Resource-Specific Tags

Different resource types have specific tags based on their function:

### Lambda Functions

| Tag Key | Description | Example Value |
|---------|-------------|---------------|
| Component | Always set to "Compute-Lambda" | Compute-Lambda |
| FunctionPurpose | Specific function role | API |
| Runtime | Lambda runtime version | nodejs20.x |

### DynamoDB Tables

| Tag Key | Description | Example Value |
|---------|-------------|---------------|
| Component | Always set to "Database-DynamoDB" | Database-DynamoDB |
| TablePurpose | Table function | TeamManagement |
| DataClassification | Data sensitivity level | Internal |

### S3 Buckets

| Tag Key | Description | Example Value |
|---------|-------------|---------------|
| Component | Always set to "Storage-S3" | Storage-S3 |
| BucketPurpose | Bucket function | Documents |
| DataClassification | Data sensitivity level | Internal |
| BackupPolicy | Backup retention policy | Daily |

## Environment-Specific Tags

Tag values vary by deployment environment:

| Tag Key | Development | Staging | Production |
|---------|-------------|---------|------------|
| Stage | dev | staging | production |
| Environment | Development | Staging | Production |
| CostCenter | Development | QA | Production |
| AutoShutdown | true | false | false |
| ComplianceScope | None | SOC2 | HIPAA,SOC2,GDPR |

## Tag Usage Guidelines

### Naming Conventions

- Tag keys use PascalCase (e.g., \`DataClassification\`, \`BackupPolicy\`)
- Tag values use appropriate casing for readability
- Maximum key length: 128 characters
- Maximum value length: 256 characters
- Allowed characters: alphanumeric, spaces, and \`+ - = . _ : / @\`

### Tag Application

- Tags are applied automatically during CDK deployment
- Stack-level tags propagate to all resources
- Resource-specific tags override stack-level tags
- Custom tags can be added for specific use cases

### Tag Maintenance

- All tag changes should be made in infrastructure code
- Manual tag modifications are discouraged
- Tag validation runs before every deployment
- Missing mandatory tags will prevent deployment

## Cost Allocation Tags

The following tags should be activated in AWS Billing Console for cost tracking:

- Project
- Stage
- Environment
- Component
- Owner
- CostCenter

### Cost Tracking Queries

Use these tags in AWS Cost Explorer to analyze spending:

- **By Component**: Group costs by \`Component\` tag to see spending per service type
- **By Environment**: Group costs by \`Stage\` or \`Environment\` tag to compare dev/staging/production
- **By Team**: Group costs by \`Owner\` tag to allocate costs to teams
- **By Cost Center**: Group costs by \`CostCenter\` tag for financial reporting
`;

fs.writeFileSync(path.join(docsDir, 'TAG_REFERENCE.md'), tagReference, 'utf-8');
console.log('✓ Generated: TAG_REFERENCE.md');

// Generate RESOURCE_TAGGING_REPORT.md
const resourceReport = `# AWS Resource Tagging Report

This document provides a comprehensive report of all tags used across AWS resources.

**Environment:** dev
**Generated:** ${new Date().toISOString()}

## Overview

This report summarizes the tagging strategy implemented for the AI Agent System infrastructure.
All resources are tagged according to organizational standards to enable:

- Cost allocation and tracking
- Resource management and organization
- Compliance and security auditing
- Automated lifecycle management

## Tag Summary

**Total Tag Keys:** 21

### All Tag Keys

- ApiPurpose
- AuthPurpose
- AutoShutdown
- BackupPolicy
- BucketPurpose
- Component
- ComplianceScope
- CostCenter
- CreatedBy
- CreatedDate
- DataClassification
- Engine
- Environment
- FunctionPurpose
- KeyPurpose
- LastModifiedDate
- MaintenanceWindow
- ManagedBy
- MonitoringType
- NetworkTier
- Owner
- Project
- Runtime
- Stage
- TablePurpose
- WorkflowPurpose

## Resource Type Coverage

The following resource types have specific tagging configurations:

| Resource Type | Component Tag | Specific Tags |
|---------------|---------------|---------------|
| Lambda Functions | Compute-Lambda | FunctionPurpose, Runtime |
| DynamoDB Tables | Database-DynamoDB | TablePurpose, DataClassification |
| S3 Buckets | Storage-S3 | BucketPurpose, DataClassification, BackupPolicy |
| RDS Instances | Database-RDS | Engine, DataClassification, BackupPolicy |
| VPC Resources | Network-VPC | NetworkTier |
| API Gateway | API-Gateway | ApiPurpose |
| Step Functions | Orchestration-StepFunctions | WorkflowPurpose |
| CloudWatch | Monitoring-CloudWatch | MonitoringType |
| KMS Keys | Security-KMS | KeyPurpose |
| Cognito | Security-Cognito | AuthPurpose |

## Tag Application Strategy

### Automatic Tag Application

Tags are applied automatically during CDK deployment using:

1. **Stack-Level Tags**: Applied to all resources in the stack
2. **Aspect-Based Tags**: Applied via CDK Aspects for cross-cutting concerns
3. **Construct-Level Tags**: Applied to specific constructs
4. **Resource-Level Tags**: Applied directly to individual resources

### Tag Precedence

When multiple tag sources exist, the following precedence applies (highest to lowest):

1. Resource-level explicit tags
2. Construct-level tags
3. Aspect-applied tags
4. Stack-level tags

## Validation and Compliance

### Pre-Deployment Validation

All resources are validated before deployment to ensure:

- All mandatory tags are present
- Tag keys and values meet AWS constraints
- Data storage resources have DataClassification tags
- Production resources have ComplianceScope tags

### Validation Enforcement

- Validation runs automatically during \`cdk synth\`
- Deployment fails if validation errors are detected
- Validation reports are generated for audit purposes

## Maintenance and Updates

### Tag Updates

To update tags:

1. Modify tag configuration in \`infrastructure/src/config/tag-config.ts\`
2. Update resource-specific tags in construct files
3. Run validation: \`npm run validate-tags\`
4. Deploy changes: \`npm run deploy\`

### Documentation Updates

Regenerate documentation after tag changes:

\`\`\`bash
npm run docs:generate
\`\`\`

## References

- [TAG_REFERENCE.md](./TAG_REFERENCE.md) - Complete tag reference
- [COST_ALLOCATION_GUIDE.md](./COST_ALLOCATION_GUIDE.md) - Cost allocation setup
- [COMPLIANCE_TAGGING_REPORT.md](./COMPLIANCE_TAGGING_REPORT.md) - Compliance report
`;

fs.writeFileSync(path.join(docsDir, 'RESOURCE_TAGGING_REPORT.md'), resourceReport, 'utf-8');
console.log('✓ Generated: RESOURCE_TAGGING_REPORT.md');

console.log('Documentation generation completed successfully!');