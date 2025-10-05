# Quick Start: Data Migration and Initialization

This guide provides quick commands to get started with the Work Task data migration and initialization system.

## Prerequisites

```bash
# Set required environment variables
export AWS_REGION=us-east-1
export DYNAMO_TABLE_NAME=ai-agent-system
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=ai_agent_system
export POSTGRES_SECRET_ARN=your-secret-arn
export S3_BUCKET_NAME=your-backup-bucket  # Optional, for backups
```

## Quick Commands

### 1. Initialize Everything (Recommended for First Time)

```bash
# Complete initialization with all steps
npm run work-task:init
```

This will:
- ✅ Run database migrations
- ✅ Seed default configurations
- ✅ Validate system integrity
- ✅ Create initial backup (if S3 configured)

### 2. Initialize with Test Data (Development)

```bash
# Initialize with test data for development
GENERATE_TEST_DATA=true TEST_DATA_COUNT=20 npm run work-task:init
```

### 3. Run Only Migrations

```bash
# Apply pending migrations
npm run data:migrate

# Check migration status
npm run data:migrate:status
```

### 4. Seed Default Configurations

```bash
# Seed all default data
npm run data:seed

# Seed only work task configurations
npm run work-task:data seed-config
```

### 5. Generate Test Data

```bash
# Generate 10 test work tasks
npm run work-task:data generate-test 10

# Generate 50 test work tasks
npm run work-task:data generate-test 50
```

### 6. Create Backup

```bash
# Create a full backup
npm run data:backup

# List all backups
npm run data:backup:list
```

### 7. Restore from Backup

```bash
# Restore from a specific backup
npm run data:restore <backup-id>

# Dry run (preview without applying)
DRY_RUN=true npm run data:restore <backup-id>
```

### 8. Validate System

```bash
# Run data validation
npm run data:validate

# Validate and auto-fix issues
FIX_ISSUES=true npm run data:validate

# Check system health
npm run data:health
```

### 9. Cleanup Test Data

```bash
# Remove all test data
npm run work-task:data cleanup-test
```

### 10. System Maintenance

```bash
# Run routine maintenance
npm run data:maintenance
```

## Common Workflows

### Development Setup

```bash
# 1. Initialize system with test data
GENERATE_TEST_DATA=true TEST_DATA_COUNT=20 npm run work-task:init

# 2. Verify everything is working
npm run data:health

# 3. When done, cleanup test data
npm run work-task:data cleanup-test
```

### Staging Deployment

```bash
# 1. Run migrations
npm run data:migrate

# 2. Seed configurations (skip existing)
SKIP_EXISTING=true npm run data:seed

# 3. Validate system
npm run data:validate

# 4. Create backup
npm run data:backup
```

### Production Deployment

```bash
# 1. Create backup before changes
npm run data:backup

# 2. Run migrations (with dry run first)
DRY_RUN=true npm run data:migrate
npm run data:migrate

# 3. Validate system
npm run data:validate

# 4. Create post-deployment backup
npm run data:backup
```

### Disaster Recovery

```bash
# 1. List available backups
npm run data:backup:list

# 2. Validate backup integrity
npm run data:backup:validate <backup-id>

# 3. Restore from backup
npm run data:restore <backup-id>

# 4. Validate restored data
npm run data:validate
```

## Testing the System

Run the test suite to verify all components:

```bash
ts-node src/scripts/test-migration-system.ts
```

## Useful Options

### Dry Run Mode

Test operations without making changes:

```bash
DRY_RUN=true npm run data:migrate
DRY_RUN=true npm run data:seed
DRY_RUN=true npm run data:restore <backup-id>
```

### Skip Options

Skip specific initialization steps:

```bash
# Skip migrations
SKIP_MIGRATIONS=true npm run work-task:init

# Skip seeding
SKIP_SEEDING=true npm run work-task:init

# Skip backup
SKIP_BACKUP=true npm run work-task:init

# Skip validation
SKIP_VALIDATION=true npm run work-task:init
```

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm run data:migrate
DEBUG=true npm run data:seed
```

## Troubleshooting

### Connection Issues

```bash
# Test PostgreSQL connection
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -d $POSTGRES_DATABASE

# Verify AWS credentials
aws sts get-caller-identity

# Check S3 bucket access
aws s3 ls s3://$S3_BUCKET_NAME
```

### Migration Issues

```bash
# Check migration status
npm run data:migrate:status

# Rollback last migration
npm run data:migrate:rollback

# Validate database state
npm run data:validate
```

### Data Issues

```bash
# Run validation to identify issues
npm run data:validate

# Auto-fix issues
FIX_ISSUES=true npm run data:validate

# Check system health
npm run data:health
```

## Next Steps

1. Review the [complete documentation](./DATA_MIGRATION_INITIALIZATION_GUIDE.md)
2. Understand [migration best practices](./DATA_MIGRATION_INITIALIZATION_GUIDE.md#best-practices)
3. Set up [automated backups](./DATA_MIGRATION_INITIALIZATION_GUIDE.md#backup-and-restore)
4. Configure [monitoring and alerts](./DATA_MIGRATION_INITIALIZATION_GUIDE.md#troubleshooting)

## Support

For detailed documentation, see:
- [Complete Migration Guide](./DATA_MIGRATION_INITIALIZATION_GUIDE.md)
- [Data Utilities README](./DATA_UTILITIES_README.md)

For issues:
1. Check error logs
2. Run `npm run data:health`
3. Review CloudWatch logs
4. Contact the development team
