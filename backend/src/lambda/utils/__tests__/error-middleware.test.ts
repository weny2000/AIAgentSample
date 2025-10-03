import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorMiddleware, LambdaContext } from '../error-middleware';
import { RetryExhaustedError, CircuitBreakerError } from '../retry-utils';

// Mock the Logger
jest.mock('../logger');

describe('ErrorMiddleware', () => {
  const mockContext: LambdaContext = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2023/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  const mockEvent: APIGatewayProxyEvent = {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      authorizer: {},
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      path: '/test',
      stage: 'test',
      requestId: 'test-request',
      requestTime: '01/Jan/2023:00:00:00 +0000',
      requestTimeEpoch: 1672531200,
      resourceId: 'test-resource',
      resourcePath: '/test',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
    },
    resource: '/test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env._X_AMZN_TRACE_ID = 'Root=1-5e1b4151-5ac6c58f5b5daa6f5b5daa6f';
  });

  describe('wrap', () => {
    it('should handle successful handler execution', async () => {
      const mockHandler = jest.fn().mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ success: true }),
      });

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.headers['X-Correlation-ID']).toBeDefined();
      expect(result.headers['X-Trace-ID']).toBeDefined();
      expect(mockHandler).toHaveBeenCalledWith(mockEvent, expect.objectContaining({
        ...mockContext,
        correlationId: expect.any(String),
        traceId: expect.any(String),
        operation: expect.any(String),
      }));
    });

    it('should handle RetryExhaustedError', async () => {
      const error = new RetryExhaustedError(3, new Error('Test error'));
      const mockHandler = jest.fn().mockRejectedValue(error);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(503);
      expect(result.headers['Retry-After']).toBe('60');
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable after multiple retry attempts',
      });
    });

    it('should handle CircuitBreakerError', async () => {
      const error = new CircuitBreakerError('Circuit breaker is OPEN');
      const mockHandler = jest.fn().mockRejectedValue(error);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(503);
      expect(result.headers['Retry-After']).toBe('30');
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable due to circuit breaker',
      });
    });

    it('should handle AWS SDK errors', async () => {
      const awsError = new Error('Access denied');
      (awsError as any).code = 'AccessDenied';
      (awsError as any).$metadata = { requestId: 'test-request-id' };

      const mockHandler = jest.fn().mockRejectedValue(awsError);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'AccessDenied',
        message: 'Access denied',
        details: {
          awsErrorCode: 'AccessDenied',
          awsRequestId: 'test-request-id',
        },
      });
    });

    it('should handle validation errors', async () => {
      const error = new Error('Invalid parameter value');
      const mockHandler = jest.fn().mockRejectedValue(error);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'BAD_REQUEST',
        message: 'Invalid parameter value',
      });
    });

    it('should handle timeout errors', async () => {
      const error = new Error('Request timed out');
      const mockHandler = jest.fn().mockRejectedValue(error);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(504);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'GATEWAY_TIMEOUT',
        message: 'Request timed out',
      });
    });

    it('should extract correlation ID from headers', async () => {
      const eventWithCorrelationId = {
        ...mockEvent,
        headers: {
          'X-Correlation-ID': 'test-correlation-id',
        },
      };

      const mockHandler = jest.fn().mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ success: true }),
      });

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler);
      const result = await wrappedHandler(eventWithCorrelationId, mockContext);

      expect(result.headers['X-Correlation-ID']).toBe('test-correlation-id');
      expect(mockHandler).toHaveBeenCalledWith(eventWithCorrelationId, expect.objectContaining({
        correlationId: 'test-correlation-id',
      }));
    });

    it('should sanitize error details in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Database connection failed');
      const mockHandler = jest.fn().mockRejectedValue(error);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler, {
        sanitizeErrors: true,
      });
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(502);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'BAD_GATEWAY',
        message: 'An internal error occurred',
      });
      expect(JSON.parse(result.body).details).toBeUndefined();

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should include detailed errors in development', async () => {
      const error = new Error('Database connection failed');
      const mockHandler = jest.fn().mockRejectedValue(error);

      const wrappedHandler = ErrorMiddleware.wrap(mockHandler, {
        enableDetailedErrors: true,
        sanitizeErrors: false,
      });
      const result = await wrappedHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(502);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 'BAD_GATEWAY',
        message: 'Database connection failed',
        details: {
          name: 'Error',
          message: 'Database connection failed',
          stack: expect.any(String),
        },
      });
    });
  });

  describe('extractUserContext', () => {
    it('should extract user context from authorizer', () => {
      const eventWithAuth = {
        ...mockEvent,
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: {
            userId: 'test-user-id',
            teamId: 'test-team-id',
            role: 'admin',
            department: 'engineering',
          },
        },
      };

      const userContext = ErrorMiddleware.extractUserContext(eventWithAuth);

      expect(userContext).toEqual({
        userId: 'test-user-id',
        teamId: 'test-team-id',
        role: 'admin',
        department: 'engineering',
      });
    });

    it('should handle missing authorizer', () => {
      const userContext = ErrorMiddleware.extractUserContext(mockEvent);

      expect(userContext).toEqual({});
    });

    it('should extract from custom attributes', () => {
      const eventWithCustomAuth = {
        ...mockEvent,
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: {
            sub: 'test-user-id',
            'custom:team_id': 'test-team-id',
            'custom:role': 'user',
            'custom:department': 'marketing',
          },
        },
      };

      const userContext = ErrorMiddleware.extractUserContext(eventWithCustomAuth);

      expect(userContext).toEqual({
        userId: 'test-user-id',
        teamId: 'test-team-id',
        role: 'user',
        department: 'marketing',
      });
    });
  });

  describe('validateRequiredFields', () => {
    it('should return empty array for valid data', () => {
      const data = {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      };

      const missingFields = ErrorMiddleware.validateRequiredFields(data, ['field1', 'field2']);

      expect(missingFields).toEqual([]);
    });

    it('should return missing fields', () => {
      const data = {
        field1: 'value1',
        field3: '',
        field4: null,
      };

      const missingFields = ErrorMiddleware.validateRequiredFields(data, [
        'field1',
        'field2',
        'field3',
        'field4',
        'field5',
      ]);

      expect(missingFields).toEqual(['field2', 'field3', 'field4', 'field5']);
    });
  });

  describe('healthCheck', () => {
    it('should return health check response', () => {
      const result = ErrorMiddleware.healthCheck();

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
      });
    });
  });
});