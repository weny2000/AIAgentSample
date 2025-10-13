# Infrastructure Code Review Checklist

## General Requirements

### Code Quality
- [ ] Code follows TypeScript strict mode
- [ ] All functions and classes have proper type annotations
- [ ] Code is properly formatted with Prettier
- [ ] ESLint rules are followed with no warnings
- [ ] Code is well-documented with meaningful comments
- [ ] No hardcoded values (use configuration/environment variables)

### Testing
- [ ] Unit tests are written for new functionality
- [ ] Integration tests are updated if needed
- [ ] Test coverage meets minimum 80% requirement
- [ ] Tests pass locally and in CI/CD pipeline

### Security
- [ ] No sensitive information in code (secrets, keys, passwords)
- [ ] IAM policies follow principle of least privilege
- [ ] Security groups have minimal required access
- [ ] Encryption is enabled for data at rest and in transit
- [ ] VPC endpoints are used where appropriate

## AWS CDK Specific

### Stack Structure
- [ ] Stacks are properly organized and named
- [ ] Dependencies between stacks are clearly defined
- [ ] Stack props are properly typed
- [ ] Environment-specific configuration is handled correctly

### Resource Configuration
- [ ] Resources are properly configured for the target environment
- [ ] Resource names follow naming conventions
- [ ] Removal policies are appropriate for the environment
- [ ] Resource limits and quotas are considered

## **Resource Tagging Requirements** ⭐

### Mandatory Tag Validation
- [ ] **All resources have mandatory tags**: Project, Stage, ManagedBy, Component, Owner, CostCenter, Environment, CreatedDate, CreatedBy
- [ ] **Tag values are appropriate** for the resource and environment
- [ ] **Component tags follow naming convention** (e.g., "Compute-Lambda", "Database-DynamoDB", "Storage-S3")
- [ ] **Owner tags identify responsible team** (Platform, Backend, Infrastructure, etc.)
- [ ] **CostCenter tags enable proper cost allocation**

### Resource-Specific Tag Requirements
- [ ] **Lambda functions** have FunctionPurpose and Runtime tags
- [ ] **DynamoDB tables** have TablePurpose and DataClassification tags
- [ ] **S3 buckets** have BucketPurpose, DataClassification, and BackupPolicy tags
- [ ] **RDS instances** have Engine, DataClassification, and BackupPolicy tags
- [ ] **VPC resources** have NetworkTier tags (Public/Private/Isolated)
- [ ] **API Gateway** resources have ApiPurpose tags
- [ ] **Step Functions** have WorkflowPurpose tags
- [ ] **CloudWatch resources** have MonitoringType tags
- [ ] **KMS keys** have KeyPurpose tags
- [ ] **Cognito resources** have AuthPurpose tags

### Data Classification Requirements
- [ ] **All data storage resources** (S3, DynamoDB, RDS) have DataClassification tag
- [ ] **DataClassification values** are appropriate: Public/Internal/Confidential/Restricted
- [ ] **Confidential/Restricted data** has appropriate access controls
- [ ] **Production data storage** has proper backup policies reflected in tags

### Environment-Specific Tag Validation
- [ ] **Development environment** has AutoShutdown: "true" where applicable
- [ ] **Production environment** has ComplianceScope tag for applicable resources
- [ ] **Stage tag matches deployment environment**
- [ ] **Environment-specific CostCenter** values are correct

### Tag Application Methods
- [ ] **Stack-level tags** are applied using `cdk.Tags.of(stack).add()`
- [ ] **Resource-specific tags** use TagManager utility
- [ ] **TaggingAspect** is applied to stack for automatic tagging
- [ ] **Custom tags** are merged properly with standard tags

### Tag Validation
- [ ] **Tag validation** runs successfully before deployment
- [ ] **No validation errors** for missing mandatory tags
- [ ] **No validation warnings** for data classification
- [ ] **Tag format constraints** are met (length, characters)

## Deployment and Operations

### Environment Configuration
- [ ] Environment-specific values are properly configured
- [ ] Secrets and sensitive configuration use AWS Systems Manager Parameter Store or Secrets Manager
- [ ] Configuration changes are backwards compatible

### Monitoring and Logging
- [ ] CloudWatch logs are configured with appropriate retention
- [ ] Metrics and alarms are set up for critical resources
- [ ] Log groups have proper tags for cost allocation

### Documentation
- [ ] Infrastructure changes are documented
- [ ] README files are updated if needed
- [ ] Architecture diagrams are updated if needed
- [ ] Tag documentation is generated and up-to-date

## Deployment Validation

### Pre-Deployment
- [ ] `npm run validate-tags` passes without errors
- [ ] `npm run test` passes all tests
- [ ] `npm run lint` passes without warnings
- [ ] `cdk diff` output is reviewed and approved

### Post-Deployment
- [ ] All resources are created successfully
- [ ] Resource tags are applied correctly in AWS Console
- [ ] Cost allocation tags are activated in AWS Billing
- [ ] Monitoring and alerting are functioning

## Review Sign-off

### Reviewer Checklist
- [ ] Code changes reviewed for functionality and best practices
- [ ] **Tagging requirements verified** ⭐
- [ ] Security implications assessed
- [ ] Performance impact considered
- [ ] Documentation updated appropriately

### Author Checklist
- [ ] All checklist items completed
- [ ] **Tag validation passes** ⭐
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Ready for deployment

---

## Tagging Quick Reference

### Common Tag Values by Component
- **Compute-Lambda**: API, Authentication, DataProcessing, WorkflowExecution
- **Database-DynamoDB**: TeamRoster, AuditLog, JobStatus, UserPreferences
- **Storage-S3**: Documents, Artifacts, AuditLogs, Backups
- **Database-RDS**: Primary, Analytics, Reporting
- **Network-VPC**: Public, Private, Isolated
- **API-Gateway**: REST, GraphQL, Webhook
- **Orchestration-StepFunctions**: DataPipeline, WorkflowOrchestration
- **Monitoring-CloudWatch**: Logs, Metrics, Alarms
- **Security-KMS**: DatabaseEncryption, S3Encryption, ApplicationEncryption
- **Security-Cognito**: UserAuthentication, APIAuthorization

### Data Classification Guidelines
- **Public**: Publicly available information
- **Internal**: Internal company information
- **Confidential**: Sensitive business information
- **Restricted**: Highly sensitive information requiring special handling

### Cost Center Values
- **Development**: Dev environment resources
- **QA**: Staging environment resources  
- **Production**: Production environment resources
- **Platform**: Shared platform services
- **Infrastructure**: Core infrastructure services