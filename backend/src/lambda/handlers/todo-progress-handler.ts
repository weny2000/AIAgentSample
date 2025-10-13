/**
 * Lambda handler for Todo Progress Tracker operations
 * Handles progress tracking, status updates, and reporting
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TodoProgressTracker } from '../../services/todo-progress-tracker';
import { NotificationService } from '../../services/notification-service';
import { Logger } from '../utils/logger';
import { 
  StatusMetadata, 
  ProgressTrackingContext,
  TodoUpdateRequest 
} from '../../models/work-task-models';

// Initialize services (will be created per request)
let logger: Logger;
let notificationService: NotificationService;
let todoProgressTracker: TodoProgressTracker;

/**
 * Main Lambda handler for todo progress operations
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.headers['x-correlation-id'] || 'unknown';
  
  // Initialize services per request
  if (!logger) {
    logger = new Logger({
      correlationId: 'todo-progress-handler',
      operation: 'todo-progress-tracking'
    });
  }
  
  if (!notificationService) {
    notificationService = new NotificationService();
  }
  
  if (!todoProgressTracker) {
    todoProgressTracker = new TodoProgressTracker(notificationService, logger);
  }
  
  const requestLogger = logger.withContext({ correlationId });

  try {
    requestLogger.info('Todo progress handler invoked', {
      httpMethod: event.httpMethod,
      path: event.path,
      pathParameters: event.pathParameters
    });

    const { httpMethod, path } = event;
    const pathParts = path.split('/');

    // Route to appropriate handler based on HTTP method and path
    switch (httpMethod) {
      case 'PUT':
        if (pathParts.includes('status')) {
          return await handleUpdateTodoStatus(event, requestLogger);
        }
        break;

      case 'GET':
        if (pathParts.includes('progress')) {
          return await handleGetProgress(event, requestLogger);
        }
        if (pathParts.includes('blockers')) {
          return await handleGetBlockers(event, requestLogger);
        }
        if (pathParts.includes('report')) {
          return await handleGenerateReport(event, requestLogger);
        }
        if (pathParts.includes('visualization')) {
          return await handleGetVisualization(event, requestLogger);
        }
        break;

      case 'POST':
        if (pathParts.includes('triggers')) {
          return await handleSetupTriggers(event, requestLogger);
        }
        break;

      default:
        return createErrorResponse(405, 'Method not allowed', correlationId);
    }

    return createErrorResponse(404, 'Endpoint not found', correlationId);

  } catch (error) {
    requestLogger.error('Unhandled error in todo progress handler', error as Error);
    return createErrorResponse(500, 'Internal server error', correlationId);
  }
};

/**
 * Handle todo status update
 */
async function handleUpdateTodoStatus(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return createErrorResponse(400, 'Todo ID is required', logger.context.correlationId);
    }

    const body = JSON.parse(event.body || '{}') as TodoUpdateRequest & {
      updated_by: string;
      notes?: string;
      blocking_reason?: string;
    };

    if (!body.status || !body.updated_by) {
      return createErrorResponse(400, 'Status and updated_by are required', logger.context.correlationId);
    }

    const metadata: StatusMetadata = {
      updated_by: body.updated_by,
      notes: body.notes,
      blocking_reason: body.blocking_reason
    };

    const context: ProgressTrackingContext = {
      task_id: event.pathParameters?.taskId || 'unknown',
      team_id: event.headers['x-team-id'] || 'unknown',
      tracking_session_id: `session-${Date.now()}`,
      user_id: body.updated_by,
      timestamp: new Date().toISOString()
    };

    await todoProgressTracker.updateTodoStatus(
      todoId,
      body.status as 'pending' | 'in_progress' | 'completed' | 'blocked',
      metadata,
      context
    );

    logger.info('Todo status updated successfully', { todoId, status: body.status });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Todo status updated successfully',
        todoId,
        status: body.status,
        updatedAt: new Date().toISOString()
      })
    };

  } catch (error) {
    logger.error('Failed to update todo status', error as Error);
    return createErrorResponse(500, 'Failed to update todo status', logger.context.correlationId);
  }
}

