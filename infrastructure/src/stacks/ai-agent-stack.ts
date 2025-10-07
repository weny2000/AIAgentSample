import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { IamRoles } from '../constructs/iam-roles';
import { Authentication } from '../constructs/authentication';
import { AuthMiddleware } from '../constructs/auth-middleware';
import { DynamoDBTables } from '../constructs/dynamodb-tables';
import { RdsPostgreSql } from '../constructs/rds-postgresql';
import { KendraSearch } from '../constructs/kendra-search';
import { LambdaFunctions } from '../constructs/lambda-functions';
import { ApiGateway } from '../constructs/api-gateway';
import { StepFunctions } from '../constructs/step-functions';
import { Monitoring } from '../constructs/monitoring';
import { XRayTracing } from '../constructs/xray-tracing';
import { AutoScaling } from '../constructs/auto-scaling';
import { WorkTaskS3Storage } from '../constructs/work-task-s3-storage';
import { TagManager } from '../utils/tag-manager';
import { TaggingAspect } from '../aspects/tagging-aspect';
import { getTagConfig } from '../config/tag-config';

export interface AiAgentStackProps extends cdk.StackProps {
  stage: string;
  alertEmail?: string;
  slackWebhookUrl?: string;
}

export class AiAgentStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly kmsKey: kms.Key;
  public readonly documentsBucket: s3.Bucket;
  public readonly artifactsBucket: s3.Bucket;
  public readonly auditLogsBucket: s3.Bucket;
  public readonly workTaskS3Storage: WorkTaskS3Storage;
  public readonly iamRoles: IamRoles;
  public readonly authentication: Authentication;
  public readonly authMiddleware: AuthMiddleware;
  public readonly dynamoDBTables: DynamoDBTables;
  public readonly rdsPostgreSql: RdsPostgreSql;
  public readonly kendraSearch: KendraSearch;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly lambdaFunctions: LambdaFunctions;
  public readonly apiGateway: ApiGateway;
  public readonly stepFunctions: StepFunctions;
  public readonly monitoring: Monitoring;
  public readonly xrayTracing: XRayTracing;
  public readonly autoScaling: AutoScaling;

  constructor(scope: Construct, id: string, props: AiAgentStackProps) {
    super(scope, id, props);

    // Initialize TagManager with stage configuration
    const tagConfig = getTagConfig(props.stage);
    const tagManager = new TagManager(tagConfig, props.stage);

    // Apply mandatory tags at stack level
    const mandatoryTags = tagManager.getMandatoryTags();
    Object.entries(mandatoryTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // Apply environment-specific tags at stack level
    const environmentTags = tagManager.getEnvironmentTags();
    Object.entries(environmentTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // Apply TaggingAspect to automatically tag all resources
    cdk.Aspects.of(this).add(new TaggingAspect(tagManager));

    // Create KMS customer-managed key for encryption
    this.kmsKey = new kms.Key(this, 'AiAgentKmsKey', {
      description: `AI Agent System encryption key for ${props.stage}`,
      enableKeyRotation: true,
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'Enable IAM User Permissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'Allow use of the key for AWS services',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey',
              'kms:ReEncrypt*',
              'kms:CreateGrant',
              'kms:DescribeKey',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });

    // Apply resource-specific tags to KMS key
    tagManager.applyTags(this.kmsKey, {
      Component: 'Security-KMS',
      KeyPurpose: 'GeneralEncryption',
    });

    // Create KMS key alias
    new kms.Alias(this, 'AiAgentKmsKeyAlias', {
      aliasName: `alias/ai-agent-${props.stage}`,
      targetKey: this.kmsKey,
    });

    // Create VPC with private subnets
    this.vpc = new ec2.Vpc(this, 'AiAgentVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      natGateways: 1, // Single NAT gateway for cost optimization
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Apply tags to VPC
    tagManager.applyTags(this.vpc, {
      Component: 'Network-VPC',
    });

    // Tag private subnets with NetworkTier and SubnetIndex
    this.vpc.privateSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('NetworkTier', 'Private');
      cdk.Tags.of(subnet).add('SubnetIndex', index.toString());
    });

    // Tag public subnets with NetworkTier and SubnetIndex
    this.vpc.publicSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('NetworkTier', 'Public');
      cdk.Tags.of(subnet).add('SubnetIndex', index.toString());
    });

    // Create VPC endpoints for AWS services
    this.createVpcEndpoints();

    // Create S3 buckets with proper access controls and encryption
    const buckets = this.createS3Buckets(props.stage);
    this.documentsBucket = buckets.documentsBucket;
    this.artifactsBucket = buckets.artifactsBucket;
    this.auditLogsBucket = buckets.auditLogsBucket;

    // Create work task analysis S3 storage
    this.workTaskS3Storage = new WorkTaskS3Storage(this, 'WorkTaskS3Storage', {
      stage: props.stage,
      kmsKey: this.kmsKey,
      artifactsBucket: this.artifactsBucket,
    });

    // Create security groups
    const securityGroups = this.createSecurityGroups();
    this.lambdaSecurityGroup = securityGroups.lambdaSecurityGroup;
    this.ecsSecurityGroup = securityGroups.ecsSecurityGroup;

    // Create IAM roles
    this.iamRoles = new IamRoles(this, 'IamRoles', {
      kmsKey: this.kmsKey,
      documentsBucket: this.documentsBucket,
      artifactsBucket: this.artifactsBucket,
      auditLogsBucket: this.auditLogsBucket,
      workTaskAnalysisBucket: this.workTaskS3Storage.workTaskAnalysisBucket,
      stage: props.stage,
    });

    // Apply tag-based access control policies now that IAM roles are created
    this.applyTagBasedAccessControl();

    // Create authentication infrastructure
    this.authentication = new Authentication(this, 'Authentication', {
      stage: props.stage,
      lambdaExecutionRole: this.iamRoles.lambdaExecutionRole,
      apiGatewayRole: this.iamRoles.apiGatewayRole,
    });

    // Create authentication middleware
    this.authMiddleware = new AuthMiddleware(this, 'AuthMiddleware', {
      stage: props.stage,
      lambdaExecutionRole: this.iamRoles.lambdaExecutionRole,
      userPoolId: this.authentication.userPool.userPoolId,
      userPoolClientId: this.authentication.userPoolClient.userPoolClientId,
      authLayer: this.authentication.lambdaLayer.authLayer,
    });

    // Create DynamoDB tables
    this.dynamoDBTables = new DynamoDBTables(this, 'DynamoDBTables', {
      stage: props.stage,
      kmsKey: this.kmsKey,
    });

    // Create RDS PostgreSQL database
    this.rdsPostgreSql = new RdsPostgreSql(this, 'RdsPostgreSql', {
      vpc: this.vpc,
      kmsKey: this.kmsKey,
      stage: props.stage,
      lambdaSecurityGroup: this.lambdaSecurityGroup,
      ecsSecurityGroup: this.ecsSecurityGroup,
    });

    // Create Kendra search index
    this.kendraSearch = new KendraSearch(this, 'KendraSearch', {
      stage: props.stage,
      documentsBucket: this.documentsBucket,
      kmsKey: this.kmsKey,
    });

    // Create Lambda functions (without Step Functions ARN initially)
    this.lambdaFunctions = new LambdaFunctions(this, 'LambdaFunctions', {
      stage: props.stage,
      vpc: this.vpc,
      lambdaSecurityGroup: this.lambdaSecurityGroup,
      lambdaExecutionRole: this.iamRoles.lambdaExecutionRole,
      kmsKey: this.kmsKey,
      teamRosterTable: this.dynamoDBTables.teamRosterTable,
      auditLogTable: this.dynamoDBTables.auditLogTable,
      kendraIndexId: this.kendraSearch.kendraIndex.attrId,
    });

    // Create Step Functions workflows
    this.stepFunctions = new StepFunctions(this, 'StepFunctions', {
      stage: props.stage,
      vpc: this.vpc,
      ecsSecurityGroup: this.ecsSecurityGroup,
      stepFunctionsRole: this.iamRoles.stepFunctionsRole,
      ecsTaskRole: this.iamRoles.ecsTaskRole,
      ecsExecutionRole: this.iamRoles.ecsExecutionRole,
      kmsKey: this.kmsKey,
      kendraSearchHandler: this.lambdaFunctions.kendraSearchHandler,
      artifactsBucket: this.artifactsBucket,
      jobStatusTable: this.dynamoDBTables.jobStatusTable,
    });

    // Update artifact check handler with Step Functions ARN
    this.lambdaFunctions.artifactCheckHandler.addEnvironment(
      'ARTIFACT_CHECK_WORKFLOW_ARN',
      this.stepFunctions.artifactCheckWorkflow.stateMachineArn
    );

    // Create API Gateway
    this.apiGateway = new ApiGateway(this, 'ApiGateway', {
      stage: props.stage,
      vpc: this.vpc,
      lambdaSecurityGroup: this.lambdaSecurityGroup,
      lambdaExecutionRole: this.iamRoles.lambdaExecutionRole,
      authorizerFunction: this.authentication.authorizerFunction,
      artifactCheckHandler: this.lambdaFunctions.artifactCheckHandler,
      statusCheckHandler: this.lambdaFunctions.statusCheckHandler,
      agentQueryHandler: this.lambdaFunctions.agentQueryHandler,
      kendraSearchHandler: this.lambdaFunctions.kendraSearchHandler,
    });

    // Create monitoring and observability infrastructure
    const allLambdaFunctions = [
      this.lambdaFunctions.artifactCheckHandler,
      this.lambdaFunctions.statusCheckHandler,
      this.lambdaFunctions.agentQueryHandler,
      this.lambdaFunctions.kendraSearchHandler,
      this.lambdaFunctions.auditHandler,
      this.authentication.authorizerFunction,
    ];

    this.monitoring = new Monitoring(this, 'Monitoring', {
      stage: props.stage,
      kmsKey: this.kmsKey,
      lambdaFunctions: allLambdaFunctions,
      alertEmail: props.alertEmail,
      slackWebhookUrl: props.slackWebhookUrl,
    });

    // Create X-Ray tracing configuration
    this.xrayTracing = new XRayTracing(this, 'XRayTracing', {
      stage: props.stage,
      lambdaFunctions: allLambdaFunctions,
      serviceName: 'ai-agent-system',
    });

    // Create auto-scaling configuration
    const allDynamoTables = [
      this.dynamoDBTables.teamRosterTable,
      this.dynamoDBTables.auditLogTable,
      this.dynamoDBTables.artifactTemplatesTable,
      this.lambdaFunctions.jobStatusTable,
    ];

    this.autoScaling = new AutoScaling(this, 'AutoScaling', {
      stage: props.stage,
      lambdaFunctions: allLambdaFunctions,
      dynamoTables: allDynamoTables,
      // ECS services would be added here when available
    });

    // Add additional operational tags
    cdk.Tags.of(this).add('MonitoringEnabled', 'true');
    cdk.Tags.of(this).add('XRayEnabled', 'true');

    // Export security groups for use in other stacks/constructs
    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      exportName: `${this.stackName}-LambdaSecurityGroupId`,
    });

    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: this.ecsSecurityGroup.securityGroupId,
      exportName: `${this.stackName}-EcsSecurityGroupId`,
    });

    // Export core infrastructure resources
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: `${this.stackName}-VpcId`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      exportName: `${this.stackName}-PrivateSubnetIds`,
    });

    new cdk.CfnOutput(this, 'KmsKeyId', {
      value: this.kmsKey.keyId,
      exportName: `${this.stackName}-KmsKeyId`,
    });

    new cdk.CfnOutput(this, 'KmsKeyArn', {
      value: this.kmsKey.keyArn,
      exportName: `${this.stackName}-KmsKeyArn`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      exportName: `${this.stackName}-DocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: this.artifactsBucket.bucketName,
      exportName: `${this.stackName}-ArtifactsBucketName`,
    });

    new cdk.CfnOutput(this, 'AuditLogsBucketName', {
      value: this.auditLogsBucket.bucketName,
      exportName: `${this.stackName}-AuditLogsBucketName`,
    });

    // Authentication outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.authentication.userPool.userPoolId,
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.authentication.userPoolClient.userPoolClientId,
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.authentication.identityPool.ref,
      exportName: `${this.stackName}-IdentityPoolId`,
    });

    new cdk.CfnOutput(this, 'AuthorizerFunctionArn', {
      value: this.authentication.authorizerFunction.functionArn,
      exportName: `${this.stackName}-AuthorizerFunctionArn`,
    });

    // IAM Role outputs
    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.iamRoles.lambdaExecutionRole.roleArn,
      exportName: `${this.stackName}-LambdaExecutionRoleArn`,
    });

    new cdk.CfnOutput(this, 'EcsTaskRoleArn', {
      value: this.iamRoles.ecsTaskRole.roleArn,
      exportName: `${this.stackName}-EcsTaskRoleArn`,
    });

    new cdk.CfnOutput(this, 'EcsExecutionRoleArn', {
      value: this.iamRoles.ecsExecutionRole.roleArn,
      exportName: `${this.stackName}-EcsExecutionRoleArn`,
    });

    new cdk.CfnOutput(this, 'StepFunctionsRoleArn', {
      value: this.iamRoles.stepFunctionsRole.roleArn,
      exportName: `${this.stackName}-StepFunctionsRoleArn`,
    });
  }

  private createVpcEndpoints(): void {
    // Initialize TagManager for applying resource-specific tags
    const tagConfig = getTagConfig(this.node.tryGetContext('stage') || 'dev');
    const tagManager = new TagManager(tagConfig, this.node.tryGetContext('stage') || 'dev');

    // S3 Gateway endpoint (no charge)
    const s3Endpoint = this.vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });
    tagManager.applyTags(s3Endpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Gateway',
      EndpointService: 'S3',
    });

    // KMS Interface endpoint
    const kmsEndpoint = this.vpc.addInterfaceEndpoint('KmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(kmsEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'KMS',
    });

    // Secrets Manager Interface endpoint
    const secretsManagerEndpoint = this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(secretsManagerEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'SecretsManager',
    });

    // ECR Interface endpoints for container images
    const ecrEndpoint = this.vpc.addInterfaceEndpoint('EcrEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(ecrEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'ECR',
    });

    const ecrDockerEndpoint = this.vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(ecrDockerEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'ECR-Docker',
    });

    // STS Interface endpoint for IAM operations
    const stsEndpoint = this.vpc.addInterfaceEndpoint('StsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(stsEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'STS',
    });

    // Kendra Interface endpoint
    const kendraEndpoint = this.vpc.addInterfaceEndpoint('KendraEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KENDRA,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(kendraEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'Kendra',
    });
  }

  private createS3Buckets(stage: string): {
    documentsBucket: s3.Bucket;
    artifactsBucket: s3.Bucket;
    auditLogsBucket: s3.Bucket;
  } {
    // Initialize TagManager for applying resource-specific tags
    const tagConfig = getTagConfig(stage);
    const tagManager = new TagManager(tagConfig, stage);

    // Documents bucket for storing ingested content
    const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `ai-agent-documents-${stage}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      serverAccessLogsPrefix: 'access-logs/',
    });

    // Apply resource-specific tags to documents bucket
    tagManager.applyTags(documentsBucket, {
      BucketPurpose: 'Documents',
      DataClassification: 'Internal',
      BackupPolicy: 'Monthly', // Based on lifecycle rules with Glacier transition
    });

    // Artifacts bucket for user uploads and reports
    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: `ai-agent-artifacts-${stage}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          id: 'DeleteOldReports',
          enabled: true,
          expiration: cdk.Duration.days(365),
          prefix: 'reports/',
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ['*'], // Will be restricted to specific domains in production
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // Apply resource-specific tags to artifacts bucket
    tagManager.applyTags(artifactsBucket, {
      BucketPurpose: 'Artifacts',
      DataClassification: 'Internal',
      BackupPolicy: 'Daily', // Based on versioning with 30-day retention
    });

    // Audit logs bucket for compliance and security
    const auditLogsBucket = new s3.Bucket(this, 'AuditLogsBucket', {
      bucketName: `ai-agent-audit-logs-${stage}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(
        cdk.Duration.days(2555) // 7 years
      ),
      lifecycleRules: [
        {
          id: 'TransitionAuditLogs',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(2555), // 7 years
            },
          ],
        },
      ],
    });

    // Apply resource-specific tags to audit logs bucket
    tagManager.applyTags(auditLogsBucket, {
      BucketPurpose: 'AuditLogs',
      DataClassification: 'Confidential',
      BackupPolicy: 'Daily', // Based on versioning and 7-year retention
      ComplianceScope: stage === 'production' ? 'HIPAA,SOC2,GDPR' : 'SOC2',
    });

    // Add basic bucket policies (tag-based access control will be added after IAM roles are created)
    this.configureBucketPolicies(documentsBucket, artifactsBucket, auditLogsBucket, false);
    
    return { documentsBucket, artifactsBucket, auditLogsBucket };
  }

  private configureBucketPolicies(
    documentsBucket: s3.Bucket,
    artifactsBucket: s3.Bucket,
    auditLogsBucket: s3.Bucket,
    includeTagBasedAccess: boolean = true
  ): void {
    // Deny insecure connections to all buckets
    const denyInsecureConnections = new iam.PolicyStatement({
      sid: 'DenyInsecureConnections',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        documentsBucket.bucketArn,
        `${documentsBucket.bucketArn}/*`,
        artifactsBucket.bucketArn,
        `${artifactsBucket.bucketArn}/*`,
        auditLogsBucket.bucketArn,
        `${auditLogsBucket.bucketArn}/*`,
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false',
        },
      },
    });

    documentsBucket.addToResourcePolicy(denyInsecureConnections);
    artifactsBucket.addToResourcePolicy(denyInsecureConnections);
    auditLogsBucket.addToResourcePolicy(denyInsecureConnections);

    // Restrict audit logs bucket to prevent deletion
    const preventAuditLogDeletion = new iam.PolicyStatement({
      sid: 'PreventAuditLogDeletion',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: [
        's3:DeleteObject',
        's3:DeleteObjectVersion',
        's3:PutLifecycleConfiguration',
      ],
      resources: [
        auditLogsBucket.bucketArn,
        `${auditLogsBucket.bucketArn}/*`,
      ],
      conditions: {
        StringNotEquals: {
          'aws:PrincipalServiceName': 's3.amazonaws.com',
        },
      },
    });

    auditLogsBucket.addToResourcePolicy(preventAuditLogDeletion);
  }

  /**
   * Apply tag-based access control policies to S3 buckets
   * This method is called after IAM roles are created
   */
  private applyTagBasedAccessControl(): void {
    // Add tag-based access control policies for documents bucket
    // Allow access to Internal classified data for authenticated users
    this.documentsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowTagBasedAccessInternal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(this.iamRoles.lambdaExecutionRole.roleArn)],
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [`${this.documentsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            's3:ExistingObjectTag/DataClassification': 'Internal',
          },
        },
      })
    );

    // Add tag-based access control policies for artifacts bucket
    this.artifactsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowTagBasedAccessInternal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(this.iamRoles.lambdaExecutionRole.roleArn)],
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [`${this.artifactsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            's3:ExistingObjectTag/DataClassification': 'Internal',
          },
        },
      })
    );

    // Add tag-based access control policies for audit logs bucket
    // Restrict access to Confidential data - read-only for Lambda execution role
    this.auditLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowTagBasedAccessConfidential',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(this.iamRoles.lambdaExecutionRole.roleArn)],
        actions: ['s3:GetObject'],
        resources: [`${this.auditLogsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            's3:ExistingObjectTag/DataClassification': 'Confidential',
          },
        },
      })
    );
  }

  private createSecurityGroups(): {
    lambdaSecurityGroup: ec2.SecurityGroup;
    ecsSecurityGroup: ec2.SecurityGroup;
  } {
    // Initialize TagManager for applying resource-specific tags
    const tagConfig = getTagConfig(this.node.tryGetContext('stage') || 'dev');
    const tagManager = new TagManager(tagConfig, this.node.tryGetContext('stage') || 'dev');

    // Security group for Lambda functions
    const lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      'LambdaSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security group for Lambda functions',
        allowAllOutbound: true,
      }
    );
    tagManager.applyTags(lambdaSecurityGroup, {
      Component: 'Network-VPC',
      SecurityGroupPurpose: 'Lambda',
    });

    // Security group for ECS tasks
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });
    tagManager.applyTags(ecsSecurityGroup, {
      Component: 'Network-VPC',
      SecurityGroupPurpose: 'ECS',
    });

    // Security group for VPC endpoints
    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      'VpcEndpointSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security group for VPC endpoints',
        allowAllOutbound: false,
      }
    );
    tagManager.applyTags(vpcEndpointSecurityGroup, {
      Component: 'Network-VPC',
      SecurityGroupPurpose: 'VPCEndpoints',
    });

    // Allow HTTPS traffic from Lambda and ECS to VPC endpoints
    vpcEndpointSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'Allow Lambda functions to access VPC endpoints'
    );

    vpcEndpointSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(443),
      'Allow ECS tasks to access VPC endpoints'
    );

    return { lambdaSecurityGroup, ecsSecurityGroup };
  }
}
