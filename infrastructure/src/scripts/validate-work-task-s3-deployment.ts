#!/usr/bin/env node

/**
 * Script to validate the work task analysis S3 deployment
 * This script checks that the bucket exists and has the correct structure
 */

import { S3Client, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';
import { WORK_TASK_DIRECTORY_STRUCTURE } from '../constructs/work-task-directory-structure';

interface ValidationConfig {
  bucketName: string;
  region: string;
  stage: string;
}

class WorkTaskS3DeploymentValidator {
  private s3Client: S3Client;
  private config: ValidationConfig;

  constructor(config: ValidationConfig) {
    this.config = config;
    this.s3Client = new S3Client({ region: config.region });
  }

  async validateDeployment(): Promise<boolean> {
    console.log(`🔍 Validating work task analysis S3 deployment for bucket: ${this.config.bucketName}`);

    try {
      // Check if bucket exists
      await this.validateBucketExists();
      
      // Check directory structure
      await this.validateDirectoryStructure();
      
      // Check configuration files
      await this.validateConfigurationFiles();
      
      console.log('✅ Work task analysis S3 deployment validation completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Deployment validation failed:', error);
      return false;
    }
  }

  private async validateBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({
        Bucket: this.config.bucketName
      }));
      console.log('✓ Bucket exists and is accessible');
    } catch (error) {
      throw new Error(`Bucket ${this.config.bucketName} does not exist or is not accessible: ${error}`);
    }
  }

  private async validateDirectoryStructure(): Promise<void> {
    const expectedDirectories = [
      WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath,
      WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath,
      WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath,
      WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath,
    ];

    for (const directory of expectedDirectories) {
      const objects = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: `${directory}/`,
        MaxKeys: 1
      }));

      if (!objects.Contents || objects.Contents.length === 0) {
        console.warn(`⚠️  Directory ${directory}/ appears to be empty or missing`);
      } else {
        console.log(`✓ Directory ${directory}/ exists`);
      }
    }
  }

  private async validateConfigurationFiles(): Promise<void> {
    const configFiles = [
      'config/directory-structure.json',
    ];

    for (const configFile of configFiles) {
      try {
        const objects = await this.s3Client.send(new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: configFile,
          MaxKeys: 1
        }));

        if (objects.Contents && objects.Contents.length > 0) {
          console.log(`✓ Configuration file ${configFile} exists`);
        } else {
          console.warn(`⚠️  Configuration file ${configFile} is missing`);
        }
      } catch (error) {
        console.warn(`⚠️  Could not check configuration file ${configFile}: ${error}`);
      }
    }
  }

  async listBucketContents(): Promise<void> {
    console.log(`📋 Listing contents of bucket: ${this.config.bucketName}`);
    
    try {
      const response = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        MaxKeys: 50
      }));

      if (response.Contents && response.Contents.length > 0) {
        console.log('📁 Bucket contents:');
        response.Contents.forEach(object => {
          console.log(`  - ${object.Key} (${object.Size} bytes, ${object.LastModified})`);
        });
      } else {
        console.log('📭 Bucket is empty');
      }
    } catch (error) {
      console.error('❌ Failed to list bucket contents:', error);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node validate-work-task-s3-deployment.js <bucket-name> <region> <stage>');
    console.error('Example: node validate-work-task-s3-deployment.js ai-agent-work-task-analysis-dev-123456789 us-east-1 dev');
    process.exit(1);
  }

  const [bucketName, region, stage] = args;

  const validator = new WorkTaskS3DeploymentValidator({
    bucketName,
    region,
    stage
  });

  try {
    const isValid = await validator.validateDeployment();
    
    if (args.includes('--list-contents')) {
      await validator.listBucketContents();
    }
    
    if (isValid) {
      console.log('🎉 Deployment validation passed!');
      process.exit(0);
    } else {
      console.log('💥 Deployment validation failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Validation error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { WorkTaskS3DeploymentValidator };