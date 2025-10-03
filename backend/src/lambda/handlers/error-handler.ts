import { Handler } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { Logger } from '../utils/logger';
import { RetryUtils } from '../utils/retry-utils';
import { UserContext } from '../types';

interface ErrorHandlerEvent {
  jobId: string;
  userContext: UserContext;
  error: {
    Error: string;
    Cause: string;
  };
  status: 'failed';
  retryAttempt?: number;
}

interface ErrorHandlerResult {
  jobId: string;
  status: 'failed';
  errorHandled: boolean;
  notificationSent: boolean;
  metricsLogged: boolean;
  retryable: boolean;
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION,
});

const cloudWatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION,
});

export const handler: Handler<ErrorHandlerEvent, ErrorHandlerResult> = async (event) => {
  const correlationId = event.jobId;
  const logger = new Logger({ 
    correlationId, 
    operation: 'error-handler',
    userId: event.userContext.userId,
    teamId: event.userContext.teamId,
    traceId: process.env._X_AMZN_TRACE_ID?.split(';')[0]?.replace('Root=', ''),
  });
  
  try {
    logger.error('Handling workflow error', { 
      error: event.error.Error,
      cause: event.error.Cause,
      retryAttempt: event.retryAttempt || 0,
    });

    // Parse error details with enhanced classification
    const errorDetails = parseErrorDetails(event.error, event.retryAttempt);

    // Update job status to failed with error details (with retry)
    const errorHandled = await RetryUtils.withRetry(
      () => updateJobStatusWithError(event.jobId, errorDetails, correlationId, logger),
      RetryUtils.createRetryOptions('fast'),
      logger.child('update-job-status')
    );

    // Send error notification to user (with retry)
    const notificationSent = await RetryUtils.withRetry(
      () => sendErrorNotification(event.userContext, event.jobId, errorDetails, correlationId, logger),
      RetryUtils.createRetryOptions('standard'),
      logger.child('send-notification')
    );

    // Log error metrics for monitoring (with retry)
    const metricsLogged = await RetryUtils.withRetry(
      () => logErrorMetrics(errorDetails, event.userContext, correlationId, logger),
      RetryUtils.createRetryOptions('fast'),
      logger.child('log-metrics')
    );

    logger.info('Error handling completed', { 
      errorHandled,
      notificationSent,
      metricsLogged,
      errorType: errorDetails.type,
      retryable: errorDetails.retryable,
    });

    return {
      jobId: event.jobId,
      status: 'failed',
      errorHandled,
      notificationSent,
      metricsLogged,
      retryable: errorDetails.retryable,
    };

  } catch (handlingError) {
    logger.error('Failed to handle workflow error', handlingError as Error, {
      errorType: 'ErrorHandlerFailure',
    });
    
    // Even if error handling fails, we should return a result
    return {
      jobId: event.jobId,
      status: 'failed',
      errorHandled: false,
      notificationSent: false,
      metricsLogged: false,
      retryable: false,
    };
  }
};

interface ParsedError {
  type: 'timeout' | 'resource_limit' | 'permission' | 'validation' | 'service_unavailable' | 'network' | 'throttling' | 'circuit_breaker' | 'retry_exhausted' | 'unknown';
  message: string;
  retryable: boolean;
  userFriendlyMessage: string;
  technicalDetails: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'transient' | 'configuration' | 'resource' | 'system';
  suggestedAction: string;
  retryAfterSeconds?: number;
}

