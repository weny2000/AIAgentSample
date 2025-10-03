import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { StepFunctions } from '../step-functions';

describe('StepFunctions Construct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.Vpc;
  let kmsKey: kms.Key;
  let artifactsBucket: s3.Bucket;
  let jobStatusTable: dynamodb.Table;
  let kendraSearchHandler: lambda.Function;
  let ecsSecurityGroup: ec2.SecurityGroup;
  let stepFunctionsRole: iam.Role;
  let ecsTaskRole: iam.Role;
  let ecsExecutionRole: iam.Role;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');

    // Create VPC
    vpc = new ec2.Vpc(stack, 'TestVpc', {
      maxAzs: 2,
    });

    // Create KMS key
    kmsKey = new kms.Key(stack, 'TestKmsKey');

    // Create S3 bucket
    artifactsBucket = new s3.Bucket(stack, 'TestArtifactsBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
    });

    // Create DynamoDB table
    jobStatusTable = new dynamodb.Table(stack, 'TestJobStatusTable', {
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Create Lambda function
    kendraSearchHandler = new lambda.Function(stack, 'TestKendraSearchHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {};'),
    });

    // Create security group
    ecsSecurityGroup = new ec2.SecurityGroup(stack, 'TestEcsSecurityGroup', {
      vpc,
    });

    // Create IAM roles
    stepFunctionsRole = new iam.Role(stack, 'TestStepFunctionsRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    });

    ecsTaskRole = new iam.Role(stack, 'TestEcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    ecsExecutionRole = new iam.Role(stack, 'TestEcsExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
  });

  test('creates Step Functions state machine with correct configuration', () => {
    // When
    const stepFunctions = new StepFunctions(stack, 'TestStepFunctions', {
      stage: 'test',
      vpc,
      ecsSecurityGroup,
      stepFunctionsRole,
      ecsTaskRole,
      ecsExecutionRole,
      kmsKey,
      kendraSearchHandler,
      artifactsBucket,
      jobStatusTable,
    });

    // Then
    const template = Template.fromStack(stack);

    // Verify state machine is created
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'ai-agent-artifact-check-test',
      TracingConfiguration: {
        Enabled: true,
      },
      LoggingConfiguration: {
        Level: 'ALL',
        IncludeExecutionData: true,
      },
    });

    // Verify ECS cluster is created
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'ai-agent-cluster-test',
      ClusterSettings: [
        {
          Name: 'containerInsights',
          Value: 'enabled',
        },
      ],
    });

    // Verify task definitions are created
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'ai-agent-static-checks-test',
      Cpu: '1024',
      Memory: '2048',
      NetworkMode: 'awsvpc',
      RequiresCompatibilities: ['FARGATE'],
    });

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'ai-agent-semantic-checks-test',
      Cpu: '2048',
      Memory: '4096',
      NetworkMode: 'awsvpc',
      RequiresCompatibilities: ['FARGATE'],
    });

    // Verify Lambda functions are created
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-fetch-artifact-test',
      Runtime: 'nodejs18.x',
      Handler: 'handlers/fetch-artifact-handler.handler',
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-compose-report-test',
      Runtime: 'nodejs18.x',
      Handler: 'handlers/compose-report-handler.handler',
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-notify-results-test',
      Runtime: 'nodejs18.x',
      Handler: 'handlers/notify-results-handler.handler',
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-error-handler-test',
      Runtime: 'nodejs18.x',
      Handler: 'handlers/error-handler.handler',
    });

    // Verify CloudWatch log groups are created
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/stepfunctions/ai-agent-test',
    });

    // Verify SNS topic for alarms is created
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'ai-agent-step-functions-alarms-test',
    });

    // Verify CloudWatch alarms are created
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-step-functions-failed-executions-test',
      MetricName: 'ExecutionsFailed',
      Namespace: 'AWS/States',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-step-functions-duration-test',
      MetricName: 'ExecutionTime',
      Namespace: 'AWS/States',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-step-functions-throttled-test',
      MetricName: 'ExecutionThrottled',
      Namespace: 'AWS/States',
    });

    // Verify dashboard is created
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'ai-agent-step-functions-test',
    });

    // Verify outputs are created
    expect(stepFunctions.artifactCheckWorkflow).toBeDefined();
    expect(stepFunctions.ecsCluster).toBeDefined();
    expect(stepFunctions.staticChecksTaskDefinition).toBeDefined();
    expect(stepFunctions.semanticChecksTaskDefinition).toBeDefined();
    expect(stepFunctions.logGroup).toBeDefined();
    expect(stepFunctions.alarmTopic).toBeDefined();
  });

  test('creates Lambda functions with correct environment variables', () => {
    // When
    new StepFunctions(stack, 'TestStepFunctions', {
      stage: 'test',
      vpc,
      ecsSecurityGroup,
      stepFunctionsRole,
      ecsTaskRole,
      ecsExecutionRole,
      kmsKey,
      kendraSearchHandler,
      artifactsBucket,
      jobStatusTable,
    });

    // Then
    const template = Template.fromStack(stack);

    // Verify compose report Lambda has correct environment variables
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-compose-report-test',
      Environment: {
        Variables: {
          STAGE: 'test',
          LOG_LEVEL: 'DEBUG',
          ARTIFACTS_BUCKET_NAME: {
            Ref: Match.anyValue(),
          },
          JOB_STATUS_TABLE: {
            Ref: Match.anyValue(),
          },
        },
      },
    });

    // Verify notify results Lambda has correct environment variables
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-notify-results-test',
      Environment: {
        Variables: {
          STAGE: 'test',
          LOG_LEVEL: 'DEBUG',
          JOB_STATUS_TABLE: {
            Ref: Match.anyValue(),
          },
        },
      },
    });

    // Verify error handler Lambda has correct environment variables
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-error-handler-test',
      Environment: {
        Variables: {
          STAGE: 'test',
          LOG_LEVEL: 'DEBUG',
          JOB_STATUS_TABLE: {
            Ref: Match.anyValue(),
          },
        },
      },
    });
  });

  test('creates ECS task definitions with correct container configurations', () => {
    // When
    new StepFunctions(stack, 'TestStepFunctions', {
      stage: 'test',
      vpc,
      ecsSecurityGroup,
      stepFunctionsRole,
      ecsTaskRole,
      ecsExecutionRole,
      kmsKey,
      kendraSearchHandler,
      artifactsBucket,
      jobStatusTable,
    });

    // Then
    const template = Template.fromStack(stack);

    // Verify static checks task definition
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'ai-agent-static-checks-test',
      ContainerDefinitions: [
        {
          Name: 'static-checks',
          Image: 'public.ecr.aws/lambda/nodejs:18',
          Essential: true,
          Environment: [
            {
              Name: 'STAGE',
              Value: 'test',
            },
            {
              Name: 'LOG_LEVEL',
              Value: 'DEBUG',
            },
          ],
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-stream-prefix': 'static-checks',
            },
          },
        },
      ],
    });

    // Verify semantic checks task definition
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'ai-agent-semantic-checks-test',
      ContainerDefinitions: [
        {
          Name: 'semantic-checks',
          Image: 'public.ecr.aws/lambda/python:3.11',
          Essential: true,
          Environment: [
            {
              Name: 'STAGE',
              Value: 'test',
            },
            {
              Name: 'LOG_LEVEL',
              Value: 'DEBUG',
            },
          ],
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-stream-prefix': 'semantic-checks',
            },
          },
        },
      ],
    });
  });

  test('creates monitoring and alerting resources', () => {
    // When
    new StepFunctions(stack, 'TestStepFunctions', {
      stage: 'test',
      vpc,
      ecsSecurityGroup,
      stepFunctionsRole,
      ecsTaskRole,
      ecsExecutionRole,
      kmsKey,
      kendraSearchHandler,
      artifactsBucket,
      jobStatusTable,
    });

    // Then
    const template = Template.fromStack(stack);

    // Verify CloudWatch alarms
    template.resourceCountIs('AWS::CloudWatch::Alarm', 3);

    // Verify failed executions alarm
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-step-functions-failed-executions-test',
      AlarmDescription: 'Alert when Step Functions executions fail',
      MetricName: 'ExecutionsFailed',
      Threshold: 1,
      EvaluationPeriods: 1,
      TreatMissingData: 'notBreaching',
    });

    // Verify execution duration alarm
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-step-functions-duration-test',
      AlarmDescription: 'Alert when Step Functions executions take too long',
      MetricName: 'ExecutionTime',
      Threshold: 1800000, // 30 minutes in milliseconds
      EvaluationPeriods: 2,
      TreatMissingData: 'notBreaching',
    });

    // Verify throttled executions alarm
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'ai-agent-step-functions-throttled-test',
      AlarmDescription: 'Alert when Step Functions executions are throttled',
      MetricName: 'ExecutionThrottled',
      Threshold: 1,
      EvaluationPeriods: 1,
      TreatMissingData: 'notBreaching',
    });

    // Verify dashboard
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'ai-agent-step-functions-test',
    });
  });

  test('uses existing ECS cluster when provided', () => {
    // Given
    const existingCluster = new cdk.aws_ecs.Cluster(stack, 'ExistingCluster', {
      vpc,
      clusterName: 'ExistingCluster',
    });

    // When
    new StepFunctions(stack, 'TestStepFunctions', {
      stage: 'test',
      vpc,
      ecsSecurityGroup,
      stepFunctionsRole,
      ecsTaskRole,
      ecsExecutionRole,
      kmsKey,
      kendraSearchHandler,
      artifactsBucket,
      jobStatusTable,
      ecsCluster: existingCluster,
    });

    // Then
    const template = Template.fromStack(stack);

    // Should only have one ECS cluster (the existing one)
    template.resourceCountIs('AWS::ECS::Cluster', 1);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'ExistingCluster',
    });
  });

  test('configures production settings correctly', () => {
    // When
    new StepFunctions(stack, 'TestStepFunctions', {
      stage: 'prod',
      vpc,
      ecsSecurityGroup,
      stepFunctionsRole,
      ecsTaskRole,
      ecsExecutionRole,
      kmsKey,
      kendraSearchHandler,
      artifactsBucket,
      jobStatusTable,
    });

    // Then
    const template = Template.fromStack(stack);

    // Verify production log retention
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/stepfunctions/ai-agent-prod',
      RetentionInDays: 30,
    });

    // Verify production Lambda environment
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ai-agent-compose-report-prod',
      Environment: {
        Variables: {
          STAGE: 'prod',
          LOG_LEVEL: 'INFO',
        },
      },
    });
  });
});