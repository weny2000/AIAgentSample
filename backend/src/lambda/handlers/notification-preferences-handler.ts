import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EnhancedNotificationService, NotificationPreferences } from '../../services/enhanced-notification-service.js';
import { buildResponse, buildErrorResponse } from '../utils/response-builder.js';
import { extractUserFromEvent } from '../utils/auth-utils.js';
import { logger } from '../utils/logger.js';

/**
 * Lambda handler for managing notification preferences
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

    // Initialize notification service
    const notificationService = new EnhancedNotificationService({
      notificationTableName: process.env.NOTIFICATION_TABLE_NAME || 'notifications',
      preferencesTableName: process.env.PREFERENCES_TABLE_NAME || 'notification_preferences',
      retryQueueUrl: process.env.RETRY_QUEUE_URL || '',
      region: process.env.AWS_REGION
    });
    
    const httpMethod = event.httpMethod;
    const pathParameters = event.pathParameters || {};

    logger.info('Processing notification preferences request', {
      method: httpMethod,
      path: event.path,
      user: user.sub,
      pathParameters
    });

    switch (httpMethod) {
      case 'GET':
        return await handleGetPreferences(notificationService, event, user);
      
      case 'PUT':
        return await handleUpdatePreferences(notificationService, event, user);
      
      case 'POST':
        if (event.path.includes('/test')) {
          return await handleTestNotification(notificationService, event, user);
        }
        return buildErrorResponse(404, 'NOT_FOUND', 'Endpoint not found');

      default:
        return buildErrorResponse(405, 'METHOD_NOT_ALLOWED', `Method ${httpMethod} not allowed`);
    }

  } catch (error) {
    logger.error('Notification preferences handler error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return buildErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};

/**
 * Handle GET /preferences - Get user's notification preferences
 */
