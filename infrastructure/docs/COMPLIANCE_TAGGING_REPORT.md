# AWS Resource Tagging Compliance Report

**Environment:** dev
**Generated:** 2025-10-06T09:17:49.302Z

## Executive Summary

*No stack provided for analysis. Deploy infrastructure to generate detailed compliance report.*

## Compliance Requirements

### Mandatory Tag Requirements

All resources MUST have the following tags:

- Project
- Stage
- ManagedBy
- Component
- Owner
- CostCenter
- Environment
- CreatedDate
- CreatedBy

### Data Storage Requirements

Data storage resources MUST have:

- `DataClassification` tag (Public/Internal/Confidential/Restricted)
- `BackupPolicy` tag (Daily/Weekly/Monthly/None)

Data storage resource types:

- AWS::S3::Bucket
- AWS::DynamoDB::Table
- AWS::RDS::DBInstance
- AWS::RDS::DBCluster
- AWS::Kendra::Index

### Production Environment Requirements

Production resources MUST have:

- `ComplianceScope` tag indicating applicable frameworks
- `AutoShutdown` set to "false"

## Recommendations

1. **Regular Audits**: Run compliance reports monthly to ensure ongoing compliance
2. **Automated Validation**: Tag validation is enforced during deployment
3. **Cost Optimization**: Use cost allocation tags to identify optimization opportunities
4. **Security Review**: Regularly review DataClassification tags for accuracy
5. **Documentation**: Keep tag documentation updated as infrastructure evolves
