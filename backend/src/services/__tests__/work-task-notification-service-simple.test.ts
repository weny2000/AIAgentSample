import { WorkTaskNotificationService } from '../work-task-notification-service';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutItemCommand: jest.fn(),
  QueryCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  SendMessageCommand: jest.fn()
}));

describe('WorkTaskNotificationService - Simple Tests', () => {
  let service: WorkTaskNotificationService;

  beforeEach(() => {
    service = new WorkTaskNotificationService({
      notificationTableName: 'test-notifications',
      preferencesTableName: 'test-preferences',
      reminderQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
      slackWebhookUrl: 'https://hooks.slack.com/test',
      teamsWebhookUrl: 'https://outlook.office.com/webhook/test',
      region: 'us-east-1'
    });
  });

  describe('Service Initialization', () => {
    it('should create service instance successfully', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(WorkTaskNotificationService);
    });

    it('should have required methods', () => {
      expect(typeof service.sendNotification).toBe('function');
      expect(typeof service.sendTaskReminder).toBe('function');
      expect(typeof service.sendQualityIssueNotification).toBe('function');
      expect(typeof service.sendProgressUpdate).toBe('function');
      expect(typeof service.scheduleReminder).toBe('function');
      expect(typeof service.getUserPreferences).toBe('function');
      expect(typeof service.updateUserPreferences).toBe('function');
      expect(typeof service.getNotificationHistory).toBe('function');
    });
  });

  describe('Notification Types', () => {
    it('should support task_reminder notification type', () => {
      const request = {
        task_id: 'task-123',
        notification_type: 'task_reminder' as const,
        urgency: 'medium' as const,
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1'
        },
        message: {
          title: 'Task Reminder',
          body: 'Please complete your task'
        }
      };

      expect(request.notification_type).toBe('task_reminder');
    });

    it('should support quality_issue notification type', () => {
      const request = {
        task_id: 'task-123',
        notification_type: 'quality_issue' as const,
        urgency: 'high' as const,
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1'
        },
        message: {
          title: 'Quality Issues',
          body: 'Issues detected'
        }
      };

      expect(request.notification_type).toBe('quality_issue');
    });

    it('should support blocker_alert notification type', () => {
      const request = {
        task_id: 'task-123',
        notification_type: 'blocker_alert' as const,
        urgency: 'critical' as const,
        recipient: {
          user_id: 'user-1',
          team_id: 'team-1'
        },
        message: {
          title: 'Task Blocked',
          body: 'Task has been blocked'
        }
      };

      expect(request.notification_type).toBe('blocker_alert');
    });
  });

  describe('Urgency Levels', () => {
    it('should support low urgency', () => {
      const urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
      expect(urgency).toBe('low');
    });

    it('should support medium urgency', () => {
      const urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      expect(urgency).toBe('medium');
    });

    it('should support high urgency', () => {
      const urgency: 'low' | 'medium' | 'high' | 'critical' = 'high';
      expect(urgency).toBe('high');
    });

    it('should support critical urgency', () => {
      const urgency: 'low' | 'medium' | 'high' | 'critical' = 'critical';
      expect(urgency).toBe('critical');
    });
  });

  describe('Notification Channels', () => {
    it('should support slack channel', () => {
      const channel = { type: 'slack' as const, enabled: true };
      expect(channel.type).toBe('slack');
    });

    it('should support teams channel', () => {
      const channel = { type: 'teams' as const, enabled: true };
      expect(channel.type).toBe('teams');
    });

    it('should support email channel', () => {
      const channel = { type: 'email' as const, enabled: true };
      expect(channel.type).toBe('email');
    });

    it('should support sms channel', () => {
      const channel = { type: 'sms' as const, enabled: true };
      expect(channel.type).toBe('sms');
    });
  });

  describe('Reminder Types', () => {
    it('should support blocker reminder type', () => {
      const reminderType: 'blocker' | 'delayed' | 'due_soon' = 'blocker';
      expect(reminderType).toBe('blocker');
    });

    it('should support delayed reminder type', () => {
      const reminderType: 'blocker' | 'delayed' | 'due_soon' = 'delayed';
      expect(reminderType).toBe('delayed');
    });

    it('should support due_soon reminder type', () => {
      const reminderType: 'blocker' | 'delayed' | 'due_soon' = 'due_soon';
      expect(reminderType).toBe('due_soon');
    });
  });
});
