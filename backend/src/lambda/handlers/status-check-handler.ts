import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CheckStatusResponse } from '../types';
import { ResponseBuilder } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { ErrorMiddleware, LambdaContext } from '../utils/error-middleware';
import { RetryUtils } from '../utils/retry-utils';
import { MonitoringUtils } from '../utils/monitoring-utils';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

const JOB_STATUS_TABLE = process.env.JOB_STATUS_TABLE!;

const statusCheckHandler = async (
  event: APIGatewayProxyEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResult> => {
  const correlationId = context.correlationId!;
  const logger = new Logger({ 
    correlationId, 
    operation: 'status-check',
    traceId: context.traceId,
    requestId: context.awsRequestId,
  });

  const timer = MonitoringUtils.createTimer('status-check-request');

  try {
    logger.info('Processing status check request', { 
      path: event.path,
      httpMethod: event.httpMethod 
    });

    // Extract user context from authorizer
    const userContext = ErrorMiddleware.extractUserContext(event);
    logger.info('User context extracted', { userId: userContext.userId, teamId: userContext.teamId });

    // Extract job ID from path parameters
    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      await timer.stop(false, 'ValidationError');
      return ResponseBuilder.badRequest('Job ID is required in path', undefined, {
        correlationId,
        traceId: context.traceId,
      });
    }

    logger.info('Checking status for job', { jobId });

    // Retrieve job status from DynamoDB with retry
    const result = await RetryUtils.withRetry(
      () => dynamoClient.send(new GetCommand({
        TableName: JOB_STATUS_TABLE,
        Key: { jobId },
      })),
      RetryUtils.createRetryOptions('fast'),
      logger.child('dynamodb-get')
    );

    if (!result.Item) {
      logger.warn('Job not found', { jobId });
      await timer.stop(false, 'NotFoundError');
      return ResponseBuilder.notFound('Job not found', {
        correlationId,
        traceId: context.traceId,
      });
    }

    const jobItem = result.Item;

    // Verify user has access to this job
    if (jobItem.userId !== userContext.userId && 
        !AuthUtils.canAccessTeam(userContext, jobItem.teamId)) {
      logger.warn('Access denied to job', { 
        jobId, 
        jobUserId: jobItem.userId, 
        jobTeamId: jobItem.teamId,
        requestUserId: userContext.userId,
        requestTeamId: userContext.teamId 
      });
      await timer.stop(false, 'AuthorizationError');
      return ResponseBuilder.forbidden('Access denied to this job', {
        correlationId,
        traceId: context.traceId,
      });
    }

    logger.info('Job status retrieved', { 
      jobId, 
      status: jobItem.status, 
      progress: jobItem.progress 
    });

    // Parse error information if present
    let errorInfo;
    if (jobItem.error) {
      try {
        errorInfo = typeof jobItem.error === 'string' ? JSON.parse(jobItem.error) : jobItem.error;
      } catch (parseError) {
        logger.warn('Failed to parse error information', { error: jobItem.error });
        errorInfo = { message: jobItem.error };
      }
    }

    // Build response
    const response: CheckStatusResponse = {
      jobId: jobItem.jobId,
      status: jobItem.status,
      progress: jobItem.progress || 0,
      currentStep: jobItem.currentStep,
      result: jobItem.result,
      error: errorInfo,
      createdAt: jobItem.createdAt,
      updatedAt: jobItem.updatedAt,
    };

    // Record metrics for status checks
    await MonitoringUtils.recordBusinessMetrics({
      teamId: userContext.teamId,
    }, logger);

    await timer.stop(true, undefined, {
      jobStatus: jobItem.status,
      teamId: userContext.teamId,
    });

    // Determine cache headers based on job status
    let cacheControl: string;
    if (jobItem.status === 'completed' || jobItem.status === 'failed') {
      // Cache completed/failed jobs for 5 minutes
      cacheControl = 'public, max-age=300';
    } else {
      // Don't cache in-progress jobs
      cacheControl = 'no-cache, no-store, must-revalidate';
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-ID',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Cache-Control': cacheControl,
        'X-Correlation-ID': correlationId,
        ...(context.traceId && { 'X-Trace-ID': context.traceId }),
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    await timer.stop(false, (error as Error).name);
    throw error; // Let the error middleware handle it
  }
};

// Wrap the handler with error middleware
export const handler = ErrorMiddleware.wrap(statusCheckHandler, {
  enableDetailedErrors: process.env.ENABLE_DETAILED_ERRORS === 'true',
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  enableTracing: process.env.ENABLE_TRACING === 'true',
});