function parseErrorDetails(error: { Error: string; Cause: string }, retryAttempt?: number): ParsedError {
  const errorString = error.Error || '';
  const causeString = error.Cause || '';
  
  // Combine error and cause for analysis
  const fullErrorText = `${errorString} ${causeString}`.toLowerCase();

  let type: ParsedError['type'] = 'unknown';
  let retryable = false;
  let userFriendlyMessage = 'An unexpected error occurred during artifact processing.';
  let severity: ParsedError['severity'] = 'medium';
  let category: ParsedError['category'] = 'system';
  let suggestedAction = 'Please try again or contact support if the issue persists.';
  let retryAfterSeconds: number | undefined;

  // Enhanced error classification with more specific patterns
  if (fullErrorText.includes('timeout') || fullErrorText.includes('timed out') || fullErrorText.includes('deadline exceeded')) {
    type = 'timeout';
    retryable = true;
    severity = 'medium';
    category = 'transient';
    userFriendlyMessage = 'The artifact check timed out. This may be due to a large file or temporary service issues.';
    suggestedAction = 'Try reducing the file size or wait a few minutes before retrying.';
    retryAfterSeconds = 60;
  } else if (fullErrorText.includes('memory') || fullErrorText.includes('resource') || fullErrorText.includes('out of memory') || fullErrorText.includes('resource exhausted')) {
    type = 'resource_limit';
    retryable = false;
    severity = 'high';
    category = 'resource';
    userFriendlyMessage = 'The artifact is too large or complex to process. Please try with a smaller file.';
    suggestedAction = 'Reduce the file size, simplify the content, or break it into smaller parts.';
  } else if (fullErrorText.includes('access denied') || fullErrorText.includes('forbidden') || fullErrorText.includes('unauthorized') || fullErrorText.includes('permission denied')) {
    type = 'permission';
    retryable = false;
    severity = 'high';
    category = 'configuration';
    userFriendlyMessage = 'Access denied. Please check your permissions or contact your administrator.';
    suggestedAction = 'Verify your access permissions or contact your system administrator.';
  } else if (fullErrorText.includes('invalid') || fullErrorText.includes('malformed') || fullErrorText.includes('bad request') || fullErrorText.includes('validation')) {
    type = 'validation';
    retryable = false;
    severity = 'medium';
    category = 'configuration';
    userFriendlyMessage = 'The artifact format is invalid or unsupported. Please check the file and try again.';
    suggestedAction = 'Check the artifact format and ensure it meets the required specifications.';
  } else if (fullErrorText.includes('throttling') || fullErrorText.includes('rate limit') || fullErrorText.includes('too many requests')) {
    type = 'throttling';
    retryable = true;
    severity = 'medium';
    category = 'transient';
    userFriendlyMessage = 'Request rate limit exceeded. Please wait before trying again.';
    suggestedAction = 'Wait a few minutes before retrying your request.';
    retryAfterSeconds = Math.min(300, Math.pow(2, (retryAttempt || 0) + 1) * 30); // Exponential backoff up to 5 minutes
  } else if (fullErrorText.includes('service unavailable') || fullErrorText.includes('internal server error') || fullErrorText.includes('service error')) {
    type = 'service_unavailable';
    retryable = true;
    severity = 'high';
    category = 'transient';
    userFriendlyMessage = 'Service is temporarily unavailable. Please try again in a few minutes.';
    suggestedAction = 'Wait a few minutes and retry. If the issue persists, contact support.';
    retryAfterSeconds = 120;
  } else if (fullErrorText.includes('network') || fullErrorText.includes('connection') || fullErrorText.includes('econnreset') || fullErrorText.includes('enotfound')) {
    type = 'network';
    retryable = true;
    severity = 'medium';
    category = 'transient';
    userFriendlyMessage = 'Network connectivity issue occurred. Please try again.';
    suggestedAction = 'Check your network connection and retry.';
    retryAfterSeconds = 30;
  } else if (fullErrorText.includes('circuit breaker') || fullErrorText.includes('circuit open')) {
    type = 'circuit_breaker';
    retryable = true;
    severity = 'high';
    category = 'system';
    userFriendlyMessage = 'Service is temporarily unavailable due to system protection measures.';
    suggestedAction = 'Wait a few minutes for the system to recover, then retry.';
    retryAfterSeconds = 180;
  } else if (fullErrorText.includes('retry exhausted') || fullErrorText.includes('max attempts')) {
    type = 'retry_exhausted';
    retryable = false;
    severity = 'critical';
    category = 'system';
    userFriendlyMessage = 'Multiple retry attempts failed. The system is experiencing persistent issues.';
    suggestedAction = 'Contact support with the job ID for assistance.';
  }

  // Adjust severity based on retry attempts
  if (retryAttempt && retryAttempt > 2) {
    severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : 'critical';
  }

  return {
    type,
    message: errorString,
    retryable,
    userFriendlyMessage,
    technicalDetails: causeString,
    severity,
    category,
    suggestedAction,
    retryAfterSeconds,
  };
}

