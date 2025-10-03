import { SQSEvent, SQSRecord, Handler } from 'aws-lambda';
import { EnhancedNotificationService } from '../../services/enhanced-notification-service.js';
import { NotificationRequest } from '../../services/notification-service.js';
import { Stakeholder } from '../../services/impact-analysis-service.js';
import { logger } from '../utils/logger.js';

interface RetryMessage {
  notification_id: string;
  stakeholder: Stakeholder;
  channel: string;
  request: NotificationRequest;
  retry_count: number;
  error_message?: string;
  reason?: 'quiet_hours' | 'api_failure' | 'rate_limit';
}

/**
 * Lambda handler for processing notification retries from SQS
 */
export const handler: Handler<SQSEvent, void> = async (event) => {
  const correlationId = `retry-${Date.now()}`;
  logger.setCorrelationId(correlationId);

  const notificationService = new EnhancedNotificationService({
    notificationTableName: process.env.NOTIFICATION_TABLE_NAME || 'notifications',
    preferencesTableName: process.env.PREFERENCES_TABLE_NAME || 'notification_preferences',
    retryQueueUrl: process.env.RETRY_QUEUE_URL || '',
    region: process.env.AWS_REGION
  });

  logger.info('Processing notification retry batch', {
    recordCount: event.Records.length
  });

  const results = await Promise.allSettled(
    event.Records.map(record => processRetryRecord(record, notificationService))
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  logger.info('Notification retry batch completed', {
    successful,
    failed,
    total: event.Records.length
  });

  // Log any failures for monitoring
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error('Failed to process retry record', {
        recordIndex: index,
        error: result.reason
      });
    }
  });
};

async function processRetryRecord(
  record: SQSRecord,
  notificationService: EnhancedNotificationService
): Promise<void> {
  try {
    const retryMessage: RetryMessage = JSON.parse(record.body);
    
    logger.info('Processing retry message', {
      notificationId: retryMessage.notification_id,
      stakeholderTeamId: retryMessage.stakeholder.team_id,
      channel: retryMessage.channel,
      retryCount: retryMessage.retry_count,
      reason: retryMessage.reason
    });

    // Check if we've exceeded max retry attempts
    const maxRetries = getMaxRetries(retryMessage.reason);
    if (retryMessage.retry_count >= maxRetries) {
      logger.warn('Max retries exceeded, marking as permanently failed', {
        notificationId: retryMessage.notification_id,
        retryCount: retryMessage.retry_count,
        maxRetries
      });

      await markNotificationAsPermanentlyFailed(
        notificationService,
        retryMessage.notification_id,
        retryMessage.stakeholder.team_id,
        retryMessage.channel,
        'Max retries exceeded'
      );
      return;
    }

    // Attempt to send the notification again
    try {
      await retryNotification(notificationService, retryMessage);
      
      logger.info('Notification retry successful', {
        notificationId: retryMessage.notification_id,
        stakeholderTeamId: retryMessage.stakeholder.team_id,
        channel: retryMessage.channel,
        retryCount: retryMessage.retry_count
      });

    } catch (retryError) {
      logger.warn('Notification retry failed, scheduling next retry', {
        notificationId: retryMessage.notification_id,
        stakeholderTeamId: retryMessage.stakeholder.team_id,
        channel: retryMessage.channel,
        retryCount: retryMessage.retry_count,
        error: retryError instanceof Error ? retryError.message : 'Unknown error'
      });

      // Schedule next retry if we haven't exceeded max attempts
      if (retryMessage.retry_count + 1 < maxRetries) {
        await scheduleNextRetry(notificationService, retryMessage, retryError);
      } else {
        await markNotificationAsPermanentlyFailed(
          notificationService,
          retryMessage.notification_id,
          retryMessage.stakeholder.team_id,
          retryMessage.channel,
          retryError instanceof Error ? retryError.message : 'Unknown error'
        );
      }
    }

  } catch (error) {
    logger.error('Failed to process retry record', {
      error: error instanceof Error ? error.message : 'Unknown error',
      recordBody: record.body
    });
    throw error;
  }
}

async function retryNotification(
  notificationService: EnhancedNotificationService,
  retryMessage: RetryMessage
): Promise<void> {
  // Update notification status to retrying
  await updateNotificationStatus(
    notificationService,
    retryMessage.notification_id,
    retryMessage.stakeholder.team_id,
    retryMessage.channel,
    {
      status: 'retrying',
      attempts: retryMessage.retry_count + 1,
      last_attempt_at: new Date()
    }
  );

  // Attempt to send the notification
  const messageId = await sendNotificationToChannel(
    retryMessage.stakeholder,
    retryMessage.channel,
    retryMessage.request
  );

  // Update status to sent
  await updateNotificationStatus(
    notificationService,
    retryMessage.notification_id,
    retryMessage.stakeholder.team_id,
    retryMessage.channel,
    {
      status: 'sent',
      delivered_at: new Date()
    }
  );

  logger.info('Notification sent successfully on retry', {
    notificationId: retryMessage.notification_id,
    messageId,
    retryCount: retryMessage.retry_count
  });
}

