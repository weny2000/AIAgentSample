import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { RuleRepository } from '../../repositories/rule-repository';
import { RulesEngine, DEFAULT_STATIC_ANALYSIS_CONFIG, DEFAULT_SEMANTIC_ANALYSIS_CONFIG } from '../../rules-engine';
import { RuleDefinition, ArtifactValidationRequest } from '../../rules-engine/types';
import { buildResponse, buildErrorResponse } from '../utils/response-builder';
import { logger } from '../utils/logger';
import { extractUserFromEvent } from '../utils/auth-utils';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ruleRepository = new RuleRepository(dynamoClient, process.env.RULE_DEFINITIONS_TABLE_NAME);
const rulesEngine = new RulesEngine(
  DEFAULT_STATIC_ANALYSIS_CONFIG,
  DEFAULT_SEMANTIC_ANALYSIS_CONFIG,
  ruleRepository
);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const correlationId = event.requestContext.requestId;
  logger.setCorrelationId(correlationId);

  try {
    const user = extractUserFromEvent(event);
    const httpMethod = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    logger.info('Processing rules management request', {
      method: httpMethod,
      path: event.path,
      userId: user.userId
    });

    switch (httpMethod) {
      case 'GET':
        return await handleGetRequest(pathParameters, event.queryStringParameters || {});
      
      case 'POST':
        return await handlePostRequest(pathParameters, body, user);
      
      case 'PUT':
        return await handlePutRequest(pathParameters, body, user);
      
      case 'DELETE':
        return await handleDeleteRequest(pathParameters, user);
      
      default:
        return buildErrorResponse(405, 'Method not allowed', correlationId);
    }
  } catch (error) {
    logger.error('Rules management request failed', { error });
    return buildErrorResponse(500, 'Internal server error', correlationId);
  }
};

async function handleGetRequest(
  pathParameters: Record<string, string | undefined>,
  queryParams: Record<string, string | undefined>
): Promise<APIGatewayProxyResult> {
  const ruleId = pathParameters.ruleId;

  if (ruleId) {
    // Get specific rule
    const rule = await ruleRepository.getRuleById(ruleId);
    if (!rule) {
      return buildErrorResponse(404, 'Rule not found', '');
    }
    return buildResponse(200, rule);
  }

  // Get rules with optional filters
  const type = queryParams.type as 'static' | 'semantic' | 'security' | undefined;
  const severity = queryParams.severity as 'low' | 'medium' | 'high' | 'critical' | undefined;
  const enabled = queryParams.enabled;
  const search = queryParams.search;

  let rules: RuleDefinition[];

  if (search) {
    rules = await ruleRepository.searchRules(search);
  } else if (type) {
    rules = await ruleRepository.getRulesByType(type);
  } else if (severity) {
    rules = await ruleRepository.getRulesBySeverity(severity);
  } else if (enabled !== undefined) {
    rules = enabled === 'true' 
      ? await ruleRepository.getEnabledRules()
      : await ruleRepository.getAllRules();
    if (enabled === 'false') {
      rules = rules.filter(r => !r.enabled);
    }
  } else {
    rules = await ruleRepository.getAllRules();
  }

  return buildResponse(200, { rules, count: rules.length });
}

async function handlePostRequest(
  pathParameters: Record<string, string | undefined>,
  body: any,
  user: any
): Promise<APIGatewayProxyResult> {
  const action = pathParameters.action;

  if (action === 'validate') {
    // Validate an artifact using the rules engine
    const request: ArtifactValidationRequest = {
      artifact_id: body.artifact_id || `temp-${Date.now()}`,
      artifact_type: body.artifact_type,
      content: body.content,
      file_path: body.file_path,
      metadata: body.metadata
    };

    if (!request.artifact_type || !request.content) {
      return buildErrorResponse(400, 'artifact_type and content are required', '');
    }

    const report = await rulesEngine.validateArtifact(request);
    return buildResponse(200, report);
  }

  if (action === 'bulk-create') {
    // Bulk create rules
    const rules = body.rules;
    if (!Array.isArray(rules)) {
      return buildErrorResponse(400, 'rules must be an array', '');
    }

    const createdRules = await ruleRepository.bulkCreateRules(rules);
    return buildResponse(201, { created_rules: createdRules, count: createdRules.length });
  }

  // Create a new rule
  const ruleData = body;
  
  // Validate required fields
  if (!ruleData.id || !ruleData.name || !ruleData.type || !ruleData.severity) {
    return buildErrorResponse(400, 'Missing required fields: id, name, type, severity', '');
  }

  // Validate rule definition against schema
  const validation = rulesEngine.validateRuleDefinition(ruleData);
  if (!validation.valid) {
    return buildErrorResponse(400, `Rule validation failed: ${validation.errors.join(', ')}`, '');
  }

  const rule = await ruleRepository.createRule(ruleData);
  
  logger.info('Rule created', { ruleId: rule.id, userId: user.userId });
  return buildResponse(201, rule);
}

async function handlePutRequest(
  pathParameters: Record<string, string | undefined>,
  body: any,
  user: any
): Promise<APIGatewayProxyResult> {
  const ruleId = pathParameters.ruleId;
  const action = pathParameters.action;

  if (!ruleId) {
    return buildErrorResponse(400, 'Rule ID is required', '');
  }

  if (action === 'toggle') {
    // Toggle rule enabled/disabled
    const enabled = body.enabled;
    if (typeof enabled !== 'boolean') {
      return buildErrorResponse(400, 'enabled must be a boolean', '');
    }

    const rule = await ruleRepository.toggleRule(ruleId, enabled);
    logger.info('Rule toggled', { ruleId, enabled, userId: user.userId });
    return buildResponse(200, rule);
  }

  // Update rule
  const updates = body;
  delete updates.id; // Don't allow ID changes
  delete updates.created_at; // Don't allow created_at changes

  // Validate updates if schema is provided
  if (updates.config && updates.schema) {
    const tempRule = { ...updates, id: ruleId } as RuleDefinition;
    const validation = rulesEngine.validateRuleDefinition(tempRule);
    if (!validation.valid) {
      return buildErrorResponse(400, `Rule validation failed: ${validation.errors.join(', ')}`, '');
    }
  }

  const rule = await ruleRepository.updateRule(ruleId, updates);
  
  logger.info('Rule updated', { ruleId, userId: user.userId });
  return buildResponse(200, rule);
}

async function handleDeleteRequest(
  pathParameters: Record<string, string | undefined>,
  user: any
): Promise<APIGatewayProxyResult> {
  const ruleId = pathParameters.ruleId;

  if (!ruleId) {
    return buildErrorResponse(400, 'Rule ID is required', '');
  }

  await ruleRepository.deleteRule(ruleId);
  
  logger.info('Rule deleted', { ruleId, userId: user.userId });
  return buildResponse(204, null);
}