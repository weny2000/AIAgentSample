import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler, classifyError, buildErrorResponse } from '../error-handler';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../utils/response-builder', () => ({
  buildErrorResponse: jest.fn(),
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Error Handler', () => {
  const mockContext: Context = {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handler', () => {
    it('should handle timeout errors', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/test',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        pathParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api',
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/test',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
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
          authorizer: null,
        },
        resource: '/test',
        body: JSON.stringify({ error: 'Connection timeout occurred' }),
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.statusCode).toBe(500);
    });

    it('should handle validation errors', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/test',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        pathParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api',
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/test',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
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
          authorizer: null,
        },
        resource: '/test',
        body: JSON.stringify({ error: 'Invalid input format' }),
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.statusCode).toBe(500);
    });
  });

  describe('classifyError', () => {
    it('should classify timeout errors correctly', () => {
      const error = new Error('Connection timeout occurred');
      const classification = classifyError(error);

      expect(classification.type).toBe('timeout');
      expect(classification.category).toBe('infrastructure');
      expect(classification.retryable).toBe(true);
    });

    it('should classify validation errors correctly', () => {
      const error = new Error('Invalid input format');
      const classification = classifyError(error);

      expect(classification.type).toBe('validation');
      expect(classification.category).toBe('user_input');
      expect(classification.retryable).toBe(false);
    });

    it('should classify permission errors correctly', () => {
      const error = new Error('Access denied');
      const classification = classifyError(error);

      expect(classification.type).toBe('permission');
      expect(classification.category).toBe('authorization');
      expect(classification.retryable).toBe(false);
    });

    it('should classify rate limit errors correctly', () => {
      const error = new Error('Rate limit exceeded');
      const classification = classifyError(error);

      expect(classification.type).toBe('rate_limit');
      expect(classification.category).toBe('infrastructure');
      expect(classification.retryable).toBe(true);
    });

    it('should classify unknown errors as system errors', () => {
      const error = new Error('Unknown error occurred');
      const classification = classifyError(error);

      expect(classification.type).toBe('system');
      expect(classification.category).toBe('system');
      expect(classification.retryable).toBe(true);
    });
  });
});