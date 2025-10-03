import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { NotificationService, NotificationRequest, IssueCreationRequest } from '../../services/notification-service.js';
import { buildResponse, buildErrorResponse } from '../utils/response-builder.js';
import { extractUserFromEvent } from '../utils/auth-utils.js';
import { logger } from '../utils/logger.js';

/**
 * Lambda handler for notification operations
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return buildErrorResponse(401, 'UNAUTHORIZED', 'Authentication required');
    }

    // Initialize notification service with configuration from environment
    const notificationService = new NotificationService({
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
      jiraConfig: process.env.JIRA_BASE_URL ? {
        baseUrl: process.env.JIRA_BASE_URL,
        username: process.env.JIRA_USERNAME || '',
        apiToken: process.env.JIRA_API_TOKEN || '',
        defaultProject: process.env.JIRA_DEFAULT_PROJECT || 'IMPACT'
      } : undefined
    });
    
    const httpMethod = event.httpMethod;
    const pathParameters = event.pathParameters || {};

    logger.info('Processing notification request', {
      method: httpMethod,
      path: event.path,
      user: user.sub,
      pathParameters
    });

    switch (httpMethod) {
      case 'POST':
        if (event.path.includes('/notifications/send')) {
          return await handleSendNotifications(notificationService, event, user);
        } else if (event.path.includes('/notifications/issues')) {
          return await handleCreateIssues(notificationService, event, user);
        } else {
          return buildErrorResponse(404, 'NOT_FOUND', 'Endpoint not found');
        }

      default:
        return buildErrorResponse(405, 'METHOD_NOT_ALLOWED', `Method ${httpMethod} not allowed`);
    }

  } catch (error) {
    logger.error('Notification handler error', { error: error.message, stack: error.stack });
    return buildErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};

/**
 * Handle POST /notifications/send - Send stakeholder notifications
 */
