# Environment Configuration Files

This directory contains environment-specific configuration files for the AI Agent system.

## Configuration Files

- `dev.json` - Development environment configuration
- `staging.json` - Staging environment configuration
- `production.json` - Production environment configuration

## Configuration Structure

Each configuration file contains two main sections:

### Parameters

Parameters are stored in AWS Systems Manager Parameter Store and include:

- **API_GATEWAY_STAGE**: The API Gateway deployment stage
- **COGNITO_USER_POOL_ID**: Cognito User Pool ID for authentication
- **COGNITO_CLIENT_ID**: Cognito User Pool Client ID
- **KENDRA_INDEX_ID**: AWS Kendra index ID for knowledge search
- **DYNAMODB_TABLE_PREFIX**: Prefix for DynamoDB table names
- **S3_ARTIFACTS_BUCKET**: S3 bucket for artifacts storage
- **S3_DOCUMENTS_BUCKET**: S3 bucket for documents storage
- **S3_AUDIT_LOGS_BUCKET**: S3 bucket for audit logs
- **LOG_LEVEL**: Application log level (debug, info, warn, error)
- **ENABLE_XRAY**: Enable AWS X-Ray tracing (true/false)
- **ENABLE_DETAILED_METRICS**: Enable detailed CloudWatch metrics (true/false)
- **MAX_CONCURRENT_EXECUTIONS**: Maximum concurrent Lambda executions
- **LAMBDA_TIMEOUT**: Lambda function timeout in seconds
- **LAMBDA_MEMORY_SIZE**: Lambda function memory size in MB

### Secrets

Secrets are stored in AWS Secrets Manager and include:

- **DATABASE_PASSWORD**: RDS PostgreSQL database password
- **JWT_SECRET**: Secret key for JWT token signing
- **ENCRYPTION_KEY**: Encryption key for sensitive data

## Usage

### Deploy Configuration

Deploy configuration to AWS for a specific environment:

```bash
# Development
npm run config:deploy dev

# Staging
npm run config:deploy staging

# Production
npm run config:deploy production
```

### Validate Configuration

Validate configuration file without deploying:

```bash
npm run config:validate staging
```

### Retrieve Configuration

Retrieve current configuration from AWS:

```bash
npm run config:retrieve production
```

### Dry Run

Test configuration deployment without making changes:

```bash
DRY_RUN=true npm run config:deploy staging
```

## Security Best Practices

1. **Never commit actual secrets** to version control
2. **Use placeholder values** in configuration files (e.g., "CHANGE_ME_IN_SECRETS_MANAGER")
3. **Update secrets** in AWS Secrets Manager after deployment
4. **Rotate secrets regularly** using AWS Secrets Manager rotation
5. **Use IAM policies** to restrict access to configuration and secrets
6. **Enable encryption** for all sensitive data at rest and in transit

## Configuration Management

### Adding New Parameters

1. Add the parameter to the appropriate environment configuration file(s)
2. Update the validation rules in `environment-config-manager.ts` if the parameter is required
3. Deploy the configuration using the deploy command
4. Update application code to use the new parameter

### Adding New Secrets

1. Add the secret to the appropriate environment configuration file(s) with a placeholder value
2. Update the validation rules in `environment-config-manager.ts` if the secret is required
3. Deploy the configuration using the deploy command
4. Manually update the secret value in AWS Secrets Manager
5. Update application code to retrieve and use the new secret

### Updating Configuration

1. Modify the configuration file
2. Validate the changes: `npm run config:validate <stage>`
3. Deploy the changes: `npm run config:deploy <stage>`
4. Verify the deployment in AWS Console (Parameter Store / Secrets Manager)

## Environment-Specific Notes

### Development

- Lower resource limits for cost optimization
- Debug logging enabled
- Detailed metrics enabled for troubleshooting

### Staging

- Production-like configuration
- Used for final testing before production deployment
- Moderate resource limits

### Production

- Maximum resource limits for performance
- Warning-level logging only
- Additional security features enabled (WAF, Shield)
- Requires manual approval for deployments

## Troubleshooting

### Configuration Deployment Fails

1. Check AWS credentials are configured correctly
2. Verify IAM permissions for Parameter Store and Secrets Manager
3. Check for typos in parameter names or values
4. Review CloudWatch Logs for detailed error messages

### Configuration Not Applied

1. Verify the configuration was deployed successfully
2. Check the correct stage/environment is being used
3. Restart services to pick up new configuration
4. Verify Parameter Store and Secrets Manager contain the expected values

### Secret Access Denied

1. Check IAM role has permissions to access Secrets Manager
2. Verify the secret exists in the correct region
3. Check resource-based policies on the secret
4. Ensure the secret is not in a pending deletion state

## Related Documentation

- [Deployment Guide](../DEPLOYMENT.md)
- [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
