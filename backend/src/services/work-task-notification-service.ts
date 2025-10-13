import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export interface WorkTaskNotificationRequest {
  task_id: string;
  todo_id?: string;
  deliverable_id?: string;
  notification_type: 'task_reminder' | 'quality_issue' | 'progress_update' | 'blocker_alert' | 'status_change';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  recipient: {
    user_id: string;
    team_id: string;
    email?: string;
  };
  message: {
    title: string;
    body: string;
    action_url?: string;
    metadata?: Record<string, any>;
  };
}

export interface NotificationChannel {
  type: 'slack' | 'teams' | 'email' | 'sms';
  enabled: boolean;
  config?: Record<string, any>;
}

export interface NotificationPreferences {
  user_id: string;
  team_id: string;
  channels: NotificationChannel[];
  quiet_hours?: {
    enabled: boolean;
    start: string; // HH:MM
    end: string;   // HH:MM
    timezone: string;
  };
  notification_types: {
    task_reminder: boolean;
    quality_issue: boolean;
    progress_update: boolean;
    blocker_alert: boolean;
    status_change: boolean;
  };
}

export interface NotificationResult {
  notification_id: string;
  sent_at: Date;
  channels_used: string[];
  delivery_status: 'sent' | 'failed' | 'partial';
  failed_channels?: string[];
}

export interface ReminderSchedule {
  task_id: string;
  todo_id: string;
  reminder_type: 'due_date' | 'blocker' | 'delayed' | 'quality_issue';
  scheduled_at: Date;
  recurrence?: 'once' | 'daily' | 'weekly';
  status: 'pending' | 'sent' | 'cancelled';
}

/**
 * Service for managing work task notifications and reminders
 */
export class WorkTaskNotificationService {
  private dynamoClient: DynamoDBClient;
  private sqsClient: SQSClient;
  private notificationTableName: string;
  private preferencesTableName: string;
  private reminderQueueUrl: string;
  private slackWebhookUrl?: string;
  private teamsWebhookUrl?: string;

  constructor(config: {
    notificationTableName: string;
    preferencesTableName: string;
    reminderQueueUrl: string;
    slackWebhookUrl?: string;
    teamsWebhookUrl?: string;
    region?: string;
  }) {
    this.dynamoClient = new DynamoDBClient({ region: config.region || process.env.AWS_REGION });
    this.sqsClient = new SQSClient({ region: config.region || process.env.AWS_REGION });
    
    this.notificationTableName = config.notificationTableName;
    this.preferencesTableName = config.preferencesTableName;
    this.reminderQueueUrl = config.reminderQueueUrl;
    this.slackWebhookUrl = config.slackWebhookUrl;
    this.teamsWebhookUrl = config.teamsWebhookUrl;
  }

  /**
   * Send notification for work task events
   */
  async sendNotification(request: WorkTaskNotificationRequest): Promise<NotificationResult> {
    const notificationId = this.generateNotificationId();
    
    // Get user preferences
    const preferences = await this.getUserPreferences(request.recipient.user_id);
    
    // Check if notification type is enabled
    if (preferences && !preferences.notification_types[request.notification_type]) {
      return {
        notification_id: notificationId,
        sent_at: new Date(),
        channels_used: [],
        delivery_status: 'sent'
      };
    }

    // Check quiet hours
    if (preferences && this.isInQuietHours(preferences)) {
      await this.scheduleDelayedNotification(request, preferences);
      return {
        notification_id: notificationId,
        sent_at: new Date(),
        channels_used: [],
        delivery_status: 'sent'
      };
    }

    // Determine channels based on urgency and preferences
    const channels = this.determineChannels(request.urgency, preferences);
    
    const sentChannels: string[] = [];
    const failedChannels: string[] = [];

    // Send to each channel
    for (const channel of channels) {
      try {
        await this.sendToChannel(channel.type, request);
        sentChannels.push(channel.type);
      } catch (error) {
        console.error(`Failed to send to ${channel.type}:`, error);
        failedChannels.push(channel.type);
      }
    }

    // Store notification record for audit
    await this.storeNotificationRecord({
      notification_id: notificationId,
      task_id: request.task_id,
      todo_id: request.todo_id,
      deliverable_id: request.deliverable_id,
      notification_type: request.notification_type,
      urgency: request.urgency,
      recipient_user_id: request.recipient.user_id,
      recipient_team_id: request.recipient.team_id,
      message_title: request.message.title,
      message_body: request.message.body,
      channels_used: sentChannels,
      failed_channels: failedChannels,
      sent_at: new Date(),
      metadata: request.message.metadata
    });

    return {
      notification_id: notificationId,
      sent_at: new Date(),
      channels_used: sentChannels,
      delivery_status: failedChannels.length === 0 ? 'sent' : 
                      sentChannels.length === 0 ? 'failed' : 'partial',
      failed_channels: failedChannels.length > 0 ? failedChannels : undefined
    };
  }

