# Deployment Guide

This document provides comprehensive instructions for deploying the AI Agent system to staging and production environments.

## Prerequisites

### Required Tools
- Node.js 18+ and npm 9+
- AWS CLI v2 configured with appropriate credentials
- Git
- Docker (for local testing)

### AWS Permissions
Ensure your AWS credentials have the following permissions:
- CloudFormation full access
- Lambda full access
- API Gateway full access
- S3 full access
- DynamoDB full access
- RDS full access
- VPC full access
- IAM role management
- Secrets Manager access
- CloudWatch access

### Environment Setup

1. **Configure AWS Profiles**
   ```bash
   aws configure --profile staging
   aws configure --profile production
   ```

2. **Set Environment Variables**
   ```bash
   export AWS_PROFILE=staging  # or production
   export AWS_REGION=us-east-1
   ```

## Deployment Environments

### Staging Environment
- **Purpose**: Testing and validation before production
- **Domain**: staging.ai-agent.com
- **Auto-deployment**: Triggered on push to `develop` branch
- **Manual deployment**: Available via GitHub Actions

### Production Environment
- **Purpose**: Live production system
- **Domain**: ai-agent.com
- **Auto-deployment**: Triggered on push to `main` branch
- **Manual deployment**: Requires approval via GitHub Actions

## Deployment Process

### Automated Deployment (Recommended)

#### Staging Deployment
1. Push changes to `develop` branch
2. GitHub Actions automatically triggers deployment
3. Monitor deployment progress in Actions tab
4. Verify deployment with smoke tests

#### Production Deployment
1. Create pull request from `develop` to `main`
2. Review and approve pull request
3. Merge to `main` branch
4. GitHub Actions triggers production deployment
5. Manual approval required for production deployment
6. Monitor deployment and post-deployment tests

### Manual Deployment

#### Full Stack Deployment
```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production (requires confirmation)
npm run deploy:production
```

#### Component-Specific Deployment
```bash
# Infrastructure only
npm run deploy:infrastructure:staging
npm run deploy:infrastructure:production

# Backend only
npm run deploy:backend:staging
npm run deploy:backend:production

# Frontend only
npm run deploy:frontend:staging
npm run deploy:frontend:production
```

### Individual Component Deployment

#### Infrastructure Deployment
```bash
cd infrastructure
npm ci
npm run test
npx cdk deploy --all --context environment=staging
```

#### Backend Deployment
```bash
cd backend
npm ci
npm run build
npm run test
npm run deploy:staging
```

#### Frontend Deployment
```bash
cd frontend
npm ci
npm run build:staging
aws s3 sync dist/ s3://staging-bucket/ --delete
aws cloudfront create-invalidation --distribution-id STAGING_ID --paths "/*"
```

## Deployment Scripts

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run deploy:staging` | Full staging deployment |
| `npm run deploy:production` | Full production deployment |
| `npm run deploy:infrastructure:staging` | Infrastructure to staging |
| `npm run deploy:infrastructure:production` | Infrastructure to production |
| `npm run deploy:backend:staging` | Backend to staging |
| `npm run deploy:backend:production` | Backend to production |
| `npm run deploy:frontend:staging` | Frontend to staging |
| `npm run deploy:frontend:production` | Frontend to production |
| `npm run rollback:staging` | Rollback staging deployment |
| `npm run rollback:production` | Rollback production deployment |

### Script Locations
- `scripts/deploy-infrastructure.sh` - Infrastructure deployment
- `scripts/deploy-backend.sh` - Backend deployment with blue-green support
- `scripts/deploy-frontend.sh` - Frontend deployment with backup
- `scripts/rollback.sh` - Emergency rollback procedures

## Blue-Green Deployment

Production backend deployments use blue-green strategy:

1. **Deploy New Version**: New Lambda version created
2. **Health Check**: Automated health checks on new version
3. **Traffic Switch**: Gradual traffic shift to new version
4. **Monitoring**: Continuous monitoring during switch
5. **Rollback**: Automatic rollback if issues detected

### Manual Blue-Green Control
```bash
# Deploy with blue-green strategy
cd backend
npm run deploy:production:blue-green

# Manual traffic switch (if needed)
npm run switch-traffic:production
```

## Rollback Procedures

### Automatic Rollback
- Triggered by failed health checks
- Triggered by failed post-deployment tests
- Reverts to previous stable version

### Manual Rollback
```bash
# Rollback all components
npm run rollback:production

