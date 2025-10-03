#!/usr/bin/env node

/**
 * Data Utilities Main Script
 * 
 * This script provides a unified interface for all data management utilities:
 * - Data seeding and initial population
 * - Data migration and schema updates
 * - Backup and restore operations
 * - Data validation and integrity checking
 */

import { DataSeedingService } from './data-seeding';
import { DataMigrationService } from './data-migration';
import { BackupRestoreService } from './backup-restore';
import { DataValidationService } from './data-validation';
import { Logger } from '../lambda/utils/logger';

interface UtilitiesConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  s3BucketName?: string;
  migrationsPath?: string;
  backupPrefix?: string;
  dryRun?: boolean;
  skipExisting?: boolean;
  fixIssues?: boolean;
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
  retentionDays?: number;
}

class DataUtilitiesOrchestrator {
  private logger: Logger;
  private config: UtilitiesConfig;

  constructor(config: UtilitiesConfig) {
    this.config = config;
    this.logger = new Logger('DataUtilitiesOrchestrator');
  }

  /**
   * Initialize system with fresh data
   */
  async initializeSystem(): Promise<void> {
    this.logger.info('Initializing system with fresh data...');

    try {
      // 1. Run migrations first
      this.logger.info('Step 1: Running database migrations...');
      const migrationService = new DataMigrationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        migrationsPath: this.config.migrationsPath || './migrations',
        dryRun: this.config.dryRun
      });

      const migrationResult = await migrationService.migrate();
      if (!migrationResult.success) {
        throw new Error(`Migration failed: ${migrationResult.errors.join(', ')}`);
      }
      this.logger.info(`Migrations completed: ${migrationResult.migrationsApplied.length} applied`);
      await migrationService.cleanup();

