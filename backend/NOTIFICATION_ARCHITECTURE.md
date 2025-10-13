# Work Task Notification System - Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Work Task Notification System                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Event Sources                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ TodoProgress     │  │ QualityAssessment│  │ WorkTaskAgent    │         │
│  │ Tracker          │  │ Engine           │  │ Integration      │         │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘         │
│           │                     │                      │                    │
│           │ emitProgressMilestone│ emitQualityCheck   │ emitStatusChange  │
│           │                     │                      │                    │
└───────────┼─────────────────────┼──────────────────────┼────────────────────┘
            │                     │                      │
            └─────────────────────┴──────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EventBridge Event Bus                                │
│                   ai-agent-work-task-events-{stage}                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Event Types:                                                               │
│  • Task Status Changed                                                      │
│  • Quality Check Complete                                                   │
│  • Progress Milestone                                                       │
│  • Delayed Task Detected                                                    │
│                                                                              │
│  Scheduled Rules:                                                           │
│  • Due Date Check (hourly)                                                  │
│                                                                              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Notification Handler Lambda                             │
│                work-task-notification-handler                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Handlers:                                                                  │
│  • handleTaskStatusChange()                                                 │
│  • handleQualityCheckComplete()                                             │
│  • handleProgressMilestone()                                                │
│  • handleDelayedTaskDetection()                                             │
│  • handleScheduledReminders()                                               │
│  • handleNotificationQueue()                                                │
│                                                                              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WorkTaskNotificationService                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Core Methods:                                                              │
│  • sendNotification()          - Multi-channel delivery                     │
│  • sendTaskReminder()          - Task-specific reminders                    │
│  • sendQualityIssueNotification() - Quality alerts                          │
│  • sendProgressUpdate()        - Progress notifications                     │
│  • scheduleReminder()          - Future reminder scheduling                 │
│  • getUserPreferences()        - Preference retrieval                       │
│  • updateUserPreferences()     - Preference management                      │
│  • getNotificationHistory()    - Audit trail                                │
│                                                                              │
└──────┬──────────────────┬──────────────────┬──────────────────┬─────────────┘
       │                  │                  │                  │
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   DynamoDB  │  │   DynamoDB  │  │     SQS     │  │     SQS     │
│Notifications│  │ Preferences │  │  Reminder   │  │  Reminder   │
│    Table    │  │    Table    │  │    Queue    │  │     DLQ     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
       │                  │                  │
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Channel Delivery Layer                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    Slack     │  │    Teams     │  │    Email     │  │     SMS      │  │
│  │   Webhook    │  │   Webhook    │  │  SQS Queue   │  │  SQS Queue   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Slack     │  │   Teams     │  │    Email    │  │     SMS     │
│  Workspace  │  │   Channel   │  │   Inbox     │  │   Device    │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

## Data Flow

### 1. Task Reminder Flow

```
TodoProgressTracker
    │
    │ 1. Detect blocked/delayed task
    │
    ▼
NotificationEventEmitter
    │
    │ 2. emitTaskStatusChange()
    │
    ▼
EventBridge Event Bus
    │
    │ 3. Task Status Changed event
    │
    ▼
Notification Handler Lambda
    │
    │ 4. handleTaskStatusChange()
    │
    ▼
WorkTaskNotificationService
    │
    │ 5. sendTaskReminder()
    │
    ├─────────────┬─────────────┬─────────────┐
    │             │             │             │
    ▼             ▼             ▼             ▼
  Slack        Teams        Email          SMS
```

### 2. Quality Issue Flow

```
QualityAssessmentEngine
    │
    │ 1. Detect quality issues
    │
    ▼
NotificationEventEmitter
    │
    │ 2. emitQualityCheckComplete()
    │
    ▼
EventBridge Event Bus
    │
    │ 3. Quality Check Complete event
    │
    ▼
Notification Handler Lambda
    │
    │ 4. handleQualityCheckComplete()
    │
    ▼
WorkTaskNotificationService
    │
    │ 5. sendQualityIssueNotification()
    │
    ├─────────────┬─────────────┬─────────────┐
    │             │             │             │
    ▼             ▼             ▼             ▼
  Slack        Teams        Email          SMS
  (instant)    (instant)    (instant)   (critical only)
```

### 3. Progress Update Flow

```
TodoProgressTracker
    │
    │ 1. Detect progress milestone (25%, 50%, 75%, 100%)
    │
    ▼
NotificationEventEmitter
    │
    │ 2. emitProgressMilestone()
    │
    ▼
EventBridge Event Bus
    │
    │ 3. Progress Milestone event
    │
    ▼
Notification Handler Lambda
    │
    │ 4. handleProgressMilestone()
    │
    ▼
WorkTaskNotificationService
    │
    │ 5. sendProgressUpdate()
    │
    │   (sends to all team members)
    │
    ▼
  Email
  (low urgency)
```

### 4. Scheduled Reminder Flow

```
EventBridge Scheduled Rule
    │
    │ 1. Trigger every hour
    │
    ▼
Notification Handler Lambda
    │
    │ 2. handleScheduledReminders()
    │
    ▼
Query DynamoDB for due tasks
    │
    │ 3. Find tasks due soon
    │
    ▼
WorkTaskNotificationService
    │
    │ 4. sendTaskReminder('due_soon')
    │
    ├─────────────┬─────────────┐
    │             │             │
    ▼             ▼             ▼
  Slack        Email        (SMS if critical)
```

