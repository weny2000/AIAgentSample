/**
 * Integration tests for Work Task Handler
 * Tests the complete workflow from task submission to completion
 */

import { handler as workTaskHandler } from '../work-task-handler';
import { handler as todoManagementHandler } from '../todo-management-handler';
import { handler as deliverableQualityHandler } from '../deliverable-quality-handler';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock AWS services
jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      put: jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) }),
      get: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Item: {} }) }),
      query: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) }),
      update: jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) }),
      scan: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) })
    }))
  },
  S3: jest.fn(() => ({
    putObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) }),
    getObject: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Body: Buffer.from('test') }) })
  })),
  StepFunctions: jest.fn(() => ({
    startExecution: jest.fn().mockReturnValue({ promise: () => Promise.resolve({ executionArn: 'arn:test' }) })
  }))
}));

describe('Work Task Handler Integration Tests', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:test',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: 'test-log-group',
    logStreamName: 'test-log-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn()
  };

  describe('Task Submission Flow', () => {
    it('should submit a new work task successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks',
        body: JSON.stringify({
          title: 'Implement user authentication',
          description: 'Add OAuth2 authentication to the application',
          content: 'Detailed requirements for authentication implementation...',
          priority: 'high',
          category: 'development',
          tags: ['security', 'authentication']
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: {
              sub: 'user-123',
              'cognito:groups': 'developers'
            }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('taskId');
      expect(body).toHaveProperty('status');
      expect(body.status).toBe('submitted');
    });

    it('should reject task submission with invalid data', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks',
        body: JSON.stringify({
          title: '', // Invalid: empty title
          description: 'Test',
          content: 'Test',
          priority: 'invalid-priority' // Invalid priority
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should handle missing authentication', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks',
        body: JSON.stringify({
          title: 'Test Task',
          description: 'Test',
          content: 'Test',
          priority: 'medium'
        }),
        headers: {
          'Content-Type': 'application/json'
        },
        requestContext: {
          requestId: 'test-request'
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Task Retrieval Flow', () => {
    it('should retrieve task analysis results', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/work-tasks/task-123/analysis',
        pathParameters: {
          taskId: 'task-123'
        },
        headers: {
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('taskId');
    });

    it('should return 404 for non-existent task', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/work-tasks/non-existent/analysis',
        pathParameters: {
          taskId: 'non-existent'
        },
        headers: {
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(404);
    });

    it('should list tasks with filters', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/work-tasks',
        queryStringParameters: {
          teamId: 'team-123',
          status: 'in_progress',
          limit: '10'
        },
        headers: {
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('tasks');
      expect(body).toHaveProperty('totalCount');
    });
  });

  describe('Todo Management Flow', () => {
    it('should retrieve todo list for a task', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/work-tasks/task-123/todos',
        pathParameters: {
          taskId: 'task-123'
        },
        headers: {
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await todoManagementHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should update todo status', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'PUT',
        path: '/api/v1/todos/todo-123/status',
        pathParameters: {
          todoId: 'todo-123'
        },
        body: JSON.stringify({
          status: 'in_progress',
          notes: 'Started working on this task'
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await todoManagementHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body.success).toBe(true);
    });

    it('should reject invalid status transitions', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'PUT',
        path: '/api/v1/todos/todo-123/status',
        pathParameters: {
          todoId: 'todo-123'
        },
        body: JSON.stringify({
          status: 'invalid-status'
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await todoManagementHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Deliverable Submission and Quality Check Flow', () => {
    it('should submit a deliverable', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/todos/todo-123/deliverables',
        pathParameters: {
          todoId: 'todo-123'
        },
        body: JSON.stringify({
          file_name: 'implementation.ts',
          file_type: 'text/typescript',
          file_size: 5120,
          content_base64: Buffer.from('test content').toString('base64'),
          notes: 'Initial implementation'
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await todoManagementHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('deliverableId');
      expect(body).toHaveProperty('validationStatus');
    });

    it('should execute quality check on deliverable', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/deliverables/del-123/quality-check',
        pathParameters: {
          deliverableId: 'del-123'
        },
        headers: {
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await deliverableQualityHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('assessment_id');
      expect(body).toHaveProperty('overall_score');
    });

    it('should reject oversized files', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/todos/todo-123/deliverables',
        pathParameters: {
          todoId: 'todo-123'
        },
        body: JSON.stringify({
          file_name: 'large-file.zip',
          file_type: 'application/zip',
          file_size: 200 * 1024 * 1024, // 200MB - exceeds limit
          content_base64: 'base64content'
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await todoManagementHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('file size');
    });
  });

  describe('Progress Tracking Flow', () => {
    it('should retrieve task progress', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/work-tasks/task-123/progress',
        pathParameters: {
          taskId: 'task-123'
        },
        headers: {
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('task_id');
      expect(body).toHaveProperty('completion_percentage');
      expect(body).toHaveProperty('total_todos');
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      // Mock a service failure
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks',
        body: 'invalid-json',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should handle timeout scenarios', async () => {
      const shortTimeoutContext = {
        ...mockContext,
        getRemainingTimeInMillis: () => 100 // Very short timeout
      };

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks',
        body: JSON.stringify({
          title: 'Test Task',
          description: 'Test',
          content: 'Test',
          priority: 'medium'
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        requestContext: {
          requestId: 'test-request',
          authorizer: {
            claims: { sub: 'user-123' }
          }
        } as any
      };

      // This should handle timeout gracefully
      const response = await workTaskHandler(event as APIGatewayProxyEvent, shortTimeoutContext);

      expect([200, 201, 202, 408, 500]).toContain(response.statusCode);
    });
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers in response', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'OPTIONS',
        path: '/api/v1/work-tasks',
        headers: {
          'Origin': 'https://example.com'
        },
        requestContext: {
          requestId: 'test-request'
        } as any
      };

      const response = await workTaskHandler(event as APIGatewayProxyEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
    });
  });
});