/**
 * Handle get progress request
 */
async function handleGetProgress(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return createErrorResponse(400, 'Task ID is required', logger.context.correlationId);
    }

    const progress = await todoProgressTracker.trackProgress(taskId);

    logger.info('Progress retrieved successfully', { taskId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(progress)
    };

  } catch (error) {
    logger.error('Failed to get progress', error as Error);
    return createErrorResponse(500, 'Failed to get progress', logger.context.correlationId);
  }
}

/**
 * Handle get blockers request
 */
async function handleGetBlockers(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return createErrorResponse(400, 'Task ID is required', logger.context.correlationId);
    }

    const blockers = await todoProgressTracker.identifyBlockers(taskId);

    logger.info('Blockers identified successfully', { taskId, blockerCount: blockers.length });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        taskId,
        blockers,
        totalBlockers: blockers.length,
        criticalBlockers: blockers.filter(b => b.impact === 'critical').length
      })
    };

  } catch (error) {
    logger.error('Failed to get blockers', error as Error);
    return createErrorResponse(500, 'Failed to get blockers', logger.context.correlationId);
  }
}

/**
 * Handle generate report request
 */
async function handleGenerateReport(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return createErrorResponse(400, 'Task ID is required', logger.context.correlationId);
    }

    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.start_date;
    const endDate = queryParams.end_date;

    if (!startDate || !endDate) {
      return createErrorResponse(400, 'start_date and end_date are required', logger.context.correlationId);
    }

    const timeRange = {
      start_date: startDate,
      end_date: endDate
    };

    const config = {
      report_type: (queryParams.report_type as 'daily' | 'weekly' | 'milestone' | 'on_demand') || 'on_demand',
      include_sections: ['summary', 'completed_items', 'blocked_items', 'quality_metrics'] as const,
      recipients: [],
      format: (queryParams.format as 'json' | 'html' | 'pdf') || 'json',
      visualization_enabled: queryParams.visualization === 'true'
    };

    const report = await todoProgressTracker.generateProgressReport(taskId, timeRange, config);

    logger.info('Progress report generated successfully', { taskId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(report)
    };

  } catch (error) {
    logger.error('Failed to generate report', error as Error);
    return createErrorResponse(500, 'Failed to generate report', logger.context.correlationId);
  }
}

/**
 * Handle get visualization data request
 */
async function handleGetVisualization(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return createErrorResponse(400, 'Task ID is required', logger.context.correlationId);
    }

    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.start_date;
    const endDate = queryParams.end_date;

    if (!startDate || !endDate) {
      return createErrorResponse(400, 'start_date and end_date are required', logger.context.correlationId);
    }

    const timeRange = {
      start_date: startDate,
      end_date: endDate
    };

    const visualizationData = await todoProgressTracker.generateVisualizationData(taskId, timeRange);

    logger.info('Visualization data generated successfully', { taskId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(visualizationData)
    };

  } catch (error) {
    logger.error('Failed to get visualization data', error as Error);
    return createErrorResponse(500, 'Failed to get visualization data', logger.context.correlationId);
  }
}

/**
 * Handle setup notification triggers request
 */
async function handleSetupTriggers(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return createErrorResponse(400, 'Task ID is required', logger.context.correlationId);
    }

    const body = JSON.parse(event.body || '{}');
    const triggers = body.triggers;

    if (!triggers || !Array.isArray(triggers)) {
      return createErrorResponse(400, 'Triggers array is required', logger.context.correlationId);
    }

    await todoProgressTracker.setupNotificationTriggers(taskId, triggers);

    logger.info('Notification triggers setup successfully', { taskId, triggerCount: triggers.length });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Notification triggers setup successfully',
        taskId,
        triggerCount: triggers.length
      })
    };

  } catch (error) {
    logger.error('Failed to setup triggers', error as Error);
    return createErrorResponse(500, 'Failed to setup triggers', logger.context.correlationId);
  }
}

/**
 * Create standardized error response
 */
function createErrorResponse(
  statusCode: number,
  message: string,
  correlationId: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      error: true,
      message,
      correlationId,
      timestamp: new Date().toISOString()
    })
  };
}