## Component Responsibilities

### NotificationEventEmitter
**Purpose:** Emit events to EventBridge for decoupled notification triggering

**Methods:**
- `emitTaskStatusChange()` - Task status changes
- `emitQualityCheckComplete()` - Quality check results
- `emitProgressMilestone()` - Progress milestones
- `emitDelayedTaskDetection()` - Delayed task detection

**Benefits:**
- Decouples event sources from notification logic
- Enables multiple consumers of events
- Simplifies testing and mocking
- Allows for future extensibility

### WorkTaskNotificationService
**Purpose:** Core notification delivery and management

**Responsibilities:**
- Multi-channel notification delivery
- User preference management
- Reminder scheduling
- Notification history tracking
- Channel routing based on urgency
- Quiet hours handling

**Key Features:**
- Urgency-based channel selection
- User preference filtering
- Quiet hours with delayed delivery
- Failed channel tracking
- Audit trail

### Notification Handler Lambda
**Purpose:** Process events and trigger notifications

**Responsibilities:**
- EventBridge event processing
- SQS queue processing
- Event-to-notification mapping
- Error handling and logging

**Event Types:**
- Task Status Changed
- Quality Check Complete
- Progress Milestone
- Delayed Task Detected
- Scheduled Reminders

## Database Schema

### Notifications Table
```
notification_id (PK)          - Unique notification ID
task_id                       - Associated task ID
todo_id                       - Associated todo ID (optional)
deliverable_id                - Associated deliverable ID (optional)
notification_type             - Type of notification
urgency                       - Urgency level
recipient_user_id             - Recipient user ID
recipient_team_id             - Recipient team ID
message_title                 - Notification title
message_body                  - Notification body
channels_used                 - Channels used for delivery
failed_channels               - Channels that failed
sent_at                       - Timestamp of sending
metadata                      - Additional metadata
created_at                    - Creation timestamp
ttl                           - Time to live (optional)

GSI: task_id-sent_at-index    - Query by task
GSI: recipient-index          - Query by recipient
GSI: type-index               - Query by type
```

### Preferences Table
```
user_id (PK)                  - User ID
team_id                       - Team ID
channels                      - Enabled channels (JSON)
quiet_hours                   - Quiet hours config (JSON)
notification_types            - Enabled notification types (JSON)
updated_at                    - Last update timestamp
ttl                           - Time to live (optional)

GSI: team-index               - Query by team
```

## Channel Configuration

### Slack
**Format:** Rich message blocks
**Features:**
- Header blocks
- Section blocks with markdown
- Action buttons
- Emoji support

**Configuration:**
- `SLACK_WEBHOOK_URL` environment variable
- Webhook URL from Slack app

### Microsoft Teams
**Format:** MessageCard (Office 365 Connector)
**Features:**
- Color-coded by urgency
- Activity title and subtitle
- OpenUri actions
- Schema.org extensions

**Configuration:**
- `TEAMS_WEBHOOK_URL` environment variable
- Webhook URL from Teams connector

### Email
**Format:** Plain text with HTML option
**Features:**
- Subject line from title
- Body with action URL
- Task metadata footer

**Configuration:**
- `EMAIL_QUEUE_URL` environment variable
- SQS queue for email delivery
- SES configuration (separate)

### SMS
**Format:** Plain text
**Features:**
- Critical alerts only
- Concise message format
- No action URLs (character limit)

**Configuration:**
- `SMS_QUEUE_URL` environment variable
- SQS queue for SMS delivery
- SNS configuration (separate)

## Monitoring and Observability

### CloudWatch Metrics
- `NotificationsSent` - Total notifications sent
- `NotificationsFailed` - Total notifications failed
- `ChannelDeliveryRate` - Delivery rate per channel
- `QueueDepth` - SQS queue depth
- `QueueAge` - Age of oldest message

### CloudWatch Alarms
- **ReminderDLQAlarm** - Messages in DLQ > 0
- **ReminderQueueAgeAlarm** - Queue age > 1 hour
- **NotificationsTableThrottleAlarm** - DynamoDB throttling

### CloudWatch Logs
- Lambda execution logs
- Notification delivery logs
- Error logs with stack traces
- Event processing logs

## Security

### Encryption
- DynamoDB tables encrypted with KMS
- SQS queues encrypted with KMS
- Webhook URLs stored in Secrets Manager (recommended)

### Access Control
- IAM roles for Lambda execution
- Least privilege permissions
- Resource-based policies for EventBridge

### Data Protection
- PII detection and masking (optional)
- Sensitive data encryption at rest
- TLS 1.3 for data in transit

## Scalability

### Horizontal Scaling
- Lambda auto-scaling
- DynamoDB on-demand billing
- SQS queue buffering

### Performance Optimization
- Batch processing for multiple notifications
- Async delivery via SQS
- EventBridge for decoupling

### Cost Optimization
- On-demand DynamoDB billing
- SQS message batching
- Lambda memory optimization

## Disaster Recovery

### Backup
- DynamoDB point-in-time recovery enabled
- SQS DLQ for failed messages
- CloudWatch Logs retention

### Monitoring
- CloudWatch alarms for failures
- DLQ monitoring
- Delivery success rate tracking

### Recovery
- Replay failed messages from DLQ
- Reprocess events from EventBridge
- Manual notification resend capability
