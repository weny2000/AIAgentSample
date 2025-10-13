import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface WorkTaskS3SetupCustomResourceProps {
  workTaskAnalysisBucket: s3.Bucket;
  stage: string;
}

/**
 * Custom resource to set up the work task analysis S3 directory structure
 * This runs during CDK deployment to ensure the bucket has the proper structure
 */
export class WorkTaskS3SetupCustomResource extends Construct {
  constructor(scope: Construct, id: string, props: WorkTaskS3SetupCustomResourceProps) {
    super(scope, id);

    // Create Lambda function for the custom resource
    const setupFunction = new lambda.Function(this, 'SetupFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        BUCKET_NAME: props.workTaskAnalysisBucket.bucketName,
        STAGE: props.stage,
      },
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const WORK_TASK_DIRECTORY_STRUCTURE = {
  tasks: {
    basePath: 'tasks',
    subDirectories: {
      originalContent: 'original_content.json',
      analysisResult: 'analysis_result.json',
      attachments: 'attachments',
    },
  },
  deliverables: {
    basePath: 'deliverables',
    subDirectories: {
      originalFile: 'original_file',
      validationReport: 'validation_report.json',
      qualityAssessment: 'quality_assessment.json',
    },
  },
  reports: {
    basePath: 'reports',
    subDirectories: {
      progressReports: 'progress_reports',
      qualityReports: 'quality_reports',
      summaryReports: 'summary_reports',
    },
  },
  temp: {
    basePath: 'temp',
    subDirectories: {
      uploads: 'uploads',
      processing: 'processing',
      cache: 'cache',
    },
  },
};

const s3Client = new S3Client({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const bucketName = process.env.BUCKET_NAME;
  const stage = process.env.STAGE;
  
  try {
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      await setupDirectoryStructure(bucketName, stage);
      
      return {
        Status: 'SUCCESS',
        PhysicalResourceId: \`work-task-s3-setup-\${bucketName}\`,
        Data: {
          BucketName: bucketName,
          SetupComplete: true
        }
      };
    } else if (event.RequestType === 'Delete') {
      // Don't delete the structure on stack deletion
      return {
        Status: 'SUCCESS',
        PhysicalResourceId: event.PhysicalResourceId
      };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      Status: 'FAILED',
      Reason: error.message,
      PhysicalResourceId: event.PhysicalResourceId || \`work-task-s3-setup-\${bucketName}\`
    };
  }
};

async function setupDirectoryStructure(bucketName, stage) {
  console.log(\`Setting up directory structure in bucket: \${bucketName}\`);
  
  const directories = [
    // Task directories
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/.gitkeep\`,
    
    // Deliverable directories
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/.gitkeep\`,
    
    // Report directories
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/\${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.progressReports}/.gitkeep\`,
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/\${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.qualityReports}/.gitkeep\`,
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/\${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.summaryReports}/.gitkeep\`,
    
    // Temp directories
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/\${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.uploads}/.gitkeep\`,
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/\${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.processing}/.gitkeep\`,
    \`\${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/\${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.cache}/.gitkeep\`,
  ];

  for (const key of directories) {
    const exists = await fileExists(bucketName, key);
    if (!exists) {
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: '# This file maintains the directory structure\\n',
        ContentType: 'text/plain',
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          'created-by': 'work-task-setup-custom-resource',
          'stage': stage,
          'purpose': 'directory-placeholder'
        }
      }));
      console.log(\`Created: \${key}\`);
    }
  }
  
  // Create configuration file
  const configExists = await fileExists(bucketName, 'config/directory-structure.json');
  if (!configExists) {
    const structureConfig = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      stage: stage,
      structure: WORK_TASK_DIRECTORY_STRUCTURE,
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'config/directory-structure.json',
      Body: JSON.stringify(structureConfig, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      Metadata: {
        'created-by': 'work-task-setup-custom-resource',
        'stage': stage,
        'purpose': 'configuration'
      }
    }));
    console.log('Created configuration file');
  }
}

async function fileExists(bucketName, key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: key
    }));
    return true;
  } catch (error) {
    return false;
  }
}
      `),
    });

    // Grant the Lambda function permissions to access the S3 bucket
    props.workTaskAnalysisBucket.grantReadWrite(setupFunction);

    // Add KMS permissions
    setupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey',
        ],
        resources: ['*'], // KMS key ARN would be more specific in production
      })
    );

    // Create the custom resource
    const customResource = new cr.AwsCustomResource(this, 'WorkTaskS3Setup', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: setupFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              BucketName: props.workTaskAnalysisBucket.bucketName,
              Stage: props.stage,
            },
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of(`work-task-s3-setup-${props.workTaskAnalysisBucket.bucketName}`),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: setupFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              BucketName: props.workTaskAnalysisBucket.bucketName,
              Stage: props.stage,
            },
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of(`work-task-s3-setup-${props.workTaskAnalysisBucket.bucketName}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      timeout: cdk.Duration.minutes(5),
    });

    // Ensure the custom resource runs after the bucket is created
    customResource.node.addDependency(props.workTaskAnalysisBucket);

    // Output the setup status
    new cdk.CfnOutput(this, 'WorkTaskS3SetupStatus', {
      value: customResource.getResponseField('Data.SetupComplete'),
      description: 'Work Task S3 directory structure setup status',
    });
  }
}