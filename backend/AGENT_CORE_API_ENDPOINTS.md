# AgentCore API Endpoints Documentation

This document describes the comprehensive API endpoints implemented for the AgentCore service, including RESTful APIs, WebSocket support, capability discovery, health monitoring, and configuration management.

## Overview

The AgentCore API provides a complete interface for interacting with AI agents, managing conversations, monitoring health, and configuring agent behavior. The API supports both HTTP REST endpoints and WebSocket connections for real-time communication.

## Authentication

All endpoints require authentication via JWT tokens passed through API Gateway. The token should contain:
- `sub` or `userId`: User identifier
- `team_id` or `teamId`: Team identifier
- `role`: User role
- `department`: User department
- `clearance`: Security clearance level
- `permissions`: Comma-separated list of permissions

## REST API Endpoints

### Session Management

#### Start Session
```http
POST /agent/sessions
Content-Type: application/json

{
  "personaId": "leader-persona-123",
  "initialMessage": "Hello, I need help with security policies",
  "context": {
    "currentTopic": "security",
    "relatedArtifacts": ["policy-doc-1"]
  }
}
```

**Response:**
```json
{
  "sessionId": "session-abc123",
  "agentConfiguration": {
    "agentId": "agent-core-1",
    "name": "AI Assistant",
    "description": "Intelligent team assistant"
  },
  "capabilities": [
    {
      "id": "cap-1",
      "name": "Policy Analysis",
      "category": "analysis",
      "enabled": true
    }
  ],
  "welcomeMessage": "Hello! I'm your AI assistant..."
}
```

#### Send Message
```http
POST /agent/sessions/{sessionId}/messages
Content-Type: application/json

{
  "message": "What are the security policies for our team?",
  "messageType": "text"
}
```

**Response:**
```json
{
  "messageId": "msg-123",
  "response": "Here are the security policies for your team...",
  "references": [
    {
      "sourceId": "policy-doc-1",
      "sourceType": "policy",
      "snippet": "Security policy excerpt...",
      "confidence": 0.85
    }
  ],
  "actionItems": [
    {
      "id": "action-1",
      "description": "Review updated security policy",
      "priority": "medium",
      "status": "pending"
    }
  ],
  "suggestions": [
    "Would you like to see the compliance checklist?",
    "Should I create a reminder for policy review?"
  ],
  "confidence": 0.85,
  "processingTime": 1200
}
```

#### Get Session History
```http
GET /agent/sessions/{sessionId}/history?limit=10&includeReferences=true
```

**Response:**
```json
{
  "messages": [
    {
      "messageId": "msg-1",
      "role": "user",
      "content": "What are the security policies?",
      "timestamp": "2024-01-15T10:30:00Z",
      "metadata": {
        "confidence": 0.85,
        "processingTime": 1200
      }
    }
  ],
  "totalCount": 25,
  "hasMore": true,
  "summary": "Conversation about security policies and compliance"
}
```

#### End Session
```http
DELETE /agent/sessions/{sessionId}
```

**Response:**
```json
{
  "message": "Session ended successfully"
}
```

### Capability Discovery

#### Get Agent Capabilities
```http
GET /agent/capabilities?category=analysis&enabled=true
```

**Response:**
```json
{
  "capabilities": [
    {
      "id": "cap-1",
      "name": "Policy Analysis",
      "description": "Analyze policies and compliance requirements",
      "category": "analysis",
      "enabled": true,
      "configuration": {
        "maxDocumentSize": "10MB",
        "supportedFormats": ["pdf", "docx", "txt"]
      },
      "permissions": ["read", "analyze"]
    },
    {
      "id": "cap-2",
      "name": "Knowledge Search",
      "description": "Search organizational knowledge base",
      "category": "search",
      "enabled": true,
      "configuration": {
        "maxResults": 50,
        "searchTimeout": 5000
      },
      "permissions": ["search"]
    }
  ]
}
```

#### Get Agent Metadata
```http
GET /agent/metadata
```

**Response:**
```json
{
  "agentId": "agent-core-1",
  "name": "AI Agent Assistant",
  "description": "Intelligent assistant for team collaboration",
  "version": "1.0.0",
  "capabilities": ["Policy Analysis", "Knowledge Search", "Compliance Checking"],
  "supportedLanguages": ["en", "es", "fr", "de"],
  "maxSessionDuration": 60,
  "maxConcurrentSessions": 10,
  "features": [
    "Real-time conversation",
    "Policy compliance checking",
    "Knowledge base search",
    "Proactive notifications",
    "Multi-turn dialogue",
    "Context awareness",
    "Learning and adaptation"
  ]
}
```

### Health Monitoring

#### Basic Health Check
```http
GET /agent/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "service": "AgentCore",
  "version": "1.0.0"
}
```

