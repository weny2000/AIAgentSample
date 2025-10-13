import { WorkTaskNotificationService, WorkTaskNotificationRequest, NotificationPreferences, ReminderSchedule } from '../work-task-notification-service';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';

const dynamoMock = mockClient(DynamoDBClient);
const snsMock = mockClient(SNSClient);
const sqsMock = mockClient(SQSClient);

describe('WorkTaskNotificationService', () => {
  let service: WorkTaskNotificationService;

  beforeEach(() => {
    dynamoMock.reset();
    snsMock.reset();
    sqsMock.reset();

    service = new WorkTaskNotificationService({
      notificationTableName: 'test-notifications',
      preferencesTableName: 'test-preferences',
      reminderQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
      slackWebhookUrl: 'https://hooks.slack.com/test',
      teamsWebhookUrl: 'https://outlook.office.com/webhook/test',
      region: 'us-east-1'
    });
  });

  describe('sendNotification', () => {
    it('should send notification to default channels based on urgency', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutItemCommand).resolves({});

      const request: WorkTaskNotificationRequest = {
        task_id: 'task-123',
        todo_id: 'todo-456',
        notification_type: 'task_reminder',
        urgency: 'high',
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1',
          email: 'user@example.com'
        },
        message: {
          title: 'Task Reminder',
          body: 'Please complete your task',
          action_url: '/tasks/task-123'
        }
      };

      const result = await service.sendNotification(request);

      expect(result.notification_id).toBeDefined();
      expect(result.delivery_status).toBe('sent');
      expect(result.channels_used).toContain('slack');
      expect(dynamoMock.calls()).toHaveLength(2); // Query preferences + Put notification
    });

    it('should respect user notification preferences', async () => {
      const preferences: NotificationPreferences = {
        user_id: 'user-1',
        team_id: 'team-1',
        channels: [
          { type: 'email', enabled: true },
          { type: 'slack', enabled: false }
        ],
        notification_types: {
          task_reminder: true,
          quality_issue: true,
          progress_update: false,
          blocker_alert: true,
          status_change: true
        }
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          user_id: { S: 'user-1' },
          team_id: { S: 'team-1' },
          channels: { S: JSON.stringify(preferences.channels) },
          notification_types: { S: JSON.stringify(preferences.notification_types) }
        }]
      });
      dynamoMock.on(PutItemCommand).resolves({});
      snsMock.on(PublishCommand).resolves({});

      const request: WorkTaskNotificationRequest = {
        task_id: 'task-123',
        notification_type: 'task_reminder',
        urgency: 'medium',
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1',
          email: 'user@example.com'
        },
        message: {
          title: 'Task Reminder',
          body: 'Please complete your task'
        }
      };

      const result = await service.sendNotification(request);

      expect(result.channels_used).toContain('email');
      expect(result.channels_used).not.toContain('slack');
    });

    it('should skip notification if type is disabled in preferences', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          user_id: { S: 'user-1' },
          team_id: { S: 'team-1' },
          channels: { S: '[]' },
          notification_types: { S: JSON.stringify({
            task_reminder: false,
            quality_issue: true,
            progress_update: true,
            blocker_alert: true,
            status_change: true
          })}
        }]
      });

      const request: WorkTaskNotificationRequest = {
        task_id: 'task-123',
        notification_type: 'task_reminder',
        urgency: 'medium',
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1'
        },
        message: {
          title: 'Task Reminder',
          body: 'Please complete your task'
        }
      };

      const result = await service.sendNotification(request);

      expect(result.channels_used).toHaveLength(0);
      expect(result.delivery_status).toBe('sent');
    });

    it('should handle quiet hours by scheduling delayed notification', async () => {
      const quietHours = {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'America/New_York'
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          user_id: { S: 'user-1' },
          team_id: { S: 'team-1' },
          channels: { S: '[]' },
          quiet_hours: { S: JSON.stringify(quietHours) },
          notification_types: { S: JSON.stringify({
            task_reminder: true,
            quality_issue: true,
            progress_update: true,
            blocker_alert: true,
            status_change: true
          })}
        }]
      });
      sqsMock.on(SendMessageCommand).resolves({});

      const request: WorkTaskNotificationRequest = {
        task_id: 'task-123',
        notification_type: 'task_reminder',
        urgency: 'low',
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1'
        },
        message: {
          title: 'Task Reminder',
          body: 'Please complete your task'
        }
      };

      // Mock current time to be within quiet hours
      jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('23:30:00');

      const result = await service.sendNotification(request);

      expect(result.channels_used).toHaveLength(0);
      expect(sqsMock.calls()).toHaveLength(1);
    });
  });

  describe('sendTaskReminder', () => {
    beforeEach(() => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutItemCommand).resolves({});
    });

    it('should send blocker alert with high urgency', async () => {
      const result = await service.sendTaskReminder(
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

      expect(result.notification_id).toBeDefined();
      expect(result.delivery_status).toBe('sent');
      
      const putCall = dynamoMock.calls().find(call => call.args[0].input.Item);
      expect(putCall?.args[0].input.Item.urgency.S).toBe('high');
      expect(putCall?.args[0].input.Item.notification_type.S).toBe('blocker_alert');
    });

    it('should send delayed task reminder', async () => {
      const result = await service.sendTaskReminder(
        'task-123',
        'todo-456',
        'delayed',
        {
          task_title: 'Implement Feature X',
          days_delayed: 3,
          assigned_to: 'user-1',
          team_id: 'team-1'
        }
      );

      expect(result.notification_id).toBeDefined();
      
      const putCall = dynamoMock.calls().find(call => call.args[0].input.Item);
      expect(putCall?.args[0].input.Item.message_title.S).toContain('Task Delayed');
      expect(putCall?.args[0].input.Item.message_body.S).toContain('3 days');
    });

    it('should send due soon reminder', async () => {
      const dueDate = new Date('2025-01-15');
      
      const result = await service.sendTaskReminder(
        'task-123',
        'todo-456',
        'due_soon',
        {
          task_title: 'Implement Feature X',
          due_date: dueDate,
          assigned_to: 'user-1',
          team_id: 'team-1'
        }
      );

      expect(result.notification_id).toBeDefined();
      
      const putCall = dynamoMock.calls().find(call => call.args[0].input.Item);
      expect(putCall?.args[0].input.Item.message_title.S).toContain('Due Soon');
    });
  });

  describe('sendQualityIssueNotification', () => {
    beforeEach(() => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutItemCommand).resolves({});
    });

    it('should send quality issue notification with issue details', async () => {
      const qualityIssues = {
        severity: 'high' as const,
        issues: [
          {
            type: 'format_error',
            description: 'Invalid JSON format',
            suggestion: 'Validate JSON structure'
          },
          {
            type: 'missing_field',
            description: 'Required field "name" is missing',
            suggestion: 'Add the required field'
          }
        ],
        quality_score: 65,
        submitted_by: 'user-1',
        team_id: 'team-1'
      };

      const result = await service.sendQualityIssueNotification(
        'task-123',
        'todo-456',
        'deliverable-789',
        qualityIssues
      );

      expect(result.notification_id).toBeDefined();
      expect(result.delivery_status).toBe('sent');
      
      const putCall = dynamoMock.calls().find(call => call.args[0].input.Item);
      expect(putCall?.args[0].input.Item.notification_type.S).toBe('quality_issue');
      expect(putCall?.args[0].input.Item.urgency.S).toBe('high');
      expect(putCall?.args[0].input.Item.message_title.S).toContain('2 issues');
    });

    it('should include quality score in metadata', async () => {
      const qualityIssues = {
        severity: 'medium' as const,
        issues: [
          {
            type: 'style_issue',
            description: 'Inconsistent formatting',
            suggestion: 'Run code formatter'
          }
        ],
        quality_score: 75,
        submitted_by: 'user-1',
        team_id: 'team-1'
      };

      await service.sendQualityIssueNotification(
        'task-123',
        'todo-456',
        'deliverable-789',
        qualityIssues
      );

      const putCall = dynamoMock.calls().find(call => call.args[0].input.Item);
      const metadata = JSON.parse(putCall?.args[0].input.Item.metadata.S || '{}');
      
      expect(metadata.quality_score).toBe(75);
      expect(metadata.issue_count).toBe(1);
    });
  });

  describe('sendProgressUpdate', () => {
    beforeEach(() => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutItemCommand).resolves({});
    });

    it('should send progress update to all team members', async () => {
      const progressData = {
        completed_todos: 7,
        total_todos: 10,
        completion_percentage: 70,
        team_id: 'team-1',
        team_members: ['user-1', 'user-2', 'user-3']
      };

      const results = await service.sendProgressUpdate('task-123', progressData);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.notification_id).toBeDefined();
        expect(result.delivery_status).toBe('sent');
      });
    });

    it('should include completion percentage in message', async () => {
      const progressData = {
        completed_todos: 5,
        total_todos: 10,
        completion_percentage: 50,
        team_id: 'team-1',
        team_members: ['user-1']
      };

      await service.sendProgressUpdate('task-123', progressData);

      const putCall = dynamoMock.calls().find(call => call.args[0].input.Item);
      expect(putCall?.args[0].input.Item.message_body.S).toContain('50%');
      expect(putCall?.args[0].input.Item.message_body.S).toContain('5/10');
    });
  });

  describe('scheduleReminder', () => {
    it('should schedule reminder via SQS', async () => {
      dynamoMock.on(PutItemCommand).resolves({});
      sqsMock.on(SendMessageCommand).resolves({});

      const schedule: ReminderSchedule = {
        task_id: 'task-123',
        todo_id: 'todo-456',
        reminder_type: 'due_date',
        scheduled_at: new Date(Date.now() + 3600000), // 1 hour from now
        recurrence: 'once',
        status: 'pending'
      };

      await service.scheduleReminder(schedule);

      expect(sqsMock.calls()).toHaveLength(1);
      expect(dynamoMock.calls()).toHaveLength(1);
      
      const sqsCall = sqsMock.calls()[0];
      expect(sqsCall.args[0].input.DelaySeconds).toBeGreaterThan(0);
    });

    it('should throw error if scheduled time is in the past', async () => {
      const schedule: ReminderSchedule = {
        task_id: 'task-123',
        todo_id: 'todo-456',
        reminder_type: 'due_date',
        scheduled_at: new Date(Date.now() - 3600000), // 1 hour ago
        recurrence: 'once',
        status: 'pending'
      };

      await expect(service.scheduleReminder(schedule)).rejects.toThrow('Scheduled time must be in the future');
    });
  });

  describe('getUserPreferences', () => {
    it('should return user preferences if they exist', async () => {
      const mockPreferences = {
        user_id: 'user-1',
        team_id: 'team-1',
        channels: [{ type: 'slack', enabled: true }],
        notification_types: {
          task_reminder: true,
          quality_issue: true,
          progress_update: false,
          blocker_alert: true,
          status_change: true
        }
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          user_id: { S: 'user-1' },
          team_id: { S: 'team-1' },
          channels: { S: JSON.stringify(mockPreferences.channels) },
          notification_types: { S: JSON.stringify(mockPreferences.notification_types) }
        }]
      });

      const preferences = await service.getUserPreferences('user-1');

      expect(preferences).not.toBeNull();
      expect(preferences?.user_id).toBe('user-1');
      expect(preferences?.channels).toHaveLength(1);
      expect(preferences?.notification_types.progress_update).toBe(false);
    });

    it('should return null if preferences do not exist', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const preferences = await service.getUserPreferences('user-1');

      expect(preferences).toBeNull();
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user preferences in DynamoDB', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const preferences: NotificationPreferences = {
        user_id: 'user-1',
        team_id: 'team-1',
        channels: [
          { type: 'slack', enabled: true },
          { type: 'email', enabled: true }
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
          progress_update: true,
          blocker_alert: true,
          status_change: false
        }
      };

      await service.updateUserPreferences(preferences);

      expect(dynamoMock.calls()).toHaveLength(1);
      const putCall = dynamoMock.calls()[0];
      expect(putCall.args[0].input.Item.user_id.S).toBe('user-1');
    });
  });

  describe('getNotificationHistory', () => {
    it('should return notification history for a task', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            notification_id: { S: 'notif-1' },
            task_id: { S: 'task-123' },
            todo_id: { S: 'todo-456' },
            notification_type: { S: 'task_reminder' },
            urgency: { S: 'medium' },
            recipient_user_id: { S: 'user-1' },
            recipient_team_id: { S: 'team-1' },
            message_title: { S: 'Task Reminder' },
            channels_used: { SS: ['slack', 'email'] },
            sent_at: { S: '2025-01-10T10:00:00Z' }
          },
          {
            notification_id: { S: 'notif-2' },
            task_id: { S: 'task-123' },
            notification_type: { S: 'quality_issue' },
            urgency: { S: 'high' },
            recipient_user_id: { S: 'user-1' },
            recipient_team_id: { S: 'team-1' },
            message_title: { S: 'Quality Issues Detected' },
            channels_used: { SS: ['slack'] },
            sent_at: { S: '2025-01-10T11:00:00Z' }
          }
        ]
      });

      const history = await service.getNotificationHistory('task-123');

      expect(history).toHaveLength(2);
      expect(history[0].notification_id).toBe('notif-1');
      expect(history[0].notification_type).toBe('task_reminder');
      expect(history[1].notification_type).toBe('quality_issue');
    });

    it('should return empty array if no history exists', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const history = await service.getNotificationHistory('task-123');

      expect(history).toHaveLength(0);
    });

    it('should handle query errors gracefully', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const history = await service.getNotificationHistory('task-123');

      expect(history).toHaveLength(0);
    });
  });
});
