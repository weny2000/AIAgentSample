import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface DynamoDBTablesProps {
  stage: string;
  kmsKey: kms.Key;
}

export class DynamoDBTables extends Construct {
  public readonly teamRosterTable: dynamodb.Table;
  public readonly artifactTemplatesTable: dynamodb.Table;
  public readonly auditLogTable: dynamodb.Table;
  public readonly jobStatusTable: dynamodb.Table;
  public readonly ruleDefinitionsTable: dynamodb.Table;
  public readonly personaConfigTable: dynamodb.Table;
  
  // Work Task Analysis System Tables
  public readonly workTasksTable: dynamodb.Table;
  public readonly todoItemsTable: dynamodb.Table;
  public readonly deliverablesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBTablesProps) {
    super(scope, id);

    // Team Roster Table
    // Single table design with team_id as partition key
    this.teamRosterTable = new dynamodb.Table(this, 'TeamRosterTable', {
      tableName: `ai-agent-team-roster-${props.stage}`,
      partitionKey: {
        name: 'pk',
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

    // Add tags for team roster table
    cdk.Tags.of(this.teamRosterTable).add('Purpose', 'TeamManagement');
    cdk.Tags.of(this.teamRosterTable).add('DataClassification', 'Internal');

    // Artifact Templates Table
    // Single table design with artifact_type as partition key
    this.artifactTemplatesTable = new dynamodb.Table(this, 'ArtifactTemplatesTable', {
      tableName: `ai-agent-artifact-templates-${props.stage}`,
      partitionKey: {
        name: 'pk',
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

    // Add GSI for querying templates by version
    this.artifactTemplatesTable.addGlobalSecondaryIndex({
      indexName: 'version-index',
      partitionKey: {
        name: 'version',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'artifact_type',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for artifact templates table
    cdk.Tags.of(this.artifactTemplatesTable).add('Purpose', 'ArtifactValidation');
    cdk.Tags.of(this.artifactTemplatesTable).add('DataClassification', 'Internal');

    // Audit Log Table
    // Composite key design with request_id as partition key and timestamp as sort key
    this.auditLogTable = new dynamodb.Table(this, 'AuditLogTable', {
      tableName: `ai-agent-audit-log-${props.stage}`,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      pointInTimeRecovery: true,
      deletionProtection: true, // Always protect audit logs
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Always retain audit logs
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
    });

    // Add GSI for querying audit logs by user_id
    this.auditLogTable.addGlobalSecondaryIndex({
      indexName: 'user-index',
      partitionKey: {
        name: 'gsi1pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'gsi1sk',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying audit logs by action type
    this.auditLogTable.addGlobalSecondaryIndex({
      indexName: 'action-index',
      partitionKey: {
        name: 'action',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for audit log table
    cdk.Tags.of(this.auditLogTable).add('Purpose', 'AuditCompliance');
    cdk.Tags.of(this.auditLogTable).add('DataClassification', 'Confidential');
    cdk.Tags.of(this.auditLogTable).add('RetentionPeriod', '7Years');

    // Job Status Table
    // Single table design with jobId as partition key for tracking workflow execution status
    this.jobStatusTable = new dynamodb.Table(this, 'JobStatusTable', {
      tableName: `ai-agent-job-status-${props.stage}`,
      partitionKey: {
        name: 'jobId',
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

    // Add GSI for querying jobs by user
    this.jobStatusTable.addGlobalSecondaryIndex({
      indexName: 'user-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying jobs by status
    this.jobStatusTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for job status table
    cdk.Tags.of(this.jobStatusTable).add('Purpose', 'WorkflowTracking');
    cdk.Tags.of(this.jobStatusTable).add('DataClassification', 'Internal');

    // Rule Definitions Table
    // Single table design with rule id as partition key
    this.ruleDefinitionsTable = new dynamodb.Table(this, 'RuleDefinitionsTable', {
      tableName: `ai-agent-rule-definitions-${props.stage}`,
      partitionKey: {
        name: 'id',
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

    // Add GSI for querying rules by type
    this.ruleDefinitionsTable.addGlobalSecondaryIndex({
      indexName: 'type-index',
      partitionKey: {
        name: 'type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'severity',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying rules by enabled status
    this.ruleDefinitionsTable.addGlobalSecondaryIndex({
      indexName: 'enabled-index',
      partitionKey: {
        name: 'enabled',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for rule definitions table
    cdk.Tags.of(this.ruleDefinitionsTable).add('Purpose', 'RulesEngine');
    cdk.Tags.of(this.ruleDefinitionsTable).add('DataClassification', 'Internal');

    // Persona Configuration Table
    // Single table design with persona id as partition key
    this.personaConfigTable = new dynamodb.Table(this, 'PersonaConfigTable', {
      tableName: `ai-agent-persona-config-${props.stage}`,
      partitionKey: {
        name: 'id',
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

    // Add GSI for querying personas by leader
    this.personaConfigTable.addGlobalSecondaryIndex({
      indexName: 'leader-index',
      partitionKey: {
        name: 'leader_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying personas by team
    this.personaConfigTable.addGlobalSecondaryIndex({
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

    // Add GSI for querying active personas
    this.personaConfigTable.addGlobalSecondaryIndex({
      indexName: 'active-index',
      partitionKey: {
        name: 'is_active',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for persona config table
    cdk.Tags.of(this.personaConfigTable).add('Purpose', 'PersonaManagement');
    cdk.Tags.of(this.personaConfigTable).add('DataClassification', 'Internal');

    // Work Tasks Table
    // Composite key design with task_id as partition key and created_at as sort key
    this.workTasksTable = new dynamodb.Table(this, 'WorkTasksTable', {
      tableName: `ai-agent-work-tasks-${props.stage}`,
      partitionKey: {
        name: 'task_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
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

    // Add GSI for querying work tasks by team
    this.workTasksTable.addGlobalSecondaryIndex({
      indexName: 'team-index',
      partitionKey: {
        name: 'team_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying work tasks by status
    this.workTasksTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying work tasks by submitter
    this.workTasksTable.addGlobalSecondaryIndex({
      indexName: 'submitter-index',
      partitionKey: {
        name: 'submitted_by',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for work tasks table
    cdk.Tags.of(this.workTasksTable).add('Purpose', 'WorkTaskAnalysis');
    cdk.Tags.of(this.workTasksTable).add('DataClassification', 'Internal');

    // Todo Items Table
    // Composite key design with todo_id as partition key and task_id as sort key
    this.todoItemsTable = new dynamodb.Table(this, 'TodoItemsTable', {
      tableName: `ai-agent-todo-items-${props.stage}`,
      partitionKey: {
        name: 'todo_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'task_id',
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

    // Add GSI for querying todo items by task
    this.todoItemsTable.addGlobalSecondaryIndex({
      indexName: 'task-index',
      partitionKey: {
        name: 'task_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'priority',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying todo items by status
    this.todoItemsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying todo items by assignee
    this.todoItemsTable.addGlobalSecondaryIndex({
      indexName: 'assignee-index',
      partitionKey: {
        name: 'assigned_to',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'due_date',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for todo items table
    cdk.Tags.of(this.todoItemsTable).add('Purpose', 'WorkTaskAnalysis');
    cdk.Tags.of(this.todoItemsTable).add('DataClassification', 'Internal');

    // Deliverables Table
    // Composite key design with deliverable_id as partition key and todo_id as sort key
    this.deliverablesTable = new dynamodb.Table(this, 'DeliverablesTable', {
      tableName: `ai-agent-deliverables-${props.stage}`,
      partitionKey: {
        name: 'deliverable_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'todo_id',
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

    // Add GSI for querying deliverables by todo item
    this.deliverablesTable.addGlobalSecondaryIndex({
      indexName: 'todo-index',
      partitionKey: {
        name: 'todo_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'submitted_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying deliverables by status
    this.deliverablesTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'submitted_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying deliverables by submitter
    this.deliverablesTable.addGlobalSecondaryIndex({
      indexName: 'submitter-index',
      partitionKey: {
        name: 'submitted_by',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'submitted_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags for deliverables table
    cdk.Tags.of(this.deliverablesTable).add('Purpose', 'WorkTaskAnalysis');
    cdk.Tags.of(this.deliverablesTable).add('DataClassification', 'Internal');

    // Create CloudWatch alarms for monitoring
    this.createCloudWatchAlarms(props.stage);

    // Output table information
    new cdk.CfnOutput(this, 'TeamRosterTableName', {
      value: this.teamRosterTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-TeamRosterTableName`,
    });

    new cdk.CfnOutput(this, 'TeamRosterTableArn', {
      value: this.teamRosterTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-TeamRosterTableArn`,
    });

    new cdk.CfnOutput(this, 'ArtifactTemplatesTableName', {
      value: this.artifactTemplatesTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-ArtifactTemplatesTableName`,
    });

    new cdk.CfnOutput(this, 'ArtifactTemplatesTableArn', {
      value: this.artifactTemplatesTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-ArtifactTemplatesTableArn`,
    });

    new cdk.CfnOutput(this, 'AuditLogTableName', {
      value: this.auditLogTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-AuditLogTableName`,
    });

    new cdk.CfnOutput(this, 'AuditLogTableArn', {
      value: this.auditLogTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-AuditLogTableArn`,
    });

    new cdk.CfnOutput(this, 'JobStatusTableName', {
      value: this.jobStatusTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-JobStatusTableName`,
    });

    new cdk.CfnOutput(this, 'JobStatusTableArn', {
      value: this.jobStatusTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-JobStatusTableArn`,
    });

    new cdk.CfnOutput(this, 'RuleDefinitionsTableName', {
      value: this.ruleDefinitionsTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-RuleDefinitionsTableName`,
    });

    new cdk.CfnOutput(this, 'RuleDefinitionsTableArn', {
      value: this.ruleDefinitionsTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-RuleDefinitionsTableArn`,
    });

    new cdk.CfnOutput(this, 'PersonaConfigTableName', {
      value: this.personaConfigTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-PersonaConfigTableName`,
    });

    new cdk.CfnOutput(this, 'PersonaConfigTableArn', {
      value: this.personaConfigTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-PersonaConfigTableArn`,
    });

    new cdk.CfnOutput(this, 'WorkTasksTableName', {
      value: this.workTasksTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-WorkTasksTableName`,
    });

    new cdk.CfnOutput(this, 'WorkTasksTableArn', {
      value: this.workTasksTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-WorkTasksTableArn`,
    });

    new cdk.CfnOutput(this, 'TodoItemsTableName', {
      value: this.todoItemsTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-TodoItemsTableName`,
    });

    new cdk.CfnOutput(this, 'TodoItemsTableArn', {
      value: this.todoItemsTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-TodoItemsTableArn`,
    });

    new cdk.CfnOutput(this, 'DeliverablesTableName', {
      value: this.deliverablesTable.tableName,
      exportName: `${cdk.Stack.of(this).stackName}-DeliverablesTableName`,
    });

    new cdk.CfnOutput(this, 'DeliverablesTableArn', {
      value: this.deliverablesTable.tableArn,
      exportName: `${cdk.Stack.of(this).stackName}-DeliverablesTableArn`,
    });
  }

  private createCloudWatchAlarms(stage: string): void {
    // Create alarms for high error rates and throttling
    const tables = [
      { table: this.teamRosterTable, name: 'TeamRoster' },
      { table: this.artifactTemplatesTable, name: 'ArtifactTemplates' },
      { table: this.auditLogTable, name: 'AuditLog' },
      { table: this.jobStatusTable, name: 'JobStatus' },
      { table: this.ruleDefinitionsTable, name: 'RuleDefinitions' },
      { table: this.personaConfigTable, name: 'PersonaConfig' },
      { table: this.workTasksTable, name: 'WorkTasks' },
      { table: this.todoItemsTable, name: 'TodoItems' },
      { table: this.deliverablesTable, name: 'Deliverables' },
    ];

    tables.forEach(({ table, name }) => {
      // Throttling alarm
      new cdk.aws_cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
        alarmName: `ai-agent-${stage}-${name.toLowerCase()}-throttle`,
        alarmDescription: `DynamoDB throttling detected for ${name} table`,
        metric: table.metricThrottledRequestsForOperations({
          operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY],
          statistic: cdk.aws_cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 2,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // High error rate alarm
      new cdk.aws_cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `ai-agent-${stage}-${name.toLowerCase()}-errors`,
        alarmDescription: `High error rate detected for ${name} table`,
        metric: table.metricSystemErrorsForOperations({
          operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY],
          statistic: cdk.aws_cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    });
  }
}