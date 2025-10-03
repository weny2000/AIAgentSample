import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Logger } from './logger';
import { ResponseBuilder, ErrorContext } from './response-builder';
import { RetryExhaustedError, CircuitBreakerError } from './retry-utils';

export interface ErrorHandlerOptions {
  enableDetailedErrors?: boolean;
  enableMetrics?: boolean;
  enableTracing?: boolean;
  sanitizeErrors?: boolean;
  correlationIdHeader?: string;
}

export interface LambdaContext extends Context {
  correlationId?: string;
  traceId?: string;
  userId?: string;
  teamId?: string;
  operation?: string;
}

export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: LambdaContext
) => Promise<APIGatewayProxyResult>;

export class ErrorMiddleware {
  private static readonly DEFAULT_OPTIONS: ErrorHandlerOptions = {
    enableDetailedErrors: process.env.NODE_ENV !== 'production',
    enableMetrics: true,
    enableTracing: true,
    sanitizeErrors: true,
    correlationIdHeader: 'X-Correlation-ID',
  };

  static wrap(
    handler: LambdaHandler,
    options: ErrorHandlerOptions = {}
  ): LambdaHandler {
    const config = { ...this.DEFAULT_OPTIONS, ...options };

    return async (event: APIGatewayProxyEvent, context: LambdaContext): Promise<APIGatewayProxyResult> => {
      // Extract correlation ID from headers or generate new one
      const correlationId = event.headers[config.correlationIdHeader!] || 
                           event.headers[config.correlationIdHeader!.toLowerCase()] ||
                           context.correlationId ||
                           this.generateCorrelationId();

      // Extract trace ID from X-Ray
      const traceId = context.traceId || 
                     process.env._X_AMZN_TRACE_ID?.split(';')[0]?.replace('Root=', '');

      // Extract operation name from function name or path
      const operation = context.functionName?.split('-').pop() || 
                       event.path?.split('/').pop() || 
                       'unknown';

      // Create enhanced context
      const enhancedContext: LambdaContext = {
        ...context,
        correlationId,
        traceId,
        operation,
      };

      // Create logger with full context
      const logger = new Logger({
        correlationId,
        traceId,
        operation,
        requestId: context.awsRequestId,
        functionName: context.functionName,
        functionVersion: context.functionVersion,
      });

      const startTime = Date.now();

      try {
        logger.info('Lambda invocation started', {
          httpMethod: event.httpMethod,
          path: event.path,
          userAgent: event.headers['User-Agent'],
          sourceIp: event.requestContext?.identity?.sourceIp,
          stage: event.requestContext?.stage,
        });

        // Execute the handler
        const result = await handler(event, enhancedContext);

        const duration = Date.now() - startTime;
        logger.performance('Lambda invocation completed successfully', {
          statusCode: result.statusCode,
          duration,
        });

        // Add correlation ID to response headers
        if (!result.headers) {
          result.headers = {};
        }
        result.headers['X-Correlation-ID'] = correlationId;
        if (traceId) {
          result.headers['X-Trace-ID'] = traceId;
        }

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorContext: ErrorContext = {
          correlationId,
          traceId,
          requestId: context.awsRequestId,
          operation,
        };

        logger.error('Lambda invocation failed', error as Error, {
          errorType: this.classifyError(error as Error),
        });

        logger.performance('Lambda invocation completed with error', {
          duration,
          error: (error as Error).name,
        });

        return this.handleError(error as Error, errorContext, config, logger);
      }
    };
  }

