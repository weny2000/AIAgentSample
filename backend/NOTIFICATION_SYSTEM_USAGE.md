# Work Task Notification System - Usage Guide

## Overview

The Work Task Notification System provides comprehensive notification and reminder functionality for work tasks, including multi-channel delivery (Slack, Teams, Email, SMS), user preferences, and automated reminders.

## Architecture

```
┌─────────────────┐
│  Event Sources  │
│  - Status Change│
│  - Quality Check│
│  - Progress     │
│  - Delayed Task │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  EventBridge    │
│  Event Bus      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Notification   │
│  Handler Lambda │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Notification   │
│  Service        │
└────────┬────────┘
         │
         ├──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
    │ Slack  │    │ Teams  │    │ Email  │    │  SMS   │
    └────────┘    └────────┘    └────────┘    └────────┘
```

## Quick Start

### 1. Sending a Direct Notification

```typescript
import { WorkTaskNotificationService } from './services/work-task-notification-service';

const notificationService = new WorkTaskNotificationService({
  notificationTableName: process.env.NOTIFICATION_TABLE_NAME!,
  preferencesTableName: process.env.PREFERENCES_TABLE_NAME!,
  reminderQueueUrl: process.env.REMINDER_QUEUE_URL!,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
});

// Send a task reminder
await notificationService.sendTaskReminder(
  'task-123',
  'todo-456',
  'blocker',
  {
    task_title: 'Implement Feature X',
    blocker_reason: 'Waiting for API access',
    assigned_to: 'user-1',
    team_id: 'team-1'
  }
);
```

### 2. Emitting Events (Recommended)

```typescript
import { NotificationEventEmitter } from './services/notification-event-emitter';

const eventEmitter = new NotificationEventEmitter({
  eventBusName: process.env.EVENT_BUS_NAME!
});

// Emit a quality check complete event
await eventEmitter.emitQualityCheckComplete({
  task_id: 'task-123',
  todo_id: 'todo-456',
  deliverable_id: 'deliverable-789',
  quality_score: 65,
  severity: 'high',
  issues: [
    {
      type: 'format_error',
      description: 'Invalid JSON format',
      suggestion: 'Validate JSON structure'
    }
  ],
  submitted_by: 'user-1',
  team_id: 'team-1'
});
```

## Notification Types

### 1. Task Reminders

**Use Case:** Remind users about blocked, delayed, or due-soon tasks

```typescript
await notificationService.sendTaskReminder(
  taskId,
  todoId,
  'blocker', // or 'delayed' or 'due_soon'
  {
    task_title: 'Task Title',
    blocker_reason: 'Reason for blocking', // for blocker type
    days_delayed: 3, // for delayed type
    due_date: new Date('2025-01-15'), // for due_soon type
    assigned_to: 'user-id',
    team_id: 'team-id'
  }
);
```

**Channels:** Based on urgency
- Blocker: High urgency (Slack + Email)
- Delayed: Medium urgency (Slack)
- Due Soon: Medium urgency (Slack)

### 2. Quality Issue Notifications

**Use Case:** Instant notification when quality issues are detected

```typescript
await notificationService.sendQualityIssueNotification(
  taskId,
  todoId,
  deliverableId,
  {
    severity: 'high', // 'low' | 'medium' | 'high' | 'critical'
    issues: [
      {
        type: 'format_error',
        description: 'Invalid JSON format',
        suggestion: 'Validate JSON structure'
      }
    ],
    quality_score: 65,
    submitted_by: 'user-id',
    team_id: 'team-id'
  }
);
```

**Channels:** Based on severity
- Critical: Slack + Email + SMS
- High: Slack + Email
- Medium: Slack
- Low: Email

### 3. Progress Updates

**Use Case:** Notify team members of progress milestones

```typescript
await notificationService.sendProgressUpdate(
  taskId,
  {
    completed_todos: 5,
    total_todos: 10,
    completion_percentage: 50,
    team_id: 'team-id',
    team_members: ['user-1', 'user-2', 'user-3']
  }
);
```

**Channels:** Low urgency (Email)

### 4. Status Change Notifications

**Use Case:** Notify when task status changes

