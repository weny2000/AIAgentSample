import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KendraClient, QueryCommand } from '@aws-sdk/client-kendra';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { QueryRequest, AgentResponse, SourceReference } from '../types';
import { ResponseBuilder } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';

const kendraClient = new KendraClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

const KENDRA_INDEX_ID = process.env.KENDRA_INDEX_ID!;
const TEAM_ROSTER_TABLE = process.env.TEAM_ROSTER_TABLE!;
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const logger = new Logger({ correlationId, operation: 'agent-query' });

  try {
    logger.info('Processing agent query request', { 
      path: event.path,
      httpMethod: event.httpMethod 
    });

    // Extract user context from authorizer
    const userContext = AuthUtils.extractUserContext(event);
    logger.info('User context extracted', { userId: userContext.userId, teamId: userContext.teamId });

    // Parse request body
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required');
    }

    let requestBody: QueryRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      logger.error('Failed to parse request body', error as Error);
      return ResponseBuilder.badRequest('Invalid JSON in request body');
    }

    // Validate required fields
    const requiredFields = ['query', 'userId', 'teamId'];
    const missingFields = AuthUtils.validateRequiredFields(requestBody, requiredFields);
    
    if (missingFields.length > 0) {
      return ResponseBuilder.badRequest(
        'Missing required fields',
        { missingFields }
      );
    }

    // Validate user can access the requested team
    if (!AuthUtils.canAccessTeam(userContext, requestBody.teamId)) {
      return ResponseBuilder.forbidden('Access denied to team resources');
    }

    logger.info('Processing query', { 
      query: requestBody.query.substring(0, 100) + '...', // Log first 100 chars
      teamId: requestBody.teamId,
      personaId: requestBody.personaId 
    });

    // Get team roster and persona information
    const teamInfo = await getTeamInfo(requestBody.teamId, logger);
    const personaId = requestBody.personaId || teamInfo?.leader_persona_id || 'default';

    // Perform Kendra search with access control
    const searchResults = await performKendraSearch(
      requestBody.query,
      userContext,
      logger
    );

    // Generate persona-based response
    const agentResponse = await generatePersonaResponse(
      requestBody.query,
      searchResults,
      personaId,
      userContext,
      logger
    );

    // Log the interaction for audit purposes
    await logInteraction(
      correlationId,
      userContext,
      requestBody.query,
      agentResponse,
      personaId,
      logger
    );

    logger.info('Agent query processed successfully', { 
      confidence: agentResponse.confidence,
      sourceCount: agentResponse.sources.length,
      escalationRequired: agentResponse.escalationRequired 
    });

    return ResponseBuilder.success(agentResponse);

  } catch (error) {
    logger.error('Error processing agent query request', error as Error);
    
    if (error instanceof Error && error.message.includes('authorization')) {
      return ResponseBuilder.unauthorized(error.message);
    }
    
    return ResponseBuilder.internalError(
      'Failed to process agent query',
      { correlationId }
    );
  }
};

async function getTeamInfo(teamId: string, logger: Logger): Promise<any> {
  try {
    const result = await dynamoClient.send(new GetCommand({
      TableName: TEAM_ROSTER_TABLE,
      Key: { team_id: teamId },
    }));

    return result.Item;
  } catch (error) {
    logger.warn('Failed to retrieve team info', { teamId, error });
    return null;
  }
}

async function performKendraSearch(
  query: string,
  userContext: any,
  logger: Logger
): Promise<SourceReference[]> {
  try {
    logger.info('Performing Kendra search', { queryLength: query.length });

    const kendraResponse = await kendraClient.send(new QueryCommand({
      IndexId: KENDRA_INDEX_ID,
      QueryText: query,
      PageSize: 10,
      AttributeFilter: {
        AndAllFilters: [
          {
            EqualsTo: {
              Key: 'team_id',
              Value: {
                StringValue: userContext.teamId,
              },
            },
          },
          {
            EqualsTo: {
              Key: 'access_level',
              Value: {
                StringValue: userContext.clearance,
              },
            },
          },
        ],
      },
    }));

    const sources: SourceReference[] = [];

    // Process query results
    if (kendraResponse.ResultItems) {
      for (const item of kendraResponse.ResultItems) {
        if (item.ScoreAttributes?.ScoreConfidence === 'HIGH' || 
            item.ScoreAttributes?.ScoreConfidence === 'MEDIUM') {
          
          sources.push({
            sourceId: item.Id || 'unknown',
            sourceType: item.Type || 'DOCUMENT',
            confidenceScore: getConfidenceScore(item.ScoreAttributes?.ScoreConfidence),
            snippet: item.DocumentExcerpt?.Text || '',
            url: item.DocumentURI,
          });
        }
      }
    }

    logger.info('Kendra search completed', { 
      resultCount: kendraResponse.ResultItems?.length || 0,
      highConfidenceCount: sources.length 
    });

    return sources;

  } catch (error) {
    logger.error('Kendra search failed', error as Error);
    return [];
  }
}

