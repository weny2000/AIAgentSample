# AI Agent System - Monitoring, Observability, and Alerting

This document describes the comprehensive monitoring, observability, and alerting implementation for the AI Agent system.

## Overview

The monitoring system provides:
- **Real-time metrics** via CloudWatch custom metrics
- **Distributed tracing** with AWS X-Ray
- **Structured logging** with correlation IDs
- **Automated alerting** via SNS and Slack
- **Performance monitoring** and auto-scaling
- **Business metrics** tracking
- **Security and audit logging**

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Lambda        │────│   CloudWatch     │────│   SNS Topics        │
│   Functions     │    │   Metrics/Logs   │    │   (Alerts)          │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
         │                        │                        │
         │                        │                        │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   X-Ray         │    │   CloudWatch     │    │   Slack/Email       │
│   Tracing       │    │   Dashboards     │    │   Notifications     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## Components

### 1. Enhanced Logging (`backend/src/lambda/utils/logger.ts`)

**Features:**
- Structured JSON logging with correlation IDs
- X-Ray trace integration
- Automatic error classification
- Performance timing
- Business metrics emission
- Context propagation

**Usage:**
```typescript
const logger = new Logger({
  correlationId: 'req-123',
  operation: 'artifact-check',
  userId: 'user-456',
  teamId: 'team-789'
});

logger.info('Processing request', { artifactType: 'code' });
logger.error('Validation failed', error, { errorType: 'ValidationError' });
logger.performance('Request completed', { duration: 1500 });
logger.businessMetric('ArtifactChecksStarted', 1, { teamId: 'team-789' });
```

### 2. Monitoring Utilities (`backend/src/lambda/utils/monitoring-utils.ts`)

**Features:**
- CloudWatch metrics publishing
- X-Ray subsegment creation
- Performance monitoring wrappers
- Circuit breaker pattern
- Health check utilities
- Retry metrics tracking

**Usage:**
```typescript
// Performance monitoring with X-Ray
const result = await MonitoringUtils.withPerformanceMonitoring(
  'kendra-search',
  () => kendraClient.query(params),
  { userId: 'user-123' },
  logger
);

// Circuit breaker pattern
const result = await MonitoringUtils.withCircuitBreaker(
  'external-api-call',
  () => externalApiCall(),
  { failureThreshold: 5, recoveryTimeout: 30000, logger }
);

// Custom metrics
await MonitoringUtils.recordBusinessMetrics({
  artifactChecksCompleted: 1,
  complianceScoreAverage: 85,
  teamId: 'team-123'
}, logger);
```

### 3. Monitoring Middleware (`backend/src/lambda/utils/monitoring-middleware.ts`)

**Features:**
- Automatic request/response monitoring
- Error tracking and classification
- Performance metrics collection
- X-Ray annotation injection
- Business metrics emission

**Usage:**
```typescript
// API Gateway handler
export const handler = withApiGatewayMonitoring(
  async (event, context) => {
    // Your handler logic
  },
  {
    operation: 'artifact-check',
    businessMetrics: ['ArtifactChecksStarted', 'ApiLatency']
  }
);

// SQS handler
export const handler = withSqsMonitoring(
  async (event, context) => {
    // Your handler logic
  },
  {
    operation: 'process-queue',
    businessMetrics: ['MessagesProcessed']
  }
);
```

### 4. Infrastructure Monitoring (`infrastructure/src/constructs/monitoring.ts`)

**Features:**
- CloudWatch dashboards
- Metric filters and alarms
- SNS topic configuration
- Slack notification integration
- Log group management

**Components:**
- **Dashboard**: Real-time system overview
- **Alarms**: Error rate, duration, throttling, business metrics
- **Log Groups**: Structured with retention policies
- **Metric Filters**: Automatic metric extraction from logs

### 5. X-Ray Tracing (`infrastructure/src/constructs/xray-tracing.ts`)

**Features:**
- Sampling rule configuration
- Service map annotations
- Distributed request tracing
- Performance bottleneck identification

### 6. Auto-Scaling (`infrastructure/src/constructs/auto-scaling.ts`)

