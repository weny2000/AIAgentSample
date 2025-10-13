# Work Task Analysis System - API Documentation and Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket API](#websocket-api)
5. [Data Models](#data-models)
6. [Integration Guide](#integration-guide)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)
9. [Code Examples](#code-examples)

## Overview

The Work Task Analysis System provides a comprehensive API for intelligent work task management, analysis, and quality assessment. The system integrates with the existing AgentCore infrastructure to provide AI-powered task analysis, todo generation, deliverable validation, and quality assessment.

### Base URL

```
Production: https://api.yourdomain.com/api/v1
Staging: https://staging-api.yourdomain.com/api/v1
Development: http://localhost:3000/api/v1
```

### API Versioning

The API uses URL-based versioning. The current version is `v1`.

## Authentication

All API endpoints require authentication via JWT tokens passed through the `Authorization` header.

### Required Token Claims

```json
{
  "sub": "user-id",
  "userId": "user-id",
  "teamId": "team-id",
  "role": "user|admin|manager",
  "department": "engineering",
  "clearance": "standard|elevated|admin",
  "permissions": ["read", "write", "analyze"]
}
```

### Authentication Header

```http
Authorization: Bearer <your-jwt-token>
```

## REST API Endpoints

### Work Task Management

#### Submit Work Task

Create and submit a new work task for analysis.


**Endpoint:** `POST /work-tasks`

**Request Body:**
```json
{
  "title": "Implement User Authentication System",
  "description": "Build a secure authentication system with JWT tokens",
  "content": "We need to implement a comprehensive authentication system...",
  "priority": "high",
  "category": "security",
  "tags": ["authentication", "security", "backend"],
  "attachments": []
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc123",
    "status": "analyzing",
    "estimatedCompletionTime": 120,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Get Task Analysis Results

Retrieve the analysis results for a submitted task.

**Endpoint:** `GET /work-tasks/{taskId}/analysis`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc123",
    "status": "analyzed",
    "keyPoints": [
      {
        "id": "kp-1",
        "content": "Implement JWT token generation and validation",
        "category": "technical",
        "importance": "high",
        "risks": ["Token expiration handling", "Refresh token security"]
      }
    ],
    "relatedWorkgroups": [
      {
        "teamId": "security-team",
        "teamName": "Security Team",
        "relevanceScore": 0.95,
        "expertise": ["authentication", "security"],
        "contactInfo": {
          "email": "security@company.com",
          "slack": "#security-team"
        }
      }
    ],
    "todoList": [
      {
        "todoId": "todo-1",
        "title": "Set up JWT library and configuration",
        "description": "Install and configure JWT library...",
        "priority": "high",
        "estimatedHours": 4,
        "dependencies": [],
        "category": "development"
      }
    ],
    "knowledgeReferences": [
      {
        "sourceId": "doc-123",
        "sourceType": "documentation",
        "title": "Authentication Best Practices",
        "snippet": "JWT tokens should be...",
        "confidence": 0.88,
        "url": "/knowledge/doc-123"
      }
    ],
    "riskAssessment": {
      "overallRisk": "medium",
      "risks": [
        {
          "category": "security",
          "description": "Token storage vulnerability",
          "severity": "high",
          "mitigation": "Use httpOnly cookies"
        }
      ]
    },
    "recommendations": [
      "Consider implementing refresh token rotation",
      "Add rate limiting to authentication endpoints"
    ],
    "analyzedAt": "2024-01-15T10:32:00Z"
  }
}
```


#### List Work Tasks

Get a paginated list of work tasks.

**Endpoint:** `GET /work-tasks`

**Query Parameters:**
- `teamId` (optional): Filter by team ID
- `status` (optional): Filter by status (submitted, analyzing, analyzed, in_progress, completed)
- `priority` (optional): Filter by priority (low, medium, high, critical)
- `limit` (optional, default: 20): Number of results per page
- `offset` (optional, default: 0): Pagination offset

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "task-abc123",
        "title": "Implement User Authentication System",
        "status": "analyzed",
        "priority": "high",
        "createdAt": "2024-01-15T10:30:00Z",
        "submittedBy": "user-123"
      }
    ],
    "totalCount": 45,
    "limit": 20,
    "offset": 0
  }
}
```

#### Update Task Status

Update the status of a work task.

**Endpoint:** `PUT /work-tasks/{taskId}/status`

**Request Body:**
```json
{
  "status": "in_progress",
  "notes": "Started implementation"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc123",
    "status": "in_progress",
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

### Todo Management

#### Get Todo List

Retrieve the todo list for a specific task.

**Endpoint:** `GET /work-tasks/{taskId}/todos`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "todos": [
      {
        "todoId": "todo-1",
        "taskId": "task-abc123",
        "title": "Set up JWT library and configuration",
        "description": "Install and configure JWT library...",
        "priority": "high",
        "estimatedHours": 4,
        "assignedTo": "user-123",
        "dueDate": "2024-01-20T00:00:00Z",
        "dependencies": [],
        "category": "development",
        "status": "pending",
        "deliverables": [],
        "createdAt": "2024-01-15T10:32:00Z"
      }
    ]
  }
}
```


#### Update Todo Status

Update the status of a todo item.

**Endpoint:** `PUT /todos/{todoId}/status`

**Request Body:**
```json
{
  "status": "in_progress",
  "assignedTo": "user-123",
  "notes": "Started working on this task"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "todoId": "todo-1",
    "status": "in_progress",
    "updatedAt": "2024-01-15T11:30:00Z"
  }
}
```

#### Submit Deliverable

Submit a deliverable for a todo item.

**Endpoint:** `POST /todos/{todoId}/deliverables`

**Request:** `multipart/form-data`
```
file: <binary file data>
fileName: "authentication-implementation.zip"
description: "Complete authentication system implementation"
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "deliverableId": "deliv-xyz789",
    "todoId": "todo-1",
    "fileName": "authentication-implementation.zip",
    "fileSize": 1048576,
    "status": "validating",
    "submittedAt": "2024-01-15T12:00:00Z"
  }
}
```

#### Get Task Progress

Get progress summary for a task.

**Endpoint:** `GET /work-tasks/{taskId}/progress`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc123",
    "totalTodos": 10,
    "completedTodos": 3,
    "inProgressTodos": 2,
    "pendingTodos": 5,
    "blockedTodos": 0,
    "completionPercentage": 30,
    "estimatedCompletionDate": "2024-01-25T00:00:00Z",
    "blockers": [],
    "recentActivity": [
      {
        "type": "status_change",
        "todoId": "todo-1",
        "oldStatus": "pending",
        "newStatus": "in_progress",
        "timestamp": "2024-01-15T11:30:00Z"
      }
    ]
  }
}
```

