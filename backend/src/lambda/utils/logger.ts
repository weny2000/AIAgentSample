export interface LogContext {
  correlationId: string;
  userId?: string;
  teamId?: string;
  operation?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  stage?: string;
  functionName?: string;
  functionVersion?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context: LogContext;
  data?: Record<string, any>;
  duration?: number;
  errorType?: string;
  retryAttempt?: number;
}

export class Logger {
  private context: LogContext;
  private startTime: number;

  constructor(context: LogContext) {
    // Extract X-Ray trace information
    const xrayTraceId = process.env._X_AMZN_TRACE_ID;
    let traceId = context.traceId;
    let spanId = context.spanId;
    let parentSpanId = context.parentSpanId;

    if (xrayTraceId) {
      const parts = xrayTraceId.split(';');
      traceId = traceId || parts.find(p => p.startsWith('Root='))?.replace('Root=', '');
      spanId = spanId || parts.find(p => p.startsWith('Self='))?.replace('Self=', '');
      parentSpanId = parentSpanId || parts.find(p => p.startsWith('Parent='))?.replace('Parent=', '');
    }

    this.context = {
      ...context,
      traceId,
      spanId,
      parentSpanId,
      stage: context.stage || process.env.STAGE,
      functionName: context.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME,
      functionVersion: context.functionVersion || process.env.AWS_LAMBDA_FUNCTION_VERSION,
      // Add AWS request ID from Lambda context
      awsRequestId: context.requestId || process.env.AWS_REQUEST_ID,
    };
    this.startTime = Date.now();
  }

  private log(level: string, message: string, data?: Record<string, any>, options?: { 
    duration?: number; 
    errorType?: string; 
    retryAttempt?: number;
  }): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
      ...options,
    };

    // Add structured fields for CloudWatch Insights queries
    if (level === 'ERROR' && data) {
      logEntry.errorType = options?.errorType || this.classifyError(data);
    }

    console.log(JSON.stringify(logEntry));

    // Send custom CloudWatch metrics for errors
    if (level === 'ERROR') {
      this.sendErrorMetric(options?.errorType || 'UnknownError', data);
    }
  }

  info(message: string, data?: Record<string, any>): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: Error | Record<string, any>, options?: { 
    errorType?: string; 
    retryAttempt?: number;
  }): void {
    const errorData = error instanceof Error 
      ? { 
          name: error.name, 
          message: error.message, 
          stack: error.stack,
          code: (error as any).code,
          statusCode: (error as any).statusCode,
        }
      : error;
    
    this.log('ERROR', message, errorData, options);
  }

  debug(message: string, data?: Record<string, any>): void {
    if (process.env.LOG_LEVEL === 'DEBUG') {
      this.log('DEBUG', message, data);
    }
  }

  // Performance logging
  performance(message: string, data?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;
    this.log('INFO', message, data, { duration });
  }

  // Retry logging
  retry(message: string, attempt: number, error?: Error | Record<string, any>): void {
    const errorData = error instanceof Error 
      ? { 
          name: error.name, 
          message: error.message, 
          code: (error as any).code,
        }
      : error;
    
    this.log('WARN', message, errorData, { retryAttempt: attempt });
  }

  withContext(additionalContext: Record<string, any>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  // Create child logger for nested operations
  child(operation: string, additionalContext?: Record<string, any>): Logger {
    return new Logger({
      ...this.context,
      operation,
      ...additionalContext,
    });
  }

  private classifyError(errorData: any): string {
    if (!errorData) return 'UnknownError';
    
    const errorMessage = errorData.message || errorData.name || '';
    const errorCode = errorData.code || errorData.statusCode;

    // AWS SDK errors
    if (errorCode) {
      if (errorCode === 'ThrottlingException' || errorCode === 'TooManyRequestsException') {
        return 'ThrottlingError';
      }
      if (errorCode === 'AccessDenied' || errorCode === 'UnauthorizedOperation') {
        return 'AuthorizationError';
      }
      if (errorCode === 'ValidationException' || errorCode === 'InvalidParameterValue') {
        return 'ValidationError';
      }
      if (errorCode === 'ServiceUnavailable' || errorCode === 'InternalServerError') {
        return 'ServiceError';
      }
      if (errorCode === 'ResourceNotFound' || errorCode === 'NoSuchKey') {
        return 'NotFoundError';
      }
    }

    // HTTP status codes
    if (typeof errorCode === 'number') {
      if (errorCode >= 400 && errorCode < 500) {
        return 'ClientError';
      }
      if (errorCode >= 500) {
        return 'ServerError';
      }
    }

    // Error message patterns
    const lowerMessage = errorMessage.toLowerCase();
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return 'TimeoutError';
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return 'NetworkError';
    }
    if (lowerMessage.includes('memory') || lowerMessage.includes('out of memory')) {
      return 'MemoryError';
    }

    return 'ApplicationError';
  }

  private sendErrorMetric(errorType: string, errorData?: any): void {
    try {
      // Enhanced metric data with more dimensions for better analysis
      const metricData = {
        MetricName: 'LambdaErrors',
        Namespace: 'AiAgent/Lambda',
        Dimensions: [
          { Name: 'ErrorType', Value: errorType },
          { Name: 'Operation', Value: this.context.operation || 'Unknown' },
          { Name: 'FunctionName', Value: this.context.functionName || 'Unknown' },
          { Name: 'Stage', Value: this.context.stage || 'Unknown' },
          { Name: 'TeamId', Value: this.context.teamId || 'Unknown' },
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date().toISOString(),
      };

      // Log structured metric for CloudWatch Logs Insights
      console.log(JSON.stringify({
        level: 'METRIC',
        metricType: 'ERROR',
        metricData,
        context: this.context,
        errorDetails: errorData ? {
          name: errorData.name,
          message: errorData.message,
          code: errorData.code,
          statusCode: errorData.statusCode,
        } : undefined,
      }));

      // Also send business metrics if available
      if (this.context.operation && errorData) {
        this.sendBusinessMetric('OperationFailure', 1, {
          Operation: this.context.operation,
          ErrorType: errorType,
        });
      }
    } catch (metricError) {
      // Don't let metric logging failures affect the main operation
      console.error('Failed to send error metric:', metricError);
    }
  }

  private sendBusinessMetric(metricName: string, value: number, dimensions?: Record<string, string>): void {
    try {
      const businessMetricData = {
        MetricName: metricName,
        Namespace: 'AiAgent/Business',
        Dimensions: Object.entries(dimensions || {}).map(([name, value]) => ({ Name: name, Value: value })),
        Value: value,
        Unit: 'Count',
        Timestamp: new Date().toISOString(),
      };

      console.log(JSON.stringify({
        level: 'METRIC',
        metricType: 'BUSINESS',
        metricData: businessMetricData,
        context: this.context,
      }));
    } catch (metricError) {
      console.error('Failed to send business metric:', metricError);
    }
  }

  // Public method to send custom business metrics
  businessMetric(metricName: string, value: number, dimensions?: Record<string, string>): void {
    this.sendBusinessMetric(metricName, value, {
      ...dimensions,
      Operation: this.context.operation || 'Unknown',
      FunctionName: this.context.functionName || 'Unknown',
      Stage: this.context.stage || 'Unknown',
    });
  }
}