**Features:**
- Lambda provisioned concurrency
- DynamoDB capacity scaling
- ECS service scaling
- Custom metric-based scaling

## Metrics and Alarms

### System Metrics

| Metric | Namespace | Description | Alarm Threshold |
|--------|-----------|-------------|-----------------|
| Invocations | AWS/Lambda | Function invocation count | N/A |
| Errors | AWS/Lambda | Function error count | ≥5 in 10 min |
| Duration | AWS/Lambda | Function execution time | ≥80% of timeout |
| Throttles | AWS/Lambda | Function throttling | ≥1 |
| ConcurrentExecutions | AWS/Lambda | Concurrent executions | ≥80% of reserved |

### Business Metrics

| Metric | Namespace | Description | Alarm Threshold |
|--------|-----------|-------------|-----------------|
| ArtifactChecksStarted | AiAgent/Business | Artifact checks initiated | N/A |
| ArtifactChecksCompleted | AiAgent/Business | Artifact checks completed | N/A |
| ArtifactChecksFailed | AiAgent/Business | Artifact checks failed | N/A |
| ComplianceScoreAverage | AiAgent/Business | Average compliance score | <70% |
| CriticalIssuesFound | AiAgent/Business | Critical issues detected | ≥10 in 15 min |
| AverageProcessingTime | AiAgent/Business | Average processing time | N/A |

### Custom Metrics

| Metric | Namespace | Description |
|--------|-----------|-------------|
| ErrorCount | AiAgent/Lambda | Errors by type and function |
| RetryAttempts | AiAgent/Lambda | Retry attempts by operation |
| CircuitBreakerState | AiAgent/Lambda | Circuit breaker status |
| HealthCheck | AiAgent/Lambda | Service health status |

## Dashboards

### Main Dashboard (`ai-agent-{stage}`)

**Widgets:**
1. **System Overview**: Function invocations, errors, duration
2. **Business Metrics**: Artifact checks, compliance scores
3. **Error Analysis**: Error distribution by type
4. **Performance**: Operation latencies, retry patterns
5. **Health Score**: Success rate calculation

### Custom Queries (CloudWatch Insights)

See `infrastructure/cloudwatch-insights-queries.md` for comprehensive query examples:
- Error analysis and distribution
- Performance bottleneck identification
- User activity patterns
- Retry and circuit breaker analysis
- Security and audit queries

## Alerting

### Notification Channels

1. **Email**: Critical and high-severity alerts
2. **Slack**: All severity levels with formatted messages
3. **SNS**: Integration with external systems

### Alert Severity Levels

- **Critical**: System down, data loss, security breach
- **High**: High error rates, performance degradation
- **Medium**: Moderate issues, warnings
- **Low**: Informational, maintenance notifications

### Escalation Policy

```
Critical → Immediate (Slack + Email) → 5min (PagerDuty) → 15min (Phone)
High     → Immediate (Slack) → 10min (Email) → 30min (PagerDuty)
Medium   → Immediate (Slack) → 1hour (Email)
Low      → Slack only
```

## X-Ray Tracing

### Sampling Rules

- **Production**: 10% sampling rate, 1 request/second reservoir
- **Development**: 50% sampling rate, 2 requests/second reservoir

### Annotations (Filterable)

- `operation`: Business operation name
- `stage`: Environment (prod, staging, dev)
- `functionName`: Lambda function name
- `userId`: User identifier
- `teamId`: Team identifier
- `artifactType`: Type of artifact being processed
- `errorType`: Classification of errors
- `correlationId`: Request correlation ID

### Metadata (Detailed Analysis)

- Request/response payloads
- Performance metrics
- Error details and stack traces
- Business context information

## Auto-Scaling Configuration

### Lambda Functions

**Production:**
- Artifact Check: 2-50 concurrent, target 10
- Agent Query: 3-75 concurrent, target 15
- Kendra Search: 2-40 concurrent, target 8

**Staging:**
- Reduced capacity with same scaling patterns

### DynamoDB Tables

**Auto-scaling targets:**
- Read capacity: 70% utilization
- Write capacity: 70% utilization
- Scale-out: 1 minute cooldown
- Scale-in: 5 minutes cooldown

### ECS Services

