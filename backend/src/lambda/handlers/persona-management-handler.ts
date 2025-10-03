import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PersonaService } from '../../services/persona-service';
import { PersonaRepository } from '../../repositories/persona-repository';
import { PersonaRequest, PersonaQuery } from '../../models/persona';
import { ResponseBuilder } from '../utils/response-builder';
import { Logger } from '../utils/logger';
import { extractUserFromEvent } from '../utils/auth-utils';

const logger = new Logger('PersonaManagementHandler');

// Initialize services
const personaRepository = new PersonaRepository({
  region: process.env.AWS_REGION || 'us-east-1',
  tableName: process.env.PERSONA_CONFIG_TABLE_NAME || 'ai-agent-persona-config-dev'
});

const personaService = new PersonaService({
  personaRepository,
  policyServiceUrl: process.env.POLICY_SERVICE_URL
});

/**
 * Create a new persona configuration
 */
export const createPersonaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    logger.info('Creating new persona configuration', { 
      path: event.path,
      method: event.httpMethod 
    });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Parse request body
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required');
    }

    const requestBody = JSON.parse(event.body);
    const { leader_id, team_id, ...personaRequest } = requestBody;

    if (!leader_id || !team_id) {
      return ResponseBuilder.badRequest('leader_id and team_id are required');
    }

    // Validate user permissions (leader can only create for themselves, admins can create for anyone)
    if (user.role !== 'admin' && user.user_id !== leader_id) {
      return ResponseBuilder.forbidden('You can only create personas for yourself');
    }

    // Create persona
    const result = await personaService.createPersona(
      leader_id,
      team_id,
      personaRequest as PersonaRequest,
      user.user_id
    );

    logger.info('Persona created successfully', { 
      personaId: result.persona.id,
      requiresApproval: result.requires_approval,
      conflictsCount: result.conflicts?.length || 0
    });

    return ResponseBuilder.success(result);

  } catch (error) {
    logger.error('Error creating persona', error);
    
    if (error instanceof Error) {
      if (error.message.includes('validation')) {
        return ResponseBuilder.badRequest(error.message);
      }
      if (error.message.includes('not found')) {
        return ResponseBuilder.notFound(error.message);
      }
    }

    return ResponseBuilder.internalServerError('Failed to create persona configuration');
  }
};

/**
 * Update an existing persona configuration
 */
export const updatePersonaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const personaId = event.pathParameters?.personaId;
    if (!personaId) {
      return ResponseBuilder.badRequest('personaId path parameter is required');
    }

    logger.info('Updating persona configuration', { personaId });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Parse request body
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required');
    }

    const personaRequest = JSON.parse(event.body) as PersonaRequest;

    // Get existing persona to check permissions
    const existingPersona = await personaService.getPersonaById(personaId);
    if (!existingPersona) {
      return ResponseBuilder.notFound('Persona not found');
    }

    // Validate user permissions
    if (user.role !== 'admin' && user.user_id !== existingPersona.leader_id) {
      return ResponseBuilder.forbidden('You can only update your own personas');
    }

    // Update persona
    const result = await personaService.updatePersona(
      personaId,
      personaRequest,
      user.user_id
    );

    logger.info('Persona updated successfully', { 
      personaId: result.persona.id,
      version: result.persona.version,
      requiresApproval: result.requires_approval,
      conflictsCount: result.conflicts?.length || 0
    });

    return ResponseBuilder.success(result);

  } catch (error) {
    logger.error('Error updating persona', error);
    
    if (error instanceof Error) {
      if (error.message.includes('validation')) {
        return ResponseBuilder.badRequest(error.message);
      }
      if (error.message.includes('not found')) {
        return ResponseBuilder.notFound(error.message);
      }
    }

    return ResponseBuilder.internalServerError('Failed to update persona configuration');
  }
};

/**
 * Get persona by ID
 */
export const getPersonaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const personaId = event.pathParameters?.personaId;
    if (!personaId) {
      return ResponseBuilder.badRequest('personaId path parameter is required');
    }

    logger.info('Getting persona configuration', { personaId });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    const persona = await personaService.getPersonaById(personaId);
    if (!persona) {
      return ResponseBuilder.notFound('Persona not found');
    }

    // Check permissions
    if (user.role !== 'admin' && user.user_id !== persona.leader_id && user.team_id !== persona.team_id) {
      return ResponseBuilder.forbidden('You do not have access to this persona');
    }

    return ResponseBuilder.success(persona);

  } catch (error) {
    logger.error('Error getting persona', error);
    return ResponseBuilder.internalServerError('Failed to get persona configuration');
  }
};

/**
 * Get personas for a leader
 */
export const getPersonasByLeaderHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const leaderId = event.pathParameters?.leaderId;
    if (!leaderId) {
      return ResponseBuilder.badRequest('leaderId path parameter is required');
    }

    logger.info('Getting personas for leader', { leaderId });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Check permissions
    if (user.role !== 'admin' && user.user_id !== leaderId) {
      return ResponseBuilder.forbidden('You can only view your own personas');
    }

    // Parse query parameters
    const limit = event.queryStringParameters?.limit ? 
      parseInt(event.queryStringParameters.limit) : undefined;
    const exclusiveStartKey = event.queryStringParameters?.exclusiveStartKey ? 
      JSON.parse(event.queryStringParameters.exclusiveStartKey) : undefined;

    const result = await personaService.getPersonasByLeader(leaderId, limit, exclusiveStartKey);

    return ResponseBuilder.success(result);

  } catch (error) {
    logger.error('Error getting personas by leader', error);
    return ResponseBuilder.internalServerError('Failed to get personas');
  }
};

