# Data Seeding and Migration Utilities

This document describes the data management utilities for the AI Agent System, including seeding, migration, backup/restore, and validation tools.

## Overview

The data utilities provide comprehensive data management capabilities:

- **Data Seeding**: Initial data population with default rules, personas, templates, and sample data
- **Data Migration**: Schema updates and data migrations with rollback capabilities
- **Backup & Restore**: Full system backups with compression, encryption, and retention management
- **Data Validation**: Integrity checking, schema validation, and consistency verification

## Quick Start

### Initialize System
```bash
# Initialize system with migrations, seeding, validation, and backup
npm run data:init

# Initialize in dry-run mode (no actual changes)
DRY_RUN=true npm run data:init
```

### Health Check
```bash
# Perform comprehensive system health check
npm run data:health
```

### Maintenance
```bash
# Perform routine maintenance (cleanup old backups, fix data issues)
npm run data:maintenance
```

## Individual Utilities

### Data Seeding

Populate the system with initial data including default rules, personas, artifact templates, and sample teams.

```bash
# Seed all default data
npm run data:seed

# Seed with options
SKIP_EXISTING=false npm run data:seed  # Overwrite existing data
DRY_RUN=true npm run data:seed         # Preview what would be created
```

**What gets seeded:**
- Default validation rules (ESLint, CloudFormation security, semantic checks)
- Artifact templates (CloudFormation, TypeScript, API specifications)
- Sample personas (Technical Lead persona)
- Sample teams and team rosters
- Default policies and security rules
- Sample services and dependencies

### Data Migration

Manage database schema changes and data migrations.

```bash
# Apply pending migrations
npm run data:migrate

# Check migration status
npm run data:migrate:status

# Rollback to specific version
npm run data:migrate:rollback [version]

# Create new migration
npm run data:migrate:create "Add new column to services table"
```

**Migration Features:**
- Transactional migrations with automatic rollback on failure
- Version tracking and dependency management
- Validation functions for migration integrity
- Support for both PostgreSQL and DynamoDB schema changes

### Backup & Restore

Create and manage system backups with full restore capabilities.

```bash
# Create full backup
npm run data:backup

# List available backups
npm run data:backup:list

# Restore from backup
npm run data:restore <backup-id>

# Validate backup integrity
npm run data:backup:validate <backup-id>

# Clean up old backups
npm run data:backup:cleanup
```

**Backup Features:**
- Full system backup (DynamoDB + PostgreSQL)
- Compression and encryption support
- Automatic retention policy enforcement
- Integrity validation with checksums
- Cross-region backup support

### Data Validation

Validate data integrity, schema compliance, and referential consistency.

```bash
# Run comprehensive validation
npm run data:validate

# Validate and fix issues automatically
FIX_ISSUES=true npm run data:validate

# Strict mode validation
STRICT_MODE=true npm run data:validate
```

**Validation Checks:**
- Schema validation (required fields, data types, enums)
- Referential integrity (foreign key relationships)
- Business logic validation (thresholds, constraints)
- Data consistency checks (duplicates, orphaned records)
- Performance and security validations

## Configuration

All utilities use environment variables for configuration:

### Required Variables
```bash
# AWS Configuration
AWS_REGION=us-east-1
DYNAMO_TABLE_NAME=ai-agent-system

# PostgreSQL Configuration
POSTGRES_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=ai_agent_system
```

### Optional Variables
```bash
# S3 Configuration (for backups)
S3_BUCKET_NAME=ai-agent-backups
BACKUP_PREFIX=backups

# Migration Configuration
MIGRATIONS_PATH=./migrations

# Behavior Configuration
DRY_RUN=false                    # Preview mode
SKIP_EXISTING=true               # Skip existing items during seeding
FIX_ISSUES=false                 # Automatically fix validation issues
STRICT_MODE=false                # Strict validation mode

# Backup Configuration
COMPRESSION_ENABLED=true         # Enable backup compression
ENCRYPTION_ENABLED=true          # Enable backup encryption
RETENTION_DAYS=30                # Backup retention period
```

## Migration System

### Creating Migrations

Migrations are TypeScript files in the `migrations/` directory with a specific structure:

