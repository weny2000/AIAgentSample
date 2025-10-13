#!/usr/bin/env node

/**
 * Work Task System Initialization Script
 * 
 * This script provides a complete initialization workflow for the work task analysis system:
 * - Run database migrations
 * - Seed default configurations
 * - Initialize quality standards
 * - Setup workgroup skills
 * - Create initial backup
 * - Validate system health
 */

import { DataMigrationService } from './data-migration';
import { WorkTaskDataSeedingService } from './work-task-data-seeding';
import { BackupRestoreService } from './backup-restore';
import { DataValidationService } from './data-validation';
import { Logger } from '../lambda/utils/logger';

interface InitializationConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  s3BucketName?: string;
  migrationsPath: string;
  backupPrefix?: string;
  skipMigrations?: boolean;
  skipSeeding?: boolean;
  skipBackup?: boolean;
  skipValidation?: boolean;
  generateTestData?: boolean;
  testDataCount?: number;
}

interface InitializationResult {
  success: boolean;
  steps: {
    migrations?: { success: boolean; applied: number; errors: string[] };
    seeding?: { success: boolean; itemsCreated: number; errors: string[] };
    testData?: { success: boolean; itemsCreated: number; errors: string[] };
    backup?: { success: boolean; backupId?: string; errors: string[] };
    validation?: { success: boolean; issues: number; errors: string[] };
  };
  duration: number;
  errors: string[];
}

export class WorkTaskInitializationService {
  private logger: Logger;
  private config: InitializationConfig;

  constructor(config: InitializationConfig) {
    this.config = config;
    this.logger = new Logger('WorkTaskInitializationService');
  }

