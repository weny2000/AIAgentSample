/**
 * Unit tests for Work Task Management Handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { submitWorkTask, getWorkTasks, getWorkTask, updateWorkTask, getTaskAnalysis } from '../work-task-management-handler';

// Mock the dependencies
jest.mock('../../../services/work-task-analysis-service', () => ({
  WorkTaskAnalysisService: jest.fn().mockImplementation(() => ({
    analyzeWorkTask: jest.fn().mockResolvedValue({
      keyPoints: [],
      relatedWorkgroups: [],
      todoList: [],
      knowledgeReferences: [],
      riskAssessment: { overall_risk_level: 'low', identified_risks: [], mitigation_suggestions: [] },
      recommendations: [],
      analysisMetadata: { analysis_version: '1.0', processing_time_ms: 1000, confidence_score: 0.8 }
    })
  }))
}));

jest.mock('../../../services/kendra-search-service', () => ({
  KendraSearchService: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../../rules-engine/rules-engine-service', () => ({
  RulesEngineService: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../../repositories/audit-log-repository', () => ({
  AuditLogRepository: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({})
  }))
}));

jest.mock('../../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }))
}));

describe('Work Task Management Handler', () => {
  const mockUserContext = {
    userId: 'user-123',
    teamId: 'team-456',
    role: 'developer',
    department: 'engineering',
    clearance: 'standard',
    permissions: ['work-task-submit', 'work-task-manage']
  };

  const createMockEvent = (
    path: string,
    method: string,
    body?: any,
    pathParameters?: any,
    queryStringParameters?: any
  ): APIGatewayProxyEvent => ({
    httpMethod: method,
    path,
    pathParameters: pathParameters || null,
    queryStringParameters: queryStringParameters || null,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-token',
      'X-Correlation-ID': 'test-correlation-id'
    },
    body: body ? JSON.stringify(body) : null,
    requestContext: {
      authorizer: {
        claims: {
          sub: mockUserContext.userId,
          team_id: mockUserContext.teamId,
          role: mockUserContext.role,
          department: mockUserContext.department,
          clearance: mockUserContext.clearance,
          permissions: mockUserContext.permissions.join(',')
        }
      }
    } as any,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    isBase64Encoded: false,
    resource: ''
  });

  describe('submitWorkTask', () => {
    it('should successfully submit a valid work task', async () => {
      const taskSubmission = {
        title: 'Test Task',
        description: 'Test Description',
        content: 'Test Content',
        priority: 'medium',
        category: 'development',
        tags: ['test', 'development']
      };

      const event = createMockEvent('/api/v1/work-tasks', 'POST', taskSubmission);
      const result = await submitWorkTask(event);

      expect(result.statusCode).toBe(201);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.taskId).toBeDefined();
      expect(responseBody.status).toBe('analyzed');
      expect(responseBody.analysisResult).toBeDefined();
    });

    it('should return 400 for missing required fields', async () => {
      const invalidSubmission = {
        title: 'Test Task'
        // Missing description and content
      };

      const event = createMockEvent('/api/v1/work-tasks', 'POST', invalidSubmission);
      const result = await submitWorkTask(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.errorCode).toBe('BAD_REQUEST');
      expect(responseBody.message).toContain('Missing required fields');
    });

    it('should return 400 for empty request body', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'POST');
      const result = await submitWorkTask(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Request body is required');
    });

    it('should return 401 for missing authorization', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'POST', { title: 'Test' });
      delete event.requestContext.authorizer;

      const result = await submitWorkTask(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.errorCode).toBe('UNAUTHORIZED');
    });
  });

  describe('getWorkTasks', () => {
    it('should successfully retrieve work tasks', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET');
      const result = await getWorkTasks(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.tasks).toBeDefined();
      expect(Array.isArray(responseBody.tasks)).toBe(true);
      expect(responseBody.totalCount).toBeDefined();
      expect(responseBody.hasMore).toBeDefined();
    });

    it('should apply query filters correctly', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET', null, null, {
        status: 'in_progress',
        priority: 'high',
        limit: '5'
      });
      const result = await getWorkTasks(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.filters).toBeDefined();
      expect(responseBody.filters.status).toBe('in_progress');
      expect(responseBody.filters.priority).toBe('high');
    });

    it('should return 400 for invalid status filter', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET', null, null, {
        status: 'invalid-status'
      });
      const result = await getWorkTasks(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toContain('Invalid status filter');
    });

    it('should return 403 for accessing other team resources', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET', null, null, {
        teamId: 'other-team-id'
      });
      const result = await getWorkTasks(event);

      expect(result.statusCode).toBe(403);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.errorCode).toBe('FORBIDDEN');
    });
  });

  describe('getWorkTask', () => {
    it('should successfully retrieve a specific work task', async () => {
      const event = createMockEvent('/api/v1/work-tasks/task-123', 'GET', null, {
        taskId: 'task-123'
      });
      const result = await getWorkTask(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.task_id).toBe('task-123');
      expect(responseBody.title).toBeDefined();
      expect(responseBody.analysis_result).toBeDefined();
    });

    it('should return 400 for missing task ID', async () => {
      const event = createMockEvent('/api/v1/work-tasks/', 'GET');
      const result = await getWorkTask(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Task ID is required');
    });
  });

  describe('updateWorkTask', () => {
    it('should successfully update a work task', async () => {
      const updateData = {
        status: 'in_progress',
        priority: 'high'
      };

      const event = createMockEvent('/api/v1/work-tasks/task-123', 'PUT', updateData, {
        taskId: 'task-123'
      });
      const result = await updateWorkTask(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.taskId).toBe('task-123');
      expect(responseBody.updatedFields).toContain('status');
      expect(responseBody.updatedFields).toContain('priority');
    });

    it('should return 400 for invalid fields', async () => {
      const updateData = {
        invalidField: 'invalid-value'
      };

      const event = createMockEvent('/api/v1/work-tasks/task-123', 'PUT', updateData, {
        taskId: 'task-123'
      });
      const result = await updateWorkTask(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toContain('Invalid fields');
    });

    it('should return 400 for invalid status', async () => {
      const updateData = {
        status: 'invalid-status'
      };

      const event = createMockEvent('/api/v1/work-tasks/task-123', 'PUT', updateData, {
        taskId: 'task-123'
      });
      const result = await updateWorkTask(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toContain('Invalid status');
    });

    it('should return 400 for empty request body', async () => {
      const event = createMockEvent('/api/v1/work-tasks/task-123', 'PUT', null, {
        taskId: 'task-123'
      });
      const result = await updateWorkTask(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Request body is required');
    });
  });

  describe('getTaskAnalysis', () => {
    it('should successfully retrieve task analysis', async () => {
      const event = createMockEvent('/api/v1/work-tasks/task-123/analysis', 'GET', null, {
        taskId: 'task-123'
      });
      const result = await getTaskAnalysis(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.key_points).toBeDefined();
      expect(responseBody.related_workgroups).toBeDefined();
      expect(responseBody.todo_list).toBeDefined();
      expect(responseBody.knowledge_references).toBeDefined();
      expect(responseBody.risk_assessment).toBeDefined();
      expect(responseBody.recommendations).toBeDefined();
      expect(responseBody.analysis_metadata).toBeDefined();
    });

    it('should return 400 for missing task ID', async () => {
      const event = createMockEvent('/api/v1/work-tasks//analysis', 'GET');
      const result = await getTaskAnalysis(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Task ID is required');
    });
  });

  describe('Response Headers', () => {
    it('should include CORS headers in all responses', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET');
      const result = await getWorkTasks(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('should include correlation ID in response headers', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET');
      const result = await getWorkTasks(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['X-Correlation-ID']).toBe('test-correlation-id');
    });

    it('should include security headers', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET');
      const result = await getWorkTasks(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['X-Content-Type-Options']).toBe('nosniff');
      expect(result.headers!['X-Frame-Options']).toBe('DENY');
      expect(result.headers!['X-XSS-Protection']).toBe('1; mode=block');
    });
  });
});