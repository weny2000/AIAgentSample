# Deployment Quick Start Guide

Quick reference for deploying the AI Agent Work Task Analysis System.

## Prerequisites

- Node.js 18+
- AWS CLI configured
- Git
- Appropriate AWS permissions

## Quick Commands

### Full Stack Deployment

```bash
# Development (with tests)
npm run deploy:full:dev

# Staging (with tests)
npm run deploy:full:staging

# Production (with blue-green)
npm run deploy:blue-green:production

# Dry run (test without deploying)
npm run deploy:full:staging:dry-run
```

### Configuration Management

```bash
# Deploy configuration
npm run config:deploy:staging

# Validate configuration
npm run config:validate:staging

# Retrieve current config
cd infrastructure && npm run config:retrieve staging
```

### Database Migrations

```bash
# Run migrations
npm run migrate:staging

# Test migrations (dry-run)
npm run migrate:dry-run
```

### Component-Specific Deployment

```bash
# Infrastructure only
npm run deploy:infrastructure:staging

# Backend only
npm run deploy:backend:staging

# Frontend only
npm run deploy:frontend:staging
```

### Rollback

```bash
# Rollback staging
npm run rollback:staging

# Rollback production
npm run rollback:production
```

### Health Checks

```bash
# Check staging health
npm run health-check:staging

# Check production health
npm run health-check:production
```

## First-Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure AWS credentials
aws configure --profile staging

# 3. Update configuration files
# Edit config/staging.json with your values

# 4. Validate configuration
npm run config:validate:staging

# 5. Deploy configuration
npm run config:deploy:staging

# 6. Update secrets in AWS Secrets Manager
# Use AWS Console or CLI to set actual secret values

# 7. Deploy full stack
npm run deploy:full:staging

# 8. Verify deployment
npm run health-check:staging
```

## Common Workflows

### Deploy Code Changes

```bash
# 1. Run tests
npm test

# 2. Deploy to staging
npm run deploy:full:staging

# 3. Run smoke tests
npm run test:smoke:staging

# 4. Deploy to production
npm run deploy:blue-green:production
```

### Update Configuration

```bash
# 1. Edit config file
# Edit config/staging.json

# 2. Validate
npm run config:validate:staging

# 3. Deploy
npm run config:deploy:staging

# 4. Redeploy services to pick up changes
npm run deploy:backend:staging
```

### Add Database Migration

```bash
# 1. Create migration file
# infrastructure/migrations/002_my_migration.json

# 2. Test migration
npm run migrate:dry-run

# 3. Apply to staging
npm run migrate:staging

# 4. Verify in staging

# 5. Apply to production
npm run migrate:production
```

### Emergency Rollback

```bash
# 1. Immediate rollback
npm run rollback:production

# 2. Verify
npm run health-check:production

# 3. Check logs
aws logs tail /aws/lambda/ai-agent-artifact-check-handler-production --follow
```

## Environment Variables

Control deployment behavior:

```bash
# Deploy to specific region
AWS_REGION=us-west-2 npm run deploy:full:staging

# Skip tests (faster, but risky)
SKIP_TESTS=true npm run deploy:full:staging

# Dry run
DRY_RUN=true npm run deploy:full:staging

# Blue-green deployment
BLUE_GREEN=true npm run deploy:full:production
```

## Monitoring

### CloudWatch Dashboards

- Infrastructure Dashboard: CDK stack status
- Lambda Dashboard: Function health
- API Gateway Dashboard: API health
- DynamoDB Dashboard: Table operations

### View Logs

```bash
# Lambda function logs
aws logs tail /aws/lambda/ai-agent-artifact-check-handler-staging --follow

# CloudFormation events
aws cloudformation describe-stack-events --stack-name AiAgentStack-staging
```

## Troubleshooting

### Deployment Fails

```bash
# 1. Check AWS credentials
aws sts get-caller-identity

# 2. Check CloudFormation status
aws cloudformation describe-stacks --stack-name AiAgentStack-staging

# 3. View detailed logs
aws logs tail /aws/lambda/function-name --follow

# 4. Try dry-run to see what would change
npm run deploy:full:staging:dry-run
```

### Configuration Issues

```bash
# Validate configuration
npm run config:validate:staging

# Retrieve current config from AWS
cd infrastructure && npm run config:retrieve staging

# Check Parameter Store
aws ssm get-parameters-by-path --path /ai-agent/staging --recursive

# Check Secrets Manager
aws secretsmanager list-secrets --filters Key=name,Values=ai-agent/staging
```

### Migration Issues

```bash
# Check migration history
aws dynamodb scan --table-name ai-agent-migrations-staging

# Test migration without applying
npm run migrate:dry-run

# Check DynamoDB table
aws dynamodb describe-table --table-name ai-agent-work-tasks-staging
```

## Best Practices

1. **Always test in staging first**
2. **Use dry-run for infrastructure changes**
3. **Monitor deployments in CloudWatch**
4. **Keep deployment reports**
5. **Use blue-green for production**
6. **Have rollback plan ready**
7. **Document any issues**
8. **Verify health checks pass**

## Getting Help

1. Check [Deployment Automation Guide](infrastructure/DEPLOYMENT_AUTOMATION.md)
2. Check [Main Deployment Guide](DEPLOYMENT.md)
3. Review CloudWatch Logs
4. Check AWS Service Health Dashboard
5. Contact DevOps team

## Related Documentation

- [Deployment Automation Guide](infrastructure/DEPLOYMENT_AUTOMATION.md) - Comprehensive guide
- [Configuration Guide](config/README.md) - Configuration management
- [Main Deployment Guide](DEPLOYMENT.md) - General deployment info
- [Monitoring Guide](MONITORING.md) - Monitoring and observability

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run deploy:full:dev` | Deploy everything to dev |
| `npm run deploy:full:staging` | Deploy everything to staging |
| `npm run deploy:blue-green:production` | Deploy to production with blue-green |
| `npm run deploy:full:staging:dry-run` | Test deployment without changes |
| `npm run config:deploy:staging` | Deploy configuration |
| `npm run migrate:staging` | Run database migrations |
| `npm run rollback:staging` | Rollback deployment |
| `npm run health-check:staging` | Check system health |
| `npm test` | Run all tests |
| `npm run test:smoke:staging` | Run smoke tests |

## Support

For deployment issues, contact:
- DevOps Team: devops@example.com
- On-call: +1-XXX-XXX-XXXX
- Slack: #deployments
