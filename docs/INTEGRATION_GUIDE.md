# Work Task Analysis System - Integration Guide

## Overview

This guide provides step-by-step instructions for integrating the Work Task Intelligent Analysis System into your applications. Whether you're building a web application, mobile app, or backend service, this guide will help you get started quickly.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Authentication Setup](#authentication-setup)
- [Quick Start](#quick-start)
- [Integration Patterns](#integration-patterns)
- [SDK Usage](#sdk-usage)
- [WebSocket Integration](#websocket-integration)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Example Implementations](#example-implementations)

---

## Prerequisites

Before integrating the Work Task Analysis System, ensure you have:

1. **API Credentials**: Obtain API keys from your administrator
2. **Authentication Token**: Set up JWT token generation
3. **Network Access**: Ensure your application can reach the API endpoints
4. **Dependencies**: Install required libraries (see SDK section)

### Required Permissions

Your API credentials must have the following permissions:
- `work-tasks:read` - Read work tasks
- `work-tasks:write` - Create and update work tasks
- `todos:read` - Read todo items
- `todos:write` - Update todo items
- `deliverables:write` - Submit deliverables
- `quality:read` - View quality assessments

---

## Authentication Setup

### Obtaining JWT Tokens

The system uses JWT tokens for authentication. Tokens can be obtained through your organization's authentication service.

**Example Token Request**:
```javascript
const response = await fetch('https://auth.yourdomain.com/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: 'your-username',
    password: 'your-password',
    clientId: 'your-client-id'
  })
});

const { accessToken, refreshToken, expiresIn } = await response.json();
```

### Token Refresh

Tokens expire after a set period. Implement token refresh logic:

```javascript
async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://auth.yourdomain.com/token/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  return await response.json();
}
```

---

## Quick Start

### 1. Install the SDK

```bash
npm install @company/work-task-analysis-sdk
```

### 2. Initialize the Client

```javascript
import { WorkTaskClient } from '@company/work-task-analysis-sdk';

const client = new WorkTaskClient({
  apiUrl: 'https://api.yourdomain.com/api/v1',
  accessToken: 'your-jwt-token',
  onTokenExpired: async () => {
    // Implement token refresh logic
    const newToken = await refreshAccessToken();
    return newToken;
  }
});
```

### 3. Submit Your First Task

```javascript
async function submitTask() {
  try {
    const task = await client.tasks.create({
      title: 'Implement user authentication',
      description: 'Add OAuth2 authentication with social login',
      content: 'Detailed requirements...',
      priority: 'high',
      category: 'security',
      tags: ['authentication', 'oauth2']
    });

    console.log('Task created:', task.taskId);
    return task;
  } catch (error) {
    console.error('Failed to create task:', error);
  }
}
```

### 4. Monitor Analysis Progress

```javascript
async function monitorAnalysis(taskId) {
  // Poll for analysis completion
  const checkStatus = async () => {
    const analysis = await client.tasks.getAnalysis(taskId);
    
    if (analysis.status === 'analyzed') {
      console.log('Analysis complete!');
      console.log('Key points:', analysis.keyPoints);
      console.log('Todo items:', analysis.todoList);
      return analysis;
    } else if (analysis.status === 'analyzing') {
      console.log('Still analyzing...');
      setTimeout(checkStatus, 5000); // Check again in 5 seconds
    }
  };

  await checkStatus();
}
```

---

## Integration Patterns

### Pattern 1: Synchronous Task Submission

Best for: Interactive applications where users wait for immediate feedback.

```javascript
async function synchronousSubmission(taskData) {
  // Submit task
  const task = await client.tasks.create(taskData);
  
  // Wait for analysis (with timeout)
  const analysis = await client.tasks.waitForAnalysis(task.taskId, {
    timeout: 120000, // 2 minutes
    pollInterval: 3000 // Check every 3 seconds
  });
  
  return { task, analysis };
}
```

### Pattern 2: Asynchronous Task Submission with Webhooks

Best for: Background processing and batch operations.

```javascript
// 1. Configure webhook endpoint
await client.webhooks.register({
  url: 'https://your-app.com/webhooks/task-analysis',
  events: ['analysis.completed', 'analysis.failed']
});

// 2. Submit task
const task = await client.tasks.create(taskData);

// 3. Handle webhook callback
app.post('/webhooks/task-analysis', (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'analysis.completed') {
    console.log('Analysis completed for task:', data.taskId);
    // Process analysis results
    processAnalysisResults(data);
  }
  
  res.status(200).send('OK');
});
```

### Pattern 3: Real-time Updates with WebSocket

Best for: Dashboard applications requiring live updates.

```javascript
const ws = client.createWebSocketConnection();

ws.on('connect', () => {
  console.log('WebSocket connected');
  
  // Subscribe to task updates
  ws.subscribe('task', taskId);
});

ws.on('analysis_progress', (event) => {
  console.log(`Progress: ${event.progress}%`);
  updateProgressBar(event.progress);
});

ws.on('analysis_complete', (event) => {
  console.log('Analysis complete!');
  displayResults(event.data);
});
```

---

## SDK Usage

### Task Management

```javascript
// Create a task
const task = await client.tasks.create({
  title: 'Task title',
  description: 'Task description',
  content: 'Detailed content',
  priority: 'high'
});

// Get task details
const taskDetails = await client.tasks.get(taskId);

// List tasks
const tasks = await client.tasks.list({
  status: 'in_progress',
  limit: 20,
  offset: 0
});

// Update task status
await client.tasks.updateStatus(taskId, {
  status: 'completed',
  notes: 'All work completed'
});
```

### Todo Management

```javascript
// Get todos for a task
const todos = await client.todos.list(taskId);

// Update todo status
await client.todos.updateStatus(todoId, {
  status: 'in_progress',
  assignedTo: 'user_123'
});

// Submit deliverable
const deliverable = await client.todos.submitDeliverable(todoId, {
  file: fileBuffer,
  fileName: 'oauth-config.json',
  description: 'OAuth2 configuration file'
});
```

### Quality Assessment

```javascript
// Run quality check
const assessment = await client.quality.check(deliverableId, {
  standards: ['company-standards'],
  strictMode: true
});

// Get quality report
const report = await client.quality.getReport(deliverableId);

// Batch quality check
const batchResults = await client.quality.batchCheck(taskId, {
  deliverableIds: ['deliv_1', 'deliv_2', 'deliv_3']
});
```

### Progress Tracking

```javascript
// Get task progress
const progress = await client.progress.get(taskId);

// Generate progress report
const report = await client.progress.generateReport(taskId, {
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  format: 'json'
});
```

---

## WebSocket Integration

### Establishing Connection

```javascript
import { WorkTaskWebSocket } from '@company/work-task-analysis-sdk';

const ws = new WorkTaskWebSocket({
  url: 'wss://api.yourdomain.com/ws',
  accessToken: 'your-jwt-token',
  reconnect: true,
  reconnectInterval: 5000
});

await ws.connect();
```

### Subscribing to Events

```javascript
// Subscribe to specific task
ws.subscribe('task', taskId);

// Subscribe to all tasks for a team
ws.subscribe('team', teamId);

// Subscribe to specific event types
ws.subscribe('events', ['quality_check_complete', 'blocker_detected']);
```

### Handling Events

```javascript
// Analysis progress
ws.on('analysis_progress', (event) => {
  console.log(`Task ${event.taskId}: ${event.progress}% complete`);
  console.log(`Current step: ${event.currentStep}`);
});

// Todo status change
ws.on('todo_status_change', (event) => {
  console.log(`Todo ${event.todoId} changed from ${event.oldStatus} to ${event.newStatus}`);
});

// Quality check complete
ws.on('quality_check_complete', (event) => {
  console.log(`Quality check for ${event.deliverableId}: ${event.result.passed ? 'PASSED' : 'FAILED'}`);
});

// Blocker detected
ws.on('blocker_detected', (event) => {
  console.log(`Blocker detected for todo ${event.todoId}: ${event.reason}`);
  notifyTeam(event);
});
```

---

## Error Handling

### Handling API Errors

```javascript
try {
  const task = await client.tasks.create(taskData);
} catch (error) {
  if (error.code === 'INVALID_TASK_CONTENT') {
    console.error('Task content is invalid:', error.details);
    // Show validation errors to user
  } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
    console.error('Rate limit exceeded, retry after:', error.retryAfter);
    // Implement exponential backoff
  } else if (error.status === 401) {
    console.error('Authentication failed, refreshing token...');
    // Refresh token and retry
  } else {
    console.error('Unexpected error:', error);
    // Log to error tracking service
  }
}
```

### Retry Logic

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
const task = await retryWithBackoff(() => 
  client.tasks.create(taskData)
);
```

---

## Best Practices

### 1. Token Management

```javascript
class TokenManager {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }

  async getValidToken() {
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
    return this.accessToken;
  }

  isTokenExpired() {
    return !this.expiresAt || Date.now() >= this.expiresAt;
  }

  async refreshAccessToken() {
    const response = await fetch('https://auth.yourdomain.com/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });
    
    const data = await response.json();
    this.accessToken = data.accessToken;
    this.expiresAt = Date.now() + (data.expiresIn * 1000);
  }
}
```

### 2. Request Batching

```javascript
class RequestBatcher {
  constructor(client, batchSize = 10, flushInterval = 1000) {
    this.client = client;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.queue = [];
    this.startAutoFlush();
  }

  async add(request) {
    this.queue.push(request);
    
    if (this.queue.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.batchSize);
    await this.client.batch.process(batch);
  }

  startAutoFlush() {
    setInterval(() => this.flush(), this.flushInterval);
  }
}
```

### 3. Caching Strategy

```javascript
class CachedClient {
  constructor(client, cacheTTL = 300000) { // 5 minutes
    this.client = client;
    this.cache = new Map();
    this.cacheTTL = cacheTTL;
  }

  async getTask(taskId) {
    const cacheKey = `task:${taskId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const task = await this.client.tasks.get(taskId);
    this.cache.set(cacheKey, {
      data: task,
      timestamp: Date.now()
    });

    return task;
  }

  invalidate(taskId) {
    this.cache.delete(`task:${taskId}`);
  }
}
```

### 4. Rate Limiting

```javascript
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire();
    }

    this.requests.push(now);
  }
}
```

---

## Example Implementations

### React Integration

```jsx
import React, { useState, useEffect } from 'react';
import { WorkTaskClient } from '@company/work-task-analysis-sdk';

function TaskSubmissionForm() {
  const [client] = useState(() => new WorkTaskClient({
    apiUrl: process.env.REACT_APP_API_URL,
    accessToken: getAccessToken()
  }));

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content: '',
    priority: 'medium'
  });

  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const task = await client.tasks.create(formData);
      
      // Wait for analysis
      const result = await client.tasks.waitForAnalysis(task.taskId);
      setAnalysis(result);
    } catch (error) {
      console.error('Failed to submit task:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Task title"
        />
        <textarea
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          placeholder="Task details"
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Task'}
        </button>
      </form>

      {analysis && (
        <div>
          <h3>Analysis Results</h3>
          <ul>
            {analysis.keyPoints.map(point => (
              <li key={point.id}>{point.content}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Node.js Backend Integration

```javascript
const express = require('express');
const { WorkTaskClient } = require('@company/work-task-analysis-sdk');

const app = express();
const client = new WorkTaskClient({
  apiUrl: process.env.API_URL,
  accessToken: process.env.API_TOKEN
});

app.post('/api/tasks', async (req, res) => {
  try {
    const task = await client.tasks.create(req.body);
    
    // Queue analysis monitoring
    monitorAnalysis(task.taskId);
    
    res.status(201).json(task);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message
    });
  }
});

async function monitorAnalysis(taskId) {
  const analysis = await client.tasks.waitForAnalysis(taskId);
  
  // Send notification
  await sendNotification({
    type: 'analysis_complete',
    taskId,
    analysis
  });
}

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Python Integration

```python
from work_task_sdk import WorkTaskClient
import asyncio

client = WorkTaskClient(
    api_url='https://api.yourdomain.com/api/v1',
    access_token='your-jwt-token'
)

async def submit_and_monitor_task():
    # Submit task
    task = await client.tasks.create({
        'title': 'Implement feature X',
        'description': 'Add new functionality',
        'content': 'Detailed requirements...',
        'priority': 'high'
    })
    
    print(f'Task created: {task["taskId"]}')
    
    # Monitor analysis
    async for progress in client.tasks.stream_analysis(task['taskId']):
        print(f'Progress: {progress["progress"]}%')
        
        if progress['status'] == 'analyzed':
            print('Analysis complete!')
            print(f'Key points: {progress["keyPoints"]}')
            break

# Run
asyncio.run(submit_and_monitor_task())
```

---

## Testing Your Integration

### Unit Testing

```javascript
import { WorkTaskClient } from '@company/work-task-analysis-sdk';
import { jest } from '@jest/globals';

describe('Task Submission', () => {
  let client;

  beforeEach(() => {
    client = new WorkTaskClient({
      apiUrl: 'https://api.test.com',
      accessToken: 'test-token'
    });
  });

  test('should submit task successfully', async () => {
    const mockTask = { taskId: 'task_123', status: 'submitted' };
    jest.spyOn(client.tasks, 'create').mockResolvedValue(mockTask);

    const result = await client.tasks.create({
      title: 'Test task',
      content: 'Test content'
    });

    expect(result.taskId).toBe('task_123');
  });
});
```

### Integration Testing

```javascript
describe('End-to-End Task Flow', () => {
  test('should complete full task workflow', async () => {
    // 1. Submit task
    const task = await client.tasks.create(testTaskData);
    expect(task.taskId).toBeDefined();

    // 2. Wait for analysis
    const analysis = await client.tasks.waitForAnalysis(task.taskId);
    expect(analysis.status).toBe('analyzed');

    // 3. Update todo status
    const todos = await client.todos.list(task.taskId);
    await client.todos.updateStatus(todos[0].todoId, {
      status: 'completed'
    });

    // 4. Verify progress
    const progress = await client.progress.get(task.taskId);
    expect(progress.todoStats.completed).toBeGreaterThan(0);
  });
});
```

---

## Troubleshooting

### Common Issues

**Issue**: Authentication failures
**Solution**: Verify token is valid and not expired. Implement token refresh logic.

**Issue**: Rate limit exceeded
**Solution**: Implement request throttling and exponential backoff.

**Issue**: WebSocket disconnections
**Solution**: Enable automatic reconnection with exponential backoff.

**Issue**: Large file uploads failing
**Solution**: Implement chunked upload for files > 10MB.

---

## Support and Resources

- **API Documentation**: https://docs.yourdomain.com/api
- **SDK Repository**: https://github.com/company/work-task-sdk
- **Support Email**: api-support@company.com
- **Community Forum**: https://community.yourdomain.com

---

## Changelog

### v1.0.0 (2025-01-05)
- Initial release
- Task submission and analysis
- Todo management
- Quality assessment
- Progress tracking
