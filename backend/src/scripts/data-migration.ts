#!/usr/bin/env node

/**
 * Data Migration Utilities
 * 
 * This script provides utilities for:
 * - Schema updates and data migrations
 * - Version management for data structures
 * - Safe migration rollback capabilities
 * - Migration validation and testing
 */

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../lambda/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  migrationsPath: string;
  dryRun?: boolean;
  targetVersion?: string;
}

interface Migration {
  version: string;
  name: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  validate?: () => Promise<boolean>;
}

interface MigrationRecord {
  version: string;
  name: string;
  applied_at: Date;
  checksum: string;
}

interface MigrationResult {
  success: boolean;
  migrationsApplied: string[];
  errors: string[];
  duration: number;
}

export class DataMigrationService {
  private logger: Logger;
  private config: MigrationConfig;
  private dbConnection: DatabaseConnection;
  private dynamoClient: DynamoDBClient;
  private migrations: Map<string, Migration> = new Map();

  constructor(config: MigrationConfig) {
    this.config = config;
    this.logger = new Logger('DataMigrationService');
    
    this.dbConnection = new DatabaseConnection({
      secretArn: config.postgresSecretArn,
      host: config.postgresHost,
      port: config.postgresPort,
      database: config.postgresDatabase
    });

    this.dynamoClient = new DynamoDBClient({ region: config.region });
  }

  /**
   * Initialize migration system
   */
  async initialize(): Promise<void> {
    await this.ensureMigrationTable();
    await this.loadMigrations();
  }

  /**
   * Ensure migration tracking table exists
   */
  private async ensureMigrationTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW(),
        checksum VARCHAR(64) NOT NULL,
        execution_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
      ON schema_migrations(applied_at);
    `;

    try {
      const client = await this.dbConnection.getClient();
      await client.query(createTableSQL);
      this.logger.info('Migration table ensured');
    } catch (error) {
      this.logger.error('Failed to create migration table:', error);
      throw error;
    }
  }

  /**
   * Load migration files
   */
  private async loadMigrations(): Promise<void> {
    const migrationsDir = path.resolve(this.config.migrationsPath);
    
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      this.logger.info(`Created migrations directory: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
      .sort();

    for (const file of files) {
      try {
        const migrationPath = path.join(migrationsDir, file);
        const migration = require(migrationPath);
        
        if (migration.version && migration.name && migration.up && migration.down) {
          this.migrations.set(migration.version, migration);
          this.logger.debug(`Loaded migration: ${migration.version} - ${migration.name}`);
        } else {
          this.logger.warn(`Invalid migration file: ${file}`);
        }
      } catch (error) {
        this.logger.error(`Failed to load migration ${file}:`, error);
      }
    }