### Quality Assessment

#### Execute Quality Check

Perform quality assessment on a deliverable.

**Endpoint:** `POST /deliverables/{deliverableId}/quality-check`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "deliverableId": "deliv-xyz789",
    "qualityScore": 85,
    "status": "passed",
    "checks": [
      {
        "checkId": "check-1",
        "name": "Code Quality",
        "category": "technical",
        "status": "passed",
        "score": 90,
        "details": "Code follows best practices"
      }
    ],
    "issues": [
      {
        "severity": "low",
        "category": "documentation",
        "description": "Missing API documentation for 2 endpoints",
        "suggestion": "Add JSDoc comments to all public methods"
      }
    ],
    "improvementSuggestions": [
      "Add more unit tests for edge cases",
      "Consider implementing input validation"
    ],
    "assessedAt": "2024-01-15T12:05:00Z"
  }
}
```


#### Get Quality Report

Retrieve detailed quality report for a deliverable.

**Endpoint:** `GET /deliverables/{deliverableId}/quality-report`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "deliverableId": "deliv-xyz789",
    "qualityScore": 85,
    "overallStatus": "passed",
    "categories": {
      "codeQuality": 90,
      "documentation": 75,
      "testing": 88,
      "security": 92
    },
    "detailedChecks": [...],
    "complianceStatus": "compliant",
    "generatedAt": "2024-01-15T12:05:00Z"
  }
}
```

#### Batch Quality Check

Perform quality checks on multiple deliverables.

