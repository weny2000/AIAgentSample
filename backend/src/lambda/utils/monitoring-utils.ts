import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { Logger } from './logger';

// X-Ray SDK for tracing
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

export interface MetricData {
  metricName: string;
  value: number;
  unit: 'Count' | 'Seconds' | 'Milliseconds' | 'Bytes' | 'Percent';
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  errorType?: string;
  metadata?: Record<string, any>;
}

export class MonitoringUtils {
  private static cloudWatchClient = AWSXRay.captureAWSv3Client(new CloudWatchClient({
    region: process.env.AWS_REGION,
  }));

  private static readonly NAMESPACE = 'AiAgent/Lambda';
  private static readonly BATCH_SIZE = 20; // CloudWatch limit

  static async putMetric(
    metric: MetricData,
    logger?: Logger
  ): Promise<void> {
    try {
      const metricDatum: MetricDatum = {
        MetricName: metric.metricName,
        Value: metric.value,
        Unit: metric.unit,
        Timestamp: metric.timestamp || new Date(),
      };

      if (metric.dimensions) {
        metricDatum.Dimensions = Object.entries(metric.dimensions).map(([name, value]) => ({
          Name: name,
          Value: value,
        }));
      }

      await this.cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: this.NAMESPACE,
        MetricData: [metricDatum],
      }));

      logger?.debug('Metric sent to CloudWatch', {
        metricName: metric.metricName,
        value: metric.value,
        dimensions: metric.dimensions,
      });

    } catch (error) {
      logger?.error('Failed to send metric to CloudWatch', error as Error);
      // Don't throw - metrics failures shouldn't break the main operation
    }
  }

  static async putMetrics(
    metrics: MetricData[],
    logger?: Logger
  ): Promise<void> {
    try {
      // Process metrics in batches due to CloudWatch limits
      for (let i = 0; i < metrics.length; i += this.BATCH_SIZE) {
        const batch = metrics.slice(i, i + this.BATCH_SIZE);
        
        const metricData: MetricDatum[] = batch.map(metric => ({
          MetricName: metric.metricName,
          Value: metric.value,
          Unit: metric.unit,
          Timestamp: metric.timestamp || new Date(),
          Dimensions: metric.dimensions ? Object.entries(metric.dimensions).map(([name, value]) => ({
            Name: name,
            Value: value,
          })) : undefined,
        }));

        await this.cloudWatchClient.send(new PutMetricDataCommand({
          Namespace: this.NAMESPACE,
          MetricData: metricData,
        }));
      }

      logger?.debug('Metrics batch sent to CloudWatch', {
        metricsCount: metrics.length,
        batches: Math.ceil(metrics.length / this.BATCH_SIZE),
      });

    } catch (error) {
      logger?.error('Failed to send metrics batch to CloudWatch', error as Error);
    }
  }

  static async recordPerformance(
    performanceMetric: PerformanceMetric,
    logger?: Logger
  ): Promise<void> {
    const baseDimensions = {
      Operation: performanceMetric.operation,
      Success: performanceMetric.success.toString(),
    };

    if (performanceMetric.errorType) {
      baseDimensions['ErrorType'] = performanceMetric.errorType;
    }

    // Add metadata as dimensions (limited to avoid cardinality issues)
    if (performanceMetric.metadata) {
      const allowedMetadataKeys = ['teamId', 'userId', 'artifactType', 'stage'];
      for (const key of allowedMetadataKeys) {
        if (performanceMetric.metadata[key]) {
          baseDimensions[key] = String(performanceMetric.metadata[key]);
        }
      }
    }

    const metrics: MetricData[] = [
      // Duration metric
      {
        metricName: 'OperationDuration',
        value: performanceMetric.duration,
        unit: 'Milliseconds',
        dimensions: baseDimensions,
      },
      // Success/failure count
      {
        metricName: performanceMetric.success ? 'OperationSuccess' : 'OperationFailure',
        value: 1,
        unit: 'Count',
        dimensions: baseDimensions,
      },
      // Overall operation count
      {
        metricName: 'OperationCount',
        value: 1,
        unit: 'Count',
        dimensions: baseDimensions,
      },
    ];

    // Add error-specific metrics
    if (!performanceMetric.success && performanceMetric.errorType) {
      metrics.push({
        metricName: 'ErrorCount',
        value: 1,
        unit: 'Count',
        dimensions: {
          Operation: performanceMetric.operation,
          ErrorType: performanceMetric.errorType,
        },
      });
    }

    await this.putMetrics(metrics, logger);
  }

  static async recordRetryMetrics(
    operation: string,
    attempt: number,
    success: boolean,
    errorType?: string,
    logger?: Logger
  ): Promise<void> {
    const dimensions = {
      Operation: operation,
      Attempt: attempt.toString(),
      Success: success.toString(),
    };

    if (errorType) {
      dimensions['ErrorType'] = errorType;
    }

    const metrics: MetricData[] = [
      {
        metricName: 'RetryAttempt',
        value: 1,
        unit: 'Count',
        dimensions,
      },
      {
        metricName: 'RetryAttemptNumber',
        value: attempt,
        unit: 'Count',
        dimensions: {
          Operation: operation,
          Success: success.toString(),
        },
      },
    ];

    if (success && attempt > 1) {
      metrics.push({
        metricName: 'RetrySuccess',
        value: 1,
        unit: 'Count',
        dimensions: {
          Operation: operation,
          FinalAttempt: attempt.toString(),
        },
      });
    }

    await this.putMetrics(metrics, logger);
  }

  static async recordCircuitBreakerMetrics(
    operation: string,
    state: 'OPEN' | 'CLOSED' | 'HALF_OPEN',
    failureCount: number,
    logger?: Logger
  ): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'CircuitBreakerState',
        value: state === 'OPEN' ? 1 : state === 'HALF_OPEN' ? 0.5 : 0,
        unit: 'Count',
        dimensions: {
          Operation: operation,
          State: state,
        },
      },
      {
        metricName: 'CircuitBreakerFailureCount',
        value: failureCount,
        unit: 'Count',
        dimensions: {
          Operation: operation,
        },
      },
    ];

    if (state === 'OPEN') {
      metrics.push({
        metricName: 'CircuitBreakerTripped',
        value: 1,
        unit: 'Count',
        dimensions: {
          Operation: operation,
        },
      });
    }

    await this.putMetrics(metrics, logger);
  }

  static async recordBusinessMetrics(
    metrics: {
      artifactChecksStarted?: number;
      artifactChecksCompleted?: number;
      artifactChecksFailed?: number;
      averageProcessingTime?: number;
      complianceScoreAverage?: number;
      criticalIssuesFound?: number;
      teamId?: string;
      artifactType?: string;
    },
    logger?: Logger
  ): Promise<void> {
    const metricData: MetricData[] = [];
    const baseDimensions: Record<string, string> = {};

    if (metrics.teamId) baseDimensions.TeamId = metrics.teamId;
    if (metrics.artifactType) baseDimensions.ArtifactType = metrics.artifactType;

    if (metrics.artifactChecksStarted !== undefined) {
      metricData.push({
        metricName: 'ArtifactChecksStarted',
        value: metrics.artifactChecksStarted,
        unit: 'Count',
        dimensions: baseDimensions,
      });
    }

    if (metrics.artifactChecksCompleted !== undefined) {
      metricData.push({
        metricName: 'ArtifactChecksCompleted',
        value: metrics.artifactChecksCompleted,
        unit: 'Count',
        dimensions: baseDimensions,
      });
    }

    if (metrics.artifactChecksFailed !== undefined) {
      metricData.push({
        metricName: 'ArtifactChecksFailed',
        value: metrics.artifactChecksFailed,
        unit: 'Count',
        dimensions: baseDimensions,
      });
    }

    if (metrics.averageProcessingTime !== undefined) {
      metricData.push({
        metricName: 'AverageProcessingTime',
        value: metrics.averageProcessingTime,
        unit: 'Milliseconds',
        dimensions: baseDimensions,
      });
    }

    if (metrics.complianceScoreAverage !== undefined) {
      metricData.push({
        metricName: 'ComplianceScoreAverage',
        value: metrics.complianceScoreAverage,
        unit: 'Percent',
        dimensions: baseDimensions,
      });
    }

    if (metrics.criticalIssuesFound !== undefined) {
      metricData.push({
        metricName: 'CriticalIssuesFound',
        value: metrics.criticalIssuesFound,
        unit: 'Count',
        dimensions: baseDimensions,
      });
    }

    if (metricData.length > 0) {
      await this.putMetrics(metricData, logger);
    }
  }

  // Utility method to create a performance timer
  static createTimer(operation: string): {
    stop: (success: boolean, errorType?: string, metadata?: Record<string, any>) => Promise<void>;
  } {
    const startTime = Date.now();

    return {
      stop: async (success: boolean, errorType?: string, metadata?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        await this.recordPerformance({
          operation,
          duration,
          success,
          errorType,
          metadata,
        });
      },
    };
  }

  // Utility method to wrap a function with performance monitoring and X-Ray tracing
  static withPerformanceMonitoring<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>,
    logger?: Logger
  ): Promise<T> {
    const timer = this.createTimer(operation);

    // Create X-Ray subsegment for the operation
    return AWSXRay.captureAsyncFunc(operation, async (subsegment: any) => {
      try {
        // Add annotations for filtering in X-Ray console
        if (subsegment) {
          subsegment.addAnnotation('operation', operation);
          subsegment.addAnnotation('stage', process.env.STAGE || 'unknown');
          
          if (metadata) {
            Object.entries(metadata).forEach(([key, value]) => {
              if (typeof value === 'string' || typeof value === 'number') {
                subsegment.addAnnotation(key, value);
              }
            });
          }

          // Add metadata for detailed analysis
          subsegment.addMetadata('monitoring', {
            startTime: Date.now(),
            metadata,
            correlationId: logger?.context?.correlationId,
          });
        }

        const result = await fn();
        
        if (subsegment) {
          subsegment.addMetadata('result', {
            success: true,
            endTime: Date.now(),
          });
        }

        await timer.stop(true, undefined, metadata);
        return result;
      } catch (error) {
        const errorType = error.name || error.constructor.name || 'UnknownError';
        
        if (subsegment) {
          subsegment.addMetadata('error', {
            errorType,
            errorMessage: error.message,
            errorStack: error.stack,
            endTime: Date.now(),
          });
          subsegment.addAnnotation('error', true);
          subsegment.addAnnotation('errorType', errorType);
        }

        await timer.stop(false, errorType, metadata);
        throw error;
      }
    });
  }

  // Health check metrics
  static async recordHealthCheck(
    service: string,
    healthy: boolean,
    responseTime: number,
    logger?: Logger
  ): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'HealthCheck',
        value: healthy ? 1 : 0,
        unit: 'Count',
        dimensions: {
          Service: service,
          Status: healthy ? 'Healthy' : 'Unhealthy',
        },
      },
      {
        metricName: 'HealthCheckResponseTime',
        value: responseTime,
        unit: 'Milliseconds',
        dimensions: {
          Service: service,
        },
      },
    ];

    await this.putMetrics(metrics, logger);
  }

  // X-Ray tracing utilities
  static addTraceAnnotation(key: string, value: string | number): void {
    try {
      const segment = AWSXRay.getSegment();
      if (segment) {
        segment.addAnnotation(key, value);
      }
    } catch (error) {
      // Silently fail if X-Ray is not available
    }
  }

  static addTraceMetadata(namespace: string, data: Record<string, any>): void {
    try {
      const segment = AWSXRay.getSegment();
      if (segment) {
        segment.addMetadata(namespace, data);
      }
    } catch (error) {
      // Silently fail if X-Ray is not available
    }
  }

  static createSubsegment<T>(
    name: string,
    fn: (subsegment: any) => Promise<T>
  ): Promise<T> {
    return AWSXRay.captureAsyncFunc(name, fn);
  }

  // Enhanced health check with X-Ray tracing
  static async recordHealthCheckWithTracing(
    service: string,
    healthCheckFn: () => Promise<boolean>,
    logger?: Logger
  ): Promise<void> {
    return this.createSubsegment(`health-check-${service}`, async (subsegment) => {
      const startTime = Date.now();
      let healthy = false;
      let error: Error | undefined;

      try {
        subsegment.addAnnotation('service', service);
        subsegment.addAnnotation('healthCheck', true);
        
        healthy = await healthCheckFn();
        
        subsegment.addAnnotation('healthy', healthy);
        subsegment.addMetadata('healthCheck', {
          service,
          healthy,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        error = err as Error;
        healthy = false;
        
        subsegment.addAnnotation('healthy', false);
        subsegment.addAnnotation('error', true);
        subsegment.addMetadata('error', {
          message: error.message,
          stack: error.stack,
        });
      }

      const responseTime = Date.now() - startTime;
      await this.recordHealthCheck(service, healthy, responseTime, logger);

      if (error) {
        throw error;
      }
    });
  }

  // Correlation ID utilities for distributed tracing
  static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static extractCorrelationId(event: any): string {
    // Try to extract from various event sources
    if (event.headers?.['x-correlation-id']) {
      return event.headers['x-correlation-id'];
    }
    if (event.headers?.['X-Correlation-ID']) {
      return event.headers['X-Correlation-ID'];
    }
    if (event.Records?.[0]?.messageAttributes?.correlationId?.stringValue) {
      return event.Records[0].messageAttributes.correlationId.stringValue;
    }
    if (event.correlationId) {
      return event.correlationId;
    }
    
    // Generate new correlation ID if not found
    return this.generateCorrelationId();
  }

  // Circuit breaker pattern with X-Ray tracing
  static async withCircuitBreaker<T>(
    operation: string,
    fn: () => Promise<T>,
    options: {
      failureThreshold?: number;
      recoveryTimeout?: number;
      logger?: Logger;
    } = {}
  ): Promise<T> {
    const {
      failureThreshold = 5,
      recoveryTimeout = 30000,
      logger,
    } = options;

    return this.createSubsegment(`circuit-breaker-${operation}`, async (subsegment) => {
      // This is a simplified circuit breaker implementation
      // In production, you'd want to use a more sophisticated implementation
      // with persistent state storage (Redis, DynamoDB, etc.)
      
      const circuitKey = `circuit-${operation}`;
      const failureCountKey = `failures-${operation}`;
      const lastFailureKey = `last-failure-${operation}`;

      // For this example, we'll use environment variables as a simple state store
      // In production, use a proper state store
      const currentFailures = parseInt(process.env[failureCountKey] || '0');
      const lastFailure = parseInt(process.env[lastFailureKey] || '0');
      const now = Date.now();

      subsegment.addAnnotation('circuitBreaker', true);
      subsegment.addAnnotation('operation', operation);
      subsegment.addAnnotation('failureCount', currentFailures);

      // Check if circuit is open
      if (currentFailures >= failureThreshold) {
        if (now - lastFailure < recoveryTimeout) {
          subsegment.addAnnotation('circuitState', 'OPEN');
          await this.recordCircuitBreakerMetrics(operation, 'OPEN', currentFailures, logger);
          throw new Error(`Circuit breaker is OPEN for operation: ${operation}`);
        } else {
          // Half-open state - try one request
          subsegment.addAnnotation('circuitState', 'HALF_OPEN');
          await this.recordCircuitBreakerMetrics(operation, 'HALF_OPEN', currentFailures, logger);
        }
      } else {
        subsegment.addAnnotation('circuitState', 'CLOSED');
        await this.recordCircuitBreakerMetrics(operation, 'CLOSED', currentFailures, logger);
      }

      try {
        const result = await fn();
        
        // Success - reset failure count
        process.env[failureCountKey] = '0';
        subsegment.addMetadata('circuitBreaker', {
          state: 'SUCCESS',
          failuresReset: true,
        });
        
        return result;
      } catch (error) {
        // Failure - increment failure count
        const newFailureCount = currentFailures + 1;
        process.env[failureCountKey] = newFailureCount.toString();
        process.env[lastFailureKey] = now.toString();
        
        subsegment.addMetadata('circuitBreaker', {
          state: 'FAILURE',
          newFailureCount,
          lastFailure: now,
        });
        
        await this.recordCircuitBreakerMetrics(operation, newFailureCount >= failureThreshold ? 'OPEN' : 'CLOSED', newFailureCount, logger);
        
        throw error;
      }
    });
  }
}