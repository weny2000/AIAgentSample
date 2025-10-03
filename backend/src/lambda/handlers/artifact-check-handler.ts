import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ArtifactCheckRequest, JobResponse, ArtifactCheckMessage } from '../types';
import { ResponseBuilder } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { ErrorMiddleware, LambdaContext } from '../utils/error-middleware';
import { RetryUtils } from '../utils/retry-utils';
import { MonitoringUtils } from '../utils/monitoring-utils';
import { withApiGatewayMonitoring } from '../utils/monitoring-middleware';
import { AuditService } from '../../services/audit-service';
import { createRepositoryFactory } from '../../repositories';
import { CreateAuditLogInput } from '../../models';

const sfnClient = new SFNClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

const STEP_FUNCTION_ARN = process.env.ARTIFACT_CHECK_WORKFLOW_ARN!;
const JOB_STATUS_TABLE = process.env.JOB_STATUS_TABLE!;

// Initialize audit service
const repositories = createRepositoryFactory({
  region: process.env.AWS_REGION || 'us-east-1',
  teamRosterTableName: process.env.TEAM_ROSTER_TABLE_NAME!,
  artifactTemplatesTableName: process.env.ARTIFACT_TEMPLATES_TABLE_NAME!,
  auditLogTableName: process.env.AUDIT_LOG_TABLE_NAME!,
  postgresHost: process.env.POSTGRES_HOST!,
  postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
  postgresDatabase: process.env.POSTGRES_DATABASE!,
  postgresUsername: process.env.POSTGRES_USERNAME!,
  postgresPassword: process.env.POSTGRES_PASSWORD!,
});

const auditService = new AuditService({ repositories });

