/**
 * AgentCore WebSocket Handler Tests
 * Tests for WebSocket real-time agent conversations
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler } from '../agent-websocket-handler';
import { AgentCoreService } from '../../../services/agent-core-service';
import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk';

// Mock AWS SDK
jest.mock('aws-sdk');
jest.mock('../../../services/agent-core-service');

describe('AgentCore WebSocket Handler', () => {
  let mockDynamoDb: jest.Mocked<DynamoDB.DocumentClient>;
  let mockApiGateway: jest.Mocked<ApiGatewayManagementApi>;
  let mockAgentCoreService: jest.Mocked<AgentCoreService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock DynamoDB
    mockDynamoDb = {
      put: jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) }),
      get: jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) }),
      delete: jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) }),
      update: jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) })
    } as any;

    // Mock API Gateway Management API
    mockApiGateway = {
      postToConnection: jest.fn().mockReturnValue({ 
        promise: jest.fn().mockResolvedValue({}) 
      })
    } as any;

    // Mock AgentCore Service
    mockAgentCoreService = {
      sendMessage: jest.fn()
    } as any;

    // Mock AWS SDK constructors
    (DynamoDB.DocumentClient as jest.Mock).mockImplementation(() => mockDynamoDb);
    (ApiGatewayManagementApi as jest.Mock).mockImplementation(() => mockApiGateway);
  });

  const createWebSocketEvent = (
    routeKey: string,
    body?: any,
    queryParams?: Record<string, string>
  ): APIGatewayProxyEvent => ({
    requestContext: {
      connectionId: 'test-connection-123',
      routeKey,
      domainName: 'test-domain.execute-api.us-east-1.amazonaws.com',
      stage: 'dev',
      requestId: 'test-request-id'
    },
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: queryParams || null,
    headers: {
      'X-Correlation-ID': 'test-correlation-id'
    }
  } as any);

  describe('$connect route', () => {
    it('should handle WebSocket connection successfully', async () => {
      const event = createWebSocketEvent('$connect', null, {
        userId: 'test-user-123',
        teamId: 'test-team-456',
        role: 'user'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockDynamoDb.put).toHaveBeenCalledWith({
        TableName: 'websocket-connections',
        Item: expect.objectContaining({
          connectionId: 'test-connection-123',
          userId: 'test-user-123',
          teamId: 'test-team-456',
          ttl: expect.any(Number)
        })
      });
    });

    it('should reject connection without user context', async () => {
      const event = createWebSocketEvent('$connect');

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'UNAUTHORIZED');
      expect(mockDynamoDb.put).not.toHaveBeenCalled();
    });

    it('should reject connection with incomplete user context', async () => {
      const event = createWebSocketEvent('$connect', null, {
        userId: 'test-user-123'
        // Missing teamId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(mockDynamoDb.put).not.toHaveBeenCalled();
    });
  });

  describe('$disconnect route', () => {
    it('should handle WebSocket disconnection successfully', async () => {
      const event = createWebSocketEvent('$disconnect');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockDynamoDb.delete).toHaveBeenCalledWith({
        TableName: 'websocket-connections',
        Key: { connectionId: 'test-connection-123' }
      });
    });
  });

  describe('$default route - message handling', () => {
    beforeEach(() => {
      // Mock connection exists in DynamoDB
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            connectionId: 'test-connection-123',
            userId: 'test-user-123',
            teamId: 'test-team-456',
            connectedAt: new Date(),
            lastActivity: new Date()
          }
        })
      } as any);
    });

    describe('message action', () => {
      it('should process chat message successfully', async () => {
        const messageBody = {
          action: 'message',
          sessionId: 'test-session-123',
          message: 'What are the security policies?',
          messageType: 'text'
        };

        const mockResponse = {
          messageId: 'msg-123',
          response: 'Here are the security policies...',
          confidence: 0.85,
          references: [],
          actionItems: [],
          suggestions: ['Review policy document', 'Check compliance status'],
          processingTime: 1200
        };

        mockAgentCoreService.sendMessage.mockResolvedValue(mockResponse);

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        expect(mockAgentCoreService.sendMessage).toHaveBeenCalledWith({
          sessionId: 'test-session-123',
          message: 'What are the security policies?',
          messageType: 'text'
        });

        // Should send typing indicator and response
        expect(mockApiGateway.postToConnection).toHaveBeenCalledTimes(3); // typing start, typing stop, response
        
        // Check response message
        const responseCall = mockApiGateway.postToConnection.mock.calls.find(call => {
          const data = JSON.parse(call[0].Data as string);
          return data.type === 'message';
        });
        expect(responseCall).toBeDefined();
        
        const responseData = JSON.parse(responseCall![0].Data as string);
        expect(responseData).toMatchObject({
          type: 'message',
          sessionId: 'test-session-123',
          messageId: 'msg-123',
          content: 'Here are the security policies...',
          confidence: 0.85
        });
      });

      it('should handle missing sessionId or message', async () => {
        const messageBody = {
          action: 'message',
          // Missing sessionId and message
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(400);
        expect(mockAgentCoreService.sendMessage).not.toHaveBeenCalled();
        
        // Should send error message
        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'error',
            error: 'Missing sessionId or message',
            timestamp: expect.any(String)
          })
        });
      });

      it('should handle service errors gracefully', async () => {
        const messageBody = {
          action: 'message',
          sessionId: 'test-session-123',
          message: 'Test message'
        };

        mockAgentCoreService.sendMessage.mockRejectedValue(
          new Error('Service unavailable')
        );

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(500);
        
        // Should send error message
        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'error',
            error: 'Failed to process message',
            timestamp: expect.any(String)
          })
        });
      });
    });

    describe('typing action', () => {
      it('should handle typing indicator', async () => {
        const messageBody = {
          action: 'typing',
          sessionId: 'test-session-123'
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'status',
            sessionId: 'test-session-123',
            content: 'Typing indicator received',
            timestamp: expect.any(String)
          })
        });
      });

      it('should handle missing sessionId in typing', async () => {
        const messageBody = {
          action: 'typing'
          // Missing sessionId
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(400);
      });
    });

    describe('join_session action', () => {
      it('should handle join session successfully', async () => {
        const messageBody = {
          action: 'join_session',
          sessionId: 'test-session-123'
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        expect(mockDynamoDb.update).toHaveBeenCalledWith({
          TableName: 'websocket-connections',
          Key: { connectionId: 'test-connection-123' },
          UpdateExpression: 'SET sessionId = :sessionId, lastActivity = :now',
          ExpressionAttributeValues: {
            ':sessionId': 'test-session-123',
            ':now': expect.any(String)
          }
        });

        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'status',
            sessionId: 'test-session-123',
            content: 'Joined session successfully',
            timestamp: expect.any(String)
          })
        });
      });

      it('should handle missing sessionId in join_session', async () => {
        const messageBody = {
          action: 'join_session'
          // Missing sessionId
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(400);
        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'error',
            error: 'Missing sessionId',
            timestamp: expect.any(String)
          })
        });
      });
    });

    describe('leave_session action', () => {
      it('should handle leave session successfully', async () => {
        const messageBody = {
          action: 'leave_session',
          sessionId: 'test-session-123'
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        expect(mockDynamoDb.update).toHaveBeenCalledWith({
          TableName: 'websocket-connections',
          Key: { connectionId: 'test-connection-123' },
          UpdateExpression: 'REMOVE sessionId SET lastActivity = :now',
          ExpressionAttributeValues: {
            ':now': expect.any(String)
          }
        });

        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'status',
            content: 'Left session successfully',
            timestamp: expect.any(String)
          })
        });
      });
    });

    describe('ping action', () => {
      it('should handle ping message', async () => {
        const messageBody = {
          action: 'ping'
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'pong',
            timestamp: expect.any(String)
          })
        });
      });
    });

    describe('unknown action', () => {
      it('should handle unknown action', async () => {
        const messageBody = {
          action: 'unknown_action'
        };

        const event = createWebSocketEvent('$default', messageBody);
        const result = await handler(event);

        expect(result.statusCode).toBe(400);
        expect(mockApiGateway.postToConnection).toHaveBeenCalledWith({
          ConnectionId: 'test-connection-123',
          Data: JSON.stringify({
            type: 'error',
            error: 'Unknown action',
            timestamp: expect.any(String)
          })
        });
      });
    });

    it('should handle connection not found', async () => {
      // Mock connection not found
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);

      const messageBody = {
        action: 'ping'
      };

      const event = createWebSocketEvent('$default', messageBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'NOT_FOUND');
    });

    it('should update last activity for all messages', async () => {
      const messageBody = {
        action: 'ping'
      };

      const event = createWebSocketEvent('$default', messageBody);
      await handler(event);

      expect(mockDynamoDb.update).toHaveBeenCalledWith({
        TableName: 'websocket-connections',
        Key: { connectionId: 'test-connection-123' },
        UpdateExpression: 'SET lastActivity = :now',
        ExpressionAttributeValues: {
          ':now': expect.any(String)
        }
      });
    });
  });

  describe('Connection management', () => {
    it('should handle gone connections gracefully', async () => {
      // Mock connection gone error
      mockApiGateway.postToConnection.mockReturnValue({
        promise: jest.fn().mockRejectedValue({ statusCode: 410 })
      } as any);

      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            connectionId: 'test-connection-123',
            userId: 'test-user-123',
            teamId: 'test-team-456'
          }
        })
      } as any);

      const messageBody = {
        action: 'ping'
      };

      const event = createWebSocketEvent('$default', messageBody);
      const result = await handler(event);

      // Should still return success even if connection is gone
      expect(result.statusCode).toBe(200);
    });

    it('should handle API Gateway errors', async () => {
      // Mock API Gateway error
      mockApiGateway.postToConnection.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('API Gateway error'))
      } as any);

      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            connectionId: 'test-connection-123',
            userId: 'test-user-123',
            teamId: 'test-team-456'
          }
        })
      } as any);

      const messageBody = {
        action: 'ping'
      };

      const event = createWebSocketEvent('$default', messageBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });

  describe('Unknown route', () => {
    it('should handle unknown route key', async () => {
      const event = createWebSocketEvent('unknown_route');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'BAD_REQUEST');
    });
  });
});