  /**
   * Send reminder for blocked or delayed tasks (Requirement 11.4)
   */
  async sendTaskReminder(
    taskId: string,
    todoId: string,
    reminderType: 'blocker' | 'delayed' | 'due_soon',
    details: {
      task_title: string;
      blocker_reason?: string;
      days_delayed?: number;
      due_date?: Date;
      assigned_to: string;
      team_id: string;
    }
  ): Promise<NotificationResult> {
    let message: { title: string; body: string; action_url?: string };

    switch (reminderType) {
      case 'blocker':
        message = {
          title: `⚠️ Task Blocked: ${details.task_title}`,
          body: `Your task has been blocked.\n\nReason: ${details.blocker_reason}\n\nPlease review and take action to unblock this task.`,
          action_url: `/work-tasks/${taskId}/todos/${todoId}`
        };
        break;
      
      case 'delayed':
        message = {
          title: `⏰ Task Delayed: ${details.task_title}`,
          body: `This task is ${details.days_delayed} days behind schedule.\n\nPlease update the status or adjust the timeline.`,
          action_url: `/work-tasks/${taskId}/todos/${todoId}`
        };
        break;
      
      case 'due_soon':
        message = {
          title: `📅 Task Due Soon: ${details.task_title}`,
          body: `This task is due on ${details.due_date?.toLocaleDateString()}.\n\nPlease ensure it's completed on time.`,
          action_url: `/work-tasks/${taskId}/todos/${todoId}`
        };
        break;
    }

    return await this.sendNotification({
      task_id: taskId,
      todo_id: todoId,
      notification_type: reminderType === 'blocker' ? 'blocker_alert' : 'task_reminder',
      urgency: reminderType === 'blocker' ? 'high' : 'medium',
      recipient: {
        user_id: details.assigned_to,
        team_id: details.team_id
      },
      message
    });
  }

  /**
   * Send instant notification for quality issues (Requirement 12.3)
   */
  async sendQualityIssueNotification(
    taskId: string,
    todoId: string,
    deliverableId: string,
    qualityIssues: {
      severity: 'low' | 'medium' | 'high' | 'critical';
      issues: Array<{
        type: string;
        description: string;
        suggestion: string;
      }>;
      quality_score: number;
      submitted_by: string;
      team_id: string;
    }
  ): Promise<NotificationResult> {
    const issueCount = qualityIssues.issues.length;
    const criticalIssues = qualityIssues.issues.filter(i => i.type.includes('critical')).length;

    const message = {
      title: `🔍 Quality Issues Detected: ${issueCount} issue${issueCount > 1 ? 's' : ''} found`,
      body: this.buildQualityIssueMessage(qualityIssues),
      action_url: `/work-tasks/${taskId}/deliverables/${deliverableId}`,
      metadata: {
        quality_score: qualityIssues.quality_score,
        issue_count: issueCount,
        critical_issues: criticalIssues
      }
    };

    return await this.sendNotification({
      task_id: taskId,
      todo_id: todoId,
      deliverable_id: deliverableId,
      notification_type: 'quality_issue',
      urgency: qualityIssues.severity,
      recipient: {
        user_id: qualityIssues.submitted_by,
        team_id: qualityIssues.team_id
      },
      message
    });
  }

