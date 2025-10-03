import { Handler } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { Logger } from '../utils/logger';
import { ArtifactCheckResult, UserContext } from '../types';

interface NotifyResultsEvent {
  jobId: string;
  userContext: UserContext;
  finalReport: ArtifactCheckResult;
  status: 'completed' | 'failed';
}

interface NotifyResultsResult {
  notificationsSent: string[];
  jobStatusUpdated: boolean;
  escalationRequired?: boolean;
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

export const handler: Handler<NotifyResultsEvent, NotifyResultsResult> = async (event) => {
  const correlationId = event.jobId;
  const logger = new Logger({ 
    correlationId, 
    operation: 'notify-results',
    userId: event.userContext.userId 
  });
  
  try {
    logger.info('Starting result notifications', { 
      status: event.status
    });

    const notificationsSent: string[] = [];
    let escalationRequired = false;

    // Check if escalation is needed based on critical issues
    const criticalIssues = event.finalReport.issues?.filter(issue => issue.severity === 'critical') || [];
    if (criticalIssues.length > 0) {
      escalationRequired = true;
      logger.info('Escalation required due to critical issues', { 
        criticalIssueCount: criticalIssues.length
      });
    }

    // Send notifications based on severity and user preferences
    if (event.status === 'completed') {
      // Send completion notification
      await sendCompletionNotification(event, correlationId);
      notificationsSent.push('completion');

      // Send critical issue alerts if needed
      if (criticalIssues.length > 0) {
        await sendCriticalIssueAlert(event, criticalIssues, correlationId);
        notificationsSent.push('critical-alert');
      }

      // Send team notification for low compliance scores
      if (event.finalReport.complianceScore < 70) {
        await sendTeamNotification(event, correlationId);
        notificationsSent.push('team-notification');
      }
    } else {
      // Send failure notification
      await sendFailureNotification(event, correlationId);
      notificationsSent.push('failure');
    }

    // Update final job status with notification results
    const jobStatusUpdated = await updateFinalJobStatus(event.jobId, event.status, {
      notificationsSent,
      escalationRequired,
    }, correlationId);

    logger.info('Result notifications completed', { 
      notificationsSent,
      escalationRequired,
      jobStatusUpdated
    });

    return {
      notificationsSent,
      jobStatusUpdated,
      escalationRequired,
    };

  } catch (error) {
    logger.error('Failed to send result notifications', error instanceof Error ? error : new Error('Unknown error'));
    
    throw error;
  }
};

async function sendCompletionNotification(event: NotifyResultsEvent, correlationId: string): Promise<void> {
  try {
    const message = formatCompletionMessage(event.finalReport, event.jobId);
    
    // In a real implementation, this would integrate with Slack/Teams APIs
    // For now, we'll log the notification
    logger.info('Sending completion notification', { 
      complianceScore: event.finalReport.complianceScore,
      message: message.substring(0, 200) + '...' // Truncate for logging
    });

    // TODO: Implement actual Slack/Teams notification
    // await slackClient.postMessage({
    //   channel: getUserSlackChannel(event.userContext.userId),
    //   text: message,
    //   attachments: formatSlackAttachments(event.finalReport)
    // });

  } catch (error) {
    logger.error('Failed to send completion notification', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

async function sendCriticalIssueAlert(
  event: NotifyResultsEvent, 
  criticalIssues: any[], 
  correlationId: string
): Promise<void> {
  try {
    const message = formatCriticalIssueMessage(criticalIssues, event.jobId);
    
    logger.info('Sending critical issue alert', { 
      criticalIssueCount: criticalIssues.length,
      message: message.substring(0, 200) + '...'
    });

    // TODO: Implement actual critical alert notification
    // This might involve:
    // - Slack/Teams urgent notifications
    // - Email alerts
    // - PagerDuty integration for on-call teams
    // - Jira ticket creation for tracking

  } catch (error) {
    logger.error('Failed to send critical issue alert', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

async function sendTeamNotification(event: NotifyResultsEvent, correlationId: string): Promise<void> {
  try {
    const message = formatTeamNotificationMessage(event.finalReport, event.userContext, event.jobId);
    
    logger.info('Sending team notification', { 
      complianceScore: event.finalReport.complianceScore,
      message: message.substring(0, 200) + '...'
    });

    // TODO: Implement team notification
    // This would notify team leads or compliance officers about low scores

  } catch (error) {
    logger.error('Failed to send team notification', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

async function sendFailureNotification(event: NotifyResultsEvent, correlationId: string): Promise<void> {
  try {
    const message = formatFailureMessage(event.jobId);
    
    logger.info('Sending failure notification', { 
      message
    });

    // TODO: Implement failure notification
    // This would notify the user that their artifact check failed

  } catch (error) {
    logger.error('Failed to send failure notification', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

function formatCompletionMessage(report: ArtifactCheckResult, jobId: string): string {
  const emoji = report.complianceScore >= 90 ? '✅' : report.complianceScore >= 70 ? '⚠️' : '❌';
  
  let message = `${emoji} **Artifact Check Complete** (Job: ${jobId})\n\n`;
  message += `**Compliance Score:** ${report.complianceScore}/100\n`;
  message += `**Summary:** ${report.summary}\n\n`;

  if (report.issues && report.issues.length > 0) {
    const criticalCount = report.issues.filter(i => i.severity === 'critical').length;
    const highCount = report.issues.filter(i => i.severity === 'high').length;
    const mediumCount = report.issues.filter(i => i.severity === 'medium').length;
    const lowCount = report.issues.filter(i => i.severity === 'low').length;

    message += `**Issues Found:**\n`;
    if (criticalCount > 0) message += `• ${criticalCount} Critical 🔴\n`;
    if (highCount > 0) message += `• ${highCount} High 🟠\n`;
    if (mediumCount > 0) message += `• ${mediumCount} Medium 🟡\n`;
    if (lowCount > 0) message += `• ${lowCount} Low 🟢\n`;
  }

  if (report.recommendations && report.recommendations.length > 0) {
    message += `\n**Recommendations:**\n`;
    report.recommendations.slice(0, 3).forEach((rec, index) => {
      message += `${index + 1}. ${rec}\n`;
    });
  }

  return message;
}

function formatCriticalIssueMessage(criticalIssues: any[], jobId: string): string {
  let message = `🚨 **CRITICAL ISSUES DETECTED** (Job: ${jobId})\n\n`;
  message += `Found ${criticalIssues.length} critical issue(s) that require immediate attention:\n\n`;

  criticalIssues.slice(0, 5).forEach((issue, index) => {
    message += `**${index + 1}. ${issue.description}**\n`;
    if (issue.location) message += `Location: ${issue.location}\n`;
    message += `Remediation: ${issue.remediation}\n\n`;
  });

  if (criticalIssues.length > 5) {
    message += `... and ${criticalIssues.length - 5} more critical issues.\n\n`;
  }

  message += `⚠️ **Action Required:** Please address these issues before proceeding with deployment.`;

  return message;
}

function formatTeamNotificationMessage(report: ArtifactCheckResult, userContext: UserContext, jobId: string): string {
  let message = `📊 **Team Compliance Alert** (Job: ${jobId})\n\n`;
  message += `User: ${userContext.userId}\n`;
  message += `Team: ${userContext.teamId}\n`;
  message += `Compliance Score: ${report.complianceScore}/100\n\n`;
  message += `This artifact scored below the team threshold and may need additional review.\n\n`;
  message += `**Summary:** ${report.summary}`;

  return message;
}

function formatFailureMessage(jobId: string): string {
  return `❌ **Artifact Check Failed** (Job: ${jobId})\n\n` +
         `The artifact check process encountered an error and could not complete. ` +
         `Please check the artifact and try again, or contact support if the issue persists.`;
}

async function updateFinalJobStatus(
  jobId: string, 
  status: 'completed' | 'failed',
  notificationData: {
    notificationsSent: string[];
    escalationRequired?: boolean;
  },
  correlationId: string
): Promise<boolean> {
  const tableName = process.env.JOB_STATUS_TABLE;
  if (!tableName) {
    throw new Error('JOB_STATUS_TABLE environment variable not set');
  }

  try {
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        jobId: { S: jobId },
      },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #notificationData = :notificationData',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#notificationData': 'notificationData',
      },
      ExpressionAttributeValues: {
        ':status': { S: status },
        ':updatedAt': { S: new Date().toISOString() },
        ':notificationData': { S: JSON.stringify(notificationData) },
      },
    });

    await dynamoClient.send(command);

    logger.info('Final job status updated successfully', { 
      jobId,
      status,
      notificationData
    });

    return true;

  } catch (error) {
    logger.error('Failed to update final job status', error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
}