#### Detailed Health Check
```http
GET /agent/health/detailed
```

**Response:**
```json
{
  "agentId": "agent-core-1",
  "status": "healthy",
  "lastHealthCheck": "2024-01-15T10:30:00Z",
  "metrics": {
    "averageResponseTime": 1200,
    "successRate": 0.98,
    "errorRate": 0.02,
    "activeSessions": 5,
    "memoryUsage": 0.65,
    "cpuUsage": 0.45
  },
  "issues": []
}
```

#### Get Agent Status
```http
GET /agent/status?includeMetrics=true&includeIssues=true
```

**Response:**
```json
{
  "status": "healthy",
  "activeSessions": 5,
  "lastActivity": "2024-01-15T10:30:00Z",
  "metrics": {
    "averageResponseTime": 1200,
    "successRate": 0.98,
    "errorRate": 0.02
  },
  "issues": []
}
```

### Configuration Management

#### Get Agent Configuration
```http
GET /agent/agents/{agentId}/config
Authorization: Bearer <token-with-agent-config-read-permission>
```

**Response:**
```json
{
  "agentId": "agent-1",
  "name": "Team Assistant",
  "description": "AI assistant for team collaboration",
  "personaId": "persona-1",
  "capabilities": ["analysis", "search", "validation"],
  "settings": {
    "responseStyle": "formal",
    "verbosity": "detailed",
    "proactivity": "moderate",
    "learningEnabled": true,
    "memoryRetention": 30,
    "maxContextLength": 10000
  },
  "constraints": {
    "maxSessionDuration": 60,
    "maxConcurrentSessions": 10,
    "allowedActions": ["search", "analyze", "validate"],
    "restrictedTopics": ["confidential", "personal"],
    "complianceRequired": true,
    "auditLevel": "detailed"
  },
  "version": "1.0.0",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### Update Agent Configuration
```http
PUT /agent/agents/{agentId}/config
Authorization: Bearer <token-with-agent-config-write-permission>
Content-Type: application/json

