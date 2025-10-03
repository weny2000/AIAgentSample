import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface MonitoringProps {
  stage: string;
  kmsKey: kms.Key;
  lambdaFunctions: lambda.Function[];
  alertEmail?: string;
  slackWebhookUrl?: string;
}

export class Monitoring extends Construct {
  public readonly alertTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly logGroups: logs.LogGroup[];
  public readonly alarms: cloudwatch.Alarm[];

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `ai-agent-alerts-${props.stage}`,
      displayName: `AI Agent System Alerts (${props.stage})`,
      masterKey: props.kmsKey,
    });

    // Add email subscription if provided
    if (props.alertEmail) {
      this.alertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create Slack notification Lambda if webhook URL is provided
    if (props.slackWebhookUrl) {
      this.createSlackNotificationLambda(props.slackWebhookUrl, props.stage, props.kmsKey);
    }

    // Create CloudWatch Log Groups with structured logging
    this.logGroups = this.createLogGroups(props.lambdaFunctions, props.stage, props.kmsKey);

    // Create CloudWatch Dashboard
    this.dashboard = this.createDashboard(props.stage, props.lambdaFunctions);

    // Create CloudWatch Alarms
    this.alarms = this.createAlarms(props.stage, props.lambdaFunctions);

    // Create custom metrics and insights queries
    this.createCustomMetrics(props.stage);

    // Output monitoring resources
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      exportName: `${cdk.Stack.of(this).stackName}-AlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.dashboard.dashboardName}`,
      exportName: `${cdk.Stack.of(this).stackName}-DashboardUrl`,
    });
  }

  private createSlackNotificationLambda(
    webhookUrl: string,
    stage: string,
    kmsKey: kms.Key
  ): lambda.Function {
    const slackNotificationFunction = new lambda.Function(this, 'SlackNotificationFunction', {
      functionName: `ai-agent-slack-notification-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'slack-notification.handler',
      code: lambda.Code.fromInline(`
        const https = require('https');
        const url = require('url');

        exports.handler = async (event) => {
          console.log('Received SNS event:', JSON.stringify(event, null, 2));
          
          for (const record of event.Records) {
            if (record.Sns) {
              const message = JSON.parse(record.Sns.Message);
              const subject = record.Sns.Subject || 'AI Agent Alert';
              
              const slackMessage = {
                text: subject,
                attachments: [{
                  color: message.NewStateValue === 'ALARM' ? 'danger' : 'good',
                  fields: [
                    {
                      title: 'Alarm Name',
                      value: message.AlarmName,
                      short: true
                    },
                    {
                      title: 'State',
                      value: message.NewStateValue,
                      short: true
                    },
                    {
                      title: 'Reason',
                      value: message.NewStateReason,
                      short: false
                    },
                    {
                      title: 'Timestamp',
                      value: message.StateChangeTime,
                      short: true
                    }
                  ]
                }]
              };

              await sendToSlack(slackMessage);
            }
          }
        };

        function sendToSlack(message) {
          return new Promise((resolve, reject) => {
            const webhookUrl = process.env.SLACK_WEBHOOK_URL;
            const parsedUrl = url.parse(webhookUrl);
            
            const postData = JSON.stringify(message);
            
            const options = {
              hostname: parsedUrl.hostname,
              port: 443,
              path: parsedUrl.path,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              }
            };

            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                if (res.statusCode === 200) {
                  resolve(data);
                } else {
                  reject(new Error(\`HTTP \${res.statusCode}: \${data}\`));
                }
              });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
          });
        }
      `),
      environment: {
        SLACK_WEBHOOK_URL: webhookUrl,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant KMS permissions
    kmsKey.grantDecrypt(slackNotificationFunction);

    // Subscribe to SNS topic
    this.alertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(slackNotificationFunction)
    );

    return slackNotificationFunction;
  }

  private createLogGroups(
    lambdaFunctions: lambda.Function[],
    stage: string,
    kmsKey: kms.Key
  ): logs.LogGroup[] {
    const logGroups: logs.LogGroup[] = [];

    // Create log groups for each Lambda function with enhanced configuration
    lambdaFunctions.forEach((func, index) => {
      const logGroup = new logs.LogGroup(this, `LogGroup${index}`, {
        logGroupName: `/aws/lambda/${func.functionName}`,
        retention: stage === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Create metric filters for structured logging
      this.createMetricFilters(logGroup, func.functionName);

      logGroups.push(logGroup);
    });

    // Create application-level log group for custom metrics
    const appLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: `/ai-agent/${stage}/application`,
      retention: stage === 'prod' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,
      encryptionKey: kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    logGroups.push(appLogGroup);

    return logGroups;
  }

  private createMetricFilters(logGroup: logs.LogGroup, functionName: string): void {
    // Error count metric filter
    new logs.MetricFilter(this, `ErrorMetricFilter-${functionName}`, {
      logGroup,
      metricNamespace: 'AiAgent/Lambda',
      metricName: 'ErrorCount',
      filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'ERROR'),
      metricValue: '1',
      defaultValue: 0,
      dimensions: {
        FunctionName: functionName,
        ErrorType: '$.context.errorType',
      },
    });

    // Performance metric filter
    new logs.MetricFilter(this, `PerformanceMetricFilter-${functionName}`, {
      logGroup,
      metricNamespace: 'AiAgent/Lambda',
      metricName: 'Duration',
      filterPattern: logs.FilterPattern.exists('$.duration'),
      metricValue: '$.duration',
      dimensions: {
        FunctionName: functionName,
        Operation: '$.context.operation',
      },
    });

    // Retry metric filter
    new logs.MetricFilter(this, `RetryMetricFilter-${functionName}`, {
      logGroup,
      metricNamespace: 'AiAgent/Lambda',
      metricName: 'RetryAttempts',
      filterPattern: logs.FilterPattern.exists('$.retryAttempt'),
      metricValue: '$.retryAttempt',
      dimensions: {
        FunctionName: functionName,
        Operation: '$.context.operation',
      },
    });

    // Business metrics filter
    new logs.MetricFilter(this, `BusinessMetricFilter-${functionName}`, {
      logGroup,
      metricNamespace: 'AiAgent/Business',
      metricName: 'ArtifactChecks',
      filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'METRIC'),
      metricValue: '$.metricData.Value',
      dimensions: {
        MetricName: '$.metricData.MetricName',
        Operation: '$.metricData.Dimensions[0].Value',
      },
    });
  }

  private createDashboard(stage: string, lambdaFunctions: lambda.Function[]): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'AiAgentDashboard', {
      dashboardName: `ai-agent-${stage}`,
    });

    // System Overview Row
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# AI Agent System Dashboard (${stage.toUpperCase()})
        
This dashboard provides real-time monitoring of the AI Agent system components including Lambda functions, business metrics, and system health.`,
        width: 24,
        height: 2,
      })
    );

    // Lambda Functions Overview
    const lambdaMetrics = lambdaFunctions.map(func => [
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Invocations',
        dimensionsMap: { FunctionName: func.functionName },
        statistic: 'Sum',
      }),
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: { FunctionName: func.functionName },
        statistic: 'Sum',
      }),
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Duration',
        dimensionsMap: { FunctionName: func.functionName },
        statistic: 'Average',
      }),
    ]).flat();

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Function Invocations',
        left: lambdaMetrics.filter((_, i) => i % 3 === 0),
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Function Errors',
        left: lambdaMetrics.filter((_, i) => i % 3 === 1),
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Function Duration',
        left: lambdaMetrics.filter((_, i) => i % 3 === 2),
        width: 8,
        height: 6,
      })
    );

    // Business Metrics Row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Artifact Checks',
        left: [
          new cloudwatch.Metric({
            namespace: 'AiAgent/Business',
            metricName: 'ArtifactChecksStarted',
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Business',
            metricName: 'ArtifactChecksCompleted',
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Business',
            metricName: 'ArtifactChecksFailed',
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Compliance Metrics',
        left: [
          new cloudwatch.Metric({
            namespace: 'AiAgent/Business',
            metricName: 'ComplianceScoreAverage',
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Business',
            metricName: 'CriticalIssuesFound',
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Error Analysis Row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Error Types Distribution',
        left: [
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'ErrorCount',
            dimensionsMap: { ErrorType: 'ValidationError' },
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'ErrorCount',
            dimensionsMap: { ErrorType: 'AuthorizationError' },
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'ErrorCount',
            dimensionsMap: { ErrorType: 'ServiceError' },
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'ErrorCount',
            dimensionsMap: { ErrorType: 'TimeoutError' },
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Retry Patterns',
        left: [
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'RetryAttempts',
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'RetrySuccess',
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Performance Metrics Row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Operation Performance',
        left: [
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'OperationDuration',
            dimensionsMap: { Operation: 'artifact-check' },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'OperationDuration',
            dimensionsMap: { Operation: 'kendra-search' },
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AiAgent/Lambda',
            metricName: 'OperationDuration',
            dimensionsMap: { Operation: 'agent-query' },
            statistic: 'Average',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'System Health Score',
        metrics: [
          new cloudwatch.MathExpression({
            expression: '(m1 / (m1 + m2)) * 100',
            usingMetrics: {
              m1: new cloudwatch.Metric({
                namespace: 'AiAgent/Lambda',
                metricName: 'OperationSuccess',
                statistic: 'Sum',
              }),
              m2: new cloudwatch.Metric({
                namespace: 'AiAgent/Lambda',
                metricName: 'OperationFailure',
                statistic: 'Sum',
              }),
            },
            label: 'Success Rate %',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Average Processing Time',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AiAgent/Business',
            metricName: 'AverageProcessingTime',
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      })
    );

    return dashboard;
  }

  private createAlarms(stage: string, lambdaFunctions: lambda.Function[]): cloudwatch.Alarm[] {
    const alarms: cloudwatch.Alarm[] = [];

    // Create alarms for each Lambda function
    lambdaFunctions.forEach(func => {
      // Error rate alarm
      const errorAlarm = new cloudwatch.Alarm(this, `ErrorAlarm-${func.functionName}`, {
        alarmName: `ai-agent-${stage}-${func.functionName}-errors`,
        alarmDescription: `High error rate for ${func.functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: stage === 'prod' ? 5 : 10,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      errorAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
      alarms.push(errorAlarm);

      // Duration alarm
      const durationAlarm = new cloudwatch.Alarm(this, `DurationAlarm-${func.functionName}`, {
        alarmName: `ai-agent-${stage}-${func.functionName}-duration`,
        alarmDescription: `High duration for ${func.functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: func.timeout?.toMilliseconds() ? func.timeout.toMilliseconds() * 0.8 : 24000, // 80% of timeout
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      durationAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
      alarms.push(durationAlarm);

      // Throttle alarm
      const throttleAlarm = new cloudwatch.Alarm(this, `ThrottleAlarm-${func.functionName}`, {
        alarmName: `ai-agent-${stage}-${func.functionName}-throttles`,
        alarmDescription: `Throttling detected for ${func.functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Throttles',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      throttleAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
      alarms.push(throttleAlarm);
    });

    // Business metric alarms
    const criticalIssuesAlarm = new cloudwatch.Alarm(this, 'CriticalIssuesAlarm', {
      alarmName: `ai-agent-${stage}-critical-issues`,
      alarmDescription: 'High number of critical issues found in artifacts',
      metric: new cloudwatch.Metric({
        namespace: 'AiAgent/Business',
        metricName: 'CriticalIssuesFound',
        statistic: 'Sum',
        period: cdk.Duration.minutes(15),
      }),
      threshold: stage === 'prod' ? 10 : 20,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    criticalIssuesAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
    alarms.push(criticalIssuesAlarm);

    // Compliance score alarm
    const complianceAlarm = new cloudwatch.Alarm(this, 'ComplianceScoreAlarm', {
      alarmName: `ai-agent-${stage}-low-compliance`,
      alarmDescription: 'Low average compliance score',
      metric: new cloudwatch.Metric({
        namespace: 'AiAgent/Business',
        metricName: 'ComplianceScoreAverage',
        statistic: 'Average',
        period: cdk.Duration.minutes(30),
      }),
      threshold: stage === 'prod' ? 70 : 60,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    complianceAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
    alarms.push(complianceAlarm);

    return alarms;
  }

  private createCustomMetrics(stage: string): void {
    // Create CloudWatch Insights queries for common troubleshooting
    const insightsQueries = [
      {
        name: 'Error Analysis',
        query: `
          fields @timestamp, level, message, context.errorType, context.operation
          | filter level = "ERROR"
          | stats count() by context.errorType
          | sort count desc
        `,
      },
      {
        name: 'Performance Analysis',
        query: `
          fields @timestamp, duration, context.operation, context.userId
          | filter ispresent(duration)
          | stats avg(duration), max(duration), min(duration) by context.operation
          | sort avg desc
        `,
      },
      {
        name: 'User Activity',
        query: `
          fields @timestamp, context.userId, context.operation, context.teamId
          | filter ispresent(context.userId)
          | stats count() by context.userId, context.teamId
          | sort count desc
          | limit 20
        `,
      },
      {
        name: 'Retry Patterns',
        query: `
          fields @timestamp, retryAttempt, context.operation, message
          | filter ispresent(retryAttempt)
          | stats count() by context.operation, retryAttempt
          | sort retryAttempt, count desc
        `,
      },
    ];

    // Output the queries for reference
    insightsQueries.forEach((query, index) => {
      new cdk.CfnOutput(this, `InsightsQuery${index}`, {
        value: query.query.trim(),
        description: `CloudWatch Insights query for ${query.name}`,
      });
    });
  }
}