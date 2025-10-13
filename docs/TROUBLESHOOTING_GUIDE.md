# Work Task Analysis System - Troubleshooting and Maintenance Guide

## Overview

This guide provides comprehensive troubleshooting procedures and maintenance guidelines for the Work Task Intelligent Analysis System. It's designed for system administrators, DevOps engineers, and support teams.

## Table of Contents

- [System Health Monitoring](#system-health-monitoring)
- [Common Issues and Solutions](#common-issues-and-solutions)
- [Performance Troubleshooting](#performance-troubleshooting)
- [Database Issues](#database-issues)
- [API and Integration Issues](#api-and-integration-issues)
- [Quality Assessment Problems](#quality-assessment-problems)
- [Maintenance Procedures](#maintenance-procedures)
- [Disaster Recovery](#disaster-recovery)
- [Monitoring and Alerts](#monitoring-and-alerts)

---

## System Health Monitoring

### Health Check Endpoints

**System Health**:
```bash
curl https://api.yourdomain.com/health
```

Expected Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-05T10:30:00Z",
  "services": {
    "api": "healthy",
    "database": "healthy",
    "s3": "healthy",
    "kendra": "healthy",
    "stepFunctions": "healthy"
  },
  "metrics": {
    "responseTime": 45,
    "activeConnections": 127,
    "queueDepth": 3
  }
}
```

### Key Metrics to Monitor

**Application Metrics**:
- API response time (target: < 200ms)
- Error rate (target: < 1%)
- Request throughput (requests/second)
- Active WebSocket connections
- Queue depth for async processing

**Infrastructure Metrics**:
- CPU utilization (target: < 70%)
- Memory usage (target: < 80%)
- Disk I/O
- Network throughput
- Lambda function duration and errors

**Business Metrics**:
- Tasks submitted per hour
- Analysis completion rate
- Average analysis time
- Quality check pass rate
- User satisfaction score

### Monitoring Dashboard

Access CloudWatch dashboard:
```bash
aws cloudwatch get-dashboard --dashboard-name WorkTaskAnalysis
```

Key widgets to monitor:
1. API Gateway request count and latency
2. Lambda function errors and duration
3. DynamoDB read/write capacity
4. S3 bucket metrics
5. Step Functions execution status

---

## Common Issues and Solutions

### Issue 1: Task Analysis Timeout

**Symptoms**:
- Analysis takes longer than 2 minutes
- Users receive timeout errors
- Step Functions execution shows timeout

**Diagnosis**:
```bash
# Check Step Functions execution
aws stepfunctions describe-execution \
  --execution-arn arn:aws:states:region:account:execution:WorkTaskAnalysis:execution-id

# Check Lambda logs
aws logs tail /aws/lambda/WorkTaskAnalysis --follow
```

**Common Causes**:
1. Large task content (> 50KB)
2. Kendra search timeout
3. Lambda function cold start
4. Insufficient Lambda memory

**Solutions**:

1. **Increase Lambda timeout**:
```bash
aws lambda update-function-configuration \
  --function-name WorkTaskAnalysis \
  --timeout 180
```

2. **Increase Lambda memory**:
```bash
aws lambda update-function-configuration \
  --function-name WorkTaskAnalysis \
  --memory-size 2048
```

3. **Enable Lambda provisioned concurrency**:
```bash
aws lambda put-provisioned-concurrency-config \
  --function-name WorkTaskAnalysis \
  --provisioned-concurrent-executions 5 \
  --qualifier LATEST
```

4. **Optimize Kendra search**:
```javascript
// Reduce search result limit
const searchParams = {
  IndexId: kendraIndexId,
  QueryText: query,
  PageSize: 10, // Reduce from 50
  AttributeFilter: {
    // Add filters to narrow search
  }
};
```

---

### Issue 2: High API Error Rate

**Symptoms**:
- 5xx errors in API Gateway
- Users unable to submit tasks
- Increased error logs

**Diagnosis**:
```bash
# Check API Gateway errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 5XXError \
  --dimensions Name=ApiName,Value=WorkTaskAPI \
  --start-time 2025-01-05T00:00:00Z \
  --end-time 2025-01-05T23:59:59Z \
  --period 300 \
  --statistics Sum

# Check Lambda errors
aws logs filter-pattern "ERROR" \
  --log-group-name /aws/lambda/WorkTaskAPI \
  --start-time 1h
```

**Common Causes**:
1. Database connection pool exhausted
2. Lambda function errors
3. Dependency service failures
4. Rate limiting issues

**Solutions**:

1. **Check database connections**:
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Kill idle connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND state_change < current_timestamp - INTERVAL '5 minutes';
```

2. **Increase connection pool size**:
```javascript
const pool = new Pool({
  max: 20, // Increase from 10
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

3. **Enable Lambda reserved concurrency**:
```bash
aws lambda put-function-concurrency \
  --function-name WorkTaskAPI \
  --reserved-concurrent-executions 100
```

4. **Check dependency services**:
```bash
# Test Kendra
aws kendra query --index-id <index-id> --query-text "test"

# Test DynamoDB
aws dynamodb describe-table --table-name work_tasks

# Test S3
aws s3 ls s3://work-task-bucket/
```

---

### Issue 3: Deliverable Upload Failures

**Symptoms**:
- File uploads fail or timeout
- 413 Payload Too Large errors
- Incomplete uploads

**Diagnosis**:
```bash
# Check S3 bucket metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name 4xxErrors \
  --dimensions Name=BucketName,Value=work-task-bucket \
  --start-time 1h \
  --period 300 \
  --statistics Sum

# Check API Gateway payload size
aws logs filter-pattern "413" \
  --log-group-name /aws/apigateway/WorkTaskAPI
```

**Common Causes**:
1. File exceeds size limit
2. Network timeout
3. S3 bucket permissions
4. API Gateway payload limit

**Solutions**:

1. **Implement multipart upload**:
```javascript
const uploadLargeFile = async (file) => {
  const multipartUpload = await s3.createMultipartUpload({
    Bucket: bucketName,
    Key: key,
  }).promise();

  const partSize = 5 * 1024 * 1024; // 5MB chunks
  const parts = [];

  for (let i = 0; i < file.size; i += partSize) {
    const chunk = file.slice(i, i + partSize);
    const partNumber = Math.floor(i / partSize) + 1;

    const uploadPart = await s3.uploadPart({
      Bucket: bucketName,
      Key: key,
      PartNumber: partNumber,
      UploadId: multipartUpload.UploadId,
      Body: chunk,
    }).promise();

    parts.push({
      ETag: uploadPart.ETag,
      PartNumber: partNumber,
    });
  }

  await s3.completeMultipartUpload({
    Bucket: bucketName,
    Key: key,
    UploadId: multipartUpload.UploadId,
    MultipartUpload: { Parts: parts },
  }).promise();
};
```

2. **Use presigned URLs for large files**:
```javascript
const getPresignedUrl = async (fileName) => {
  const params = {
    Bucket: bucketName,
    Key: `deliverables/${fileName}`,
    Expires: 3600, // 1 hour
  };

  return s3.getSignedUrl('putObject', params);
};
```

3. **Increase API Gateway timeout**:
```bash
aws apigateway update-integration \
  --rest-api-id <api-id> \
  --resource-id <resource-id> \
  --http-method POST \
  --patch-operations op=replace,path=/timeoutInMillis,value=29000
```

---

### Issue 4: Quality Assessment Failures

**Symptoms**:
- Quality checks fail unexpectedly
- Incorrect quality scores
- Assessment timeouts

**Diagnosis**:
```bash
# Check quality assessment logs
aws logs tail /aws/lambda/QualityAssessment --follow

# Check rules engine status
aws logs filter-pattern "RulesEngine" \
  --log-group-name /aws/lambda/QualityAssessment
```

**Common Causes**:
1. Invalid quality standards configuration
2. File parsing errors
3. Rules engine timeout
4. Missing dependencies

**Solutions**:

1. **Validate quality standards**:
```javascript
const validateStandards = async (standards) => {
  for (const standard of standards) {
    const config = await getStandardConfig(standard);
    if (!config) {
      throw new Error(`Standard not found: ${standard}`);
    }
  }
};
```

2. **Add error handling for file parsing**:
```javascript
const parseFile = async (file) => {
  try {
    const content = await readFile(file);
    return parseContent(content);
  } catch (error) {
    logger.error('File parsing failed', { file, error });
    return {
      success: false,
      error: 'Unable to parse file',
      details: error.message,
    };
  }
};
```

3. **Implement timeout handling**:
```javascript
const assessWithTimeout = async (deliverable, timeout = 30000) => {
  return Promise.race([
    performAssessment(deliverable),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Assessment timeout')), timeout)
    ),
  ]);
};
```

---

### Issue 5: WebSocket Connection Issues

**Symptoms**:
- Clients unable to connect
- Frequent disconnections
- Missing real-time updates

**Diagnosis**:
```bash
# Check API Gateway WebSocket metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name ConnectCount \
  --dimensions Name=ApiName,Value=WorkTaskWebSocket \
  --start-time 1h \
  --period 300 \
  --statistics Sum

# Check connection errors
aws logs filter-pattern "WebSocket" \
  --log-group-name /aws/apigateway/WorkTaskWebSocket
```

**Common Causes**:
1. Connection limit reached
2. Lambda function errors
3. Network issues
4. Authentication failures

**Solutions**:

1. **Increase connection limit**:
```bash
aws apigatewayv2 update-stage \
  --api-id <api-id> \
  --stage-name production \
  --throttle-settings RateLimit=1000,BurstLimit=2000
```

2. **Implement connection pooling**:
```javascript
class WebSocketManager {
  constructor() {
    this.connections = new Map();
    this.maxConnections = 10000;
  }

  addConnection(connectionId, metadata) {
    if (this.connections.size >= this.maxConnections) {
      throw new Error('Connection limit reached');
    }
    this.connections.set(connectionId, metadata);
  }

  removeConnection(connectionId) {
    this.connections.delete(connectionId);
  }

  getConnectionCount() {
    return this.connections.size;
  }
}
```

3. **Add reconnection logic**:
```javascript
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
      }
    };

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };
  }
}
```

---

## Performance Troubleshooting

### Slow API Response Times

**Diagnosis**:
```bash
# Check API Gateway latency
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiName,Value=WorkTaskAPI \
  --start-time 1h \
  --period 60 \
  --statistics Average,Maximum

# Enable X-Ray tracing
aws xray get-trace-summaries \
  --start-time 2025-01-05T00:00:00Z \
  --end-time 2025-01-05T23:59:59Z
```

**Optimization Strategies**:

1. **Add caching**:
```javascript
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

const getCachedData = async (key, fetchFn) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
};
```

2. **Optimize database queries**:
```sql
-- Add indexes
CREATE INDEX idx_work_tasks_status ON work_tasks(status);
CREATE INDEX idx_work_tasks_team_id ON work_tasks(team_id);
CREATE INDEX idx_todo_items_task_id ON todo_items(task_id);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM work_tasks WHERE status = 'in_progress';
```

3. **Enable DynamoDB DAX**:
```bash
aws dax create-cluster \
  --cluster-name work-task-cache \
  --node-type dax.r4.large \
  --replication-factor 3 \
  --iam-role-arn arn:aws:iam::account:role/DAXRole
```

4. **Implement connection pooling**:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### High Memory Usage

**Diagnosis**:
```bash
# Check Lambda memory usage
aws logs filter-pattern "Memory Used" \
  --log-group-name /aws/lambda/WorkTaskAnalysis \
  --start-time 1h

# Get memory statistics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name MemoryUtilization \
  --dimensions Name=FunctionName,Value=WorkTaskAnalysis \
  --start-time 1h \
  --period 300 \
  --statistics Average,Maximum
```

**Solutions**:

1. **Optimize memory usage**:
```javascript
// Stream large files instead of loading into memory
const stream = require('stream');
const { pipeline } = require('stream/promises');

const processLargeFile = async (s3Key) => {
  const s3Stream = s3.getObject({
    Bucket: bucketName,
    Key: s3Key,
  }).createReadStream();

  const processStream = new stream.Transform({
    transform(chunk, encoding, callback) {
      // Process chunk
      callback(null, processChunk(chunk));
    },
  });

  await pipeline(s3Stream, processStream, outputStream);
};
```

2. **Implement pagination**:
```javascript
const getPaginatedResults = async (query, pageSize = 100) => {
  let lastEvaluatedKey = null;
  const results = [];

  do {
    const params = {
      ...query,
      Limit: pageSize,
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.query(params).promise();
    results.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return results;
};
```

---

## Database Issues

### DynamoDB Throttling

**Symptoms**:
- ProvisionedThroughputExceededException errors
- Slow read/write operations
- Increased latency

**Diagnosis**:
```bash
# Check throttled requests
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=work_tasks \
  --start-time 1h \
  --period 300 \
  --statistics Sum
```

**Solutions**:

1. **Enable auto-scaling**:
```bash
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id table/work_tasks \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --min-capacity 5 \
  --max-capacity 100

aws application-autoscaling put-scaling-policy \
  --service-namespace dynamodb \
  --resource-id table/work_tasks \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --policy-name work-tasks-read-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
    '{"TargetValue":70.0,"PredefinedMetricSpecification":{"PredefinedMetricType":"DynamoDBReadCapacityUtilization"}}'
```

2. **Switch to on-demand mode**:
```bash
aws dynamodb update-table \
  --table-name work_tasks \
  --billing-mode PAY_PER_REQUEST
```

3. **Implement exponential backoff**:
```javascript
const dynamodbWithRetry = async (operation, maxRetries = 5) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'ProvisionedThroughputExceededException' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};
```

### Data Consistency Issues

**Diagnosis**:
```javascript
// Check for inconsistencies
const verifyDataConsistency = async (taskId) => {
  const task = await getTask(taskId);
  const todos = await getTodos(taskId);
  const deliverables = await getDeliverables(taskId);

  // Verify todo count matches
  if (task.todoCount !== todos.length) {
    console.error('Todo count mismatch', { taskId, expected: task.todoCount, actual: todos.length });
  }

  // Verify deliverable references
  for (const todo of todos) {
    for (const delivId of todo.deliverables) {
      const deliv = deliverables.find(d => d.deliverableId === delivId);
      if (!deliv) {
        console.error('Missing deliverable', { todoId: todo.todoId, deliverableId: delivId });
      }
    }
  }
};
```

**Solutions**:

1. **Implement transactions**:
```javascript
const updateTaskWithTodos = async (taskId, updates) => {
  const transactItems = [
    {
      Update: {
        TableName: 'work_tasks',
        Key: { task_id: taskId },
        UpdateExpression: 'SET #status = :status, updated_at = :timestamp',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': updates.status,
          ':timestamp': new Date().toISOString(),
        },
      },
    },
    ...updates.todos.map(todo => ({
      Update: {
        TableName: 'todo_items',
        Key: { todo_id: todo.todoId },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': todo.status },
      },
    })),
  ];

  await dynamodb.transactWrite({ TransactItems: transactItems }).promise();
};
```

2. **Add data validation**:
```javascript
const validateTaskData = (task) => {
  const errors = [];

  if (!task.task_id) errors.push('Missing task_id');
  if (!task.title) errors.push('Missing title');
  if (!['submitted', 'analyzing', 'analyzed', 'in_progress', 'completed'].includes(task.status)) {
    errors.push('Invalid status');
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
};
```

---

## API and Integration Issues

### Authentication Failures

**Diagnosis**:
```bash
# Check authentication errors
aws logs filter-pattern "401" \
  --log-group-name /aws/apigateway/WorkTaskAPI \
  --start-time 1h
```

**Solutions**:

1. **Verify JWT token**:
```javascript
const jwt = require('jsonwebtoken');

const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};
```

2. **Implement token refresh**:
```javascript
const refreshToken = async (refreshToken) => {
  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  
  const newAccessToken = jwt.sign(
    { userId: decoded.userId, email: decoded.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return newAccessToken;
};
```

### Rate Limiting Issues

**Diagnosis**:
```bash
# Check rate limit errors
aws logs filter-pattern "429" \
  --log-group-name /aws/apigateway/WorkTaskAPI
```

**Solutions**:

1. **Adjust rate limits**:
```bash
aws apigateway update-usage-plan \
  --usage-plan-id <plan-id> \
  --patch-operations \
    op=replace,path=/throttle/rateLimit,value=1000 \
    op=replace,path=/throttle/burstLimit,value=2000
```

2. **Implement client-side throttling**:
```javascript
class ThrottledClient {
  constructor(maxRequestsPerSecond = 10) {
    this.maxRequests = maxRequestsPerSecond;
    this.requests = [];
  }

  async request(fn) {
    await this.waitForSlot();
    this.requests.push(Date.now());
    return fn();
  }

  async waitForSlot() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 1000);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = 1000 - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot();
    }
  }
}
```

---

## Maintenance Procedures

### Regular Maintenance Tasks

**Daily**:
- [ ] Check system health dashboard
- [ ] Review error logs
- [ ] Monitor key metrics
- [ ] Verify backup completion

**Weekly**:
- [ ] Review performance trends
- [ ] Analyze slow queries
- [ ] Check disk space usage
- [ ] Update security patches

**Monthly**:
- [ ] Review and optimize costs
- [ ] Analyze usage patterns
- [ ] Update documentation
- [ ] Conduct security audit

### Database Maintenance

**Vacuum and Analyze** (for RDS PostgreSQL):
```sql
-- Run during low-traffic periods
VACUUM ANALYZE work_tasks;
VACUUM ANALYZE todo_items;
VACUUM ANALYZE deliverables;
```

**DynamoDB Table Cleanup**:
```javascript
// Remove expired items
const cleanupExpiredItems = async () => {
  const now = Math.floor(Date.now() / 1000);
  
  const params = {
    TableName: 'work_tasks',
    FilterExpression: 'ttl < :now',
    ExpressionAttributeValues: { ':now': now },
  };

  const items = await dynamodb.scan(params).promise();
  
  for (const item of items.Items) {
    await dynamodb.delete({
      TableName: 'work_tasks',
      Key: { task_id: item.task_id },
    }).promise();
  }
};
```

### Log Rotation

```bash
# Configure log retention
aws logs put-retention-policy \
  --log-group-name /aws/lambda/WorkTaskAnalysis \
  --retention-in-days 30

