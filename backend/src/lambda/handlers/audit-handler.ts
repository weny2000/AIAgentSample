import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AuditService } from '../../services/audit-service';
import { createRepositoryFactory } from '../../repositories';
import { Logger } from '../utils/logger';
import { ResponseBuilder } from '../utils/response-builder';
import { ErrorMiddleware } from '../utils/error-middleware';
import { 
  CreateAuditLogInput, 
  QueryAuditLogParams, 
  SecurityEvent 
} from '../../models';

// Initialize repositories and services
const repositories = createRepositoryFactory({
  region: process.env.AWS_REGION || 'us-east-1',
  teamRosterTableName: process.env.TEAM_ROSTER_TABLE_NAME!,
  artifactTemplatesTableName: process.env.ARTIFACT_TEMPLATES_TABLE_NAME!,
  auditLogTableName: process.env.AUDIT_LOG_TABLE_NAME!,
  databaseConnection: {
    host: process.env.POSTGRES_HOST!,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE!,
    username: process.env.POSTGRES_USERNAME!,
    password: process.env.POSTGRES_PASSWORD!,
  },
});

const auditService = new AuditService({ repositories });

/**
 * Create audit log entry
 * POST /audit/logs
 */
export const createAuditLog = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'create-audit-log',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Creating audit log entry');

  if (!event.body) {
    return ResponseBuilder.badRequest('Request body is required');
  }

  const input: CreateAuditLogInput = JSON.parse(event.body);
  
  // Add request context from API Gateway
  input.request_context = {
    source_ip: event.requestContext.identity.sourceIp,
    user_agent: event.headers['User-Agent'],
    api_version: event.requestContext.stage,
    client_type: event.headers['X-Client-Type'] || 'web',
    correlation_id: event.requestContext.requestId,
    trace_id: event.headers['X-Amzn-Trace-Id'],
  };

  // Extract user info from authorizer
  if (event.requestContext.authorizer?.claims) {
    const claims = event.requestContext.authorizer.claims;
    input.user_id = input.user_id || claims.sub;
    input.user_role = input.user_role || claims['custom:role'];
    input.department = input.department || claims['custom:department'];
    input.team_id = input.team_id || claims['custom:team_id'];
  }

  const auditLog = await auditService.logAction(input);

  logger.info('Audit log entry created successfully', {
    request_id: auditLog.request_id,
    compliance_score: auditLog.compliance_score,
  });

  return ResponseBuilder.success(auditLog);
});

/**
 * Query audit logs
 * GET /audit/logs
 */
export const queryAuditLogs = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'query-audit-logs',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Querying audit logs');

  const params: QueryAuditLogParams = {
    user_id: event.queryStringParameters?.user_id,
    team_id: event.queryStringParameters?.team_id,
    action: event.queryStringParameters?.action,
    action_category: event.queryStringParameters?.action_category as any,
    start_timestamp: event.queryStringParameters?.start_timestamp,
    end_timestamp: event.queryStringParameters?.end_timestamp,
    compliance_score_min: event.queryStringParameters?.compliance_score_min ? 
      parseFloat(event.queryStringParameters.compliance_score_min) : undefined,
    compliance_score_max: event.queryStringParameters?.compliance_score_max ? 
      parseFloat(event.queryStringParameters.compliance_score_max) : undefined,
    security_event_severity: event.queryStringParameters?.security_event_severity as any,
    has_policy_violations: event.queryStringParameters?.has_policy_violations === 'true',
    data_classification: event.queryStringParameters?.data_classification as any,
    limit: event.queryStringParameters?.limit ? 
      parseInt(event.queryStringParameters.limit) : undefined,
    last_evaluated_key: event.queryStringParameters?.last_evaluated_key ? 
      JSON.parse(event.queryStringParameters.last_evaluated_key) : undefined,
  };

  const response = await auditService.queryAuditLogs(params);

  logger.info('Audit logs queried successfully', {
    count: response.count,
    has_more: !!response.lastEvaluatedKey,
  });

  return ResponseBuilder.success(response);
});

/**
 * Get audit statistics
 * GET /audit/statistics
 */
export const getAuditStatistics = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'get-audit-statistics',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Getting audit statistics');

  const startTimestamp = event.queryStringParameters?.start_timestamp;
  const endTimestamp = event.queryStringParameters?.end_timestamp;

  const statistics = await auditService.getAuditStatistics(startTimestamp, endTimestamp);

  logger.info('Audit statistics retrieved successfully', {
    total_entries: statistics.totalEntries,
    avg_compliance_score: statistics.averageComplianceScore,
  });

  return ResponseBuilder.success(statistics);
});

/**
 * Get security events
 * GET /audit/security-events
 */
export const getSecurityEvents = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'get-security-events',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Getting security events');

  const severity = event.queryStringParameters?.severity as 'low' | 'medium' | 'high' | 'critical' | undefined;
  const startTimestamp = event.queryStringParameters?.start_timestamp;
  const endTimestamp = event.queryStringParameters?.end_timestamp;
  const limit = event.queryStringParameters?.limit ? 
    parseInt(event.queryStringParameters.limit) : undefined;

  const securityEvents = await auditService.getSecurityEvents(
    severity,
    startTimestamp,
    endTimestamp,
    limit
  );

  logger.info('Security events retrieved successfully', {
    count: securityEvents.length,
    severity_filter: severity,
  });

  return ResponseBuilder.success(securityEvents);
});

/**
 * Generate compliance report
 * POST /audit/compliance-report
 */
