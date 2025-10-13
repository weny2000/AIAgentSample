/**
 * Work Task Metrics Repository
 * Stores and retrieves metrics data from DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Logger } from '../lambda/utils/logger';

export interface MetricsRecord {
  metric_id: string; // PK: {metric_type}#{team_id}#{timestamp}
  timestamp: string; // SK: ISO timestamp
  metric_type: 'submission' | 'completion' | 'quality_check' | 'satisfaction' | 'performance' | 'usage';
  team_id: string;
  user_id?: string;
  task_id?: string;
  todo_id?: string;
  deliverable_id?: string;
  
  // Metric-specific data
  data: Record<string, any>;
  
  // Aggregation fields
  period?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  aggregated?: boolean;
  
  created_at: string;
  ttl?: number; // Auto-expire old metrics
}

export interface MetricsQuery {
  metricType: string;
  teamId: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
}

export interface MetricsAggregation {
  metricType: string;
  teamId: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  startTime: Date;
  endTime: Date;
}

export class WorkTaskMetricsRepository {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(private logger: Logger) {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.METRICS_TABLE_NAME || 'work_task_metrics';
  }

  /**
   * Store a metrics record
   */
  async createMetric(metric: Omit<MetricsRecord, 'metric_id' | 'created_at'>): Promise<MetricsRecord> {
    try {
      const metricId = `${metric.metric_type}#${metric.team_id}#${metric.timestamp}`;
      const createdAt = new Date().toISOString();
      
      // Set TTL to 90 days from now (configurable)
      const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

      const record: MetricsRecord = {
        ...metric,
        metric_id: metricId,
        created_at: createdAt,
        ttl,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: record,
        })
      );

      this.logger.debug('Metrics record created', {
        metricId,
        metricType: metric.metric_type,
        teamId: metric.team_id,
      });

      return record;

    } catch (error) {
      this.logger.error('Failed to create metrics record', error as Error);
      throw error;
    }
  }

  /**
   * Query metrics by type and time range
   */
  async queryMetrics(query: MetricsQuery): Promise<MetricsRecord[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'MetricTypeTeamIndex',
          KeyConditionExpression: 'metric_type = :metricType AND team_id = :teamId',
          FilterExpression: '#timestamp BETWEEN :startTime AND :endTime',
          ExpressionAttributeNames: {
            '#timestamp': 'timestamp',
          },
          ExpressionAttributeValues: {
            ':metricType': query.metricType,
            ':teamId': query.teamId,
            ':startTime': query.startTime.toISOString(),
            ':endTime': query.endTime.toISOString(),
          },
          Limit: query.limit || 1000,
        })
      );

      return (result.Items || []) as MetricsRecord[];

    } catch (error) {
      this.logger.error('Failed to query metrics', error as Error);
      throw error;
    }
  }

  /**
   * Get aggregated metrics for a period
   */
  async getAggregatedMetrics(aggregation: MetricsAggregation): Promise<MetricsRecord[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'MetricTypeTeamIndex',
          KeyConditionExpression: 'metric_type = :metricType AND team_id = :teamId',
          FilterExpression: 'period = :period AND #timestamp BETWEEN :startTime AND :endTime AND aggregated = :aggregated',
          ExpressionAttributeNames: {
            '#timestamp': 'timestamp',
          },
          ExpressionAttributeValues: {
            ':metricType': aggregation.metricType,
            ':teamId': aggregation.teamId,
            ':period': aggregation.period,
            ':startTime': aggregation.startTime.toISOString(),
            ':endTime': aggregation.endTime.toISOString(),
            ':aggregated': true,
          },
        })
      );

      return (result.Items || []) as MetricsRecord[];

    } catch (error) {
      this.logger.error('Failed to get aggregated metrics', error as Error);
      throw error;
    }
  }

  /**
   * Calculate aggregated metrics from raw data
   */
  async calculateAggregation(
    metricType: string,
    teamId: string,
    period: 'hourly' | 'daily' | 'weekly' | 'monthly',
    startTime: Date,
    endTime: Date
  ): Promise<Record<string, any>> {
    try {
      // Query raw metrics
      const metrics = await this.queryMetrics({
        metricType,
        teamId,
        startTime,
        endTime,
      });

      if (metrics.length === 0) {
        return {
          count: 0,
          period,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        };
      }

      // Perform aggregation based on metric type
      const aggregation = this.aggregateMetrics(metrics, metricType);

      // Store aggregated result
      await this.createMetric({
        metric_type: `${metricType}_aggregated` as any,
        team_id: teamId,
        timestamp: endTime.toISOString(),
        period,
        aggregated: true,
        data: aggregation,
      });

      return aggregation;

    } catch (error) {
      this.logger.error('Failed to calculate aggregation', error as Error);
      throw error;
    }
  }

  /**
   * Aggregate metrics based on type
   */
  private aggregateMetrics(metrics: MetricsRecord[], metricType: string): Record<string, any> {
    const count = metrics.length;

    switch (metricType) {
      case 'submission':
        return {
          count,
          byPriority: this.groupBy(metrics, (m) => m.data.priority),
          byCategory: this.groupBy(metrics, (m) => m.data.category || 'Uncategorized'),
        };

      case 'completion':
        return {
          count,
          averageCompletionTime: this.average(metrics, (m) => m.data.processingTime),
          averageCompletionRate: this.average(metrics, (m) => m.data.completionRate),
          totalTodosCompleted: this.sum(metrics, (m) => m.data.completedTodos),
        };

      case 'quality_check':
        return {
          count,
          passCount: metrics.filter((m) => m.data.passed).length,
          passRate: (metrics.filter((m) => m.data.passed).length / count) * 100,
          averageQualityScore: this.average(metrics, (m) => m.data.qualityScore),
          averageCheckDuration: this.average(metrics, (m) => m.data.checkDuration),
          totalIssuesFound: this.sum(metrics, (m) => m.data.issuesFound),
          totalCriticalIssues: this.sum(metrics, (m) => m.data.criticalIssues),
        };

      case 'satisfaction':
        return {
          count,
          averageRating: this.average(metrics, (m) => m.data.rating),
          feedbackProvidedCount: metrics.filter((m) => m.data.feedbackProvided).length,
          byFeature: this.groupBy(metrics, (m) => m.data.featureUsed),
        };

      case 'performance':
        return {
          count,
          successCount: metrics.filter((m) => m.data.success).length,
          successRate: (metrics.filter((m) => m.data.success).length / count) * 100,
          averageDuration: this.average(metrics, (m) => m.data.duration),
          byOperation: this.groupBy(metrics, (m) => m.data.operation),
          errorsByType: this.groupBy(
            metrics.filter((m) => !m.data.success),
            (m) => m.data.errorType || 'Unknown'
          ),
        };

      case 'usage':
        return {
          count,
          uniqueUsers: new Set(metrics.map((m) => m.user_id).filter(Boolean)).size,
          byFeature: this.groupBy(metrics, (m) => m.data.feature),
          averageSessionDuration: this.average(
            metrics.filter((m) => m.data.sessionDuration),
            (m) => m.data.sessionDuration
          ),
        };

      default:
        return { count };
    }
  }

  /**
   * Helper: Calculate average
   */
  private average(metrics: MetricsRecord[], getValue: (m: MetricsRecord) => number): number {
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + (getValue(m) || 0), 0);
    return sum / metrics.length;
  }

  /**
   * Helper: Calculate sum
   */
  private sum(metrics: MetricsRecord[], getValue: (m: MetricsRecord) => number): number {
    return metrics.reduce((acc, m) => acc + (getValue(m) || 0), 0);
  }

  /**
   * Helper: Group by key
   */
  private groupBy(
    metrics: MetricsRecord[],
    getKey: (m: MetricsRecord) => string
  ): Record<string, number> {
    return metrics.reduce((acc, m) => {
      const key = getKey(m);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get metrics summary for dashboard
   */
  async getMetricsSummary(
    teamId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Record<string, any>> {
    try {
      const [
        submissions,
        completions,
        qualityChecks,
        satisfaction,
        performance,
        usage,
      ] = await Promise.all([
        this.queryMetrics({ metricType: 'submission', teamId, startTime, endTime }),
        this.queryMetrics({ metricType: 'completion', teamId, startTime, endTime }),
        this.queryMetrics({ metricType: 'quality_check', teamId, startTime, endTime }),
        this.queryMetrics({ metricType: 'satisfaction', teamId, startTime, endTime }),
        this.queryMetrics({ metricType: 'performance', teamId, startTime, endTime }),
        this.queryMetrics({ metricType: 'usage', teamId, startTime, endTime }),
      ]);

      return {
        submissions: this.aggregateMetrics(submissions, 'submission'),
        completions: this.aggregateMetrics(completions, 'completion'),
        qualityChecks: this.aggregateMetrics(qualityChecks, 'quality_check'),
        satisfaction: this.aggregateMetrics(satisfaction, 'satisfaction'),
        performance: this.aggregateMetrics(performance, 'performance'),
        usage: this.aggregateMetrics(usage, 'usage'),
        period: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
      };

    } catch (error) {
      this.logger.error('Failed to get metrics summary', error as Error);
      throw error;
    }
  }
}
