import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface WorkTaskNotificationsProps {
  stage: string;
  kmsKey: kms.Key;
  notificationHandler: lambda.Function;
}

/**
 * Construct for Work Task Notification System infrastructure
 * Implements notification and reminder functionality for work tasks
 */
export class WorkTaskNotifications extends Construct {
  public readonly notificationsTable: dynamodb.Table;
  public readonly preferencesTable: dynamodb.Table;
  public readonly reminderQueue: sqs.Queue;
  public readonly reminderDLQ: sqs.Queue;
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: WorkTaskNotificationsProps) {
    super(scope, id);

    // Create Dead Letter Queue for failed notifications
    this.reminderDLQ = new sqs.Queue(this, 'ReminderDLQ', {
      queueName: `ai-agent-reminder-dlq-${props.stage}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create SQS Queue for reminder scheduling
    this.reminderQueue = new sqs.Queue(this, 'ReminderQueue', {
      queueName: `ai-agent-reminder-queue-${props.stage}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.kmsKey,
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.reminderDLQ,
        maxReceiveCount: 3,
      },
    });

    // Create Notifications Table
    this.notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: `ai-agent-notifications-${props.stage}`,
      partitionKey: {
        name: 'notification_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      pointInTimeRecovery: true,
      deletionProtection: props.stage === 'prod',
      removalPolicy: props.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
    });

    // Add GSI for querying notifications by task
    this.notificationsTable.addGlobalSecondaryIndex({
      indexName: 'task_id-sent_at-index',
      partitionKey: {
        name: 'task_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sent_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying notifications by recipient
    this.notificationsTable.addGlobalSecondaryIndex({
      indexName: 'recipient-index',
      partitionKey: {
        name: 'recipient_user_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sent_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying notifications by type
    this.notificationsTable.addGlobalSecondaryIndex({
      indexName: 'type-index',
      partitionKey: {
        name: 'notification_type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sent_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for notifications table
    cdk.Tags.of(this.notificationsTable).add('Purpose', 'NotificationTracking');
    cdk.Tags.of(this.notificationsTable).add('DataClassification', 'Internal');

    // Create Notification Preferences Table
    this.preferencesTable = new dynamodb.Table(this, 'PreferencesTable', {
      tableName: `ai-agent-notification-preferences-${props.stage}`,
      partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      pointInTimeRecovery: true,
      deletionProtection: props.stage === 'prod',
      removalPolicy: props.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Add GSI for querying preferences by team
    this.preferencesTable.addGlobalSecondaryIndex({
      indexName: 'team-index',
      partitionKey: {
        name: 'team_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for preferences table
    cdk.Tags.of(this.preferencesTable).add('Purpose', 'UserPreferences');
    cdk.Tags.of(this.preferencesTable).add('DataClassification', 'Internal');

    // Create EventBridge Event Bus for work task events
    this.eventBus = new events.EventBus(this, 'WorkTaskEventBus', {
      eventBusName: `ai-agent-work-task-events-${props.stage}`,
    });

    // Create EventBridge Rules for different notification triggers

    // Rule for task status changes
    const taskStatusChangeRule = new events.Rule(this, 'TaskStatusChangeRule', {
      eventBus: this.eventBus,
      ruleName: `ai-agent-task-status-change-${props.stage}`,
      description: 'Trigger notifications when task status changes',
      eventPattern: {
        source: ['work-task-system'],
        detailType: ['Task Status Changed'],
      },
    });
    taskStatusChangeRule.addTarget(new targets.LambdaFunction(props.notificationHandler));

    // Rule for quality check completion
    const qualityCheckRule = new events.Rule(this, 'QualityCheckCompleteRule', {
      eventBus: this.eventBus,
      ruleName: `ai-agent-quality-check-complete-${props.stage}`,
      description: 'Trigger notifications when quality checks complete',
      eventPattern: {
        source: ['work-task-system'],
        detailType: ['Quality Check Complete'],
      },
    });
    qualityCheckRule.addTarget(new targets.LambdaFunction(props.notificationHandler));

    // Rule for progress milestones
    const progressMilestoneRule = new events.Rule(this, 'ProgressMilestoneRule', {
      eventBus: this.eventBus,
      ruleName: `ai-agent-progress-milestone-${props.stage}`,
      description: 'Trigger notifications for progress milestones',
      eventPattern: {
        source: ['work-task-system'],
        detailType: ['Progress Milestone'],
      },
    });
    progressMilestoneRule.addTarget(new targets.LambdaFunction(props.notificationHandler));

    // Rule for delayed task detection
    const delayedTaskRule = new events.Rule(this, 'DelayedTaskRule', {
      eventBus: this.eventBus,
      ruleName: `ai-agent-delayed-task-${props.stage}`,
      description: 'Trigger notifications for delayed tasks',
      eventPattern: {
        source: ['work-task-system'],
        detailType: ['Delayed Task Detected'],
      },
    });
    delayedTaskRule.addTarget(new targets.LambdaFunction(props.notificationHandler));

    // Scheduled rule for checking due dates (runs every hour)
    const dueDateCheckRule = new events.Rule(this, 'DueDateCheckRule', {
      ruleName: `ai-agent-due-date-check-${props.stage}`,
      description: 'Check for tasks due soon and send reminders',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });
    dueDateCheckRule.addTarget(new targets.LambdaFunction(props.notificationHandler));

    // Create CloudWatch alarms for monitoring
    this.createCloudWatchAlarms(props.stage);

    // Output resource information
    new cdk.CfnOutput(this, 'NotificationsTableName', {
      value: this.notificationsTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-NotificationsTableName`,
    });

    new cdk.CfnOutput(this, 'PreferencesTableName', {
      value: this.preferencesTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-PreferencesTableName`,
    });

    new cdk.CfnOutput(this, 'ReminderQueueUrl', {
      value: this.reminderQueue.queueUrl,
      exportName: `${cdk.Stack.of(this).stackName}-ReminderQueueUrl`,
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      exportName: `${cdk.Stack.of(this).stackName}-EventBusName`,
    });
  }

  private createCloudWatchAlarms(stage: string): void {
    // Alarm for DLQ messages
    new cdk.aws_cloudwatch.Alarm(this, 'ReminderDLQAlarm', {
      alarmName: `ai-agent-${stage}-reminder-dlq-messages`,
      alarmDescription: 'Alert when messages appear in reminder DLQ',
      metric: this.reminderDLQ.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for queue age
    new cdk.aws_cloudwatch.Alarm(this, 'ReminderQueueAgeAlarm', {
      alarmName: `ai-agent-${stage}-reminder-queue-age`,
      alarmDescription: 'Alert when messages are too old in reminder queue',
      metric: this.reminderQueue.metricApproximateAgeOfOldestMessage(),
      threshold: 3600, // 1 hour
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for notifications table throttling
    new cdk.aws_cloudwatch.Alarm(this, 'NotificationsTableThrottleAlarm', {
      alarmName: `ai-agent-${stage}-notifications-throttle`,
      alarmDescription: 'DynamoDB throttling detected for notifications table',
      metric: this.notificationsTable.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.QUERY],
        statistic: cdk.aws_cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
