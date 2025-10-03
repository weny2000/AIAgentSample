import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler, healthCheck } from '../validation-handler';
import { RulesEngine } from '../../rules-engine/rules-engine';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../rules-engine/rules-engine');
jest.mock('../../utils/logger');
jest.mock('../../utils/response-builder', () => ({
  buildSuccessResponse: jest.fn().mockReturnValue({
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  }),
  buildErrorResponse: jest.fn().mockReturnValue({
    statusCode: 500,
    body: JSON.stringify({ error: 'Internal error' }),
  }),
}));

const mockRulesEngine = RulesEngine as jest.MockedClass<typeof RulesEngine>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Validation Handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'validation-handler',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:validation-handler',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/validation-handler',
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
    it('should handle validation requests successfully', async () => {
      const mockValidationResult = {
        overall_score: 85,
        passed: true,
        issues: [],
        recommendations: [],
        execution_time: 1500,
      };

      const mockRulesEngineInstance = {
        validateArtifact: jest.fn().mockResolvedValue(mockValidationResult),
      };
      mockRulesEngine.mockImplementation(() => mockRulesEngineInstance as any);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: {
          'Content-Type': 'application/json',
        },
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
          path: '/validate',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
          resourceId: 'test-resource',
          resourcePath: '/validate',
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
          authorizer: {
            claims: {
              sub: 'user-123',
              email: 'test@example.com',
              'custom:team_id': 'team-1',
            },
          },
        },
        resource: '/validate',
        body: JSON.stringify({
          artifact_content: 'test content',
          artifact_type: 'cloudformation',
          validation_rules: ['security', 'best-practices'],
        }),
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(mockRulesEngineInstance.validateArtifact).toHaveBeenCalledWith({
        content: 'test content',
        type: 'cloudformation',
        rules: ['security', 'best-practices'],
        context: {
          user_id: 'user-123',
          team_id: 'team-1',
          request_id: 'test-request',
        },
      });
      expect(result.statusCode).toBe(200);
    });

    it('should handle missing request body', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
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
          path: '/validate',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
          resourceId: 'test-resource',
          resourcePath: '/validate',
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
        resource: '/validate',
        body: null,
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });

    it('should handle validation errors', async () => {
      const mockRulesEngineInstance = {
        validateArtifact: jest.fn().mockRejectedValue(new Error('Validation failed')),
      };
      mockRulesEngine.mockImplementation(() => mockRulesEngineInstance as any);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: {
          'Content-Type': 'application/json',
        },
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
          path: '/validate',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
          resourceId: 'test-resource',
          resourcePath: '/validate',
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
          authorizer: {
            claims: {
              sub: 'user-123',
              email: 'test@example.com',
            },
          },
        },
        resource: '/validate',
        body: JSON.stringify({
          artifact_content: 'invalid content',
          artifact_type: 'unknown',
        }),
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.statusCode).toBe(500);
    });
  });

  describe('healthCheck', () => {
    it('should return health status successfully', async () => {
      const mockStats = {
        total_validations: 100,
        success_rate: 0.95,
        average_execution_time: 2000,
      };

      const mockRulesEngineInstance = {
        getValidationStats: jest.fn().mockResolvedValue(mockStats),
      };
      mockRulesEngine.mockImplementation(() => mockRulesEngineInstance as any);

      const result = await healthCheck();

      expect(mockRulesEngineInstance.getValidationStats).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('healthy');
      expect(body.stats).toEqual(mockStats);
    });

    it('should handle health check errors', async () => {
      const mockRulesEngineInstance = {
        getValidationStats: jest.fn().mockRejectedValue(new Error('Stats unavailable')),
      };
      mockRulesEngine.mockImplementation(() => mockRulesEngineInstance as any);

      const result = await healthCheck();

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.statusCode).toBe(500);
    });
  });
});