**Endpoint:** `POST /work-tasks/{taskId}/batch-quality-check`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc123",
    "totalDeliverables": 5,
    "results": [
      {
        "deliverableId": "deliv-xyz789",
        "qualityScore": 85,
        "status": "passed"
      }
    ],
    "overallQualityScore": 87,
    "processedAt": "2024-01-15T12:10:00Z"
  }
}
```

### Conversational Interface

#### Process Conversational Message

Process a message with work task context awareness.

**Endpoint:** `POST /work-task/conversation`

**Request Body:**
```json
{
  "sessionId": "session-123",
  "message": "Create a task: Implement user authentication",
  "userId": "user-123",
  "teamId": "team-123"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "messageId": "msg-456",
    "response": "✅ I've analyzed your task: Implement user authentication...",
    "references": [...],
    "actionItems": [...],
    "suggestions": [
      "Would you like me to break this down into subtasks?",
      "Should I identify the security team for collaboration?"
    ],
    "confidence": 0.9,
    "processingTime": 1500
  }
}
```

#### Start Conversation Session

Start a new conversation session for work task management.

**Endpoint:** `POST /work-task/conversation/start`

**Request Body:**
```json
{
  "userId": "user-123",
  "teamId": "team-123",
  "personaId": "work-task-assistant",
  "initialMessage": "Hello, I need help with task management"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "sessionId": "session-123",
    "welcomeMessage": "Hello! I'm your work task assistant...",
    "capabilities": ["task_analysis", "todo_generation", "quality_assessment"],
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```


#### Get Conversation History

Retrieve conversation history for a session.

**Endpoint:** `GET /work-task/conversation/{sessionId}/history`

**Query Parameters:**
- `limit` (optional, default: 50): Number of messages to retrieve
- `includeReferences` (optional, default: false): Include knowledge references

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "sessionId": "session-123",
    "messages": [
      {
        "messageId": "msg-1",
        "role": "user",
        "content": "Create a task: Implement authentication",
        "timestamp": "2024-01-15T10:05:00Z"
      },
      {
        "messageId": "msg-2",
        "role": "assistant",
        "content": "I've analyzed your task...",
        "timestamp": "2024-01-15T10:05:15Z",
        "metadata": {
          "confidence": 0.9,
          "processingTime": 1500
        }
      }
    ],
    "totalCount": 10,
    "hasMore": false
  }
}
```

#### End Conversation Session

End an active conversation session.

**Endpoint:** `DELETE /work-task/conversation/{sessionId}`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Session ended successfully"
}
```

## WebSocket API

### Connection

Connect to the WebSocket endpoint for real-time updates:

```
wss://api.yourdomain.com/work-task/ws?userId=user123&teamId=team456&sessionId=session123
```

### Message Format

All WebSocket messages follow this format:

```json
{
  "type": "message|status_update|quality_check_complete|progress_update",
  "data": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Event Types

#### Task Analysis Progress

```json
{
  "type": "analysis_progress",
  "data": {
    "taskId": "task-abc123",
    "progress": 75,
    "currentStep": "Generating todo list",
    "estimatedTimeRemaining": 30
  },
  "timestamp": "2024-01-15T10:31:00Z"
}
```

#### Todo Status Change

```json
{
  "type": "todo_status_change",
  "data": {
    "todoId": "todo-1",
    "taskId": "task-abc123",
    "oldStatus": "pending",
    "newStatus": "in_progress",
    "updatedBy": "user-123"
  },
  "timestamp": "2024-01-15T11:30:00Z"
}
```

#### Quality Check Complete

```json
{
  "type": "quality_check_complete",
  "data": {
    "deliverableId": "deliv-xyz789",
    "todoId": "todo-1",
    "qualityScore": 85,
    "status": "passed"
  },
  "timestamp": "2024-01-15T12:05:00Z"
}
```


#### Progress Update

```json
{
  "type": "progress_update",
  "data": {
    "taskId": "task-abc123",
    "completionPercentage": 35,
    "completedTodos": 4,
    "totalTodos": 10
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

## Data Models

### WorkTaskRecord

```typescript
interface WorkTaskRecord {
  task_id: string;
  created_at: string;
  title: string;
  description: string;
  content: string;
  submitted_by: string;
  team_id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
  status: 'submitted' | 'analyzing' | 'analyzed' | 'in_progress' | 'completed';
  analysis_result?: TaskAnalysisResult;
  updated_at: string;
}
```

### TodoItemRecord

```typescript
interface TodoItemRecord {
  todo_id: string;
  task_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  assigned_to?: string;
  due_date?: string;
  dependencies: string[];
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  related_workgroups: string[];
  deliverables: DeliverableRecord[];
  quality_checks: QualityCheckRecord[];
  created_at: string;
  updated_at: string;
}
```

### DeliverableRecord

```typescript
interface DeliverableRecord {
  deliverable_id: string;
  todo_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  s3_key: string;
  submitted_by: string;
  submitted_at: string;
  validation_result?: ValidationResult;
  quality_assessment?: QualityAssessmentResult;
  status: 'submitted' | 'validating' | 'approved' | 'rejected' | 'needs_revision';
}
```

### TaskAnalysisResult

```typescript
interface TaskAnalysisResult {
  keyPoints: KeyPoint[];
  relatedWorkgroups: RelatedWorkgroup[];
  todoList: TodoItem[];
  knowledgeReferences: KnowledgeReference[];
  riskAssessment: RiskAssessment;
  recommendations: string[];
  analyzedAt: string;
}
```

### QualityAssessmentResult

```typescript
interface QualityAssessmentResult {
  deliverableId: string;
  qualityScore: number;
  status: 'passed' | 'failed' | 'needs_revision';
  checks: QualityCheck[];
  issues: QualityIssue[];
  improvementSuggestions: string[];
  assessedAt: string;
}
```


## Integration Guide

### JavaScript/TypeScript Integration

#### Installation

```bash
npm install axios
```

#### Basic Setup

```typescript
import axios from 'axios';

const API_BASE_URL = 'https://api.yourdomain.com/api/v1';
const AUTH_TOKEN = 'your-jwt-token';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});
```

#### Submit a Work Task

```typescript
async function submitWorkTask(taskData: {
  title: string;
  description: string;
  content: string;
  priority: string;
}) {
  try {
    const response = await apiClient.post('/work-tasks', taskData);
    console.log('Task submitted:', response.data);
    return response.data.data.taskId;
  } catch (error) {
    console.error('Error submitting task:', error);
    throw error;
  }
}

