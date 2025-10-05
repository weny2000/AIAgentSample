/**
 * AgentCore Lambda Handler
 * Handles all AgentCore service requests including session management and message processing
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AgentCoreService } from '../../services/agent-core-service';
import { PersonaRepository } from '../../repositories/persona-repository';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { ConversationRepository } from '../../repositories/conversation-repository';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { ConversationManagementService } from '../../services/conversation-management-service';
import { NotificationService } from '../../services/notification-service';
import { Logger } from '../utils/logger';
import { ResponseBuilder } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import {
  StartSessionRequest,
  SendMessageRequest,
  GetSessionHistoryRequest,
  UpdateAgentConfigRequest,
  AgentAnalyticsRequest,
  AgentCoreError
} from '../../models/agent-core';

// Initialize services
let agentCoreService: AgentCoreService;

const initializeServices = (correlationId: string) => {
  if (!agentCoreService) {
    // Initialize repositories with proper configuration
    const repositoryConfig = {
      region: process.env.AWS_REGION || 'us-east-1',
      tableName: process.env.DYNAMODB_TABLE_NAME || 'ai-agent-system'
    };
    
    const personaRepository = new PersonaRepository(repositoryConfig);
    const auditRepository = new AuditLogRepository(repositoryConfig);
    const kendraService = new KendraSearchService();
    const rulesEngine = RulesEngineService.getInstance();
    
    // Initialize conversation management service
    const conversationRepository = new ConversationRepository(repositoryConfig);
    const logger = new Logger({ correlationId });
    const conversationService = new ConversationManagementService(
      conversationRepository,
      logger
    );
    
    // Initialize notification service
    const notificationService = new NotificationService();
    
    agentCoreService = new AgentCoreService(
      personaRepository,
      auditRepository,
      kendraService,
      rulesEngine,
      conversationService,
      notificationService,
      logger
    );
  }
  return agentCoreService;
};

/**
 * Main AgentCore Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const logger = new Logger({ correlationId });

  try {
    logger.info('AgentCore request received', {
      path: event.path,
      method: event.httpMethod,
      correlationId
    });

    // Initialize services
    const service = initializeServices(correlationId);

    // Extract user context
    const userContext = AuthUtils.extractUserContext(event);

    // Route request based on path and method
    const path = event.path;
    const method = event.httpMethod;

    // Session management endpoints
    if (method === 'POST' && path.endsWith('/sessions')) {
      return await handleStartSession(service, event, userContext, logger);
    }

    if (method === 'POST' && path.includes('/sessions/') && path.endsWith('/messages')) {
      return await handleSendMessage(service, event, userContext, logger);
    }

    if (method === 'GET' && path.includes('/sessions/') && path.endsWith('/history')) {
      return await handleGetHistory(service, event, userContext, logger);
    }

    if (method === 'DELETE' && path.includes('/sessions/')) {
      return await handleEndSession(service, event, userContext, logger);
    }

    // Agent capability and metadata endpoints
    if (method === 'GET' && path.endsWith('/capabilities')) {
      return await handleGetCapabilities(service, event, userContext, logger);
    }

    if (method === 'GET' && path.endsWith('/metadata')) {
      return await handleGetMetadata(service, event, userContext, logger);
    }

    // Agent configuration endpoints
    if (method === 'GET' && path.includes('/agents/') && path.endsWith('/config')) {
      return await handleGetAgentConfig(service, event, userContext, logger);
    }

    if (method === 'PUT' && path.includes('/agents/') && path.endsWith('/config')) {
      return await handleUpdateAgentConfig(service, event, userContext, logger);
    }

    // Health monitoring endpoints
    if (method === 'GET' && path.endsWith('/health')) {
      return await handleHealthCheck(service, logger);
    }

    if (method === 'GET' && path.endsWith('/health/detailed')) {
      return await handleDetailedHealthCheck(service, logger);
    }

    // Analytics endpoints
    if (method === 'GET' && path.endsWith('/analytics')) {
      return await handleGetAnalytics(service, event, userContext, logger);
    }

    // Status reporting endpoints
    if (method === 'GET' && path.endsWith('/status')) {
      return await handleGetStatus(service, event, userContext, logger);
    }

    return ResponseBuilder.notFound('Endpoint not found', { correlationId });

  } catch (error) {
    logger.error('AgentCore request failed', error as Error);

    if (error instanceof AgentCoreError) {
      return ResponseBuilder.error(
        error.code,
        error.message,
        error.statusCode,
        error.details,
        { correlationId }
      );
    }

    return ResponseBuilder.internalError('Internal server error', undefined, { correlationId });
  }
};

/**
 * Handle start session request
 */
