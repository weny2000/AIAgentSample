# Work Task Monitoring - Quick Start Guide

## Overview
This guide provides quick instructions for setting up and using the Work Task business metrics monitoring system.

## Prerequisites
- AWS CLI configured
- Node.js >= 18.0.0 (for running scripts)
- CloudWatch permissions
- (Optional) SNS topic for notifications

## Quick Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Set Environment Variables
```bash
export AWS_REGION=us-east-1
export METRICS_TABLE_NAME=work_task_metrics
```

### 3. Create Monitoring Infrastructure
```bash
# Basic setup (no notifications)
npx ts-node src/scripts/setup-monitoring.ts

# With SNS notifications
npx ts-node src/scripts/setup-monitoring.ts --sns-topic arn:aws:sns:us-east-1:123456789012:alerts
```

## Using the Metrics Service

### Record Task Submission
```typescript
import { WorkTaskMetricsService } from './services/work-task-metrics-service';
import { Logger } from './lambda/utils/logger';

const logger = new Logger();
const metricsService = new WorkTaskMetricsService(logger);

await metricsService.recordTaskSubmission({
  taskId: 'task-123',
  teamId: 'team-456',
  submittedBy: 'user-789',
  priority: 'high',
  category: 'development',
  submittedAt: new Date()
});
```

### Record Task Completion
```typescript
await metricsService.recordTaskCompletion({
  taskId: 'task-123',
  teamId: 'team-456',
  completedAt: new Date(),
  totalTodos: 10,
  completedTodos: 8,
  analysisTime: 5000,      // milliseconds
  processingTime: 120000   // milliseconds
});
```

### Record Quality Check
```typescript
await metricsService.recordQualityCheck({
  taskId: 'task-123',
  todoId: 'todo-456',
  deliverableId: 'deliverable-789',
  teamId: 'team-456',
  passed: true,
  qualityScore: 85,
  checkDuration: 3000,
  issuesFound: 2,
  criticalIssues: 0
});
```

### Record User Satisfaction
```typescript
await metricsService.recordUserSatisfaction({
  taskId: 'task-123',
  userId: 'user-456',
  teamId: 'team-789',
  rating: 4,                    // 1-5
  feedbackProvided: true,
  featureUsed: 'task-analysis'
});
```

### Record System Performance
```typescript
await metricsService.recordSystemPerformance({
  operation: 'task-analysis',
  duration: 2500,
  success: true,
  resourceUsage: {
    memoryUsed: 128000000  // bytes
  }
});
```

## Viewing Metrics

### CloudWatch Dashboard
1. Open AWS CloudWatch Console
2. Navigate to **Dashboards**
3. Select **WorkTaskAnalysisMetrics**
4. View real-time metrics and trends

### CloudWatch Alarms
1. Navigate to **Alarms** in CloudWatch
2. Filter by prefix: **WorkTask-**
3. Monitor alarm states
4. Configure SNS notifications

## Key Metrics

| Metric Name | Description | Unit |
|-------------|-------------|------|
| TasksSubmitted | Number of tasks submitted | Count |
| TasksCompleted | Number of tasks completed | Count |
| TaskCompletionRate | Percentage of todos completed | Percent |
| QualityCheckPassRate | Percentage of quality checks passed | Percent |
| QualityScore | Average quality score | None (0-100) |
| UserSatisfactionRating | Average user rating | None (1-5) |
| OperationDuration | Time taken for operations | Milliseconds |
| ErrorRate | System error rate | Count/Percent |
| FeatureUsage | Feature usage count | Count |
| ActiveUsers | Number of active users | Count |

## Alarms

| Alarm Name | Threshold | Description |
|------------|-----------|-------------|
| WorkTask-HighErrorRate | > 5% | Error rate exceeds 5% for 10 minutes |
| WorkTask-SlowAnalysisTime | > 3 min | Analysis time exceeds 3 minutes for 15 minutes |
| WorkTask-LowQualityPassRate | < 70% | Quality pass rate below 70% for 30 minutes |
| WorkTask-HighCriticalIssues | > 10 | More than 10 critical issues in 5 minutes |
| WorkTask-LowUserSatisfaction | < 3.0 | User satisfaction below 3.0 for 2 hours |
| WorkTask-HighResponseTime | > 5 sec | Response time exceeds 5 seconds for 15 minutes |

## Querying Metrics

### Using Metrics Repository
```typescript
import { WorkTaskMetricsRepository } from './repositories/work-task-metrics-repository';

const repository = new WorkTaskMetricsRepository(logger);

// Query metrics for a time range
const metrics = await repository.queryMetrics({
  metricType: 'submission',
  teamId: 'team-123',
  startTime: new Date('2025-01-01'),
  endTime: new Date('2025-01-31'),
  limit: 1000
});

// Get metrics summary
const summary = await repository.getMetricsSummary(
  'team-123',
  new Date('2025-01-01'),
  new Date('2025-01-31')
);

console.log('Submissions:', summary.submissions);
console.log('Completions:', summary.completions);
console.log('Quality Checks:', summary.qualityChecks);
```

## Troubleshooting

### Metrics Not Appearing
1. Check AWS credentials and permissions
2. Verify CloudWatch namespace: `AiAgent/WorkTask`
3. Check CloudWatch Logs for errors
4. Ensure metrics service is initialized correctly

### Alarms Not Triggering
1. Verify SNS topic ARN is correct
2. Check alarm configuration in CloudWatch
3. Ensure sufficient data points for evaluation
4. Review alarm history in CloudWatch

### Dashboard Not Loading
1. Verify dashboard exists: `WorkTaskAnalysisMetrics`
2. Check IAM permissions for CloudWatch
3. Refresh browser cache
4. Recreate dashboard using setup script

## Cleanup

To remove all monitoring infrastructure:
```bash
npx ts-node src/scripts/setup-monitoring.ts --teardown
```

This will delete:
- CloudWatch dashboard
- All WorkTask alarms
- (Note: Metrics data in DynamoDB will expire based on TTL)

## Advanced Usage

### Custom Aggregations
```typescript
// Calculate hourly aggregation
const aggregation = await repository.calculateAggregation(
  'submission',
  'team-123',
  'hourly',
  new Date('2025-01-05T00:00:00Z'),
  new Date('2025-01-05T01:00:00Z')
);
```

### Record Aggregate Metrics
```typescript
await metricsService.recordAggregateMetrics('team-123', 'daily', {
  totalSubmissions: 100,
  totalCompletions: 85,
  averageCompletionTime: 120000,
  averageQualityScore: 82,
  totalQualityChecks: 200,
  qualityCheckPassCount: 180,
  averageUserSatisfaction: 4.2,
  totalErrors: 5,
  averageResponseTime: 2500
});
```

## Best Practices

1. **Record metrics asynchronously** - Don't block user operations
2. **Use appropriate dimensions** - Filter by team, priority, category
3. **Monitor alarm states** - Set up notifications for critical alarms
4. **Review metrics regularly** - Weekly dashboard reviews
5. **Adjust thresholds** - Based on actual usage patterns
6. **Archive old data** - Use aggregated metrics for long-term analysis

## Support

For issues or questions:
1. Check CloudWatch Logs for error messages
2. Review the detailed implementation summary: `TASK_22_BUSINESS_METRICS_MONITORING_SUMMARY.md`
3. Consult AWS CloudWatch documentation
4. Contact the development team

## Related Documentation

- [Task 22 Implementation Summary](./TASK_22_BUSINESS_METRICS_MONITORING_SUMMARY.md)
- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
