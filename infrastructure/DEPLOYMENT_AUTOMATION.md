# Deployment Automation Guide

This guide covers the automated deployment scripts and tools for the AI Agent Work Task Analysis System.

## Overview

The deployment automation system provides:

1. **Database Migration Management** - Automated schema and data migrations
2. **Environment Configuration Management** - Centralized configuration via AWS Parameter Store and Secrets Manager
3. **Blue-Green Deployment** - Zero-downtime deployments with automatic rollback
4. **Full-Stack Orchestration** - Coordinated deployment of all system components
5. **Rollback Mechanisms** - Quick recovery from failed deployments

## Components

### 1. Database Migration Manager

**Location**: `infrastructure/src/scripts/database-migration.ts`

Handles database schema migrations and data initialization.

#### Features

- Tracks applied migrations in DynamoDB
- Supports both DynamoDB (JSON) and RDS (SQL) migrations
- Dry-run mode for testing
- Automatic seed data initialization
- Rollback support

#### Usage

```bash
# Run migrations for development
npm run migrate:dev

# Run migrations for staging
npm run migrate:staging

# Run migrations for production
npm run migrate:production

# Dry run (test without applying)
npm run migrate:dry-run

# From root directory
npm run migrate:staging
```

#### Creating Migrations

Create migration files in `infrastructure/migrations/`:

**DynamoDB Migration** (`001_example.json`):
```json
{
  "tableName": "ai-agent-work-tasks",
  "description": "Add new fields",
  "items": [
    {
      "pk": "ITEM#1",
      "sk": "METADATA",
      "field1": "value1"
    }
  ]
}
```

**RDS Migration** (`002_example.sql`):
```sql
-- Add new column
ALTER TABLE work_tasks ADD COLUMN new_field VARCHAR(255);

-- Create index
CREATE INDEX idx_work_tasks_status ON work_tasks(status);
```

### 2. Environment Configuration Manager

**Location**: `infrastructure/src/scripts/environment-config-manager.ts`

Manages environment-specific configuration in AWS Parameter Store and Secrets Manager.

#### Features

- Validates configuration before deployment
- Stores parameters in Parameter Store
- Stores secrets in Secrets Manager
- Configuration versioning
- Export/import capabilities
- Dry-run mode

#### Usage

```bash
# Deploy configuration
npm run config:deploy:staging

# Validate configuration
npm run config:validate:staging

# Retrieve current configuration
cd infrastructure
npm run config:retrieve staging

# Delete configuration (careful!)
cd infrastructure
npm run config:delete staging --dry-run
```

#### Configuration Files

Configuration files are stored in `config/`:

- `dev.json` - Development environment
- `staging.json` - Staging environment
- `production.json` - Production environment

**Structure**:
```json
{
  "parameters": {
    "API_GATEWAY_STAGE": "staging",
    "COGNITO_USER_POOL_ID": "us-east-1_XXXXX",
    "LOG_LEVEL": "info"
  },
  "secrets": {
    "DATABASE_PASSWORD": "CHANGE_ME",
    "JWT_SECRET": "CHANGE_ME",
    "ENCRYPTION_KEY": "CHANGE_ME"
  }
}
```

### 3. Blue-Green Deployment Manager

**Location**: `infrastructure/src/scripts/blue-green-deployment.ts`

Implements blue-green deployment strategy for Lambda functions.

#### Features

- Publishes new Lambda versions
- Gradual traffic shifting (linear, canary, all-at-once)
- Health monitoring during deployment
- Automatic rollback on errors
- Manual rollback capability

#### Usage

```bash
# Deploy with blue-green strategy
cd infrastructure
npm run blue-green:deploy staging

# Manual rollback
npm run blue-green:rollback staging

# From root with full stack
npm run deploy:blue-green:production
```

#### Traffic Shift Strategies

**Linear**: Gradually shifts traffic in equal increments
```
0% → 25% → 50% → 75% → 100%
```

**Canary**: Tests with small percentage first
```
0% → 10% → 25% → 50% → 100%
```

**All-at-once**: Immediate switch (not recommended for production)
```
0% → 100%
```

### 4. Full-Stack Deployment Orchestrator

**Location**: `scripts/deploy-full-stack.sh` (Linux/Mac) and `scripts/deploy-full-stack.cmd` (Windows)

Orchestrates deployment of all system components in the correct order.

#### Features

- Pre-deployment validation
- Automated testing
- Configuration deployment
- Infrastructure deployment (CDK)
- Database migrations
- Backend deployment
- Frontend deployment
- Post-deployment validation
- Health checks
- Deployment reporting