const artifactCheckHandler = async (
  event: APIGatewayProxyEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResult> => {
  const correlationId = context.correlationId!;
  const logger = new Logger({ 
    correlationId, 
    operation: 'artifact-check',
    traceId: context.traceId,
    requestId: context.awsRequestId,
  });

  const timer = MonitoringUtils.createTimer('artifact-check-request');

  try {
    logger.info('Processing artifact check request', { 
      path: event.path,
      httpMethod: event.httpMethod 
    });

    // Extract user context from authorizer
    const userContext = ErrorMiddleware.extractUserContext(event);
    logger.info('User context extracted', { userId: userContext.userId, teamId: userContext.teamId });

    // Parse request body
    if (!event.body) {
      await timer.stop(false, 'ValidationError');
      return ResponseBuilder.badRequest('Request body is required', undefined, {
        correlationId,
        traceId: context.traceId,
      });
    }

    let requestBody: ArtifactCheckRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      logger.error('Failed to parse request body', error as Error);
      await timer.stop(false, 'ValidationError');
      return ResponseBuilder.badRequest('Invalid JSON in request body', undefined, {
        correlationId,
        traceId: context.traceId,
      });
    }

    // Validate required fields
    const requiredFields = ['artifactType', 'userId', 'teamId'];
    const missingFields = ErrorMiddleware.validateRequiredFields(requestBody, requiredFields);
    
    if (missingFields.length > 0) {
      await timer.stop(false, 'ValidationError');
      return ResponseBuilder.badRequest(
        'Missing required fields',
        { missingFields },
        { correlationId, traceId: context.traceId }
      );
    }

    // Validate user can access the requested team
    if (!AuthUtils.canAccessTeam(userContext, requestBody.teamId)) {
      await timer.stop(false, 'AuthorizationError');
      return ResponseBuilder.forbidden('Access denied to team resources', {
        correlationId,
        traceId: context.traceId,
      });
    }

    // Validate artifact content or URL is provided
    if (!requestBody.artifactContent && !requestBody.artifactUrl) {
      await timer.stop(false, 'ValidationError');
      return ResponseBuilder.badRequest(
        'Either artifactContent or artifactUrl must be provided',
        undefined,
        { correlationId, traceId: context.traceId }
      );
    }

    // Generate job ID
    const jobId = uuidv4();
    const timestamp = new Date().toISOString();

    logger.info('Creating artifact check job', { jobId, artifactType: requestBody.artifactType });

    // Create job status record in DynamoDB with retry
    const jobStatusItem = {
      jobId,
      status: 'queued' as const,
      progress: 0,
      userId: userContext.userId!,
      teamId: userContext.teamId!,
      artifactType: requestBody.artifactType,
      createdAt: timestamp,
      updatedAt: timestamp,
      ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days TTL
      correlationId,
    };

    await RetryUtils.withRetry(
      () => dynamoClient.send(new PutCommand({
        TableName: JOB_STATUS_TABLE,
        Item: jobStatusItem,
      })),
      RetryUtils.createRetryOptions('fast'),
      logger.child('dynamodb-put')
    );

    // Start Step Functions workflow execution with retry
    const workflowInput = {
      jobId,
      artifactCheckRequest: requestBody,
      userContext,
      timestamp,
      correlationId,
    };

    const executionName = `artifact-check-${jobId}`;
    
    await RetryUtils.withRetry(
      () => sfnClient.send(new StartExecutionCommand({
        stateMachineArn: STEP_FUNCTION_ARN,
        name: executionName,
        input: JSON.stringify(workflowInput),
      })),
      RetryUtils.createRetryOptions('standard'),
      logger.child('step-functions-start')
    );

    logger.info('Artifact check workflow started successfully', { jobId, executionName });

    // Record business metrics
    await MonitoringUtils.recordBusinessMetrics({
      artifactChecksStarted: 1,
      teamId: userContext.teamId,
      artifactType: requestBody.artifactType,
    }, logger);

    // Log audit entry for artifact check request
    try {
      const auditInput: CreateAuditLogInput = {
        request_id: jobId,
        user_id: userContext.userId!,
        persona: 'system', // This would be determined by the actual persona system
        action: 'artifact-check-request',
        references: [
          {
            source_id: jobId,
            source_type: 'internal-policy',
            confidence_score: 1.0,
            snippet: `Artifact check requested for ${requestBody.artifactType}`,
          },
        ],
        result_summary: `Artifact check workflow started for ${requestBody.artifactType}`,
        compliance_score: 100, // Initial score, will be updated when check completes
        session_id: correlationId,
        team_id: userContext.teamId!,
        user_role: userContext.role,
        department: userContext.department,
        action_category: 'artifact_check',
        action_subcategory: 'workflow_start',
        compliance_flags: ['workflow_initiated'],
        performance_metrics: {
          execution_time_ms: timer.getElapsedTime(),
          api_calls_made: 2, // DynamoDB put + Step Functions start
          error_count: 0,
        },
        request_context: {
          source_ip: event.requestContext.identity.sourceIp,
          user_agent: event.headers['User-Agent'],
          api_version: event.requestContext.stage,
          client_type: event.headers['X-Client-Type'] || 'web',
          correlation_id: correlationId,
          trace_id: context.traceId,
        },
        business_context: {
          artifact_type: requestBody.artifactType,
          workflow_stage: 'initiation',
          approval_required: false,
        },
      };

      await auditService.logAction(auditInput);
      logger.info('Audit log entry created for artifact check request', { jobId });
    } catch (auditError) {
      // Don't fail the main operation if audit logging fails
      logger.error('Failed to create audit log entry', auditError as Error, { jobId });
    }

    // Calculate estimated completion time (rough estimate based on artifact type)
    const estimatedMinutes = getEstimatedProcessingTime(requestBody.artifactType);
    const estimatedCompletionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000).toISOString();

    const response: JobResponse = {
      jobId,
      status: 'queued',
      estimatedCompletionTime,
      message: 'Artifact check request has been queued for processing',
    };

    await timer.stop(true, undefined, {
      teamId: userContext.teamId,
      artifactType: requestBody.artifactType,
    });

    return ResponseBuilder.success(response, 202, {
      correlationId,
      traceId: context.traceId,
    });

  } catch (error) {
    await timer.stop(false, (error as Error).name);
    throw error; // Let the error middleware handle it
  }
};

// Wrap the handler with enhanced monitoring and error middleware
const monitoredHandler = withApiGatewayMonitoring(artifactCheckHandler, {
  operation: 'artifact-check',
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  enableTracing: process.env.ENABLE_TRACING === 'true',
  enableDetailedLogging: process.env.ENABLE_DETAILED_ERRORS === 'true',
  businessMetrics: [
    'ArtifactChecksStarted',
    'ArtifactCheckLatency',
    'WorkflowInitiations',
  ],
});

export const handler = ErrorMiddleware.wrap(monitoredHandler, {
  enableDetailedErrors: process.env.ENABLE_DETAILED_ERRORS === 'true',
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  enableTracing: process.env.ENABLE_TRACING === 'true',
});

function getEstimatedProcessingTime(artifactType: string): number {
  // Estimated processing time in minutes based on artifact type
  const timeEstimates: Record<string, number> = {
    'code': 2,
    'document': 1,
    'configuration': 1,
    'infrastructure': 3,
    'security-policy': 2,
    'api-spec': 2,
    'database-schema': 1,
    'deployment-manifest': 2,
  };

  return timeEstimates[artifactType] || 2; // Default to 2 minutes
}