```typescript
await eventEmitter.emitTaskStatusChange({
  task_id: 'task-123',
  todo_id: 'todo-456',
  old_status: 'in_progress',
  new_status: 'completed',
  assigned_to: 'user-id',
  team_id: 'team-id',
  task_title: 'Task Title'
});
```

**Channels:** Low urgency (Email), except for blocked status (High urgency)

## User Preferences

### Setting User Preferences

```typescript
await notificationService.updateUserPreferences({
  user_id: 'user-1',
  team_id: 'team-1',
  channels: [
    { type: 'slack', enabled: true },
    { type: 'email', enabled: true },
    { type: 'sms', enabled: false }
  ],
  quiet_hours: {
    enabled: true,
    start: '22:00',
    end: '08:00',
    timezone: 'America/New_York'
  },
  notification_types: {
    task_reminder: true,
    quality_issue: true,
    progress_update: false, // Disable progress updates
    blocker_alert: true,
    status_change: true
  }
});
```

### Getting User Preferences

```typescript
const preferences = await notificationService.getUserPreferences('user-1');

if (preferences) {
  console.log('User channels:', preferences.channels);
  console.log('Quiet hours:', preferences.quiet_hours);
  console.log('Notification types:', preferences.notification_types);
}
```

## Scheduling Reminders

### Schedule a Future Reminder

```typescript
await notificationService.scheduleReminder({
  task_id: 'task-123',
  todo_id: 'todo-456',
  reminder_type: 'due_date',
  scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  recurrence: 'once', // or 'daily' or 'weekly'
  status: 'pending'
});
```

### Cancel a Scheduled Reminder

```typescript
await notificationService.cancelReminder('task-123', 'todo-456');
```

## Notification History

### Get Notification History for a Task

```typescript
const history = await notificationService.getNotificationHistory('task-123');

history.forEach(notification => {
  console.log('Notification ID:', notification.notification_id);
  console.log('Type:', notification.notification_type);
  console.log('Sent at:', notification.sent_at);
  console.log('Channels used:', notification.channels_used);
  console.log('Delivery status:', notification.delivery_status);
});
```

## Integration with Other Services

### TodoProgressTracker Integration

```typescript
import { TodoProgressTracker } from './services/todo-progress-tracker';
import { NotificationEventEmitter } from './services/notification-event-emitter';

class TodoProgressTrackerWithNotifications extends TodoProgressTracker {
  private eventEmitter: NotificationEventEmitter;

  constructor(config: any) {
    super(config);
    this.eventEmitter = new NotificationEventEmitter({
      eventBusName: process.env.EVENT_BUS_NAME!
    });
  }

  async updateTodoStatus(todoId: string, status: string, metadata: any): Promise<void> {
    const oldStatus = await this.getCurrentStatus(todoId);
    
    // Update status
    await super.updateTodoStatus(todoId, status, metadata);

    // Emit status change event
    await this.eventEmitter.emitTaskStatusChange({
      task_id: metadata.task_id,
      todo_id: todoId,
      old_status: oldStatus,
      new_status: status,
      assigned_to: metadata.assigned_to,
      team_id: metadata.team_id,
      task_title: metadata.task_title
    });

    // Check for progress milestones
    const progress = await this.trackProgress(metadata.task_id);
    if (this.isProgressMilestone(progress.completion_percentage)) {
      await this.eventEmitter.emitProgressMilestone({
        task_id: metadata.task_id,
        milestone_type: this.getMilestoneType(progress.completion_percentage),
        completed_todos: progress.completed_count,
        total_todos: progress.total_count,
        completion_percentage: progress.completion_percentage,
        team_id: metadata.team_id,
        team_members: metadata.team_members
      });
    }
  }
}
```

### QualityAssessmentEngine Integration

```typescript
import { QualityAssessmentEngine } from './services/quality-assessment-engine';
import { NotificationEventEmitter } from './services/notification-event-emitter';

class QualityAssessmentEngineWithNotifications extends QualityAssessmentEngine {
  private eventEmitter: NotificationEventEmitter;

  constructor(config: any) {
    super(config);
    this.eventEmitter = new NotificationEventEmitter({
      eventBusName: process.env.EVENT_BUS_NAME!
    });
  }

  async performQualityCheck(deliverable: any, standards: any[]): Promise<any> {
    const result = await super.performQualityCheck(deliverable, standards);

    // Emit quality check complete event if there are issues
    if (result.issues.length > 0) {
      await this.eventEmitter.emitQualityCheckComplete({
        task_id: deliverable.task_id,
        todo_id: deliverable.todo_id,
        deliverable_id: deliverable.deliverable_id,
        quality_score: result.quality_score,
        severity: result.severity,
        issues: result.issues,
        submitted_by: deliverable.submitted_by,
        team_id: deliverable.team_id
      });
    }

    return result;
  }
}
```