async function handleGetPreferences(
  service: EnhancedNotificationService,
  event: APIGatewayProxyEvent,
  user: any
): Promise<APIGatewayProxyResult> {
  try {
    const teamId = event.queryStringParameters?.team_id || user.team_id || 'default';

    logger.info('Getting notification preferences', {
      userId: user.sub,
      teamId
    });

    // Get preferences from the service
    const preferences = await getPreferencesFromService(service, user.sub, teamId);

    return buildResponse(200, {
      success: true,
      data: preferences,
      metadata: {
        retrieved_at: new Date().toISOString(),
        user_id: user.sub,
        team_id: teamId,
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error getting notification preferences', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.sub
    });
    return buildErrorResponse(500, 'PREFERENCES_ERROR', 'Failed to get notification preferences');
  }
}

/**
 * Handle PUT /preferences - Update user's notification preferences
 */
async function handleUpdatePreferences(
  service: EnhancedNotificationService,
  event: APIGatewayProxyEvent,
  user: any
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Validate request body
    const validationError = validatePreferencesRequest(body);
    if (validationError) {
      return buildErrorResponse(400, 'VALIDATION_ERROR', validationError);
    }

    // Build preferences object
    const preferences: NotificationPreferences = {
      user_id: user.sub,
      team_id: body.team_id || user.team_id || 'default',
      channels: body.channels || ['slack'],
      severity_thresholds: {
        low: body.severity_thresholds?.low ?? false,
        medium: body.severity_thresholds?.medium ?? true,
        high: body.severity_thresholds?.high ?? true,
        critical: body.severity_thresholds?.critical ?? true
      },
      quiet_hours: body.quiet_hours ? {
        start: body.quiet_hours.start,
        end: body.quiet_hours.end,
        timezone: body.quiet_hours.timezone || 'UTC'
      } : undefined,
      escalation_delay_minutes: body.escalation_delay_minutes || 30
    };

    logger.info('Updating notification preferences', {
      userId: user.sub,
      teamId: preferences.team_id,
      channels: preferences.channels,
      severityThresholds: preferences.severity_thresholds
    });

    // Update preferences
    await service.updateNotificationPreferences(preferences);

    logger.info('Notification preferences updated successfully', {
      userId: user.sub,
      teamId: preferences.team_id
    });

    return buildResponse(200, {
      success: true,
      data: preferences,
      metadata: {
        updated_at: new Date().toISOString(),
        updated_by: user.sub,
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error updating notification preferences', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.sub
    });
    return buildErrorResponse(500, 'PREFERENCES_ERROR', 'Failed to update notification preferences');
  }
}

/**
 * Handle POST /preferences/test - Send test notification
 */
async function handleTestNotification(
  service: EnhancedNotificationService,
  event: APIGatewayProxyEvent,
  user: any
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const channel = body.channel || 'slack';
    const severity = body.severity || 'medium';

    logger.info('Sending test notification', {
      userId: user.sub,
      channel,
      severity
    });

    // Create a test notification request
    const testRequest = createTestNotificationRequest(user, channel, severity);

    // Send test notification
    const result = await service.sendNotificationsWithRetry(testRequest);

    logger.info('Test notification sent', {
      notificationId: result.notification_id,
      sent: result.summary.notifications_sent,
      failed: result.summary.notifications_failed
    });

    return buildResponse(200, {
      success: true,
      data: {
        notification_id: result.notification_id,
        test_result: {
          channel,
          severity,
          sent: result.summary.notifications_sent > 0,
          message: result.summary.notifications_sent > 0 
            ? 'Test notification sent successfully' 
            : 'Test notification failed to send'
        }
      },
      metadata: {
        sent_at: new Date().toISOString(),
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error sending test notification', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.sub
    });
    return buildErrorResponse(500, 'TEST_ERROR', 'Failed to send test notification');
  }
}

/**
 * Validate notification preferences request
 */
function validatePreferencesRequest(body: any): string | null {
  if (body.channels && !Array.isArray(body.channels)) {
    return 'channels must be an array';
  }

  if (body.channels) {
    const validChannels = ['slack', 'teams', 'email'];
    const invalidChannels = body.channels.filter((c: string) => !validChannels.includes(c));
    if (invalidChannels.length > 0) {
      return `Invalid channels: ${invalidChannels.join(', ')}. Valid channels are: ${validChannels.join(', ')}`;
    }
  }

  if (body.severity_thresholds) {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const invalidSeverities = Object.keys(body.severity_thresholds)
      .filter(s => !validSeverities.includes(s));
    
    if (invalidSeverities.length > 0) {
      return `Invalid severity levels: ${invalidSeverities.join(', ')}. Valid levels are: ${validSeverities.join(', ')}`;
    }

    // Check that values are boolean
    for (const [severity, enabled] of Object.entries(body.severity_thresholds)) {
      if (typeof enabled !== 'boolean') {
        return `severity_thresholds.${severity} must be a boolean`;
      }
    }
  }

  if (body.quiet_hours) {
    if (!body.quiet_hours.start || !body.quiet_hours.end) {
      return 'quiet_hours must include start and end times';
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(body.quiet_hours.start)) {
      return 'quiet_hours.start must be in HH:MM format';
    }
    if (!timeRegex.test(body.quiet_hours.end)) {
      return 'quiet_hours.end must be in HH:MM format';
    }
  }

  if (body.escalation_delay_minutes !== undefined) {
    if (typeof body.escalation_delay_minutes !== 'number' || body.escalation_delay_minutes < 0) {
      return 'escalation_delay_minutes must be a non-negative number';
    }
  }

  return null;
}

/**
 * Get preferences from service (helper function)
 */
async function getPreferencesFromService(
  service: EnhancedNotificationService,
  userId: string,
  teamId: string
): Promise<NotificationPreferences> {
  // This would use the service's method to get preferences
  // For now, we'll return default preferences
  return {
    user_id: userId,
    team_id: teamId,
    channels: ['slack'],
    severity_thresholds: {
      low: false,
      medium: true,
      high: true,
      critical: true
    },
    escalation_delay_minutes: 30
  };
}

/**
 * Create test notification request
 */
function createTestNotificationRequest(user: any, channel: string, severity: string): any {
  return {
    impact_analysis: {
      service_id: 'test-service',
      service_name: 'Test Service',
      team_id: user.team_id || 'test-team',
      analysis_type: 'full',
      affected_services: [{
        service_id: 'test-service',
        service_name: 'Test Service',
        team_id: user.team_id || 'test-team',
        depth: 1,
        path: ['test-service'],
        criticality: severity,
        impact_type: 'direct',
        dependency_types: ['api'],
        estimated_impact_score: 75
      }],
      risk_assessment: {
        overall_risk_level: severity,
        risk_factors: [{
          type: 'test',
          severity: severity,
          description: 'This is a test notification',
          affected_services: ['test-service']
        }],
        cross_team_impact_count: 1,
        critical_path_services: ['test-service'],
        business_impact_estimate: 'Low - test notification only'
      },
      stakeholders: [{
        team_id: user.team_id || 'test-team',
        team_name: 'Test Team',
        contact_info: [user.email || 'test@example.com'],
        role: 'owner',
        priority: severity === 'critical' ? 'high' : 'medium',
        notification_preferences: [channel]
      }],
      mitigation_strategies: [{
        strategy_type: 'communication',
        priority: 'medium',
        description: 'Test notification - no action required',
        action_items: ['Verify notification delivery'],
        estimated_effort: '5 minutes',
        responsible_teams: [user.team_id || 'test-team']
      }],
      visualization_data: {
        nodes: [],
        edges: [],
        clusters: [],
        layout_hints: {}
      }
    },
    change_description: 'Test notification to verify delivery settings',
    change_timeline: 'Immediate - test only',
    requester: {
      user_id: user.sub,
      name: user.name || user.email || user.sub,
      email: user.email || 'test@example.com',
      team_id: user.team_id || 'test-team'
    },
    notification_type: 'impact_alert',
    urgency: severity
  };
}

/**
 * Handler for getting notification status
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

    const notificationService = new EnhancedNotificationService({
      notificationTableName: process.env.NOTIFICATION_TABLE_NAME || 'notifications',
      preferencesTableName: process.env.PREFERENCES_TABLE_NAME || 'notification_preferences',
      retryQueueUrl: process.env.RETRY_QUEUE_URL || '',
      region: process.env.AWS_REGION
    });

    logger.info('Getting notification status', {
      notificationId,
      user: user.sub
    });

    const status = await notificationService.getNotificationStatus(notificationId);

    return buildResponse(200, {
      success: true,
      data: {
        notification_id: notificationId,
        deliveries: status,
        summary: {
          total_deliveries: status.length,
          successful: status.filter(s => s.status === 'delivered' || s.status === 'sent').length,
          failed: status.filter(s => s.status === 'failed').length,
          pending: status.filter(s => s.status === 'pending' || s.status === 'retrying').length
        }
      },
      metadata: {
        retrieved_at: new Date().toISOString(),
        correlation_id: logger.getCorrelationId()
      }
    });

  } catch (error) {
    logger.error('Error getting notification status', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return buildErrorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
};