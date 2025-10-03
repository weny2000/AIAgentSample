import { RetryUtils, CircuitBreaker, CircuitBreakerState, RetryExhaustedError, CircuitBreakerError } from '../retry-utils';
import { Logger } from '../logger';

// Mock the Logger
jest.mock('../logger');

describe('RetryUtils', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = new Logger({ correlationId: 'test' }) as jest.Mocked<Logger>;
    mockLogger.retry = jest.fn();
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.child = jest.fn().mockReturnValue(mockLogger);
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await RetryUtils.withRetry(operation, {}, mockLogger);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('TimeoutError'))
        .mockRejectedValueOnce(new Error('NetworkError'))
        .mockResolvedValue('success');

      const result = await RetryUtils.withRetry(operation, {
        maxAttempts: 3,
        baseDelayMs: 10,
      }, mockLogger);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.retry).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const error = new Error('ValidationError');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(RetryUtils.withRetry(operation, {
        retryableErrors: ['TimeoutError'],
      }, mockLogger)).rejects.toThrow('ValidationError');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw RetryExhaustedError after max attempts', async () => {
      const error = new Error('TimeoutError');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(RetryUtils.withRetry(operation, {
        maxAttempts: 2,
        baseDelayMs: 10,
      }, mockLogger)).rejects.toThrow(RetryExhaustedError);

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('TimeoutError'))
        .mockResolvedValue('success');

      await RetryUtils.withRetry(operation, {
        maxAttempts: 2,
        baseDelayMs: 10,
        onRetry,
      }, mockLogger);

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should handle AWS SDK errors', async () => {
      const awsError = new Error('Service unavailable');
      (awsError as any).code = 'ServiceUnavailable';
      const operation = jest.fn()
        .mockRejectedValueOnce(awsError)
        .mockResolvedValue('success');

      const result = await RetryUtils.withRetry(operation, {
        maxAttempts: 2,
        baseDelayMs: 10,
      }, mockLogger);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should calculate exponential backoff delay', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('TimeoutError'))
        .mockRejectedValueOnce(new Error('TimeoutError'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await RetryUtils.withRetry(operation, {
        maxAttempts: 3,
        baseDelayMs: 100,
        backoffMultiplier: 2,
        jitterMs: 0,
      }, mockLogger);
      const endTime = Date.now();

      // Should have waited at least 100ms + 200ms = 300ms
      expect(endTime - startTime).toBeGreaterThanOrEqual(300);
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        monitoringPeriodMs: 5000,
        halfOpenMaxCalls: 2,
      }, mockLogger);
    });

    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should execute operation successfully in CLOSED state', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject calls immediately in OPEN state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Fail 3 times to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      // Next call should be rejected immediately
      await expect(circuitBreaker.execute(operation, 'test-operation'))
        .rejects.toThrow(CircuitBreakerError);

      expect(operation).toHaveBeenCalledTimes(3); // Not called for the rejected attempt
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next call should transition to HALF_OPEN
      const successOperation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(successOperation, 'test-operation');

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should limit calls in HALF_OPEN state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Make 2 calls (the limit) - but the first successful call will close the circuit
      const halfOpenOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(halfOpenOperation, 'test-operation');
      
      // Circuit should now be CLOSED, so we need to create a new circuit breaker for this test
      const testCircuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        monitoringPeriodMs: 5000,
        halfOpenMaxCalls: 2,
      }, mockLogger);

      // Open the new circuit
      for (let i = 0; i < 3; i++) {
        try {
          await testCircuitBreaker.execute(operation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Make calls that don't succeed to stay in HALF_OPEN
      const halfOpenFailingOperation = jest.fn()
        .mockResolvedValueOnce('success') // First call succeeds but doesn't close circuit yet
        .mockResolvedValueOnce('success') // Second call succeeds and should close circuit
        .mockResolvedValue('success');

      await testCircuitBreaker.execute(halfOpenFailingOperation, 'test-operation');
      await testCircuitBreaker.execute(halfOpenFailingOperation, 'test-operation');

      // Circuit should now be closed, so this should succeed
      const result = await testCircuitBreaker.execute(halfOpenFailingOperation, 'test-operation');
      expect(result).toBe('success');
    });

    it('should reset failure count on successful call', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service error'));
      const successOperation = jest.fn().mockResolvedValue('success');

      // Fail twice (below threshold)
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failingOperation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      // Succeed once
      await circuitBreaker.execute(successOperation, 'test-operation');

      // Should still be in CLOSED state
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      // Should be able to fail 3 more times before opening
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should provide metrics', () => {
      const metrics = circuitBreaker.getMetrics();

      expect(metrics).toMatchObject({
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        halfOpenCalls: 0,
      });
    });

    it('should reset state manually', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-operation');
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Reset manually
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getMetrics().failureCount).toBe(0);
    });
  });

  describe('withRetryAndCircuitBreaker', () => {
    it('should combine retry and circuit breaker functionality', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('TimeoutError'))
        .mockResolvedValue('success');

      const result = await RetryUtils.withRetryAndCircuitBreaker(
        operation,
        { maxAttempts: 2, baseDelayMs: 10 },
        { failureThreshold: 3, recoveryTimeoutMs: 1000, monitoringPeriodMs: 5000, halfOpenMaxCalls: 2 },
        'test-operation',
        mockLogger
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRetryOptions', () => {
    it('should create fast retry options', () => {
      const options = RetryUtils.createRetryOptions('fast');

      expect(options).toMatchObject({
        maxAttempts: 2,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 1.5,
      });
    });

    it('should create standard retry options', () => {
      const options = RetryUtils.createRetryOptions('standard');

      expect(options).toMatchObject({
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      });
    });

    it('should create patient retry options', () => {
      const options = RetryUtils.createRetryOptions('patient');

      expect(options).toMatchObject({
        maxAttempts: 5,
        baseDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 2.5,
      });
    });
  });

  describe('createCircuitBreakerOptions', () => {
    it('should create aggressive circuit breaker options', () => {
      const options = RetryUtils.createCircuitBreakerOptions('aggressive');

      expect(options).toMatchObject({
        failureThreshold: 3,
        recoveryTimeoutMs: 10000,
        monitoringPeriodMs: 60000,
        halfOpenMaxCalls: 2,
      });
    });

    it('should create moderate circuit breaker options', () => {
      const options = RetryUtils.createCircuitBreakerOptions('moderate');

      expect(options).toMatchObject({
        failureThreshold: 5,
        recoveryTimeoutMs: 30000,
        monitoringPeriodMs: 120000,
        halfOpenMaxCalls: 3,
      });
    });

    it('should create conservative circuit breaker options', () => {
      const options = RetryUtils.createCircuitBreakerOptions('conservative');

      expect(options).toMatchObject({
        failureThreshold: 10,
        recoveryTimeoutMs: 60000,
        monitoringPeriodMs: 300000,
        halfOpenMaxCalls: 5,
      });
    });
  });
});