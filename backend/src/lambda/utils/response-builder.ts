import { APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from '../types';

export interface ErrorContext {
  correlationId?: string;
  traceId?: string;
  requestId?: string;
  userId?: string;
  operation?: string;
  retryable?: boolean;
  retryAfter?: number;
}

export class ResponseBuilder {
  private static readonly DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // Will be restricted in production
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-ID',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  static success<T>(
    data: T, 
    statusCode: number = 200, 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    const headers = { ...this.DEFAULT_HEADERS };
    
    if (context?.correlationId) {
      headers['X-Correlation-ID'] = context.correlationId;
    }
    if (context?.traceId) {
      headers['X-Trace-ID'] = context.traceId;
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify(data),
    };
  }

  static error(
    errorCode: string,
    message: string,
    statusCode: number = 400,
    details?: Record<string, any>,
    context?: ErrorContext
  ): APIGatewayProxyResult {
    const correlationId = context?.correlationId || this.generateCorrelationId();
    
    const errorResponse: ErrorResponse = {
      errorCode,
      message,
      details: this.sanitizeErrorDetails(details),
      correlationId,
      retryAfter: context?.retryAfter,
    };

    const headers = { ...this.DEFAULT_HEADERS };
    headers['X-Correlation-ID'] = correlationId;
    
    if (context?.traceId) {
      headers['X-Trace-ID'] = context.traceId;
    }
    if (context?.retryAfter) {
      headers['Retry-After'] = context.retryAfter.toString();
    }

    // Add cache headers for error responses
    if (statusCode >= 500) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    } else if (statusCode === 404) {
      headers['Cache-Control'] = 'public, max-age=60'; // Cache 404s briefly
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify(errorResponse),
    };
  }

  static badRequest(
    message: string, 
    details?: Record<string, any>, 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('BAD_REQUEST', message, 400, details, context);
  }

  static unauthorized(
    message: string = 'Unauthorized', 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('UNAUTHORIZED', message, 401, undefined, context);
  }

  static forbidden(
    message: string = 'Forbidden', 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('FORBIDDEN', message, 403, undefined, context);
  }

  static notFound(
    message: string = 'Resource not found', 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('NOT_FOUND', message, 404, undefined, context);
  }

  static conflict(
    message: string = 'Resource conflict', 
    details?: Record<string, any>, 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('CONFLICT', message, 409, details, context);
  }

  static unprocessableEntity(
    message: string = 'Unprocessable entity', 
    details?: Record<string, any>, 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('UNPROCESSABLE_ENTITY', message, 422, details, context);
  }

  static tooManyRequests(
    message: string = 'Too many requests', 
    retryAfter: number = 60, 
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('TOO_MANY_REQUESTS', message, 429, undefined, {
      ...context,
      retryAfter,
      retryable: true,
    });
  }

  static internalError(
    message: string = 'Internal server error',
    details?: Record<string, any>,
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('INTERNAL_ERROR', message, 500, details, context);
  }

  static badGateway(
    message: string = 'Bad gateway',
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('BAD_GATEWAY', message, 502, undefined, {
      ...context,
      retryable: true,
    });
  }

  static serviceUnavailable(
    message: string = 'Service temporarily unavailable',
    retryAfter: number = 60,
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('SERVICE_UNAVAILABLE', message, 503, undefined, {
      ...context,
      retryAfter,
      retryable: true,
    });
  }

  static gatewayTimeout(
    message: string = 'Gateway timeout',
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error('GATEWAY_TIMEOUT', message, 504, undefined, {
      ...context,
      retryable: true,
    });
  }

  // Handle AWS SDK errors with appropriate HTTP status codes
  static fromAwsError(
    error: any, 
    defaultMessage: string = 'AWS service error',
    context?: ErrorContext
  ): APIGatewayProxyResult {
    const errorCode = error.name || error.code || 'AWS_ERROR';
    const message = error.message || defaultMessage;
    
    // Map AWS error codes to HTTP status codes
    const statusCodeMap: Record<string, number> = {
      'ValidationException': 400,
      'InvalidParameterValue': 400,
      'MalformedPolicyDocument': 400,
      'InvalidRequest': 400,
      'UnauthorizedOperation': 401,
      'AccessDenied': 403,
      'Forbidden': 403,
      'ResourceNotFound': 404,
      'NoSuchKey': 404,
      'NoSuchBucket': 404,
      'ResourceConflict': 409,
      'ConditionalCheckFailed': 409,
      'ThrottlingException': 429,
      'TooManyRequestsException': 429,
      'ProvisionedThroughputExceeded': 429,
      'InternalServerError': 500,
      'ServiceUnavailable': 503,
      'RequestTimeout': 504,
    };

    const statusCode = statusCodeMap[errorCode] || 500;
    const retryable = [429, 500, 502, 503, 504].includes(statusCode);
    
    let retryAfter: number | undefined;
    if (retryable) {
      // Calculate exponential backoff retry delay
      retryAfter = Math.min(60, Math.pow(2, (context as any)?.retryAttempt || 0) * 2);
    }

    return this.error(
      errorCode,
      message,
      statusCode,
      { 
        awsErrorCode: error.code,
        awsRequestId: error.$metadata?.requestId,
      },
      {
        ...context,
        retryable,
        retryAfter,
      }
    );
  }

  // Create standardized validation error response
  static validationError(
    field: string,
    message: string,
    context?: ErrorContext
  ): APIGatewayProxyResult {
    return this.error(
      'VALIDATION_ERROR',
      `Validation failed for field: ${field}`,
      400,
      { field, validationMessage: message },
      context
    );
  }

  // Create standardized rate limit error response
  static rateLimitError(
    limit: number,
    windowSeconds: number,
    context?: ErrorContext
  ): APIGatewayProxyResult {
    const retryAfter = windowSeconds;
    return this.error(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded. Maximum ${limit} requests per ${windowSeconds} seconds.`,
      429,
      { limit, windowSeconds },
      { ...context, retryAfter, retryable: true }
    );
  }

  private static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private static sanitizeErrorDetails(details?: Record<string, any>): Record<string, any> | undefined {
    if (!details) return undefined;

    // Remove sensitive information from error details
    const sanitized = { ...details };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'credential'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}