#### Usage

```bash
# Deploy to development
npm run deploy:full:dev

# Deploy to staging
npm run deploy:full:staging

# Deploy to production
npm run deploy:full:production

# Dry run (test without deploying)
npm run deploy:full:staging:dry-run

# Skip tests (faster, but risky)
SKIP_TESTS=true npm run deploy:full:staging

# Blue-green deployment
npm run deploy:blue-green:production
```

#### Deployment Flow

```
1. Validate Prerequisites
   ├── Check required tools (node, npm, aws, git)
   ├── Verify AWS credentials
   └── Check Node.js version

2. Run Tests
   ├── Backend tests
   ├── Frontend tests
   └── Infrastructure tests

3. Deploy Configuration
   ├── Validate configuration
   └── Deploy to Parameter Store/Secrets Manager

4. Deploy Infrastructure (CDK)
   ├── Build CDK app
   ├── Show diff (if dry-run)
   └── Deploy stacks

5. Run Database Migrations
   ├── Check pending migrations
   └── Apply migrations

6. Deploy Backend
   ├── Build Lambda functions
   ├── Deploy with blue-green (if enabled)
   └── Update function code

7. Deploy Frontend
   ├── Build React app
   ├── Upload to S3
   └── Invalidate CloudFront cache

8. Post-Deployment Validation
   ├── Wait for stabilization
   ├── Run health checks
   └── Verify deployments

9. Generate Report
   └── Create deployment report
```

## Deployment Scenarios

### Scenario 1: First-Time Deployment

```bash
# 1. Configure AWS credentials
aws configure --profile staging

# 2. Create and validate configuration
npm run config:validate:staging

# 3. Deploy configuration
npm run config:deploy:staging

# 4. Update secrets in AWS Secrets Manager
# (Use AWS Console or CLI to set actual secret values)

# 5. Deploy full stack
npm run deploy:full:staging

# 6. Verify deployment
npm run health-check:staging
```

### Scenario 2: Update Existing Deployment

```bash
# 1. Run tests locally
npm test

# 2. Deploy with dry-run first
npm run deploy:full:staging:dry-run

# 3. Deploy for real
npm run deploy:full:staging

# 4. Monitor deployment
# (Check CloudWatch dashboards)

# 5. Run smoke tests
npm run test:smoke:staging
```

### Scenario 3: Production Deployment with Blue-Green

```bash
# 1. Ensure staging is stable
npm run test:e2e:staging

# 2. Deploy to production with blue-green
npm run deploy:blue-green:production

# 3. Monitor metrics during traffic shift
# (Check CloudWatch, error rates, latency)

# 4. If issues detected, rollback
npm run rollback:production
```

### Scenario 4: Database Migration Only

```bash
# 1. Create migration file
# infrastructure/migrations/003_add_new_field.json

# 2. Test migration
npm run migrate:dry-run

# 3. Apply to staging
npm run migrate:staging

# 4. Verify in staging
# (Check DynamoDB tables)

# 5. Apply to production
npm run migrate:production
```

### Scenario 5: Configuration Update Only

```bash
# 1. Update configuration file
# config/staging.json

# 2. Validate changes
npm run config:validate:staging

# 3. Deploy configuration
npm run config:deploy:staging

# 4. Restart services to pick up changes
# (Redeploy Lambda functions or restart containers)
```

### Scenario 6: Emergency Rollback

```bash
# 1. Immediate rollback
npm run rollback:production

# 2. Verify rollback
npm run health-check:production

# 3. Investigate issue
# (Check CloudWatch Logs, X-Ray traces)

# 4. Fix issue and redeploy
npm run deploy:full:production
```

## Environment Variables

### Deployment Control

- `STAGE` - Deployment stage (dev, staging, production)
- `AWS_REGION` - AWS region (default: us-east-1)
- `DRY_RUN` - Test without deploying (true/false)
- `SKIP_TESTS` - Skip test execution (true/false)
- `BLUE_GREEN` - Enable blue-green deployment (true/false)

### Example

```bash
# Deploy to staging in us-west-2 with blue-green
STAGE=staging AWS_REGION=us-west-2 BLUE_GREEN=true npm run deploy:full:staging
```

## Monitoring Deployment

### CloudWatch Dashboards

Monitor deployment progress:

1. **Infrastructure Dashboard** - CDK stack deployment status
2. **Lambda Dashboard** - Function deployments and health
3. **API Gateway Dashboard** - API endpoint health
4. **DynamoDB Dashboard** - Table operations