export const generateComplianceReport = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'generate-compliance-report',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Generating compliance report');

  if (!event.body) {
    return ResponseBuilder.badRequest('Request body is required');
  }

  const { start_date, end_date, include_recommendations = true } = JSON.parse(event.body);

  if (!start_date || !end_date) {
    return ResponseBuilder.badRequest('start_date and end_date are required');
  }

  const generatedBy = event.requestContext.authorizer?.claims?.sub || 'system';

  const report = await auditService.generateComplianceReport(
    start_date,
    end_date,
    generatedBy,
    include_recommendations
  );

  logger.info('Compliance report generated successfully', {
    report_id: report.report_id,
    total_actions: report.summary.total_actions,
    avg_compliance_score: report.summary.average_compliance_score,
  });

  return ResponseBuilder.success(report);
});

/**
 * Log security event
 * POST /audit/security-event
 */
export const logSecurityEvent = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'log-security-event',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Logging security event');

  if (!event.body) {
    return ResponseBuilder.badRequest('Request body is required');
  }

  const { base_input, security_event } = JSON.parse(event.body);

  if (!base_input || !security_event) {
    return ResponseBuilder.badRequest('base_input and security_event are required');
  }

  // Add request context
  base_input.request_context = {
    source_ip: event.requestContext.identity.sourceIp,
    user_agent: event.headers['User-Agent'],
    api_version: event.requestContext.stage,
    client_type: event.headers['X-Client-Type'] || 'web',
    correlation_id: event.requestContext.requestId,
    trace_id: event.headers['X-Amzn-Trace-Id'],
  };

  // Extract user info from authorizer
  if (event.requestContext.authorizer?.claims) {
    const claims = event.requestContext.authorizer.claims;
    base_input.user_id = base_input.user_id || claims.sub;
    base_input.user_role = base_input.user_role || claims['custom:role'];
    base_input.department = base_input.department || claims['custom:department'];
    base_input.team_id = base_input.team_id || claims['custom:team_id'];
  }

  const auditLog = await auditService.logSecurityEvent(base_input, security_event);

  logger.info('Security event logged successfully', {
    request_id: auditLog.request_id,
    event_type: security_event.event_type,
    severity: security_event.severity,
  });

  return ResponseBuilder.success(auditLog);
});

/**
 * Log policy violation
 * POST /audit/policy-violation
 */
export const logPolicyViolation = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'log-policy-violation',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Logging policy violation');

  if (!event.body) {
    return ResponseBuilder.badRequest('Request body is required');
  }

  const { base_input, violated_policies, violation_details } = JSON.parse(event.body);

  if (!base_input || !violated_policies || !violation_details) {
    return ResponseBuilder.badRequest('base_input, violated_policies, and violation_details are required');
  }

  // Add request context
  base_input.request_context = {
    source_ip: event.requestContext.identity.sourceIp,
    user_agent: event.headers['User-Agent'],
    api_version: event.requestContext.stage,
    client_type: event.headers['X-Client-Type'] || 'web',
    correlation_id: event.requestContext.requestId,
    trace_id: event.headers['X-Amzn-Trace-Id'],
  };

  // Extract user info from authorizer
  if (event.requestContext.authorizer?.claims) {
    const claims = event.requestContext.authorizer.claims;
    base_input.user_id = base_input.user_id || claims.sub;
    base_input.user_role = base_input.user_role || claims['custom:role'];
    base_input.department = base_input.department || claims['custom:department'];
    base_input.team_id = base_input.team_id || claims['custom:team_id'];
  }

  const auditLog = await auditService.logPolicyViolation(
    base_input,
    violated_policies,
    violation_details
  );

  logger.info('Policy violation logged successfully', {
    request_id: auditLog.request_id,
    violated_policies: violated_policies,
  });

  return ResponseBuilder.success(auditLog);
});

/**
 * Log data access
 * POST /audit/data-access
 */
export const logDataAccess = ErrorMiddleware.wrap(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'log-data-access',
    userId: event.requestContext.authorizer?.claims?.sub,
  });

  logger.info('Logging data access');

  if (!event.body) {
    return ResponseBuilder.badRequest('Request body is required');
  }

  const { base_input, data_classification, pii_detected = false } = JSON.parse(event.body);

  if (!base_input || !data_classification) {
    return ResponseBuilder.badRequest('base_input and data_classification are required');
  }

  // Add request context
  base_input.request_context = {
    source_ip: event.requestContext.identity.sourceIp,
    user_agent: event.headers['User-Agent'],
    api_version: event.requestContext.stage,
    client_type: event.headers['X-Client-Type'] || 'web',
    correlation_id: event.requestContext.requestId,
    trace_id: event.headers['X-Amzn-Trace-Id'],
  };

  // Extract user info from authorizer
  if (event.requestContext.authorizer?.claims) {
    const claims = event.requestContext.authorizer.claims;
    base_input.user_id = base_input.user_id || claims.sub;
    base_input.user_role = base_input.user_role || claims['custom:role'];
    base_input.department = base_input.department || claims['custom:department'];
    base_input.team_id = base_input.team_id || claims['custom:team_id'];
  }

  const auditLog = await auditService.logDataAccess(
    base_input,
    data_classification,
    pii_detected
  );

  logger.info('Data access logged successfully', {
    request_id: auditLog.request_id,
    data_classification: data_classification,
    pii_detected: pii_detected,
  });

  return ResponseBuilder.success(auditLog);
});