  /**
   * Send progress update notification
   */
  async sendProgressUpdate(
    taskId: string,
    progressData: {
      completed_todos: number;
      total_todos: number;
      completion_percentage: number;
      team_id: string;
      team_members: string[];
    }
  ): Promise<NotificationResult[]> {
    const message = {
      title: `📊 Task Progress Update`,
      body: `Progress: ${progressData.completion_percentage}% complete\n\nCompleted: ${progressData.completed_todos}/${progressData.total_todos} tasks`,
      action_url: `/work-tasks/${taskId}/progress`
    };

    const results: NotificationResult[] = [];

    // Send to all team members
    for (const userId of progressData.team_members) {
      const result = await this.sendNotification({
        task_id: taskId,
        notification_type: 'progress_update',
        urgency: 'low',
        recipient: {
          user_id: userId,
          team_id: progressData.team_id
        },
        message
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Schedule automatic reminder for task
   */
  async scheduleReminder(schedule: ReminderSchedule): Promise<void> {
    const delaySeconds = Math.floor((schedule.scheduled_at.getTime() - Date.now()) / 1000);
    
    if (delaySeconds <= 0) {
      throw new Error('Scheduled time must be in the future');
    }

    // Store reminder schedule
    await this.storeReminderSchedule(schedule);

    // Schedule via SQS with delay
    const command = new SendMessageCommand({
      QueueUrl: this.reminderQueueUrl,
      MessageBody: JSON.stringify(schedule),
      DelaySeconds: Math.min(delaySeconds, 900) // SQS max delay is 15 minutes
    });

    await this.sqsClient.send(command);
  }

  /**
   * Cancel scheduled reminder
   */
  async cancelReminder(taskId: string, todoId: string): Promise<void> {
    // Update reminder status to cancelled
    await this.updateReminderStatus(taskId, todoId, 'cancelled');
  }

  /**
   * Get notification preferences for user
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const command = new QueryCommand({
        TableName: this.preferencesTableName,
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId }
        },
        Limit: 1
      });

      const result = await this.dynamoClient.send(command);
      
      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const item = result.Items[0];
      return {
        user_id: item.user_id?.S || '',
        team_id: item.team_id?.S || '',
        channels: JSON.parse(item.channels?.S || '[]'),
        quiet_hours: item.quiet_hours?.S ? JSON.parse(item.quiet_hours.S) : undefined,
        notification_types: JSON.parse(item.notification_types?.S || '{"task_reminder":true,"quality_issue":true,"progress_update":true,"blocker_alert":true,"status_change":true}')
      };
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return null;
    }
  }

  /**
   * Update notification preferences
   */
  async updateUserPreferences(preferences: NotificationPreferences): Promise<void> {
    const item: Record<string, any> = {
      user_id: { S: preferences.user_id },
      team_id: { S: preferences.team_id },
      channels: { S: JSON.stringify(preferences.channels) },
      notification_types: { S: JSON.stringify(preferences.notification_types) },
      updated_at: { S: new Date().toISOString() }
    };

    if (preferences.quiet_hours) {
      item.quiet_hours = { S: JSON.stringify(preferences.quiet_hours) };
    }

    const command = new PutItemCommand({
      TableName: this.preferencesTableName,
      Item: item
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Get notification history for audit (Requirement 8.2)
   */
  async getNotificationHistory(
    taskId: string,
    _options?: {
      startDate?: Date;
      endDate?: Date;
      notificationType?: string;
    }
  ): Promise<any[]> {
    try {
      const command = new QueryCommand({
        TableName: this.notificationTableName,
        IndexName: 'task_id-sent_at-index',
        KeyConditionExpression: 'task_id = :taskId',
        ExpressionAttributeValues: {
          ':taskId': { S: taskId }
        }
      });

      const result = await this.dynamoClient.send(command);
      
      return (result.Items || []).map(item => ({
        notification_id: item.notification_id?.S,
        task_id: item.task_id?.S,
        todo_id: item.todo_id?.S,
        notification_type: item.notification_type?.S,
        urgency: item.urgency?.S,
        recipient_user_id: item.recipient_user_id?.S,
        recipient_team_id: item.recipient_team_id?.S,
        message_title: item.message_title?.S,
        channels_used: item.channels_used?.SS || [],
        sent_at: item.sent_at?.S,
        metadata: item.metadata?.S ? JSON.parse(item.metadata.S) : undefined
      }));
    } catch (error) {
      console.error('Failed to get notification history:', error);
      return [];
    }
  }

  // Private helper methods

  private generateNotificationId(): string {
    return `wt-notif-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private determineChannels(
    urgency: string,
    preferences: NotificationPreferences | null
  ): NotificationChannel[] {
    if (preferences && preferences.channels.length > 0) {
      return preferences.channels.filter(c => c.enabled);
    }

    // Default channels based on urgency
    const defaultChannels: NotificationChannel[] = [];
    
    if (urgency === 'critical' || urgency === 'high') {
      defaultChannels.push({ type: 'slack', enabled: true });
      defaultChannels.push({ type: 'email', enabled: true });
    } else if (urgency === 'medium') {
      defaultChannels.push({ type: 'slack', enabled: true });
    } else {
      defaultChannels.push({ type: 'email', enabled: true });
    }

    return defaultChannels;
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quiet_hours || !preferences.quiet_hours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: preferences.quiet_hours.timezone 
    }).substring(0, 5);

    return currentTime >= preferences.quiet_hours.start && currentTime <= preferences.quiet_hours.end;
  }

  private async sendToChannel(
    channelType: 'slack' | 'teams' | 'email' | 'sms',
    request: WorkTaskNotificationRequest
  ): Promise<void> {
    switch (channelType) {
      case 'slack':
        await this.sendSlackNotification(request);
        break;
      case 'teams':
        await this.sendTeamsNotification(request);
        break;
      case 'email':
        await this.sendEmailNotification(request);
        break;
      case 'sms':
        await this.sendSMSNotification(request);
        break;
      default:
        throw new Error(`Unsupported channel: ${channelType}`);
    }
  }

  private async sendSlackNotification(request: WorkTaskNotificationRequest): Promise<void> {
    if (!this.slackWebhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const slackMessage = {
      text: request.message.title,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: request.message.title
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: request.message.body
          }
        }
      ]
    };

    if (request.message.action_url) {
      slackMessage.blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details'
            },
            url: request.message.action_url
          }
        ]
      } as any);
    }

    // Simulate Slack API call
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendTeamsNotification(request: WorkTaskNotificationRequest): Promise<void> {
    if (!this.teamsWebhookUrl) {
      throw new Error('Teams webhook URL not configured');
    }

    const teamsMessage = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: request.message.title,
      themeColor: this.getColorForUrgency(request.urgency),
      sections: [
        {
          activityTitle: request.message.title,
          activitySubtitle: `Task ID: ${request.task_id}`,
          text: request.message.body
        }
      ],
      potentialAction: request.message.action_url ? [
        {
          '@type': 'OpenUri',
          name: 'View Details',
          targets: [
            {
              os: 'default',
              uri: request.message.action_url
            }
          ]
        }
      ] : undefined
    };

    // Simulate Teams API call (in production, would use fetch/axios)
    console.log('Sending Teams notification:', teamsMessage);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendEmailNotification(request: WorkTaskNotificationRequest): Promise<void> {
    if (!request.recipient.email) {
      throw new Error('Email address not provided');
    }

    // Use SQS to queue email for sending
    const command = new SendMessageCommand({
      QueueUrl: process.env.EMAIL_QUEUE_URL || this.reminderQueueUrl,
      MessageBody: JSON.stringify({
        type: 'email',
        to: request.recipient.email,
        subject: request.message.title,
        body: this.buildEmailBody(request),
        urgency: request.urgency
      })
    });

    await this.sqsClient.send(command);
  }

  private async sendSMSNotification(request: WorkTaskNotificationRequest): Promise<void> {
    // SMS notifications for critical alerts only
    if (request.urgency !== 'critical') {
      return;
    }

    // Use SQS to queue SMS for sending
    const command = new SendMessageCommand({
      QueueUrl: process.env.SMS_QUEUE_URL || this.reminderQueueUrl,
      MessageBody: JSON.stringify({
        type: 'sms',
        message: `${request.message.title}\n\n${request.message.body}`,
        recipient: request.recipient
      })
    });

    await this.sqsClient.send(command);
  }

  private buildQualityIssueMessage(qualityIssues: any): string {
    let message = `Quality Score: ${qualityIssues.quality_score}/100\n\n`;
    message += `Issues Found:\n`;
    
    qualityIssues.issues.slice(0, 5).forEach((issue: any, index: number) => {
      message += `${index + 1}. ${issue.type}: ${issue.description}\n`;
      message += `   Suggestion: ${issue.suggestion}\n\n`;
    });

    if (qualityIssues.issues.length > 5) {
      message += `... and ${qualityIssues.issues.length - 5} more issues.\n`;
    }

    return message;
  }

  private buildEmailBody(request: WorkTaskNotificationRequest): string {
    let body = `${request.message.body}\n\n`;
    
    if (request.message.action_url) {
      body += `View Details: ${request.message.action_url}\n\n`;
    }

    body += `---\n`;
    body += `Task ID: ${request.task_id}\n`;
    body += `Notification Type: ${request.notification_type}\n`;
    body += `Urgency: ${request.urgency}\n`;
    
    return body;
  }

  private getColorForUrgency(urgency: string): string {
    switch (urgency) {
      case 'critical': return '#DC3545';
      case 'high': return '#FD7E14';
      case 'medium': return '#FFC107';
      case 'low': return '#28A745';
      default: return '#6C757D';
    }
  }

  private async scheduleDelayedNotification(
    request: WorkTaskNotificationRequest,
    preferences: NotificationPreferences
  ): Promise<void> {
    // Calculate delay until quiet hours end
    const delaySeconds = this.calculateDelayUntilQuietHoursEnd(preferences);
    
    const command = new SendMessageCommand({
      QueueUrl: this.reminderQueueUrl,
      MessageBody: JSON.stringify(request),
      DelaySeconds: Math.min(delaySeconds, 900)
    });

    await this.sqsClient.send(command);
  }

  private calculateDelayUntilQuietHoursEnd(preferences: NotificationPreferences): number {
    if (!preferences.quiet_hours) return 0;
    
    // Simplified calculation - in production, use proper timezone handling
    const now = new Date();
    const endTime = preferences.quiet_hours.end.split(':');
    const endHour = parseInt(endTime[0]);
    const endMinute = parseInt(endTime[1]);
    
    const endDate = new Date(now);
    endDate.setHours(endHour, endMinute, 0, 0);
    
    if (endDate <= now) {
      endDate.setDate(endDate.getDate() + 1);
    }
    
    return Math.floor((endDate.getTime() - now.getTime()) / 1000);
  }

  private async storeNotificationRecord(record: any): Promise<void> {
    const item: Record<string, any> = {
      notification_id: { S: record.notification_id },
      task_id: { S: record.task_id },
      notification_type: { S: record.notification_type },
      urgency: { S: record.urgency },
      recipient_user_id: { S: record.recipient_user_id },
      recipient_team_id: { S: record.recipient_team_id },
      message_title: { S: record.message_title },
      message_body: { S: record.message_body },
      sent_at: { S: record.sent_at.toISOString() },
      created_at: { S: new Date().toISOString() }
    };

    if (record.todo_id) {
      item.todo_id = { S: record.todo_id };
    }

    if (record.deliverable_id) {
      item.deliverable_id = { S: record.deliverable_id };
    }

    if (record.channels_used && record.channels_used.length > 0) {
      item.channels_used = { SS: record.channels_used };
    }

    if (record.failed_channels && record.failed_channels.length > 0) {
      item.failed_channels = { SS: record.failed_channels };
    }

    if (record.metadata) {
      item.metadata = { S: JSON.stringify(record.metadata) };
    }

    const command = new PutItemCommand({
      TableName: this.notificationTableName,
      Item: item
    });

    await this.dynamoClient.send(command);
  }

  private async storeReminderSchedule(schedule: ReminderSchedule): Promise<void> {
    const item: Record<string, any> = {
      notification_id: { S: `reminder-${schedule.task_id}-${schedule.todo_id}` },
      task_id: { S: schedule.task_id },
      todo_id: { S: schedule.todo_id },
      reminder_type: { S: schedule.reminder_type },
      scheduled_at: { S: schedule.scheduled_at.toISOString() },
      status: { S: schedule.status },
      created_at: { S: new Date().toISOString() }
    };

    if (schedule.recurrence) {
      item.recurrence = { S: schedule.recurrence };
    }

    const command = new PutItemCommand({
      TableName: this.notificationTableName,
      Item: item
    });

    await this.dynamoClient.send(command);
  }

  private async updateReminderStatus(taskId: string, todoId: string, status: string): Promise<void> {
    // Implementation would update the reminder status in DynamoDB
    console.log(`Updating reminder status for ${taskId}/${todoId} to ${status}`);
  }
}
