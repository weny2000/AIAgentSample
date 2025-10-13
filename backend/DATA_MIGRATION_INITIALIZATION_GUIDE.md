# Work Task Data Migration and Initialization Guide

This guide provides comprehensive documentation for the data migration, initialization, backup, and recovery procedures for the Work Task Intelligent Analysis System.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Migration System](#migration-system)
4. [Data Seeding](#data-seeding)
5. [Backup and Restore](#backup-and-restore)
6. [Initialization](#initialization)
7. [Test Data Management](#test-data-management)
8. [Troubleshooting](#troubleshooting)

## Overview

The Work Task system includes a comprehensive data management infrastructure that handles:

- **Database Migrations**: Version-controlled schema changes for PostgreSQL
- **Data Seeding**: Initial population of default configurations and rules
- **Backup/Restore**: Automated backup and recovery procedures
- **Data Validation**: Integrity checking and issue detection
- **Test Data**: Generation and cleanup of test data for development

## Prerequisites

### Environment Variables

Set the following environment variables before running any scripts:

```bash
# AWS Configuration
export AWS_REGION=us-east-1

# DynamoDB Configuration
export DYNAMO_TABLE_NAME=ai-agent-system

# PostgreSQL Configuration
export POSTGRES_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=ai_agent_system

# S3 Configuration (for backups)
export S3_BUCKET_NAME=your-backup-bucket

# Optional Configuration
export MIGRATIONS_PATH=./migrations
export BACKUP_PREFIX=backups
export RETENTION_DAYS=30
```

### Required Permissions

Ensure your AWS credentials have the following permissions:

- DynamoDB: `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:Scan`, `dynamodb:Query`, `dynamodb:DeleteItem`
- S3: `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject`
- Secrets Manager: `secretsmanager:GetSecretValue`
- RDS: PostgreSQL connection permissions

## Migration System

### Running Migrations

Apply all pending migrations:

```bash
npm run data:migrate
```

Check migration status:

```bash
npm run data:migrate:status
```

Rollback to a specific version:

```bash
npm run data:migrate:rollback [version]
```

### Creating New Migrations

Create a new migration file:

```bash
npm run data:migrate:create "Migration Name" "Description"
```

This creates a timestamped migration file in `backend/migrations/` with the following structure:

```typescript
export const version = '20250105000001';
export const name = 'Migration Name';
export const description = 'Description';

export async function up(): Promise<void> {
  // Apply migration logic
}

export async function down(): Promise<void> {
  // Rollback logic
}

export async function validate(): Promise<boolean> {
  // Optional validation logic
  return true;
}
```

### Migration Best Practices

1. **Always provide rollback logic**: Implement the `down()` function for every migration
2. **Test migrations**: Use `DRY_RUN=true` to test without applying changes
3. **Version control**: Commit migration files to version control
4. **Sequential execution**: Migrations run in version order
5. **Validation**: Implement `validate()` to verify migration success

## Data Seeding

### Seed Default Configurations

Seed all default data (rules, templates, personas, teams):

```bash
npm run data:seed
```

Seed only work task specific configurations:

```bash
npm run work-task:data seed-config
```

### What Gets Seeded

The seeding process creates:

1. **Quality Standards** (5 standards):
   - Code Quality Standard
   - Documentation Quality Standard
   - Design Quality Standard
   - Infrastructure Quality Standard
   - Testing Quality Standard

2. **Artifact Types** (8 types):
   - Source Code
   - Documentation
   - Design Files
   - Infrastructure as Code
   - Test Files
   - API Specification
   - Database Schema
   - Configuration Files

3. **Workgroup Skills** (10 workgroups):
   - Frontend Development Team
   - Backend Development Team
   - DevOps Team
   - Security Team
   - QA Team
   - Data Engineering Team
   - Mobile Development Team
   - Architecture Team
   - Documentation Team
   - Design Team

### Seeding Options

Skip existing items:

```bash
SKIP_EXISTING=true npm run data:seed
```

Dry run (no actual changes):

```bash
DRY_RUN=true npm run data:seed
```

## Backup and Restore

### Creating Backups

Create a full backup:

```bash
npm run data:backup
```

The backup includes:
- All DynamoDB table data
- All PostgreSQL table data
- Metadata and checksums
- Optional compression and encryption

### Listing Backups

View all available backups:

```bash
npm run data:backup:list
```

### Restoring from Backup

Restore from a specific backup:

```bash
npm run data:restore <backup-id>
```

Restore specific tables only:

```bash
TABLES_ONLY=services,dependencies npm run data:restore <backup-id>
```

Dry run restore (preview without applying):

```bash
DRY_RUN=true npm run data:restore <backup-id>
```

### Validating Backups

Verify backup integrity:

```bash
npm run data:backup:validate <backup-id>
```

### Backup Cleanup

Remove old backups based on retention policy:

```bash
npm run data:backup:cleanup
```

Configure retention period:

```bash
RETENTION_DAYS=30 npm run data:backup:cleanup
```

### Backup Configuration

Enable/disable features:

```bash
# Enable compression (default: true)
COMPRESSION_ENABLED=true npm run data:backup

# Enable encryption (default: true)
ENCRYPTION_ENABLED=true npm run data:backup

# Set backup prefix
BACKUP_PREFIX=production-backups npm run data:backup
```

## Initialization

### Complete System Initialization

Initialize the entire work task system:

```bash
npm run work-task:init
```

This performs the following steps:
1. Run database migrations
2. Seed default configurations
3. Generate test data (optional)
4. Validate system integrity
5. Create initial backup

### Initialization Options

Skip specific steps:

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

Generate test data during initialization:

```bash
GENERATE_TEST_DATA=true TEST_DATA_COUNT=20 npm run work-task:init
```

### System Health Check

Check overall system health:

```bash
npm run data:health
```

This checks:
- Data validation status
- Migration status
- Backup status
- Overall system health

### System Maintenance

Run routine maintenance tasks:

```bash
npm run data:maintenance
```

This performs:
- Cleanup of old backups
- Data validation and fixes
- System optimization

## Test Data Management

### Generating Test Data

Generate test work tasks:

```bash
npm run work-task:data generate-test [count]
```

Example - generate 50 test tasks:

```bash
npm run work-task:data generate-test 50
```

### What Test Data Includes

Each test work task includes:
- Work task record with random priority and status
- 3-7 todo items with dependencies
- 1-3 deliverables with quality checks
- Associated metadata and timestamps

### Cleaning Up Test Data

Remove all test data:

```bash
npm run work-task:data cleanup-test
```

This removes:
- All test work tasks
- All test todos
- All test deliverables
- Test files from S3

## Data Validation

### Running Validation

Validate all data:

```bash
npm run data:validate
```

Validate and automatically fix issues:

```bash
FIX_ISSUES=true npm run data:validate
```

### Validation Checks

The validation system checks:

1. **Schema Validation**:
   - Required fields present
   - Correct data types
   - Valid enum values

2. **Referential Integrity**:
   - Foreign key relationships
   - Cross-table references
   - Orphaned records

3. **Consistency Checks**:
   - Business logic rules
   - Data format validation
   - Duplicate detection

4. **Performance Checks**:
   - Index usage
   - Query performance
   - Data distribution

### Validation Output

Validation results include:
- Total records checked
- Valid records count
- Issues found (errors, warnings, info)
- Issues fixed (if auto-fix enabled)
- Summary by category and table

## Troubleshooting

### Common Issues

#### Migration Fails

**Problem**: Migration fails with database connection error

**Solution**:
```bash
# Verify PostgreSQL connection
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -d $POSTGRES_DATABASE

# Check secret ARN is correct
aws secretsmanager get-secret-value --secret-id $POSTGRES_SECRET_ARN
```

#### Seeding Fails with Duplicate Key

**Problem**: Seeding fails because items already exist

**Solution**:
```bash
# Skip existing items
SKIP_EXISTING=true npm run data:seed
```

#### Backup Fails

**Problem**: Backup fails with S3 permission error

**Solution**:
```bash
# Verify S3 bucket exists and you have permissions
aws s3 ls s3://$S3_BUCKET_NAME

# Check IAM permissions for s3:PutObject
```

#### Restore Fails with Checksum Mismatch

**Problem**: Restore fails due to corrupted backup

**Solution**:
```bash
# Validate backup integrity first
npm run data:backup:validate <backup-id>

# Try a different backup
npm run data:backup:list
npm run data:restore <different-backup-id>
```

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm run data:migrate
DEBUG=true npm run data:seed
DEBUG=true npm run data:backup
```

### Dry Run Mode

Test operations without making changes:

```bash
DRY_RUN=true npm run data:migrate
DRY_RUN=true npm run data:seed
DRY_RUN=true npm run data:restore <backup-id>
```

## Best Practices

### Development Environment

1. **Use test data**: Generate test data for development
2. **Regular backups**: Create backups before major changes
3. **Validate frequently**: Run validation after data changes
4. **Clean up**: Remove test data when done

### Staging Environment

1. **Mirror production**: Use production-like data
2. **Test migrations**: Test all migrations before production
3. **Backup before deploy**: Always backup before deployments
4. **Validate after deploy**: Run validation after deployments

### Production Environment

1. **Scheduled backups**: Set up automated daily backups
2. **Retention policy**: Configure appropriate retention (30+ days)
3. **Monitor health**: Run health checks regularly
4. **Maintenance windows**: Schedule maintenance during low traffic

## Scripts Reference

### Migration Scripts

| Command | Description |
|---------|-------------|
| `npm run data:migrate` | Apply pending migrations |
| `npm run data:migrate:rollback [version]` | Rollback to version |
| `npm run data:migrate:status` | Show migration status |
| `npm run data:migrate:create <name> [desc]` | Create new migration |

### Seeding Scripts

| Command | Description |
|---------|-------------|
| `npm run data:seed` | Seed all default data |
| `npm run work-task:data seed-config` | Seed work task configs |
| `npm run work-task:data generate-test [count]` | Generate test data |
| `npm run work-task:data cleanup-test` | Cleanup test data |

### Backup Scripts

| Command | Description |
|---------|-------------|
| `npm run data:backup` | Create full backup |
| `npm run data:restore <id>` | Restore from backup |
| `npm run data:backup:list` | List all backups |
| `npm run data:backup:validate <id>` | Validate backup |
| `npm run data:backup:cleanup` | Remove old backups |

### Utility Scripts

| Command | Description |
|---------|-------------|
| `npm run data:init` | Initialize system |
| `npm run data:health` | System health check |
| `npm run data:maintenance` | Run maintenance |
| `npm run data:validate` | Validate all data |

## Support

For issues or questions:

1. Check this documentation
2. Review error logs
3. Run validation to identify issues
4. Check AWS CloudWatch logs
5. Contact the development team

## Version History

- **v1.0.0** (2025-01-05): Initial release
  - Database migration system
  - Data seeding utilities
  - Backup and restore functionality
  - Test data generation
  - System initialization