// Usage
const taskId = await submitWorkTask({
  title: 'Implement Authentication',
  description: 'Build secure auth system',
  content: 'Detailed requirements...',
  priority: 'high'
});
```

#### Get Analysis Results

```typescript
async function getAnalysisResults(taskId: string) {
  try {
    const response = await apiClient.get(`/work-tasks/${taskId}/analysis`);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching analysis:', error);
    throw error;
  }
}

// Usage
const analysis = await getAnalysisResults(taskId);
console.log('Key Points:', analysis.keyPoints);
console.log('Todo List:', analysis.todoList);
```

#### Update Todo Status

```typescript
async function updateTodoStatus(todoId: string, status: string) {
  try {
    const response = await apiClient.put(`/todos/${todoId}/status`, {
      status,
      notes: 'Status updated via API'
    });
    return response.data;
  } catch (error) {
    console.error('Error updating todo:', error);
    throw error;
  }
}

// Usage
await updateTodoStatus('todo-1', 'in_progress');
```

#### Submit Deliverable

```typescript
async function submitDeliverable(todoId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileName', file.name);
  formData.append('description', 'Implementation deliverable');

  try {
    const response = await apiClient.post(
      `/todos/${todoId}/deliverables`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return response.data.data;
  } catch (error) {
    console.error('Error submitting deliverable:', error);
    throw error;
  }
}

// Usage
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const deliverable = await submitDeliverable('todo-1', file);
```


#### WebSocket Integration

```typescript
class WorkTaskWebSocket {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    private userId: string,
    private teamId: string,
    private sessionId: string
  ) {
    this.connect();
  }

  private connect() {
    const wsUrl = `wss://api.yourdomain.com/work-task/ws?userId=${this.userId}&teamId=${this.teamId}&sessionId=${this.sessionId}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.reconnect();
    };
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'analysis_progress':
        console.log('Analysis progress:', message.data.progress);
        break;
      case 'todo_status_change':
        console.log('Todo status changed:', message.data);
        break;
      case 'quality_check_complete':
        console.log('Quality check complete:', message.data);
        break;
      case 'progress_update':
        console.log('Progress update:', message.data);
        break;
    }
  }

  private reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
    }
  }

  public disconnect() {
    this.ws.close();
  }
}

// Usage
const wsClient = new WorkTaskWebSocket('user-123', 'team-456', 'session-789');
```

### Python Integration

#### Installation

```bash
pip install requests websocket-client
```

#### Basic Setup

```python
import requests
import json

API_BASE_URL = 'https://api.yourdomain.com/api/v1'
AUTH_TOKEN = 'your-jwt-token'

headers = {
    'Authorization': f'Bearer {AUTH_TOKEN}',
    'Content-Type': 'application/json'
}
```

#### Submit a Work Task

```python
def submit_work_task(task_data):
    url = f'{API_BASE_URL}/work-tasks'
    response = requests.post(url, headers=headers, json=task_data)
    response.raise_for_status()
    return response.json()['data']['taskId']

# Usage
task_id = submit_work_task({
    'title': 'Implement Authentication',
    'description': 'Build secure auth system',
    'content': 'Detailed requirements...',
    'priority': 'high'
})
print(f'Task submitted: {task_id}')
```

#### Get Analysis Results

```python
def get_analysis_results(task_id):
    url = f'{API_BASE_URL}/work-tasks/{task_id}/analysis'
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()['data']

# Usage
analysis = get_analysis_results(task_id)
print('Key Points:', analysis['keyPoints'])
print('Todo List:', analysis['todoList'])
```


#### WebSocket Integration

```python
import websocket
import json
import threading

class WorkTaskWebSocket:
    def __init__(self, user_id, team_id, session_id):
        self.user_id = user_id
        self.team_id = team_id
        self.session_id = session_id
        self.ws = None
        self.connect()

    def connect(self):
        ws_url = f'wss://api.yourdomain.com/work-task/ws?userId={self.user_id}&teamId={self.team_id}&sessionId={self.session_id}'
        
        self.ws = websocket.WebSocketApp(
            ws_url,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
            on_open=self.on_open
        )
        
        wst = threading.Thread(target=self.ws.run_forever)
        wst.daemon = True
        wst.start()

    def on_message(self, ws, message):
        data = json.loads(message)
        print(f'Received: {data["type"]}')
        
    def on_error(self, ws, error):
        print(f'Error: {error}')
        
    def on_close(self, ws, close_status_code, close_msg):
        print('WebSocket closed')
        
    def on_open(self, ws):
        print('WebSocket connected')

    def disconnect(self):
        if self.ws:
            self.ws.close()

# Usage
ws_client = WorkTaskWebSocket('user-123', 'team-456', 'session-789')
```

## Error Handling

### HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict
- `422 Unprocessable Entity` - Validation errors
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid task priority",
    "details": {
      "field": "priority",
      "value": "invalid",
      "allowedValues": ["low", "medium", "high", "critical"]
    },
    "correlationId": "corr-123456",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` - Input validation failed
- `AUTHENTICATION_ERROR` - Authentication failed
- `AUTHORIZATION_ERROR` - Insufficient permissions
- `RESOURCE_NOT_FOUND` - Requested resource not found
- `ANALYSIS_TIMEOUT` - Task analysis timed out
- `KNOWLEDGE_SEARCH_FAILED` - Knowledge base search failed
- `INVALID_FILE_TYPE` - Unsupported file type
- `FILE_TOO_LARGE` - File exceeds size limit
- `QUALITY_CHECK_FAILED` - Quality assessment failed
- `RATE_LIMIT_EXCEEDED` - Too many requests

### Error Handling Best Practices

```typescript
async function handleApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const response = error.response;
      
      if (response) {
        switch (response.status) {
          case 400:
            console.error('Validation error:', response.data.error);
            break;
          case 401:
            console.error('Authentication failed');
            // Redirect to login
            break;
          case 403:
            console.error('Insufficient permissions');
            break;
          case 404:
            console.error('Resource not found');
            break;
          case 429:
            console.error('Rate limit exceeded');
            // Implement exponential backoff
            break;
          case 500:
            console.error('Server error');
            // Retry with exponential backoff
            break;
        }
      }
    }
    throw error;
  }
}
```


## Rate Limiting

### Rate Limits

| Endpoint Category | Limit | Window |
|------------------|-------|--------|
| Task Submission | 10 requests | per minute |
| Task Queries | 100 requests | per minute |
| Todo Updates | 60 requests | per minute |
| Deliverable Uploads | 20 requests | per minute |
| Quality Checks | 30 requests | per minute |
| Conversation API | 60 messages | per minute |
| WebSocket Connections | 5 connections | per user |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642252800
```

