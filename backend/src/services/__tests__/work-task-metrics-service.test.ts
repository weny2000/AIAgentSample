/**
 * Unit tests for Work Task Metrics Service
 */

import { WorkTaskMetricsService } from '../work-task-metrics-service';
import { Logger } from '../../lambda/utils/logger';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';

const cloudWatchMock = mockClient(CloudWatchClient);

describe('WorkTaskMetricsService', () => {
  let service: WorkTaskMetricsService;
  let logger: Logger;

  beforeEach(() => {
    cloudWatchMock.reset();
    logger = new Logger({
      correlationId: 'test-correlation-id',
      operation: 'test-metrics',
    });
    service = new WorkTaskMetricsService(logger);
  });

  describe('recordTaskSubmission', () => {
    it('should record task submission metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordTaskSubmission({
        taskId: 'task-123',
        teamId: 'team-456',
        submittedBy: 'user-789',
        priority: 'high',
        category: 'development',
        submittedAt: new Date('2025-01-01T10:00:00Z'),
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBeGreaterThan(0);

      const metricData = calls[0].args[0].input.MetricData;
      expect(metricData).toBeDefined();
      expect(metricData?.some((m) => m.MetricName === 'TasksSubmitted')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'TasksSubmittedByCategory')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'TasksSubmittedByUser')).toBe(true);
    });

    it('should handle missing category', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordTaskSubmission({
        taskId: 'task-123',
        teamId: 'team-456',
        submittedBy: 'user-789',
        priority: 'medium',
        submittedAt: new Date(),
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;
      
      const categoryMetric = metricData?.find((m) => m.MetricName === 'TasksSubmittedByCategory');
      expect(categoryMetric?.Dimensions?.some((d) => d.Value === 'Uncategorized')).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch error'));

      await expect(
        service.recordTaskSubmission({
          taskId: 'task-123',
          teamId: 'team-456',
          submittedBy: 'user-789',
          priority: 'low',
          submittedAt: new Date(),
        })
      ).resolves.not.toThrow();
    });
  });

  describe('recordTaskCompletion', () => {
    it('should record task completion metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordTaskCompletion({
        taskId: 'task-123',
        teamId: 'team-456',
        completedAt: new Date(),
        totalTodos: 10,
        completedTodos: 8,
        analysisTime: 5000,
        processingTime: 120000,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'TasksCompleted')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'TaskCompletionRate')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'TaskAnalysisTime')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'TaskProcessingTime')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'TodoItemsCompleted')).toBe(true);

      const completionRateMetric = metricData?.find((m) => m.MetricName === 'TaskCompletionRate');
      expect(completionRateMetric?.Value).toBe(80); // 8/10 * 100
    });

    it('should handle zero todos', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordTaskCompletion({
        taskId: 'task-123',
        teamId: 'team-456',
        completedAt: new Date(),
        totalTodos: 0,
        completedTodos: 0,
        analysisTime: 1000,
        processingTime: 5000,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      const completionRateMetric = metricData?.find((m) => m.MetricName === 'TaskCompletionRate');
      expect(completionRateMetric?.Value).toBe(0);
    });
  });

  describe('recordQualityCheck', () => {
    it('should record quality check metrics for passed check', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordQualityCheck({
        taskId: 'task-123',
        todoId: 'todo-456',
        deliverableId: 'deliverable-789',
        teamId: 'team-456',
        passed: true,
        qualityScore: 85,
        checkDuration: 3000,
        issuesFound: 2,
        criticalIssues: 0,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'QualityChecksPerformed')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'QualityCheckPassRate')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'QualityScore')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'QualityCheckDuration')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'IssuesFound')).toBe(true);

      const passRateMetric = metricData?.find((m) => m.MetricName === 'QualityCheckPassRate');
      expect(passRateMetric?.Value).toBe(100);
    });

    it('should record critical issues when found', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordQualityCheck({
        taskId: 'task-123',
        todoId: 'todo-456',
        deliverableId: 'deliverable-789',
        teamId: 'team-456',
        passed: false,
        qualityScore: 45,
        checkDuration: 2000,
        issuesFound: 10,
        criticalIssues: 3,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'CriticalIssuesFound')).toBe(true);
      
      const criticalIssuesMetric = metricData?.find((m) => m.MetricName === 'CriticalIssuesFound');
      expect(criticalIssuesMetric?.Value).toBe(3);
    });

    it('should not record critical issues metric when none found', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordQualityCheck({
        taskId: 'task-123',
        todoId: 'todo-456',
        deliverableId: 'deliverable-789',
        teamId: 'team-456',
        passed: true,
        qualityScore: 90,
        checkDuration: 1500,
        issuesFound: 1,
        criticalIssues: 0,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'CriticalIssuesFound')).toBe(false);
    });
  });

  describe('recordUserSatisfaction', () => {
    it('should record user satisfaction metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordUserSatisfaction({
        taskId: 'task-123',
        userId: 'user-456',
        teamId: 'team-789',
        rating: 4,
        feedbackProvided: true,
        featureUsed: 'task-analysis',
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'UserSatisfactionRating')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'FeedbackProvided')).toBe(true);

      const ratingMetric = metricData?.find((m) => m.MetricName === 'UserSatisfactionRating');
      expect(ratingMetric?.Value).toBe(4);

      const feedbackMetric = metricData?.find((m) => m.MetricName === 'FeedbackProvided');
      expect(feedbackMetric?.Value).toBe(1);
    });

    it('should handle no feedback provided', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordUserSatisfaction({
        taskId: 'task-123',
        userId: 'user-456',
        teamId: 'team-789',
        rating: 3,
        feedbackProvided: false,
        featureUsed: 'quality-check',
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      const feedbackMetric = metricData?.find((m) => m.MetricName === 'FeedbackProvided');
      expect(feedbackMetric?.Value).toBe(0);
    });
  });

  describe('recordSystemPerformance', () => {
    it('should record successful operation metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordSystemPerformance({
        operation: 'task-analysis',
        duration: 2500,
        success: true,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'OperationDuration')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'OperationSuccess')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'OperationFailure')).toBe(false);
    });

    it('should record failed operation metrics with error type', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordSystemPerformance({
        operation: 'quality-check',
        duration: 1500,
        success: false,
        errorType: 'ValidationError',
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'OperationFailure')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'ErrorRate')).toBe(true);

      const errorMetric = metricData?.find((m) => m.MetricName === 'ErrorRate');
      expect(errorMetric?.Dimensions?.some((d) => d.Value === 'ValidationError')).toBe(true);
    });

    it('should record resource usage metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordSystemPerformance({
        operation: 'workgroup-identification',
        duration: 3000,
        success: true,
        resourceUsage: {
          memoryUsed: 128000000, // 128 MB
          cpuTime: 2500,
        },
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'MemoryUsage')).toBe(true);

      const memoryMetric = metricData?.find((m) => m.MetricName === 'MemoryUsage');
      expect(memoryMetric?.Value).toBe(128000000);
    });
  });

  describe('recordUsage', () => {
    it('should record feature usage metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordUsage({
        userId: 'user-123',
        teamId: 'team-456',
        feature: 'todo-generation',
        timestamp: new Date(),
        sessionDuration: 300,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'FeatureUsage')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'ActiveUsers')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'SessionDuration')).toBe(true);
    });

    it('should handle missing session duration', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordUsage({
        userId: 'user-123',
        teamId: 'team-456',
        feature: 'task-submission',
        timestamp: new Date(),
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'SessionDuration')).toBe(false);
    });
  });

  describe('recordAggregateMetrics', () => {
    it('should calculate and record aggregate metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordAggregateMetrics('team-123', 'daily', {
        totalSubmissions: 100,
        totalCompletions: 85,
        averageCompletionTime: 120000,
        averageQualityScore: 82,
        totalQualityChecks: 200,
        qualityCheckPassCount: 180,
        averageUserSatisfaction: 4.2,
        totalErrors: 5,
        averageResponseTime: 2500,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      expect(metricData?.some((m) => m.MetricName === 'TaskSuccessRate')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'AverageCompletionTime')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'AverageQualityScore')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'QualityCheckPassRate')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'AverageUserSatisfaction')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'SystemErrorRate')).toBe(true);
      expect(metricData?.some((m) => m.MetricName === 'AverageResponseTime')).toBe(true);

      const successRateMetric = metricData?.find((m) => m.MetricName === 'TaskSuccessRate');
      expect(successRateMetric?.Value).toBe(85); // 85/100 * 100

      const qualityPassRateMetric = metricData?.find((m) => m.MetricName === 'QualityCheckPassRate');
      expect(qualityPassRateMetric?.Value).toBe(90); // 180/200 * 100

      const errorRateMetric = metricData?.find((m) => m.MetricName === 'SystemErrorRate');
      expect(errorRateMetric?.Value).toBe(5); // 5/100 * 100
    });

    it('should handle zero submissions', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      await service.recordAggregateMetrics('team-123', 'hourly', {
        totalSubmissions: 0,
        totalCompletions: 0,
        averageCompletionTime: 0,
        averageQualityScore: 0,
        totalQualityChecks: 0,
        qualityCheckPassCount: 0,
        averageUserSatisfaction: 0,
        totalErrors: 0,
        averageResponseTime: 0,
      });

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      const metricData = calls[0].args[0].input.MetricData;

      const successRateMetric = metricData?.find((m) => m.MetricName === 'TaskSuccessRate');
      expect(successRateMetric?.Value).toBe(0);

      const errorRateMetric = metricData?.find((m) => m.MetricName === 'SystemErrorRate');
      expect(errorRateMetric?.Value).toBe(0);
    });
  });

  describe('batch processing', () => {
    it('should handle large number of metrics in batches', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});

      // Record multiple metrics that would exceed batch size
      const promises = [];
      for (let i = 0; i < 25; i++) {
        promises.push(
          service.recordTaskSubmission({
            taskId: `task-${i}`,
            teamId: 'team-456',
            submittedBy: 'user-789',
            priority: 'medium',
            submittedAt: new Date(),
          })
        );
      }

      await Promise.all(promises);

      const calls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(calls.length).toBeGreaterThan(0);

      // Verify each batch has at most 20 metrics
      calls.forEach((call) => {
        const metricData = call.args[0].input.MetricData;
        expect(metricData?.length).toBeLessThanOrEqual(20);
      });
    });
  });
});
