# Work Task Alerting System - Quick Start Guide

## Overview
This guide provides quick instructions for setting up and using the Work Task alerting and notification system.

## Prerequisites
- AWS account with CloudWatch and SNS access
- Node.js and TypeScript installed
- AWS credentials configured
- (Optional) Slack workspace with webhook access
- (Optional) Microsoft Teams with webhook access
- (Optional) AWS SES configured for email

## Quick Setup

### 1. Configure SNS Topics

Create SNS topics for each severity level:

```bash
# Critical alerts (24/7 on-call)
aws sns create-topic --name work-task-critical-alerts

# High priority alerts (business hours)
aws sns create-topic --name work-task-high-alerts

# Medium priority alerts (investigation)
aws sns create-topic --name work-task-medium-alerts

# Low priority alerts (monitoring)
aws sns create-topic --name work-task-low-alerts
```

Subscribe to topics:

```bash
# Subscribe email to critical alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:work-task-critical-alerts \
  --protocol email \
  --notification-endpoint oncall@example.com

# Subscribe SMS to critical alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:work-task-critical-alerts \
  --protocol sms \
  --notification-endpoint +1234567890
```

### 2. Configure Environment Variables

Create or update `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1

# SNS Topics
SNS_CRITICAL_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:work-task-critical-alerts
SNS_HIGH_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:work-task-high-alerts
SNS_MEDIUM_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:work-task-medium-alerts
SNS_LOW_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:work-task-low-alerts

# Slack (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Microsoft Teams (Optional)
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/YOUR/WEBHOOK/URL

# Email (Optional)
ALERT_FROM_EMAIL=alerts@example.com
ALERT_TO_EMAILS=team@example.com,oncall@example.com
```

### 3. Create Alarms

#### Option A: Create All Alarms

```bash
cd backend
ts-node src/scripts/setup-alerting.ts setup \
  --critical-topic arn:aws:sns:us-east-1:123456789012:work-task-critical-alerts \
  --high-topic arn:aws:sns:us-east-1:123456789012:work-task-high-alerts \
  --medium-topic arn:aws:sns:us-east-1:123456789012:work-task-medium-alerts \
  --low-topic arn:aws:sns:us-east-1:123456789012:work-task-low-alerts
```

#### Option B: Create Alarms by Category

```bash
# Business metrics only
ts-node src/scripts/setup-alerting.ts setup --category business

# Performance metrics only
ts-node src/scripts/setup-alerting.ts setup --category performance

# System health metrics only
ts-node src/scripts/setup-alerting.ts setup --category system

# Data quality metrics only
ts-node src/scripts/setup-alerting.ts setup --category data_quality
```

#### Option C: Create Alarms by Severity

```bash
# Critical alarms only
ts-node src/scripts/setup-alerting.ts setup --severity critical

# High priority alarms only
ts-node src/scripts/setup-alerting.ts setup --severity high
```

### 4. Verify Setup

List created alarms:

```bash
ts-node src/scripts/setup-alerting.ts list
```

View alarm configuration:

```bash
ts-node src/scripts/setup-alerting.ts config
```

### 5. Test Alarms

Test alarm notifications:

```bash
# Create alarms with testing enabled
ts-node src/scripts/setup-alerting.ts setup --test

# Or manually test a specific alarm
aws cloudwatch set-alarm-state \
  --alarm-name WorkTask-HighErrorRate \
  --state-value ALARM \
  --state-reason "Testing alarm notification"
```

## Common Operations

### List All Alarms

```bash
ts-node src/scripts/setup-alerting.ts list
```

Or using AWS CLI:

```bash
aws cloudwatch describe-alarms --alarm-name-prefix "WorkTask-"
```

### Delete All Alarms

```bash
ts-node src/scripts/setup-alerting.ts delete
```

Or delete and recreate:

```bash
ts-node src/scripts/setup-alerting.ts setup --delete-existing
```

### Dry Run (Preview Changes)

```bash
ts-node src/scripts/setup-alerting.ts setup --dry-run
```

### Update SNS Topics

```bash
# Delete existing alarms
ts-node src/scripts/setup-alerting.ts delete

# Recreate with new topics
ts-node src/scripts/setup-alerting.ts setup \
  --critical-topic arn:aws:sns:us-east-1:123456789012:new-critical-topic \
  --high-topic arn:aws:sns:us-east-1:123456789012:new-high-topic
```

## Alarm Categories

### Business Metrics
- High error rate (>5%)
- Low task completion rate (<50%)
- Low quality pass rate (<70%)
- High critical issues (>10 in 5 min)
- Low user satisfaction (<3.0)
- Low quality score (<60)
- No task submissions (2 hours)

### Performance Metrics
- Slow analysis time (>3 minutes)
- High response time (>5 seconds)
- Slow quality check (>1 minute)
- High P99 duration (>10 seconds)
- Slow processing time (>2 minutes)

### System Health
- High operation failures (>20 in 10 min)
- High memory usage (>2GB)
- Error spikes (>50 per minute)
- Low success rate (<90%)
- High issues found (>100 in 20 min)

### Data Quality
- High validation failures (>30 in 20 min)
- Data integrity errors (>5 in 5 min)
- Missing required data (>20 in 20 min)
- Anomalous data patterns (>10 in 15 min)
- Metric inconsistencies (>15 in 30 min)

## Notification Channels

### SNS
- Automatic routing based on severity
- Supports email, SMS, Lambda, SQS, HTTP/S
- Message attributes for filtering
- Reliable delivery with retries

### Slack
- Rich formatted messages with colors
- Emoji indicators for quick identification
- Clickable links to dashboards
- Thread support for discussions

### Microsoft Teams
- Adaptive card formatting
- Color-coded based on severity
- Action buttons for quick response
- Integration with Teams workflows

