# AWS Resource Tagging Report

This document provides a comprehensive report of all tags used across AWS resources.

**Environment:** dev
**Generated:** 2025-10-06T13:40:06.901Z

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

- Validation runs automatically during `cdk synth`
- Deployment fails if validation errors are detected
- Validation reports are generated for audit purposes

## Maintenance and Updates

### Tag Updates

To update tags:

1. Modify tag configuration in `infrastructure/src/config/tag-config.ts`
2. Update resource-specific tags in construct files
3. Run validation: `npm run validate-tags`
4. Deploy changes: `npm run deploy`

### Documentation Updates

Regenerate documentation after tag changes:

```bash
npm run docs:generate
```

## References

- [TAG_REFERENCE.md](./TAG_REFERENCE.md) - Complete tag reference
- [COST_ALLOCATION_GUIDE.md](./COST_ALLOCATION_GUIDE.md) - Cost allocation setup
- [COMPLIANCE_TAGGING_REPORT.md](./COMPLIANCE_TAGGING_REPORT.md) - Compliance report