async function handleStartSession(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const request: StartSessionRequest = {
      userId: userContext.userId,
      teamId: userContext.teamId,
      ...JSON.parse(event.body || '{}')
    };

    const response = await service.startSession(request);

    logger.info('Session started successfully', {
      sessionId: response.sessionId,
      userId: request.userId,
      teamId: request.teamId
    });

    return ResponseBuilder.success(response);

  } catch (error) {
    logger.error('Failed to start session', error as Error);
    throw error;
  }
}

/**
 * Handle send message request
 */
async function handleSendMessage(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = extractSessionId(event.path);
    const request: SendMessageRequest = {
      sessionId,
      ...JSON.parse(event.body || '{}')
    };

    const response = await service.sendMessage(request);

    logger.info('Message processed successfully', {
      sessionId,
      messageId: response.messageId,
      confidence: response.confidence,
      processingTime: response.processingTime
    });

    return ResponseBuilder.success(response);

  } catch (error) {
    logger.error('Failed to process message', error as Error);
    throw error;
  }
}

/**
 * Handle get session history request
 */
async function handleGetHistory(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = extractSessionId(event.path);
    const queryParams = event.queryStringParameters || {};
    
    const request: GetSessionHistoryRequest = {
      sessionId,
      limit: queryParams.limit ? parseInt(queryParams.limit) : undefined,
      offset: queryParams.offset ? parseInt(queryParams.offset) : undefined,
      includeReferences: queryParams.includeReferences === 'true'
    };

    const response = await service.getSessionHistory(request);

    logger.info('Session history retrieved', {
      sessionId,
      messageCount: response.messages.length,
      totalCount: response.totalCount
    });

    return ResponseBuilder.success(response);

  } catch (error) {
    logger.error('Failed to get session history', error as Error);
    throw error;
  }
}

/**
 * Handle end session request
 */
async function handleEndSession(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = extractSessionId(event.path);
    
    await service.endSession(sessionId);

    logger.info('Session ended successfully', { sessionId });

    return ResponseBuilder.success({ message: 'Session ended successfully' });

  } catch (error) {
    logger.error('Failed to end session', error as Error);
    throw error;
  }
}

/**
 * Handle basic health check request
 */
async function handleHealthCheck(
  service: AgentCoreService,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'AgentCore',
      version: '1.0.0'
    };

    return ResponseBuilder.success(health);

  } catch (error) {
    logger.error('Health check failed', error as Error);
    return ResponseBuilder.internalError('Service unhealthy');
  }
}

/**
 * Handle detailed health check request
 */
async function handleDetailedHealthCheck(
  service: AgentCoreService,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    // Get detailed health information from the service
    const healthData = await service.getDetailedHealth();

    logger.info('Detailed health check completed', {
      status: healthData.status,
      activeSessions: healthData.metrics.activeSessions
    });

    return ResponseBuilder.success(healthData);

  } catch (error) {
    logger.error('Detailed health check failed', error as Error);
    return ResponseBuilder.internalError('Service unhealthy');
  }
}

/**
 * Handle get capabilities request
 */
async function handleGetCapabilities(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    const category = queryParams.category;
    const enabled = queryParams.enabled === 'true' ? true : queryParams.enabled === 'false' ? false : undefined;

    const capabilities = await service.getCapabilities({
      category: category as any,
      enabled,
      userId: userContext.userId,
      teamId: userContext.teamId
    });

    logger.info('Capabilities retrieved', {
      userId: userContext.userId,
      capabilityCount: capabilities.length,
      category
    });

    return ResponseBuilder.success({ capabilities });

  } catch (error) {
    logger.error('Failed to get capabilities', error as Error);
    throw error;
  }
}

/**
 * Handle get metadata request
 */
async function handleGetMetadata(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const metadata = await service.getAgentMetadata(userContext.teamId);

    logger.info('Agent metadata retrieved', {
      userId: userContext.userId,
      teamId: userContext.teamId
    });

    return ResponseBuilder.success(metadata);

  } catch (error) {
    logger.error('Failed to get agent metadata', error as Error);
    throw error;
  }
}

