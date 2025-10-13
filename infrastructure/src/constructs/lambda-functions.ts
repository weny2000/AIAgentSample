import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { TagManager } from '../utils/tag-manager';
import { getTagConfig } from '../config/tag-config';

export interface LambdaFunctionsProps {
  stage: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  lambdaExecutionRole: iam.Role;
  kmsKey: kms.Key;
  teamRosterTable: dynamodb.Table;
  auditLogTable: dynamodb.Table;
  kendraIndexId?: string;
  artifactCheckWorkflowArn?: string;
}

export class LambdaFunctions extends Construct {
  public readonly artifactCheckHandler: lambda.Function;
  public readonly statusCheckHandler: lambda.Function;
  public readonly agentQueryHandler: lambda.Function;
  public readonly kendraSearchHandler: lambda.Function;
  public readonly auditHandler: lambda.Function;
  public readonly artifactCheckQueue: sqs.Queue;
  public readonly jobStatusTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
    super(scope, id);

    // Initialize TagManager for resource tagging
    const tagManager = new TagManager(getTagConfig(props.stage), props.stage);

    // Create dead letter queue for artifact check processing
    const artifactCheckDLQ = new sqs.Queue(this, 'ArtifactCheckDLQ', {
      queueName: `ai-agent-artifact-check-dlq-${props.stage}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      retentionPeriod: cdk.Duration.days(14),
      // Enable message redrive for manual reprocessing
      redriveAllowPolicy: {
        redrivePermission: sqs.RedrivePermission.BY_QUEUE,
        sourceQueues: [], // Will be populated after main queue creation
      },
    });

    // Create SQS queue for artifact check processing
    this.artifactCheckQueue = new sqs.Queue(this, 'ArtifactCheckQueue', {
      queueName: `ai-agent-artifact-check-${props.stage}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      visibilityTimeout: cdk.Duration.minutes(15), // Allow 15 minutes for processing
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: artifactCheckDLQ,
        maxReceiveCount: 3,
      },
      // Enable message redrive from DLQ
      redriveAllowPolicy: {
        redrivePermission: sqs.RedrivePermission.BY_QUEUE,
        sourceQueues: [artifactCheckDLQ],
      },
    });

    // Update DLQ redrive policy to allow redrive from main queue
    artifactCheckDLQ.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('sqs.amazonaws.com')],
      actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage'],
      resources: [artifactCheckDLQ.queueArn],
      conditions: {
        StringEquals: {
          'aws:SourceArn': this.artifactCheckQueue.queueArn,
        },
      },
    }));

    // Create notification queue for error notifications
    const notificationDLQ = new sqs.Queue(this, 'NotificationDLQ', {
      queueName: `ai-agent-notification-dlq-${props.stage}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      retentionPeriod: cdk.Duration.days(14),
    });

    const notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: `ai-agent-notification-${props.stage}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: notificationDLQ,
        maxReceiveCount: 5, // More retries for notifications
      },
    });

    // Create DynamoDB table for job status tracking
    this.jobStatusTable = new dynamodb.Table(this, 'JobStatusTable', {
      tableName: `ai-agent-job-status-${props.stage}`,
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add GSI for querying by user and status
    this.jobStatusTable.addGlobalSecondaryIndex({
      indexName: 'UserStatusIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
    });

    // Common Lambda environment variables
    const commonEnvironment = {
      STAGE: props.stage,
      TEAM_ROSTER_TABLE: props.teamRosterTable.tableName,
      AUDIT_LOG_TABLE: props.auditLogTable.tableName,
      JOB_STATUS_TABLE: this.jobStatusTable.tableName,
      ARTIFACT_CHECK_QUEUE_URL: this.artifactCheckQueue.queueUrl,
      ARTIFACT_CHECK_DLQ_URL: artifactCheckDLQ.queueUrl,
      NOTIFICATION_QUEUE_URL: notificationQueue.queueUrl,
      NOTIFICATION_DLQ_URL: notificationDLQ.queueUrl,
      ARTIFACT_CHECK_WORKFLOW_ARN: props.artifactCheckWorkflowArn || '',
      KENDRA_INDEX_ID: props.kendraIndexId || '',
      LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
      // Error handling configuration
      ENABLE_DETAILED_ERRORS: props.stage !== 'prod' ? 'true' : 'false',
      ENABLE_METRICS: 'true',
      ENABLE_TRACING: 'true',
      // Retry configuration
      DEFAULT_RETRY_ATTEMPTS: '3',
      DEFAULT_RETRY_BASE_DELAY_MS: '1000',
      DEFAULT_RETRY_MAX_DELAY_MS: '30000',
      // Circuit breaker configuration
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: '5',
      CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS: '30000',
    };

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
      role: props.lambdaExecutionRole,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.lambdaSecurityGroup],
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? 30 : 7, // days
    };

    // Artifact Check Handler Lambda
    const artifactCheckFunctionName = `ai-agent-artifact-check-${props.stage}`;
    
    // Create explicit CloudWatch log group for artifact check handler
    const artifactCheckLogGroup = new logs.LogGroup(this, 'ArtifactCheckHandlerLogGroup', {
      logGroupName: `/aws/lambda/${artifactCheckFunctionName}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    // Apply tags to log group
    tagManager.applyTags(artifactCheckLogGroup, {
      Component: 'Monitoring-CloudWatch',
      MonitoringType: 'Logs',
      AssociatedResource: artifactCheckFunctionName,
    });
    
    this.artifactCheckHandler = new lambda.Function(this, 'ArtifactCheckHandler', {
      ...commonLambdaProps,
      functionName: artifactCheckFunctionName,
      description: 'Handles artifact check requests and queues them for processing',
      code: lambda.Code.fromAsset('backend/dist/lambda'),
      handler: 'handlers/artifact-check-handler.handler',
      timeout: cdk.Duration.seconds(30),
    });
    
    // Apply resource-specific tags to Lambda function
    tagManager.applyTags(this.artifactCheckHandler, {
      Component: 'Compute-Lambda',
      FunctionPurpose: 'ArtifactManagement',
      Runtime: commonLambdaProps.runtime.name,
    });

    // Status Check Handler Lambda
    const statusCheckFunctionName = `ai-agent-status-check-${props.stage}`;
    
    // Create explicit CloudWatch log group for status check handler
    const statusCheckLogGroup = new logs.LogGroup(this, 'StatusCheckHandlerLogGroup', {
      logGroupName: `/aws/lambda/${statusCheckFunctionName}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    // Apply tags to log group
    tagManager.applyTags(statusCheckLogGroup, {
      Component: 'Monitoring-CloudWatch',
      MonitoringType: 'Logs',
      AssociatedResource: statusCheckFunctionName,
    });
    
    this.statusCheckHandler = new lambda.Function(this, 'StatusCheckHandler', {
      ...commonLambdaProps,
      functionName: statusCheckFunctionName,
      description: 'Retrieves status of artifact check jobs',
      code: lambda.Code.fromAsset('backend/dist/lambda'),
      handler: 'handlers/status-check-handler.handler',
      timeout: cdk.Duration.seconds(15),
    });
    
    // Apply resource-specific tags to Lambda function
    tagManager.applyTags(this.statusCheckHandler, {
      Component: 'Compute-Lambda',
      FunctionPurpose: 'JobProcessing',
      Runtime: commonLambdaProps.runtime.name,
    });

    // Agent Query Handler Lambda
    const agentQueryFunctionName = `ai-agent-query-${props.stage}`;
    
    // Create explicit CloudWatch log group for agent query handler
    const agentQueryLogGroup = new logs.LogGroup(this, 'AgentQueryHandlerLogGroup', {
      logGroupName: `/aws/lambda/${agentQueryFunctionName}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    // Apply tags to log group
    tagManager.applyTags(agentQueryLogGroup, {
      Component: 'Monitoring-CloudWatch',
      MonitoringType: 'Logs',
      AssociatedResource: agentQueryFunctionName,
    });
    
    this.agentQueryHandler = new lambda.Function(this, 'AgentQueryHandler', {
      ...commonLambdaProps,
      functionName: agentQueryFunctionName,
      description: 'Handles AI agent queries with persona-based responses',
      code: lambda.Code.fromAsset('backend/dist/lambda'),
      handler: 'handlers/agent-query-handler.handler',
      timeout: cdk.Duration.minutes(2), // Longer timeout for LLM processing
      memorySize: 1024, // More memory for LLM processing
    });
    
    // Apply resource-specific tags to Lambda function
    tagManager.applyTags(this.agentQueryHandler, {
      Component: 'Compute-Lambda',
      FunctionPurpose: 'AgentCore',
      Runtime: commonLambdaProps.runtime.name,
    });

    // Kendra Search Handler Lambda
    const kendraSearchFunctionName = `ai-agent-kendra-search-${props.stage}`;
    
    // Create explicit CloudWatch log group for kendra search handler
    const kendraSearchLogGroup = new logs.LogGroup(this, 'KendraSearchHandlerLogGroup', {
      logGroupName: `/aws/lambda/${kendraSearchFunctionName}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    // Apply tags to log group
    tagManager.applyTags(kendraSearchLogGroup, {
      Component: 'Monitoring-CloudWatch',
      MonitoringType: 'Logs',
      AssociatedResource: kendraSearchFunctionName,
    });
    
    this.kendraSearchHandler = new lambda.Function(this, 'KendraSearchHandler', {
      ...commonLambdaProps,
      functionName: kendraSearchFunctionName,
      description: 'Handles Kendra search requests with access control verification',
      code: lambda.Code.fromAsset('backend/dist/lambda'),
      handler: 'handlers/kendra-search-handler.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    
    // Apply resource-specific tags to Lambda function
    tagManager.applyTags(this.kendraSearchHandler, {
      Component: 'Compute-Lambda',
      FunctionPurpose: 'Search',
      Runtime: commonLambdaProps.runtime.name,
    });

    // Audit Handler Lambda
    const auditFunctionName = `ai-agent-audit-${props.stage}`;
    
    // Create explicit CloudWatch log group for audit handler
    const auditLogGroup = new logs.LogGroup(this, 'AuditHandlerLogGroup', {
      logGroupName: `/aws/lambda/${auditFunctionName}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    // Apply tags to log group
    tagManager.applyTags(auditLogGroup, {
      Component: 'Monitoring-CloudWatch',
      MonitoringType: 'Logs',
      AssociatedResource: auditFunctionName,
    });
    
    this.auditHandler = new lambda.Function(this, 'AuditHandler', {
      ...commonLambdaProps,
      functionName: auditFunctionName,
      description: 'Handles audit log operations, compliance reporting, and security event management',
      code: lambda.Code.fromAsset('backend/dist/lambda'),
      handler: 'handlers/audit-handler.handler',
      timeout: cdk.Duration.minutes(5), // Longer timeout for report generation
      memorySize: 1024, // More memory for report processing
    });
    
    // Apply resource-specific tags to Lambda function
    tagManager.applyTags(this.auditHandler, {
      Component: 'Compute-Lambda',
      FunctionPurpose: 'DataProcessing',
      Runtime: commonLambdaProps.runtime.name,
    });

    // Grant permissions to Lambda functions
    this.grantPermissions(props);

    // Output function ARNs
    new cdk.CfnOutput(this, 'ArtifactCheckHandlerArn', {
      value: this.artifactCheckHandler.functionArn,
      exportName: `${cdk.Stack.of(this).stackName}-ArtifactCheckHandlerArn`,
    });

    new cdk.CfnOutput(this, 'StatusCheckHandlerArn', {
      value: this.statusCheckHandler.functionArn,
      exportName: `${cdk.Stack.of(this).stackName}-StatusCheckHandlerArn`,
    });

    new cdk.CfnOutput(this, 'AgentQueryHandlerArn', {
      value: this.agentQueryHandler.functionArn,
      exportName: `${cdk.Stack.of(this).stackName}-AgentQueryHandlerArn`,
    });

    new cdk.CfnOutput(this, 'KendraSearchHandlerArn', {
      value: this.kendraSearchHandler.functionArn,
      exportName: `${cdk.Stack.of(this).stackName}-KendraSearchHandlerArn`,
    });

    new cdk.CfnOutput(this, 'AuditHandlerArn', {
      value: this.auditHandler.functionArn,
      exportName: `${cdk.Stack.of(this).stackName}-AuditHandlerArn`,
    });

    new cdk.CfnOutput(this, 'ArtifactCheckQueueUrl', {
      value: this.artifactCheckQueue.queueUrl,
      exportName: `${cdk.Stack.of(this).stackName}-ArtifactCheckQueueUrl`,
    });

    new cdk.CfnOutput(this, 'JobStatusTableName', {
      value: this.jobStatusTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-JobStatusTableName`,
    });
  }

  private grantPermissions(props: LambdaFunctionsProps): void {
    // Grant SQS permissions to artifact check handler
    this.artifactCheckQueue.grantSendMessages(this.artifactCheckHandler);

    // Grant DynamoDB permissions to all handlers
    this.jobStatusTable.grantReadWriteData(this.artifactCheckHandler);
    this.jobStatusTable.grantReadData(this.statusCheckHandler);
    props.teamRosterTable.grantReadData(this.agentQueryHandler);
    props.auditLogTable.grantWriteData(this.agentQueryHandler);
    
    // Grant comprehensive audit log permissions to audit handler
    props.auditLogTable.grantReadWriteData(this.auditHandler);
    props.teamRosterTable.grantReadData(this.auditHandler);

    // Grant Kendra permissions to agent query handler and search handler
    if (props.kendraIndexId) {
      const kendraPermissions = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'kendra:Query',
          'kendra:Retrieve',
          'kendra:SubmitFeedback',
        ],
        resources: [
          `arn:aws:kendra:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:index/${props.kendraIndexId}`,
        ],
      });

      this.agentQueryHandler.addToRolePolicy(kendraPermissions);
      this.kendraSearchHandler.addToRolePolicy(kendraPermissions);
    }

    // Grant KMS permissions for encryption/decryption
    props.kmsKey.grantEncryptDecrypt(this.artifactCheckHandler);
    props.kmsKey.grantEncryptDecrypt(this.statusCheckHandler);
    props.kmsKey.grantEncryptDecrypt(this.agentQueryHandler);
    props.kmsKey.grantEncryptDecrypt(this.kendraSearchHandler);
    props.kmsKey.grantEncryptDecrypt(this.auditHandler);

    // Grant additional permissions for audit handler
    const auditHandlerPermissions = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sns:Publish',
        'ses:SendEmail',
        'ses:SendRawEmail',
        's3:PutObject',
        's3:GetObject',
        'comprehend:DetectPiiEntities',
        'comprehend:DetectSentiment',
      ],
      resources: ['*'], // Restrict in production
    });
    this.auditHandler.addToRolePolicy(auditHandlerPermissions);

    // Grant CloudWatch Logs permissions (already included in execution role)
    // Grant X-Ray permissions for tracing (already included in execution role)
  }
}