### Handling Rate Limits

```typescript
async function apiCallWithRetry<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = parseInt(
          error.response.headers['retry-after'] || '60'
        );
        console.log(`Rate limited. Retrying after ${retryAfter}s`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Code Examples

### Complete Workflow Example

```typescript
import axios from 'axios';

class WorkTaskClient {
  private apiClient;

  constructor(baseURL: string, authToken: string) {
    this.apiClient = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Submit and analyze a work task
  async submitAndAnalyzeTask(taskData: any) {
    // 1. Submit task
    const submitResponse = await this.apiClient.post('/work-tasks', taskData);
    const taskId = submitResponse.data.data.taskId;
    console.log(`Task submitted: ${taskId}`);

    // 2. Poll for analysis completion
    let analysis;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes with 2-second intervals

    while (attempts < maxAttempts) {
      const analysisResponse = await this.apiClient.get(
        `/work-tasks/${taskId}/analysis`
      );
      
      if (analysisResponse.data.data.status === 'analyzed') {
        analysis = analysisResponse.data.data;
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    if (!analysis) {
      throw new Error('Analysis timeout');
    }

    console.log('Analysis complete:', analysis);
    return { taskId, analysis };
  }

  // Work through todos
  async processTodos(taskId: string) {
    // Get todo list
    const todosResponse = await this.apiClient.get(
      `/work-tasks/${taskId}/todos`
    );
    const todos = todosResponse.data.data.todos;

    for (const todo of todos) {
      console.log(`Processing todo: ${todo.title}`);

      // Update status to in_progress
      await this.apiClient.put(`/todos/${todo.todoId}/status`, {
        status: 'in_progress'
      });

      // Simulate work...
      console.log(`Working on ${todo.title}...`);

      // Mark as completed
      await this.apiClient.put(`/todos/${todo.todoId}/status`, {
        status: 'completed'
      });
    }
  }

  // Submit and validate deliverable
  async submitAndValidateDeliverable(todoId: string, file: File) {
    // Submit deliverable
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', file.name);

    const submitResponse = await this.apiClient.post(
      `/todos/${todoId}/deliverables`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );

    const deliverableId = submitResponse.data.data.deliverableId;
    console.log(`Deliverable submitted: ${deliverableId}`);

    // Wait for validation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Run quality check
    const qualityResponse = await this.apiClient.post(
      `/deliverables/${deliverableId}/quality-check`
    );

    const qualityResult = qualityResponse.data.data;
    console.log(`Quality score: ${qualityResult.qualityScore}`);

    return qualityResult;
  }

  // Get progress report
  async getProgressReport(taskId: string) {
    const response = await this.apiClient.get(
      `/work-tasks/${taskId}/progress`
    );
    return response.data.data;
  }
}

// Usage
async function main() {
  const client = new WorkTaskClient(
    'https://api.yourdomain.com/api/v1',
    'your-jwt-token'
  );

  // Submit task
  const { taskId, analysis } = await client.submitAndAnalyzeTask({
    title: 'Implement User Authentication',
    description: 'Build secure authentication system',
    content: 'Detailed requirements...',
    priority: 'high'
  });

  // Process todos
  await client.processTodos(taskId);

  // Get progress
  const progress = await client.getProgressReport(taskId);
  console.log('Progress:', progress);
}

main().catch(console.error);
```

## Support and Resources

### Documentation
- [System Architecture](./WORK_TASK_SYSTEM_ARCHITECTURE.md)
- [User Guide](./WORK_TASK_USER_GUIDE.md)
- [Troubleshooting Guide](./WORK_TASK_TROUBLESHOOTING_GUIDE.md)

### API Status
- Status Page: https://status.yourdomain.com
- API Health: https://api.yourdomain.com/health

### Support Channels
- Email: api-support@yourdomain.com
- Slack: #work-task-api-support
- Documentation: https://docs.yourdomain.com

### Changelog
- v1.0.0 (2024-01-15): Initial release
  - Work task submission and analysis
  - Todo management
  - Deliverable validation
  - Quality assessment
  - Conversational interface

---

**Last Updated:** 2024-01-15  
**API Version:** v1.0.0  
**Document Version:** 1.0
