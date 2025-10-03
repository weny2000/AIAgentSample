import { Logger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs?: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringPeriodMs: number;
  halfOpenMaxCalls: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class RetryExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`Retry exhausted after ${attempts} attempts. Last error: ${lastError.message}`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private readonly options: CircuitBreakerOptions;
  private readonly logger: Logger;

  constructor(options: CircuitBreakerOptions, logger: Logger) {
    this.options = options;
    this.logger = logger.child('circuit-breaker');
  }

  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.options.recoveryTimeoutMs) {
        this.logger.warn('Circuit breaker is OPEN, rejecting call', {
          operationName,
          failureCount: this.failureCount,
          timeSinceLastFailure: Date.now() - this.lastFailureTime,
        });
        throw new CircuitBreakerError(`Circuit breaker is OPEN for operation: ${operationName}`);
      } else {
        this.logger.info('Circuit breaker transitioning to HALF_OPEN', { operationName });
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCalls = 0;
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN && 
        this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
      this.logger.warn('Circuit breaker HALF_OPEN call limit exceeded', {
        operationName,
        halfOpenCalls: this.halfOpenCalls,
      });
      throw new CircuitBreakerError(`Circuit breaker HALF_OPEN call limit exceeded for operation: ${operationName}`);
    }

    try {
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.halfOpenCalls++;
      }

      const result = await operation();

      // Success - reset failure count and close circuit if half-open
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.logger.info('Circuit breaker transitioning to CLOSED after successful call', {
          operationName,
        });
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.halfOpenCalls = 0;
      }

      return result;

    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      this.logger.error('Circuit breaker recorded failure', error as Error, {
        errorType: 'CircuitBreakerFailure',
      });

      if (this.failureCount >= this.options.failureThreshold) {
        this.logger.warn('Circuit breaker transitioning to OPEN', {
          operationName,
          failureCount: this.failureCount,
          threshold: this.options.failureThreshold,
        });
        this.state = CircuitBreakerState.OPEN;
      }

      throw error;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenCalls: this.halfOpenCalls,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenCalls = 0;
    this.logger.info('Circuit breaker manually reset');
  }
}

export class RetryUtils {
  private static readonly DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterMs: 100,
    retryableErrors: [
      'TimeoutError',
      'NetworkError',
      'ServiceUnavailable',
      'ThrottlingException',
      'TooManyRequestsException',
      'InternalServerError',
      'BadGateway',
      'GatewayTimeout',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
    ],
  };

  static async withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    logger?: Logger
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_OPTIONS, ...options };
    const log = logger || new Logger({ correlationId: 'retry-utils', operation: 'retry' });

    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          log.info('Operation succeeded after retry', { 
            attempt, 
            totalAttempts: config.maxAttempts 
          });
        }
        
        return result;

      } catch (error) {
        lastError = error as Error;
        
        log.retry('Operation failed, checking if retryable', attempt, lastError);

        // Check if error is retryable
        if (!this.isRetryableError(lastError, config.retryableErrors)) {
          log.error('Error is not retryable, failing immediately', lastError);
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt === config.maxAttempts) {
          log.error('Max retry attempts reached', lastError);
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, config);
        
        log.info('Retrying operation after delay', { 
          attempt, 
          delayMs: delay, 
          nextAttempt: attempt + 1,
          maxAttempts: config.maxAttempts,
        });

        // Call retry callback if provided
        if (config.onRetry) {
          try {
            config.onRetry(attempt, lastError);
          } catch (callbackError) {
            log.warn('Retry callback failed', { 
              callbackError: callbackError instanceof Error ? callbackError.message : 'Unknown error'
            });
          }
        }

        await this.sleep(delay);
      }
    }

    throw new RetryExhaustedError(config.maxAttempts, lastError!);
  }

  static async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreaker: CircuitBreaker,
    operationName: string
  ): Promise<T> {
    return circuitBreaker.execute(operation, operationName);
  }

  static async withRetryAndCircuitBreaker<T>(
    operation: () => Promise<T>,
    retryOptions: Partial<RetryOptions> = {},
    circuitBreakerOptions: CircuitBreakerOptions,
    operationName: string,
    logger?: Logger
  ): Promise<T> {
    const log = logger || new Logger({ correlationId: 'retry-circuit-breaker', operation: operationName });
    const circuitBreaker = new CircuitBreaker(circuitBreakerOptions, log);

    return this.withRetry(
      () => circuitBreaker.execute(operation, operationName),
      retryOptions,
      log
    );
  }

  private static isRetryableError(error: Error, retryableErrors?: string[]): boolean {
    const errors = retryableErrors || this.DEFAULT_RETRY_OPTIONS.retryableErrors!;
    
    // Check error name/type
    if (errors.includes(error.name)) {
      return true;
    }

    // Check error code (for AWS SDK errors)
    const errorCode = (error as any).code;
    if (errorCode && errors.includes(errorCode)) {
      return true;
    }

    // Check error message patterns
    const message = error.message.toLowerCase();
    return errors.some(pattern => 
      message.includes(pattern.toLowerCase()) ||
      pattern.toLowerCase().includes(message)
    );
  }

  private static calculateDelay(attempt: number, options: RetryOptions): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay cap
    const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = options.jitterMs ? Math.random() * options.jitterMs : 0;
    
    return Math.floor(cappedDelay + jitter);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to create common circuit breaker configurations
  static createCircuitBreakerOptions(profile: 'aggressive' | 'moderate' | 'conservative'): CircuitBreakerOptions {
    const profiles = {
      aggressive: {
        failureThreshold: 3,
        recoveryTimeoutMs: 10000, // 10 seconds
        monitoringPeriodMs: 60000, // 1 minute
        halfOpenMaxCalls: 2,
      },
      moderate: {
        failureThreshold: 5,
        recoveryTimeoutMs: 30000, // 30 seconds
        monitoringPeriodMs: 120000, // 2 minutes
        halfOpenMaxCalls: 3,
      },
      conservative: {
        failureThreshold: 10,
        recoveryTimeoutMs: 60000, // 1 minute
        monitoringPeriodMs: 300000, // 5 minutes
        halfOpenMaxCalls: 5,
      },
    };

    return profiles[profile];
  }

  // Utility method to create common retry configurations
  static createRetryOptions(profile: 'fast' | 'standard' | 'patient'): RetryOptions {
    const profiles = {
      fast: {
        maxAttempts: 2,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 1.5,
        jitterMs: 100,
      },
      standard: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterMs: 200,
      },
      patient: {
        maxAttempts: 5,
        baseDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 2.5,
        jitterMs: 500,
      },
    };

    return { ...this.DEFAULT_RETRY_OPTIONS, ...profiles[profile] };
  }
}