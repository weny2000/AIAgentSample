/**
 * Work Task Conversation Handler
 * Lambda handler for processing conversational work task interactions
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { WorkTaskAgentIntegration } from '../../services/work-task-agent-integration';
import { AgentCoreService } from '../../services/agent-core-service';
import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { ConversationManagementService } from '../../services/conversation-management-service';
import { AuditService } from '../../services/audit-service';
import { NotificationService } from '../../services/notification-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { RepositoryFactory } from '../../repositories';
import { Logger } from '../utils/logger';
import { corsHeaders } from '../utils/cors';

// Initialize services (in production, use dependency injection)
let workTaskIntegration: WorkTaskAgentIntegration;
let logger: Logger;

function initializeServices() {
  if (!workTaskIntegration) {
    logger = new Logger({
      correlationId: 'work-task-conversation',
      operation: 'conversation-processing'
    });

    const repositories = new RepositoryFactory();
    
    const kendraService = new KendraSearchService(
      process.env.KENDRA_INDEX_ID!,
      logger
    );

    const rulesEngine = new RulesEngineService(
      repositories.rulesRepository,
      logger
    );

    const auditService = new AuditService({
      repositories,
      retentionPolicyDays: 2555
    });

    const notificationService = new NotificationService(
      repositories.notificationRepository,
      logger
    );

    const conversationService = new ConversationManagementService(
      repositories.conversationRepository,
      logger
    );

    const workTaskAnalysisService = new WorkTaskAnalysisService(
      kendraService,
      rulesEngine,
      repositories.auditLogRepository,
      logger
    );

    const agentCoreService = new AgentCoreService(
      repositories.personaRepository,
      repositories.auditLogRepository,
      kendraService,
      rulesEngine,
      conversationService,
      notificationService,
      logger
    );

    workTaskIntegration = new WorkTaskAgentIntegration(
      agentCoreService,
      workTaskAnalysisService,
      conversationService,
      auditService,
      notificationService,
      logger
    );
  }
}

/**
 * Process conversational message with work task awareness
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;
  
  try {
    initializeServices();
    logger.setCorrelationId(correlationId);

    logger.info('Processing work task conversation request', {
      path: event.path,
      method: event.httpMethod
    });

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Request body is required'
        })
      };
    }

    const body = JSON.parse(event.body);
    const { sessionId, message, userId, teamId } = body;

    // Validate required fields
    if (!sessionId || !message || !userId || !teamId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Missing required fields: sessionId, message, userId, teamId'
        })
      };
    }

    // Process message with work task context
    const response = await workTaskIntegration.processMessageWithWorkTaskContext(
      sessionId,
      message,
      userId,
      teamId
    );

    logger.info('Work task conversation processed successfully', {
      sessionId,
      messageId: response.messageId,
      confidence: response.confidence
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: response
      })
    };

  } catch (error) {
    logger.error('Failed to process work task conversation', error as Error, {
      correlationId
    });

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to process conversation',
        message: (error as Error).message
      })
    };
  }
}

/**
 * Start a new conversation session
 */
export async function startSessionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;
  
  try {
    initializeServices();
    logger.setCorrelationId(correlationId);

    logger.info('Starting new conversation session');

    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Request body is required'
        })
      };
    }

    const body = JSON.parse(event.body);
    const { userId, teamId, personaId, initialMessage } = body;

    if (!userId || !teamId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Missing required fields: userId, teamId'
        })
      };
    }

    // Start session through AgentCore
    const agentCoreService = (workTaskIntegration as any).agentCoreService;
    const sessionResponse = await agentCoreService.startSession({
      userId,
      teamId,
      personaId,
      initialMessage
    });

    logger.info('Conversation session started', {
      sessionId: sessionResponse.sessionId
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: sessionResponse
      })
    };

  } catch (error) {
    logger.error('Failed to start conversation session', error as Error, {
      correlationId
    });

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to start session',
        message: (error as Error).message
      })
    };
  }
}

/**
 * End a conversation session
 */
export async function endSessionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;
  
  try {
    initializeServices();
    logger.setCorrelationId(correlationId);

    const sessionId = event.pathParameters?.sessionId;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Session ID is required'
        })
      };
    }

    logger.info('Ending conversation session', { sessionId });

    // End session through AgentCore
    const agentCoreService = (workTaskIntegration as any).agentCoreService;
    await agentCoreService.endSession(sessionId);

    logger.info('Conversation session ended', { sessionId });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Session ended successfully'
      })
    };

  } catch (error) {
    logger.error('Failed to end conversation session', error as Error, {
      correlationId
    });

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to end session',
        message: (error as Error).message
      })
    };
  }
}

/**
 * Get conversation history
 */
export async function getHistoryHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;
  
  try {
    initializeServices();
    logger.setCorrelationId(correlationId);

    const sessionId = event.pathParameters?.sessionId;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Session ID is required'
        })
      };
    }

    const limit = event.queryStringParameters?.limit 
      ? parseInt(event.queryStringParameters.limit) 
      : 50;
    const offset = event.queryStringParameters?.offset 
      ? parseInt(event.queryStringParameters.offset) 
      : 0;

    logger.info('Getting conversation history', { sessionId, limit, offset });

    // Get history through AgentCore
    const agentCoreService = (workTaskIntegration as any).agentCoreService;
    const history = await agentCoreService.getSessionHistory({
      sessionId,
      limit,
      offset,
      includeReferences: true
    });

    logger.info('Conversation history retrieved', {
      sessionId,
      messageCount: history.messages.length
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: history
      })
    };

  } catch (error) {
    logger.error('Failed to get conversation history', error as Error, {
      correlationId
    });

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to get history',
        message: (error as Error).message
      })
    };
  }
}

/**
 * Cleanup expired contexts (scheduled task)
 */
export async function cleanupHandler(): Promise<void> {
  try {
    initializeServices();
    logger.info('Running context cleanup');

    await workTaskIntegration.cleanupExpiredContexts();

    logger.info('Context cleanup completed');
  } catch (error) {
    logger.error('Failed to cleanup contexts', error as Error);
    throw error;
  }
}