  private static handleError(
    error: Error,
    context: ErrorContext,
    options: ErrorHandlerOptions,
    logger: Logger
  ): APIGatewayProxyResult {
    // Handle specific error types
    if (error instanceof RetryExhaustedError) {
      return ResponseBuilder.serviceUnavailable(
        'Service temporarily unavailable after multiple retry attempts',
        60, // Retry after 60 seconds
        { ...context, retryable: true }
      );
    }

    if (error instanceof CircuitBreakerError) {
      return ResponseBuilder.serviceUnavailable(
        'Service temporarily unavailable due to circuit breaker',
        30, // Retry after 30 seconds
        { ...context, retryable: true }
      );
    }

    // Handle AWS SDK errors
    if (this.isAwsError(error)) {
      return ResponseBuilder.fromAwsError(error, undefined, context);
    }

    // Handle validation errors
    if (this.isValidationError(error)) {
      return ResponseBuilder.badRequest(
        error.message,
        options.enableDetailedErrors ? { stack: error.stack } : undefined,
        context
      );
    }

    // Handle authorization errors
    if (this.isAuthorizationError(error)) {
      return ResponseBuilder.unauthorized(error.message, context);
    }

    // Handle timeout errors
    if (this.isTimeoutError(error)) {
      return ResponseBuilder.gatewayTimeout(
        'Request timed out',
        { ...context, retryable: true }
      );
    }

    // Handle rate limiting errors
    if (this.isRateLimitError(error)) {
      return ResponseBuilder.tooManyRequests(
        'Rate limit exceeded',
        60,
        { ...context, retryable: true }
      );
    }

    // Handle network/connectivity errors
    if (this.isNetworkError(error)) {
      return ResponseBuilder.badGateway(
        'Network connectivity error',
        { ...context, retryable: true }
      );
    }

    // Default to internal server error
    const message = options.sanitizeErrors 
      ? 'An internal error occurred'
      : error.message;

    const details = options.enableDetailedErrors 
      ? { 
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined;

    return ResponseBuilder.internalError(message, details, context);
  }

  private static classifyError(error: Error): string {
    if (error instanceof RetryExhaustedError) return 'RetryExhausted';
    if (error instanceof CircuitBreakerError) return 'CircuitBreaker';
    if (this.isAwsError(error)) return 'AwsService';
    if (this.isValidationError(error)) return 'Validation';
    if (this.isAuthorizationError(error)) return 'Authorization';
    if (this.isTimeoutError(error)) return 'Timeout';
    if (this.isRateLimitError(error)) return 'RateLimit';
    if (this.isNetworkError(error)) return 'Network';
    return 'Application';
  }

  private static isAwsError(error: Error): boolean {
    return !!(error as any).$metadata || 
           !!(error as any).code ||
           error.name.includes('Exception') ||
           error.message.includes('AWS');
  }

  private static isValidationError(error: Error): boolean {
    const validationPatterns = [
      'validation',
      'invalid',
      'malformed',
      'bad request',
      'missing required',
      'schema',
    ];

    const message = error.message.toLowerCase();
    return validationPatterns.some(pattern => message.includes(pattern)) ||
           error.name.toLowerCase().includes('validation');
  }

  private static isAuthorizationError(error: Error): boolean {
    const authPatterns = [
      'unauthorized',
      'access denied',
      'forbidden',
      'authentication',
      'authorization',
      'permission',
      'credentials',
    ];

    const message = error.message.toLowerCase();
    return authPatterns.some(pattern => message.includes(pattern)) ||
           ['UnauthorizedError', 'ForbiddenError', 'AuthenticationError'].includes(error.name);
  }

  private static isTimeoutError(error: Error): boolean {
    const timeoutPatterns = [
      'timeout',
      'timed out',
      'time limit',
      'deadline',
    ];

    const message = error.message.toLowerCase();
    return timeoutPatterns.some(pattern => message.includes(pattern)) ||
           ['TimeoutError', 'RequestTimeout'].includes(error.name) ||
           (error as any).code === 'ETIMEDOUT';
  }

  private static isRateLimitError(error: Error): boolean {
    const rateLimitPatterns = [
      'rate limit',
      'throttling',
      'too many requests',
      'quota exceeded',
    ];

    const message = error.message.toLowerCase();
    return rateLimitPatterns.some(pattern => message.includes(pattern)) ||
           ['ThrottlingException', 'TooManyRequestsException'].includes(error.name) ||
           (error as any).statusCode === 429;
  }

  private static isNetworkError(error: Error): boolean {
    const networkPatterns = [
      'network',
      'connection',
      'econnreset',
      'enotfound',
      'econnrefused',
      'socket',
    ];

    const message = error.message.toLowerCase();
    return networkPatterns.some(pattern => message.includes(pattern)) ||
           ['NetworkError', 'ConnectionError'].includes(error.name);
  }

  private static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility method to extract user context from JWT token
  static extractUserContext(event: APIGatewayProxyEvent): {
    userId?: string;
    teamId?: string;
    role?: string;
    department?: string;
  } {
    try {
      const authorizer = event.requestContext?.authorizer;
      if (authorizer) {
        return {
          userId: authorizer.userId || authorizer.sub,
          teamId: authorizer.teamId || authorizer['custom:team_id'],
          role: authorizer.role || authorizer['custom:role'],
          department: authorizer.department || authorizer['custom:department'],
        };
      }
    } catch (error) {
      // Ignore extraction errors
    }

    return {};
  }

  // Utility method to validate required fields
  static validateRequiredFields(
    data: Record<string, any>,
    requiredFields: string[]
  ): string[] {
    const missingFields: string[] = [];
    
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        missingFields.push(field);
      }
    }

    return missingFields;
  }

  // Utility method to create standardized health check response
  static healthCheck(): APIGatewayProxyResult {
    return ResponseBuilder.success({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  }
}