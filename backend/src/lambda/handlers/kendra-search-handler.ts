import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KendraClient, QueryCommand, RetrieveCommand, SubmitFeedbackCommand } from '@aws-sdk/client-kendra';
import { Logger } from '../utils/logger';
import { ResponseBuilder } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { UserContext, SearchRequest, SearchResponse, FeedbackRequest } from '../types';

const kendraClient = new KendraClient({ region: process.env.AWS_REGION });
const KENDRA_INDEX_ID = process.env.KENDRA_INDEX_ID!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const logger = new Logger({ correlationId, operation: 'kendra-search' });
  
  logger.info('Kendra search request received', { path: event.path });

  try {
    // Extract user context from JWT token
    const userContext = AuthUtils.extractUserContext(event);
    if (!userContext) {
      return ResponseBuilder.error('UNAUTHORIZED', 'Invalid or missing authentication token', 401, undefined, correlationId);
    }

    // Route based on HTTP method and path
    const httpMethod = event.httpMethod;
    const path = event.path;

    if (httpMethod === 'POST' && path.endsWith('/search')) {
      return await handleSearch(event, userContext, correlationId);
    } else if (httpMethod === 'POST' && path.endsWith('/feedback')) {
      return await handleFeedback(event, userContext, correlationId);
    } else {
      return ResponseBuilder.error('NOT_FOUND', 'Endpoint not found', 404, undefined, correlationId);
    }
  } catch (error: any) {
    logger.error('Error processing Kendra request', error);
    return ResponseBuilder.error('INTERNAL_ERROR', 'Internal server error', 500, undefined, correlationId);
  }
};

async function handleSearch(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  const logger = new Logger({ correlationId, operation: 'kendra-search' });
  
  try {
    if (!event.body) {
      return ResponseBuilder.error('INVALID_REQUEST', 'Request body is required', 400, undefined, correlationId);
    }

    const searchRequest: SearchRequest = JSON.parse(event.body);
    
    // Validate required fields
    if (!searchRequest.query || searchRequest.query.trim().length === 0) {
      return ResponseBuilder.error('INVALID_REQUEST', 'Query is required and cannot be empty', 400, undefined, correlationId);
    }

    if (searchRequest.query.length > 1000) {
      return ResponseBuilder.error('INVALID_REQUEST', 'Query is too long (max 1000 characters)', 400, undefined, correlationId);
    }

    logger.info('Processing search request', { 
      query: searchRequest.query,
      userId: userContext.userId,
      teamId: userContext.teamId,
      correlationId 
    });

    // Build user token for access control
    const userToken = buildUserToken(userContext);

    // Prepare Kendra query with access control filters
    const queryCommand = new QueryCommand({
      IndexId: KENDRA_INDEX_ID,
      QueryText: searchRequest.query,
      PageSize: searchRequest.pageSize || 10,
      PageNumber: searchRequest.pageNumber || 1,
      UserContext: {
        Token: userToken,
        UserId: userContext.userId,
        Groups: [userContext.teamId, userContext.department, userContext.role],
      },
      AttributeFilter: buildAttributeFilter(userContext, searchRequest.filters),
      Facets: [
        { DocumentAttributeKey: 'source_type' },
        { DocumentAttributeKey: 'team_id' },
        { DocumentAttributeKey: 'department' },
      ],
      RequestedDocumentAttributes: [
        'team_id',
        'source_type',
        'department',
        'confidence_score',
        'created_date',
      ],
      SortingConfiguration: {
        DocumentAttributeKey: '_score',
        SortOrder: 'DESC',
      },
    });

    const queryResult = await kendraClient.send(queryCommand);

    // Format search results with access control verification
    const searchResponse: SearchResponse = {
      query: searchRequest.query,
      totalResults: queryResult.TotalNumberOfResults || 0,
      results: await formatSearchResults(queryResult.ResultItems || [], userContext),
      facets: formatFacets(queryResult.FacetResults || []),
      queryId: queryResult.QueryId,
      correlationId,
    };

    logger.info('Search completed successfully', {
      totalResults: searchResponse.totalResults,
      returnedResults: searchResponse.results.length,
    });

    return ResponseBuilder.success(searchResponse);
  } catch (error: any) {
    logger.error('Error processing search request', error);
    
    if (error.name === 'ValidationException') {
      return ResponseBuilder.error('INVALID_REQUEST', error.message, 400, undefined, correlationId);
    }
    
    if (error.name === 'AccessDeniedException') {
      return ResponseBuilder.error('ACCESS_DENIED', 'Insufficient permissions for search', 403, undefined, correlationId);
    }
    
    return ResponseBuilder.error('SEARCH_ERROR', 'Failed to execute search', 500, undefined, correlationId);
  }
}

