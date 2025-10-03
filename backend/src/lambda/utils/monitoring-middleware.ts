import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Logger } from './logger';
import { MonitoringUtils } from './monitoring-utils';

export interface MonitoringConfig {
  enableMetrics?: boolean;
  enableTracing?: boolean;
  enableDetailedLogging?: boolean;
  operation?: string;
  businessMetrics?: string[];
}

export interface LambdaHandler<TEvent = any, TResult = any> {
  (event: TEvent, context: Context): Promise<TResult>;
}

export function withMonitoring<TEvent = any, TResult = any>(
  handler: LambdaHandler<TEvent, TResult>,
  config: MonitoringConfig = {}
): LambdaHandler<TEvent, TResult> {
  return async (event: TEvent, context: Context): Promise<TResult> => {
    const {
      enableMetrics = true,
      enableTracing = true,
      enableDetailedLogging = true,
      operation = context.functionName,
      businessMetrics = [],
    } = config;

    // Extract correlation ID from event
    const correlationId = MonitoringUtils.extractCorrelationId(event);
    
    // Create logger with enhanced context
    const logger = new Logger({
      correlationId,
      operation,
      requestId: context.awsRequestId,
      functionName: context.functionName,
      functionVersion: context.functionVersion,
      stage: process.env.STAGE,
      userId: extractUserId(event),
      teamId: extractTeamId(event),
    });

    // Add X-Ray annotations
    if (enableTracing) {
      MonitoringUtils.addTraceAnnotation('operation', operation);
      MonitoringUtils.addTraceAnnotation('stage', process.env.STAGE || 'unknown');
      MonitoringUtils.addTraceAnnotation('functionName', context.functionName);
      MonitoringUtils.addTraceAnnotation('correlationId', correlationId);
      
      const userId = extractUserId(event);
      const teamId = extractTeamId(event);
      if (userId) MonitoringUtils.addTraceAnnotation('userId', userId);
      if (teamId) MonitoringUtils.addTraceAnnotation('teamId', teamId);
    }

    const startTime = Date.now();
    let result: TResult;
    let error: Error | undefined;
    let statusCode: number | undefined;

    try {
      logger.info('Lambda invocation started', {
        event: enableDetailedLogging ? event : { type: typeof event },
        context: {
          functionName: context.functionName,
          functionVersion: context.functionVersion,
          memoryLimitInMB: context.memoryLimitInMB,
          remainingTimeInMillis: context.getRemainingTimeInMillis(),
        },
      });

      // Execute the handler with performance monitoring
      result = await MonitoringUtils.withPerformanceMonitoring(
        operation,
        () => handler(event, context),
        {
          functionName: context.functionName,
          userId: extractUserId(event),
          teamId: extractTeamId(event),
        },
        logger
      );

      // Extract status code for API Gateway responses
      if (isApiGatewayResponse(result)) {
        statusCode = result.statusCode;
      }

      const duration = Date.now() - startTime;
      
      logger.performance('Lambda invocation completed', {
        duration,
        statusCode,
        success: true,
        memoryUsed: process.memoryUsage(),
        remainingTime: context.getRemainingTimeInMillis(),
      });

      // Send business metrics
      if (enableMetrics) {
        await sendBusinessMetrics(operation, true, duration, statusCode, businessMetrics, logger);
      }

      // Add success metadata to X-Ray
      if (enableTracing) {
        MonitoringUtils.addTraceMetadata('response', {
          success: true,
          duration,
          statusCode,
          timestamp: new Date().toISOString(),
        });
      }

      return result;

    } catch (err) {
      error = err as Error;
      const duration = Date.now() - startTime;
      
      // Extract status code from error if it's an API Gateway error
      if (isApiGatewayError(error)) {
        statusCode = error.statusCode;
      }

      logger.error('Lambda invocation failed', error, {
        errorType: error.name || error.constructor.name,
      });

      // Send failure metrics
      if (enableMetrics) {
        await sendBusinessMetrics(operation, false, duration, statusCode, businessMetrics, logger, error);
      }

      // Add error metadata to X-Ray
      if (enableTracing) {
        MonitoringUtils.addTraceMetadata('error', {
          success: false,
          duration,
          statusCode,
          errorType: error.name,
          errorMessage: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      throw error;
    }
  };
}

// API Gateway specific monitoring wrapper
export function withApiGatewayMonitoring(
  handler: LambdaHandler<APIGatewayProxyEvent, APIGatewayProxyResult>,
  config: MonitoringConfig = {}
): LambdaHandler<APIGatewayProxyEvent, APIGatewayProxyResult> {
  return withMonitoring(handler, {
    ...config,
    enableDetailedLogging: config.enableDetailedLogging ?? false, // Reduce logging for API Gateway
    businessMetrics: [
      'ApiRequests',
      'ApiLatency',
      'ApiErrors',
      ...(config.businessMetrics || []),
    ],
  });
}

// SQS specific monitoring wrapper
export function withSqsMonitoring<TEvent = any, TResult = any>(
  handler: LambdaHandler<TEvent, TResult>,
  config: MonitoringConfig = {}
): LambdaHandler<TEvent, TResult> {
  return withMonitoring(handler, {
    ...config,
    businessMetrics: [
      'SqsMessagesProcessed',
      'SqsProcessingLatency',
      'SqsProcessingErrors',
      ...(config.businessMetrics || []),
    ],
  });
}

// Step Functions specific monitoring wrapper
export function withStepFunctionsMonitoring<TEvent = any, TResult = any>(
  handler: LambdaHandler<TEvent, TResult>,
  config: MonitoringConfig = {}
): LambdaHandler<TEvent, TResult> {
  return withMonitoring(handler, {
    ...config,
    businessMetrics: [
      'StepFunctionTasks',
      'StepFunctionLatency',
      'StepFunctionErrors',
      ...(config.businessMetrics || []),
    ],
  });
}

// Helper functions
function extractUserId(event: any): string | undefined {
  // Try various ways to extract user ID from different event types
  if (event.requestContext?.authorizer?.userId) {
    return event.requestContext.authorizer.userId;
  }
  if (event.requestContext?.authorizer?.claims?.sub) {
    return event.requestContext.authorizer.claims.sub;
  }
  if (event.headers?.['x-user-id']) {
    return event.headers['x-user-id'];
  }
  if (event.userId) {
    return event.userId;
  }
  return undefined;
}

function extractTeamId(event: any): string | undefined {
  // Try various ways to extract team ID from different event types
  if (event.requestContext?.authorizer?.teamId) {
    return event.requestContext.authorizer.teamId;
  }
  if (event.requestContext?.authorizer?.claims?.['custom:team_id']) {
    return event.requestContext.authorizer.claims['custom:team_id'];
  }
  if (event.headers?.['x-team-id']) {
    return event.headers['x-team-id'];
  }
  if (event.teamId) {
    return event.teamId;
  }
  return undefined;
}

function isApiGatewayResponse(result: any): result is APIGatewayProxyResult {
  return result && typeof result.statusCode === 'number';
}

function isApiGatewayError(error: any): error is Error & { statusCode: number } {
  return error && typeof error.statusCode === 'number';
}

async function sendBusinessMetrics(
  operation: string,
  success: boolean,
  duration: number,
  statusCode: number | undefined,
  businessMetrics: string[],
  logger: Logger,
  error?: Error
): Promise<void> {
  try {
    // Send standard metrics
    await MonitoringUtils.recordPerformance({
      operation,
      duration,
      success,
      errorType: error?.name,
      metadata: {
        statusCode,
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        stage: process.env.STAGE,
      },
    }, logger);

    // Send custom business metrics
    for (const metricName of businessMetrics) {
      logger.businessMetric(metricName, 1, {
        Success: success.toString(),
        StatusCode: statusCode?.toString() || 'unknown',
        ErrorType: error?.name || 'none',
      });
    }

    // Send API-specific metrics
    if (statusCode) {
      const statusClass = Math.floor(statusCode / 100);
      logger.businessMetric('HttpResponses', 1, {
        StatusCode: statusCode.toString(),
        StatusClass: `${statusClass}xx`,
        Operation: operation,
      });

      if (statusCode >= 400) {
        logger.businessMetric('HttpErrors', 1, {
          StatusCode: statusCode.toString(),
          ErrorType: error?.name || 'HttpError',
          Operation: operation,
        });
      }
    }

  } catch (metricError) {
    logger.error('Failed to send business metrics', metricError as Error);
  }
}

// Health check monitoring wrapper
export function withHealthCheckMonitoring(
  serviceName: string,
  healthCheckFn: () => Promise<boolean>
): () => Promise<{ statusCode: number; body: string }> {
  return async () => {
    const logger = new Logger({
      correlationId: MonitoringUtils.generateCorrelationId(),
      operation: 'health-check',
      serviceName,
    });

    try {
      const isHealthy = await MonitoringUtils.recordHealthCheckWithTracing(
        serviceName,
        healthCheckFn,
        logger
      );

      const response = {
        statusCode: isHealthy ? 200 : 503,
        body: JSON.stringify({
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: serviceName,
          timestamp: new Date().toISOString(),
        }),
      };

      logger.info('Health check completed', {
        service: serviceName,
        healthy: isHealthy,
        statusCode: response.statusCode,
      });

      return response;
    } catch (error) {
      logger.error('Health check failed', error as Error);
      
      return {
        statusCode: 503,
        body: JSON.stringify({
          status: 'unhealthy',
          service: serviceName,
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        }),
      };
    }
  };
}