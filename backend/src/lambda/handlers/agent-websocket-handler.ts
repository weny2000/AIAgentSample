/**
 * AgentCore WebSocket Handler
 * Handles real-time agent conversations via WebSocket connections
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk';
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
  SendMessageRequest,
  AgentCoreError,
  ConversationMessage
} from '../../models/agent-core';

// WebSocket connection management
interface WebSocketConnection {
  connectionId: string;
  userId: string;
  teamId: string;
  sessionId?: string;
  connectedAt: Date;
  lastActivity: Date;
}

interface WebSocketMessage {
  action: 'message' | 'typing' | 'join_session' | 'leave_session' | 'ping';
  sessionId?: string;
  message?: string;
  messageType?: 'text' | 'command' | 'file_upload';
  data?: Record<string, any>;
}

interface WebSocketResponse {
  type: 'message' | 'typing' | 'error' | 'status' | 'pong';
  sessionId?: string;
  messageId?: string;
  content?: string;
  confidence?: number;
  references?: any[];
  actionItems?: any[];
  suggestions?: string[];
  processingTime?: number;
  error?: string;
  timestamp: string;
}

// Initialize services
let agentCoreService: AgentCoreService;
let dynamoDb: DynamoDB.DocumentClient;
let apiGateway: ApiGatewayManagementApi;

const initializeServices = (correlationId: string, event: APIGatewayProxyEvent) => {
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

    // Initialize DynamoDB for connection management
    dynamoDb = new DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    // Initialize API Gateway Management API for WebSocket
    const { domainName, stage } = event.requestContext;
    apiGateway = new ApiGatewayManagementApi({
      apiVersion: '2018-11-29',
      endpoint: `https://${domainName}/${stage}`
    });
  }
  return { agentCoreService, dynamoDb, apiGateway };
};

/**
 * Main WebSocket handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const logger = new Logger({ correlationId });

  try {
    const { agentCoreService, dynamoDb, apiGateway } = initializeServices(correlationId, event);
    const connectionId = event.requestContext.connectionId!;
    const routeKey = event.requestContext.routeKey;

    logger.info('WebSocket request received', {
      connectionId,
      routeKey,
      correlationId
    });

    switch (routeKey) {
      case '$connect':
        return await handleConnect(event, dynamoDb, logger);
      
      case '$disconnect':
        return await handleDisconnect(event, dynamoDb, logger);
      
      case '$default':
        return await handleMessage(event, agentCoreService, dynamoDb, apiGateway, logger);
      
      default:
        logger.warn('Unknown route key', { routeKey });
        return ResponseBuilder.badRequest('Unknown route');
    }

  } catch (error) {
    logger.error('WebSocket request failed', error as Error);

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
 * Handle WebSocket connection
 */
async function handleConnect(
  event: APIGatewayProxyEvent,
  dynamoDb: DynamoDB.DocumentClient,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const connectionId = event.requestContext.connectionId!;
    
    // Extract user context from query parameters or headers
    const queryParams = event.queryStringParameters || {};
    const userContext = {
      userId: queryParams.userId,
      teamId: queryParams.teamId,
      role: queryParams.role || 'user',
      department: queryParams.department || 'unknown',
      clearance: queryParams.clearance || 'standard',
      permissions: queryParams.permissions ? queryParams.permissions.split(',') : []
    };

    if (!userContext.userId || !userContext.teamId) {
      logger.error('Missing user context in WebSocket connection');
      return ResponseBuilder.unauthorized('Missing user context');
    }

    // Store connection in DynamoDB
    const connection: WebSocketConnection = {
      connectionId,
      userId: userContext.userId,
      teamId: userContext.teamId,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    await dynamoDb.put({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Item: {
        connectionId,
        ...connection,
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours TTL
      }
    }).promise();

    logger.info('WebSocket connection established', {
      connectionId,
      userId: userContext.userId,
      teamId: userContext.teamId
    });

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to handle WebSocket connection', error as Error);
    return ResponseBuilder.internalError('Connection failed');
  }
}

/**
 * Handle WebSocket disconnection
 */
async function handleDisconnect(
  event: APIGatewayProxyEvent,
  dynamoDb: DynamoDB.DocumentClient,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const connectionId = event.requestContext.connectionId!;

    // Remove connection from DynamoDB
    await dynamoDb.delete({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Key: { connectionId }
    }).promise();

    logger.info('WebSocket connection closed', { connectionId });

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to handle WebSocket disconnection', error as Error);
    return ResponseBuilder.internalError('Disconnection failed');
  }
}