### CloudWatch Logs

Check deployment logs:

```bash
# View Lambda function logs
aws logs tail /aws/lambda/ai-agent-artifact-check-handler-staging --follow

# View CDK deployment logs
aws cloudformation describe-stack-events --stack-name AiAgentStack-staging
```

### X-Ray Traces

Monitor request traces during deployment:

```bash
# View recent traces
aws xray get-trace-summaries --start-time $(date -u -d '5 minutes ago' +%s) --end-time $(date -u +%s)
```

## Troubleshooting

### Deployment Fails at Infrastructure Step

**Symptoms**: CDK deployment fails

**Solutions**:
1. Check AWS credentials: `aws sts get-caller-identity`
2. Verify IAM permissions
3. Check CloudFormation stack status
4. Review CDK diff: `npm run diff:staging`
5. Check for resource limits (VPC, EIP, etc.)

### Database Migration Fails

**Symptoms**: Migration script errors

**Solutions**:
1. Check migration file syntax
2. Verify DynamoDB table exists
3. Check IAM permissions for DynamoDB
4. Review migration history table
5. Try dry-run first: `npm run migrate:dry-run`

### Blue-Green Deployment Fails Health Checks

**Symptoms**: Automatic rollback triggered

**Solutions**:
1. Check Lambda function logs
2. Review CloudWatch metrics (errors, duration)
3. Verify new code doesn't have bugs
4. Check environment variables
5. Test function locally first

### Configuration Deployment Fails

**Symptoms**: Parameter Store or Secrets Manager errors

**Solutions**:
1. Check IAM permissions for SSM and Secrets Manager
2. Verify parameter names don't conflict
3. Check parameter value formats
4. Review configuration file syntax
5. Try validation first: `npm run config:validate:staging`

### Frontend Deployment Fails

**Symptoms**: S3 upload or CloudFront invalidation fails

**Solutions**:
1. Check S3 bucket exists and is accessible
2. Verify IAM permissions for S3 and CloudFront
3. Check build output in `frontend/dist`
4. Verify CloudFront distribution ID
5. Check for CORS issues

## Best Practices

### 1. Always Test First

```bash
# Run tests before deploying
npm test

# Use dry-run for infrastructure changes
npm run deploy:full:staging:dry-run

# Test migrations before applying
npm run migrate:dry-run
```

### 2. Deploy to Staging First

```bash
# Deploy to staging
npm run deploy:full:staging

# Run comprehensive tests
npm run test:e2e:staging
npm run test:performance:staging

# Then deploy to production
npm run deploy:full:production
```

### 3. Use Blue-Green for Production

```bash
# Always use blue-green for production
npm run deploy:blue-green:production

# Monitor during traffic shift
# Be ready to rollback if needed
```

### 4. Monitor Deployments

- Watch CloudWatch dashboards during deployment
- Check error rates and latency
- Verify critical user journeys
- Monitor for 15-30 minutes after deployment

### 5. Keep Configuration in Version Control

- Commit configuration files (without secrets)
- Use placeholder values for secrets
- Update actual secrets in AWS Secrets Manager
- Document configuration changes

### 6. Maintain Deployment History

- Keep deployment reports
- Document issues and resolutions
- Track rollback events
- Review deployment metrics

### 7. Plan for Rollback

- Test rollback procedures regularly
- Keep previous versions available
- Document rollback steps
- Have rollback plan ready for production

## Security Considerations

### 1. Secrets Management

- Never commit actual secrets to version control
- Use AWS Secrets Manager for sensitive data
- Rotate secrets regularly
- Use IAM policies to restrict access

### 2. Deployment Permissions

- Use least-privilege IAM policies
- Require MFA for production deployments
- Use separate AWS accounts for environments
- Audit deployment activities

### 3. Configuration Validation

- Validate all configuration before deployment
- Check for security misconfigurations
- Verify encryption settings
- Review access control policies

### 4. Deployment Auditing

- Log all deployment activities
- Track who deployed what and when
- Monitor for unauthorized changes
- Review audit logs regularly

## Related Documentation

- [Main Deployment Guide](../DEPLOYMENT.md)
- [Infrastructure README](./README.md)
- [Configuration Management](../config/README.md)
- [Monitoring Guide](../MONITORING.md)

## Support

For deployment issues:

1. Check this documentation
2. Review CloudWatch Logs
3. Check AWS Service Health Dashboard
4. Contact DevOps team
5. Escalate to architecture team if needed
