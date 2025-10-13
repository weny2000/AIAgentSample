import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface IamRolesProps {
  kmsKey: kms.Key;
  documentsBucket: s3.Bucket;
  artifactsBucket: s3.Bucket;
  auditLogsBucket: s3.Bucket;
  workTaskAnalysisBucket?: s3.Bucket;
  stage: string;
}

export class IamRoles extends Construct {
  public readonly lambdaExecutionRole: iam.Role;
  public readonly ecsTaskRole: iam.Role;
  public readonly ecsExecutionRole: iam.Role;
  public readonly apiGatewayRole: iam.Role;
  public readonly stepFunctionsRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamRolesProps) {
    super(scope, id);

    // Create Lambda execution role
    this.lambdaExecutionRole = this.createLambdaExecutionRole(props);

    // Create ECS task and execution roles
    this.ecsTaskRole = this.createEcsTaskRole(props);
    this.ecsExecutionRole = this.createEcsExecutionRole(props);

    // Create API Gateway role
    this.apiGatewayRole = this.createApiGatewayRole(props);

    // Create Step Functions role
    this.stepFunctionsRole = this.createStepFunctionsRole(props);

    // Add tags to all roles
    cdk.Tags.of(this).add('Component', 'IAM');
    cdk.Tags.of(this).add('Stage', props.stage);
  }

  private createLambdaExecutionRole(props: IamRolesProps): iam.Role {
    const role = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `ai-agent-lambda-execution-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for AI Agent Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole'
        ),
      ],
    });

    // Add custom policies for Lambda functions
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KMSAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey',
          'kms:ReEncrypt*',
          'kms:DescribeKey',
        ],
        resources: [props.kmsKey.keyArn],
      })
    );

    const s3Resources = [
      props.documentsBucket.bucketArn,
      `${props.documentsBucket.bucketArn}/*`,
      props.artifactsBucket.bucketArn,
      `${props.artifactsBucket.bucketArn}/*`,
    ];

    // Add work task analysis bucket if provided
    if (props.workTaskAnalysisBucket) {
      s3Resources.push(
        props.workTaskAnalysisBucket.bucketArn,
        `${props.workTaskAnalysisBucket.bucketArn}/*`
      );
    }

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3Access',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
          's3:GetObjectVersion',
          's3:GetObjectAttributes',
          's3:PutObjectAcl',
          's3:GetObjectAcl',
        ],
        resources: s3Resources,
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AuditLogsWrite',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:PutObjectAcl'],
        resources: [`${props.auditLogsBucket.bucketArn}/*`],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DynamoDBAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/ai-agent-*`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:ai-agent/*`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KendraAccess',
        effect: iam.Effect.ALLOW,
        actions: ['kendra:Query', 'kendra:Retrieve', 'kendra:SubmitFeedback'],
        resources: [
          `arn:aws:kendra:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:index/*`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'StepFunctionsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'states:StartExecution',
          'states:DescribeExecution',
          'states:StopExecution',
        ],
        resources: [
          `arn:aws:states:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stateMachine:ai-agent-*`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SQSAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'sqs:SendMessage',
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
        ],
        resources: [
          `arn:aws:sqs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:ai-agent-*`,
        ],
      })
    );

    // Add Comprehend access for PII detection
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ComprehendAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'comprehend:DetectPiiEntities',
          'comprehend:ContainsPiiEntities',
        ],
        resources: ['*'],
      })
    );

    // Add CloudWatch Logs access
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
        ],
        resources: [
          `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda/ai-agent-*`,
        ],
      })
    );

    return role;
  }

  private createEcsTaskRole(props: IamRolesProps): iam.Role {
    const role = new iam.Role(this, 'EcsTaskRole', {
      roleName: `ai-agent-ecs-task-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task role for AI Agent ECS tasks',
    });

    // Add policies for ECS tasks (heavy processing workloads)
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KMSAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey',
          'kms:ReEncrypt*',
          'kms:DescribeKey',
        ],
        resources: [props.kmsKey.keyArn],
      })
    );

    const ecsS3Resources = [
      props.documentsBucket.bucketArn,
      `${props.documentsBucket.bucketArn}/*`,
      props.artifactsBucket.bucketArn,
      `${props.artifactsBucket.bucketArn}/*`,
    ];

    // Add work task analysis bucket if provided
    if (props.workTaskAnalysisBucket) {
      ecsS3Resources.push(
        props.workTaskAnalysisBucket.bucketArn,
        `${props.workTaskAnalysisBucket.bucketArn}/*`
      );
    }

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3Access',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
          's3:GetObjectVersion',
          's3:GetObjectAttributes',
          's3:PutObjectAcl',
          's3:GetObjectAcl',
        ],
        resources: ecsS3Resources,
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AuditLogsWrite',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:PutObjectAcl'],
        resources: [`${props.auditLogsBucket.bucketArn}/*`],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:ai-agent/*`,
        ],
      })
    );

    // Allow ECS tasks to access external APIs for static analysis tools
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ExternalAPIAccess',
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:Invoke'],
        resources: [
          `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/POST/*`,
          `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/GET/*`,
        ],
      })
    );

    return role;
  }

  private createEcsExecutionRole(props: IamRolesProps): iam.Role {
    const role = new iam.Role(this, 'EcsExecutionRole', {
      roleName: `ai-agent-ecs-execution-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Execution role for AI Agent ECS tasks',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Add KMS access for encrypted ECR images and logs
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KMSAccess',
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.kmsKey.keyArn],
      })
    );

    // Add Secrets Manager access for container secrets
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:ai-agent/*`,
        ],
      })
    );

    return role;
  }

  private createApiGatewayRole(props: IamRolesProps): iam.Role {
    const role = new iam.Role(this, 'ApiGatewayRole', {
      roleName: `ai-agent-api-gateway-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      description:
        'Role for API Gateway to invoke Lambda functions and access CloudWatch',
    });

    // Add CloudWatch Logs permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
          'logs:GetLogEvents',
          'logs:FilterLogEvents',
        ],
        resources: [
          `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/apigateway/*`,
        ],
      })
    );

    // Add Lambda invoke permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LambdaInvokeAccess',
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:ai-agent-*`,
        ],
      })
    );

    return role;
  }

  private createStepFunctionsRole(props: IamRolesProps): iam.Role {
    const role = new iam.Role(this, 'StepFunctionsRole', {
      roleName: `ai-agent-step-functions-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Role for Step Functions to orchestrate AI Agent workflows',
    });

    // Add Lambda invoke permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LambdaInvokeAccess',
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:aws:lambda:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:function:ai-agent-*`,
        ],
      })
    );

    // Add ECS task permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECSTaskAccess',
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask', 'ecs:StopTask', 'ecs:DescribeTasks'],
        resources: [
          `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:task-definition/ai-agent-*`,
          `arn:aws:ecs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:task/*`,
        ],
      })
    );

    // Add IAM pass role permissions for ECS tasks
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PassRoleAccess',
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [this.ecsTaskRole.roleArn, this.ecsExecutionRole.roleArn],
      })
    );

    // Add CloudWatch Logs permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogDelivery',
          'logs:GetLogDelivery',
          'logs:UpdateLogDelivery',
          'logs:DeleteLogDelivery',
          'logs:ListLogDeliveries',
          'logs:PutResourcePolicy',
          'logs:DescribeResourcePolicies',
          'logs:DescribeLogGroups',
        ],
        resources: ['*'],
      })
    );

    return role;
  }
}