/**
 * Handle WebSocket message
 */
async function handleMessage(
  event: APIGatewayProxyEvent,
  agentCoreService: AgentCoreService,
  dynamoDb: DynamoDB.DocumentClient,
  apiGateway: ApiGatewayManagementApi,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const connectionId = event.requestContext.connectionId!;
    const body = JSON.parse(event.body || '{}') as WebSocketMessage;

    // Get connection details
    const connectionResult = await dynamoDb.get({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Key: { connectionId }
    }).promise();

    if (!connectionResult.Item) {
      logger.error('Connection not found', { connectionId });
      return ResponseBuilder.notFound('Connection not found');
    }

    const connection = connectionResult.Item as WebSocketConnection;

    // Update last activity
    await dynamoDb.update({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Key: { connectionId },
      UpdateExpression: 'SET lastActivity = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      }
    }).promise();

    // Handle different message types
    switch (body.action) {
      case 'message':
        return await handleChatMessage(body, connection, agentCoreService, apiGateway, logger);
      
      case 'typing':
        return await handleTypingIndicator(body, connection, apiGateway, logger);
      
      case 'join_session':
        return await handleJoinSession(body, connection, dynamoDb, apiGateway, logger);
      
      case 'leave_session':
        return await handleLeaveSession(body, connection, dynamoDb, apiGateway, logger);
      
      case 'ping':
        return await handlePing(connection, apiGateway, logger);
      
      default:
        logger.warn('Unknown message action', { action: body.action });
        await sendErrorToConnection(connectionId, 'Unknown action', apiGateway);
        return ResponseBuilder.badRequest('Unknown action');
    }

  } catch (error) {
    logger.error('Failed to handle WebSocket message', error as Error);
    
    try {
      await sendErrorToConnection(
        event.requestContext.connectionId!,
        'Message processing failed',
        apiGateway
      );
    } catch (sendError) {
      logger.error('Failed to send error message', sendError as Error);
    }

    return ResponseBuilder.internalError('Message processing failed');
  }
}

/**
 * Handle chat message
 */
async function handleChatMessage(
  message: WebSocketMessage,
  connection: WebSocketConnection,
  agentCoreService: AgentCoreService,
  apiGateway: ApiGatewayManagementApi,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    if (!message.sessionId || !message.message) {
      await sendErrorToConnection(connection.connectionId, 'Missing sessionId or message', apiGateway);
      return ResponseBuilder.badRequest('Missing required fields');
    }

    // Send typing indicator
    await sendTypingIndicator(connection.connectionId, message.sessionId, true, apiGateway);

    // Process message through AgentCore service
    const request: SendMessageRequest = {
      sessionId: message.sessionId,
      message: message.message,
      messageType: message.messageType || 'text'
    };

    const response = await agentCoreService.sendMessage(request);

    // Stop typing indicator
    await sendTypingIndicator(connection.connectionId, message.sessionId, false, apiGateway);

    // Send response back to client
    const wsResponse: WebSocketResponse = {
      type: 'message',
      sessionId: message.sessionId,
      messageId: response.messageId,
      content: response.response,
      confidence: response.confidence,
      references: response.references,
      actionItems: response.actionItems,
      suggestions: response.suggestions,
      processingTime: response.processingTime,
      timestamp: new Date().toISOString()
    };

    await sendMessageToConnection(connection.connectionId, wsResponse, apiGateway);

    logger.info('Chat message processed successfully', {
      connectionId: connection.connectionId,
      sessionId: message.sessionId,
      messageId: response.messageId,
      confidence: response.confidence,
      processingTime: response.processingTime
    });

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to process chat message', error as Error);
    await sendErrorToConnection(connection.connectionId, 'Failed to process message', apiGateway);
    throw error;
  }
}

/**
 * Handle typing indicator
 */
async function handleTypingIndicator(
  message: WebSocketMessage,
  connection: WebSocketConnection,
  apiGateway: ApiGatewayManagementApi,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    if (!message.sessionId) {
      return ResponseBuilder.badRequest('Missing sessionId');
    }

    // In a real implementation, you might broadcast typing indicators to other participants
    // For now, we'll just acknowledge the typing indicator
    const response: WebSocketResponse = {
      type: 'status',
      sessionId: message.sessionId,
      content: 'Typing indicator received',
      timestamp: new Date().toISOString()
    };

    await sendMessageToConnection(connection.connectionId, response, apiGateway);

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to handle typing indicator', error as Error);
    throw error;
  }
}