      // 2. Seed initial data
      this.logger.info('Step 2: Seeding initial data...');
      const seedingService = new DataSeedingService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        s3BucketName: this.config.s3BucketName,
        dryRun: this.config.dryRun,
        skipExisting: this.config.skipExisting
      });

      const seedingResult = await seedingService.seedAll();
      if (!seedingResult.success) {
        this.logger.warn(`Seeding completed with errors: ${seedingResult.errors.join(', ')}`);
      }
      this.logger.info(`Seeding completed: ${seedingResult.itemsCreated} items created, ${seedingResult.itemsSkipped} skipped`);
      await seedingService.cleanup();

      // 3. Validate data integrity
      this.logger.info('Step 3: Validating data integrity...');
      const validationService = new DataValidationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        fixIssues: this.config.fixIssues
      });

      const validationResult = await validationService.validateAll();
      if (!validationResult.success) {
        this.logger.warn(`Validation found ${validationResult.issues.length} issues`);
        validationResult.issues.forEach(issue => {
          if (issue.severity === 'error') {
            this.logger.error(`${issue.table}: ${issue.message}`);
          }
        });
      } else {
        this.logger.info('Data validation passed successfully');
      }
      await validationService.cleanup();

      // 4. Create initial backup
      if (this.config.s3BucketName && !this.config.dryRun) {
        this.logger.info('Step 4: Creating initial backup...');
        const backupService = new BackupRestoreService({
          region: this.config.region,
          dynamoTableName: this.config.dynamoTableName,
          postgresSecretArn: this.config.postgresSecretArn,
          postgresHost: this.config.postgresHost,
          postgresPort: this.config.postgresPort,
          postgresDatabase: this.config.postgresDatabase,
          s3BucketName: this.config.s3BucketName,
          backupPrefix: this.config.backupPrefix,
          compressionEnabled: this.config.compressionEnabled,
          encryptionEnabled: this.config.encryptionEnabled,
          retentionDays: this.config.retentionDays
        });

        const backupResult = await backupService.createFullBackup();
        if (backupResult.success) {
          this.logger.info(`Initial backup created: ${backupResult.backupId}`);
        } else {
          this.logger.warn(`Backup failed: ${backupResult.errors.join(', ')}`);
        }
        await backupService.cleanup();
      }

      this.logger.info('System initialization completed successfully');

    } catch (error) {
      this.logger.error('System initialization failed:', error);
      throw error;
    }
  }

  /**
   * Perform system health check
   */
  async healthCheck(): Promise<{
    overall: 'healthy' | 'warning' | 'critical';
    checks: Array<{
      name: string;
      status: 'pass' | 'warn' | 'fail';
      message: string;
      details?: any;
    }>;
  }> {
    const checks: Array<{
      name: string;
      status: 'pass' | 'warn' | 'fail';
      message: string;
      details?: any;
    }> = [];

    this.logger.info('Performing system health check...');

    try {
      // Check data validation
      const validationService = new DataValidationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase
      });

      const validationResult = await validationService.validateAll();
      const errorCount = validationResult.issues.filter(i => i.severity === 'error').length;
      const warningCount = validationResult.issues.filter(i => i.severity === 'warning').length;

      checks.push({
        name: 'Data Validation',
        status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
        message: `${validationResult.validRecords}/${validationResult.totalRecords} valid records, ${errorCount} errors, ${warningCount} warnings`,
        details: {
          totalRecords: validationResult.totalRecords,
          validRecords: validationResult.validRecords,
          errors: errorCount,
          warnings: warningCount,
          summary: validationResult.summary
        }
      });

      await validationService.cleanup();

      // Check migration status
      const migrationService = new DataMigrationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        migrationsPath: this.config.migrationsPath || './migrations'
      });

      const migrationStatus = await migrationService.getStatus();
      checks.push({
        name: 'Migration Status',
        status: migrationStatus.pending.length > 0 ? 'warn' : 'pass',
        message: `${migrationStatus.applied.length} applied, ${migrationStatus.pending.length} pending`,
        details: {
          applied: migrationStatus.applied.length,
          pending: migrationStatus.pending.length,
          total: migrationStatus.total
        }
      });

      await migrationService.cleanup();

      // Check backup status
      if (this.config.s3BucketName) {
        const backupService = new BackupRestoreService({
          region: this.config.region,
          dynamoTableName: this.config.dynamoTableName,
          postgresSecretArn: this.config.postgresSecretArn,
          postgresHost: this.config.postgresHost,
          postgresPort: this.config.postgresPort,
          postgresDatabase: this.config.postgresDatabase,
          s3BucketName: this.config.s3BucketName,
          backupPrefix: this.config.backupPrefix,
          retentionDays: this.config.retentionDays
        });

        try {
          const backups = await backupService.listBackups();
          const latestBackup = backups[0];
          const daysSinceLastBackup = latestBackup 
            ? Math.floor((Date.now() - new Date(latestBackup.timestamp).getTime()) / (1000 * 60 * 60 * 24))
            : Infinity;

          checks.push({
            name: 'Backup Status',
            status: daysSinceLastBackup > 7 ? 'fail' : daysSinceLastBackup > 1 ? 'warn' : 'pass',
            message: latestBackup 
              ? `Latest backup: ${daysSinceLastBackup} days ago (${latestBackup.backupId})`
              : 'No backups found',
            details: {
              totalBackups: backups.length,
              latestBackup: latestBackup?.timestamp,
              daysSinceLastBackup
            }
          });

          await backupService.cleanup();
        } catch (error) {
          checks.push({
            name: 'Backup Status',
            status: 'fail',
            message: `Failed to check backup status: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      // Determine overall status
      const failCount = checks.filter(c => c.status === 'fail').length;
      const warnCount = checks.filter(c => c.status === 'warn').length;
      
      const overall = failCount > 0 ? 'critical' : warnCount > 0 ? 'warning' : 'healthy';

      this.logger.info(`Health check completed: ${overall} (${checks.length} checks)`);

      return { overall, checks };

    } catch (error) {
      this.logger.error('Health check failed:', error);
      
      return {
        overall: 'critical',
        checks: [{
          name: 'System Health Check',
          status: 'fail',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Perform maintenance tasks
   */
  async performMaintenance(): Promise<void> {
    this.logger.info('Performing system maintenance...');

    try {
      // Clean up old backups
      if (this.config.s3BucketName && this.config.retentionDays) {
        this.logger.info('Cleaning up old backups...');
        const backupService = new BackupRestoreService({
          region: this.config.region,
          dynamoTableName: this.config.dynamoTableName,
          postgresSecretArn: this.config.postgresSecretArn,
          postgresHost: this.config.postgresHost,
          postgresPort: this.config.postgresPort,
          postgresDatabase: this.config.postgresDatabase,
          s3BucketName: this.config.s3BucketName,
          backupPrefix: this.config.backupPrefix,
          retentionDays: this.config.retentionDays
        });

        const cleanupResult = await backupService.cleanupOldBackups();
        this.logger.info(`Backup cleanup completed: ${cleanupResult.deletedBackups.length} backups deleted`);
        await backupService.cleanup();
      }

      // Validate and fix data issues
      this.logger.info('Running data validation and fixes...');
      const validationService = new DataValidationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        fixIssues: true
      });

      const validationResult = await validationService.validateAll();
      this.logger.info(`Data validation completed: ${validationResult.fixedIssues} issues fixed`);
      await validationService.cleanup();

      this.logger.info('System maintenance completed successfully');

    } catch (error) {
      this.logger.error('System maintenance failed:', error);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const config: UtilitiesConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    s3BucketName: process.env.S3_BUCKET_NAME,
    migrationsPath: process.env.MIGRATIONS_PATH || './migrations',
    backupPrefix: process.env.BACKUP_PREFIX || 'backups',
    dryRun: process.env.DRY_RUN === 'true',
    skipExisting: process.env.SKIP_EXISTING !== 'false',
    fixIssues: process.env.FIX_ISSUES === 'true',
    compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false',
    encryptionEnabled: process.env.ENCRYPTION_ENABLED !== 'false',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '30')
  };

  const command = process.argv[2];
  const orchestrator = new DataUtilitiesOrchestrator(config);

  async function runCommand() {
    try {
      switch (command) {
        case 'init':
          await orchestrator.initializeSystem();
          console.log('System initialization completed successfully');
          break;

        case 'health':
          const healthResult = await orchestrator.healthCheck();
          console.log('System Health Check Results:');
          console.log(`Overall Status: ${healthResult.overall.toUpperCase()}`);
          console.log('\nDetailed Checks:');
          healthResult.checks.forEach(check => {
            const status = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
            console.log(`  ${status} ${check.name}: ${check.message}`);
          });
          process.exit(healthResult.overall === 'critical' ? 1 : 0);
          break;

        case 'maintenance':
          await orchestrator.performMaintenance();
          console.log('System maintenance completed successfully');
          break;

        default:
          console.log('Usage: npm run data-utilities <command>');
          console.log('Commands:');
          console.log('  init        - Initialize system with migrations, seeding, validation, and backup');
          console.log('  health      - Perform comprehensive system health check');
          console.log('  maintenance - Perform routine maintenance tasks');
          console.log('');
          console.log('Environment Variables:');
          console.log('  AWS_REGION              - AWS region (default: us-east-1)');
          console.log('  DYNAMO_TABLE_NAME       - DynamoDB table name (default: ai-agent-system)');
          console.log('  POSTGRES_SECRET_ARN     - PostgreSQL credentials secret ARN');
          console.log('  POSTGRES_HOST           - PostgreSQL host (default: localhost)');
          console.log('  POSTGRES_PORT           - PostgreSQL port (default: 5432)');
          console.log('  POSTGRES_DATABASE       - PostgreSQL database (default: ai_agent_system)');
          console.log('  S3_BUCKET_NAME          - S3 bucket for backups');
          console.log('  MIGRATIONS_PATH         - Path to migration files (default: ./migrations)');
          console.log('  BACKUP_PREFIX           - S3 backup prefix (default: backups)');
          console.log('  DRY_RUN                 - Run in dry-run mode (default: false)');
          console.log('  SKIP_EXISTING           - Skip existing items during seeding (default: true)');
          console.log('  FIX_ISSUES              - Automatically fix data issues (default: false)');
          console.log('  COMPRESSION_ENABLED     - Enable backup compression (default: true)');
          console.log('  ENCRYPTION_ENABLED      - Enable backup encryption (default: true)');
          console.log('  RETENTION_DAYS          - Backup retention period (default: 30)');
          break;
      }
    } catch (error) {
      console.error('Command failed:', error);
      process.exit(1);
    }
  }

  runCommand();
}