{
  "settings": {
    "responseStyle": "casual",
    "verbosity": "concise",
    "proactivity": "proactive"
  },
  "constraints": {
    "maxSessionDuration": 90,
    "maxConcurrentSessions": 15
  },
  "capabilities": ["analysis", "search", "validation", "notification"]
}
```

**Response:**
```json
{
  "agentId": "agent-1",
  "name": "Team Assistant",
  "settings": {
    "responseStyle": "casual",
    "verbosity": "concise",
    "proactivity": "proactive",
    "learningEnabled": true,
    "memoryRetention": 30,
    "maxContextLength": 10000
  },
  "constraints": {
    "maxSessionDuration": 90,
    "maxConcurrentSessions": 15,
    "allowedActions": ["search", "analyze", "validate"],
    "restrictedTopics": ["confidential", "personal"],
    "complianceRequired": true,
    "auditLevel": "detailed"
  },
  "capabilities": ["analysis", "search", "validation", "notification"],
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

### Analytics

#### Get Analytics Data
```http
GET /agent/analytics?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&metrics=sessions,satisfaction,performance
Authorization: Bearer <token-with-analytics-read-permission>
```

**Response:**
```json
{
  "totalSessions": 150,
  "averageSessionDuration": 8.5,
  "userSatisfactionScore": 4.2,
  "topTopics": [
    {
      "topic": "security",
      "frequency": 45,
      "averageConfidence": 0.85,
      "userSatisfaction": 4.3
    },
    {
      "topic": "policy",
      "frequency": 38,
      "averageConfidence": 0.82,
      "userSatisfaction": 4.1
    }
  ],
  "performanceMetrics": {
    "averageResponseTime": 1200,
    "successRate": 0.98,
    "errorRate": 0.02,
    "complianceRate": 0.95
  },
  "learningInsights": {
    "patternsIdentified": 23,
    "improvementsImplemented": 8,
    "userFeedbackScore": 4.1,
    "adaptationRate": 0.75
  }
}
```

## WebSocket API

### Connection

Connect to the WebSocket endpoint with authentication parameters:

```
wss://api.example.com/agent/ws?userId=user123&teamId=team456&role=user&permissions=read,write,search
```

### Message Format

All WebSocket messages follow this format:

```json
{
  "action": "message|typing|join_session|leave_session|ping",
  "sessionId": "session-id",
  "message": "message content",
  "messageType": "text|command|file_upload",
  "data": {}
}
```

### Actions

#### Send Message
```json
{
  "action": "message",
  "sessionId": "session-abc123",
  "message": "What are the security policies?",
  "messageType": "text"
}
```

**Response:**
```json
{
  "type": "message",
  "sessionId": "session-abc123",
  "messageId": "msg-123",
  "content": "Here are the security policies...",
  "confidence": 0.85,
  "references": [...],
  "actionItems": [...],
  "suggestions": [...],
  "processingTime": 1200,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Typing Indicator
```json
{
  "action": "typing",
  "sessionId": "session-abc123"
}
```

**Response:**
```json
{
  "type": "typing",
  "sessionId": "session-abc123",
  "content": "Agent is typing...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Join Session
```json
{
  "action": "join_session",
  "sessionId": "session-abc123"
}
```

**Response:**
```json
{
  "type": "status",
  "sessionId": "session-abc123",
  "content": "Joined session successfully",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Leave Session
```json
{
  "action": "leave_session",
  "sessionId": "session-abc123"
}
```

**Response:**
```json
{
  "type": "status",
  "content": "Left session successfully",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Ping/Pong
```json
{
  "action": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Responses

```json
{
  "type": "error",
  "error": "Error message",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Error Handling

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid input, missing fields)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource not found)
- `409` - Conflict (resource conflict)
- `422` - Unprocessable Entity (validation errors)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error
- `502` - Bad Gateway (upstream service error)
- `503` - Service Unavailable (temporary unavailability)
- `504` - Gateway Timeout (upstream timeout)

### Error Response Format

```json
{
  "errorCode": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional error details"
  },
  "correlationId": "correlation-id-123",
  "retryAfter": 60
}
```

## Rate Limiting

- **Session Management**: 100 requests per minute per user
- **Message Sending**: 60 messages per minute per session
- **Analytics**: 10 requests per minute per user
- **Configuration**: 5 updates per minute per user
- **WebSocket Connections**: 10 connections per user

## Security Considerations

### Authentication
- All endpoints require valid JWT tokens
- Tokens must contain required claims (userId, teamId, permissions)
- Token expiration is enforced

### Authorization
- Role-based access control (RBAC)
- Permission-based access for sensitive operations
- Team-based data isolation

### Data Protection
- All data encrypted in transit (TLS 1.3)
- Sensitive data encrypted at rest (KMS)
- PII detection and masking
- Audit logging for all operations

### WebSocket Security
- Connection authentication via query parameters
- Connection timeout and cleanup
- Message rate limiting
- Automatic disconnection for inactive connections

## Monitoring and Observability

### Metrics
- Request/response times
- Success/error rates
- Active sessions count
- Message processing times
- WebSocket connection counts

### Logging
- Structured JSON logging
- Correlation ID tracking
- User action auditing
- Error tracking with stack traces

### Alerting
- High error rates
- Slow response times
- Service unavailability
- Security violations

## Usage Examples

### JavaScript/TypeScript Client

```typescript
// REST API usage
const response = await fetch('/agent/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    personaId: 'leader-persona-123',
    initialMessage: 'Hello, I need help with policies'
  })
});

const session = await response.json();

// WebSocket usage
const ws = new WebSocket(`wss://api.example.com/agent/ws?userId=${userId}&teamId=${teamId}`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'join_session',
    sessionId: session.sessionId
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Send message
ws.send(JSON.stringify({
  action: 'message',
  sessionId: session.sessionId,
  message: 'What are the security policies?'
}));
```

### Python Client

```python
import requests
import websocket
import json

# REST API usage
response = requests.post('/agent/sessions', 
  headers={'Authorization': f'Bearer {token}'},
  json={
    'personaId': 'leader-persona-123',
    'initialMessage': 'Hello, I need help with policies'
  }
)

session = response.json()

# WebSocket usage
def on_message(ws, message):
    data = json.loads(message)
    print(f"Received: {data}")

def on_open(ws):
    ws.send(json.dumps({
        'action': 'join_session',
        'sessionId': session['sessionId']
    }))

ws = websocket.WebSocketApp(
    f"wss://api.example.com/agent/ws?userId={user_id}&teamId={team_id}",
    on_message=on_message,
    on_open=on_open
)

ws.run_forever()
```

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 1.1**: RESTful API endpoints for agent interactions ✅
- **Requirement 10.1**: Web interface integration support ✅  
- **Requirement 10.3**: Real-time updates and status monitoring ✅

### Key Features Implemented

1. **RESTful API Endpoints**: Complete CRUD operations for sessions, configuration, and monitoring
2. **WebSocket Support**: Real-time bidirectional communication for agent conversations
3. **Capability Discovery**: Dynamic capability querying and metadata retrieval
4. **Health Monitoring**: Basic and detailed health checks with metrics
5. **Configuration Management**: Agent settings and constraints management
6. **Analytics**: Performance metrics and usage analytics
7. **Security**: Authentication, authorization, and audit logging
8. **Error Handling**: Comprehensive error responses and retry mechanisms
9. **Rate Limiting**: Protection against abuse and resource exhaustion
10. **Monitoring**: Structured logging, metrics, and alerting