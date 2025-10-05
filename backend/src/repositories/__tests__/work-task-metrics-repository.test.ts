/**
 * Unit tests for Work Task Metrics Repository
 */

import { WorkTaskMetricsRepository, MetricsRecord } from '../work-task-metrics-repository';
import { Logger } from '../../lambda/utils/logger';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('WorkTaskMetricsRepository', () => {
  let repository: WorkTaskMetricsRepository;
  let logger: Logger;

  beforeEach(() => {
    dynamoMock.reset();
    logger = new Logger({
      correlationId: 'test-correlation-id',
      operation: 'test-metrics-repo',
    });
    repository = new WorkTaskMetricsRepository(logger);
  });

  describe('createMetric', () => {
    it('should create a metrics record', async () => {
      dynamoMock.on(PutCommand).resolves({});

      const metric = await repository.createMetric({
        metric_type: 'submission',
        team_id: 'team-123',
        timestamp: '2025-01-01T10:00:00Z',
        data: {
          priority: 'high',
          category: 'development',
        },
      });

      expect(metric.metric_id).toBe('submission#team-123#2025-01-01T10:00:00Z');
      expect(metric.created_at).toBeDefined();
      expect(metric.ttl).toBeDefined();

      const calls = dynamoMock.commandCalls(PutCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.Item).toMatchObject({
        metric_type: 'submission',
        team_id: 'team-123',
        timestamp: '2025-01-01T10:00:00Z',
      });
    });

    it('should set TTL for auto-expiration', async () => {
      dynamoMock.on(PutCommand).resolves({});

      const metric = await repository.createMetric({
        metric_type: 'completion',
        team_id: 'team-456',
        timestamp: new Date().toISOString(),
        data: { completionRate: 85 },
      });

      expect(metric.ttl).toBeDefined();
      expect(metric.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should handle errors', async () => {
      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(
        repository.createMetric({
          metric_type: 'quality_check',
          team_id: 'team-789',
          timestamp: new Date().toISOString(),
          data: { passed: true },
        })
      ).rejects.toThrow('DynamoDB error');
    });
  });

  describe('queryMetrics', () => {
    it('should query metrics by type and time range', async () => {
      const mockMetrics: MetricsRecord[] = [
        {
          metric_id: 'submission#team-123#2025-01-01T10:00:00Z',
          timestamp: '2025-01-01T10:00:00Z',
          metric_type: 'submission',
          team_id: 'team-123',
          data: { priority: 'high' },
          created_at: '2025-01-01T10:00:00Z',
        },
        {
          metric_id: 'submission#team-123#2025-01-01T11:00:00Z',
          timestamp: '2025-01-01T11:00:00Z',
          metric_type: 'submission',
          team_id: 'team-123',
          data: { priority: 'medium' },
          created_at: '2025-01-01T11:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({
        Items: mockMetrics,
      });

      const result = await repository.queryMetrics({
        metricType: 'submission',
        teamId: 'team-123',
        startTime: new Date('2025-01-01T09:00:00Z'),
        endTime: new Date('2025-01-01T12:00:00Z'),
      });

      expect(result).toHaveLength(2);
      expect(result[0].metric_type).toBe('submission');
      expect(result[0].team_id).toBe('team-123');

      const calls = dynamoMock.commandCalls(QueryCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.IndexName).toBe('MetricTypeTeamIndex');
    });

    it('should apply limit to query', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await repository.queryMetrics({
        metricType: 'completion',
        teamId: 'team-456',
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-02T00:00:00Z'),
        limit: 50,
      });

      const calls = dynamoMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.Limit).toBe(50);
    });

    it('should use default limit when not specified', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await repository.queryMetrics({
        metricType: 'quality_check',
        teamId: 'team-789',
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-02T00:00:00Z'),
      });

      const calls = dynamoMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.Limit).toBe(1000);
    });
  });

  describe('getAggregatedMetrics', () => {
    it('should get aggregated metrics for a period', async () => {
      const mockAggregatedMetrics: MetricsRecord[] = [
        {
          metric_id: 'submission_aggregated#team-123#2025-01-01T00:00:00Z',
          timestamp: '2025-01-01T00:00:00Z',
          metric_type: 'submission_aggregated',
          team_id: 'team-123',
          period: 'daily',
          aggregated: true,
          data: {
            count: 100,
            byPriority: { high: 30, medium: 50, low: 20 },
          },
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({
        Items: mockAggregatedMetrics,
      });

      const result = await repository.getAggregatedMetrics({
        metricType: 'submission',
        teamId: 'team-123',
        period: 'daily',
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-02T00:00:00Z'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].aggregated).toBe(true);
      expect(result[0].period).toBe('daily');
    });
  });

  describe('calculateAggregation', () => {
    it('should calculate submission aggregation', async () => {
      const mockMetrics: MetricsRecord[] = [
        {
          metric_id: 'submission#team-123#2025-01-01T10:00:00Z',
          timestamp: '2025-01-01T10:00:00Z',
          metric_type: 'submission',
          team_id: 'team-123',
          data: { priority: 'high', category: 'development' },
          created_at: '2025-01-01T10:00:00Z',
        },
        {
          metric_id: 'submission#team-123#2025-01-01T11:00:00Z',
          timestamp: '2025-01-01T11:00:00Z',
          metric_type: 'submission',
          team_id: 'team-123',
          data: { priority: 'medium', category: 'development' },
          created_at: '2025-01-01T11:00:00Z',
        },
        {
          metric_id: 'submission#team-123#2025-01-01T12:00:00Z',
          timestamp: '2025-01-01T12:00:00Z',
          metric_type: 'submission',
          team_id: 'team-123',
          data: { priority: 'high', category: 'testing' },
          created_at: '2025-01-01T12:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: mockMetrics });
      dynamoMock.on(PutCommand).resolves({});

      const aggregation = await repository.calculateAggregation(
        'submission',
        'team-123',
        'daily',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-02T00:00:00Z')
      );

      expect(aggregation.count).toBe(3);
      expect(aggregation.byPriority).toEqual({ high: 2, medium: 1 });
      expect(aggregation.byCategory).toEqual({ development: 2, testing: 1 });
    });

    it('should calculate completion aggregation', async () => {
      const mockMetrics: MetricsRecord[] = [
        {
          metric_id: 'completion#team-123#2025-01-01T10:00:00Z',
          timestamp: '2025-01-01T10:00:00Z',
          metric_type: 'completion',
          team_id: 'team-123',
          data: { processingTime: 120000, completionRate: 80, completedTodos: 8 },
          created_at: '2025-01-01T10:00:00Z',
        },
        {
          metric_id: 'completion#team-123#2025-01-01T11:00:00Z',
          timestamp: '2025-01-01T11:00:00Z',
          metric_type: 'completion',
          team_id: 'team-123',
          data: { processingTime: 100000, completionRate: 90, completedTodos: 9 },
          created_at: '2025-01-01T11:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: mockMetrics });
      dynamoMock.on(PutCommand).resolves({});

      const aggregation = await repository.calculateAggregation(
        'completion',
        'team-123',
        'daily',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-02T00:00:00Z')
      );

      expect(aggregation.count).toBe(2);
      expect(aggregation.averageCompletionTime).toBe(110000);
      expect(aggregation.averageCompletionRate).toBe(85);
      expect(aggregation.totalTodosCompleted).toBe(17);
    });

    it('should calculate quality check aggregation', async () => {
      const mockMetrics: MetricsRecord[] = [
        {
          metric_id: 'quality_check#team-123#2025-01-01T10:00:00Z',
          timestamp: '2025-01-01T10:00:00Z',
          metric_type: 'quality_check',
          team_id: 'team-123',
          data: { passed: true, qualityScore: 85, checkDuration: 3000, issuesFound: 2, criticalIssues: 0 },
          created_at: '2025-01-01T10:00:00Z',
        },
        {
          metric_id: 'quality_check#team-123#2025-01-01T11:00:00Z',
          timestamp: '2025-01-01T11:00:00Z',
          metric_type: 'quality_check',
          team_id: 'team-123',
          data: { passed: false, qualityScore: 45, checkDuration: 2000, issuesFound: 10, criticalIssues: 3 },
          created_at: '2025-01-01T11:00:00Z',
        },
        {
          metric_id: 'quality_check#team-123#2025-01-01T12:00:00Z',
          timestamp: '2025-01-01T12:00:00Z',
          metric_type: 'quality_check',
          team_id: 'team-123',
          data: { passed: true, qualityScore: 90, checkDuration: 2500, issuesFound: 1, criticalIssues: 0 },
          created_at: '2025-01-01T12:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: mockMetrics });
      dynamoMock.on(PutCommand).resolves({});

      const aggregation = await repository.calculateAggregation(
        'quality_check',
        'team-123',
        'daily',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-02T00:00:00Z')
      );

      expect(aggregation.count).toBe(3);
      expect(aggregation.passCount).toBe(2);
      expect(aggregation.passRate).toBeCloseTo(66.67, 1);
      expect(aggregation.averageQualityScore).toBeCloseTo(73.33, 1);
      expect(aggregation.averageCheckDuration).toBeCloseTo(2500, 0);
      expect(aggregation.totalIssuesFound).toBe(13);
      expect(aggregation.totalCriticalIssues).toBe(3);
    });

    it('should handle empty metrics', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const aggregation = await repository.calculateAggregation(
        'submission',
        'team-123',
        'daily',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-02T00:00:00Z')
      );

      expect(aggregation.count).toBe(0);
      expect(aggregation.period).toBe('daily');
    });
  });

  describe('getMetricsSummary', () => {
    it('should get comprehensive metrics summary', async () => {
      const mockSubmissions: MetricsRecord[] = [
        {
          metric_id: 'submission#team-123#2025-01-01T10:00:00Z',
          timestamp: '2025-01-01T10:00:00Z',
          metric_type: 'submission',
          team_id: 'team-123',
          data: { priority: 'high' },
          created_at: '2025-01-01T10:00:00Z',
        },
      ];

      const mockCompletions: MetricsRecord[] = [
        {
          metric_id: 'completion#team-123#2025-01-01T11:00:00Z',
          timestamp: '2025-01-01T11:00:00Z',
          metric_type: 'completion',
          team_id: 'team-123',
          data: { processingTime: 120000, completionRate: 85 },
          created_at: '2025-01-01T11:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: mockSubmissions });
      dynamoMock.on(QueryCommand).resolves({ Items: mockCompletions });

      const summary = await repository.getMetricsSummary(
        'team-123',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-02T00:00:00Z')
      );

      expect(summary).toHaveProperty('submissions');
      expect(summary).toHaveProperty('completions');
      expect(summary).toHaveProperty('qualityChecks');
      expect(summary).toHaveProperty('satisfaction');
      expect(summary).toHaveProperty('performance');
      expect(summary).toHaveProperty('usage');
      expect(summary).toHaveProperty('period');
      expect(summary.period.startTime).toBe('2025-01-01T00:00:00.000Z');
      expect(summary.period.endTime).toBe('2025-01-02T00:00:00.000Z');
    });
  });
});
