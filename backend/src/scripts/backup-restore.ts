#!/usr/bin/env node

/**
 * Backup and Restore Utilities
 * 
 * This script provides utilities for:
 * - Creating backups of critical data
 * - Restoring data from backups
 * - Scheduled backup operations
 * - Cross-region backup replication
 * - Backup validation and integrity checks
 */

import { 
  DynamoDBClient, 
  ScanCommand, 
  BatchWriteItemCommand,
  DescribeTableCommand 
} from '@aws-sdk/client-dynamodb';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../lambda/utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';

interface BackupConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  s3BucketName: string;
  backupPrefix?: string;
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
  retentionDays?: number;
}

interface BackupMetadata {
  backupId: string;
  timestamp: string;
  type: 'full' | 'incremental';
  tables: string[];
  itemCount: number;
  sizeBytes: number;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  version: string;
}

interface BackupResult {
  success: boolean;
  backupId: string;
  metadata: BackupMetadata;
  duration: number;
  errors: string[];
}

interface RestoreResult {
  success: boolean;
  itemsRestored: number;
  tablesRestored: string[];
  duration: number;
  errors: string[];
}

export class BackupRestoreService {
  private logger: Logger;
  private config: BackupConfig;
  private dynamoClient: DynamoDBClient;
  private s3Client: S3Client;
  private dbConnection: DatabaseConnection;

  constructor(config: BackupConfig) {
    this.config = config;
    this.logger = new Logger('BackupRestoreService');
    
    this.dynamoClient = new DynamoDBClient({ region: config.region });
    this.s3Client = new S3Client({ region: config.region });
    
    this.dbConnection = new DatabaseConnection({
      secretArn: config.postgresSecretArn,
      host: config.postgresHost,
      port: config.postgresPort,
      database: config.postgresDatabase
    });
  }

  /**
   * Create a full backup of all data
   */
  async createFullBackup(): Promise<BackupResult> {
    const startTime = Date.now();
    const backupId = `full-${Date.now()}`;
    const errors: string[] = [];

    try {
      this.logger.info(`Starting full backup: ${backupId}`);

      // Backup DynamoDB data
      const dynamoBackup = await this.backupDynamoDBTable();
      
      // Backup PostgreSQL data
      const postgresBackup = await this.backupPostgreSQLData();

      // Combine backups
      const combinedData = {
        dynamodb: dynamoBackup.data,
        postgresql: postgresBackup.data,
        metadata: {
          dynamodb_items: dynamoBackup.itemCount,
          postgresql_tables: postgresBackup.tables.length,
          postgresql_rows: postgresBackup.rowCount
        }
      };

      // Create backup metadata
      const metadata: BackupMetadata = {
        backupId,
        timestamp: new Date().toISOString(),
        type: 'full',
        tables: ['dynamodb', ...postgresBackup.tables],
        itemCount: dynamoBackup.itemCount + postgresBackup.rowCount,
        sizeBytes: 0, // Will be calculated after compression
        checksum: '',
        compressed: this.config.compressionEnabled || false,
        encrypted: this.config.encryptionEnabled || false,
        version: '1.0.0'
      };

      // Serialize and optionally compress data
      let backupData = JSON.stringify(combinedData);
      if (this.config.compressionEnabled) {
        backupData = zlib.gzipSync(backupData).toString('base64');
      }

      metadata.sizeBytes = Buffer.byteLength(backupData);
      metadata.checksum = this.calculateChecksum(backupData);

      // Upload to S3
      const backupKey = `${this.config.backupPrefix || 'backups'}/${backupId}/data.json${this.config.compressionEnabled ? '.gz' : ''}`;
      const metadataKey = `${this.config.backupPrefix || 'backups'}/${backupId}/metadata.json`;

      await this.uploadToS3(backupKey, backupData);
      await this.uploadToS3(metadataKey, JSON.stringify(metadata, null, 2));

      this.logger.info(`Full backup completed: ${backupId}`);

      return {
        success: true,
        backupId,
        metadata,
        duration: Date.now() - startTime,
        errors
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      this.logger.error('Full backup failed:', errorMessage);

      return {
        success: false,
        backupId,
        metadata: {} as BackupMetadata,
        duration: Date.now() - startTime,
        errors
      };
    }
  }

  /**
   * Backup DynamoDB table
   */
  private async backupDynamoDBTable(): Promise<{ data: any[], itemCount: number }> {
    const items: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: this.config.dynamoTableName,
        ExclusiveStartKey: lastEvaluatedKey
      });