async function handleFeedback(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  const logger = new Logger({ correlationId, operation: 'kendra-feedback' });
  
  try {
    if (!event.body) {
      return ResponseBuilder.error('INVALID_REQUEST', 'Request body is required', 400, undefined, correlationId);
    }

    const feedbackRequest: FeedbackRequest = JSON.parse(event.body);
    
    // Validate required fields
    if (!feedbackRequest.queryId || !feedbackRequest.resultId || !feedbackRequest.relevance) {
      return ResponseBuilder.error('INVALID_REQUEST', 'queryId, resultId, and relevance are required', 400, undefined, correlationId);
    }

    if (!['RELEVANT', 'NOT_RELEVANT'].includes(feedbackRequest.relevance)) {
      return ResponseBuilder.error('INVALID_REQUEST', 'relevance must be RELEVANT or NOT_RELEVANT', 400, undefined, correlationId);
    }

    logger.info('Processing feedback request', {
      queryId: feedbackRequest.queryId,
      resultId: feedbackRequest.resultId,
      relevance: feedbackRequest.relevance,
      userId: userContext.userId,
      correlationId,
    });

    const feedbackCommand = new SubmitFeedbackCommand({
      IndexId: KENDRA_INDEX_ID,
      QueryId: feedbackRequest.queryId,
      RelevanceFeedbackItems: [
        {
          ResultId: feedbackRequest.resultId,
          RelevanceValue: feedbackRequest.relevance,
        },
      ],
    });

    await kendraClient.send(feedbackCommand);

    logger.info('Feedback submitted successfully');

    return ResponseBuilder.success({ message: 'Feedback submitted successfully' });
  } catch (error: any) {
    logger.error('Error processing feedback request', error);
    
    if (error.name === 'ValidationException') {
      return ResponseBuilder.error('INVALID_REQUEST', error.message, 400, undefined, correlationId);
    }
    
    return ResponseBuilder.error('FEEDBACK_ERROR', 'Failed to submit feedback', 500, undefined, correlationId);
  }
}

function buildUserToken(userContext: UserContext): string {
  // Build JWT-like token for Kendra user context
  // In production, this should be a proper JWT token
  const tokenPayload = {
    sub: userContext.userId,
    'cognito:username': userContext.userId,
    'cognito:groups': [userContext.teamId, userContext.department, userContext.role],
    team_id: userContext.teamId,
    department: userContext.department,
    role: userContext.role,
    clearance: userContext.clearance,
    permissions: userContext.permissions,
  };

  // For now, return base64 encoded payload
  // In production, this should be properly signed JWT
  return Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
}



function buildAttributeFilter(userContext: UserContext, filters?: Record<string, string[]>) {
  const baseFilter = {
    OrAllFilters: [
      {
        EqualsTo: {
          Key: 'team_id',
          Value: { StringValue: userContext.teamId },
        },
      },
      {
        EqualsTo: {
          Key: 'department',
          Value: { StringValue: userContext.department },
        },
      },
      {
        EqualsTo: {
          Key: 'access_level',
          Value: { StringValue: 'public' },
        },
      },
    ],
  };

  // Add user-specified filters
  if (filters) {
    const additionalFilters = Object.entries(filters).map(([key, values]) => ({
      OrAllFilters: values.map(value => ({
        EqualsTo: {
          Key: key,
          Value: { StringValue: value },
        },
      })),
    }));

    return {
      AndAllFilters: [baseFilter, ...additionalFilters],
    };
  }

  return baseFilter;
}

async function formatSearchResults(resultItems: any[], userContext: UserContext) {
  return resultItems.map(item => {
    // Verify access control for each result
    const hasAccess = verifyResultAccess(item, userContext);
    
    if (!hasAccess) {
      return null; // Filter out inaccessible results
    }

    return {
      id: item.Id,
      type: item.Type,
      title: item.DocumentTitle?.Text || 'Untitled',
      excerpt: item.DocumentExcerpt?.Text || '',
      uri: item.DocumentURI,
      confidence: calculateConfidenceScore(item.ScoreAttributes),
      sourceType: item.DocumentAttributes?.find((attr: any) => attr.Key === 'source_type')?.Value?.StringValue,
      teamId: item.DocumentAttributes?.find((attr: any) => attr.Key === 'team_id')?.Value?.StringValue,
      department: item.DocumentAttributes?.find((attr: any) => attr.Key === 'department')?.Value?.StringValue,
      createdDate: item.DocumentAttributes?.find((attr: any) => attr.Key === 'created_date')?.Value?.DateValue,
      highlights: item.DocumentExcerpt?.Highlights || [],
    };
  }).filter(result => result !== null); // Remove null results
}

function verifyResultAccess(item: any, userContext: UserContext): boolean {
  const teamId = item.DocumentAttributes?.find((attr: any) => attr.Key === 'team_id')?.Value?.StringValue;
  const department = item.DocumentAttributes?.find((attr: any) => attr.Key === 'department')?.Value?.StringValue;
  const accessLevel = item.DocumentAttributes?.find((attr: any) => attr.Key === 'access_level')?.Value?.StringValue;

  // Allow access if:
  // 1. Document is public
  // 2. User is in the same team
  // 3. User is in the same department
  // 4. User has appropriate clearance level
  return (
    accessLevel === 'public' ||
    teamId === userContext.teamId ||
    department === userContext.department ||
    userContext.permissions.includes('read:all_documents')
  );
}

function calculateConfidenceScore(scoreAttributes: any): number {
  if (!scoreAttributes) return 0;
  
  // Kendra provides various score attributes, normalize to 0-100 scale
  const textRelevanceScore = scoreAttributes.TextRelevanceScore || 0;
  return Math.round(textRelevanceScore * 100);
}

function formatFacets(facetResults: any[]) {
  return facetResults.map(facet => ({
    attribute: facet.DocumentAttributeKey,
    values: facet.DocumentAttributeValueCountPairs?.map((pair: any) => ({
      value: pair.DocumentAttributeValue?.StringValue || pair.DocumentAttributeValue?.LongValue?.toString(),
      count: pair.Count,
    })) || [],
  }));
}