async function generatePersonaResponse(
  query: string,
  sources: SourceReference[],
  personaId: string,
  _userContext: any,
  logger: Logger
): Promise<AgentResponse> {
  // This is a simplified implementation
  // In a real system, this would integrate with an LLM service
  
  logger.info('Generating persona-based response', { 
    personaId,
    sourceCount: sources.length 
  });

  // Determine if escalation is needed
  const escalationRequired = shouldEscalate(query, sources);
  
  // Generate response based on available sources
  let response: string;
  let confidence: number;

  if (sources.length === 0) {
    response = "I don't have enough information in our knowledge base to answer your question accurately. Let me escalate this to your team leader for a more detailed response.";
    confidence = 0.1;
  } else if (sources.length === 1) {
    response = `Based on our team's documentation, ${sources[0].snippet}. However, I recommend confirming this with your team leader for the most current guidance.`;
    confidence = 0.6;
  } else {
    response = `Based on multiple sources in our knowledge base: ${sources.slice(0, 2).map(s => s.snippet).join(' ')}. This aligns with our team's established practices.`;
    confidence = 0.8;
  }

  // Add persona-specific tone and guidance
  response = addPersonaTone(response, personaId);

  const followUpQuestions = generateFollowUpQuestions(query, sources);

  return {
    response,
    confidence,
    sources,
    personaUsed: personaId,
    followUpQuestions,
    escalationRequired,
    escalationReason: escalationRequired ? 'Insufficient information or complex decision required' : undefined,
  };
}

function shouldEscalate(query: string, sources: SourceReference[]): boolean {
  // Simple escalation logic - in practice this would be more sophisticated
  const escalationKeywords = [
    'budget', 'hire', 'fire', 'promote', 'strategy', 'roadmap', 
    'priority', 'deadline', 'conflict', 'exception', 'approval'
  ];

  const queryLower = query.toLowerCase();
  const hasEscalationKeywords = escalationKeywords.some(keyword => 
    queryLower.includes(keyword)
  );

  return hasEscalationKeywords || sources.length === 0;
}

function addPersonaTone(response: string, personaId: string): string {
  // Simple persona tone adjustment - in practice this would be more sophisticated
  const personaTones: Record<string, string> = {
    'supportive': 'I understand this can be challenging. ',
    'direct': 'Here\'s what you need to know: ',
    'collaborative': 'Let\'s work through this together. ',
    'analytical': 'Based on the data available: ',
    'default': 'Here\'s what I found: ',
  };

  const tone = personaTones[personaId] || personaTones['default'];
  return tone + response;
}

function generateFollowUpQuestions(_query: string, _sources: SourceReference[]): string[] {
  // Simple follow-up question generation
  const questions = [
    'Would you like me to search for more specific information?',
    'Do you need guidance on implementing this?',
    'Should I check for any related team policies?',
  ];

  return questions.slice(0, 2); // Return first 2 questions
}

function getConfidenceScore(kendraConfidence?: string): number {
  switch (kendraConfidence) {
    case 'VERY_HIGH': return 0.95;
    case 'HIGH': return 0.85;
    case 'MEDIUM': return 0.65;
    case 'LOW': return 0.45;
    default: return 0.3;
  }
}

async function logInteraction(
  correlationId: string,
  userContext: any,
  _query: string,
  response: AgentResponse,
  personaId: string,
  logger: Logger
): Promise<void> {
  try {
    const auditLogItem = {
      request_id: correlationId,
      timestamp: new Date().toISOString(),
      user_id: userContext.userId,
      persona: personaId,
      action: 'agent_query',
      references: response.sources,
      result_summary: response.response.substring(0, 200),
      compliance_score: response.confidence,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year TTL
    };

    await dynamoClient.send(new PutCommand({
      TableName: AUDIT_LOG_TABLE,
      Item: auditLogItem,
    }));

    logger.info('Interaction logged for audit', { correlationId });

  } catch (error) {
    logger.error('Failed to log interaction', error as Error);
    // Don't fail the request if audit logging fails
  }
}