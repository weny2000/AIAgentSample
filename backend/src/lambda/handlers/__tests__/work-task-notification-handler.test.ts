import { SQSEvent, EventBridgeEvent } from 'aws-lambda';
import * as handler from '../work-task-notification-handler';
import { WorkTaskNotificationService } from '../../../services/work-task-notification-service';

jest.mock('../../../services/work-task-notification-service');

describe('WorkTaskNotificationHandler', () => {
  let mockNotificationService: jest.Mocked<WorkTaskNotificationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockNotificationService = {
      sendNotification: jest.fn().mockResolvedValue({
        notification_id: 'notif-123',
        sent_at: new Date(),
        channels_used: ['slack'],
        delivery_status: 'sent'
      }),
      sendTaskReminder: jest.fn().mockResolvedValue({
        notification_id: 'notif-123',
        sent_at: new Date(),
        channels_used: ['slack'],
        delivery_status: 'sent'
      }),
      sendQualityIssueNotification: jest.fn().mockResolvedValue({
        notification_id: 'notif-123',
        sent_at: new Date(),
        channels_used: ['slack'],
        delivery_status: 'sent'
      }),
      sendProgressUpdate: jest.fn().mockResolvedValue([{
        notification_id: 'notif-123',
        sent_at: new Date(),
        channels_used: ['slack'],
        delivery_status: 'sent'
      }])
    } as any;

    (WorkTaskNotificationService as jest.Mock).mockImplementation(() => mockNotificationService);
  });

  describe('handleNotificationQueue', () => {
    it('should process all notification records from SQS', async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
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
            }),
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:queue',
            awsRegion: 'us-east-1'
          },
          {
            messageId: 'msg-2',
            receiptHandle: 'receipt-2',
            body: JSON.stringify({
              task_id: 'task-456',
              notification_type: 'quality_issue',
              urgency: 'high',
              recipient: {
                user_id: 'user-2',
                team_id: 'team-2'
              },
              message: {
                title: 'Quality Issues',
                body: 'Issues detected'
              }
            }),
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:queue',
            awsRegion: 'us-east-1'
          }
        ]
      };

      await handler.handleNotificationQueue(event);

      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully and continue processing', async () => {
      mockNotificationService.sendNotification
        .mockRejectedValueOnce(new Error('Failed to send'))
        .mockResolvedValueOnce({
          notification_id: 'notif-123',
          sent_at: new Date(),
          channels_used: ['slack'],
          delivery_status: 'sent'
        });

      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
              task_id: 'task-123',
              notification_type: 'task_reminder',
              urgency: 'medium',
              recipient: { user_id: 'user-1', team_id: 'team-1' },
              message: { title: 'Test', body: 'Test' }
            }),
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:queue',
            awsRegion: 'us-east-1'
          },
          {
            messageId: 'msg-2',
            receiptHandle: 'receipt-2',
            body: JSON.stringify({
              task_id: 'task-456',
              notification_type: 'task_reminder',
              urgency: 'medium',
              recipient: { user_id: 'user-2', team_id: 'team-2' },
              message: { title: 'Test', body: 'Test' }
            }),
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:queue',
            awsRegion: 'us-east-1'
          }
        ]
      };

      await handler.handleNotificationQueue(event);

      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleTaskStatusChange', () => {
    it('should send blocker alert when task becomes blocked', async () => {
      const event: EventBridgeEvent<'Task Status Changed', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Task Status Changed',
        source: 'work-task-system',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          task_id: 'task-123',
          todo_id: 'todo-456',
          old_status: 'in_progress',
          new_status: 'blocked',
          assigned_to: 'user-1',
          team_id: 'team-1',
          task_title: 'Implement Feature X'
        }
      };

      await handler.handleTaskStatusChange(event);

      expect(mockNotificationService.sendTaskReminder).toHaveBeenCalledWith(
        'task-123',
        'todo-456',
        'blocker',
        expect.objectContaining({
          task_title: 'Implement Feature X',
          assigned_to: 'user-1',
          team_id: 'team-1'
        })
      );
    });

    it('should send status change notification for non-blocked status', async () => {
      const event: EventBridgeEvent<'Task Status Changed', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Task Status Changed',
        source: 'work-task-system',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          task_id: 'task-123',
          todo_id: 'todo-456',
          old_status: 'pending',
          new_status: 'in_progress',
          assigned_to: 'user-1',
          team_id: 'team-1',
          task_title: 'Implement Feature X'
        }
      };

      await handler.handleTaskStatusChange(event);

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-123',
          todo_id: 'todo-456',
          notification_type: 'status_change',
          urgency: 'low'
        })
      );
    });
  });

  describe('handleQualityCheckComplete', () => {
    it('should send quality issue notification when issues are found', async () => {
      const event: EventBridgeEvent<'Quality Check Complete', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Quality Check Complete',
        source: 'work-task-system',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
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
        }
      };

      await handler.handleQualityCheckComplete(event);

      expect(mockNotificationService.sendQualityIssueNotification).toHaveBeenCalledWith(
        'task-123',
        'todo-456',
        'deliverable-789',
        expect.objectContaining({
          severity: 'high',
          quality_score: 65,
          issues: expect.arrayContaining([
            expect.objectContaining({
              type: 'format_error'
            })
          ])
        })
      );
    });

    it('should not send notification when no issues are found', async () => {
      const event: EventBridgeEvent<'Quality Check Complete', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Quality Check Complete',
        source: 'work-task-system',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          task_id: 'task-123',
          todo_id: 'todo-456',
          deliverable_id: 'deliverable-789',
          quality_score: 95,
          severity: 'low',
          issues: [],
          submitted_by: 'user-1',
          team_id: 'team-1'
        }
      };

      await handler.handleQualityCheckComplete(event);

      expect(mockNotificationService.sendQualityIssueNotification).not.toHaveBeenCalled();
    });
  });

  describe('handleProgressMilestone', () => {
    it('should send progress update notification', async () => {
      const event: EventBridgeEvent<'Progress Milestone', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Progress Milestone',
        source: 'work-task-system',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          task_id: 'task-123',
          milestone_type: 'half',
          completed_todos: 5,
          total_todos: 10,
          completion_percentage: 50,
          team_id: 'team-1',
          team_members: ['user-1', 'user-2']
        }
      };

      await handler.handleProgressMilestone(event);

      expect(mockNotificationService.sendProgressUpdate).toHaveBeenCalledWith(
        'task-123',
        expect.objectContaining({
          completed_todos: 5,
          total_todos: 10,
          completion_percentage: 50,
          team_id: 'team-1',
          team_members: ['user-1', 'user-2']
        })
      );
    });
  });

  describe('handleDelayedTaskDetection', () => {
    it('should send delayed task reminder', async () => {
      const event: EventBridgeEvent<'Delayed Task Detected', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Delayed Task Detected',
        source: 'work-task-system',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          task_id: 'task-123',
          todo_id: 'todo-456',
          task_title: 'Implement Feature X',
          days_delayed: 3,
          assigned_to: 'user-1',
          team_id: 'team-1'
        }
      };

      await handler.handleDelayedTaskDetection(event);

      expect(mockNotificationService.sendTaskReminder).toHaveBeenCalledWith(
        'task-123',
        'todo-456',
        'delayed',
        expect.objectContaining({
          task_title: 'Implement Feature X',
          days_delayed: 3,
          assigned_to: 'user-1',
          team_id: 'team-1'
        })
      );
    });
  });

  describe('handleScheduledReminders', () => {
    it('should process scheduled reminders from event detail', async () => {
      const event: EventBridgeEvent<'Scheduled Event', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Scheduled Event',
        source: 'aws.events',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          reminders: [
            {
              task_id: 'task-123',
              todo_id: 'todo-456',
              reminder_type: 'due_soon',
              details: {
                task_title: 'Implement Feature X',
                due_date: new Date('2025-01-15'),
                assigned_to: 'user-1',
                team_id: 'team-1'
              }
            }
          ]
        }
      };

      await handler.handleScheduledReminders(event);

      expect(mockNotificationService.sendTaskReminder).toHaveBeenCalledWith(
        'task-123',
        'todo-456',
        'due_soon',
        expect.objectContaining({
          task_title: 'Implement Feature X'
        })
      );
    });

    it('should handle errors in individual reminders gracefully', async () => {
      mockNotificationService.sendTaskReminder
        .mockRejectedValueOnce(new Error('Failed to send'))
        .mockResolvedValueOnce({
          notification_id: 'notif-123',
          sent_at: new Date(),
          channels_used: ['slack'],
          delivery_status: 'sent'
        });

      const event: EventBridgeEvent<'Scheduled Event', any> = {
        version: '0',
        id: 'event-1',
        'detail-type': 'Scheduled Event',
        source: 'aws.events',
        account: '123456789',
        time: '2025-01-10T10:00:00Z',
        region: 'us-east-1',
        resources: [],
        detail: {
          reminders: [
            {
              task_id: 'task-123',
              todo_id: 'todo-456',
              reminder_type: 'due_soon',
              details: { task_title: 'Task 1', assigned_to: 'user-1', team_id: 'team-1' }
            },
            {
              task_id: 'task-789',
              todo_id: 'todo-012',
              reminder_type: 'due_soon',
              details: { task_title: 'Task 2', assigned_to: 'user-2', team_id: 'team-2' }
            }
          ]
        }
      };

      await handler.handleScheduledReminders(event);

      expect(mockNotificationService.sendTaskReminder).toHaveBeenCalledTimes(2);
    });
  });
});
