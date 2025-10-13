# Work Task Analysis System - Quick Reference Guide

## Quick Links

- **[User Guide](USER_GUIDE.md)** - How to use the system
- **[API Reference](API_REFERENCE.md)** - API documentation
- **[Integration Guide](INTEGRATION_GUIDE.md)** - Integration instructions
- **[Troubleshooting](TROUBLESHOOTING_GUIDE.md)** - Problem resolution
- **[Architecture](ARCHITECTURE.md)** - System design
- **[Best Practices](BEST_PRACTICES.md)** - Recommended practices

---

## Common Tasks

### For Users

**Submit a Task**
1. Click "New Task"
2. Fill in title, description, content
3. Set priority and tags
4. Click "Submit"

**Check Analysis Results**
1. Go to task detail page
2. View key points, workgroups, todos
3. Review knowledge base references

**Update Todo Status**
1. Click on todo item
2. Select new status
3. Add notes (optional)
4. Click "Update"

**Submit Deliverable**
1. Navigate to todo item
2. Click "Submit Deliverable"
3. Upload file(s)
4. Add description
5. Click "Submit"

### For Developers

**Make API Call**
```javascript
const response = await fetch('https://api.yourdomain.com/api/v1/work-tasks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Task title',
    content: 'Task content',
    priority: 'high'
  })
});
```

**Use SDK**
```javascript
import { WorkTaskClient } from '@company/work-task-analysis-sdk';

const client = new WorkTaskClient({
  apiUrl: 'https://api.yourdomain.com/api/v1',
  accessToken: 'your-token'
});

const task = await client.tasks.create({
  title: 'Task title',
  content: 'Task content'
});
```

**Connect WebSocket**
```javascript
const ws = new WebSocket('wss://api.yourdomain.com/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### For Administrators

**Check System Health**
```bash
curl https://api.yourdomain.com/health
```

**View Logs**
```bash
aws logs tail /aws/lambda/WorkTaskAnalysis --follow
```

**Check Metrics**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --start-time 1h \
  --period 300 \
  --statistics Average
```

---

## API Endpoints

### Tasks
- `POST /work-tasks` - Create task
- `GET /work-tasks/{id}` - Get task
- `GET /work-tasks/{id}/analysis` - Get analysis
- `GET /work-tasks` - List tasks
- `PUT /work-tasks/{id}/status` - Update status

### Todos
- `GET /work-tasks/{id}/todos` - Get todos
- `PUT /todos/{id}/status` - Update status
- `POST /todos/{id}/deliverables` - Submit deliverable

### Quality
- `POST /deliverables/{id}/quality-check` - Run check
- `GET /deliverables/{id}/quality-report` - Get report

### Progress
- `GET /work-tasks/{id}/progress` - Get progress
- `GET /work-tasks/{id}/progress-report` - Generate report

---

## Status Codes

### Task Status
- `submitted` - Task received
- `analyzing` - Analysis in progress
- `analyzed` - Analysis complete
- `in_progress` - Work started
- `completed` - All done

### Todo Status
- `pending` - Not started
- `in_progress` - Being worked on
- `completed` - Finished
- `blocked` - Cannot proceed

### Deliverable Status
- `submitted` - Uploaded
- `validating` - Being checked
- `approved` - Passed checks
- `rejected` - Failed checks
- `needs_revision` - Needs fixes

---

## Error Codes

- `400` - Bad Request (invalid input)
- `401` - Unauthorized (auth failed)
- `403` - Forbidden (no permission)
- `404` - Not Found (resource missing)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## Keyboard Shortcuts

- `Ctrl/Cmd + N` - New task
- `Ctrl/Cmd + S` - Save draft
- `Ctrl/Cmd + Enter` - Submit
- `Ctrl/Cmd + /` - Search
- `Esc` - Close modal

---

## Configuration

### Environment Variables
```bash
API_URL=https://api.yourdomain.com/api/v1
WS_URL=wss://api.yourdomain.com/ws
AUTH_URL=https://auth.yourdomain.com
```

### SDK Configuration
```javascript
const client = new WorkTaskClient({
  apiUrl: process.env.API_URL,
  accessToken: getToken(),
  timeout: 30000,
  retries: 3
});
```

---

## Troubleshooting

### Task Analysis Timeout
**Problem**: Analysis takes too long
**Solution**: Check task size, reduce content if > 50KB

### Upload Fails
**Problem**: File upload fails
**Solution**: Check file size (max 100MB), use multipart for large files

### Authentication Error
**Problem**: 401 Unauthorized
**Solution**: Check token validity, refresh if expired

### Rate Limit
**Problem**: 429 Too Many Requests
**Solution**: Implement exponential backoff, reduce request rate

---

## Support

- **Email**: support@company.com
- **Slack**: #work-task-support
- **Docs**: https://docs.company.com
- **Status**: https://status.company.com

---

## Useful Commands

### Check API Health
```bash
curl https://api.yourdomain.com/health
```

### Test Authentication
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/api/v1/work-tasks
```

### View Logs
```bash
aws logs tail /aws/lambda/WorkTaskAnalysis --follow
```

### Check Database
```bash
aws dynamodb describe-table --table-name work_tasks
```

### Monitor Metrics
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 5XXError \
  --start-time 1h \
  --period 300 \
  --statistics Sum
```

---

**Last Updated**: January 5, 2025