/**
 * Handle join session
 */
async function handleJoinSession(
  message: WebSocketMessage,
  connection: WebSocketConnection,
  dynamoDb: DynamoDB.DocumentClient,
  apiGateway: ApiGatewayManagementApi,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    if (!message.sessionId) {
      await sendErrorToConnection(connection.connectionId, 'Missing sessionId', apiGateway);
      return ResponseBuilder.badRequest('Missing sessionId');
    }

    // Update connection with session ID
    await dynamoDb.update({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Key: { connectionId: connection.connectionId },
      UpdateExpression: 'SET sessionId = :sessionId, lastActivity = :now',
      ExpressionAttributeValues: {
        ':sessionId': message.sessionId,
        ':now': new Date().toISOString()
      }
    }).promise();

    const response: WebSocketResponse = {
      type: 'status',
      sessionId: message.sessionId,
      content: 'Joined session successfully',
      timestamp: new Date().toISOString()
    };

    await sendMessageToConnection(connection.connectionId, response, apiGateway);

    logger.info('User joined session', {
      connectionId: connection.connectionId,
      sessionId: message.sessionId,
      userId: connection.userId
    });

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to join session', error as Error);
    await sendErrorToConnection(connection.connectionId, 'Failed to join session', apiGateway);
    throw error;
  }
}

/**
 * Handle leave session
 */
async function handleLeaveSession(
  message: WebSocketMessage,
  connection: WebSocketConnection,
  dynamoDb: DynamoDB.DocumentClient,
  apiGateway: ApiGatewayManagementApi,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    // Remove session ID from connection
    await dynamoDb.update({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Key: { connectionId: connection.connectionId },
      UpdateExpression: 'REMOVE sessionId SET lastActivity = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      }
    }).promise();

    const response: WebSocketResponse = {
      type: 'status',
      content: 'Left session successfully',
      timestamp: new Date().toISOString()
    };

    await sendMessageToConnection(connection.connectionId, response, apiGateway);

    logger.info('User left session', {
      connectionId: connection.connectionId,
      sessionId: message.sessionId,
      userId: connection.userId
    });

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to leave session', error as Error);
    await sendErrorToConnection(connection.connectionId, 'Failed to leave session', apiGateway);
    throw error;
  }
}

/**
 * Handle ping message
 */
async function handlePing(
  connection: WebSocketConnection,
  apiGateway: ApiGatewayManagementApi,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const response: WebSocketResponse = {
      type: 'pong',
      timestamp: new Date().toISOString()
    };

    await sendMessageToConnection(connection.connectionId, response, apiGateway);

    return ResponseBuilder.success({ statusCode: 200 });

  } catch (error) {
    logger.error('Failed to handle ping', error as Error);
    throw error;
  }
}

/**
 * Send message to WebSocket connection
 */
async function sendMessageToConnection(
  connectionId: string,
  message: WebSocketResponse,
  apiGateway: ApiGatewayManagementApi
): Promise<void> {
  try {
    await apiGateway.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify(message)
    }).promise();
  } catch (error: any) {
    if (error.statusCode === 410) {
      // Connection is gone, ignore
      console.log(`Connection ${connectionId} is gone`);
    } else {
      throw error;
    }
  }
}

/**
 * Send error message to WebSocket connection
 */
async function sendErrorToConnection(
  connectionId: string,
  errorMessage: string,
  apiGateway: ApiGatewayManagementApi
): Promise<void> {
  const response: WebSocketResponse = {
    type: 'error',
    error: errorMessage,
    timestamp: new Date().toISOString()
  };

  await sendMessageToConnection(connectionId, response, apiGateway);
}

/**
 * Send typing indicator to WebSocket connection
 */
async function sendTypingIndicator(
  connectionId: string,
  sessionId: string,
  isTyping: boolean,
  apiGateway: ApiGatewayManagementApi
): Promise<void> {
  const response: WebSocketResponse = {
    type: 'typing',
    sessionId,
    content: isTyping ? 'Agent is typing...' : '',
    timestamp: new Date().toISOString()
  };

  await sendMessageToConnection(connectionId, response, apiGateway);
}