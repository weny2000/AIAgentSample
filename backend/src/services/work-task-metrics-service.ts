/**
 * Work Task Business Metrics Service
 * Tracks and monitors business metrics for the work task analysis system
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { Logger } from '../lambda/utils/logger';

export interface TaskSubmissionMetrics {
  taskId: string;
  teamId: string;
  submittedBy: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  submittedAt: Date;
}

export interface TaskCompletionMetrics {
  taskId: string;
  teamId: string;
  completedAt: Date;
  totalTodos: number;
  completedTodos: number;
  analysisTime: number; // milliseconds
  processingTime: number; // milliseconds
}

export interface QualityCheckMetrics {
  taskId: string;
  todoId: string;
  deliverableId: string;
  teamId: string;
  passed: boolean;
  qualityScore: number; // 0-100
  checkDuration: number; // milliseconds
  issuesFound: number;
  criticalIssues: number;
}

export interface UserSatisfactionMetrics {
  taskId: string;
  userId: string;
  teamId: string;
  rating: number; // 1-5
  feedbackProvided: boolean;
  featureUsed: string;
}

export interface SystemPerformanceMetrics {
  operation: string;
  duration: number; // milliseconds
  success: boolean;
  errorType?: string;
  resourceUsage?: {
    memoryUsed?: number;
    cpuTime?: number;
  };
}

export interface UsageMetrics {
  userId: string;
  teamId: string;
  feature: string;
  timestamp: Date;
  sessionDuration?: number;
}

export class WorkTaskMetricsService {
  private cloudWatchClient: CloudWatchClient;
  private readonly namespace = 'AiAgent/WorkTask';
  private readonly batchSize = 20; // CloudWatch limit

  constructor(private logger: Logger) {
    this.cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Record task submission metrics
   */
  async recordTaskSubmission(metrics: TaskSubmissionMetrics): Promise<void> {
    try {
      const metricData: MetricDatum[] = [
        {
          MetricName: 'TasksSubmitted',
          Value: 1,
          Unit: 'Count',
          Timestamp: metrics.submittedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
            { Name: 'Priority', Value: metrics.priority },
          ],
        },
        {
          MetricName: 'TasksSubmittedByCategory',
          Value: 1,
          Unit: 'Count',
          Timestamp: metrics.submittedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
            { Name: 'Category', Value: metrics.category || 'Uncategorized' },
          ],
        },
        {
          MetricName: 'TasksSubmittedByUser',
          Value: 1,
          Unit: 'Count',
          Timestamp: metrics.submittedAt,
          Dimensions: [
            { Name: 'UserId', Value: metrics.submittedBy },
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
      ];

      await this.putMetrics(metricData);

      this.logger.businessMetric('TaskSubmitted', 1, {
        TeamId: metrics.teamId,
        Priority: metrics.priority,
        Category: metrics.category || 'Uncategorized',
      });

    } catch (error) {
      this.logger.error('Failed to record task submission metrics', error as Error);
    }
  }

  /**
   * Record task completion metrics
   */
  async recordTaskCompletion(metrics: TaskCompletionMetrics): Promise<void> {
    try {
      const completionRate = metrics.totalTodos > 0 
        ? (metrics.completedTodos / metrics.totalTodos) * 100 
        : 0;

      const metricData: MetricDatum[] = [
        {
          MetricName: 'TasksCompleted',
          Value: 1,
          Unit: 'Count',
          Timestamp: metrics.completedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'TaskCompletionRate',
          Value: completionRate,
          Unit: 'Percent',
          Timestamp: metrics.completedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'TaskAnalysisTime',
          Value: metrics.analysisTime,
          Unit: 'Milliseconds',
          Timestamp: metrics.completedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'TaskProcessingTime',
          Value: metrics.processingTime,
          Unit: 'Milliseconds',
          Timestamp: metrics.completedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'TodoItemsCompleted',
          Value: metrics.completedTodos,
          Unit: 'Count',
          Timestamp: metrics.completedAt,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
      ];

      await this.putMetrics(metricData);

      this.logger.businessMetric('TaskCompleted', 1, {
        TeamId: metrics.teamId,
        CompletionRate: completionRate.toFixed(2),
      });

    } catch (error) {
      this.logger.error('Failed to record task completion metrics', error as Error);
    }
  }

  /**
   * Record quality check metrics
   */
  async recordQualityCheck(metrics: QualityCheckMetrics): Promise<void> {
    try {
      const metricData: MetricDatum[] = [
        {
          MetricName: 'QualityChecksPerformed',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
            { Name: 'Result', Value: metrics.passed ? 'Passed' : 'Failed' },
          ],
        },
        {
          MetricName: 'QualityCheckPassRate',
          Value: metrics.passed ? 100 : 0,
          Unit: 'Percent',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'QualityScore',
          Value: metrics.qualityScore,
          Unit: 'None',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'QualityCheckDuration',
          Value: metrics.checkDuration,
          Unit: 'Milliseconds',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'IssuesFound',
          Value: metrics.issuesFound,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
            { Name: 'Severity', Value: 'All' },
          ],
        },
      ];

      if (metrics.criticalIssues > 0) {
        metricData.push({
          MetricName: 'CriticalIssuesFound',
          Value: metrics.criticalIssues,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        });
      }

      await this.putMetrics(metricData);

      this.logger.businessMetric('QualityCheckCompleted', 1, {
        TeamId: metrics.teamId,
        Result: metrics.passed ? 'Passed' : 'Failed',
        QualityScore: metrics.qualityScore.toFixed(2),
      });

    } catch (error) {
      this.logger.error('Failed to record quality check metrics', error as Error);
    }
  }

  /**
   * Record user satisfaction metrics
   */
  async recordUserSatisfaction(metrics: UserSatisfactionMetrics): Promise<void> {
    try {
      const metricData: MetricDatum[] = [
        {
          MetricName: 'UserSatisfactionRating',
          Value: metrics.rating,
          Unit: 'None',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
            { Name: 'Feature', Value: metrics.featureUsed },
          ],
        },
        {
          MetricName: 'FeedbackProvided',
          Value: metrics.feedbackProvided ? 1 : 0,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
      ];

      await this.putMetrics(metricData);

      this.logger.businessMetric('UserSatisfactionRecorded', 1, {
        TeamId: metrics.teamId,
        Rating: metrics.rating.toString(),
        Feature: metrics.featureUsed,
      });

    } catch (error) {
      this.logger.error('Failed to record user satisfaction metrics', error as Error);
    }
  }

  /**
   * Record system performance metrics
   */
  async recordSystemPerformance(metrics: SystemPerformanceMetrics): Promise<void> {
    try {
      const metricData: MetricDatum[] = [
        {
          MetricName: 'OperationDuration',
          Value: metrics.duration,
          Unit: 'Milliseconds',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'Operation', Value: metrics.operation },
            { Name: 'Success', Value: metrics.success.toString() },
          ],
        },
        {
          MetricName: metrics.success ? 'OperationSuccess' : 'OperationFailure',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'Operation', Value: metrics.operation },
          ],
        },
      ];

      if (!metrics.success && metrics.errorType) {
        metricData.push({
          MetricName: 'ErrorRate',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'Operation', Value: metrics.operation },
            { Name: 'ErrorType', Value: metrics.errorType },
          ],
        });
      }

      if (metrics.resourceUsage?.memoryUsed) {
        metricData.push({
          MetricName: 'MemoryUsage',
          Value: metrics.resourceUsage.memoryUsed,
          Unit: 'Bytes',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'Operation', Value: metrics.operation },
          ],
        });
      }

      await this.putMetrics(metricData);

    } catch (error) {
      this.logger.error('Failed to record system performance metrics', error as Error);
    }
  }

  /**
   * Record usage metrics
   */
  async recordUsage(metrics: UsageMetrics): Promise<void> {
    try {
      const metricData: MetricDatum[] = [
        {
          MetricName: 'FeatureUsage',
          Value: 1,
          Unit: 'Count',
          Timestamp: metrics.timestamp,
          Dimensions: [
            { Name: 'Feature', Value: metrics.feature },
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
        {
          MetricName: 'ActiveUsers',
          Value: 1,
          Unit: 'Count',
          Timestamp: metrics.timestamp,
          Dimensions: [
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        },
      ];

      if (metrics.sessionDuration) {
        metricData.push({
          MetricName: 'SessionDuration',
          Value: metrics.sessionDuration,
          Unit: 'Seconds',
          Timestamp: metrics.timestamp,
          Dimensions: [
            { Name: 'Feature', Value: metrics.feature },
            { Name: 'TeamId', Value: metrics.teamId },
          ],
        });
      }

      await this.putMetrics(metricData);

    } catch (error) {
      this.logger.error('Failed to record usage metrics', error as Error);
    }
  }

  /**
   * Calculate and record aggregate metrics
   */
  async recordAggregateMetrics(
    teamId: string,
    period: 'hourly' | 'daily' | 'weekly',
    data: {
      totalSubmissions: number;
      totalCompletions: number;
      averageCompletionTime: number;
      averageQualityScore: number;
      totalQualityChecks: number;
      qualityCheckPassCount: number;
      averageUserSatisfaction: number;
      totalErrors: number;
      averageResponseTime: number;
    }
  ): Promise<void> {
    try {
      const successRate = data.totalSubmissions > 0
        ? (data.totalCompletions / data.totalSubmissions) * 100
        : 0;

      const qualityPassRate = data.totalQualityChecks > 0
        ? (data.qualityCheckPassCount / data.totalQualityChecks) * 100
        : 0;

      const errorRate = data.totalSubmissions > 0
        ? (data.totalErrors / data.totalSubmissions) * 100
        : 0;

      const metricData: MetricDatum[] = [
        {
          MetricName: 'TaskSuccessRate',
          Value: successRate,
          Unit: 'Percent',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
        {
          MetricName: 'AverageCompletionTime',
          Value: data.averageCompletionTime,
          Unit: 'Milliseconds',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
        {
          MetricName: 'AverageQualityScore',
          Value: data.averageQualityScore,
          Unit: 'None',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
        {
          MetricName: 'QualityCheckPassRate',
          Value: qualityPassRate,
          Unit: 'Percent',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
        {
          MetricName: 'AverageUserSatisfaction',
          Value: data.averageUserSatisfaction,
          Unit: 'None',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
        {
          MetricName: 'SystemErrorRate',
          Value: errorRate,
          Unit: 'Percent',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
        {
          MetricName: 'AverageResponseTime',
          Value: data.averageResponseTime,
          Unit: 'Milliseconds',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'TeamId', Value: teamId },
            { Name: 'Period', Value: period },
          ],
        },
      ];

      await this.putMetrics(metricData);

      this.logger.info('Aggregate metrics recorded', {
        teamId,
        period,
        successRate: successRate.toFixed(2),
        qualityPassRate: qualityPassRate.toFixed(2),
        errorRate: errorRate.toFixed(2),
      });

    } catch (error) {
      this.logger.error('Failed to record aggregate metrics', error as Error);
    }
  }

  /**
   * Helper method to put metrics to CloudWatch
   */
  private async putMetrics(metricData: MetricDatum[]): Promise<void> {
    try {
      // Process metrics in batches
      for (let i = 0; i < metricData.length; i += this.batchSize) {
        const batch = metricData.slice(i, i + this.batchSize);

        await this.cloudWatchClient.send(
          new PutMetricDataCommand({
            Namespace: this.namespace,
            MetricData: batch,
          })
        );
      }

      this.logger.debug('Metrics sent to CloudWatch', {
        namespace: this.namespace,
        metricsCount: metricData.length,
      });

    } catch (error) {
      this.logger.error('Failed to send metrics to CloudWatch', error as Error);
      throw error;
    }
  }
}