async function updateJobStatusWithError(
  jobId: string,
  errorDetails: ParsedError,
  correlationId: string,
  logger: Logger
): Promise<boolean> {
  const tableName = process.env.JOB_STATUS_TABLE;
  if (!tableName) {
    logger.error('JOB_STATUS_TABLE environment variable not set');
    return false;
  }

  try {
    const errorInfo = {
      type: errorDetails.type,
      message: errorDetails.userFriendlyMessage,
      retryable: errorDetails.retryable,
      severity: errorDetails.severity,
      category: errorDetails.category,
      suggestedAction: errorDetails.suggestedAction,
      retryAfterSeconds: errorDetails.retryAfterSeconds,
      timestamp: new Date().toISOString(),
      technicalDetails: errorDetails.technicalDetails,
      correlationId,
    };

    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        jobId: { S: jobId },
      },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #error = :error, #progress = :progress, #currentStep = :currentStep',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#error': 'error',
        '#progress': 'progress',
        '#currentStep': 'currentStep',
      },
      ExpressionAttributeValues: {
        ':status': { S: 'failed' },
        ':updatedAt': { S: new Date().toISOString() },
        ':error': { S: JSON.stringify(errorInfo) },
        ':progress': { N: '0' },
        ':currentStep': { S: 'error-handling' },
      },
    });

    await dynamoClient.send(command);

    logger.info('Job status updated with error details', { 
      jobId,
      errorType: errorDetails.type,
      severity: errorDetails.severity,
      retryable: errorDetails.retryable,
    });

    return true;

  } catch (updateError) {
    logger.error('Failed to update job status with error', updateError as Error, {
      errorType: 'DatabaseUpdateFailure',
    });
    return false;
  }
}