# Export logs to S3
aws logs create-export-task \
  --log-group-name /aws/lambda/WorkTaskAnalysis \
  --from 1704067200000 \
  --to 1704153600000 \
  --destination work-task-logs \
  --destination-prefix lambda-logs/
```

### Backup Procedures

**DynamoDB Backup**:
```bash
# Create on-demand backup
aws dynamodb create-backup \
  --table-name work_tasks \
  --backup-name work-tasks-backup-$(date +%Y%m%d)

# Enable point-in-time recovery
aws dynamodb update-continuous-backups \
  --table-name work_tasks \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

**S3 Backup**:
```bash
# Enable versioning
aws s3api put-bucket-versioning \
  --bucket work-task-bucket \
  --versioning-configuration Status=Enabled

# Configure lifecycle policy
aws s3api put-bucket-lifecycle-configuration \
  --bucket work-task-bucket \
  --lifecycle-configuration file://lifecycle-policy.json
```

---

## Disaster Recovery

### Recovery Time Objective (RTO): 4 hours
### Recovery Point Objective (RPO): 1 hour

### Disaster Recovery Plan

**Phase 1: Assessment** (15 minutes)
1. Identify scope of outage
2. Determine affected services
3. Notify stakeholders
4. Activate DR team

**Phase 2: Failover** (1 hour)
1. Switch to backup region
2. Restore from latest backup
3. Update DNS records
4. Verify service functionality