  /**
   * Initialize the complete work task system
   */
  async initialize(): Promise<InitializationResult> {
    const startTime = Date.now();
    const result: InitializationResult = {
      success: true,
      steps: {},
      duration: 0,
      errors: []
    };

    try {
      this.logger.info('Starting work task system initialization...');

      // Step 1: Run migrations
      if (!this.config.skipMigrations) {
        this.logger.info('Step 1: Running database migrations...');
        const migrationResult = await this.runMigrations();
        result.steps.migrations = migrationResult;
        
        if (!migrationResult.success) {
          result.success = false;
          result.errors.push(...migrationResult.errors);
          this.logger.error('Migration failed, stopping initialization');
          return this.finalizeResult(result, startTime);
        }
      }

      // Step 2: Seed default configurations
      if (!this.config.skipSeeding) {
        this.logger.info('Step 2: Seeding default configurations...');
        const seedingResult = await this.seedConfigurations();
        result.steps.seeding = seedingResult;
        
        if (!seedingResult.success) {
          result.success = false;
          result.errors.push(...seedingResult.errors);
          this.logger.warn('Seeding failed, but continuing initialization');
        }
      }

      // Step 3: Generate test data (optional)
      if (this.config.generateTestData) {
        this.logger.info('Step 3: Generating test data...');
        const testDataResult = await this.generateTestData();
        result.steps.testData = testDataResult;
        
        if (!testDataResult.success) {
          this.logger.warn('Test data generation failed, but continuing initialization');
        }
      }

      // Step 4: Validate system
      if (!this.config.skipValidation) {
        this.logger.info('Step 4: Validating system...');
        const validationResult = await this.validateSystem();
        result.steps.validation = validationResult;
        
        if (!validationResult.success) {
          result.success = false;
          result.errors.push(...validationResult.errors);
          this.logger.warn('Validation found issues, but initialization completed');
        }
      }

      // Step 5: Create initial backup
      if (!this.config.skipBackup && this.config.s3BucketName) {
        this.logger.info('Step 5: Creating initial backup...');
        const backupResult = await this.createBackup();
        result.steps.backup = backupResult;
        
        if (!backupResult.success) {
          this.logger.warn('Backup failed, but initialization completed');
        }
      }

      this.logger.info('Work task system initialization completed successfully');
      return this.finalizeResult(result, startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.success = false;
      result.errors.push(errorMessage);
      this.logger.error('Initialization failed:', errorMessage);
      return this.finalizeResult(result, startTime);
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<{
    success: boolean;
    applied: number;
    errors: string[];
  }> {
    try {
      const migrationService = new DataMigrationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        migrationsPath: this.config.migrationsPath
      });

      const result = await migrationService.migrate();
      await migrationService.cleanup();

      return {
        success: result.success,
        applied: result.migrationsApplied.length,
        errors: result.errors
      };
    } catch (error) {
      return {
        success: false,
        applied: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Seed default configurations
   */
  private async seedConfigurations(): Promise<{
    success: boolean;
    itemsCreated: number;
    errors: string[];
  }> {
    try {
      const seedingService = new WorkTaskDataSeedingService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        s3BucketName: this.config.s3BucketName
      });

      const result = await seedingService.seedDefaultConfigurations();
      await seedingService.cleanup();

      return {
        success: result.success,
        itemsCreated: result.itemsCreated,
        errors: result.errors
      };
    } catch (error) {
      return {
        success: false,
        itemsCreated: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Generate test data
   */
  private async generateTestData(): Promise<{
    success: boolean;
    itemsCreated: number;
    errors: string[];
  }> {
    try {
      const seedingService = new WorkTaskDataSeedingService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        s3BucketName: this.config.s3BucketName
      });

      const result = await seedingService.generateTestData(this.config.testDataCount || 10);
      await seedingService.cleanup();

      return {
        success: result.success,
        itemsCreated: result.itemsCreated,
        errors: result.errors
      };
    } catch (error) {
      return {
        success: false,
        itemsCreated: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Validate system
   */
  private async validateSystem(): Promise<{
    success: boolean;
    issues: number;
    errors: string[];
  }> {
    try {
      const validationService = new DataValidationService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase
      });

      const result = await validationService.validateAll();
      await validationService.cleanup();

      return {
        success: result.success,
        issues: result.issues.length,
        errors: result.issues
          .filter(i => i.severity === 'error')
          .map(i => i.message)
      };
    } catch (error) {
      return {
        success: false,
        issues: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Create initial backup
   */
  private async createBackup(): Promise<{
    success: boolean;
    backupId?: string;
    errors: string[];
  }> {
    if (!this.config.s3BucketName) {
      return {
        success: false,
        errors: ['S3 bucket not configured']
      };
    }

    try {
      const backupService = new BackupRestoreService({
        region: this.config.region,
        dynamoTableName: this.config.dynamoTableName,
        postgresSecretArn: this.config.postgresSecretArn,
        postgresHost: this.config.postgresHost,
        postgresPort: this.config.postgresPort,
        postgresDatabase: this.config.postgresDatabase,
        s3BucketName: this.config.s3BucketName,
        backupPrefix: this.config.backupPrefix || 'backups',
        compressionEnabled: true,
        encryptionEnabled: true
      });

      const result = await backupService.createFullBackup();
      await backupService.cleanup();

      return {
        success: result.success,
        backupId: result.backupId,
        errors: result.errors
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Finalize result with duration
   */
  private finalizeResult(result: InitializationResult, startTime: number): InitializationResult {
    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Print initialization summary
   */
  printSummary(result: InitializationResult): void {
    console.log('\n========================================');
    console.log('Work Task System Initialization Summary');
    console.log('========================================\n');

    console.log(`Overall Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s\n`);

    if (result.steps.migrations) {
      console.log('📦 Migrations:');
      console.log(`  Status: ${result.steps.migrations.success ? '✅' : '❌'}`);
      console.log(`  Applied: ${result.steps.migrations.applied}`);
      if (result.steps.migrations.errors.length > 0) {
        console.log(`  Errors: ${result.steps.migrations.errors.length}`);
      }
      console.log('');
    }

    if (result.steps.seeding) {
      console.log('🌱 Configuration Seeding:');
      console.log(`  Status: ${result.steps.seeding.success ? '✅' : '❌'}`);
      console.log(`  Items Created: ${result.steps.seeding.itemsCreated}`);
      if (result.steps.seeding.errors.length > 0) {
        console.log(`  Errors: ${result.steps.seeding.errors.length}`);
      }
      console.log('');
    }

    if (result.steps.testData) {
      console.log('🧪 Test Data Generation:');
      console.log(`  Status: ${result.steps.testData.success ? '✅' : '❌'}`);
      console.log(`  Items Created: ${result.steps.testData.itemsCreated}`);
      if (result.steps.testData.errors.length > 0) {
        console.log(`  Errors: ${result.steps.testData.errors.length}`);
      }
      console.log('');
    }

    if (result.steps.validation) {
      console.log('✔️  System Validation:');
      console.log(`  Status: ${result.steps.validation.success ? '✅' : '⚠️'}`);
      console.log(`  Issues Found: ${result.steps.validation.issues}`);
      if (result.steps.validation.errors.length > 0) {
        console.log(`  Errors: ${result.steps.validation.errors.length}`);
      }
      console.log('');
    }

    if (result.steps.backup) {
      console.log('💾 Initial Backup:');
      console.log(`  Status: ${result.steps.backup.success ? '✅' : '❌'}`);
      if (result.steps.backup.backupId) {
        console.log(`  Backup ID: ${result.steps.backup.backupId}`);
      }
      if (result.steps.backup.errors.length > 0) {
        console.log(`  Errors: ${result.steps.backup.errors.length}`);
      }
      console.log('');
    }

    if (result.errors.length > 0) {
      console.log('❌ Errors:');
      result.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
      console.log('');
    }

    console.log('========================================\n');
  }
}

// CLI interface
if (require.main === module) {
  const config: InitializationConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    s3BucketName: process.env.S3_BUCKET_NAME,
    migrationsPath: process.env.MIGRATIONS_PATH || './migrations',
    backupPrefix: process.env.BACKUP_PREFIX || 'backups',
    skipMigrations: process.env.SKIP_MIGRATIONS === 'true',
    skipSeeding: process.env.SKIP_SEEDING === 'true',
    skipBackup: process.env.SKIP_BACKUP === 'true',
    skipValidation: process.env.SKIP_VALIDATION === 'true',
    generateTestData: process.env.GENERATE_TEST_DATA === 'true',
    testDataCount: parseInt(process.env.TEST_DATA_COUNT || '10')
  };

  const initService = new WorkTaskInitializationService(config);

  initService.initialize()
    .then(result => {
      initService.printSummary(result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}
