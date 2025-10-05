import { SQSEvent, SQSRecord, EventBridgeEvent } from 'aws-lambda';
import { WorkTaskNotificationService } from '../../services/work-task-notification-service';
import { Logger } from '../utils/logger';

const logger = new Logger('WorkTaskNotificationHandler');

const notificationService = new WorkTaskNotificationService({
  notificationTableName: process.env.NOTIFICATION_TABLE_NAME || 'work-task-notifications',
  preferencesTableName: process.env.PREFERENCES_TABLE_NAME || 'notification-preferences',
  reminderQueueUrl: process.env.REMINDER_QUEUE_URL || '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
  region: process.env.AWS_REGION
});

/**
 * Handler for processing notification requests from SQS
 */
export async function handleNotificationQueue(event: SQSEvent): Promise<void> {
  logger.info('Processing notification queue', { recordCount: event.Records.length });

  const results = await Promise.allSettled(
    event.Records.map(record => processNotificationRecord(record))
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    logger.error('Some notifications failed to process', { 
      failedCount: failed.length,
      totalCount: results.length 
    });
  }

  logger.info('Notification queue processing complete', {
    successful: results.filter(r => r.status === 'fulfilled').length,
    failed: failed.length
  });
}

/**
 * Process individual notification record
 */
async function processNotificationRecord(record: SQSRecord): Promise<void> {
  try {
    const message = JSON.parse(record.body);
    
    logger.info('Processing notification', { 
      messageId: record.messageId,
      notificationType: message.notification_type 
    });

    await notificationService.sendNotification(message);

    logger.info('Notification sent successfully', { messageId: record.messageId });
  } catch (error) {
    logger.error('Failed to process notification', { 
      messageId: record.messageId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Handler for scheduled reminder events from EventBridge
 */
export async function handleScheduledReminders(
  event: EventBridgeEvent<'Scheduled Event', any>
): Promise<void> {
  logger.info('Processing scheduled reminders', { time: event.time });

  try {
    // Query for reminders that are due
    const now = new Date();
    
    // This would query DynamoDB for pending reminders
    // For now, we'll process the event detail if provided
    if (event.detail && event.detail.reminders) {
      const reminders = event.detail.reminders;
      
      for (const reminder of reminders) {
        try {
          await processReminder(reminder);
        } catch (error) {
          logger.error('Failed to process reminder', {
            taskId: reminder.task_id,
            todoId: reminder.todo_id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    logger.info('Scheduled reminders processed successfully');
  } catch (error) {
    logger.error('Failed to process scheduled reminders', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Process individual reminder
 */
async function processReminder(reminder: any): Promise<void> {
  logger.info('Processing reminder', {
    taskId: reminder.task_id,
    todoId: reminder.todo_id,
    reminderType: reminder.reminder_type
  });

  await notificationService.sendTaskReminder(
    reminder.task_id,
    reminder.todo_id,
    reminder.reminder_type,
    reminder.details
  );
}

/**
 * Handler for task status change events
 */
export async function handleTaskStatusChange(
  event: EventBridgeEvent<'Task Status Changed', {
    task_id: string;
    todo_id: string;
    old_status: string;
    new_status: string;
    assigned_to: string;
    team_id: string;
    task_title: string;
  }>
): Promise<void> {
  logger.info('Processing task status change', {
    taskId: event.detail.task_id,
    todoId: event.detail.todo_id,
    oldStatus: event.detail.old_status,
    newStatus: event.detail.new_status
  });

  try {
    // Check if status change requires notification
    if (event.detail.new_status === 'blocked') {
      // Send blocker alert
      await notificationService.sendTaskReminder(
        event.detail.task_id,
        event.detail.todo_id,
        'blocker',
        {
          task_title: event.detail.task_title,
          blocker_reason: 'Task status changed to blocked',
          assigned_to: event.detail.assigned_to,
          team_id: event.detail.team_id
        }
      );
    } else {
      // Send status change notification
      await notificationService.sendNotification({
        task_id: event.detail.task_id,
        todo_id: event.detail.todo_id,
        notification_type: 'status_change',
        urgency: 'low',
        recipient: {
          user_id: event.detail.assigned_to,
          team_id: event.detail.team_id
        },
        message: {
          title: `Task Status Updated: ${event.detail.task_title}`,
          body: `Status changed from "${event.detail.old_status}" to "${event.detail.new_status}"`,
          action_url: `/work-tasks/${event.detail.task_id}/todos/${event.detail.todo_id}`
        }
      });
    }

    logger.info('Task status change notification sent successfully');
  } catch (error) {
    logger.error('Failed to send task status change notification', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Handler for quality check completion events
 */
export async function handleQualityCheckComplete(
  event: EventBridgeEvent<'Quality Check Complete', {
    task_id: string;
    todo_id: string;
    deliverable_id: string;
    quality_score: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    issues: Array<{
      type: string;
      description: string;
      suggestion: string;
    }>;
    submitted_by: string;
    team_id: string;
  }>
): Promise<void> {
  logger.info('Processing quality check completion', {
    taskId: event.detail.task_id,
    deliverableId: event.detail.deliverable_id,
    qualityScore: event.detail.quality_score,
    issueCount: event.detail.issues.length
  });

  try {
    // Only send notification if there are issues
    if (event.detail.issues.length > 0) {
      await notificationService.sendQualityIssueNotification(
        event.detail.task_id,
        event.detail.todo_id,
        event.detail.deliverable_id,
        {
          severity: event.detail.severity,
          issues: event.detail.issues,
          quality_score: event.detail.quality_score,
          submitted_by: event.detail.submitted_by,
          team_id: event.detail.team_id
        }
      );

      logger.info('Quality issue notification sent successfully');
    } else {
      logger.info('No quality issues found, skipping notification');
    }
  } catch (error) {
    logger.error('Failed to send quality check notification', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Handler for progress milestone events
 */
export async function handleProgressMilestone(
  event: EventBridgeEvent<'Progress Milestone', {
    task_id: string;
    milestone_type: 'quarter' | 'half' | 'three_quarters' | 'complete';
    completed_todos: number;
    total_todos: number;
    completion_percentage: number;
    team_id: string;
    team_members: string[];
  }>
): Promise<void> {
  logger.info('Processing progress milestone', {
    taskId: event.detail.task_id,
    milestoneType: event.detail.milestone_type,
    completionPercentage: event.detail.completion_percentage
  });

  try {
    await notificationService.sendProgressUpdate(
      event.detail.task_id,
      {
        completed_todos: event.detail.completed_todos,
        total_todos: event.detail.total_todos,
        completion_percentage: event.detail.completion_percentage,
        team_id: event.detail.team_id,
        team_members: event.detail.team_members
      }
    );

    logger.info('Progress milestone notification sent successfully');
  } catch (error) {
    logger.error('Failed to send progress milestone notification', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Handler for delayed task detection
 */
export async function handleDelayedTaskDetection(
  event: EventBridgeEvent<'Delayed Task Detected', {
    task_id: string;
    todo_id: string;
    task_title: string;
    days_delayed: number;
    assigned_to: string;
    team_id: string;
  }>
): Promise<void> {
  logger.info('Processing delayed task detection', {
    taskId: event.detail.task_id,
    todoId: event.detail.todo_id,
    daysDelayed: event.detail.days_delayed
  });

  try {
    await notificationService.sendTaskReminder(
      event.detail.task_id,
      event.detail.todo_id,
      'delayed',
      {
        task_title: event.detail.task_title,
        days_delayed: event.detail.days_delayed,
        assigned_to: event.detail.assigned_to,
        team_id: event.detail.team_id
      }
    );

    logger.info('Delayed task notification sent successfully');
  } catch (error) {
    logger.error('Failed to send delayed task notification', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
