# Work Task Agent Integration

## Overview

The Work Task Agent Integration service seamlessly integrates work task analysis functionality into the existing AgentCore conversation flows. This integration enables users to create, manage, and analyze work tasks through natural conversation with the AI agent.

## Features

### 1. Context-Aware Conversations
- Maintains work task context across conversation sessions
- Remembers active tasks, pending todos, and user preferences
- Provides contextual responses based on conversation history

### 2. Intent Detection
The system automatically detects user intents related to work tasks:
- **Create Task**: "Create a task: Implement authentication"
- **Query Tasks**: "Show me my tasks"
- **Update Task**: "Update task task-123"
- **Analyze Progress**: "What's the progress on my tasks?"

### 3. Memory Integration
- **Short-term Memory**: Recent conversation messages
- **Long-term Memory**: Conversation summaries and patterns
- **Semantic Memory**: Knowledge base references
- **Procedural Memory**: Action items and todos

### 4. Proactive Suggestions
The system provides proactive suggestions based on:
- Pending todo items
- Blocked tasks
- Overdue items
- Follow-up opportunities

### 5. Audit Logging
All work task operations are logged for compliance:
- Task creation via conversation
- Task updates via conversation
- User interactions and decisions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Conversation                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│          WorkTaskAgentIntegration Service                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. Intent Analysis                                   │  │
│  │  2. Context Management                                │  │
│  │  3. Work Task Handling                                │  │
│  │  4. Response Enhancement                              │  │
│  │  5. Proactive Suggestions                             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────┬──────────────────────────────────┬─────────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────┐          ┌──────────────────────────┐
│  AgentCoreService   │          │ WorkTaskAnalysisService  │
│  - Conversations    │          │ - Task Analysis          │
│  - Memory           │          │ - Todo Generation        │
│  - Notifications    │          │ - Risk Assessment        │
└─────────────────────┘          └──────────────────────────┘
```

## Usage

### Starting a Conversation Session

```typescript
import { WorkTaskAgentIntegration } from './services/work-task-agent-integration';

// Initialize the integration service
const integration = new WorkTaskAgentIntegration(
  agentCoreService,
  workTaskAnalysisService,
  conversationService,
  auditService,
  notificationService,
  logger
);

// Process a message
const response = await integration.processMessageWithWorkTaskContext(
  sessionId,
  message,
  userId,
  teamId
);
```

### API Endpoints

#### POST /api/v1/work-task/conversation
Process a conversational message with work task awareness.

**Request:**
```json
{
  "sessionId": "session-123",
  "message": "Create a task: Implement user authentication",
  "userId": "user-123",
  "teamId": "team-123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg-456",
    "response": "✅ I've analyzed your task: Implement user authentication...",
    "references": [...],
    "actionItems": [...],
    "suggestions": [...],
    "confidence": 0.9,
    "processingTime": 1500
  }
}
```

#### POST /api/v1/work-task/conversation/start
Start a new conversation session.

**Request:**
```json
{
  "userId": "user-123",
  "teamId": "team-123",
  "personaId": "work-task-assistant",
  "initialMessage": "Hello"
}
```

#### DELETE /api/v1/work-task/conversation/:sessionId
End a conversation session.

#### GET /api/v1/work-task/conversation/:sessionId/history
Get conversation history.

## Intent Detection Patterns

### Create Task
- "Create a task"
- "New task: [title]"
- "Submit a task"
- "Analyze this task"
- "Break down this task"

### Query Tasks
- "Show me my tasks"
- "What are my tasks?"
- "Task status"
- "Check task"
- "View task"

### Update Task
- "Update task [id]"
- "Modify task [id]"
- "Change task [id]"
- "Complete task [id]"
- "Mark task [id]"

### Analyze Progress
- "Progress on [task]"
- "How is [task] going?"
- "Status of [task]"
- "What's the status?"

## Context Management

### Work Task Context Structure
```typescript
interface WorkTaskConversationContext {
  activeWorkTasks: string[];              // Active task IDs
  recentAnalyses: Map<string, TaskAnalysisResult>;
  pendingTodoItems: TodoItem[];
  workTaskMemory: WorkTaskMemoryEntry[];
  proactiveSuggestions: ProactiveSuggestion[];
}
```

### Memory Entry
```typescript
interface WorkTaskMemoryEntry {
  taskId: string;
  taskTitle: string;
  discussionTimestamp: Date;
  keyDecisions: string[];
  userPreferences: Record<string, any>;
  followUpNeeded: boolean;
}
```

## Proactive Suggestions

The system generates proactive suggestions based on:

1. **Blocked Items**: Alerts when todo items are blocked
2. **Overdue Items**: Reminds about overdue tasks
3. **Follow-ups**: Suggests follow-up on tasks discussed days ago
4. **Action Opportunities**: Identifies opportunities to create tasks from conversations

### Suggestion Types
- `reminder`: Time-based reminders
- `recommendation`: Actionable recommendations
- `warning`: Important alerts
- `opportunity`: Opportunities for improvement

## Audit Logging

All work task operations are logged with:
- User ID and team ID
- Action type (create, update, query, etc.)
- Session ID
- References to knowledge base sources
- Compliance score
- Result summary

### Logged Actions
- `work_task_created_via_conversation`
- `work_task_updated_via_conversation`
- `work_task_queried_via_conversation`
- `work_task_progress_analyzed`

## Error Handling

The integration service handles errors gracefully:
- Analysis failures fall back to general conversation
- Missing context is recreated automatically
- Expired sessions are cleaned up periodically
- All errors are logged for troubleshooting

## Performance Considerations

### Context Cleanup
Expired contexts are automatically cleaned up after 24 hours of inactivity:

```typescript
await integration.cleanupExpiredContexts();
```

### Caching
- Work task contexts are cached in memory for quick access
- Recent analyses are stored in the context
- Memory context is built on-demand

## Testing

### Unit Tests
```bash
npm test work-task-agent-integration.test.ts
```

### Simple Tests
```bash
npm test work-task-agent-integration-simple.test.ts
```

### Test Coverage
- Intent detection
- Context management
- Proactive suggestions
- Audit logging
- Error handling
- Context cleanup

## Integration with AgentCore

The integration seamlessly works with AgentCore:

1. **Message Processing**: Intercepts messages to detect work task intents
2. **Context Enhancement**: Adds work task context to conversations
3. **Response Enhancement**: Enriches responses with work task insights
4. **Proactive Notifications**: Sends notifications through AgentCore

## Best Practices

1. **Always provide session context**: Include sessionId, userId, and teamId
2. **Handle errors gracefully**: Implement proper error handling
3. **Monitor audit logs**: Review logs for compliance and troubleshooting
4. **Clean up contexts**: Run cleanup periodically to free memory
5. **Test intent detection**: Verify patterns match your use cases

## Future Enhancements

- [ ] Multi-language support for intent detection
- [ ] Advanced NLP for better intent recognition
- [ ] Integration with external task management systems
- [ ] Real-time collaboration features
- [ ] Voice-based task creation
- [ ] Automated task prioritization based on ML models

## Support

For issues or questions:
1. Check the audit logs for detailed error information
2. Review the test cases for usage examples
3. Consult the AgentCore documentation for conversation management
4. Contact the development team for assistance