async function handleSendNotifications(
  service: NotificationService,
  event: APIGatewayProxyEvent,
  user: any
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Validate required fields
    const validationError = validateNotificationRequest(body);
    if (validationError) {
      return buildErrorResponse(400, 'VALIDATION_ERROR', validationError);
    }

    // Build notification request
    const notificationRequest: NotificationRequest = {
      impact_analysis: body.impact_analysis,
      change_description: body.change_description,
      change_timeline: body.change_timeline,
      requester: {
        user_id: user.sub,
        name: user.name || user.email || user.sub,
        email: user.email || '',
        team_id: body.requester?.team_id || 'unknown'
      },
      notification_type: body.notification_type || 'impact_alert',
      urgency: body.urgency || 'medium'
    };

    logger.info('Sending stakeholder notifications', {
      changeDescription: notificationRequest.change_description,
      stakeholdersCount: notificationRequest.impact_analysis.stakeholders.length,
      urgency: notificationRequest.urgency,
      user: user.sub
    });

    // Send notifications
    const result = await service.sendStakeholderNotifications(notificationRequest);

    logger.info('Notifications sent', {
      notificationId: result.notification_id,
      sent: result.summary.notifications_sent,
      failed: result.summary.notifications_failed,
      estimatedReach: result.summary.estimated_reach
    });

    return buildResponse(200, {
      success: true,
      data: result,
      metadata: {
        sent_at: new Date().toISOString(),
        sent_by: user.sub,
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error sending notifications', { error: error.message, stack: error.stack });
    return buildErrorResponse(500, 'NOTIFICATION_ERROR', 'Failed to send notifications');
  }
}

/**
 * Handle POST /notifications/issues - Create coordination issues
 */
async function handleCreateIssues(
  service: NotificationService,
  event: APIGatewayProxyEvent,
  user: any
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Validate required fields
    const validationError = validateIssueCreationRequest(body);
    if (validationError) {
      return buildErrorResponse(400, 'VALIDATION_ERROR', validationError);
    }

    // Build issue creation request
    const issueRequest: IssueCreationRequest = {
      impact_analysis: body.impact_analysis,
      change_description: body.change_description,
      requester: {
        user_id: user.sub,
        name: user.name || user.email || user.sub,
        email: user.email || '',
        team_id: body.requester?.team_id || 'unknown'
      },
      issue_type: body.issue_type || 'coordination',
      priority: body.priority || 'medium',
      affected_teams: body.affected_teams || []
    };

    logger.info('Creating coordination issues', {
      changeDescription: issueRequest.change_description,
      issueType: issueRequest.issue_type,
      priority: issueRequest.priority,
      affectedTeams: issueRequest.affected_teams.length,
      user: user.sub
    });

    // Create issues
    const createdIssues = await service.createCoordinationIssues(issueRequest);

    logger.info('Issues created', {
      issuesCount: createdIssues.length,
      issueKeys: createdIssues.map(i => i.issue_key),
      user: user.sub
    });

    return buildResponse(200, {
      success: true,
      data: {
        created_issues: createdIssues,
        summary: {
          total_issues_created: createdIssues.length,
          main_issue: createdIssues[0]?.issue_key,
          team_issues: createdIssues.slice(1).map(i => i.issue_key)
        }
      },
      metadata: {
        created_at: new Date().toISOString(),
        created_by: user.sub,
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error creating issues', { error: error.message, stack: error.stack });
    
    if (error.message.includes('Jira configuration not provided')) {
      return buildErrorResponse(503, 'SERVICE_UNAVAILABLE', 'Issue creation service not configured');
    }
    
    return buildErrorResponse(500, 'ISSUE_CREATION_ERROR', 'Failed to create issues');
  }
}

/**
 * Validate notification request
 */
function validateNotificationRequest(body: any): string | null {
  if (!body.impact_analysis) {
    return 'impact_analysis is required';
  }

  if (!body.change_description || typeof body.change_description !== 'string') {
    return 'change_description is required and must be a string';
  }

  if (!body.change_timeline || typeof body.change_timeline !== 'string') {
    return 'change_timeline is required and must be a string';
  }

  if (body.notification_type && !['impact_alert', 'coordination_request', 'approval_request'].includes(body.notification_type)) {
    return 'notification_type must be one of: impact_alert, coordination_request, approval_request';
  }

  if (body.urgency && !['low', 'medium', 'high', 'critical'].includes(body.urgency)) {
    return 'urgency must be one of: low, medium, high, critical';
  }

  // Validate impact_analysis structure
  if (!body.impact_analysis.stakeholders || !Array.isArray(body.impact_analysis.stakeholders)) {
    return 'impact_analysis.stakeholders is required and must be an array';
  }

  if (!body.impact_analysis.affected_services || !Array.isArray(body.impact_analysis.affected_services)) {
    return 'impact_analysis.affected_services is required and must be an array';
  }

  if (!body.impact_analysis.risk_assessment) {
    return 'impact_analysis.risk_assessment is required';
  }

  return null;
}

/**
 * Validate issue creation request
 */
function validateIssueCreationRequest(body: any): string | null {
  if (!body.impact_analysis) {
    return 'impact_analysis is required';
  }

  if (!body.change_description || typeof body.change_description !== 'string') {
    return 'change_description is required and must be a string';
  }

  if (body.issue_type && !['coordination', 'approval', 'risk_mitigation'].includes(body.issue_type)) {
    return 'issue_type must be one of: coordination, approval, risk_mitigation';
  }

  if (body.priority && !['low', 'medium', 'high', 'critical'].includes(body.priority)) {
    return 'priority must be one of: low, medium, high, critical';
  }

  if (body.affected_teams && !Array.isArray(body.affected_teams)) {
    return 'affected_teams must be an array';
  }

  // Validate impact_analysis structure
  if (!body.impact_analysis.affected_services || !Array.isArray(body.impact_analysis.affected_services)) {
    return 'impact_analysis.affected_services is required and must be an array';
  }

  if (!body.impact_analysis.risk_assessment) {
    return 'impact_analysis.risk_assessment is required';
  }

  return null;
}

/**
 * Handler for notification status checks
 */
export const statusHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const user = extractUserFromEvent(event);
    if (!user) {
      return buildErrorResponse(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const pathParameters = event.pathParameters || {};
    const notificationId = pathParameters.notificationId;

    if (!notificationId) {
      return buildErrorResponse(400, 'VALIDATION_ERROR', 'Notification ID is required');
    }

    logger.info('Checking notification status', {
      notificationId,
      user: user.sub
    });

    // In a real implementation, this would query a database or cache
    // For now, we'll return a simulated status
    const status = {
      notification_id: notificationId,
      status: 'completed',
      sent_at: new Date().toISOString(),
      delivery_summary: {
        total_sent: 5,
        delivered: 4,
        failed: 1,
        pending: 0
      },
      last_updated: new Date().toISOString()
    };

    return buildResponse(200, {
      success: true,
      data: status,
      metadata: {
        checked_at: new Date().toISOString(),
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error checking notification status', { error: error.message, stack: error.stack });
    return buildErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};