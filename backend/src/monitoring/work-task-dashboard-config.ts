/**
 * CloudWatch Dashboard Configuration for Work Task Metrics
 */

export interface DashboardWidget {
  type: 'metric' | 'log' | 'text' | 'number';
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, any>;
}

export interface DashboardConfig {
  dashboardName: string;
  widgets: DashboardWidget[];
}

/**
 * Create CloudWatch Dashboard configuration for Work Task metrics
 */
export function createWorkTaskDashboard(region: string = 'us-east-1'): DashboardConfig {
  const namespace = 'AiAgent/WorkTask';

  return {
    dashboardName: 'WorkTaskAnalysisMetrics',
    widgets: [
      // Row 1: Task Submission and Completion Metrics
      {
        type: 'metric',
        x: 0,
        y: 0,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'TasksSubmitted', { stat: 'Sum', label: 'Tasks Submitted' }],
            ['.', 'TasksCompleted', { stat: 'Sum', label: 'Tasks Completed' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Task Submission and Completion',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 8,
        y: 0,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'TaskCompletionRate', { stat: 'Average', label: 'Completion Rate' }],
            ['.', 'TaskSuccessRate', { stat: 'Average', label: 'Success Rate' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Task Success Metrics',
          period: 300,
          yAxis: {
            left: {
              label: 'Percent',
              showUnits: false,
              min: 0,
              max: 100,
            },
          },
        },
      },
      {
        type: 'number',
        x: 16,
        y: 0,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'TasksSubmitted', { stat: 'Sum', label: 'Total Submissions (24h)' }],
          ],
          region,
          title: 'Tasks Submitted (24h)',
          period: 86400,
        },
      },

      // Row 2: Quality Check Metrics
      {
        type: 'metric',
        x: 0,
        y: 6,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'QualityChecksPerformed', { stat: 'Sum', label: 'Total Checks' }],
            ['.', 'QualityChecksPerformed', { stat: 'Sum', label: 'Passed', dimensions: { Result: 'Passed' } }],
            ['.', 'QualityChecksPerformed', { stat: 'Sum', label: 'Failed', dimensions: { Result: 'Failed' } }],
          ],
          view: 'timeSeries',
          stacked: true,
          region,
          title: 'Quality Checks Performed',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 8,
        y: 6,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'QualityCheckPassRate', { stat: 'Average', label: 'Pass Rate' }],
            ['.', 'QualityScore', { stat: 'Average', label: 'Avg Quality Score' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Quality Metrics',
          period: 300,
          yAxis: {
            left: {
              label: 'Score/Percent',
              showUnits: false,
              min: 0,
              max: 100,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 16,
        y: 6,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'IssuesFound', { stat: 'Sum', label: 'Total Issues' }],
            ['.', 'CriticalIssuesFound', { stat: 'Sum', label: 'Critical Issues' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Issues Detected',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },

      // Row 3: Performance Metrics
      {
        type: 'metric',
        x: 0,
        y: 12,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'TaskAnalysisTime', { stat: 'Average', label: 'Avg Analysis Time' }],
            ['.', 'TaskProcessingTime', { stat: 'Average', label: 'Avg Processing Time' }],
            ['.', 'QualityCheckDuration', { stat: 'Average', label: 'Avg Check Duration' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Processing Times',
          period: 300,
          yAxis: {
            left: {
              label: 'Milliseconds',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 8,
        y: 12,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'OperationDuration', { stat: 'Average', label: 'Avg Duration' }],
            ['.', 'OperationDuration', { stat: 'p99', label: 'P99 Duration' }],
            ['.', 'AverageResponseTime', { stat: 'Average', label: 'Avg Response Time' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'System Performance',
          period: 300,
          yAxis: {
            left: {
              label: 'Milliseconds',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 16,
        y: 12,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'OperationSuccess', { stat: 'Sum', label: 'Successful Operations' }],
            ['.', 'OperationFailure', { stat: 'Sum', label: 'Failed Operations' }],
          ],
          view: 'timeSeries',
          stacked: true,
          region,
          title: 'Operation Success/Failure',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },

      // Row 4: Error and User Metrics
      {
        type: 'metric',
        x: 0,
        y: 18,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'ErrorRate', { stat: 'Sum', label: 'Total Errors' }],
            ['.', 'SystemErrorRate', { stat: 'Average', label: 'Error Rate %' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Error Metrics',
          period: 300,
          yAxis: {
            left: {
              label: 'Count/Percent',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 8,
        y: 18,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'UserSatisfactionRating', { stat: 'Average', label: 'Avg Rating' }],
            ['.', 'AverageUserSatisfaction', { stat: 'Average', label: 'Avg Satisfaction' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'User Satisfaction',
          period: 300,
          yAxis: {
            left: {
              label: 'Rating (1-5)',
              showUnits: false,
              min: 0,
              max: 5,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 16,
        y: 18,
        width: 8,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'FeatureUsage', { stat: 'Sum', label: 'Feature Usage' }],
            ['.', 'ActiveUsers', { stat: 'Sum', label: 'Active Users' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Usage Metrics',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },

      // Row 5: Todo and Deliverable Metrics
      {
        type: 'metric',
        x: 0,
        y: 24,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'TodoItemsCompleted', { stat: 'Sum', label: 'Todos Completed' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Todo Items Completed',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 12,
        y: 24,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'FeedbackProvided', { stat: 'Sum', label: 'Feedback Count' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'User Feedback',
          period: 300,
          yAxis: {
            left: {
              label: 'Count',
              showUnits: false,
            },
          },
        },
      },

      // Row 6: Resource Usage
      {
        type: 'metric',
        x: 0,
        y: 30,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'MemoryUsage', { stat: 'Average', label: 'Avg Memory Usage' }],
            ['.', 'MemoryUsage', { stat: 'Maximum', label: 'Max Memory Usage' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Memory Usage',
          period: 300,
          yAxis: {
            left: {
              label: 'Bytes',
              showUnits: false,
            },
          },
        },
      },
      {
        type: 'metric',
        x: 12,
        y: 30,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            [namespace, 'SessionDuration', { stat: 'Average', label: 'Avg Session Duration' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Session Duration',
          period: 300,
          yAxis: {
            left: {
              label: 'Seconds',
              showUnits: false,
            },
          },
        },
      },
    ],
  };
}

/**
 * Create alarm configurations for critical metrics
 */
export interface AlarmConfig {
  alarmName: string;
  metricName: string;
  namespace: string;
  statistic: string;
  period: number;
  evaluationPeriods: number;
  threshold: number;
  comparisonOperator: string;
  treatMissingData: string;
  alarmDescription: string;
  dimensions?: Record<string, string>;
}

export function createWorkTaskAlarms(): AlarmConfig[] {
  const namespace = 'AiAgent/WorkTask';

  return [
    {
      alarmName: 'WorkTask-HighErrorRate',
      metricName: 'SystemErrorRate',
      namespace,
      statistic: 'Average',
      period: 300,
      evaluationPeriods: 2,
      threshold: 5, // 5% error rate
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when error rate exceeds 5% for 10 minutes',
    },
    {
      alarmName: 'WorkTask-SlowAnalysisTime',
      metricName: 'TaskAnalysisTime',
      namespace,
      statistic: 'Average',
      period: 300,
      evaluationPeriods: 3,
      threshold: 180000, // 3 minutes in milliseconds
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average analysis time exceeds 3 minutes for 15 minutes',
    },
    {
      alarmName: 'WorkTask-LowQualityPassRate',
      metricName: 'QualityCheckPassRate',
      namespace,
      statistic: 'Average',
      period: 900,
      evaluationPeriods: 2,
      threshold: 70, // 70% pass rate
      comparisonOperator: 'LessThanThreshold',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when quality check pass rate falls below 70% for 30 minutes',
    },
    {
      alarmName: 'WorkTask-HighCriticalIssues',
      metricName: 'CriticalIssuesFound',
      namespace,
      statistic: 'Sum',
      period: 300,
      evaluationPeriods: 1,
      threshold: 10,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when more than 10 critical issues are found in 5 minutes',
    },
    {
      alarmName: 'WorkTask-LowUserSatisfaction',
      metricName: 'AverageUserSatisfaction',
      namespace,
      statistic: 'Average',
      period: 3600,
      evaluationPeriods: 2,
      threshold: 3.0, // Rating below 3.0
      comparisonOperator: 'LessThanThreshold',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average user satisfaction falls below 3.0 for 2 hours',
    },
    {
      alarmName: 'WorkTask-HighResponseTime',
      metricName: 'AverageResponseTime',
      namespace,
      statistic: 'Average',
      period: 300,
      evaluationPeriods: 3,
      threshold: 5000, // 5 seconds
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average response time exceeds 5 seconds for 15 minutes',
    },
  ];
}

/**
 * Generate CloudWatch Dashboard JSON
 */
export function generateDashboardJson(config: DashboardConfig): string {
  return JSON.stringify({
    widgets: config.widgets,
  });
}