/**
 * Approve a persona configuration
 */
export const approvePersonaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const personaId = event.pathParameters?.personaId;
    if (!personaId) {
      return ResponseBuilder.badRequest('personaId path parameter is required');
    }

    logger.info('Approving persona configuration', { personaId });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Only admins can approve personas
    if (user.role !== 'admin') {
      return ResponseBuilder.forbidden('Only administrators can approve persona configurations');
    }

    const approvedPersona = await personaService.approvePersona(personaId, user.user_id);

    logger.info('Persona approved successfully', { 
      personaId: approvedPersona.id,
      approvedBy: user.user_id
    });

    return ResponseBuilder.success(approvedPersona);

  } catch (error) {
    logger.error('Error approving persona', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return ResponseBuilder.notFound(error.message);
    }

    return ResponseBuilder.internalServerError('Failed to approve persona configuration');
  }
};

/**
 * Deactivate a persona configuration
 */
export const deactivatePersonaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const personaId = event.pathParameters?.personaId;
    if (!personaId) {
      return ResponseBuilder.badRequest('personaId path parameter is required');
    }

    logger.info('Deactivating persona configuration', { personaId });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Get existing persona to check permissions
    const existingPersona = await personaService.getPersonaById(personaId);
    if (!existingPersona) {
      return ResponseBuilder.notFound('Persona not found');
    }

    // Check permissions
    if (user.role !== 'admin' && user.user_id !== existingPersona.leader_id) {
      return ResponseBuilder.forbidden('You can only deactivate your own personas');
    }

    await personaService.deactivatePersona(personaId, user.user_id);

    logger.info('Persona deactivated successfully', { personaId });

    return ResponseBuilder.success({ message: 'Persona deactivated successfully' });

  } catch (error) {
    logger.error('Error deactivating persona', error);
    return ResponseBuilder.internalServerError('Failed to deactivate persona configuration');
  }
};

/**
 * Generate persona-based response to a query
 */
export const personaQueryHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    logger.info('Processing persona-based query', { 
      path: event.path,
      method: event.httpMethod 
    });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Parse request body
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required');
    }

    const queryRequest = JSON.parse(event.body);
    const { query, context, team_id } = queryRequest;

    if (!query || !team_id) {
      return ResponseBuilder.badRequest('query and team_id are required');
    }

    // Check if user has access to the team
    if (user.role !== 'admin' && user.team_id !== team_id) {
      return ResponseBuilder.forbidden('You do not have access to this team');
    }

    const personaQuery: PersonaQuery = {
      query,
      context,
      user_id: user.user_id,
      team_id
    };

    const response = await personaService.generatePersonaResponse(personaQuery);

    logger.info('Persona query processed successfully', { 
      teamId: team_id,
      escalationRequired: response.escalation_required,
      confidenceScore: response.confidence_score
    });

    return ResponseBuilder.success(response);

  } catch (error) {
    logger.error('Error processing persona query', error);
    
    if (error instanceof Error && error.message.includes('No active persona')) {
      return ResponseBuilder.notFound(error.message);
    }

    return ResponseBuilder.internalServerError('Failed to process persona query');
  }
};

/**
 * Search personas
 */
export const searchPersonasHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    logger.info('Searching personas');

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    const searchTerm = event.queryStringParameters?.q;
    if (!searchTerm) {
      return ResponseBuilder.badRequest('Search term (q) is required');
    }

    const limit = event.queryStringParameters?.limit ? 
      parseInt(event.queryStringParameters.limit) : undefined;
    const exclusiveStartKey = event.queryStringParameters?.exclusiveStartKey ? 
      JSON.parse(event.queryStringParameters.exclusiveStartKey) : undefined;

    const result = await personaService.searchPersonas(searchTerm, limit, exclusiveStartKey);

    // Filter results based on user permissions
    const filteredItems = result.items.filter(persona => 
      user.role === 'admin' || 
      user.user_id === persona.leader_id || 
      user.team_id === persona.team_id
    );

    return ResponseBuilder.success({
      ...result,
      items: filteredItems,
      count: filteredItems.length
    });

  } catch (error) {
    logger.error('Error searching personas', error);
    return ResponseBuilder.internalServerError('Failed to search personas');
  }
};

/**
 * Get persona version history
 */
export const getPersonaVersionHistoryHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const personaId = event.pathParameters?.personaId;
    if (!personaId) {
      return ResponseBuilder.badRequest('personaId path parameter is required');
    }

    logger.info('Getting persona version history', { personaId });

    // Extract user information
    const user = extractUserFromEvent(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    // Get persona to check permissions
    const persona = await personaService.getPersonaById(personaId);
    if (!persona) {
      return ResponseBuilder.notFound('Persona not found');
    }

    // Check permissions
    if (user.role !== 'admin' && user.user_id !== persona.leader_id) {
      return ResponseBuilder.forbidden('You can only view version history for your own personas');
    }

    const limit = event.queryStringParameters?.limit ? 
      parseInt(event.queryStringParameters.limit) : undefined;
    const exclusiveStartKey = event.queryStringParameters?.exclusiveStartKey ? 
      JSON.parse(event.queryStringParameters.exclusiveStartKey) : undefined;

    const result = await personaService.getPersonaVersionHistory(personaId, limit, exclusiveStartKey);

    return ResponseBuilder.success(result);

  } catch (error) {
    logger.error('Error getting persona version history', error);
    return ResponseBuilder.internalServerError('Failed to get persona version history');
  }
};