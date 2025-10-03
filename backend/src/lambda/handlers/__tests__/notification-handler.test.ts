import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../notification-handler';
import { EnhancedNotificationService } from '../../services/enhanced-notification-service';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../services/enhanced-notification-service');
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

const mockEnhancedNotificationService = EnhancedNotificationService as jest.MockedClass<typeof EnhancedNotificationService>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Notification Handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'notification-handler',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:notification-handler',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/notification-handler',
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
    it('should send notifications successfully', async () => {
      const mockNotificationResult = {
        notification_id: 'notif-123',
        summary: {
          notifications_sent: 2,
          notifications_failed: 0,
          channels_used: ['slack', 'email'],
        },
        details: [],
      };

      const mockServiceInstance = {
        sendNotificationsWithRetry: jest.fn().mockResolvedValue(mockNotificationResult),
      };
      mockEnhancedNotificationService.mockImplementation(() => mockServiceInstance as any);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/notifications/send',
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
          path: '/notifications/send',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
          resourceId: 'test-resource',
          resourcePath: '/notifications/send',
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
        resource: '/notifications/send',
        body: JSON.stringify({
          impact_analysis: {
            service_id: 'service-1',
            service_name: 'Test Service',
            team_id: 'team-1',
            affected_services: [],
            risk_assessment: {
              overall_risk_level: 'medium',
              risk_factors: [],
            },
            stakeholders: [],
            mitigation_strategies: [],
          },
          change_description: 'Test change',
          change_timeline: 'Immediate',
          requester: {
            user_id: 'user-123',
            name: 'Test User',
            email: 'test@example.com',
            team_id: 'team-1',
          },
          notification_type: 'impact_alert',
        }),
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(mockServiceInstance.sendNotificationsWithRetry).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
    });

    it('should handle missing request body', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/notifications/send',
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
          path: '/notifications/send',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
          resourceId: 'test-resource',
          resourcePath: '/notifications/send',
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
        resource: '/notifications/send',
        body: null,
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });

    it('should handle notification service errors', async () => {
      const mockServiceInstance = {
        sendNotificationsWithRetry: jest.fn().mockRejectedValue(new Error('Service unavailable')),
      };
      mockEnhancedNotificationService.mockImplementation(() => mockServiceInstance as any);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/notifications/send',
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
          path: '/notifications/send',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2023:00:00:00 +0000',
          requestTimeEpoch: 1672531200000,
          resourceId: 'test-resource',
          resourcePath: '/notifications/send',
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
        resource: '/notifications/send',
        body: JSON.stringify({
          impact_analysis: {},
          change_description: 'Test change',
          requester: {
            user_id: 'user-123',
            name: 'Test User',
            email: 'test@example.com',
          },
        }),
        isBase64Encoded: false,
      };

      const result = await handler(event, mockContext);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.statusCode).toBe(500);
    });
  });
});