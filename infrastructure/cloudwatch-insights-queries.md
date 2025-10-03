# CloudWatch Insights Queries for AI Agent System

This document contains useful CloudWatch Insights queries for monitoring and troubleshooting the AI Agent system.

## Error Analysis Queries

### 1. Error Distribution by Type
```
fields @timestamp, level, message, context.errorType, context.operation, context.functionName
| filter level = "ERROR"
| stats count() by context.errorType, context.functionName
| sort count desc
```

### 2. Recent Errors with Context
```
fields @timestamp, level, message, context.errorType, context.operation, context.userId, context.teamId, context.correlationId
| filter level = "ERROR"
| filter @timestamp > date_sub(now(), interval 1 hour)
| sort @timestamp desc
| limit 50
```

### 3. Error Rate by Function
```
fields @timestamp, level, context.functionName
| filter level in ["ERROR", "INFO"]
| stats count() as total, sum(level = "ERROR") as errors by context.functionName
| eval error_rate = errors / total * 100
| sort error_rate desc
```

## Performance Analysis Queries

### 4. Average Response Times by Operation
```
fields @timestamp, duration, context.operation, context.functionName
| filter ispresent(duration)
| stats avg(duration) as avg_duration, max(duration) as max_duration, min(duration) as min_duration, count() as request_count by context.operation
| sort avg_duration desc
```

### 5. Slow Requests (>5 seconds)
```
fields @timestamp, duration, context.operation, context.userId, context.correlationId, message
| filter ispresent(duration) and duration > 5000
| sort @timestamp desc
| limit 100
```

### 6. Performance Percentiles
```
fields @timestamp, duration, context.operation
| filter ispresent(duration)
| stats avg(duration) as avg, pct(duration, 50) as p50, pct(duration, 90) as p90, pct(duration, 95) as p95, pct(duration, 99) as p99 by context.operation
| sort p99 desc
```

## Business Metrics Queries

### 7. Artifact Check Success Rate
```
fields @timestamp, level, metricData.MetricName, metricData.Value, metricData.Dimensions
| filter level = "METRIC" and metricType = "BUSINESS"
| filter metricData.MetricName in ["ArtifactChecksStarted", "ArtifactChecksCompleted", "ArtifactChecksFailed"]
| stats sum(metricData.Value) as total by metricData.MetricName
```

### 8. Team Activity Analysis
```
fields @timestamp, context.teamId, context.operation, context.userId
| filter ispresent(context.teamId) and ispresent(context.operation)
| stats count() as activity_count by context.teamId, context.operation
| sort activity_count desc
| limit 20
```

### 9. Compliance Score Trends
```
fields @timestamp, level, metricData.MetricName, metricData.Value
| filter level = "METRIC" and metricData.MetricName = "ComplianceScoreAverage"
| stats avg(metricData.Value) as avg_compliance_score by bin(5m)
| sort @timestamp desc
```

## User Activity Queries

### 10. Most Active Users
```
fields @timestamp, context.userId, context.operation, context.teamId
| filter ispresent(context.userId)
| stats count() as request_count by context.userId, context.teamId
| sort request_count desc
| limit 20
```

### 11. User Error Patterns
```
fields @timestamp, level, context.userId, context.errorType, context.operation
| filter level = "ERROR" and ispresent(context.userId)
| stats count() as error_count by context.userId, context.errorType
| sort error_count desc
| limit 20
```

## Retry and Circuit Breaker Analysis

### 12. Retry Patterns
```
fields @timestamp, retryAttempt, context.operation, message, context.errorType
| filter ispresent(retryAttempt)
| stats count() as retry_count, avg(retryAttempt) as avg_attempts by context.operation, context.errorType
| sort retry_count desc
```

### 13. Circuit Breaker Events
```
fields @timestamp, message, context.operation
| filter message like /circuit.*breaker/
| stats count() as events by context.operation, message
| sort events desc
```

## Security and Audit Queries

### 14. Authentication Failures
```
fields @timestamp, level, message, context.userId, context.errorType
| filter level = "ERROR" and context.errorType = "AuthorizationError"
| stats count() as auth_failures by context.userId
| sort auth_failures desc
```

### 15. Suspicious Activity Patterns
```
fields @timestamp, context.userId, context.operation, context.teamId
| filter ispresent(context.userId)
| stats count() as request_count by context.userId, bin(1h)
| filter request_count > 100
| sort @timestamp desc
```

## System Health Queries

### 16. Memory Usage Patterns
```
fields @timestamp, data.memoryUsed.heapUsed, data.memoryUsed.heapTotal, context.functionName
| filter ispresent(data.memoryUsed)
| stats avg(data.memoryUsed.heapUsed) as avg_heap_used, max(data.memoryUsed.heapUsed) as max_heap_used by context.functionName
| sort max_heap_used desc
```

### 17. Cold Start Analysis
```
fields @timestamp, @initDuration, context.functionName
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_init_time by context.functionName
| sort cold_starts desc
```

### 18. Timeout Analysis
```
fields @timestamp, level, message, context.operation, context.functionName
| filter level = "ERROR" and (message like /timeout/ or message like /timed out/)
| stats count() as timeout_count by context.operation, context.functionName
| sort timeout_count desc
```

## Correlation and Tracing Queries

### 19. Request Flow by Correlation ID
```
fields @timestamp, level, message, context.operation, context.functionName, context.correlationId
| filter context.correlationId = "YOUR_CORRELATION_ID_HERE"
| sort @timestamp asc
```

### 20. Cross-Service Request Tracing
```
fields @timestamp, level, message, context.operation, context.traceId, context.spanId, context.parentSpanId
| filter ispresent(context.traceId) and context.traceId = "YOUR_TRACE_ID_HERE"
| sort @timestamp asc
```

## Custom Business Logic Queries

### 21. Artifact Type Distribution
```
fields @timestamp, context.operation, data.artifactType
| filter context.operation = "artifact-check" and ispresent(data.artifactType)
| stats count() as check_count by data.artifactType
| sort check_count desc
```

### 22. Processing Time by Artifact Type
```
fields @timestamp, duration, data.artifactType, context.operation
| filter context.operation = "artifact-check" and ispresent(duration) and ispresent(data.artifactType)
| stats avg(duration) as avg_processing_time, count() as total_checks by data.artifactType
| sort avg_processing_time desc
```

### 23. Critical Issues Detection
```
fields @timestamp, level, metricData.MetricName, metricData.Value, metricData.Dimensions
| filter level = "METRIC" and metricData.MetricName = "CriticalIssuesFound"
| filter metricData.Value > 0
| stats sum(metricData.Value) as total_critical_issues by bin(1h)
| sort @timestamp desc
```

## Usage Instructions

1. **Replace Placeholders**: Update `YOUR_CORRELATION_ID_HERE` and `YOUR_TRACE_ID_HERE` with actual values
2. **Adjust Time Ranges**: Modify time filters (`date_sub(now(), interval 1 hour)`) as needed
3. **Customize Thresholds**: Adjust numeric thresholds (e.g., `duration > 5000`) based on your requirements
4. **Add Filters**: Include additional filters for specific environments, teams, or operations

## Query Optimization Tips

- Use specific time ranges to improve query performance
- Add filters early in the query to reduce data processing
- Use `limit` clauses to control result size
- Consider using `bin()` function for time-based aggregations
- Index on frequently queried fields like `correlationId`, `userId`, `teamId`

## Alerting Integration

These queries can be used to create CloudWatch Alarms:
- Convert aggregation queries to metrics
- Set appropriate thresholds based on baseline performance
- Configure SNS notifications for critical alerts
- Use composite alarms for complex conditions