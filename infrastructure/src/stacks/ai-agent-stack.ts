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

    // Create VPC endpoints for AWS services
    this.createVpcEndpoints();

    // Create S3 buckets with proper access controls and encryption
    const buckets = this.createS3Buckets(props.stage);
    this.documentsBucket = buckets.documentsBucket;
    this.artifactsBucket = buckets.artifactsBucket;
    this.auditLogsBucket = buckets.auditLogsBucket;

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
      stage: props.stage,
    });

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

    // Add tags to all resources in this stack
    cdk.Tags.of(this).add('Project', 'AiAgentSystem');
    cdk.Tags.of(this).add('Stage', props.stage);
    cdk.Tags.of(this).add('MonitoringEnabled', 'true');
    cdk.Tags.of(this).add('XRayEnabled', 'true');
  }

  private createVpcEndpoints(): void {
    // S3 Gateway endpoint (no charge)
    this.vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // KMS Interface endpoint
    this.vpc.addInterfaceEndpoint('KmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // Secrets Manager Interface endpoint
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // ECR Interface endpoints for container images
    this.vpc.addInterfaceEndpoint('EcrEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // STS Interface endpoint for IAM operations
    this.vpc.addInterfaceEndpoint('StsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // Kendra Interface endpoint
    this.vpc.addInterfaceEndpoint('KendraEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KENDRA,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
  }

  private createS3Buckets(stage: string): {
    documentsBucket: s3.Bucket;
    artifactsBucket: s3.Bucket;
    auditLogsBucket: s3.Bucket;
  } {
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

    // Add bucket notifications and policies
    this.configureBucketPolicies(documentsBucket, artifactsBucket, auditLogsBucket);
    
    return { documentsBucket, artifactsBucket, auditLogsBucket };
  }

  private configureBucketPolicies(
    documentsBucket: s3.Bucket,
    artifactsBucket: s3.Bucket,
    auditLogsBucket: s3.Bucket
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

  private createSecurityGroups(): {
    lambdaSecurityGroup: ec2.SecurityGroup;
    ecsSecurityGroup: ec2.SecurityGroup;
  } {
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

    // Security group for ECS tasks
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
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

    // Export security groups for use in other stacks/constructs
    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: lambdaSecurityGroup.securityGroupId,
      exportName: `${this.stackName}-LambdaSecurityGroupId`,
    });

    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: ecsSecurityGroup.securityGroupId,
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

    return { lambdaSecurityGroup, ecsSecurityGroup };
  }
}
