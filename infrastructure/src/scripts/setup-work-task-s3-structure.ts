#!/usr/bin/env node

/**
 * Script to set up the initial directory structure for work task analysis in S3
 * This script creates the necessary folder structure and uploads configuration files
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { WORK_TASK_DIRECTORY_STRUCTURE, WORK_TASK_FILE_TYPES, WORK_TASK_SECURITY_CONFIG } from '../constructs/work-task-directory-structure';

interface SetupConfig {
  bucketName: string;
  region: string;
  stage: string;
}

class WorkTaskS3StructureSetup {
  private s3Client: S3Client;
  private config: SetupConfig;

  constructor(config: SetupConfig) {
    this.config = config;
    this.s3Client = new S3Client({ region: config.region });
  }

  async setupDirectoryStructure(): Promise<void> {
    console.log(`Setting up work task analysis directory structure in bucket: ${this.config.bucketName}`);

    try {
      // Create base directories with placeholder files
      await this.createDirectoryStructure();
      
      // Upload configuration files
      await this.uploadConfigurationFiles();
      
      // Create README files for each directory
      await this.createReadmeFiles();
      
      console.log('✅ Work task analysis S3 directory structure setup completed successfully');
    } catch (error) {
      console.error('❌ Failed to setup directory structure:', error);
      throw error;
    }
  }

  private async createDirectoryStructure(): Promise<void> {
    const directories = [
      // Task directories
      `${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/.gitkeep`,
      
      // Deliverable directories
      `${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/.gitkeep`,
      
      // Report directories
      `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.progressReports}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.qualityReports}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.summaryReports}/`,
      
      // Temp directories
      `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.uploads}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.processing}/`,
      `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.cache}/`,
    ];

    for (const dir of directories) {
      if (dir.endsWith('/')) {
        // Create directory marker
        await this.createDirectoryMarker(dir);
      } else {
        // Create placeholder file
        await this.createPlaceholderFile(dir);
      }
    }
  }

  private async createDirectoryMarker(key: string): Promise<void> {
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: '',
        ContentType: 'application/x-directory',
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          'created-by': 'work-task-setup-script',
          'stage': this.config.stage,
          'purpose': 'directory-marker'
        }
      }));
      console.log(`📁 Created directory: ${key}`);
    } catch (error) {
      console.error(`Failed to create directory ${key}:`, error);
      throw error;
    }
  }

  private async createPlaceholderFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: '# This file maintains the directory structure\n',
        ContentType: 'text/plain',
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          'created-by': 'work-task-setup-script',
          'stage': this.config.stage,
          'purpose': 'directory-placeholder'
        }
      }));
      console.log(`📄 Created placeholder: ${key}`);
    } catch (error) {
      console.error(`Failed to create placeholder ${key}:`, error);
      throw error;
    }
  }

  private async uploadConfigurationFiles(): Promise<void> {
    // Upload directory structure configuration
    const structureConfig = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      stage: this.config.stage,
      structure: WORK_TASK_DIRECTORY_STRUCTURE,
      fileTypes: WORK_TASK_FILE_TYPES,
      securityConfig: WORK_TASK_SECURITY_CONFIG,
    };

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: 'config/directory-structure.json',
      Body: JSON.stringify(structureConfig, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      Metadata: {
        'created-by': 'work-task-setup-script',
        'stage': this.config.stage,
        'purpose': 'configuration'
      }
    }));

    // Upload lifecycle policy configuration
    const lifecycleConfig = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      stage: this.config.stage,
      policies: {
        taskContent: {
          transitionToIA: 30, // days
          transitionToGlacier: 90, // days
          transitionToDeepArchive: 365, // days
        },
        deliverables: {
          transitionToIA: 60, // days
          transitionToGlacier: 180, // days
          transitionToDeepArchive: 730, // days
        },
        reports: {
          retention: 1095, // days (3 years)
          oldVersionRetention: 90, // days
        },
        temp: {
          retention: 7, // days
        }
      }
    };

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: 'config/lifecycle-policy.json',
      Body: JSON.stringify(lifecycleConfig, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      Metadata: {
        'created-by': 'work-task-setup-script',
        'stage': this.config.stage,
        'purpose': 'configuration'
      }
    }));

    console.log('📋 Configuration files uploaded successfully');
  }

  private async createReadmeFiles(): Promise<void> {
    const readmeFiles = [
      {
        key: 'tasks/README.md',
        content: this.generateTasksReadme()
      },
      {
        key: 'deliverables/README.md',
        content: this.generateDeliverablesReadme()
      },
      {
        key: 'reports/README.md',
        content: this.generateReportsReadme()
      },
      {
        key: 'temp/README.md',
        content: this.generateTempReadme()
      }
    ];

    for (const file of readmeFiles) {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: file.key,
        Body: file.content,
        ContentType: 'text/markdown',
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          'created-by': 'work-task-setup-script',
          'stage': this.config.stage,
          'purpose': 'documentation'
        }
      }));
      console.log(`📖 Created README: ${file.key}`);
    }
  }

  private generateTasksReadme(): string {
    return `# Work Task Analysis - Tasks Directory

This directory contains work task content and analysis results.

## Structure

\`\`\`
tasks/
├── {task_id}/
│   ├── original_content.json     # Original task submission
│   ├── analysis_result.json      # AI analysis results
│   └── attachments/              # Task attachments
│       ├── {attachment_id}.{ext}
│       └── ...
\`\`\`

## File Types

### original_content.json
Contains the original task submission including:
- Task title and description
- Submitted content
- Priority and category
- Tags and metadata
- Submitter information

### analysis_result.json
Contains AI analysis results including:
- Extracted key points
- Related workgroups
- Generated todo list
- Risk assessment
- Knowledge base references

### attachments/
Contains files attached to the task submission:
- Maximum file size: 10MB per file
- Allowed types: ${WORK_TASK_FILE_TYPES.taskAttachments.join(', ')}
- All files are encrypted at rest

## Lifecycle Policy

- Files transition to Infrequent Access after 30 days
- Files transition to Glacier after 90 days
- Files transition to Deep Archive after 365 days
- Old versions are deleted after 30 days

## Security

- All files are encrypted using AWS KMS
- Access is restricted to authorized IAM roles
- Audit logging is enabled for all operations
`;
  }

  private generateDeliverablesReadme(): string {
    return `# Work Task Analysis - Deliverables Directory

This directory contains task deliverables and their quality assessments.

## Structure

\`\`\`
deliverables/
├── {todo_id}/
│   ├── {deliverable_id}/
│   │   ├── original_file.{ext}      # Submitted deliverable
│   │   ├── validation_report.json   # Validation results
│   │   └── quality_assessment.json  # Quality check results
\`\`\`

## File Types

### original_file.{ext}
The actual deliverable file submitted by users:
- Maximum file size: 100MB per file
- Allowed types: ${WORK_TASK_FILE_TYPES.deliverables.join(', ')}
- Virus scanning required for certain file types

### validation_report.json
Contains validation results including:
- Completeness assessment
- Technical specification compliance
- Format validation
- Security scan results

### quality_assessment.json
Contains quality assessment results including:
- Quality score
- Improvement suggestions
- Standards compliance
- Detailed feedback

## Lifecycle Policy

- Files transition to Infrequent Access after 60 days
- Files transition to Glacier after 180 days
- Files transition to Deep Archive after 730 days (2 years)
- Old versions are deleted after 30 days

## Security

- All files are encrypted using AWS KMS
- Virus scanning for executable and archive files
- Content validation for document types
- Access logging and monitoring enabled
`;
  }

  private generateReportsReadme(): string {
    return `# Work Task Analysis - Reports Directory

This directory contains system-generated reports and analytics.

## Structure

\`\`\`
reports/
├── progress_reports/
│   └── {task_id}_{timestamp}.json
├── quality_reports/
│   └── {deliverable_id}_{timestamp}.json
└── summary_reports/
    └── {report_type}_{entity_id}_{timestamp}.json
\`\`\`

## Report Types

### Progress Reports
Track task and todo item progress:
- Task completion status
- Todo item progress
- Blocking issues
- Timeline analysis

### Quality Reports
Detailed quality assessments:
- Quality metrics
- Trend analysis
- Improvement tracking
- Standards compliance

### Summary Reports
High-level analytics:
- Team performance
- System usage
- Quality trends
- Resource utilization

## Lifecycle Policy

- Reports are retained for 3 years (1095 days)
- Old versions are deleted after 90 days
- Automatic cleanup of temporary reports after 7 days

## Access

- Reports are accessible to authorized users
- Historical data for trend analysis
- Export capabilities for external tools
`;
  }

  private generateTempReadme(): string {
    return `# Work Task Analysis - Temporary Directory

This directory contains temporary files during processing.

## Structure

\`\`\`
temp/
├── uploads/      # Temporary file uploads
├── processing/   # Files being processed
└── cache/        # Cached results
\`\`\`

## Usage

### uploads/
Temporary storage for file uploads before processing:
- Files are moved to permanent locations after validation
- Maximum retention: 7 days
- Automatic cleanup enabled

### processing/
Files currently being processed by the system:
- Intermediate processing results
- Temporary analysis files
- Processing status indicators

### cache/
Cached results for performance optimization:
- Analysis results cache
- Knowledge base search cache
- Computed metrics cache

## Lifecycle Policy

- All temporary files are deleted after 7 days
- No versioning for temporary files
- Automatic cleanup runs daily

## Security

- Same encryption and access controls as other directories
- Additional monitoring for unusual activity
- Automatic cleanup prevents data accumulation
`;
  }


}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node setup-work-task-s3-structure.js <bucket-name> <region> <stage>');
    process.exit(1);
  }

  const [bucketName, region, stage] = args;

  const setup = new WorkTaskS3StructureSetup({
    bucketName,
    region,
    stage
  });

  try {
    await setup.setupDirectoryStructure();
    console.log('🎉 Work task analysis S3 structure setup completed successfully!');
  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { WorkTaskS3StructureSetup };