async function sendNotificationToChannel(
  stakeholder: Stakeholder,
  channel: string,
  request: NotificationRequest
): Promise<string> {
  // This would contain the actual implementation for each channel
  // For now, we'll simulate the API calls with potential failures
  
  // Simulate occasional failures for testing retry logic
  if (Math.random() < 0.1) { // 10% failure rate
    throw new Error(`Simulated ${channel} API failure`);
  }

  switch (channel) {
    case 'slack':
      return await sendSlackNotification(stakeholder, request);
    case 'teams':
      return await sendTeamsNotification(stakeholder, request);
    case 'email':
      return await sendEmailNotification(stakeholder, request);
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}

async function sendSlackNotification(stakeholder: Stakeholder, request: NotificationRequest): Promise<string> {
  // Simulate Slack API call with potential rate limiting
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simulate rate limiting
  if (Math.random() < 0.05) { // 5% rate limit
    throw new Error('Slack API rate limit exceeded');
  }
  
  return `slack-retry-${Date.now()}`;
}

async function sendTeamsNotification(stakeholder: Stakeholder, request: NotificationRequest): Promise<string> {
  // Simulate Teams API call
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simulate occasional failures
  if (Math.random() < 0.05) { // 5% failure rate
    throw new Error('Teams webhook unavailable');
  }
  
  return `teams-retry-${Date.now()}`;
}

async function sendEmailNotification(stakeholder: Stakeholder, request: NotificationRequest): Promise<string> {
  // Simulate email API call
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Email is generally more reliable, lower failure rate
  if (Math.random() < 0.02) { // 2% failure rate
    throw new Error('Email service temporarily unavailable');
  }
  
  return `email-retry-${Date.now()}`;
}

async function scheduleNextRetry(
  notificationService: EnhancedNotificationService,
  retryMessage: RetryMessage,
  error: unknown
): Promise<void> {
  const nextRetryCount = retryMessage.retry_count + 1;
  const delaySeconds = calculateRetryDelay(nextRetryCount, retryMessage.reason);

  // Use the existing scheduling method from the service
  // This would typically use SQS with DelaySeconds
  logger.info('Scheduling next retry', {
    notificationId: retryMessage.notification_id,
    nextRetryCount,
    delaySeconds,
    error: error instanceof Error ? error.message : 'Unknown error'
  });

  // In a real implementation, this would send a message back to the retry queue
  // For now, we'll just log the scheduling
}

async function markNotificationAsPermanentlyFailed(
  notificationService: EnhancedNotificationService,
  notificationId: string,
  stakeholderTeamId: string,
  channel: string,
  errorMessage: string
): Promise<void> {
  await updateNotificationStatus(
    notificationService,
    notificationId,
    stakeholderTeamId,
    channel,
    {
      status: 'failed',
      error_message: `Permanently failed after max retries: ${errorMessage}`
    }
  );

  logger.error('Notification permanently failed', {
    notificationId,
    stakeholderTeamId,
    channel,
    errorMessage
  });

  // Could also trigger alerts or escalation here
}

async function updateNotificationStatus(
  notificationService: EnhancedNotificationService,
  notificationId: string,
  stakeholderTeamId: string,
  channel: string,
  updates: {
    status?: 'pending' | 'sent' | 'delivered' | 'failed' | 'retrying';
    attempts?: number;
    last_attempt_at?: Date;
    delivered_at?: Date;
    error_message?: string;
  }
): Promise<void> {
  // This would use the notification service's update method
  // For now, we'll just log the update
  logger.info('Updating notification status', {
    notificationId,
    stakeholderTeamId,
    channel,
    updates
  });
}

function getMaxRetries(reason?: string): number {
  switch (reason) {
    case 'quiet_hours':
      return 1; // Only retry once for quiet hours
    case 'rate_limit':
      return 5; // More retries for rate limiting
    case 'api_failure':
      return 3; // Standard retries for API failures
    default:
      return 3;
  }
}

function calculateRetryDelay(retryCount: number, reason?: string): number {
  const baseDelay = 30; // 30 seconds base delay
  
  switch (reason) {
    case 'rate_limit':
      // Longer delays for rate limiting
      return Math.min(1800, baseDelay * Math.pow(3, retryCount)); // Max 30 minutes
    case 'quiet_hours':
      // Fixed delay for quiet hours (retry after quiet hours end)
      return 3600; // 1 hour
    default:
      // Exponential backoff with jitter
      const delay = Math.min(900, baseDelay * Math.pow(2, retryCount)); // Max 15 minutes
      const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
      return Math.floor(delay + jitter);
  }
}

/**
 * Handler for processing notification delivery confirmations
 * This would be called by webhooks from Slack, Teams, etc.
 */
export const deliveryConfirmationHandler: Handler = async (event) => {
  const correlationId = `delivery-${Date.now()}`;
  logger.setCorrelationId(correlationId);

  try {
    // Parse delivery confirmation from webhook
    const body = JSON.parse(event.body || '{}');
    
    logger.info('Processing delivery confirmation', {
      channel: body.channel,
      messageId: body.message_id,
      status: body.status
    });

    const notificationService = new EnhancedNotificationService({
      notificationTableName: process.env.NOTIFICATION_TABLE_NAME || 'notifications',
      preferencesTableName: process.env.PREFERENCES_TABLE_NAME || 'notification_preferences',
      retryQueueUrl: process.env.RETRY_QUEUE_URL || '',
      region: process.env.AWS_REGION
    });

    // Update notification status based on delivery confirmation
    if (body.status === 'delivered') {
      // Mark as delivered
      logger.info('Notification delivered successfully', {
        messageId: body.message_id,
        channel: body.channel
      });
    } else if (body.status === 'failed') {
      // Handle delivery failure
      logger.warn('Notification delivery failed', {
        messageId: body.message_id,
        channel: body.channel,
        error: body.error
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    logger.error('Failed to process delivery confirmation', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};