/**
 * Handle get agent configuration request
 */
async function handleGetAgentConfig(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const agentId = extractAgentId(event.path);
    
    // Check if user has permission to view this agent's config
    if (!AuthUtils.hasPermission(userContext, 'agent-config-read')) {
      return ResponseBuilder.forbidden('Insufficient permissions to view agent configuration');
    }

    const config = await service.getAgentConfiguration(agentId);

    logger.info('Agent configuration retrieved', {
      agentId,
      userId: userContext.userId
    });

    return ResponseBuilder.success(config);

  } catch (error) {
    logger.error('Failed to get agent configuration', error as Error);
    throw error;
  }
}

/**
 * Handle update agent configuration request
 */
async function handleUpdateAgentConfig(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const agentId = extractAgentId(event.path);
    
    // Check if user has permission to update this agent's config
    if (!AuthUtils.hasPermission(userContext, 'agent-config-write')) {
      return ResponseBuilder.forbidden('Insufficient permissions to update agent configuration');
    }

    const request: UpdateAgentConfigRequest = {
      agentId,
      ...JSON.parse(event.body || '{}')
    };

    // Validate required fields
    const missingFields = AuthUtils.validateRequiredFields(request, ['agentId']);
    if (missingFields.length > 0) {
      return ResponseBuilder.badRequest(
        `Missing required fields: ${missingFields.join(', ')}`
      );
    }

    const updatedConfig = await service.updateAgentConfiguration(request);

    logger.info('Agent configuration updated', {
      agentId,
      userId: userContext.userId,
      updatedFields: Object.keys(request).filter(k => k !== 'agentId')
    });

    return ResponseBuilder.success(updatedConfig);

  } catch (error) {
    logger.error('Failed to update agent configuration', error as Error);
    throw error;
  }
}

/**
 * Handle get analytics request
 */
async function handleGetAnalytics(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    
    // Check if user has permission to view analytics
    if (!AuthUtils.hasPermission(userContext, 'analytics-read')) {
      return ResponseBuilder.forbidden('Insufficient permissions to view analytics');
    }

    const request: AgentAnalyticsRequest = {
      agentId: queryParams.agentId,
      userId: queryParams.userId,
      teamId: queryParams.teamId || userContext.teamId,
      startDate: new Date(queryParams.startDate || Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(queryParams.endDate || Date.now()),
      metrics: queryParams.metrics ? queryParams.metrics.split(',') : ['sessions', 'satisfaction', 'performance']
    };

    const analytics = await service.getAnalytics(request);

    logger.info('Analytics retrieved', {
      userId: userContext.userId,
      teamId: request.teamId,
      dateRange: `${request.startDate.toISOString()} - ${request.endDate.toISOString()}`,
      totalSessions: analytics.totalSessions
    });

    return ResponseBuilder.success(analytics);

  } catch (error) {
    logger.error('Failed to get analytics', error as Error);
    throw error;
  }
}

/**
 * Handle get status request
 */
async function handleGetStatus(
  service: AgentCoreService,
  event: APIGatewayProxyEvent,
  userContext: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    const includeMetrics = queryParams.includeMetrics === 'true';
    const includeIssues = queryParams.includeIssues === 'true';

    const status = await service.getAgentStatus({
      userId: userContext.userId,
      teamId: userContext.teamId,
      includeMetrics,
      includeIssues
    });

    logger.info('Agent status retrieved', {
      userId: userContext.userId,
      teamId: userContext.teamId,
      status: status.status
    });

    return ResponseBuilder.success(status);

  } catch (error) {
    logger.error('Failed to get agent status', error as Error);
    throw error;
  }
}

/**
 * Extract session ID from path
 */
function extractSessionId(path: string): string {
  const matches = path.match(/\/sessions\/([^\/]+)/);
  if (!matches || !matches[1]) {
    throw new AgentCoreError('Invalid session ID in path', 'INVALID_SESSION_ID', 400);
  }
  return matches[1];
}

/**
 * Extract agent ID from path
 */
function extractAgentId(path: string): string {
  const matches = path.match(/\/agents\/([^\/]+)/);
  if (!matches || !matches[1]) {
    throw new AgentCoreError('Invalid agent ID in path', 'INVALID_AGENT_ID', 400);
  }
  return matches[1];
}