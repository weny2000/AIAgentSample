import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface StepFunctionsProps {
  stage: string;
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
  stepFunctionsRole: iam.Role;
  ecsTaskRole: iam.Role;
  ecsExecutionRole: iam.Role;
  kmsKey: kms.Key;
  // Lambda functions for workflow steps
  kendraSearchHandler: lambda.Function;
  // S3 buckets
  artifactsBucket: s3.Bucket;
  // DynamoDB tables
  jobStatusTable: dynamodb.Table;
  // ECS cluster for heavy processing tasks
  ecsCluster?: ecs.Cluster;
}

export class StepFunctions extends Construct {
  public readonly artifactCheckWorkflow: stepfunctions.StateMachine;
  public readonly ecsCluster: ecs.Cluster;
  public readonly staticChecksTaskDefinition: ecs.TaskDefinition;
  public readonly semanticChecksTaskDefinition: ecs.TaskDefinition;
  public readonly logGroup: logs.LogGroup;
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: StepFunctionsProps) {
    super(scope, id);

    // Create ECS cluster if not provided
    this.ecsCluster = props.ecsCluster || this.createEcsCluster(props);

    // Create ECS task definitions
    this.staticChecksTaskDefinition = this.createStaticChecksTaskDefinition(props);
    this.semanticChecksTaskDefinition = this.createSemanticChecksTaskDefinition(props);

    // Create CloudWatch Log Group for Step Functions
    this.logGroup = new logs.LogGroup(this, 'StepFunctionsLogGroup', {
      logGroupName: `/aws/stepfunctions/ai-agent-${props.stage}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create SNS topic for alerts
    this.alarmTopic = new sns.Topic(this, 'StepFunctionsAlarmTopic', {
      topicName: `ai-agent-step-functions-alarms-${props.stage}`,
      displayName: 'AI Agent Step Functions Alarms',
      masterKey: props.kmsKey,
    });

    // Create the artifact check workflow
    this.artifactCheckWorkflow = this.createArtifactCheckWorkflow(props);

    // Create monitoring and alerting
    this.createMonitoringAndAlerting(props);

    // Output Step Functions ARNs
    new cdk.CfnOutput(this, 'ArtifactCheckWorkflowArn', {
      value: this.artifactCheckWorkflow.stateMachineArn,
      exportName: `${cdk.Stack.of(this).stackName}-ArtifactCheckWorkflowArn`,
    });

    new cdk.CfnOutput(this, 'EcsClusterArn', {
      value: this.ecsCluster.clusterArn,
      exportName: `${cdk.Stack.of(this).stackName}-EcsClusterArn`,
    });
  }

  private createEcsCluster(props: StepFunctionsProps): ecs.Cluster {
    return new ecs.Cluster(this, 'EcsCluster', {
      clusterName: `ai-agent-cluster-${props.stage}`,
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });
  }

  private createStaticChecksTaskDefinition(props: StepFunctionsProps): ecs.TaskDefinition {
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'StaticChecksTaskDefinition', {
      family: `ai-agent-static-checks-${props.stage}`,
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole: props.ecsTaskRole,
      executionRole: props.ecsExecutionRole,
    });

    // Add container for static analysis tools
    taskDefinition.addContainer('StaticChecksContainer', {
      containerName: 'static-checks',
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/lambda/nodejs:18'), // Placeholder - will be replaced with custom image
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'static-checks',
        logGroup: new logs.LogGroup(this, 'StaticChecksLogGroup', {
          logGroupName: `/aws/ecs/ai-agent-static-checks-${props.stage}`,
          retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
          encryptionKey: props.kmsKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
      },
      essential: true,
    });

    return taskDefinition;
  }

  private createSemanticChecksTaskDefinition(props: StepFunctionsProps): ecs.TaskDefinition {
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'SemanticChecksTaskDefinition', {
      family: `ai-agent-semantic-checks-${props.stage}`,
      cpu: 2048,
      memoryLimitMiB: 4096,
      taskRole: props.ecsTaskRole,
      executionRole: props.ecsExecutionRole,
    });

    // Add container for semantic analysis using LLM
    taskDefinition.addContainer('SemanticChecksContainer', {
      containerName: 'semantic-checks',
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/lambda/python:3.11'), // Placeholder - will be replaced with custom image
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'semantic-checks',
        logGroup: new logs.LogGroup(this, 'SemanticChecksLogGroup', {
          logGroupName: `/aws/ecs/ai-agent-semantic-checks-${props.stage}`,
          retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
          encryptionKey: props.kmsKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
      },
      essential: true,
    });

    return taskDefinition;
  }

  private createArtifactCheckWorkflow(props: StepFunctionsProps): stepfunctions.StateMachine {
    // Define workflow states
    
    // 1. Receive Request (Pass state to initialize)
    const receiveRequest = new stepfunctions.Pass(this, 'ReceiveRequest', {
      comment: 'Initialize the artifact check workflow',
      parameters: {
        'jobId.$': '$.jobId',
        'artifactCheckRequest.$': '$.artifactCheckRequest',
        'userContext.$': '$.userContext',
        'timestamp.$': '$.timestamp',
        'status': 'processing',
        'progress': 0,
        'currentStep': 'initializing'
      },
    });

    // 2. Kendra Query for context
    const kendraQuery = new stepfunctionsTasks.LambdaInvoke(this, 'KendraQuery', {
      lambdaFunction: props.kendraSearchHandler,
      comment: 'Query Kendra for relevant context and policies',
      payload: stepfunctions.TaskInput.fromObject({
        'query.$': '$.artifactCheckRequest.artifactType',
        'userId.$': '$.userContext.userId',
        'teamId.$': '$.userContext.teamId',
        'pageSize': 10
      }),
      resultPath: '$.kendraResults',
      retryOnServiceExceptions: true,
    });

    // 3. Fetch Artifact (Lambda task)
    const fetchArtifact = new stepfunctionsTasks.LambdaInvoke(this, 'FetchArtifact', {
      lambdaFunction: this.createFetchArtifactLambda(props),
      comment: 'Fetch and validate the artifact from S3 or URL',
      payload: stepfunctions.TaskInput.fromObject({
        'artifactUrl.$': '$.artifactCheckRequest.artifactUrl',
        'artifactContent.$': '$.artifactCheckRequest.artifactContent',
        'jobId.$': '$.jobId'
      }),
      resultPath: '$.artifactData',
      retryOnServiceExceptions: true,
    });

    // 4. Rules Engine Validation (Lambda task)
    const rulesEngineValidation = new stepfunctionsTasks.LambdaInvoke(this, 'RulesEngineValidation', {
      lambdaFunction: this.createRulesEngineValidationLambda(props),
      comment: 'Run rules engine validation with applicable rules',
      payload: stepfunctions.TaskInput.fromObject({
        'jobId.$': '$.jobId',
        'artifactData.$': '$.artifactData',
        'userContext.$': '$.userContext',
        'artifactCheckRequest.$': '$.artifactCheckRequest'
      }),
      resultPath: '$.rulesEngineResults',
      retryOnServiceExceptions: true,
    });

    // 5. Static Checks (ECS task) - Run in parallel with rules engine
    const staticChecks = new stepfunctionsTasks.EcsRunTask(this, 'StaticChecks', {
      integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
      cluster: this.ecsCluster,
      taskDefinition: this.staticChecksTaskDefinition,
      launchTarget: new stepfunctionsTasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: this.staticChecksTaskDefinition.defaultContainer!,
        environment: [
          {
            name: 'JOB_ID',
            value: stepfunctions.JsonPath.stringAt('$.jobId'),
          },
          {
            name: 'ARTIFACT_TYPE',
            value: stepfunctions.JsonPath.stringAt('$.artifactCheckRequest.artifactType'),
          },
          {
            name: 'ARTIFACT_DATA',
            value: stepfunctions.JsonPath.stringAt('$.artifactData'),
          },
        ],
      }],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
      comment: 'Run static analysis checks on the artifact',
      resultPath: '$.staticCheckResults',
    });

    // 6. Semantic Check (ECS task) - Run in parallel with rules engine
    const semanticCheck = new stepfunctionsTasks.EcsRunTask(this, 'SemanticCheck', {
      integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
      cluster: this.ecsCluster,
      taskDefinition: this.semanticChecksTaskDefinition,
      launchTarget: new stepfunctionsTasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: this.semanticChecksTaskDefinition.defaultContainer!,
        environment: [
          {
            name: 'JOB_ID',
            value: stepfunctions.JsonPath.stringAt('$.jobId'),
          },
          {
            name: 'ARTIFACT_TYPE',
            value: stepfunctions.JsonPath.stringAt('$.artifactCheckRequest.artifactType'),
          },
          {
            name: 'ARTIFACT_DATA',
            value: stepfunctions.JsonPath.stringAt('$.artifactData'),
          },
          {
            name: 'KENDRA_RESULTS',
            value: stepfunctions.JsonPath.stringAt('$.kendraResults'),
          },
        ],
      }],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
      comment: 'Run semantic analysis using LLM',
      resultPath: '$.semanticCheckResults',
    });

    // Create parallel execution for validation tasks
    const parallelValidation = new stepfunctions.Parallel(this, 'ParallelValidation', {
      comment: 'Run rules engine, static, and semantic checks in parallel',
      resultPath: '$.parallelResults',
    });

    parallelValidation.branch(rulesEngineValidation);
    parallelValidation.branch(staticChecks);
    parallelValidation.branch(semanticCheck);

    // 7. Process Parallel Results (Pass state to restructure data)
    const processParallelResults = new stepfunctions.Pass(this, 'ProcessParallelResults', {
      comment: 'Process and restructure parallel validation results',
      parameters: {
        'jobId.$': '$.jobId',
        'artifactCheckRequest.$': '$.artifactCheckRequest',
        'userContext.$': '$.userContext',
        'kendraResults.$': '$.kendraResults',
        'artifactData.$': '$.artifactData',
        'rulesEngineResults.$': '$.parallelResults[0].Payload.validationReport',
        'staticCheckResults.$': '$.parallelResults[1]',
        'semanticCheckResults.$': '$.parallelResults[2]',
        'validationSummary': {
          'rulesEngineStatus.$': '$.parallelResults[0].Payload.executionStatus',
          'rulesEngineExecutionTime.$': '$.parallelResults[0].Payload.executionTime',
          'staticCheckStatus': 'completed',
          'semanticCheckStatus': 'completed'
        }
      },
    });

    // 8. Compose Report (Lambda task)
    const composeReport = new stepfunctionsTasks.LambdaInvoke(this, 'ComposeReport', {
      lambdaFunction: this.createComposeReportLambda(props),
      comment: 'Compose final compliance report with scores and recommendations',
      payload: stepfunctions.TaskInput.fromObject({
        'jobId.$': '$.jobId',
        'artifactCheckRequest.$': '$.artifactCheckRequest',
        'userContext.$': '$.userContext',
        'kendraResults.$': '$.kendraResults',
        'rulesEngineResults.$': '$.rulesEngineResults',
        'staticCheckResults.$': '$.staticCheckResults',
        'semanticCheckResults.$': '$.semanticCheckResults',
        'artifactData.$': '$.artifactData',
        'validationSummary.$': '$.validationSummary'
      }),
      resultPath: '$.finalReport',
      retryOnServiceExceptions: true,
    });

    // 9. Notify Results (Lambda task)
    const notifyResults = new stepfunctionsTasks.LambdaInvoke(this, 'NotifyResults', {
      lambdaFunction: this.createNotifyResultsLambda(props),
      comment: 'Send notifications and update job status',
      payload: stepfunctions.TaskInput.fromObject({
        'jobId.$': '$.jobId',
        'userContext.$': '$.userContext',
        'finalReport.$': '$.finalReport',
        'validationSummary.$': '$.validationSummary',
        'status': 'completed'
      }),
      resultPath: '$.notificationResult',
      retryOnServiceExceptions: true,
    });

    // Error handling states
    const handleError = new stepfunctionsTasks.LambdaInvoke(this, 'HandleError', {
      lambdaFunction: this.createErrorHandlerLambda(props),
      comment: 'Handle workflow errors and update job status',
      payload: stepfunctions.TaskInput.fromObject({
        'jobId.$': '$.jobId',
        'userContext.$': '$.userContext',
        'error.$': '$.Error',
        'cause.$': '$.Cause',
        'status': 'failed'
      }),
    });

    const workflowFailed = new stepfunctions.Fail(this, 'WorkflowFailed', {
      comment: 'Workflow execution failed',
    });

    const workflowSucceeded = new stepfunctions.Succeed(this, 'WorkflowSucceeded', {
      comment: 'Workflow execution completed successfully',
    });

    // Add error handling with retry logic
    const addRetryLogic = (task: stepfunctions.TaskStateBase) => {
      return task
        .addRetry({
          errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
          interval: cdk.Duration.seconds(2),
          maxAttempts: 3,
          backoffRate: 2.0,
        })
        .addRetry({
          errors: ['ECS.AmazonECSException'],
          interval: cdk.Duration.seconds(5),
          maxAttempts: 2,
          backoffRate: 2.0,
        })
        .addCatch(handleError, {
          errors: ['States.ALL'],
          resultPath: '$.error',
        });
    };

    // Apply retry logic to all tasks
    addRetryLogic(kendraQuery);
    addRetryLogic(fetchArtifact);
    addRetryLogic(rulesEngineValidation);
    addRetryLogic(staticChecks);
    addRetryLogic(semanticCheck);
    addRetryLogic(composeReport);
    addRetryLogic(notifyResults);

    // Apply retry logic to parallel execution
    parallelValidation
      .addRetry({
        errors: ['States.TaskFailed'],
        interval: cdk.Duration.seconds(2),
        maxAttempts: 2,
        backoffRate: 2.0,
      })
      .addCatch(handleError, {
        errors: ['States.ALL'],
        resultPath: '$.error',
      });

    // Define the workflow chain
    const definition = receiveRequest
      .next(kendraQuery)
      .next(fetchArtifact)
      .next(parallelValidation)
      .next(processParallelResults)
      .next(composeReport)
      .next(notifyResults)
      .next(workflowSucceeded);

    // Add error handling chain
    handleError.next(workflowFailed);

    // Create the state machine
    const stateMachine = new stepfunctions.StateMachine(this, 'ArtifactCheckWorkflow', {
      stateMachineName: `ai-agent-artifact-check-${props.stage}`,
      definition,
      role: props.stepFunctionsRole,
      logs: {
        destination: this.logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
      timeout: cdk.Duration.minutes(30), // Maximum workflow execution time
    });

    return stateMachine;
  }

  private createFetchArtifactLambda(props: StepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'FetchArtifactLambda', {
      functionName: `ai-agent-fetch-artifact-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/fetch-artifact-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        AWS_REGION: cdk.Stack.of(this).region,
        RULE_DEFINITIONS_TABLE_NAME: `ai-agent-rule-definitions-${props.stage}`,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createRulesEngineValidationLambda(props: StepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'RulesEngineValidationLambda', {
      functionName: `ai-agent-rules-engine-validation-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/rules-engine-validation-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(10), // Longer timeout for rules engine processing
      memorySize: 2048, // More memory for complex rule processing
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        AWS_REGION: cdk.Stack.of(this).region,
        RULE_DEFINITIONS_TABLE_NAME: `ai-agent-rule-definitions-${props.stage}`,
        // Rules engine configuration
        SEVERITY_WEIGHT_CRITICAL: '100',
        SEVERITY_WEIGHT_HIGH: '50',
        SEVERITY_WEIGHT_MEDIUM: '20',
        SEVERITY_WEIGHT_LOW: '5',
        // Static analysis tool configuration
        ESLINT_ENABLED: 'true',
        CFN_LINT_ENABLED: 'true',
        CFN_NAG_ENABLED: 'true',
        SNYK_ENABLED: 'true',
        // LLM configuration for semantic analysis
        LLM_MODEL_NAME: 'anthropic.claude-3-sonnet-20240229-v1:0',
        LLM_TEMPERATURE: '0.1',
        LLM_MAX_TOKENS: '4096',
        LLM_CONFIDENCE_THRESHOLD: '0.7',
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createComposeReportLambda(props: StepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'ComposeReportLambda', {
      functionName: `ai-agent-compose-report-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/compose-report-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(5), // Increased timeout for rules engine processing
      memorySize: 1024,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        AWS_REGION: cdk.Stack.of(this).region,
        ARTIFACTS_BUCKET_NAME: props.artifactsBucket.bucketName,
        JOB_STATUS_TABLE: props.jobStatusTable.tableName,
        RULE_DEFINITIONS_TABLE_NAME: `ai-agent-rule-definitions-${props.stage}`,
        // Rules engine configuration
        SEVERITY_WEIGHT_CRITICAL: '100',
        SEVERITY_WEIGHT_HIGH: '50',
        SEVERITY_WEIGHT_MEDIUM: '20',
        SEVERITY_WEIGHT_LOW: '5',
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createNotifyResultsLambda(props: StepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'NotifyResultsLambda', {
      functionName: `ai-agent-notify-results-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/notify-results-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(1),
      memorySize: 512,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        JOB_STATUS_TABLE: props.jobStatusTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createErrorHandlerLambda(props: StepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'ErrorHandlerLambda', {
      functionName: `ai-agent-error-handler-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/error-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        JOB_STATUS_TABLE: props.jobStatusTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createMonitoringAndAlerting(props: StepFunctionsProps): void {
    // Create CloudWatch alarms for workflow monitoring
    
    // Alarm for failed executions
    const failedExecutionsAlarm = new cloudwatch.Alarm(this, 'FailedExecutionsAlarm', {
      alarmName: `ai-agent-step-functions-failed-executions-${props.stage}`,
      alarmDescription: 'Alert when Step Functions executions fail',
      metric: this.artifactCheckWorkflow.metricFailed({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    failedExecutionsAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    // Alarm for execution duration
    const executionDurationAlarm = new cloudwatch.Alarm(this, 'ExecutionDurationAlarm', {
      alarmName: `ai-agent-step-functions-duration-${props.stage}`,
      alarmDescription: 'Alert when Step Functions executions take too long',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/States',
        metricName: 'ExecutionTime',
        dimensionsMap: {
          StateMachineArn: this.artifactCheckWorkflow.stateMachineArn,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 1800000, // 30 minutes in milliseconds
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    executionDurationAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    // Alarm for throttled executions
    const throttledExecutionsAlarm = new cloudwatch.Alarm(this, 'ThrottledExecutionsAlarm', {
      alarmName: `ai-agent-step-functions-throttled-${props.stage}`,
      alarmDescription: 'Alert when Step Functions executions are throttled',
      metric: this.artifactCheckWorkflow.metricThrottled({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    throttledExecutionsAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    // Create dashboard for monitoring
    new cloudwatch.Dashboard(this, 'StepFunctionsDashboard', {
      dashboardName: `ai-agent-step-functions-${props.stage}`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Execution Status',
            left: [
              this.artifactCheckWorkflow.metricStarted(),
              this.artifactCheckWorkflow.metricSucceeded(),
              this.artifactCheckWorkflow.metricFailed(),
            ],
            period: cdk.Duration.minutes(5),
            width: 12,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Execution Duration',
            left: [new cloudwatch.Metric({
              namespace: 'AWS/States',
              metricName: 'ExecutionTime',
              dimensionsMap: {
                StateMachineArn: this.artifactCheckWorkflow.stateMachineArn,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
            })],
            width: 12,
          }),
        ],
      ],
    });
  }
}