**Phase 3: Recovery** (2 hours)
1. Restore full functionality
2. Sync data from backup
3. Verify data integrity
4. Resume normal operations

**Phase 4: Post-Mortem** (1 hour)
1. Document incident
2. Identify root cause
3. Implement preventive measures
4. Update DR procedures

### Failover Procedures

**Database Failover**:
```bash
# Promote read replica to primary
aws rds promote-read-replica \
  --db-instance-identifier work-task-db-replica

# Update application configuration
aws ssm put-parameter \
  --name /worktask/db/endpoint \
  --value new-db-endpoint \
  --overwrite
```

**Region Failover**:
```bash
# Update Route53 to point to backup region
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch file://failover-dns.json
```

---

## Monitoring and Alerts

### CloudWatch Alarms

**High Error Rate**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name WorkTask-HighErrorRate \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name 5XXError \
  --namespace AWS/ApiGateway \
  --statistic Sum \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:region:account:WorkTask-Alerts
```

**High Latency**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name WorkTask-HighLatency \
  --alarm-description "Alert when latency exceeds 2 seconds" \
  --metric-name Latency \
  --namespace AWS/ApiGateway \
  --statistic Average \
  --period 300 \
  --threshold 2000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:region:account:WorkTask-Alerts
```

### Log Insights Queries

**Error Analysis**:
```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)
```

**Performance Analysis**:
```
fields @timestamp, @duration
| filter @type = "REPORT"
| stats avg(@duration), max(@duration), min(@duration) by bin(5m)
```

**User Activity**:
```
fields @timestamp, userId, action
| filter action in ["task_submit", "deliverable_upload", "quality_check"]
| stats count() by action, bin(1h)
```

---

## Support Escalation

### Severity Levels

**P1 - Critical** (Response: 15 minutes)
- System completely down
- Data loss or corruption
- Security breach

**P2 - High** (Response: 1 hour)
- Major feature unavailable
- Significant performance degradation
- Affecting multiple users

**P3 - Medium** (Response: 4 hours)
- Minor feature issues
- Workaround available
- Affecting few users

**P4 - Low** (Response: 24 hours)
- Cosmetic issues
- Feature requests
- Documentation updates

### Contact Information

- **On-Call Engineer**: +1-555-0100
- **DevOps Team**: devops@company.com
- **Security Team**: security@company.com
- **Slack Channel**: #worktask-incidents

---

**Last Updated**: January 5, 2025