## Environment Variables

```bash
# Required
NOTIFICATION_TABLE_NAME=ai-agent-notifications-dev
PREFERENCES_TABLE_NAME=ai-agent-notification-preferences-dev
REMINDER_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/ai-agent-reminder-queue-dev
EVENT_BUS_NAME=ai-agent-work-task-events-dev

# Optional (for channel integrations)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
EMAIL_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/email-queue
SMS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/sms-queue
```

## Testing

### Unit Tests

```bash
cd backend
npm test -- work-task-notification-service-simple.test.ts
```

### Integration Tests

```bash
cd backend
npm test -- work-task-notification-handler.test.ts
```

## Monitoring

### CloudWatch Metrics

- `NotificationDeliverySuccess`: Number of successful notifications
- `NotificationDeliveryFailure`: Number of failed notifications
- `ChannelDeliveryRate`: Delivery rate per channel
- `QueueDepth`: Number of messages in reminder queue
- `QueueAge`: Age of oldest message in queue

### CloudWatch Alarms

- **ReminderDLQAlarm**: Triggers when messages appear in DLQ
- **ReminderQueueAgeAlarm**: Triggers when messages are too old (>1 hour)
- **NotificationsTableThrottleAlarm**: Triggers on DynamoDB throttling

### CloudWatch Logs

```bash
# View notification handler logs
aws logs tail /aws/lambda/ai-agent-notification-handler-dev --follow

# Search for specific notification
aws logs filter-pattern /aws/lambda/ai-agent-notification-handler-dev \
  --filter-pattern "notification_id=notif-123"
```

## Troubleshooting

### Notifications Not Being Delivered

1. **Check user preferences:**
   ```typescript
   const prefs = await notificationService.getUserPreferences('user-id');
   console.log('Preferences:', prefs);
   ```

2. **Check notification history:**
   ```typescript
   const history = await notificationService.getNotificationHistory('task-id');
   console.log('Recent notifications:', history);
   ```

3. **Check CloudWatch logs:**
   ```bash
   aws logs tail /aws/lambda/ai-agent-notification-handler-dev --follow
   ```

4. **Check DLQ:**
   ```bash
   aws sqs receive-message --queue-url $REMINDER_DLQ_URL
   ```

### Quiet Hours Not Working

Ensure the timezone is correctly set in user preferences:
```typescript
quiet_hours: {
  enabled: true,
  start: '22:00',
  end: '08:00',
  timezone: 'America/New_York' // Use IANA timezone names
}
```

### Channel Integration Issues

1. **Slack:** Verify webhook URL is valid and has correct permissions
2. **Teams:** Verify webhook URL is valid and connector is enabled
3. **Email:** Check SQS queue permissions and SES configuration
4. **SMS:** Check SQS queue permissions and SNS configuration

## Best Practices

1. **Use EventBridge for Decoupling:**
   - Emit events instead of calling notification service directly
   - Allows for easier testing and future extensibility

2. **Respect User Preferences:**
   - Always check user preferences before sending notifications
   - Honor quiet hours and notification type filters

3. **Use Appropriate Urgency Levels:**
   - Critical: Only for urgent issues requiring immediate action
   - High: Important issues that need attention soon
   - Medium: Regular notifications
   - Low: Informational updates

4. **Include Actionable Information:**
   - Always include action URLs in notifications
   - Provide clear next steps in message body
   - Include relevant context (task title, issue details, etc.)

5. **Monitor and Alert:**
   - Set up CloudWatch alarms for DLQ and queue age
   - Monitor delivery success rates
   - Track user engagement with notifications

## API Reference

See [TASK_15_NOTIFICATION_INTEGRATION_SUMMARY.md](./TASK_15_NOTIFICATION_INTEGRATION_SUMMARY.md) for complete API reference and implementation details.
