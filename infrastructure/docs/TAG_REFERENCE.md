# AWS Resource Tagging Reference

This document provides a comprehensive reference for all tags used in the AI Agent System infrastructure.

**Environment:** dev
**Generated:** 2025-10-06T13:40:06.896Z

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

- Tag keys use PascalCase (e.g., `DataClassification`, `BackupPolicy`)
- Tag values use appropriate casing for readability
- Maximum key length: 128 characters
- Maximum value length: 256 characters
- Allowed characters: alphanumeric, spaces, and `+ - = . _ : / @`

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

- **By Component**: Group costs by `Component` tag to see spending per service type
- **By Environment**: Group costs by `Stage` or `Environment` tag to compare dev/staging/production
- **By Team**: Group costs by `Owner` tag to allocate costs to teams
- **By Cost Center**: Group costs by `CostCenter` tag for financial reporting
