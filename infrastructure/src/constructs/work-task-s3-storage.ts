import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { WorkTaskS3SetupCustomResource } from './work-task-s3-setup-custom-resource';
import { TagManager } from '../utils/tag-manager';
import { getTagConfig } from '../config/tag-config';

export interface WorkTaskS3StorageProps {
  stage: string;
  kmsKey: kms.Key;
  artifactsBucket: s3.Bucket;
}

export class WorkTaskS3Storage extends Construct {
  public readonly workTaskAnalysisBucket: s3.Bucket;
  public readonly setupCustomResource: WorkTaskS3SetupCustomResource;

  constructor(scope: Construct, id: string, props: WorkTaskS3StorageProps) {
    super(scope, id);

    // Initialize TagManager for consistent tagging
    const tagConfig = getTagConfig(props.stage);
    const tagManager = new TagManager(tagConfig, props.stage);

    // Create dedicated work task analysis bucket with enhanced security and lifecycle policies
    this.workTaskAnalysisBucket = new s3.Bucket(this, 'WorkTaskAnalysisBucket', {
      bucketName: `ai-agent-work-task-analysis-${props.stage}-${cdk.Stack.of(this).account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      
      // Enhanced lifecycle management for work task analysis files
      lifecycleRules: [
        {
          id: 'WorkTaskContentTransition',
          enabled: true,
          prefix: 'tasks/',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
        {
          id: 'DeliverableFilesTransition',
          enabled: true,
          prefix: 'deliverables/',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(60), // Keep deliverables accessible longer
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(180),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(730), // 2 years
            },
          ],
        },
        {
          id: 'ReportsCleanup',
          enabled: true,
          prefix: 'reports/',
          expiration: cdk.Duration.days(1095), // 3 years retention for reports
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
        {
          id: 'TempFilesCleanup',
          enabled: true,
          prefix: 'temp/',
          expiration: cdk.Duration.days(7), // Clean up temp files after 7 days
        },
        {
          id: 'OldVersionsCleanup',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],

      // CORS configuration for frontend file uploads
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'], // Will be restricted to specific domains in production
          allowedHeaders: [
            'Content-Type',
            'Content-Length',
            'Authorization',
            'X-Amz-Date',
            'X-Api-Key',
            'X-Amz-Security-Token',
            'X-Amz-User-Agent',
            'x-amz-content-sha256',
            'x-amz-storage-class',
          ],
          exposedHeaders: [
            'ETag',
            'x-amz-version-id',
          ],
          maxAge: 3000,
        },
      ],

      // Server access logging
      serverAccessLogsPrefix: 'access-logs/work-task-analysis/',
      
      // Notification configuration for file processing
      notificationsHandlerRole: this.createNotificationRole(props.kmsKey),
    });

    // Configure bucket policies for security and compliance
    this.configureBucketPolicies(props.stage);

    // Configure bucket notifications for automated processing
    this.configureBucketNotifications();

    // Add intelligent tiering for cost optimization
    this.configureIntelligentTiering();

    // Apply resource-specific tags using TagManager
    tagManager.applyTags(this.workTaskAnalysisBucket, {
      BucketPurpose: 'WorkTaskAnalysis',
      DataClassification: 'Internal',
    });

    // Create CloudWatch metrics and alarms
    this.createCloudWatchAlarms(props.stage);

    // Set up directory structure using custom resource
    this.setupCustomResource = new WorkTaskS3SetupCustomResource(this, 'S3Setup', {
      workTaskAnalysisBucket: this.workTaskAnalysisBucket,
      stage: props.stage,
    });

    // Output bucket information
    new cdk.CfnOutput(this, 'WorkTaskAnalysisBucketName', {
      value: this.workTaskAnalysisBucket.bucketName,
      exportName: `${cdk.Stack.of(this).stackName}-WorkTaskAnalysisBucketName`,
    });

    new cdk.CfnOutput(this, 'WorkTaskAnalysisBucketArn', {
      value: this.workTaskAnalysisBucket.bucketArn,
      exportName: `${cdk.Stack.of(this).stackName}-WorkTaskAnalysisBucketArn`,
    });

    new cdk.CfnOutput(this, 'WorkTaskAnalysisBucketDomainName', {
      value: this.workTaskAnalysisBucket.bucketDomainName,
      exportName: `${cdk.Stack.of(this).stackName}-WorkTaskAnalysisBucketDomainName`,
    });
  }

  private createNotificationRole(kmsKey: kms.Key): iam.Role {
    return new iam.Role(this, 'S3NotificationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      inlinePolicies: {
        S3NotificationPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Decrypt',
                'kms:GenerateDataKey',
              ],
              resources: [kmsKey.keyArn],
            }),
          ],
        }),
      },
    });
  }

  private configureBucketPolicies(stage: string): void {
    // Deny insecure connections
    this.workTaskAnalysisBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyInsecureConnections',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [
          this.workTaskAnalysisBucket.bucketArn,
          `${this.workTaskAnalysisBucket.bucketArn}/*`,
        ],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      })
    );

    // Enforce encryption in transit and at rest
    this.workTaskAnalysisBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyUnencryptedObjectUploads',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:PutObject'],
        resources: [`${this.workTaskAnalysisBucket.bucketArn}/*`],
        conditions: {
          StringNotEquals: {
            's3:x-amz-server-side-encryption': 'aws:kms',
          },
        },
      })
    );

    // Restrict access to specific IAM roles and users
    this.workTaskAnalysisBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'RestrictAccessToAuthorizedPrincipals',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [
          this.workTaskAnalysisBucket.bucketArn,
          `${this.workTaskAnalysisBucket.bucketArn}/*`,
        ],
        conditions: {
          StringNotLike: {
            'aws:PrincipalArn': [
              `arn:aws:iam::${cdk.Stack.of(this).account}:role/ai-agent-*`,
              `arn:aws:iam::${cdk.Stack.of(this).account}:root`,
            ],
          },
          Bool: {
            'aws:PrincipalIsAWSService': 'false',
          },
        },
      })
    );

    // Prevent deletion of critical files in production
    if (stage === 'prod') {
      this.workTaskAnalysisBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'PreventCriticalFileDeletion',
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: [
            's3:DeleteObject',
            's3:DeleteObjectVersion',
          ],
          resources: [
            `${this.workTaskAnalysisBucket.bucketArn}/tasks/*/analysis_result.json`,
            `${this.workTaskAnalysisBucket.bucketArn}/deliverables/*/validation_report.json`,
            `${this.workTaskAnalysisBucket.bucketArn}/reports/quality_reports/*`,
          ],
          conditions: {
            StringNotEquals: {
              'aws:PrincipalServiceName': 's3.amazonaws.com',
            },
          },
        })
      );
    }
  }

  private configureBucketNotifications(): void {
    // Note: Actual Lambda function ARNs would be added here when available
    // This is a placeholder for the notification configuration structure
    
    // Example notification configuration for deliverable uploads
    // this.workTaskAnalysisBucket.addEventNotification(
    //   s3.EventType.OBJECT_CREATED,
    //   new s3n.LambdaDestination(deliverableProcessorFunction),
    //   { prefix: 'deliverables/', suffix: '.pdf' }
    // );
    
    // Example notification configuration for quality check completion
    // this.workTaskAnalysisBucket.addEventNotification(
    //   s3.EventType.OBJECT_CREATED,
    //   new s3n.LambdaDestination(qualityCheckFunction),
    //   { prefix: 'deliverables/', suffix: 'quality_assessment.json' }
    // );
  }

  private configureIntelligentTiering(): void {
    // Configure intelligent tiering for cost optimization
    // Note: Intelligent tiering configuration would be added to the bucket's
    // IntelligentTieringConfigurations property during bucket creation
    // This is a placeholder for future implementation
    console.log('Intelligent tiering configuration placeholder');
  }

  private createCloudWatchAlarms(stage: string): void {
    // Create CloudWatch alarms for monitoring bucket usage and security
    
    // Alarm for unusual number of delete operations
    new cdk.aws_cloudwatch.Alarm(this, 'UnusualDeleteOperationsAlarm', {
      alarmName: `ai-agent-${stage}-work-task-s3-unusual-deletes`,
      alarmDescription: 'Unusual number of delete operations detected on work task analysis bucket',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: 'NumberOfObjects',
        dimensionsMap: {
          BucketName: this.workTaskAnalysisBucket.bucketName,
          StorageType: 'AllStorageTypes',
        },
        statistic: cdk.aws_cloudwatch.Stats.AVERAGE,
        period: cdk.Duration.hours(1),
      }),
      threshold: 1000, // Adjust based on expected usage
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for high error rates
    new cdk.aws_cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: `ai-agent-${stage}-work-task-s3-high-errors`,
      alarmDescription: 'High error rate detected for work task analysis bucket operations',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: '4xxErrors',
        dimensionsMap: {
          BucketName: this.workTaskAnalysisBucket.bucketName,
        },
        statistic: cdk.aws_cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for bucket size growth (cost monitoring)
    new cdk.aws_cloudwatch.Alarm(this, 'BucketSizeGrowthAlarm', {
      alarmName: `ai-agent-${stage}-work-task-s3-size-growth`,
      alarmDescription: 'Work task analysis bucket size growing rapidly',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: 'BucketSizeBytes',
        dimensionsMap: {
          BucketName: this.workTaskAnalysisBucket.bucketName,
          StorageType: 'StandardStorage',
        },
        statistic: cdk.aws_cloudwatch.Stats.AVERAGE,
        period: cdk.Duration.days(1),
      }),
      threshold: 10 * 1024 * 1024 * 1024, // 10 GB threshold
      evaluationPeriods: 1,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Grant read access to the work task analysis bucket
   */
  public grantRead(identity: iam.IGrantable): iam.Grant {
    return this.workTaskAnalysisBucket.grantRead(identity);
  }

  /**
   * Grant write access to the work task analysis bucket
   */
  public grantWrite(identity: iam.IGrantable): iam.Grant {
    return this.workTaskAnalysisBucket.grantWrite(identity);
  }

  /**
   * Grant read/write access to the work task analysis bucket
   */
  public grantReadWrite(identity: iam.IGrantable): iam.Grant {
    return this.workTaskAnalysisBucket.grantReadWrite(identity);
  }

  /**
   * Grant delete access to the work task analysis bucket
   */
  public grantDelete(identity: iam.IGrantable): iam.Grant {
    return this.workTaskAnalysisBucket.grantDelete(identity);
  }

  /**
   * Grant access to specific prefixes in the bucket
   */
  public grantPrefixAccess(identity: iam.IGrantable, prefix: string, actions: string[]): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee: identity,
      actions: actions,
      resourceArns: [`${this.workTaskAnalysisBucket.bucketArn}/${prefix}*`],
    });
  }
}