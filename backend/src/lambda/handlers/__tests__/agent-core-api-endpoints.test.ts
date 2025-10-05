/**
 * AgentCore API Endpoints Tests
 * Tests for all AgentCore API endpoints including capabilities, metadata, configuration, and health
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Mock all dependencies before importing the handler
jest.mock('../../../services/agent-core-service');
jest.mock('../../../repositories/persona-repository');
jest.mock('../../../repositories/audit-log-repository');
jest.mock('../../../repositories/conversation-repository');
jest.mock('../../../services/kendra-search-service');
jest.mock('../../../rules-engine/rules-engine-service');
jest.mock('../../../services/conversation-management-service');
jest.mock('../../../services/notification-service');
jest.mock('../../utils/logger');
jest.mock('../../utils/response-builder');
jest.mock('../../utils/auth-utils');

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
  GetItemCommand: jest.fn(),
  PutItemCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn()
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn()
    }))
  }
}));

import { handler } from '../agent-core-handler';

describe('AgentCore API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (
    path: string,
    method: string,
    body?: any,
    queryParams?: Record<string, string>
  ): APIGatewayProxyEvent => ({
    path,
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: queryParams || null,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': 'test-correlation-id'
    },
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: 'test-user-123',
          team_id: 'test-team-456',
          role: 'user',
          department: 'engineering',
          clearance: 'standard',
          permissions: 'read,write,search'
        }
      }
    }
  } as any);

  describe('GET /capabilities', () => {
    it('should return agent capabilities', async () => {
      const mockCapabilities = [
        {
          id: 'cap-1',
          name: 'Policy Analysis',
          description: 'Analyze policies and compliance',
          category: 'analysis' as const,
          enabled: true,
          configuration: {},
          permissions: ['read']
        },
        {
          id: 'cap-2',
          name: 'Knowledge Search',
          description: 'Search organizational knowledge base',
          category: 'search' as const,
          enabled: true,
          configuration: {},
          permissions: ['search']
        }
      ];

      mockAgentCoreService.getCapabilities.mockResolvedValue(mockCapabilities);

      const event = createMockEvent('/agent/capabilities', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        capabilities: mockCapabilities
      });
      expect(mockAgentCoreService.getCapabilities).toHaveBeenCalledWith({
        userId: 'test-user-123',
        teamId: 'test-team-456'
      });
    });

    it('should filter capabilities by category', async () => {
      const mockCapabilities = [
        {
          id: 'cap-1',
          name: 'Policy Analysis',
          description: 'Analyze policies and compliance',
          category: 'analysis' as const,
          enabled: true,
          configuration: {},
          permissions: ['read']
        }
      ];

      mockAgentCoreService.getCapabilities.mockResolvedValue(mockCapabilities);

      const event = createMockEvent('/agent/capabilities', 'GET', null, { category: 'analysis' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockAgentCoreService.getCapabilities).toHaveBeenCalledWith({
        category: 'analysis',
        userId: 'test-user-123',
        teamId: 'test-team-456'
      });
    });

    it('should filter capabilities by enabled status', async () => {
      const mockCapabilities = [
        {
          id: 'cap-1',
          name: 'Policy Analysis',
          description: 'Analyze policies and compliance',
          category: 'analysis' as const,
          enabled: true,
          configuration: {},
          permissions: ['read']
        }
      ];

      mockAgentCoreService.getCapabilities.mockResolvedValue(mockCapabilities);

      const event = createMockEvent('/agent/capabilities', 'GET', null, { enabled: 'true' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockAgentCoreService.getCapabilities).toHaveBeenCalledWith({
        enabled: true,
        userId: 'test-user-123',
        teamId: 'test-team-456'
      });
    });
  });

  describe('GET /metadata', () => {
    it('should return agent metadata', async () => {
      const mockMetadata = {
        agentId: 'agent-core-1',
        name: 'AI Agent Assistant',
        description: 'Intelligent assistant for team collaboration',
        version: '1.0.0',
        capabilities: ['Policy Analysis', 'Knowledge Search'],
        supportedLanguages: ['en', 'es', 'fr'],
        maxSessionDuration: 60,
        maxConcurrentSessions: 10,
        features: ['Real-time conversation', 'Policy compliance checking']
      };

      mockAgentCoreService.getAgentMetadata.mockResolvedValue(mockMetadata);

      const event = createMockEvent('/agent/metadata', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockMetadata);
      expect(mockAgentCoreService.getAgentMetadata).toHaveBeenCalledWith('test-team-456');
    });
  });

  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const event = createMockEvent('/agent/health', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('status', 'healthy');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('service', 'AgentCore');
      expect(body).toHaveProperty('version', '1.0.0');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const mockHealth = {
        agentId: 'agent-core-1',
        status: 'healthy' as const,
        lastHealthCheck: new Date(),
        metrics: {
          averageResponseTime: 1200,
          successRate: 0.98,
          errorRate: 0.02,
          activeSessions: 5,
          memoryUsage: 0.65,
          cpuUsage: 0.45
        },
        issues: []
      };

      mockAgentCoreService.getDetailedHealth.mockResolvedValue(mockHealth);

      const event = createMockEvent('/agent/health/detailed', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockHealth);
      expect(mockAgentCoreService.getDetailedHealth).toHaveBeenCalled();
    });
  });

  describe('GET /agents/:agentId/config', () => {
    it('should return agent configuration', async () => {
      const mockConfig = {
        agentId: 'agent-1',
        name: 'Test Agent',
        description: 'Test agent configuration',
        personaId: 'persona-1',
        capabilities: ['analysis', 'search'],
        settings: {
          responseStyle: 'formal' as const,
          verbosity: 'detailed' as const,
          proactivity: 'moderate' as const,
          learningEnabled: true,
          memoryRetention: 30,
          maxContextLength: 10000
        },
        constraints: {
          maxSessionDuration: 60,
          maxConcurrentSessions: 10,
          allowedActions: ['search', 'analyze'],
          restrictedTopics: [],
          complianceRequired: true,
          auditLevel: 'detailed' as const
        },
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockAgentCoreService.getAgentConfiguration.mockResolvedValue(mockConfig);

      // Mock user with config read permission
      const event = createMockEvent('/agent/agents/agent-1/config', 'GET');
      event.requestContext.authorizer.claims.permissions = 'agent-config-read,read,write';

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockConfig);
      expect(mockAgentCoreService.getAgentConfiguration).toHaveBeenCalledWith('agent-1');
    });

    it('should return 403 for insufficient permissions', async () => {
      const event = createMockEvent('/agent/agents/agent-1/config', 'GET');
      // User doesn't have agent-config-read permission

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'FORBIDDEN');
    });
  });

  describe('PUT /agents/:agentId/config', () => {
    it('should update agent configuration', async () => {
      const updateRequest = {
        settings: {
          responseStyle: 'casual' as const,
          verbosity: 'concise' as const
        },
        constraints: {
          maxSessionDuration: 90
        }
      };

      const mockUpdatedConfig = {
        agentId: 'agent-1',
        name: 'Test Agent',
        description: 'Test agent configuration',
        personaId: 'persona-1',
        capabilities: ['analysis', 'search'],
        settings: {
          responseStyle: 'casual' as const,
          verbosity: 'concise' as const,
          proactivity: 'moderate' as const,
          learningEnabled: true,
          memoryRetention: 30,
          maxContextLength: 10000
        },
        constraints: {
          maxSessionDuration: 90,
          maxConcurrentSessions: 10,
          allowedActions: ['search', 'analyze'],
          restrictedTopics: [],
          complianceRequired: true,
          auditLevel: 'detailed' as const
        },
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockAgentCoreService.updateAgentConfiguration.mockResolvedValue(mockUpdatedConfig);

      // Mock user with config write permission
      const event = createMockEvent('/agent/agents/agent-1/config', 'PUT', updateRequest);
      event.requestContext.authorizer.claims.permissions = 'agent-config-write,read,write';

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockUpdatedConfig);
      expect(mockAgentCoreService.updateAgentConfiguration).toHaveBeenCalledWith({
        agentId: 'agent-1',
        ...updateRequest
      });
    });

    it('should return 403 for insufficient permissions', async () => {
      const event = createMockEvent('/agent/agents/agent-1/config', 'PUT', {});
      // User doesn't have agent-config-write permission

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'FORBIDDEN');
    });
  });

  describe('GET /analytics', () => {
    it('should return analytics data', async () => {
      const mockAnalytics = {
        totalSessions: 150,
        averageSessionDuration: 8.5,
        userSatisfactionScore: 4.2,
        topTopics: [
          {
            topic: 'security',
            frequency: 45,
            averageConfidence: 0.85,
            userSatisfaction: 4.3
          }
        ],
        performanceMetrics: {
          averageResponseTime: 1200,
          successRate: 0.98,
          errorRate: 0.02,
          complianceRate: 0.95
        },
        learningInsights: {
          patternsIdentified: 23,
          improvementsImplemented: 8,
          userFeedbackScore: 4.1,
          adaptationRate: 0.75
        }
      };

      mockAgentCoreService.getAnalytics.mockResolvedValue(mockAnalytics);

      // Mock user with analytics read permission
      const event = createMockEvent('/agent/analytics', 'GET', null, {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        metrics: 'sessions,satisfaction,performance'
      });
      event.requestContext.authorizer.claims.permissions = 'analytics-read,read,write';

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockAnalytics);
      expect(mockAgentCoreService.getAnalytics).toHaveBeenCalledWith({
        teamId: 'test-team-456',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-31T23:59:59Z'),
        metrics: ['sessions', 'satisfaction', 'performance']
      });
    });

    it('should return 403 for insufficient permissions', async () => {
      const event = createMockEvent('/agent/analytics', 'GET');
      // User doesn't have analytics-read permission

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'FORBIDDEN');
    });
  });

  describe('GET /status', () => {
    it('should return agent status', async () => {
      const mockStatus = {
        status: 'healthy' as const,
        activeSessions: 5,
        lastActivity: new Date()
      };

      mockAgentCoreService.getAgentStatus.mockResolvedValue(mockStatus);

      const event = createMockEvent('/agent/status', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockStatus);
      expect(mockAgentCoreService.getAgentStatus).toHaveBeenCalledWith({
        userId: 'test-user-123',
        teamId: 'test-team-456',
        includeMetrics: false,
        includeIssues: false
      });
    });

    it('should include metrics when requested', async () => {
      const mockStatus = {
        status: 'healthy' as const,
        activeSessions: 5,
        lastActivity: new Date(),
        metrics: {
          averageResponseTime: 1200,
          successRate: 0.98,
          errorRate: 0.02
        }
      };

      mockAgentCoreService.getAgentStatus.mockResolvedValue(mockStatus);

      const event = createMockEvent('/agent/status', 'GET', null, { 
        includeMetrics: 'true' 
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockStatus);
      expect(mockAgentCoreService.getAgentStatus).toHaveBeenCalledWith({
        userId: 'test-user-123',
        teamId: 'test-team-456',
        includeMetrics: true,
        includeIssues: false
      });
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockAgentCoreService.getCapabilities.mockRejectedValue(
        new Error('Service unavailable')
      );

      const event = createMockEvent('/agent/capabilities', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'INTERNAL_ERROR');
    });

    it('should return 404 for unknown endpoints', async () => {
      const event = createMockEvent('/agent/unknown', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'NOT_FOUND');
    });

    it('should handle missing authentication', async () => {
      const event = createMockEvent('/agent/capabilities', 'GET');
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toHaveProperty('errorCode', 'UNAUTHORIZED');
    });
  });
});