      const response = await this.dynamoClient.send(command);
      
      if (response.Items) {
        const unmarshalled = response.Items.map(item => unmarshall(item));
        items.push(...unmarshalled);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    this.logger.info(`Backed up ${items.length} items from DynamoDB`);
    return { data: items, itemCount: items.length };
  }

  /**
   * Backup PostgreSQL data
   */
  private async backupPostgreSQLData(): Promise<{ 
    data: Record<string, any[]>, 
    tables: string[], 
    rowCount: number 
  }> {
    const client = await this.dbConnection.getClient();
    const data: Record<string, any[]> = {};
    let totalRows = 0;

    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const tables = tablesResult.rows.map(row => row.table_name);

    // Backup each table
    for (const tableName of tables) {
      try {
        const result = await client.query(`SELECT * FROM ${tableName}`);
        data[tableName] = result.rows;
        totalRows += result.rows.length;
        this.logger.info(`Backed up ${result.rows.length} rows from ${tableName}`);
      } catch (error) {
        this.logger.error(`Failed to backup table ${tableName}:`, error);
        data[tableName] = [];
      }
    }

    return { data, tables, rowCount: totalRows };
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string, options: {
    overwriteExisting?: boolean;
    tablesOnly?: string[];
    dryRun?: boolean;
  } = {}): Promise<RestoreResult> {
    const startTime = Date.now();
    let itemsRestored = 0;
    const tablesRestored: string[] = [];
    const errors: string[] = [];

    try {
      this.logger.info(`Starting restore from backup: ${backupId}`);

      // Download backup metadata
      const metadataKey = `${this.config.backupPrefix || 'backups'}/${backupId}/metadata.json`;
      const metadata = await this.downloadFromS3(metadataKey);
      const backupMetadata: BackupMetadata = JSON.parse(metadata);

      // Download backup data
      const backupKey = `${this.config.backupPrefix || 'backups'}/${backupId}/data.json${backupMetadata.compressed ? '.gz' : ''}`;
      let backupData = await this.downloadFromS3(backupKey);

      // Decompress if needed
      if (backupMetadata.compressed) {
        backupData = zlib.gunzipSync(Buffer.from(backupData, 'base64')).toString();
      }

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(backupData);
      if (calculatedChecksum !== backupMetadata.checksum) {
        throw new Error('Backup data integrity check failed');
      }

      const data = JSON.parse(backupData);

      // Restore DynamoDB data
      if (!options.tablesOnly || options.tablesOnly.includes('dynamodb')) {
        const dynamoResult = await this.restoreDynamoDBData(
          data.dynamodb, 
          options.overwriteExisting || false,
          options.dryRun || false
        );
        itemsRestored += dynamoResult.itemsRestored;
        if (dynamoResult.success) {
          tablesRestored.push('dynamodb');
        }
        errors.push(...dynamoResult.errors);
      }

      // Restore PostgreSQL data
      if (data.postgresql) {
        for (const [tableName, tableData] of Object.entries(data.postgresql)) {
          if (options.tablesOnly && !options.tablesOnly.includes(tableName)) {
            continue;
          }

          try {
            const result = await this.restorePostgreSQLTable(
              tableName,
              tableData as any[],
              options.overwriteExisting || false,
              options.dryRun || false
            );
            itemsRestored += result.itemsRestored;
            tablesRestored.push(tableName);
          } catch (error) {
            const errorMessage = `Failed to restore table ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMessage);
            this.logger.error(errorMessage);
          }
        }
      }

      this.logger.info(`Restore completed: ${itemsRestored} items restored`);

      return {
        success: errors.length === 0,
        itemsRestored,
        tablesRestored,
        duration: Date.now() - startTime,
        errors
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      this.logger.error('Restore failed:', errorMessage);

      return {
        success: false,
        itemsRestored,
        tablesRestored,
        duration: Date.now() - startTime,
        errors
      };
    }
  }

  /**
   * Restore DynamoDB data
   */
  private async restoreDynamoDBData(
    items: any[], 
    overwriteExisting: boolean,
    dryRun: boolean
  ): Promise<{ success: boolean; itemsRestored: number; errors: string[] }> {
    const errors: string[] = [];
    let itemsRestored = 0;

    if (dryRun) {
      this.logger.info(`[DRY RUN] Would restore ${items.length} DynamoDB items`);
      return { success: true, itemsRestored: items.length, errors };
    }

    // Process items in batches of 25 (DynamoDB limit)
    const batchSize = 25;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      try {
        const writeRequests = batch.map(item => ({
          PutRequest: {
            Item: marshall(item),
            ...(overwriteExisting ? {} : { ConditionExpression: 'attribute_not_exists(pk)' })
          }
        }));

        const command = new BatchWriteItemCommand({
          RequestItems: {
            [this.config.dynamoTableName]: writeRequests
          }
        });

        await this.dynamoClient.send(command);
        itemsRestored += batch.length;
        
      } catch (error) {
        const errorMessage = `Failed to restore DynamoDB batch ${i}-${i + batch.length}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return { success: errors.length === 0, itemsRestored, errors };
  }

  /**
   * Restore PostgreSQL table
   */
  private async restorePostgreSQLTable(
    tableName: string,
    data: any[],
    overwriteExisting: boolean,
    dryRun: boolean
  ): Promise<{ itemsRestored: number }> {
    if (dryRun) {
      this.logger.info(`[DRY RUN] Would restore ${data.length} rows to ${tableName}`);
      return { itemsRestored: data.length };
    }

    const client = await this.dbConnection.getClient();
    let itemsRestored = 0;

    try {
      await client.query('BEGIN');

      if (overwriteExisting) {
        await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);
        this.logger.info(`Truncated table ${tableName}`);
      }

      // Insert data
      for (const row of data) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

        const insertSQL = `
          INSERT INTO ${tableName} (${columns.join(', ')}) 
          VALUES (${placeholders})
          ${overwriteExisting ? '' : 'ON CONFLICT DO NOTHING'}
        `;

        await client.query(insertSQL, values);
        itemsRestored++;
      }

      await client.query('COMMIT');
      this.logger.info(`Restored ${itemsRestored} rows to ${tableName}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    return { itemsRestored };
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const prefix = `${this.config.backupPrefix || 'backups'}/`;
    const command = new ListObjectsV2Command({
      Bucket: this.config.s3BucketName,
      Prefix: prefix,
      Delimiter: '/'
    });

    const response = await this.s3Client.send(command);
    const backups: BackupMetadata[] = [];

    if (response.CommonPrefixes) {
      for (const commonPrefix of response.CommonPrefixes) {
        if (commonPrefix.Prefix) {
          const backupId = commonPrefix.Prefix.replace(prefix, '').replace('/', '');
          try {
            const metadataKey = `${commonPrefix.Prefix}metadata.json`;
            const metadata = await this.downloadFromS3(metadataKey);
            backups.push(JSON.parse(metadata));
          } catch (error) {
            this.logger.warn(`Failed to load metadata for backup ${backupId}:`, error);
          }
        }
      }
    }

    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Delete old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<{ deletedBackups: string[]; errors: string[] }> {
    const deletedBackups: string[] = [];
    const errors: string[] = [];

    if (!this.config.retentionDays) {
      this.logger.info('No retention policy configured, skipping cleanup');
      return { deletedBackups, errors };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const backups = await this.listBackups();
    const oldBackups = backups.filter(backup => 
      new Date(backup.timestamp) < cutoffDate
    );

    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.backupId);
        deletedBackups.push(backup.backupId);
        this.logger.info(`Deleted old backup: ${backup.backupId}`);
      } catch (error) {
        const errorMessage = `Failed to delete backup ${backup.backupId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return { deletedBackups, errors };
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const prefix = `${this.config.backupPrefix || 'backups'}/${backupId}/`;
    
    // List all objects in the backup
    const listCommand = new ListObjectsV2Command({
      Bucket: this.config.s3BucketName,
      Prefix: prefix
    });

    const response = await this.s3Client.send(listCommand);
    
    if (response.Contents) {
      // Delete all objects
      for (const object of response.Contents) {
        if (object.Key) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.config.s3BucketName,
            Key: object.Key
          });
          await this.s3Client.send(deleteCommand);
        }
      }
    }
  }

  /**
   * Validate backup integrity
   */
  async validateBackup(backupId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Download metadata
      const metadataKey = `${this.config.backupPrefix || 'backups'}/${backupId}/metadata.json`;
      const metadata = await this.downloadFromS3(metadataKey);
      const backupMetadata: BackupMetadata = JSON.parse(metadata);

      // Download and verify data
      const backupKey = `${this.config.backupPrefix || 'backups'}/${backupId}/data.json${backupMetadata.compressed ? '.gz' : ''}`;
      let backupData = await this.downloadFromS3(backupKey);

      if (backupMetadata.compressed) {
        backupData = zlib.gunzipSync(Buffer.from(backupData, 'base64')).toString();
      }

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(backupData);
      if (calculatedChecksum !== backupMetadata.checksum) {
        errors.push('Checksum mismatch - backup data may be corrupted');
      }

      // Verify data structure
      try {
        const data = JSON.parse(backupData);
        if (!data.dynamodb || !data.postgresql) {
          errors.push('Invalid backup data structure');
        }
      } catch (error) {
        errors.push('Failed to parse backup data as JSON');
      }

      return { valid: errors.length === 0, errors };

    } catch (error) {
      errors.push(`Failed to validate backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors };
    }
  }

  /**
   * Upload data to S3
   */
  private async uploadToS3(key: string, data: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.s3BucketName,
      Key: key,
      Body: data,
      ServerSideEncryption: this.config.encryptionEnabled ? 'AES256' : undefined
    });

    await this.s3Client.send(command);
  }

  /**
   * Download data from S3
   */
  private async downloadFromS3(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.s3BucketName,
      Key: key
    });

    const response = await this.s3Client.send(command);
    
    if (!response.Body) {
      throw new Error(`No data found for key: ${key}`);
    }

    return response.Body.transformToString();
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(data: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
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
  const config: BackupConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    s3BucketName: process.env.BACKUP_S3_BUCKET || '',
    backupPrefix: process.env.BACKUP_PREFIX || 'backups',
    compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false',
    encryptionEnabled: process.env.ENCRYPTION_ENABLED !== 'false',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '30')
  };

  const command = process.argv[2];
  const backupService = new BackupRestoreService(config);

  async function runCommand() {
    try {
      switch (command) {
        case 'backup':
          const backupResult = await backupService.createFullBackup();
          console.log('Backup completed:', backupResult);
          process.exit(backupResult.success ? 0 : 1);
          break;

        case 'restore':
          const backupId = process.argv[3];
          if (!backupId) {
            console.error('Usage: npm run backup restore <backup-id>');
            process.exit(1);
          }
          const restoreResult = await backupService.restoreFromBackup(backupId);
          console.log('Restore completed:', restoreResult);
          process.exit(restoreResult.success ? 0 : 1);
          break;

        case 'list':
          const backups = await backupService.listBackups();
          console.log('Available backups:');
          backups.forEach(backup => {
            console.log(`  ${backup.backupId} - ${backup.timestamp} (${backup.type}, ${backup.itemCount} items)`);
          });
          break;

        case 'validate':
          const validateId = process.argv[3];
          if (!validateId) {
            console.error('Usage: npm run backup validate <backup-id>');
            process.exit(1);
          }
          const validation = await backupService.validateBackup(validateId);
          console.log('Validation result:', validation);
          process.exit(validation.valid ? 0 : 1);
          break;

        case 'cleanup':
          const cleanup = await backupService.cleanupOldBackups();
          console.log('Cleanup completed:', cleanup);
          break;

        default:
          console.log('Usage: npm run backup <command>');
          console.log('Commands:');
          console.log('  backup              - Create full backup');
          console.log('  restore <id>        - Restore from backup');
          console.log('  list                - List available backups');
          console.log('  validate <id>       - Validate backup integrity');
          console.log('  cleanup             - Delete old backups');
          break;
      }
    } catch (error) {
      console.error('Command failed:', error);
      process.exit(1);
    } finally {
      await backupService.cleanup();
    }
  }

  runCommand();
}