```typescript
// migrations/20241203120000_add_service_metadata.ts
export const version = '20241203120000';
export const name = 'Add Service Metadata';
export const description = 'Add metadata column to services table';

export async function up(): Promise<void> {
  // Apply migration
  const sql = `ALTER TABLE services ADD COLUMN metadata JSONB DEFAULT '{}'`;
  // Execute SQL...
}

export async function down(): Promise<void> {
  // Rollback migration
  const sql = `ALTER TABLE services DROP COLUMN metadata`;
  // Execute SQL...
}

export async function validate(): Promise<boolean> {
  // Optional validation
  return true;
}
```

### Migration Best Practices

1. **Naming**: Use timestamp prefix (YYYYMMDDHHMMSS) for ordering
2. **Reversibility**: Always implement both `up()` and `down()` functions
3. **Validation**: Include validation logic when possible
4. **Transactions**: Migrations run in transactions for safety
5. **Testing**: Test migrations on staging before production

## Backup Strategy

### Backup Types

- **Full Backup**: Complete system state (DynamoDB + PostgreSQL)
- **Incremental**: Not yet implemented (future enhancement)

### Backup Contents

- All DynamoDB items (personas, teams, templates, rules, audit logs)
- All PostgreSQL tables (services, dependencies, policies)
- Metadata and integrity checksums
- Compression and encryption as configured

### Restore Options

```bash
# Full restore (overwrites existing data)
npm run data:restore backup-id

# Selective restore (specific tables only)
RESTORE_TABLES="services,dependencies" npm run data:restore backup-id

# Dry-run restore (preview only)
DRY_RUN=true npm run data:restore backup-id
```

## Validation Categories

### Schema Validation
- Required field presence
- Data type validation
- Enum value validation
- Format validation (emails, URLs, timestamps)

### Referential Integrity
- Foreign key relationships
- Cross-table references
- Orphaned record detection

### Business Logic
- Threshold validations
- Constraint checking
- Duplicate detection
- Consistency rules

### Performance & Security
- Index usage validation
- Security configuration checks
- Performance bottleneck detection

## Monitoring and Alerting

### Health Check Integration

The health check provides comprehensive system status:

```json
{
  "overall": "healthy|warning|critical",
  "checks": [
    {
      "name": "Data Validation",
      "status": "pass|warn|fail",
      "message": "Summary message",
      "details": { /* detailed metrics */ }
    }
  ]
}
```

### Recommended Monitoring

1. **Daily Health Checks**: Automated health check execution
2. **Backup Monitoring**: Alert if backups are older than 24 hours
3. **Migration Status**: Alert on pending migrations
4. **Validation Errors**: Alert on critical data validation failures

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify AWS credentials and permissions
   - Check network connectivity to PostgreSQL
   - Validate secret ARN and secret contents

2. **Migration Failures**
   - Check migration syntax and dependencies
   - Verify database permissions
   - Review migration logs for specific errors

3. **Backup Failures**
   - Verify S3 bucket permissions
   - Check available disk space
   - Validate encryption key access

4. **Validation Errors**
   - Review specific validation messages
   - Check data consistency across tables
   - Verify schema compliance

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm run data:validate
LOG_LEVEL=debug npm run data:migrate
```

### Recovery Procedures

1. **Failed Migration**: Use rollback to previous version
2. **Data Corruption**: Restore from latest backup
3. **Validation Failures**: Use fix mode or manual correction
4. **System Inconsistency**: Run full system initialization

## Security Considerations

### Data Protection
- All backups encrypted at rest and in transit
- Secrets stored in AWS Secrets Manager
- PII detection and masking during processing

### Access Control
- IAM roles with least privilege access
- Audit logging for all operations
- Secure credential management

### Compliance
- Data retention policies enforced
- Audit trail for all data changes
- Compliance reporting capabilities

## Performance Optimization

### Large Datasets
- Batch processing for large operations
- Pagination for scan operations
- Connection pooling for database operations

### Resource Management
- Automatic cleanup of temporary resources
- Memory-efficient streaming for large backups
- Configurable batch sizes for processing

## Future Enhancements

- Incremental backup support
- Cross-region backup replication
- Real-time data validation
- Advanced migration dependency management
- Automated performance optimization
- Enhanced monitoring and alerting integration