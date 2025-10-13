# Work Task Analysis System - API Reference

## Overview

This document provides comprehensive API documentation for the Work Task Intelligent Analysis System. All endpoints require authentication via JWT tokens passed in the `Authorization` header.

**Base URL**: `https://api.yourdomain.com/api/v1`

**Authentication**: `Authorization: Bearer <jwt_token>`

## Table of Contents

- [Task Management API](#task-management-api)
- [Todo Management API](#todo-management-api)
- [Deliverable Management API](#deliverable-management-api)
- [Quality Assessment API](#quality-assessment-api)
- [Progress Tracking API](#progress-tracking-api)
- [WebSocket Events](#websocket-events)
- [Error Codes](#error-codes)

---

## Task Management API

### Submit Work Task

Creates a new work task for analysis.

**Endpoint**: `POST /work-tasks`

**Request Body**:
```json
{
  "title": "Implement user authentication system",
  "description": "Add OAuth2 authentication with social login support",
  "content": "Detailed task description...",
  "priority": "high",
  "category": "security",
  "tags": ["authentication", "oauth2", "security"],
  "attachments": ["file1.pdf", "file2.docx"]
}
```

**Response**: `201 Created`
```json
{
  "taskId": "task_abc123",
  "status": "submitted",
  "createdAt": "2025-01-05T10:30:00Z",
  "estimatedAnalysisTime": 120
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Missing or invalid authentication
- `413 Payload Too Large`: Content exceeds size limit

---

### Get Task Analysis Results

Retrieves the analysis results for a specific task.

**Endpoint**: `GET /work-tasks/{taskId}/analysis`

**Path Parameters**:
- `taskId` (string, required): Unique task identifier

**Response**: `200 OK`
```json
{
  "taskId": "task_abc123",
  "status": "analyzed",
  "keyPoints": [
    {
      "id": "kp_1",
      "content": "Implement OAuth2 authentication flow",
      "importance": "high",
      "category": "security"
    }
  ],
  "relatedWorkgroups": [
    {
      "teamId": "security-team",
      "teamName": "Security Engineering",
      "relevanceScore": 0.95,
      "expertise": ["authentication", "oauth2"],
      "contacts": ["security@company.com"]
    }
  ],
  "knowledgeReferences": [
    {
      "id": "kb_1",
      "title": "OAuth2 Implementation Guide",
      "source": "internal-wiki",
      "relevanceScore": 0.88,
      "url": "https://wiki.company.com/oauth2"
    }
  ],
  "riskAssessment": {
    "overallRisk": "medium",
    "risks": [
      {
        "category": "security",
        "description": "Token storage security",
        "severity": "high",
        "mitigation": "Use secure storage mechanisms"
      }
    ]
  },
  "recommendations": [
    "Consider using industry-standard OAuth2 libraries",
    "Implement rate limiting for authentication endpoints"
  ],
  "analyzedAt": "2025-01-05T10:32:00Z"
}
```

---

### List Work Tasks

Retrieves a paginated list of work tasks.

**Endpoint**: `GET /work-tasks`

**Query Parameters**:
- `teamId` (string, optional): Filter by team
- `status` (string, optional): Filter by status (submitted, analyzing, analyzed, in_progress, completed)
- `priority` (string, optional): Filter by priority (low, medium, high, critical)
- `limit` (number, optional): Number of results per page (default: 20, max: 100)
- `offset` (number, optional): Pagination offset (default: 0)

**Response**: `200 OK`
```json
{
  "tasks": [
    {
      "taskId": "task_abc123",
      "title": "Implement user authentication",
      "status": "in_progress",
      "priority": "high",
      "createdAt": "2025-01-05T10:30:00Z",
      "updatedAt": "2025-01-05T14:20:00Z",
      "completionPercentage": 45
    }
  ],
  "totalCount": 150,
  "limit": 20,
  "offset": 0
}
```

---

### Update Task Status

Updates the status of a work task.

**Endpoint**: `PUT /work-tasks/{taskId}/status`

**Request Body**:
```json
{
  "status": "in_progress",
  "notes": "Started implementation phase"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "taskId": "task_abc123",
  "status": "in_progress",
  "updatedAt": "2025-01-05T15:00:00Z"
}
```

---

## Todo Management API

### Get Todo List

Retrieves all todo items for a specific task.

**Endpoint**: `GET /work-tasks/{taskId}/todos`

**Response**: `200 OK`
```json
{
  "todos": [
    {
      "todoId": "todo_xyz789",
      "taskId": "task_abc123",
      "title": "Set up OAuth2 provider configuration",
      "description": "Configure OAuth2 providers (Google, GitHub)",
      "priority": "high",
      "estimatedHours": 4,
      "assignedTo": "user_123",
      "dueDate": "2025-01-10T17:00:00Z",
      "dependencies": [],
      "category": "development",
      "status": "pending",
      "relatedWorkgroups": ["security-team"],
      "deliverables": [],
      "createdAt": "2025-01-05T10:32:00Z",
      "updatedAt": "2025-01-05T10:32:00Z"
    }
  ]
}
```

---

### Update Todo Status

Updates the status and metadata of a todo item.

**Endpoint**: `PUT /todos/{todoId}/status`

**Request Body**:
```json
{
  "status": "in_progress",
  "assignedTo": "user_123",
  "notes": "Started working on OAuth2 configuration",
  "actualHours": 2
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "todoId": "todo_xyz789",
  "status": "in_progress",
  "updatedAt": "2025-01-06T09:00:00Z"
}
```

---

### Submit Deliverable

Uploads a deliverable for a todo item.

**Endpoint**: `POST /todos/{todoId}/deliverables`

**Content-Type**: `multipart/form-data`

**Form Data**:
- `file` (file, required): The deliverable file
- `description` (string, optional): Description of the deliverable
- `metadata` (JSON string, optional): Additional metadata

**Response**: `201 Created`
```json
{
  "deliverableId": "deliv_456",
  "todoId": "todo_xyz789",
  "fileName": "oauth2-config.json",
  "fileSize": 2048,
  "submittedAt": "2025-01-06T14:30:00Z",
  "validationStatus": "pending",
  "s3Key": "deliverables/todo_xyz789/deliv_456/oauth2-config.json"
}
```

---

## Deliverable Management API

### Get Deliverable Details

Retrieves details about a specific deliverable.

**Endpoint**: `GET /deliverables/{deliverableId}`

**Response**: `200 OK`
```json
{
  "deliverableId": "deliv_456",
  "todoId": "todo_xyz789",
  "fileName": "oauth2-config.json",
  "fileType": "application/json",
  "fileSize": 2048,
  "submittedBy": "user_123",
  "submittedAt": "2025-01-06T14:30:00Z",
  "status": "approved",
  "validationResult": {
    "isValid": true,
    "completeness": 100,
    "issues": []
  },
  "qualityAssessment": {
    "overallScore": 85,
    "passed": true,
    "details": {
      "format": 95,
      "completeness": 90,
      "compliance": 80
    }
  },
  "downloadUrl": "https://s3.amazonaws.com/..."
}
```

---

## Quality Assessment API

### Execute Quality Check

Performs a quality assessment on a deliverable.

**Endpoint**: `POST /deliverables/{deliverableId}/quality-check`

**Request Body**:
```json
{
  "standards": ["iso-9001", "company-standards"],
  "strictMode": true
}
```

**Response**: `200 OK`
```json
{
  "deliverableId": "deliv_456",
  "assessmentId": "qa_789",
  "overallScore": 85,
  "passed": true,
  "assessedAt": "2025-01-06T15:00:00Z",
  "details": {
    "format": {
      "score": 95,
      "passed": true,
      "issues": []
    },
    "completeness": {
      "score": 90,
      "passed": true,
      "issues": [
        {
          "severity": "low",
          "description": "Missing optional field: 'refreshTokenExpiry'",
          "suggestion": "Add refresh token expiry configuration"
        }
      ]
    },
    "compliance": {
      "score": 80,
      "passed": true,
      "issues": [
        {
          "severity": "medium",
          "description": "Token storage method not specified",
          "suggestion": "Specify secure token storage mechanism"
        }
      ]
    }
  },
  "improvementSuggestions": [
    "Add refresh token expiry configuration",
    "Specify secure token storage mechanism",
    "Include rate limiting configuration"
  ]
}
```

---

### Get Quality Report

Retrieves a detailed quality report for a deliverable.

**Endpoint**: `GET /deliverables/{deliverableId}/quality-report`

**Response**: `200 OK`
```json
{
  "deliverableId": "deliv_456",
  "reportId": "qr_101",
  "generatedAt": "2025-01-06T15:05:00Z",
  "summary": {
    "overallScore": 85,
    "passed": true,
    "totalIssues": 2,
    "criticalIssues": 0,
    "highIssues": 0,
    "mediumIssues": 1,
    "lowIssues": 1
  },
  "detailedAnalysis": {
    "strengths": [
      "Well-structured configuration",
      "Follows OAuth2 best practices",
      "Includes error handling"
    ],
    "weaknesses": [
      "Missing refresh token configuration",
      "Token storage not specified"
    ],
    "recommendations": [
      "Add comprehensive token lifecycle management",
      "Implement token rotation strategy"
    ]
  },
  "complianceChecks": [
    {
      "standard": "company-standards",
      "passed": true,
      "details": "Meets all company security standards"
    }
  ]
}
```

---

### Batch Quality Check

Performs quality checks on multiple deliverables.

**Endpoint**: `POST /work-tasks/{taskId}/batch-quality-check`

**Request Body**:
```json
{
  "deliverableIds": ["deliv_456", "deliv_457", "deliv_458"],
  "standards": ["company-standards"]
}
```

**Response**: `200 OK`
```json
{
  "taskId": "task_abc123",
  "batchId": "batch_202",
  "results": [
    {
      "deliverableId": "deliv_456",
      "overallScore": 85,
      "passed": true
    },
    {
      "deliverableId": "deliv_457",
      "overallScore": 92,
      "passed": true
    },
    {
      "deliverableId": "deliv_458",
      "overallScore": 68,
      "passed": false
    }
  ],
  "summary": {
    "total": 3,
    "passed": 2,
    "failed": 1,
    "averageScore": 81.67
  }
}
```

---

## Progress Tracking API

### Get Task Progress

Retrieves progress information for a task.

**Endpoint**: `GET /work-tasks/{taskId}/progress`

**Response**: `200 OK`
```json
{
  "taskId": "task_abc123",
  "overallProgress": 45,
  "status": "in_progress",
  "todoStats": {
    "total": 10,
    "pending": 3,
    "inProgress": 4,
    "completed": 2,
    "blocked": 1
  },
  "deliverableStats": {
    "total": 8,
    "submitted": 5,
    "approved": 2,
    "rejected": 1,
    "pending": 0
  },
  "timeline": {
    "startedAt": "2025-01-05T10:30:00Z",
    "estimatedCompletion": "2025-01-15T17:00:00Z",
    "actualCompletion": null
  },
  "blockers": [
    {
      "todoId": "todo_xyz790",
      "title": "Deploy to staging environment",
      "blockedSince": "2025-01-06T10:00:00Z",
      "reason": "Waiting for infrastructure approval",
      "severity": "medium"
    }
  ],
  "recentActivity": [
    {
      "timestamp": "2025-01-06T14:30:00Z",
      "type": "deliverable_submitted",
      "description": "OAuth2 configuration submitted",
      "userId": "user_123"
    }
  ]
}
```

---

### Get Progress Report

Generates a detailed progress report for a time range.

**Endpoint**: `GET /work-tasks/{taskId}/progress-report`

**Query Parameters**:
- `startDate` (ISO 8601 date, optional): Report start date
- `endDate` (ISO 8601 date, optional): Report end date
- `format` (string, optional): Report format (json, pdf, csv)

**Response**: `200 OK`
```json
{
  "taskId": "task_abc123",
  "reportPeriod": {
    "startDate": "2025-01-05T00:00:00Z",
    "endDate": "2025-01-06T23:59:59Z"
  },
  "progressMetrics": {
    "todosCompleted": 2,
    "deliverablesSubmitted": 5,
    "qualityChecksPerformed": 3,
    "averageCompletionTime": 4.5,
    "velocityTrend": "increasing"
  },
  "teamPerformance": {
    "activeMembers": 3,
    "totalHoursLogged": 24,
    "averageQualityScore": 85
  },
  "risks": [
    {
      "type": "schedule",
      "severity": "low",
      "description": "One todo item blocked",
      "impact": "May delay completion by 1 day"
    }
  ],
  "recommendations": [
    "Resolve infrastructure approval blocker",
    "Consider parallel work on non-dependent tasks"
  ]
}
```

---

## WebSocket Events

Connect to WebSocket endpoint: `wss://api.yourdomain.com/ws`

### Analysis Progress Event

Sent during task analysis to provide real-time progress updates.

```json
{
  "type": "analysis_progress",
  "taskId": "task_abc123",
  "progress": 65,
  "currentStep": "Identifying related workgroups",
  "estimatedTimeRemaining": 42,
  "timestamp": "2025-01-05T10:31:30Z"
}
```

### Todo Status Change Event

Sent when a todo item's status changes.

```json
{
  "type": "todo_status_change",
  "todoId": "todo_xyz789",
  "taskId": "task_abc123",
  "oldStatus": "pending",
  "newStatus": "in_progress",
  "updatedBy": "user_123",
  "timestamp": "2025-01-06T09:00:00Z"
}
```

### Quality Check Complete Event

Sent when a quality check is completed.

```json
{
  "type": "quality_check_complete",
  "deliverableId": "deliv_456",
  "todoId": "todo_xyz789",
  "result": {
    "overallScore": 85,
    "passed": true
  },
  "timestamp": "2025-01-06T15:00:00Z"
}
```

### Blocker Detected Event

Sent when a blocker is detected for a todo item.

```json
{
  "type": "blocker_detected",
  "todoId": "todo_xyz790",
  "taskId": "task_abc123",
  "reason": "Dependency not met",
  "severity": "high",
  "timestamp": "2025-01-06T16:00:00Z"
}
```

---

## Error Codes

### HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required or failed
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., duplicate submission)
- `413 Payload Too Large`: Request body exceeds size limit
- `422 Unprocessable Entity`: Validation failed
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

### Application Error Codes

```json
{
  "error": {
    "code": "INVALID_TASK_CONTENT",
    "message": "Task content exceeds maximum length",
    "details": {
      "maxLength": 50000,
      "actualLength": 65000
    },
    "timestamp": "2025-01-05T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

**Common Error Codes**:

- `INVALID_TASK_CONTENT`: Task content validation failed
- `ANALYSIS_TIMEOUT`: Task analysis exceeded time limit
- `KNOWLEDGE_SEARCH_FAILED`: Knowledge base search failed
- `INVALID_FILE_TYPE`: Unsupported file type
- `FILE_TOO_LARGE`: File exceeds size limit
- `VALIDATION_FAILED`: Deliverable validation failed
- `ASSESSMENT_FAILED`: Quality assessment failed
- `STANDARDS_NOT_FOUND`: Quality standards not found
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `RESOURCE_NOT_FOUND`: Requested resource not found
- `RATE_LIMIT_EXCEEDED`: API rate limit exceeded

---

## Rate Limits

- **Standard tier**: 100 requests per minute per user
- **Premium tier**: 500 requests per minute per user
- **Enterprise tier**: Custom limits

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704456000
```

---

## Pagination

All list endpoints support pagination using `limit` and `offset` parameters.

**Response includes pagination metadata**:
```json
{
  "data": [...],
  "pagination": {
    "totalCount": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Versioning

The API uses URL versioning. Current version: `v1`

Breaking changes will result in a new API version. Non-breaking changes will be added to the current version.

---

## Support

For API support, contact: api-support@company.com

For bug reports, visit: https://github.com/company/work-task-analysis/issues
