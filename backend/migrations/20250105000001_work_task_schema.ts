/**
 * Migration: Work Task Analysis System Schema
 * Description: Create database schema for work task analysis system
 * Created: 2025-01-05T00:00:01.000Z
 */

import { DatabaseConnection } from '../src/database/connection';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';

export const version = '20250105000001';
export const name = 'Work Task Analysis System Schema';
export const description = 'Create database schema for work task analysis system';

let dbConnection: DatabaseConnection;
let dynamoClient: DynamoDBClient;

export async function up(): Promise<void> {
  console.log('Applying migration: Work Task Analysis System Schema');
  
  // Initialize connections
  dbConnection = new DatabaseConnection({
    secretArn: process.env.POSTGRES_SECRET_ARN || '',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE || 'ai_agent_system'
  });

  dynamoClient = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
  });

  try {
    // PostgreSQL schema for work task metrics and reporting
    await createPostgreSQLSchema();
    
    // DynamoDB tables for work tasks, todos, and deliverables
    await createDynamoDBTables();
    
    console.log('Work task schema migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function createPostgreSQLSchema(): Promise<void> {
  const client = await dbConnection.getClient();
  
  const sql = `
    -- Create work_task_metrics table for analytics
    CREATE TABLE IF NOT EXISTS work_task_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(255) NOT NULL,
      team_id VARCHAR(100) NOT NULL,
      submitted_by VARCHAR(100) NOT NULL,
      analysis_duration_ms INTEGER,
      todo_count INTEGER DEFAULT 0,
      deliverable_count INTEGER DEFAULT 0,
      quality_score DECIMAL(5,2),
      completion_rate DECIMAL(5,2),
      status VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    -- Create work_task_quality_checks table
    CREATE TABLE IF NOT EXISTS work_task_quality_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deliverable_id VARCHAR(255) NOT NULL,
      todo_id VARCHAR(255) NOT NULL,
      task_id VARCHAR(255) NOT NULL,
      check_type VARCHAR(50) NOT NULL,
      check_result VARCHAR(20) NOT NULL CHECK (check_result IN ('pass', 'fail', 'warning')),
      score DECIMAL(5,2),
      issues_found INTEGER DEFAULT 0,
      issues_fixed INTEGER DEFAULT 0,
      execution_time_ms INTEGER,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Create work_task_progress_snapshots table
    CREATE TABLE IF NOT EXISTS work_task_progress_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(255) NOT NULL,
      snapshot_date DATE NOT NULL,
      total_todos INTEGER NOT NULL,
      completed_todos INTEGER NOT NULL,
      in_progress_todos INTEGER NOT NULL,
      blocked_todos INTEGER NOT NULL,
      completion_percentage DECIMAL(5,2),
      estimated_completion_date DATE,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(task_id, snapshot_date)
    );

    -- Create work_task_workgroup_assignments table
    CREATE TABLE IF NOT EXISTS work_task_workgroup_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(255) NOT NULL,
      workgroup_id VARCHAR(100) NOT NULL,
      relevance_score DECIMAL(5,2),
      assignment_reason TEXT,
      assigned_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed')),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create indexes for work task tables
    CREATE INDEX IF NOT EXISTS idx_work_task_metrics_task_id ON work_task_metrics(task_id);
    CREATE INDEX IF NOT EXISTS idx_work_task_metrics_team_id ON work_task_metrics(team_id);
    CREATE INDEX IF NOT EXISTS idx_work_task_metrics_status ON work_task_metrics(status);
    CREATE INDEX IF NOT EXISTS idx_work_task_metrics_created_at ON work_task_metrics(created_at);
    
    CREATE INDEX IF NOT EXISTS idx_quality_checks_deliverable_id ON work_task_quality_checks(deliverable_id);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_task_id ON work_task_quality_checks(task_id);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_check_type ON work_task_quality_checks(check_type);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_result ON work_task_quality_checks(check_result);
    
    CREATE INDEX IF NOT EXISTS idx_progress_snapshots_task_id ON work_task_progress_snapshots(task_id);
    CREATE INDEX IF NOT EXISTS idx_progress_snapshots_date ON work_task_progress_snapshots(snapshot_date);
    
    CREATE INDEX IF NOT EXISTS idx_workgroup_assignments_task_id ON work_task_workgroup_assignments(task_id);
    CREATE INDEX IF NOT EXISTS idx_workgroup_assignments_workgroup_id ON work_task_workgroup_assignments(workgroup_id);
    CREATE INDEX IF NOT EXISTS idx_workgroup_assignments_status ON work_task_workgroup_assignments(status);

    -- Create triggers for updated_at
    CREATE TRIGGER update_work_task_metrics_updated_at BEFORE UPDATE ON work_task_metrics
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_workgroup_assignments_updated_at BEFORE UPDATE ON work_task_workgroup_assignments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  await client.query(sql);
  console.log('PostgreSQL work task schema created successfully');
}

async function createDynamoDBTables(): Promise<void> {
  // Note: In production, DynamoDB tables are typically created via CDK/CloudFormation
  // This is a reference implementation showing the table structure
  
  console.log('DynamoDB tables should be created via CDK/CloudFormation');
  console.log('Table structures:');
  console.log('- work_tasks: PK=task_id, SK=created_at, GSI: team_id, status');
  console.log('- todo_items: PK=todo_id, SK=task_id, GSI: task_id, status');
  console.log('- deliverables: PK=deliverable_id, SK=todo_id, GSI: todo_id, status');
}

export async function down(): Promise<void> {
  console.log('Rolling back migration: Work Task Analysis System Schema');
  
  const client = await dbConnection.getClient();
  
  const sql = `
    -- Drop triggers
    DROP TRIGGER IF EXISTS update_workgroup_assignments_updated_at ON work_task_workgroup_assignments;
    DROP TRIGGER IF EXISTS update_work_task_metrics_updated_at ON work_task_metrics;
    
    -- Drop indexes
    DROP INDEX IF EXISTS idx_workgroup_assignments_status;
    DROP INDEX IF EXISTS idx_workgroup_assignments_workgroup_id;
    DROP INDEX IF EXISTS idx_workgroup_assignments_task_id;
    DROP INDEX IF EXISTS idx_progress_snapshots_date;
    DROP INDEX IF EXISTS idx_progress_snapshots_task_id;
    DROP INDEX IF EXISTS idx_quality_checks_result;
    DROP INDEX IF EXISTS idx_quality_checks_check_type;
    DROP INDEX IF EXISTS idx_quality_checks_task_id;
    DROP INDEX IF EXISTS idx_quality_checks_deliverable_id;
    DROP INDEX IF EXISTS idx_work_task_metrics_created_at;
    DROP INDEX IF EXISTS idx_work_task_metrics_status;
    DROP INDEX IF EXISTS idx_work_task_metrics_team_id;
    DROP INDEX IF EXISTS idx_work_task_metrics_task_id;
    
    -- Drop tables
    DROP TABLE IF EXISTS work_task_workgroup_assignments;
    DROP TABLE IF EXISTS work_task_progress_snapshots;
    DROP TABLE IF EXISTS work_task_quality_checks;
    DROP TABLE IF EXISTS work_task_metrics;
  `;

  await client.query(sql);
  console.log('Work task schema rollback completed');
  
  await dbConnection.close();
}

export async function validate(): Promise<boolean> {
  console.log('Validating migration: Work Task Analysis System Schema');
  
  try {
    const client = await dbConnection.getClient();
    
    // Check if tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'work_task_metrics',
        'work_task_quality_checks',
        'work_task_progress_snapshots',
        'work_task_workgroup_assignments'
      )
    `);
    
    const expectedTables = 4;
    const actualTables = result.rows.length;
    
    if (actualTables === expectedTables) {
      console.log('All work task tables exist');
      return true;
    } else {
      console.log(`Expected ${expectedTables} tables, found ${actualTables}`);
      return false;
    }
  } catch (error) {
    console.error('Validation failed:', error);
    return false;
  }
}