# Rollback specific component
./scripts/rollback.sh production frontend
./scripts/rollback.sh production backend

# Rollback to specific version
./scripts/rollback.sh production frontend 20240101-120000
```

## Monitoring and Validation

### Health Checks
```bash
# Check staging health
npm run health-check:staging

# Check production health
npm run health-check:production
```

### Post-Deployment Tests
- Smoke tests run automatically after deployment
- E2E tests validate critical user journeys
- Performance tests ensure response time requirements
- Security tests validate security controls

### Monitoring Dashboards
- CloudWatch dashboards for system metrics
- Application-specific metrics and alarms
- Real-time error tracking and alerting

## Security and Compliance

### Security Scanning
- Dependency vulnerability scanning with Snyk
- Static code analysis with CodeQL
- Infrastructure security scanning with Checkov
- Container security scanning with Trivy
- Secrets detection with TruffleHog

### Compliance Checks
- Automated compliance validation in CI/CD
- Security header verification
- Encryption configuration validation
- Audit logging verification
- Access control validation

## Troubleshooting

### Common Issues

#### Deployment Failures
1. **Check AWS credentials and permissions**
2. **Verify environment variables are set**
3. **Check CloudFormation stack status**
4. **Review deployment logs in GitHub Actions**

#### Health Check Failures
1. **Check Lambda function logs**
2. **Verify API Gateway configuration**
3. **Check database connectivity**
4. **Verify security group rules**

#### Frontend Issues
1. **Check S3 bucket permissions**
2. **Verify CloudFront distribution status**
3. **Check environment variable configuration**
4. **Verify build output**

### Emergency Procedures

#### Complete System Rollback
```bash
# Stop all traffic
aws apigateway update-stage --rest-api-id API_ID --stage-name prod --patch-ops op=replace,path=/throttle/rateLimit,value=0

# Rollback all components
npm run rollback:production

# Restore traffic gradually
aws apigateway update-stage --rest-api-id API_ID --stage-name prod --patch-ops op=replace,path=/throttle/rateLimit,value=1000
```

#### Database Recovery
```bash
# Restore from backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ai-agent-db-production-restore \
  --db-snapshot-identifier ai-agent-db-production-snapshot-latest
```

## Environment Variables

### Required Environment Variables

#### GitHub Secrets (Staging)
- `AWS_ROLE_ARN_STAGING`
- `STAGING_API_URL`
- `STAGING_S3_BUCKET`
- `STAGING_CLOUDFRONT_ID`
- `STAGING_COGNITO_USER_POOL_ID`
- `STAGING_COGNITO_CLIENT_ID`

#### GitHub Secrets (Production)
- `AWS_ROLE_ARN_PRODUCTION`
- `PRODUCTION_API_URL`
- `PRODUCTION_S3_BUCKET`
- `PRODUCTION_S3_BACKUP_BUCKET`
- `PRODUCTION_CLOUDFRONT_ID`
- `PRODUCTION_COGNITO_USER_POOL_ID`
- `PRODUCTION_COGNITO_CLIENT_ID`

#### Additional Secrets
- `SNYK_TOKEN` - For vulnerability scanning
- `SLACK_WEBHOOK_URL` - For deployment notifications

## Best Practices

### Pre-Deployment
1. Run all tests locally
2. Review security scan results
3. Validate infrastructure changes with `cdk diff`
4. Ensure database migrations are backward compatible

### During Deployment
1. Monitor deployment progress
2. Watch for error alerts
3. Verify health checks pass
4. Monitor performance metrics

### Post-Deployment
1. Run comprehensive tests
2. Monitor error rates and performance
3. Verify all integrations working
4. Update documentation if needed

### Maintenance
1. Regular security updates
2. Monitor and rotate secrets
3. Review and update backup procedures
4. Performance optimization based on metrics

## Support and Escalation

### Deployment Issues
1. Check GitHub Actions logs
2. Review CloudWatch logs
3. Contact DevOps team if needed
4. Escalate to architecture team for major issues

### Production Incidents
1. Immediate rollback if critical
2. Notify stakeholders
3. Investigate root cause
4. Implement fixes and redeploy
5. Post-incident review and documentation