#!/usr/bin/env node

/**
 * Work Task Data Seeding and Test Data Generation
 * 
 * This script provides utilities for:
 * - Seeding default work task configurations
 * - Generating test data for work task analysis
 * - Creating sample work tasks, todos, and deliverables
 * - Cleanup of test data
 */

import { DynamoDBClient, PutItemCommand, DeleteItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../lambda/utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface WorkTaskSeedingConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  s3BucketName?: string;
  generateTestData?: boolean;
  testDataCount?: number;
  cleanupTestData?: boolean;
}

interface SeedingResult {
  success: boolean;
  itemsCreated: number;
  errors: string[];
  duration: number;
}

export class WorkTaskDataSeedingService {
  private logger: Logger;
  private config: WorkTaskSeedingConfig;
  private dynamoClient: DynamoDBClient;
  private s3Client: S3Client;
  private dbConnection: DatabaseConnection;

  constructor(config: WorkTaskSeedingConfig) {
    this.config = config;
    this.logger = new Logger('WorkTaskDataSeedingService');
    
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
   * Seed default work task configurations
   */
  async seedDefaultConfigurations(): Promise<SeedingResult> {
    const startTime = Date.now();
    let itemsCreated = 0;
    const errors: string[] = [];

    try {
      this.logger.info('Seeding default work task configurations...');

      // Seed default quality standards
      await this.seedQualityStandards();
      itemsCreated += 5;

      // Seed default artifact types
      await this.seedArtifactTypes();
      itemsCreated += 8;

      // Seed default workgroup skills
      await this.seedWorkgroupSkills();
      itemsCreated += 10;

      this.logger.info(`Default configurations seeded: ${itemsCreated} items`);

      return {
        success: true,
        itemsCreated,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      this.logger.error('Failed to seed default configurations:', errorMessage);

      return {
        success: false,
        itemsCreated,
        errors,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Seed quality standards
   */
  private async seedQualityStandards(): Promise<void> {
    const qualityStandards = [
      {
        pk: 'quality_standard#code',
        sk: 'v1',
        standard_id: 'code-quality-v1',
        name: 'Code Quality Standard',
        description: 'Standard quality checks for code deliverables',
        checks: [
          { type: 'linting', threshold: 0, severity: 'high' },
          { type: 'test_coverage', threshold: 80, severity: 'medium' },
          { type: 'complexity', threshold: 10, severity: 'medium' },
          { type: 'security_scan', threshold: 0, severity: 'critical' }
        ],
        minimum_score: 75,
        created_at: new Date().toISOString()
      },
      {
        pk: 'quality_standard#documentation',
        sk: 'v1',
        standard_id: 'documentation-quality-v1',
        name: 'Documentation Quality Standard',
        description: 'Standard quality checks for documentation deliverables',
        checks: [
          { type: 'completeness', threshold: 90, severity: 'high' },
          { type: 'readability', threshold: 70, severity: 'medium' },
          { type: 'grammar', threshold: 95, severity: 'low' },
          { type: 'structure', threshold: 80, severity: 'medium' }
        ],
        minimum_score: 70,
        created_at: new Date().toISOString()
      },
      {
        pk: 'quality_standard#design',
        sk: 'v1',
        standard_id: 'design-quality-v1',
        name: 'Design Quality Standard',
        description: 'Standard quality checks for design deliverables',
        checks: [
          { type: 'completeness', threshold: 85, severity: 'high' },
          { type: 'consistency', threshold: 90, severity: 'medium' },
          { type: 'accessibility', threshold: 80, severity: 'high' },
          { type: 'responsiveness', threshold: 95, severity: 'medium' }
        ],
        minimum_score: 80,
        created_at: new Date().toISOString()
      },
      {
        pk: 'quality_standard#infrastructure',
        sk: 'v1',
        standard_id: 'infrastructure-quality-v1',
        name: 'Infrastructure Quality Standard',
        description: 'Standard quality checks for infrastructure deliverables',
        checks: [
          { type: 'security', threshold: 100, severity: 'critical' },
          { type: 'cost_optimization', threshold: 75, severity: 'medium' },
          { type: 'scalability', threshold: 80, severity: 'high' },
          { type: 'monitoring', threshold: 90, severity: 'high' }
        ],
        minimum_score: 85,
        created_at: new Date().toISOString()
      },
      {
        pk: 'quality_standard#testing',
        sk: 'v1',
        standard_id: 'testing-quality-v1',
        name: 'Testing Quality Standard',
        description: 'Standard quality checks for test deliverables',
        checks: [
          { type: 'coverage', threshold: 85, severity: 'high' },
          { type: 'assertions', threshold: 90, severity: 'medium' },
          { type: 'edge_cases', threshold: 75, severity: 'medium' },
          { type: 'maintainability', threshold: 80, severity: 'low' }
        ],
        minimum_score: 80,
        created_at: new Date().toISOString()
      }
    ];

    for (const standard of qualityStandards) {
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.config.dynamoTableName,
        Item: marshall(standard)
      }));
      this.logger.info(`Seeded quality standard: ${standard.name}`);
    }
  }

  /**
   * Seed artifact types
   */
  private async seedArtifactTypes(): Promise<void> {
    const artifactTypes = [
      {
        pk: 'artifact_type#source_code',
        sk: 'config',
        type_id: 'source_code',
        name: 'Source Code',
        extensions: ['.ts', '.js', '.py', '.java', '.go', '.rb'],
        quality_standard: 'code-quality-v1',
        validation_rules: ['linting', 'security_scan', 'test_coverage']
      },
      {
        pk: 'artifact_type#documentation',
        sk: 'config',
        type_id: 'documentation',
        name: 'Documentation',
        extensions: ['.md', '.txt', '.pdf', '.docx'],
        quality_standard: 'documentation-quality-v1',
        validation_rules: ['completeness', 'grammar', 'structure']
      },
      {
        pk: 'artifact_type#design',
        sk: 'config',
        type_id: 'design',
        name: 'Design Files',
        extensions: ['.fig', '.sketch', '.xd', '.psd', '.ai'],
        quality_standard: 'design-quality-v1',
        validation_rules: ['completeness', 'consistency', 'accessibility']
      },
      {
        pk: 'artifact_type#infrastructure',
        sk: 'config',
        type_id: 'infrastructure',
        name: 'Infrastructure as Code',
        extensions: ['.yaml', '.yml', '.json', '.tf'],
        quality_standard: 'infrastructure-quality-v1',
        validation_rules: ['security', 'cost_optimization', 'scalability']
      },
      {
        pk: 'artifact_type#test',
        sk: 'config',
        type_id: 'test',
        name: 'Test Files',
        extensions: ['.test.ts', '.test.js', '.spec.ts', '.spec.js'],
        quality_standard: 'testing-quality-v1',
        validation_rules: ['coverage', 'assertions', 'edge_cases']
      },
      {
        pk: 'artifact_type#api_spec',
        sk: 'config',
        type_id: 'api_spec',
        name: 'API Specification',
        extensions: ['.yaml', '.yml', '.json'],
        quality_standard: 'documentation-quality-v1',
        validation_rules: ['completeness', 'structure', 'validation']
      },
      {
        pk: 'artifact_type#database_schema',
        sk: 'config',
        type_id: 'database_schema',
        name: 'Database Schema',
        extensions: ['.sql', '.prisma', '.graphql'],
        quality_standard: 'infrastructure-quality-v1',
        validation_rules: ['security', 'performance', 'normalization']
      },
      {
        pk: 'artifact_type#configuration',
        sk: 'config',
        type_id: 'configuration',
        name: 'Configuration Files',
        extensions: ['.json', '.yaml', '.yml', '.toml', '.ini'],
        quality_standard: 'infrastructure-quality-v1',
        validation_rules: ['security', 'validation', 'completeness']
      }
    ];

    for (const artifactType of artifactTypes) {
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.config.dynamoTableName,
        Item: marshall(artifactType)
      }));
      this.logger.info(`Seeded artifact type: ${artifactType.name}`);
    }
  }

  /**
   * Seed workgroup skills
   */
  private async seedWorkgroupSkills(): Promise<void> {
    const workgroupSkills = [
      {
        pk: 'workgroup#frontend-team',
        sk: 'skills',
        workgroup_id: 'frontend-team',
        name: 'Frontend Development Team',
        skills: ['React', 'TypeScript', 'CSS', 'HTML', 'UI/UX', 'Accessibility'],
        expertise_level: 'expert',
        capacity: 5
      },
      {
        pk: 'workgroup#backend-team',
        sk: 'skills',
        workgroup_id: 'backend-team',
        name: 'Backend Development Team',
        skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'DynamoDB', 'API Design', 'Microservices'],
        expertise_level: 'expert',
        capacity: 6
      },
      {
        pk: 'workgroup#devops-team',
        sk: 'skills',
        workgroup_id: 'devops-team',
        name: 'DevOps Team',
        skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Monitoring'],
        expertise_level: 'expert',
        capacity: 4
      },
      {
        pk: 'workgroup#security-team',
        sk: 'skills',
        workgroup_id: 'security-team',
        name: 'Security Team',
        skills: ['Security Auditing', 'Penetration Testing', 'Compliance', 'Encryption', 'IAM'],
        expertise_level: 'expert',
        capacity: 3
      },
      {
        pk: 'workgroup#qa-team',
        sk: 'skills',
        workgroup_id: 'qa-team',
        name: 'Quality Assurance Team',
        skills: ['Test Automation', 'Manual Testing', 'Performance Testing', 'Test Strategy'],
        expertise_level: 'expert',
        capacity: 4
      },
      {
        pk: 'workgroup#data-team',
        sk: 'skills',
        workgroup_id: 'data-team',
        name: 'Data Engineering Team',
        skills: ['Data Pipelines', 'ETL', 'Data Modeling', 'Analytics', 'Machine Learning'],
        expertise_level: 'expert',
        capacity: 4
      },
      {
        pk: 'workgroup#mobile-team',
        sk: 'skills',
        workgroup_id: 'mobile-team',
        name: 'Mobile Development Team',
        skills: ['React Native', 'iOS', 'Android', 'Mobile UI/UX', 'App Store Deployment'],
        expertise_level: 'expert',
        capacity: 4
      },
      {
        pk: 'workgroup#architecture-team',
        sk: 'skills',
        workgroup_id: 'architecture-team',
        name: 'Architecture Team',
        skills: ['System Design', 'Architecture Patterns', 'Scalability', 'Performance', 'Technical Strategy'],
        expertise_level: 'expert',
        capacity: 3
      },
      {
        pk: 'workgroup#documentation-team',
        sk: 'skills',
        workgroup_id: 'documentation-team',
        name: 'Documentation Team',
        skills: ['Technical Writing', 'API Documentation', 'User Guides', 'Knowledge Management'],
        expertise_level: 'expert',
        capacity: 3
      },
      {
        pk: 'workgroup#design-team',
        sk: 'skills',
        workgroup_id: 'design-team',
        name: 'Design Team',
        skills: ['UI Design', 'UX Research', 'Prototyping', 'Design Systems', 'User Testing'],
        expertise_level: 'expert',
        capacity: 4
      }
    ];

    for (const workgroup of workgroupSkills) {
      await this.dynamoClient.send(new PutItemCommand({
        TableName: this.config.dynamoTableName,
        Item: marshall(workgroup)
      }));
      this.logger.info(`Seeded workgroup: ${workgroup.name}`);
    }
  }

  /**
   * Generate test data
   */
  async generateTestData(count: number = 10): Promise<SeedingResult> {
    const startTime = Date.now();
    let itemsCreated = 0;
    const errors: string[] = [];

    try {
      this.logger.info(`Generating ${count} test work tasks...`);

      for (let i = 0; i < count; i++) {
        const taskId = `test-task-${uuidv4()}`;
        
        // Create work task
        await this.createTestWorkTask(taskId, i);
        itemsCreated++;

        // Create todos for the task
        const todoCount = Math.floor(Math.random() * 5) + 3; // 3-7 todos
        for (let j = 0; j < todoCount; j++) {
          await this.createTestTodo(taskId, j);
          itemsCreated++;
        }

        // Create some deliverables
        const deliverableCount = Math.floor(Math.random() * 3) + 1; // 1-3 deliverables
        for (let k = 0; k < deliverableCount; k++) {
          await this.createTestDeliverable(taskId, k);
          itemsCreated++;
        }
      }

      this.logger.info(`Test data generated: ${itemsCreated} items`);

      return {
        success: true,
        itemsCreated,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      this.logger.error('Failed to generate test data:', errorMessage);

      return {
        success: false,
        itemsCreated,
        errors,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Create test work task
   */
  private async createTestWorkTask(taskId: string, index: number): Promise<void> {
    const priorities = ['low', 'medium', 'high', 'critical'];
    const statuses = ['submitted', 'analyzing', 'analyzed', 'in_progress', 'completed'];
    const categories = ['feature', 'bug', 'improvement', 'research', 'documentation'];

    const workTask = {
      pk: `work_task#${taskId}`,
      sk: new Date().toISOString(),
      task_id: taskId,
      title: `Test Work Task ${index + 1}`,
      description: `This is a test work task for testing purposes. Task ID: ${taskId}`,
      content: `Detailed content for test task ${index + 1}. This includes requirements, context, and expected outcomes.`,
      submitted_by: `test-user-${Math.floor(Math.random() * 5) + 1}`,
      team_id: `test-team-${Math.floor(Math.random() * 3) + 1}`,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      tags: ['test', 'automated', `category-${index % 3}`],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.dynamoClient.send(new PutItemCommand({
      TableName: this.config.dynamoTableName,
      Item: marshall(workTask)
    }));
  }

  /**
   * Create test todo
   */
  private async createTestTodo(taskId: string, index: number): Promise<void> {
    const todoId = `test-todo-${uuidv4()}`;
    const priorities = ['low', 'medium', 'high', 'critical'];
    const statuses = ['pending', 'in_progress', 'completed', 'blocked'];
    const categories = ['research', 'development', 'review', 'approval', 'documentation', 'testing'];

    const todo = {
      pk: `todo#${todoId}`,
      sk: `task#${taskId}`,
      todo_id: todoId,
      task_id: taskId,
      title: `Test Todo Item ${index + 1}`,
      description: `Description for test todo item ${index + 1}`,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      estimated_hours: Math.floor(Math.random() * 16) + 2,
      category: categories[Math.floor(Math.random() * categories.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      dependencies: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.dynamoClient.send(new PutItemCommand({
      TableName: this.config.dynamoTableName,
      Item: marshall(todo)
    }));
  }

  /**
   * Create test deliverable
   */
  private async createTestDeliverable(taskId: string, index: number): Promise<void> {
    const deliverableId = `test-deliverable-${uuidv4()}`;
    const fileTypes = ['source_code', 'documentation', 'design', 'test'];
    const statuses = ['submitted', 'validating', 'approved', 'rejected', 'needs_revision'];

    const deliverable = {
      pk: `deliverable#${deliverableId}`,
      sk: `task#${taskId}`,
      deliverable_id: deliverableId,
      task_id: taskId,
      todo_id: `test-todo-${index}`,
      file_name: `test-file-${index}.ts`,
      file_type: fileTypes[Math.floor(Math.random() * fileTypes.length)],
      file_size: Math.floor(Math.random() * 100000) + 1000,
      s3_key: `test-deliverables/${taskId}/${deliverableId}/test-file-${index}.ts`,
      submitted_by: `test-user-${Math.floor(Math.random() * 5) + 1}`,
      submitted_at: new Date().toISOString(),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      created_at: new Date().toISOString()
    };

    await this.dynamoClient.send(new PutItemCommand({
      TableName: this.config.dynamoTableName,
      Item: marshall(deliverable)
    }));
  }

  /**
   * Cleanup test data
   */
  async cleanupTestData(): Promise<SeedingResult> {
    const startTime = Date.now();
    let itemsDeleted = 0;
    const errors: string[] = [];

    try {
      this.logger.info('Cleaning up test data...');

      // Scan for test items
      const scanCommand = new ScanCommand({
        TableName: this.config.dynamoTableName,
        FilterExpression: 'begins_with(pk, :prefix)',
        ExpressionAttributeValues: {
          ':prefix': { S: 'test-' }
        }
      });

      const response = await this.dynamoClient.send(scanCommand);
      
      if (response.Items) {
        for (const item of response.Items) {
          const unmarshalled = unmarshall(item);
          
          await this.dynamoClient.send(new DeleteItemCommand({
            TableName: this.config.dynamoTableName,
            Key: marshall({
              pk: unmarshalled.pk,
              sk: unmarshalled.sk
            })
          }));
          
          itemsDeleted++;
        }
      }

      // Cleanup S3 test files if bucket is configured
      if (this.config.s3BucketName) {
        await this.cleanupTestS3Files();
      }

      this.logger.info(`Test data cleanup completed: ${itemsDeleted} items deleted`);

      return {
        success: true,
        itemsCreated: itemsDeleted,
        errors,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      this.logger.error('Failed to cleanup test data:', errorMessage);

      return {
        success: false,
        itemsCreated: itemsDeleted,
        errors,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Cleanup test S3 files
   */
  private async cleanupTestS3Files(): Promise<void> {
    if (!this.config.s3BucketName) return;

    const listCommand = new ListObjectsV2Command({
      Bucket: this.config.s3BucketName,
      Prefix: 'test-deliverables/'
    });

    const response = await this.s3Client.send(listCommand);
    
    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key) {
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.config.s3BucketName,
            Key: object.Key
          }));
        }
      }
    }

    this.logger.info('Test S3 files cleaned up');
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
  const config: WorkTaskSeedingConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    s3BucketName: process.env.S3_BUCKET_NAME,
    testDataCount: parseInt(process.env.TEST_DATA_COUNT || '10')
  };

  const command = process.argv[2];
  const seedingService = new WorkTaskDataSeedingService(config);

  async function runCommand() {
    try {
      switch (command) {
        case 'seed-config':
          const configResult = await seedingService.seedDefaultConfigurations();
          console.log('Configuration seeding completed:', configResult);
          process.exit(configResult.success ? 0 : 1);
          break;

        case 'generate-test':
          const count = parseInt(process.argv[3] || config.testDataCount?.toString() || '10');
          const testResult = await seedingService.generateTestData(count);
          console.log('Test data generation completed:', testResult);
          process.exit(testResult.success ? 0 : 1);
          break;

        case 'cleanup-test':
          const cleanupResult = await seedingService.cleanupTestData();
          console.log('Test data cleanup completed:', cleanupResult);
          process.exit(cleanupResult.success ? 0 : 1);
          break;

        default:
          console.log('Usage: npm run work-task:data <command>');
          console.log('Commands:');
          console.log('  seed-config     - Seed default work task configurations');
          console.log('  generate-test [count] - Generate test work tasks (default: 10)');
          console.log('  cleanup-test    - Cleanup all test data');
          break;
      }
    } catch (error) {
      console.error('Command failed:', error);
      process.exit(1);
    } finally {
      await seedingService.cleanup();
    }
  }

  runCommand();
}
