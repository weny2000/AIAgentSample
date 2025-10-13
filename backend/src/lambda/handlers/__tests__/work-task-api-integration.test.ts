/**
 * Integration tests for Work Task API handlers
 * Tests the complete API functionality including routing, validation, and responses
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler as workTaskApiHandler } from '../work-task-api-handler';
import { submitWorkTask, getWorkTasks, getWorkTask, updateWorkTask, getTaskAnalysis } from '../work-task-management-handler';
import { getTodos, updateTodo, submitDeliverable, getDeliverables } from '../todo-management-handler';
import { getTaskProgress, generateProgressReport } from '../progress-reporting-handler';
import { performQualityCheck, getQualityReport, batchQualityCheck } from '../deliverable-quality-handler';

// Mock the services
jest.mock('../../services/work-task-analysis-service');
jest.mock('../../services/todo-progress-tracker');
jest.mock('../../services/artifact-validation-service');
jest.mock('../../services/quality-assessment-engine');
jest.mock('../../repositories/audit-log-repository');

describe('Work Task API Integration Tests', () => {
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

  describe('Work Task Management', () => {
    describe('POST /api/v1/work-tasks - Submit Work Task', () => {
      it('should successfully submit a work task', async () => {
        const taskSubmission = {
          title: 'Implement user authentication',
          description: 'Design and implement secure user authentication system',
          content: 'We need to implement OAuth 2.0 with multi-factor authentication support...',
          priority: 'high',
          category: 'security',
          tags: ['authentication', 'security', 'oauth']
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
          title: 'Test task'
          // Missing description and content
        };

        const event = createMockEvent('/api/v1/work-tasks', 'POST', invalidSubmission);
        const result = await submitWorkTask(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.errorCode).toBe('BAD_REQUEST');
        expect(responseBody.message).toContain('Missing required fields');
      });

      it('should return 400 for invalid priority', async () => {
        const invalidSubmission = {
          title: 'Test task',
          description: 'Test description',
          content: 'Test content',
          priority: 'invalid-priority'
        };

        const event = createMockEvent('/api/v1/work-tasks', 'POST', invalidSubmission);
        const result = await submitWorkTask(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Invalid priority');
      });
    });

    describe('GET /api/v1/work-tasks - Get Work Tasks', () => {
      it('should successfully retrieve work tasks', async () => {
        const event = createMockEvent('/api/v1/work-tasks', 'GET', null, null, {
          limit: '10',
          status: 'in_progress'
        });
        const result = await getWorkTasks(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.tasks).toBeDefined();
        expect(Array.isArray(responseBody.tasks)).toBe(true);
        expect(responseBody.totalCount).toBeDefined();
        expect(responseBody.hasMore).toBeDefined();
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
    });

    describe('GET /api/v1/work-tasks/{taskId} - Get Work Task', () => {
      it('should successfully retrieve a specific work task', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123', 'GET', null, {
          taskId: 'task-123'
        });
        const result = await getWorkTask(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.task_id).toBe('task-123');
        expect(responseBody.title).toBeDefined();
        expect(responseBody.status).toBeDefined();
      });

      it('should return 400 for missing task ID', async () => {
        const event = createMockEvent('/api/v1/work-tasks/', 'GET');
        const result = await getWorkTask(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Task ID is required');
      });
    });

    describe('PUT /api/v1/work-tasks/{taskId} - Update Work Task', () => {
      it('should successfully update a work task', async () => {
        const updateData = {
          status: 'in_progress',
          priority: 'critical'
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
    });

    describe('GET /api/v1/work-tasks/{taskId}/analysis - Get Task Analysis', () => {
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
        expect(responseBody.analysis_metadata).toBeDefined();
      });
    });
  });

  describe('Todo Management', () => {
    describe('GET /api/v1/work-tasks/{taskId}/todos - Get Todos', () => {
      it('should successfully retrieve todos for a task', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123/todos', 'GET', null, {
          taskId: 'task-123'
        });
        const result = await getTodos(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.todos).toBeDefined();
        expect(Array.isArray(responseBody.todos)).toBe(true);
        expect(responseBody.totalCount).toBeDefined();
      });

      it('should return 400 for invalid status filter', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123/todos', 'GET', null, {
          taskId: 'task-123'
        }, {
          status: 'invalid-status'
        });
        const result = await getTodos(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Invalid status filter');
      });
    });

    describe('PUT /api/v1/todos/{todoId} - Update Todo', () => {
      it('should successfully update a todo', async () => {
        const updateData = {
          status: 'in_progress',
          assigned_to: 'user-456',
          notes: 'Started working on this task'
        };

        const event = createMockEvent('/api/v1/todos/todo-123', 'PUT', updateData, {
          todoId: 'todo-123'
        });
        const result = await updateTodo(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.todoId).toBe('todo-123');
        expect(responseBody.status).toBe('in_progress');
        expect(responseBody.updatedBy).toBe(mockUserContext.userId);
      });

      it('should return 400 for invalid status', async () => {
        const updateData = {
          status: 'invalid-status'
        };

        const event = createMockEvent('/api/v1/todos/todo-123', 'PUT', updateData, {
          todoId: 'todo-123'
        });
        const result = await updateTodo(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Invalid status');
      });
    });

    describe('POST /api/v1/todos/{todoId}/deliverables - Submit Deliverable', () => {
      it('should successfully submit a deliverable', async () => {
        const deliverableData = {
          file_name: 'auth-diagram.pdf',
          file_type: 'application/pdf',
          file_size: 1024000,
          content_base64: 'base64-encoded-content',
          notes: 'Initial version of authentication flow diagram'
        };

        const event = createMockEvent('/api/v1/todos/todo-123/deliverables', 'POST', deliverableData, {
          todoId: 'todo-123'
        });
        const result = await submitDeliverable(event);

        expect(result.statusCode).toBe(201);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.deliverableId).toBeDefined();
        expect(responseBody.todoId).toBe('todo-123');
        expect(responseBody.status).toBe('submitted');
      });

      it('should return 400 for missing required fields', async () => {
        const invalidDeliverable = {
          file_name: 'test.pdf'
          // Missing file_type and content_base64
        };

        const event = createMockEvent('/api/v1/todos/todo-123/deliverables', 'POST', invalidDeliverable, {
          todoId: 'todo-123'
        });
        const result = await submitDeliverable(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Missing required fields');
      });

      it('should return 400 for invalid file type', async () => {
        const invalidDeliverable = {
          file_name: 'malicious.exe',
          file_type: 'application/x-executable',
          file_size: 1024,
          content_base64: 'base64-content'
        };

        const event = createMockEvent('/api/v1/todos/todo-123/deliverables', 'POST', invalidDeliverable, {
          todoId: 'todo-123'
        });
        const result = await submitDeliverable(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('File type');
        expect(responseBody.message).toContain('not allowed');
      });
    });

    describe('GET /api/v1/todos/{todoId}/deliverables - Get Deliverables', () => {
      it('should successfully retrieve deliverables for a todo', async () => {
        const event = createMockEvent('/api/v1/todos/todo-123/deliverables', 'GET', null, {
          todoId: 'todo-123'
        });
        const result = await getDeliverables(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.deliverables).toBeDefined();
        expect(Array.isArray(responseBody.deliverables)).toBe(true);
        expect(responseBody.totalCount).toBeDefined();
      });
    });
  });

  describe('Progress Reporting', () => {
    describe('GET /api/v1/work-tasks/{taskId}/progress - Get Task Progress', () => {
      it('should successfully retrieve task progress', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123/progress', 'GET', null, {
          taskId: 'task-123'
        });
        const result = await getTaskProgress(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.progress).toBeDefined();
        expect(responseBody.progress.completion_percentage).toBeDefined();
        expect(responseBody.blockers).toBeDefined();
      });
    });

    describe('GET /api/v1/work-tasks/{taskId}/progress-report - Generate Progress Report', () => {
      it('should successfully generate progress report', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123/progress-report', 'GET', null, {
          taskId: 'task-123'
        }, {
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T23:59:59.999Z'
        });
        const result = await generateProgressReport(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.task_id).toBe('task-123');
        expect(responseBody.report_period).toBeDefined();
        expect(responseBody.summary).toBeDefined();
        expect(responseBody.completed_items).toBeDefined();
        expect(responseBody.blocked_items).toBeDefined();
      });

      it('should return 400 for invalid date format', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123/progress-report', 'GET', null, {
          taskId: 'task-123'
        }, {
          startDate: 'invalid-date',
          endDate: '2024-01-31T23:59:59.999Z'
        });
        const result = await generateProgressReport(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Invalid date format');
      });

      it('should return 400 when start date is after end date', async () => {
        const event = createMockEvent('/api/v1/work-tasks/task-123/progress-report', 'GET', null, {
          taskId: 'task-123'
        }, {
          startDate: '2024-01-31T00:00:00.000Z',
          endDate: '2024-01-01T23:59:59.999Z'
        });
        const result = await generateProgressReport(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Start date must be before end date');
      });
    });
  });

  describe('Quality Checks', () => {
    describe('POST /api/v1/deliverables/{deliverableId}/quality-check - Perform Quality Check', () => {
      it('should successfully perform quality check', async () => {
        const qualityOptions = {
          standards: ['completeness', 'accuracy', 'format']
        };

        const event = createMockEvent('/api/v1/deliverables/deliverable-123/quality-check', 'POST', qualityOptions, {
          deliverableId: 'deliverable-123'
        });
        const result = await performQualityCheck(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.deliverable_id).toBe('deliverable-123');
        expect(responseBody.quality_assessment).toBeDefined();
        expect(responseBody.validation_result).toBeDefined();
        expect(responseBody.overall_status).toBeDefined();
      });

      it('should return 400 for invalid quality standards', async () => {
        const qualityOptions = {
          standards: ['invalid-standard']
        };

        const event = createMockEvent('/api/v1/deliverables/deliverable-123/quality-check', 'POST', qualityOptions, {
          deliverableId: 'deliverable-123'
        });
        const result = await performQualityCheck(event);

        expect(result.statusCode).toBe(400);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.message).toContain('Invalid quality standards');
      });
    });

    describe('GET /api/v1/deliverables/{deliverableId}/quality-report - Get Quality Report', () => {
      it('should successfully retrieve quality report', async () => {
        const event = createMockEvent('/api/v1/deliverables/deliverable-123/quality-report', 'GET', null, {
          deliverableId: 'deliverable-123'
        });
        const result = await getQualityReport(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.deliverable_id).toBe('deliverable-123');
        expect(responseBody.current_assessment).toBeDefined();
        expect(responseBody.validation_status).toBeDefined();
      });

      it('should return summary format when requested', async () => {
        const event = createMockEvent('/api/v1/deliverables/deliverable-123/quality-report', 'GET', null, {
          deliverableId: 'deliverable-123'
        }, {
          format: 'summary'
        });
        const result = await getQualityReport(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.deliverable_id).toBe('deliverable-123');
        expect(responseBody.overall_score).toBeDefined();
        expect(responseBody.is_compliant).toBeDefined();
        expect(responseBody.is_valid).toBeDefined();
        // Should not have detailed assessment data in summary format
        expect(responseBody.current_assessment).toBeUndefined();
      });
    });

    describe('POST /api/v1/work-tasks/{taskId}/batch-quality-check - Batch Quality Check', () => {
      it('should successfully perform batch quality check', async () => {
        const batchOptions = {
          standards: ['completeness', 'accuracy'],
          includeValidation: true
        };

        const event = createMockEvent('/api/v1/work-tasks/task-123/batch-quality-check', 'POST', batchOptions, {
          taskId: 'task-123'
        });
        const result = await batchQualityCheck(event);

        expect(result.statusCode).toBe(200);
        const responseBody = JSON.parse(result.body);
        expect(responseBody.task_id).toBe('task-123');
        expect(responseBody.batch_id).toBeDefined();
        expect(responseBody.summary).toBeDefined();
        expect(responseBody.results).toBeDefined();
        expect(Array.isArray(responseBody.results)).toBe(true);
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 for missing authorization', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET');
      delete event.requestContext.authorizer;

      const result = await getWorkTasks(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.errorCode).toBe('UNAUTHORIZED');
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

  describe('Error Handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'POST');
      event.body = 'invalid-json{';

      const result = await submitWorkTask(event);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.errorCode).toBe('INTERNAL_ERROR');
    });

    it('should include correlation ID in all responses', async () => {
      const event = createMockEvent('/api/v1/work-tasks', 'GET');
      const result = await getWorkTasks(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['X-Correlation-ID']).toBe('test-correlation-id');
    });
  });
});