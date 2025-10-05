import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template } from 'aws-cdk-lib/assertions';
import { WorkTaskS3Storage } from '../work-task-s3-storage';

describe('WorkTaskS3Storage', () => {
  let stack: cdk.Stack;
  let kmsKey: kms.Key;
  let artifactsBucket: s3.Bucket;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    
    kmsKey = new kms.Key(stack, 'TestKmsKey');
    artifactsBucket = new s3.Bucket(stack, 'TestArtifactsBucket');
  });

  test('creates work task analysis bucket with correct configuration', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    // Check that the bucket is created
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': [
          '',
          [
            'ai-agent-work-task-analysis-test-',
            { Ref: 'AWS::AccountId' }
          ]
        ]
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
              KMSMasterKeyID: { 'Fn::GetAtt': ['TestKmsKey', 'Arn'] }
            }
          }
        ]
      },
      VersioningConfiguration: {
        Status: 'Enabled'
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
      }
    });
  });

  test('creates lifecycle rules for different content types', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [
          {
            Id: 'WorkTaskContentTransition',
            Status: 'Enabled',
            Prefix: 'tasks/',
            Transitions: [
              {
                StorageClass: 'STANDARD_IA',
                TransitionInDays: 30
              },
              {
                StorageClass: 'GLACIER',
                TransitionInDays: 90
              },
              {
                StorageClass: 'DEEP_ARCHIVE',
                TransitionInDays: 365
              }
            ]
          },
          {
            Id: 'DeliverableFilesTransition',
            Status: 'Enabled',
            Prefix: 'deliverables/',
            Transitions: [
              {
                StorageClass: 'STANDARD_IA',
                TransitionInDays: 60
              },
              {
                StorageClass: 'GLACIER',
                TransitionInDays: 180
              },
              {
                StorageClass: 'DEEP_ARCHIVE',
                TransitionInDays: 730
              }
            ]
          },
          {
            Id: 'ReportsCleanup',
            Status: 'Enabled',
            Prefix: 'reports/',
            ExpirationInDays: 1095,
            NoncurrentVersionExpirationInDays: 90
          },
          {
            Id: 'TempFilesCleanup',
            Status: 'Enabled',
            Prefix: 'temp/',
            ExpirationInDays: 7
          },
          {
            Id: 'OldVersionsCleanup',
            Status: 'Enabled',
            NoncurrentVersionExpirationInDays: 30
          }
        ]
      }
    });
  });

  test('creates CORS configuration for frontend uploads', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [
          {
            AllowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
            AllowedOrigins: ['*'],
            AllowedHeaders: [
              'Content-Type',
              'Content-Length',
              'Authorization',
              'X-Amz-Date',
              'X-Api-Key',
              'X-Amz-Security-Token',
              'X-Amz-User-Agent',
              'x-amz-content-sha256',
              'x-amz-storage-class'
            ],
            ExposedHeaders: ['ETag', 'x-amz-version-id'],
            MaxAge: 3000
          }
        ]
      }
    });
  });

  test('creates bucket policies for security', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    // Check for deny insecure connections policy
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: [
          {
            Sid: 'DenyInsecureConnections',
            Effect: 'Deny',
            Principal: '*',
            Action: 's3:*',
            Condition: {
              Bool: {
                'aws:SecureTransport': 'false'
              }
            }
          },
          {
            Sid: 'DenyUnencryptedObjectUploads',
            Effect: 'Deny',
            Principal: '*',
            Action: 's3:PutObject',
            Condition: {
              StringNotEquals: {
                's3:x-amz-server-side-encryption': 'aws:kms'
              }
            }
          }
        ]
      }
    });
  });

  test('creates CloudWatch alarms for monitoring', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    // Check for CloudWatch alarms
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-test-work-task-s3-unusual-deletes',
      AlarmDescription: 'Unusual number of delete operations detected on work task analysis bucket'
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-test-work-task-s3-high-errors',
      AlarmDescription: 'High error rate detected for work task analysis bucket operations'
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-test-work-task-s3-size-growth',
      AlarmDescription: 'Work task analysis bucket size growing rapidly'
    });
  });

  test('creates custom resource for directory setup', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    // Check that Lambda function for setup is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs18.x',
      Handler: 'index.handler',
      Timeout: 300,
      Environment: {
        Variables: {
          STAGE: 'test'
        }
      }
    });

    // Check that custom resource is created
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      ServiceToken: {
        'Fn::GetAtt': [
          { 'Fn::Select': [6, { 'Fn::Split': [':', { 'Fn::GetAtt': ['WorkTaskS3StorageS3SetupSetupFunction', 'Arn'] }] }] },
          'Arn'
        ]
      }
    });
  });

  test('provides grant methods for access control', () => {
    // Act
    const workTaskS3Storage = new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert - methods should exist and be callable
    expect(typeof workTaskS3Storage.grantRead).toBe('function');
    expect(typeof workTaskS3Storage.grantWrite).toBe('function');
    expect(typeof workTaskS3Storage.grantReadWrite).toBe('function');
    expect(typeof workTaskS3Storage.grantDelete).toBe('function');
    expect(typeof workTaskS3Storage.grantPrefixAccess).toBe('function');
  });

  test('creates outputs for bucket information', () => {
    // Act
    new WorkTaskS3Storage(stack, 'WorkTaskS3Storage', {
      stage: 'test',
      kmsKey,
      artifactsBucket,
    });

    // Assert
    const template = Template.fromStack(stack);
    
    template.hasOutput('WorkTaskS3StorageWorkTaskAnalysisBucketName', {});
    template.hasOutput('WorkTaskS3StorageWorkTaskAnalysisBucketArn', {});
    template.hasOutput('WorkTaskS3StorageWorkTaskAnalysisBucketDomainName', {});
  });
});