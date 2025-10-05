import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface WorkTaskStepFunctionsProps {
  stage: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  stepFunctionsRole: iam.Role;
  lambdaExecutionRole: iam.Role;
  kmsKey: kms.Key;
  // DynamoDB tables
  workTasksTable: dynamodb.Table;
  todoItemsTable: dynamodb.Table;
  deliverablesTable: dynamodb.Table;
}

export class WorkTaskStepFunctions extends Construct {
  public readonly taskAnalysisWorkflow: stepfunctions.StateMachine;
  public readonly deliverableVerificationWorkflow: stepfunctions.StateMachine;
  public readonly qualityCheckWorkflow: stepfunctions.StateMachine;
  public readonly logGroup: logs.LogGroup;
  public readonly alarmTopic: sns.Topic;

  // Lambda functions
  private readonly taskAnalysisHandler: lambda.Function;
  private readonly deliverableVerificationHandler: lambda.Function;
  private readonly qualityCheckHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: WorkTaskStepFunctionsProps) {
    super(scope, id);

    // Create CloudWatch Log Group
    this.logGroup = new logs.LogGroup(this, 'WorkTaskStepFunctionsLogGroup', {
      logGroupName: `/aws/stepfunctions/work-task-${props.stage}`,
      retention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create SNS topic for alerts
    this.alarmTopic = new sns.Topic(this, 'WorkTaskStepFunctionsAlarmTopic', {
      topicName: `work-task-step-functions-alarms-${props.stage}`,
      displayName: 'Work Task Step Functions Alarms',
      masterKey: props.kmsKey,
    });

    // Create Lambda handlers
    this.taskAnalysisHandler = this.createTaskAnalysisHandler(props);
    this.deliverableVerificationHandler = this.createDeliverableVerificationHandler(props);
    this.qualityCheckHandler = this.createQualityCheckHandler(props);

    // Create workflows
    this.taskAnalysisWorkflow = this.createTaskAnalysisWorkflow(props);
    this.deliverableVerificationWorkflow = this.createDeliverableVerificationWorkflow(props);
    this.qualityCheckWorkflow = this.createQualityCheckWorkflow(props);

    // Create monitoring
    this.createMonitoringAndAlerting(props);

    // Outputs
    new cdk.CfnOutput(this, 'TaskAnalysisWorkflowArn', {
      value: this.taskAnalysisWorkflow.stateMachineArn,
      exportName: `${cdk.Stack.of(this).stackName}-TaskAnalysisWorkflowArn`,
    });

    new cdk.CfnOutput(this, 'DeliverableVerificationWorkflowArn', {
      value: this.deliverableVerificationWorkflow.stateMachineArn,
      exportName: `${cdk.Stack.of(this).stackName}-DeliverableVerificationWorkflowArn`,
    });

    new cdk.CfnOutput(this, 'QualityCheckWorkflowArn', {
      value: this.qualityCheckWorkflow.stateMachineArn,
      exportName: `${cdk.Stack.of(this).stackName}-QualityCheckWorkflowArn`,
    });
  }

  private createTaskAnalysisHandler(props: WorkTaskStepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'TaskAnalysisHandler', {
      functionName: `work-task-analysis-workflow-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/step-functions/task-analysis-workflow-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 2048,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.lambdaSecurityGroup],
      role: props.lambdaExecutionRole,
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        KENDRA_INDEX_ID: process.env.KENDRA_INDEX_ID || '',
        WORK_TASKS_TABLE: props.workTasksTable.tableName,
        TODO_ITEMS_TABLE: props.todoItemsTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createDeliverableVerificationHandler(props: WorkTaskStepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'DeliverableVerificationHandler', {
      functionName: `deliverable-verification-workflow-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/step-functions/deliverable-verification-workflow-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.lambdaSecurityGroup],
      role: props.lambdaExecutionRole,
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        DELIVERABLES_TABLE: props.deliverablesTable.tableName,
        TODO_ITEMS_TABLE: props.todoItemsTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createQualityCheckHandler(props: WorkTaskStepFunctionsProps): lambda.Function {
    return new lambda.Function(this, 'QualityCheckHandler', {
      functionName: `quality-check-workflow-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/step-functions/quality-check-workflow-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist/lambda'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 2048,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.lambdaSecurityGroup],
      role: props.lambdaExecutionRole,
      environment: {
        STAGE: props.stage,
        LOG_LEVEL: props.stage === 'prod' ? 'INFO' : 'DEBUG',
        DELIVERABLES_TABLE: props.deliverablesTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: props.stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
    });
  }

  private createTaskAnalysisWorkflow(props: WorkTaskStepFunctionsProps): stepfunctions.StateMachine {
    // Initialize workflow
    const initializeWorkflow = new stepfunctions.Pass(this, 'InitializeTaskAnalysis', {
      comment: 'Initialize task analysis workflow',
      parameters: {
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'timestamp.$': '$$.State.EnteredTime',
        'status': 'processing'
      },
    });

    // Step 1: Extract key points
    const extractKeyPoints = new stepfunctionsTasks.LambdaInvoke(this, 'ExtractKeyPoints', {
      lambdaFunction: this.taskAnalysisHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'step': 'extract_key_points'
      }),
      resultPath: '$.keyPointsResult',
      retryOnServiceExceptions: true,
    });

    // Step 2: Search knowledge base
    const searchKnowledge = new stepfunctionsTasks.LambdaInvoke(this, 'SearchKnowledge', {
      lambdaFunction: this.taskAnalysisHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'step': 'search_knowledge'
      }),
      resultPath: '$.knowledgeResult',
      retryOnServiceExceptions: true,
    });

    // Parallel execution for workgroups and todos
    const parallelAnalysis = new stepfunctions.Parallel(this, 'ParallelAnalysis', {
      comment: 'Run workgroup identification and todo generation in parallel',
      resultPath: '$.parallelResults',
    });

    // Branch 1: Identify workgroups
    const identifyWorkgroups = new stepfunctionsTasks.LambdaInvoke(this, 'IdentifyWorkgroups', {
      lambdaFunction: this.taskAnalysisHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'step': 'identify_workgroups',
        'context.$': '$'
      }),
      retryOnServiceExceptions: true,
    });

    // Branch 2: Generate todos
    const generateTodos = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateTodos', {
      lambdaFunction: this.taskAnalysisHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'step': 'generate_todos',
        'context.$': '$'
      }),
      retryOnServiceExceptions: true,
    });

    parallelAnalysis.branch(identifyWorkgroups);
    parallelAnalysis.branch(generateTodos);

    // Step 3: Assess risks
    const assessRisks = new stepfunctionsTasks.LambdaInvoke(this, 'AssessRisks', {
      lambdaFunction: this.taskAnalysisHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'step': 'assess_risks',
        'context.$': '$'
      }),
      resultPath: '$.riskResult',
      retryOnServiceExceptions: true,
    });

    // Step 4: Compile results
    const compileResults = new stepfunctionsTasks.LambdaInvoke(this, 'CompileTaskAnalysisResults', {
      lambdaFunction: this.taskAnalysisHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'taskId.$': '$.taskId',
        'taskContent.$': '$.taskContent',
        'step': 'compile_results',
        'context.$': '$'
      }),
      resultPath: '$.finalResult',
      retryOnServiceExceptions: true,
    });

    // Success and failure states
    const workflowSucceeded = new stepfunctions.Succeed(this, 'TaskAnalysisSucceeded');
    const workflowFailed = new stepfunctions.Fail(this, 'TaskAnalysisFailed');

    // Error handler
    const handleError = new stepfunctions.Pass(this, 'HandleTaskAnalysisError', {
      parameters: {
        'error.$': '$.error',
        'cause.$': '$.cause',
        'status': 'failed'
      },
    });

    // Add retry and error handling
    this.addRetryLogic(extractKeyPoints);
    this.addRetryLogic(searchKnowledge);
    this.addRetryLogic(identifyWorkgroups);
    this.addRetryLogic(generateTodos);
    this.addRetryLogic(assessRisks);
    this.addRetryLogic(compileResults);

    parallelAnalysis.addCatch(handleError, { errors: ['States.ALL'], resultPath: '$.error' });
    handleError.next(workflowFailed);

    // Define workflow
    const definition = initializeWorkflow
      .next(extractKeyPoints)
      .next(searchKnowledge)
      .next(parallelAnalysis)
      .next(assessRisks)
      .next(compileResults)
      .next(workflowSucceeded);

    return new stepfunctions.StateMachine(this, 'TaskAnalysisWorkflow', {
      stateMachineName: `work-task-analysis-${props.stage}`,
      definition,
      role: props.stepFunctionsRole,
      logs: {
        destination: this.logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
      timeout: cdk.Duration.minutes(15),
    });
  }

  private createDeliverableVerificationWorkflow(props: WorkTaskStepFunctionsProps): stepfunctions.StateMachine {
    // Initialize workflow
    const initializeWorkflow = new stepfunctions.Pass(this, 'InitializeDeliverableVerification', {
      comment: 'Initialize batch deliverable verification',
      parameters: {
        'batchId.$': '$.batchId',
        'deliverables.$': '$.deliverables',
        'timestamp.$': '$$.State.EnteredTime',
        'status': 'processing'
      },
    });

    // Check if batch or single processing
    const checkBatchSize = new stepfunctions.Choice(this, 'CheckBatchSize')
      .when(
        stepfunctions.Condition.numberGreaterThan('$.deliverables[0]', 1),
        new stepfunctionsTasks.LambdaInvoke(this, 'ProcessBatch', {
          lambdaFunction: this.deliverableVerificationHandler,
          payload: stepfunctions.TaskInput.fromObject({
            'batchId.$': '$.batchId',
            'deliverables.$': '$.deliverables',
            'step': 'validate_batch'
          }),
          resultPath: '$.batchResult',
          retryOnServiceExceptions: true,
        })
      )
      .otherwise(
        new stepfunctionsTasks.LambdaInvoke(this, 'ProcessSingle', {
          lambdaFunction: this.deliverableVerificationHandler,
          payload: stepfunctions.TaskInput.fromObject({
            'batchId.$': '$.batchId',
            'deliverables.$': '$.deliverables',
            'step': 'process_single',
            'deliverableIndex': 0
          }),
          resultPath: '$.singleResult',
          retryOnServiceExceptions: true,
        })
      );

    // Aggregate results
    const aggregateResults = new stepfunctionsTasks.LambdaInvoke(this, 'AggregateVerificationResults', {
      lambdaFunction: this.deliverableVerificationHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'batchId.$': '$.batchId',
        'deliverables.$': '$.deliverables',
        'step': 'aggregate_results',
        'context.$': '$'
      }),
      resultPath: '$.aggregatedResult',
      retryOnServiceExceptions: true,
    });

    // Success and failure states
    const workflowSucceeded = new stepfunctions.Succeed(this, 'DeliverableVerificationSucceeded');
    const workflowFailed = new stepfunctions.Fail(this, 'DeliverableVerificationFailed');

    // Error handler
    const handleError = new stepfunctions.Pass(this, 'HandleVerificationError', {
      parameters: {
        'error.$': '$.error',
        'cause.$': '$.cause',
        'status': 'failed'
      },
    });

    handleError.next(workflowFailed);

    // Define workflow
    const definition = initializeWorkflow
      .next(checkBatchSize)
      .afterwards()
      .next(aggregateResults)
      .next(workflowSucceeded);

    return new stepfunctions.StateMachine(this, 'DeliverableVerificationWorkflow', {
      stateMachineName: `deliverable-verification-${props.stage}`,
      definition,
      role: props.stepFunctionsRole,
      logs: {
        destination: this.logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
      timeout: cdk.Duration.minutes(30),
    });
  }

  private createQualityCheckWorkflow(props: WorkTaskStepFunctionsProps): stepfunctions.StateMachine {
    // Initialize workflow
    const initializeWorkflow = new stepfunctions.Pass(this, 'InitializeQualityCheck', {
      comment: 'Initialize parallel quality checking',
      parameters: {
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'qualityStandards.$': '$.qualityStandards',
        'timestamp.$': '$$.State.EnteredTime',
        'status': 'processing'
      },
    });

    // Parallel quality checks
    const parallelQualityChecks = new stepfunctions.Parallel(this, 'ParallelQualityChecks', {
      comment: 'Run quality checks in parallel across dimensions',
      resultPath: '$.parallelResults',
    });

    // Format check
    const checkFormat = new stepfunctionsTasks.LambdaInvoke(this, 'CheckFormat', {
      lambdaFunction: this.qualityCheckHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'step': 'check_format'
      }),
      retryOnServiceExceptions: true,
    });

    // Completeness check
    const checkCompleteness = new stepfunctionsTasks.LambdaInvoke(this, 'CheckCompleteness', {
      lambdaFunction: this.qualityCheckHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'step': 'check_completeness'
      }),
      retryOnServiceExceptions: true,
    });

    // Accuracy check
    const checkAccuracy = new stepfunctionsTasks.LambdaInvoke(this, 'CheckAccuracy', {
      lambdaFunction: this.qualityCheckHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'step': 'check_accuracy'
      }),
      retryOnServiceExceptions: true,
    });

    // Clarity check
    const checkClarity = new stepfunctionsTasks.LambdaInvoke(this, 'CheckClarity', {
      lambdaFunction: this.qualityCheckHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'step': 'check_clarity'
      }),
      retryOnServiceExceptions: true,
    });

    // Consistency check
    const checkConsistency = new stepfunctionsTasks.LambdaInvoke(this, 'CheckConsistency', {
      lambdaFunction: this.qualityCheckHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'step': 'check_consistency'
      }),
      retryOnServiceExceptions: true,
    });

    // Add branches to parallel execution
    parallelQualityChecks.branch(checkFormat);
    parallelQualityChecks.branch(checkCompleteness);
    parallelQualityChecks.branch(checkAccuracy);
    parallelQualityChecks.branch(checkClarity);
    parallelQualityChecks.branch(checkConsistency);

    // Aggregate quality results
    const aggregateQuality = new stepfunctionsTasks.LambdaInvoke(this, 'AggregateQualityResults', {
      lambdaFunction: this.qualityCheckHandler,
      payload: stepfunctions.TaskInput.fromObject({
        'checkId.$': '$.checkId',
        'deliverable.$': '$.deliverable',
        'step': 'aggregate_quality',
        'context': {
          'formatResult.$': '$.parallelResults[0].Payload.result',
          'completenessResult.$': '$.parallelResults[1].Payload.result',
          'accuracyResult.$': '$.parallelResults[2].Payload.result',
          'clarityResult.$': '$.parallelResults[3].Payload.result',
          'consistencyResult.$': '$.parallelResults[4].Payload.result'
        }
      }),
      resultPath: '$.qualityResult',
      retryOnServiceExceptions: true,
    });

    // Success and failure states
    const workflowSucceeded = new stepfunctions.Succeed(this, 'QualityCheckSucceeded');
    const workflowFailed = new stepfunctions.Fail(this, 'QualityCheckFailed');

    // Error handler
    const handleError = new stepfunctions.Pass(this, 'HandleQualityCheckError', {
      parameters: {
        'error.$': '$.error',
        'cause.$': '$.cause',
        'status': 'failed'
      },
    });

    // Add retry and error handling
    parallelQualityChecks.addCatch(handleError, { errors: ['States.ALL'], resultPath: '$.error' });
    this.addRetryLogic(aggregateQuality);
    handleError.next(workflowFailed);

    // Define workflow
    const definition = initializeWorkflow
      .next(parallelQualityChecks)
      .next(aggregateQuality)
      .next(workflowSucceeded);

    return new stepfunctions.StateMachine(this, 'QualityCheckWorkflow', {
      stateMachineName: `quality-check-${props.stage}`,
      definition,
      role: props.stepFunctionsRole,
      logs: {
        destination: this.logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
      timeout: cdk.Duration.minutes(15),
    });
  }

  private addRetryLogic(task: stepfunctions.TaskStateBase): void {
    task
      .addRetry({
        errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
        interval: cdk.Duration.seconds(2),
        maxAttempts: 3,
        backoffRate: 2.0,
      })
      .addRetry({
        errors: ['States.TaskFailed'],
        interval: cdk.Duration.seconds(5),
        maxAttempts: 2,
        backoffRate: 2.0,
      })
      .addRetry({
        errors: ['States.Timeout'],
        interval: cdk.Duration.seconds(10),
        maxAttempts: 2,
        backoffRate: 1.5,
      });
  }

  private createMonitoringAndAlerting(props: WorkTaskStepFunctionsProps): void {
    const workflows = [
      { name: 'TaskAnalysis', workflow: this.taskAnalysisWorkflow },
      { name: 'DeliverableVerification', workflow: this.deliverableVerificationWorkflow },
      { name: 'QualityCheck', workflow: this.qualityCheckWorkflow },
    ];

    workflows.forEach(({ name, workflow }) => {
      // Failed executions alarm
      const failedAlarm = new cloudwatch.Alarm(this, `${name}FailedAlarm`, {
        alarmName: `work-task-${name.toLowerCase()}-failed-${props.stage}`,
        metric: workflow.metricFailed({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      failedAlarm.addAlarmAction({ bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }) });

      // Duration alarm
      const durationAlarm = new cloudwatch.Alarm(this, `${name}DurationAlarm`, {
        alarmName: `work-task-${name.toLowerCase()}-duration-${props.stage}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/States',
          metricName: 'ExecutionTime',
          dimensionsMap: { StateMachineArn: workflow.stateMachineArn },
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: name === 'DeliverableVerification' ? 1800000 : 900000, // 30 or 15 minutes
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      durationAlarm.addAlarmAction({ bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }) });
    });

    // Create dashboard
    new cloudwatch.Dashboard(this, 'WorkTaskStepFunctionsDashboard', {
      dashboardName: `work-task-step-functions-${props.stage}`,
      widgets: workflows.flatMap(({ name, workflow }) => [
        [
          new cloudwatch.GraphWidget({
            title: `${name} Execution Status`,
            left: [
              workflow.metricStarted(),
              workflow.metricSucceeded(),
              workflow.metricFailed(),
            ],
            period: cdk.Duration.minutes(5),
            width: 8,
          }),
        ],
      ]),
    });
  }
}
