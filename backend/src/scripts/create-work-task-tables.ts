/**
 * Database Migration Script for Work Task Analysis System
 * Creates DynamoDB tables for work task analysis functionality
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { 
  workTaskTableSchemas, 
  getEnvironmentTableSchemas, 
  TableCreationResult 
} from '../database/schemas/work-task-tables';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

/**
 * Check if a table exists
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

/**
 * Create a single table
 */
async function createTable(tableSchema: any): Promise<TableCreationResult> {
  const tableName = tableSchema.TableName;
  
  try {
    console.log(`Checking if table ${tableName} exists...`);
    
    if (await tableExists(tableName)) {
      console.log(`Table ${tableName} already exists, skipping creation`);
      return {
        tableName,
        success: true
      };
    }

    console.log(`Creating table ${tableName}...`);
    const result = await dynamoClient.send(new CreateTableCommand(tableSchema));
    
    console.log(`Waiting for table ${tableName} to become active...`);
    await waitUntilTableExists(
      { client: dynamoClient, maxWaitTime: 300 }, // 5 minutes max wait
      { TableName: tableName }
    );
    
    console.log(`Table ${tableName} created successfully`);
    return {
      tableName,
      success: true,
      arn: result.TableDescription?.TableArn
    };
    
  } catch (error: any) {
    console.error(`Failed to create table ${tableName}:`, error);
    return {
      tableName,
      success: false,
      error: error.message
    };
  }
}

/**
 * Create all work task tables
 */
async function createAllTables(): Promise<TableCreationResult[]> {
  const schemas = getEnvironmentTableSchemas();
  const results: TableCreationResult[] = [];
  
  console.log(`Creating ${schemas.length} work task analysis tables...`);
  
  for (const schema of schemas) {
    const result = await createTable(schema);
    results.push(result);
  }
  
  return results;
}

/**
 * Verify table creation
 */
async function verifyTables(): Promise<void> {
  const schemas = getEnvironmentTableSchemas();
  
  console.log('\nVerifying table creation...');
  
  for (const schema of schemas) {
    const tableName = schema.TableName!;
    try {
      const result = await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
      const status = result.Table?.TableStatus;
      const itemCount = result.Table?.ItemCount || 0;
      
      console.log(`✓ ${tableName}: ${status} (${itemCount} items)`);
      
      // Verify indexes
      const gsiCount = result.Table?.GlobalSecondaryIndexes?.length || 0;
      if (gsiCount > 0) {
        console.log(`  - Global Secondary Indexes: ${gsiCount}`);
        result.Table?.GlobalSecondaryIndexes?.forEach(gsi => {
          console.log(`    - ${gsi.IndexName}: ${gsi.IndexStatus}`);
        });
      }
      
    } catch (error: any) {
      console.log(`✗ ${tableName}: ${error.message}`);
    }
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    console.log('Work Task Analysis System - Database Setup');
    console.log('==========================================');
    console.log(`Environment: ${process.env.ENVIRONMENT || 'development'}`);
    console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
    console.log('');
    
    const results = await createAllTables();
    
    // Summary
    console.log('\nTable Creation Summary:');
    console.log('======================');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✓ Successfully created: ${successful.length} tables`);
    successful.forEach(r => console.log(`  - ${r.tableName}`));
    
    if (failed.length > 0) {
      console.log(`✗ Failed to create: ${failed.length} tables`);
      failed.forEach(r => console.log(`  - ${r.tableName}: ${r.error}`));
    }
    
    // Verify all tables
    await verifyTables();
    
    if (failed.length > 0) {
      process.exit(1);
    }
    
    console.log('\n✓ Work task analysis database setup completed successfully!');
    
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

/**
 * Cleanup function for development/testing
 */
async function cleanup(): Promise<void> {
  const { DeleteTableCommand } = await import('@aws-sdk/client-dynamodb');
  const schemas = getEnvironmentTableSchemas();
  
  console.log('Cleaning up work task analysis tables...');
  
  for (const schema of schemas) {
    const tableName = schema.TableName!;
    try {
      if (await tableExists(tableName)) {
        console.log(`Deleting table ${tableName}...`);
        await dynamoClient.send(new DeleteTableCommand({ TableName: tableName }));
        console.log(`✓ Deleted ${tableName}`);
      }
    } catch (error: any) {
      console.error(`✗ Failed to delete ${tableName}:`, error.message);
    }
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'cleanup') {
    cleanup().catch(console.error);
  } else {
    main().catch(console.error);
  }
}

export { createAllTables, verifyTables, cleanup };