async function sendErrorNotification(
  userContext: UserContext,
  jobId: string,
  errorDetails: ParsedError,
  correlationId: string,
  logger: Logger
): Promise<boolean> {
  try {
    const message = formatErrorNotificationMessage(jobId, errorDetails);
    const priority = errorDetails.severity === 'critical' ? 'high' : 
                    errorDetails.severity === 'high' ? 'medium' : 'normal';
    
    logger.info('Sending error notification', { 
      errorType: errorDetails.type,
      severity: errorDetails.severity,
      retryable: errorDetails.retryable,
      priority,
      messageLength: message.length,
    });

    // Send notification to SQS queue for processing
    const notificationQueueUrl = process.env.NOTIFICATION_QUEUE_URL;
    if (notificationQueueUrl) {
      const notificationPayload = {
        type: 'error_notification',
        userId: userContext.userId,
        teamId: userContext.teamId,
        jobId,
        message,
        priority,
        errorDetails: {
          type: errorDetails.type,
          severity: errorDetails.severity,
          retryable: errorDetails.retryable,
          suggestedAction: errorDetails.suggestedAction,
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };

      await sqsClient.send(new SendMessageCommand({
        QueueUrl: notificationQueueUrl,
        MessageBody: JSON.stringify(notificationPayload),
        MessageAttributes: {
          'notification_type': {
            DataType: 'String',
            StringValue: 'error_notification',
          },
          'priority': {
            DataType: 'String',
            StringValue: priority,
          },
          'user_id': {
            DataType: 'String',
            StringValue: userContext.userId,
          },
          'team_id': {
            DataType: 'String',
            StringValue: userContext.teamId,
          },
        },
      }));

      logger.info('Error notification queued successfully', { 
        queueUrl: notificationQueueUrl,
        priority,
      });
    } else {
      logger.warn('NOTIFICATION_QUEUE_URL not configured, skipping notification');
    }

    return true;

  } catch (notificationError) {
    logger.error('Failed to send error notification', notificationError as Error, {
      errorType: 'NotificationFailure',
    });
    return false;
  }
}

function formatErrorNotificationMessage(jobId: string, errorDetails: ParsedError): string {
  const severityEmojis = {
    low: '🟡',
    medium: '🟠',
    high: '🔴',
    critical: '🚨',
  };

  const categoryEmojis = {
    transient: '⏳',
    configuration: '⚙️',
    resource: '💾',
    system: '🖥️',
  };

  const emoji = errorDetails.retryable ? '⚠️' : '❌';
  const severityEmoji = severityEmojis[errorDetails.severity];
  const categoryEmoji = categoryEmojis[errorDetails.category];
  
  let message = `${emoji} **Artifact Check Failed** (Job: ${jobId})\n\n`;
  message += `${severityEmoji} **Severity:** ${errorDetails.severity.toUpperCase()}\n`;
  message += `${categoryEmoji} **Category:** ${errorDetails.category}\n\n`;
  message += `**Error:** ${errorDetails.userFriendlyMessage}\n\n`;

  if (errorDetails.retryable) {
    message += `🔄 **This error may be temporary.** `;
    
    if (errorDetails.retryAfterSeconds) {
      const minutes = Math.ceil(errorDetails.retryAfterSeconds / 60);
      message += `Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before retrying.\n\n`;
    } else {
      message += `You can try submitting your artifact again.\n\n`;
    }
    
    // Enhanced tips based on error type
    switch (errorDetails.type) {
      case 'timeout':
        message += `💡 **Tip:** If the file is large, consider breaking it into smaller parts or optimizing its size.`;
        break;
      case 'service_unavailable':
        message += `💡 **Tip:** The service is experiencing high load. Wait a few minutes before retrying.`;
        break;
      case 'throttling':
        message += `💡 **Tip:** You've exceeded the request rate limit. Please wait before making another request.`;
        break;
      case 'network':
        message += `💡 **Tip:** Check your network connection and try again.`;
        break;
      case 'circuit_breaker':
        message += `💡 **Tip:** The system is protecting itself from overload. Please wait for recovery.`;
        break;
    }
  } else {
    message += `❗ **Action Required:** ${errorDetails.suggestedAction}\n\n`;
    
    // Enhanced tips based on error type
    switch (errorDetails.type) {
      case 'resource_limit':
        message += `💡 **Tip:** Try reducing the file size, simplifying the content, or breaking it into smaller parts.`;
        break;
      case 'permission':
        message += `💡 **Tip:** Contact your administrator to verify your access permissions for this operation.`;
        break;
      case 'validation':
        message += `💡 **Tip:** Check that your artifact follows the expected format and meets all requirements.`;
        break;
      case 'retry_exhausted':
        message += `💡 **Tip:** The system made multiple attempts but couldn't complete the operation. This may indicate a persistent issue.`;
        break;
    }
  }

  message += `\n\n📞 **Support:** If you continue to experience issues, please contact support with Job ID: ${jobId}`;
  
  // Add troubleshooting section for critical errors
  if (errorDetails.severity === 'critical') {
    message += `\n\n🔧 **Troubleshooting:**\n`;
    message += `• Check system status page for known issues\n`;
    message += `• Verify your artifact meets all requirements\n`;
    message += `• Try again during off-peak hours\n`;
    message += `• Contact support for immediate assistance`;
  }

  return message;
}

async function logErrorMetrics(
  errorDetails: ParsedError,
  userContext: UserContext,
  correlationId: string,
  logger: Logger
): Promise<boolean> {
  try {
    // Log structured error metrics for CloudWatch Logs Insights
    logger.error('Workflow error metrics', {
      metric: 'workflow_error',
      errorType: errorDetails.type,
      severity: errorDetails.severity,
      category: errorDetails.category,
      retryable: errorDetails.retryable,
      teamId: userContext.teamId,
      department: userContext.department,
      timestamp: new Date().toISOString(),
    });

    // Send custom CloudWatch metrics
    const metricData = [
      {
        MetricName: 'WorkflowErrors',
        Dimensions: [
          { Name: 'ErrorType', Value: errorDetails.type },
          { Name: 'Severity', Value: errorDetails.severity },
          { Name: 'Category', Value: errorDetails.category },
          { Name: 'Team', Value: userContext.teamId },
          { Name: 'Department', Value: userContext.department },
          { Name: 'Retryable', Value: errorDetails.retryable.toString() },
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
      },
      // Additional metrics for error severity distribution
      {
        MetricName: 'ErrorSeverityDistribution',
        Dimensions: [
          { Name: 'Severity', Value: errorDetails.severity },
          { Name: 'Team', Value: userContext.teamId },
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
      },
      // Metrics for error categories
      {
        MetricName: 'ErrorCategoryDistribution',
        Dimensions: [
          { Name: 'Category', Value: errorDetails.category },
          { Name: 'Team', Value: userContext.teamId },
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
      },
    ];

    // Add retryable error metrics
    if (errorDetails.retryable) {
      metricData.push({
        MetricName: 'RetryableErrors',
        Dimensions: [
          { Name: 'ErrorType', Value: errorDetails.type },
          { Name: 'Team', Value: userContext.teamId },
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
      });
    }

    await cloudWatchClient.send(new PutMetricDataCommand({
      Namespace: 'AiAgent/Workflows',
      MetricData: metricData,
    }));

    logger.info('Error metrics logged successfully', {
      metricsCount: metricData.length,
      errorType: errorDetails.type,
      severity: errorDetails.severity,
    });

    return true;

  } catch (metricsError) {
    logger.error('Failed to log error metrics', metricsError as Error, {
      errorType: 'MetricsLoggingFailure',
    });
    return false;
  }
}