**Scaling metrics:**
- CPU utilization: 60% target
- Memory utilization: 70% target
- Queue depth: 10 messages per task

## Deployment

### Prerequisites

1. AWS CLI configured
2. AWS CDK installed
3. Node.js 18+ installed
4. Appropriate AWS permissions

### Deploy Monitoring

```bash
# Set environment variables
export STAGE=prod
export ALERT_EMAIL=ops-team@company.com
export SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Deploy infrastructure with monitoring
cd infrastructure
cdk deploy --parameters alertEmail=$ALERT_EMAIL --parameters slackWebhookUrl=$SLACK_WEBHOOK_URL
```

### Configure CloudWatch Insights Queries

```bash
# Create saved queries
aws logs put-query-definition \
  --name "AI-Agent-Recent-Errors-$STAGE" \
  --query-string 'fields @timestamp, level, message, context.errorType | filter level = "ERROR" | sort @timestamp desc | limit 50'
```

## Troubleshooting

### Common Issues

1. **High Error Rate**
   - Check CloudWatch dashboard
   - Run error analysis queries
   - Review X-Ray service map
   - Check external service status

2. **High Latency**
   - Review performance dashboard
   - Analyze X-Ray traces
   - Check auto-scaling metrics
   - Monitor database connections

3. **Circuit Breaker Tripped**
   - Identify affected service
   - Check downstream health
   - Review error patterns
   - Verify recovery before reset

### Monitoring Health

```bash
# Check alarm status
aws cloudwatch describe-alarms --state-value ALARM

# View recent metrics
aws cloudwatch get-metric-statistics \
  --namespace AiAgent/Business \
  --metric-name ArtifactChecksStarted \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Query logs
aws logs start-query \
  --log-group-name /aws/lambda/ai-agent-artifact-check-prod \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, level, message | filter level = "ERROR"'
```

## Best Practices

### Logging

1. Use structured JSON logging
2. Include correlation IDs in all logs
3. Log at appropriate levels (ERROR, WARN, INFO, DEBUG)
4. Include business context in log messages
5. Avoid logging sensitive information

### Metrics

1. Use consistent naming conventions
2. Include relevant dimensions
3. Set appropriate alarm thresholds
4. Monitor both technical and business metrics
5. Use percentiles for latency metrics

### Tracing

1. Add meaningful annotations
2. Create subsegments for major operations
3. Include error details in traces
4. Use sampling to control costs
5. Correlate traces with logs

### Alerting

1. Set actionable alert thresholds
2. Include context in alert messages
3. Use appropriate escalation policies
4. Test alert channels regularly
5. Document runbooks for common issues

## Cost Optimization

### CloudWatch Costs

- Use log retention policies
- Optimize metric publishing frequency
- Use metric filters instead of custom metrics where possible
- Monitor CloudWatch usage and costs

### X-Ray Costs

- Configure appropriate sampling rates
- Use annotations judiciously
- Clean up old traces regularly
- Monitor X-Ray usage

### Auto-Scaling

- Set appropriate minimum capacities
- Use predictive scaling where possible
- Monitor scaling events and costs
- Optimize scaling policies based on usage patterns

## Security Considerations

### Log Security

- Encrypt logs at rest using KMS
- Implement log access controls
- Mask sensitive data in logs
- Monitor log access patterns

### Metrics Security

- Use IAM policies for metric access
- Encrypt metric data in transit
- Monitor metric publishing patterns
- Implement metric data retention policies

### Alerting Security

- Secure notification channels
- Implement alert authentication
- Monitor alert delivery
- Use encrypted communication channels

## Maintenance

### Regular Tasks

1. Review and update alarm thresholds
2. Clean up old log groups and metrics
3. Update CloudWatch Insights queries
4. Test alert channels and escalation
5. Review and optimize costs
6. Update monitoring documentation

### Quarterly Reviews

1. Analyze monitoring effectiveness
2. Review business metric relevance
3. Update auto-scaling configurations
4. Assess cost optimization opportunities
5. Update runbooks and procedures

This comprehensive monitoring system provides full observability into the AI Agent system, enabling proactive issue detection, rapid troubleshooting, and continuous performance optimization.