### Email
- HTML and plain text formats
- Detailed alarm information
- Multiple recipients supported
- Professional formatting

## Severity Levels

### Critical (🚨)
- **Response Time**: Immediate (24/7)
- **Examples**: System failures, data integrity issues
- **Notification**: SNS + Slack + Teams + Email + SMS
- **Escalation**: On-call team paged immediately

### High (🔴)
- **Response Time**: Within 1 hour (business hours)
- **Examples**: Performance degradation, high error rates
- **Notification**: SNS + Slack + Teams + Email
- **Escalation**: Team lead notified

### Medium (🟡)
- **Response Time**: Within 4 hours
- **Examples**: Quality issues, moderate performance issues
- **Notification**: SNS + Slack + Email
- **Escalation**: Added to investigation queue

### Low (🟢)
- **Response Time**: Next business day
- **Examples**: Trend monitoring, minor anomalies
- **Notification**: SNS + Email
- **Escalation**: Dashboard monitoring

## Troubleshooting

### Alarms Not Created

**Check AWS credentials:**
```bash
aws sts get-caller-identity
```

**Check CloudWatch permissions:**
```bash
aws cloudwatch describe-alarms --max-records 1
```

**Run in dry-run mode:**
```bash
ts-node src/scripts/setup-alerting.ts setup --dry-run
```

### Notifications Not Received

**Test SNS topic:**
```bash
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789012:work-task-critical-alerts \
  --message "Test notification"
```

**Check SNS subscriptions:**
```bash
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:123456789012:work-task-critical-alerts
```

**Verify webhook URLs:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}' \
  $SLACK_WEBHOOK_URL
```

### False Positives

**Adjust alarm thresholds:**
Edit `src/monitoring/work-task-alarm-config.ts` and update threshold values.

**Increase evaluation periods:**
Change `evaluationPeriods` to require more consecutive breaches.

**Update treat missing data:**
Change `treatMissingData` to `notBreaching` if appropriate.

## Best Practices

### 1. Start Small
Begin with critical alarms only, then expand:
```bash
ts-node src/scripts/setup-alerting.ts setup --severity critical
```

### 2. Test Thoroughly
Always test alarms before relying on them:
```bash
ts-node src/scripts/setup-alerting.ts setup --test
```

### 3. Document Responses
Create runbooks for each alarm type with:
- What the alarm means
- How to investigate
- How to resolve
- When to escalate

### 4. Review Regularly
- Weekly: Review triggered alarms
- Monthly: Adjust thresholds based on trends
- Quarterly: Review alarm effectiveness

### 5. Use Composite Alarms
For complex scenarios, use composite alarms to reduce noise:
- System degraded = High response time AND (Slow analysis OR High memory)
- Quality issues = Low quality pass rate AND (High critical issues OR Low quality score)

## Integration with Code

### Publishing Metrics

```typescript
import { WorkTaskMetricsService } from './services/work-task-metrics-service';

const metricsService = new WorkTaskMetricsService();

// Publish business metrics
await metricsService.recordTaskSubmission(teamId, priority);
await metricsService.recordTaskCompletion(taskId, duration);
await metricsService.recordQualityCheck(deliverableId, passed, score);

// Publish performance metrics
await metricsService.recordAnalysisTime(taskId, duration);
await metricsService.recordResponseTime(operation, duration);

// Publish system metrics
await metricsService.recordOperationFailure(operation, error);
await metricsService.recordMemoryUsage(bytes);

// Publish data quality metrics
await metricsService.recordValidationFailure(type, reason);
await metricsService.recordDataIntegrityError(type, details);
```

### Handling Alarm Events

```typescript
import { AlarmNotificationService } from './services/alarm-notification-service';

const notificationService = new AlarmNotificationService({
  snsTopicArns: {
    critical: process.env.SNS_CRITICAL_TOPIC_ARN,
    high: process.env.SNS_HIGH_TOPIC_ARN,
  },
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  emailConfig: {
    fromAddress: process.env.ALERT_FROM_EMAIL!,
    toAddresses: process.env.ALERT_TO_EMAILS!.split(','),
  },
});

// Send alarm notification
const result = await notificationService.sendAlarmNotification({
  alarmName: 'WorkTask-HighErrorRate',
  alarmDescription: 'Error rate exceeded threshold',
  newState: 'ALARM',
  oldState: 'OK',
  reason: 'Error rate is 7.5% (threshold: 5%)',
  timestamp: new Date().toISOString(),
  severity: 'high',
  category: 'business',
  metricName: 'SystemErrorRate',
  threshold: 5,
  currentValue: 7.5,
});
```

## Additional Resources

### AWS Documentation
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [SNS Topics](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)
- [Composite Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Create_Composite_Alarm.html)

### Webhook Documentation
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [Teams Incoming Webhooks](https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)

### Internal Documentation
- [Full Implementation Guide](./TASK_23_ALERTING_NOTIFICATION_IMPLEMENTATION.md)
- [Monitoring Quick Start](./MONITORING_QUICK_START.md)
- [Business Metrics Guide](./TASK_22_BUSINESS_METRICS_MONITORING_SUMMARY.md)

## Support

For issues or questions:
1. Check CloudWatch Logs for error details
2. Review alarm configuration in AWS Console
3. Test individual components (SNS, webhooks, etc.)
4. Consult the full implementation documentation
5. Contact the DevOps team for assistance

## Next Steps

After setting up alerting:
1. ✅ Configure SNS topics and subscriptions
2. ✅ Create CloudWatch alarms
3. ✅ Test alarm notifications
4. ✅ Document incident response procedures
5. ✅ Train team on alarm handling
6. ✅ Set up monitoring dashboards
7. ✅ Establish on-call rotation
8. ✅ Review and adjust thresholds regularly