    this.logger.info(`Loaded ${this.migrations.size} migrations`);
  }

  /**
   * Get applied migrations
   */
  private async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const client = await this.dbConnection.getClient();
    const result = await client.query(
      'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY applied_at'
    );
    
    return result.rows.map(row => ({
      version: row.version,
      name: row.name,
      applied_at: row.applied_at,
      checksum: row.checksum
    }));
  }

  /**
   * Get pending migrations
   */
  private async getPendingMigrations(): Promise<Migration[]> {
    const applied = await this.getAppliedMigrations();
    const appliedVersions = new Set(applied.map(m => m.version));
    
    const pending = Array.from(this.migrations.values())
      .filter(migration => !appliedVersions.has(migration.version))
      .sort((a, b) => a.version.localeCompare(b.version));

    return pending;
  }

  /**
   * Run migrations
   */
  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    const migrationsApplied: string[] = [];
    const errors: string[] = [];

    try {
      await this.initialize();
      
      const pending = await this.getPendingMigrations();
      
      if (pending.length === 0) {
        this.logger.info('No pending migrations');
        return {
          success: true,
          migrationsApplied: [],
          errors: [],
          duration: Date.now() - startTime
        };
      }

      this.logger.info(`Found ${pending.length} pending migrations`);

      for (const migration of pending) {
        if (this.config.targetVersion && migration.version > this.config.targetVersion) {
          this.logger.info(`Stopping at target version ${this.config.targetVersion}`);
          break;
        }

        try {
          await this.applyMigration(migration);
          migrationsApplied.push(migration.version);
          this.logger.info(`Applied migration: ${migration.version} - ${migration.name}`);
        } catch (error) {
          const errorMessage = `Failed to apply migration ${migration.version}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          this.logger.error(errorMessage);
          break; // Stop on first error
        }
      }

      return {
        success: errors.length === 0,
        migrationsApplied,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Migration failed:', errorMessage);
      
      return {
        success: false,
        migrationsApplied,
        errors: [errorMessage],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();
    const client = await this.dbConnection.getClient();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Validate migration if validation function exists
      if (migration.validate) {
        const isValid = await migration.validate();
        if (!isValid) {
          throw new Error(`Migration validation failed: ${migration.version}`);
        }
      }

      // Apply migration
      if (!this.config.dryRun) {
        await migration.up();
      }

      // Record migration
      const checksum = this.calculateChecksum(migration);
      const executionTime = Date.now() - startTime;

      if (!this.config.dryRun) {
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) 
           VALUES ($1, $2, $3, $4)`,
          [migration.version, migration.name, checksum, executionTime]
        );
      }

      // Commit transaction
      await client.query('COMMIT');

      this.logger.info(`Migration ${migration.version} applied successfully in ${executionTime}ms`);

    } catch (error) {
      // Rollback transaction
      await client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Rollback migrations
   */
  async rollback(targetVersion?: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const migrationsRolledBack: string[] = [];
    const errors: string[] = [];

    try {
      await this.initialize();
      
      const applied = await this.getAppliedMigrations();
      const toRollback = applied
        .filter(m => !targetVersion || m.version > targetVersion)
        .sort((a, b) => b.version.localeCompare(a.version)); // Reverse order

      if (toRollback.length === 0) {
        this.logger.info('No migrations to rollback');
        return {
          success: true,
          migrationsApplied: [],
          errors: [],
          duration: Date.now() - startTime
        };
      }

      this.logger.info(`Rolling back ${toRollback.length} migrations`);

      for (const migrationRecord of toRollback) {
        const migration = this.migrations.get(migrationRecord.version);
        if (!migration) {
          const error = `Migration ${migrationRecord.version} not found in migration files`;
          errors.push(error);
          this.logger.error(error);
          continue;
        }

        try {
          await this.rollbackMigration(migration);
          migrationsRolledBack.push(migration.version);
          this.logger.info(`Rolled back migration: ${migration.version} - ${migration.name}`);
        } catch (error) {
          const errorMessage = `Failed to rollback migration ${migration.version}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          this.logger.error(errorMessage);
          break; // Stop on first error
        }
      }

      return {
        success: errors.length === 0,
        migrationsApplied: migrationsRolledBack,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Rollback failed:', errorMessage);
      
      return {
        success: false,
        migrationsApplied: migrationsRolledBack,
        errors: [errorMessage],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(migration: Migration): Promise<void> {
    const client = await this.dbConnection.getClient();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Apply rollback
      if (!this.config.dryRun) {
        await migration.down();
      }

      // Remove migration record
      if (!this.config.dryRun) {
        await client.query(
          'DELETE FROM schema_migrations WHERE version = $1',
          [migration.version]
        );
      }

      // Commit transaction
      await client.query('COMMIT');

    } catch (error) {
      // Rollback transaction
      await client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    applied: MigrationRecord[];
    pending: Migration[];
    total: number;
  }> {
    await this.initialize();
    
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    
    return {
      applied,
      pending,
      total: this.migrations.size
    };
  }

  /**
   * Create a new migration file
   */
  async createMigration(name: string, description: string = ''): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const version = timestamp;
    const filename = `${version}_${name.replace(/\s+/g, '_').toLowerCase()}.ts`;
    const filepath = path.join(this.config.migrationsPath, filename);

    const template = `/**
 * Migration: ${name}
 * Description: ${description}
 * Created: ${new Date().toISOString()}
 */

export const version = '${version}';
export const name = '${name}';
export const description = '${description}';

export async function up(): Promise<void> {
  // TODO: Implement migration logic
  console.log('Applying migration: ${name}');
}

export async function down(): Promise<void> {
  // TODO: Implement rollback logic
  console.log('Rolling back migration: ${name}');
}

export async function validate(): Promise<boolean> {
  // TODO: Implement validation logic (optional)
  return true;
}
`;

    fs.writeFileSync(filepath, template);
    this.logger.info(`Created migration file: ${filepath}`);
    
    return filepath;
  }

  /**
   * Calculate checksum for migration
   */
  private calculateChecksum(migration: Migration): string {
    const crypto = require('crypto');
    const content = migration.up.toString() + migration.down.toString();
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.dbConnection.close();
      this.logger.info('Database connection closed');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }
}

// CLI interface
if (require.main === module) {
  const config: MigrationConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    migrationsPath: process.env.MIGRATIONS_PATH || './migrations',
    dryRun: process.env.DRY_RUN === 'true',
    targetVersion: process.env.TARGET_VERSION
  };

  const command = process.argv[2];
  const migrationService = new DataMigrationService(config);

  async function runCommand() {
    try {
      switch (command) {
        case 'migrate':
          const migrateResult = await migrationService.migrate();
          console.log('Migration completed:', migrateResult);
          process.exit(migrateResult.success ? 0 : 1);
          break;

        case 'rollback':
          const targetVersion = process.argv[3];
          const rollbackResult = await migrationService.rollback(targetVersion);
          console.log('Rollback completed:', rollbackResult);
          process.exit(rollbackResult.success ? 0 : 1);
          break;

        case 'status':
          const status = await migrationService.getStatus();
          console.log('Migration status:');
          console.log(`Applied: ${status.applied.length}`);
          console.log(`Pending: ${status.pending.length}`);
          console.log(`Total: ${status.total}`);
          break;

        case 'create':
          const migrationName = process.argv[3];
          const migrationDescription = process.argv[4] || '';
          if (!migrationName) {
            console.error('Usage: npm run migration create <name> [description]');
            process.exit(1);
          }
          const filepath = await migrationService.createMigration(migrationName, migrationDescription);
          console.log(`Created migration: ${filepath}`);
          break;

        default:
          console.log('Usage: npm run migration <command>');
          console.log('Commands:');
          console.log('  migrate              - Apply pending migrations');
          console.log('  rollback [version]   - Rollback to specific version');
          console.log('  status               - Show migration status');
          console.log('  create <name> [desc] - Create new migration file');
          break;
      }
    } catch (error) {
      console.error('Command failed:', error);
      process.exit(1);
    } finally {
      await migrationService.cleanup();
    }
  }

  runCommand();
}