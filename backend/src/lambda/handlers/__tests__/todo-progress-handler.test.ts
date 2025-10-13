/**
 * Unit tests for Todo Progress Handler Lambda function
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../todo-progress-handler';
import { TodoProgressTracker } from '../../../services/todo-progress-tracker';

// Mock the TodoProgressTracker
jest.mock('../../../services/todo-progress-tracker');
jest.mock('../../../services/notification-service');

// Mock the Logger
jest.mock('../../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    withContext: jest.fn().mockReturnThis(),
    context: { correlationId: 'test-correlation-id' }
  }))
}));

describe('Todo Progress Handler', () => {
  let mockTodoProgressTracker: jest.Mocked<TodoProgressTracker>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock TodoProgressTracker methods
    mockTodoProgressTracker = {
      updateTodoStatus: jest.fn(),
      trackProgress: jest.fn(),
      identifyBlockers: jest.fn(),
      generateProgressReport: jest.fn(),
      generateVisualizationData: jest.fn(),
      setupNotificationTriggers: jest.fn()
    } as any;

    // Replace the constructor mock
    (TodoProgressTracker as jest.MockedClass<typeof TodoProgressTracker>).mockImplementation(() => mockTodoProgressTracker);
  });

  const createMockEvent = (
    httpMethod: string,
    path: string,
    pathParameters?: Record<string, string>,
    body?: string,
    queryStringParameters?: Record<string, string>
  ): APIGatewayProxyEvent => ({
    httpMethod,
    path,
    pathParameters: pathParameters || null,
    body: body || null,
    queryStringParameters: queryStringParameters || null,
    headers: {
      'x-correlation-id': 'test-correlation-id',
      'x-team-id': 'test-team'
    },
    multiValueHeaders: {},
    isBase64Encoded: false,
    resource: '',
    requestContext: {} as any,
    multiValueQueryStringParameters: null,
    stageVariables: null
  });

  describe('PUT /todos/{todoId}/status', () => {
    it('should update todo status successfully', async () => {
      const event = createMockEvent(
        'PUT',
        '/todos/todo-123/status',
        { todoId: 'todo-123', taskId: 'task-456' },
        JSON.stringify({
          status: 'in_progress',
          updated_by: 'user-789',
          notes: 'Starting work on this task'
        })
      );

      mockTodoProgressTracker.updateTodoStatus.mockResolvedValue();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockTodoProgressTracker.updateTodoStatus).toHaveBeenCalledWith(
        'todo-123',
        'in_progress',
        {
          updated_by: 'user-789',
          notes: 'Starting work on this task',
          blocking_reason: undefined
        },
        expect.objectContaining({
          task_id: 'task-456',
          team_id: 'test-team',
          user_id: 'user-789'
        })
      );

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.todoId).toBe('todo-123');
      expect(responseBody.status).toBe('in_progress');
    });

    it('should return 400 if todo ID is missing', async () => {
      const event = createMockEvent(
        'PUT',
        '/todos/status',
        {},
        JSON.stringify({ status: 'in_progress', updated_by: 'user-789' })
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Todo ID is required');
    });

    it('should return 400 if required fields are missing', async () => {
      const event = createMockEvent(
        'PUT',
        '/todos/todo-123/status',
        { todoId: 'todo-123' },
        JSON.stringify({ status: 'in_progress' }) // missing updated_by
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Status and updated_by are required');
    });

    it('should handle service errors gracefully', async () => {
      const event = createMockEvent(
        'PUT',
        '/todos/todo-123/status',
        { todoId: 'todo-123' },
        JSON.stringify({
          status: 'in_progress',
          updated_by: 'user-789'
        })
      );

      mockTodoProgressTracker.updateTodoStatus.mockRejectedValue(new Error('Database error'));

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Failed to update todo status');
    });
  });

  describe('GET /tasks/{taskId}/progress', () => {
    it('should get progress successfully', async () => {
      const mockProgress = {
        task_id: 'task-123',
        total_todos: 10,
        completed_todos: 5,
        in_progress_todos: 2,
        blocked_todos: 1,
        completion_percentage: 50,
        last_updated: '2024-01-15T10:00:00Z'
      };

      const event = createMockEvent(
        'GET',
        '/tasks/task-123/progress',
        { taskId: 'task-123' }
      );

      mockTodoProgressTracker.trackProgress.mockResolvedValue(mockProgress);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockTodoProgressTracker.trackProgress).toHaveBeenCalledWith('task-123');

      const responseBody = JSON.parse(result.body);
      expect(responseBody).toEqual(mockProgress);
    });

    it('should return 400 if task ID is missing', async () => {
      const event = createMockEvent('GET', '/tasks/progress', {});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Task ID is required');
    });
  });

  describe('GET /tasks/{taskId}/blockers', () => {
    it('should get blockers successfully', async () => {
      const mockBlockers = [
        {
          todo_id: 'todo-1',
          blocker_type: 'dependency' as const,
          description: 'Waiting for dependency',
          impact: 'high' as const,
          suggested_resolution: 'Resolve dependency first',
          blocking_since: '2024-01-15T09:00:00Z'
        }
      ];

      const event = createMockEvent(
        'GET',
        '/tasks/task-123/blockers',
        { taskId: 'task-123' }
      );

      mockTodoProgressTracker.identifyBlockers.mockResolvedValue(mockBlockers);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockTodoProgressTracker.identifyBlockers).toHaveBeenCalledWith('task-123');

      const responseBody = JSON.parse(result.body);
      expect(responseBody.taskId).toBe('task-123');
      expect(responseBody.blockers).toEqual(mockBlockers);
      expect(responseBody.totalBlockers).toBe(1);
      expect(responseBody.criticalBlockers).toBe(0);
    });
  });

  describe('GET /tasks/{taskId}/report', () => {
    it('should generate report successfully', async () => {
      const mockReport = {
        task_id: 'task-123',
        report_period: {
          start_date: '2024-01-01',
          end_date: '2024-01-15'
        },
        summary: {
          task_id: 'task-123',
          total_todos: 10,
          completed_todos: 5,
          in_progress_todos: 2,
          blocked_todos: 1,
          completion_percentage: 50,
          last_updated: '2024-01-15T10:00:00Z'
        },
        completed_items: [],
        blocked_items: [],
        quality_metrics: {
          deliverables_submitted: 5,
          deliverables_approved: 4,
          average_quality_score: 85
        },
        team_performance: {
          velocity: 2.5,
          quality_trend: 'stable' as const
        },
        generated_at: '2024-01-15T10:00:00Z'
      };

      const event = createMockEvent(
        'GET',
        '/tasks/task-123/report',
        { taskId: 'task-123' },
        null,
        {
          start_date: '2024-01-01',
          end_date: '2024-01-15',
          format: 'json',
          visualization: 'false'
        }
      );

      mockTodoProgressTracker.generateProgressReport.mockResolvedValue(mockReport);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockTodoProgressTracker.generateProgressReport).toHaveBeenCalledWith(
        'task-123',
        { start_date: '2024-01-01', end_date: '2024-01-15' },
        expect.objectContaining({
          report_type: 'on_demand',
          format: 'json',
          visualization_enabled: false
        })
      );

      const responseBody = JSON.parse(result.body);
      expect(responseBody).toEqual(mockReport);
    });

    it('should return 400 if date range is missing', async () => {
      const event = createMockEvent(
        'GET',
        '/tasks/task-123/report',
        { taskId: 'task-123' },
        null,
        { start_date: '2024-01-01' } // missing end_date
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('start_date and end_date are required');
    });
  });

  describe('GET /tasks/{taskId}/visualization', () => {
    it('should get visualization data successfully', async () => {
      const mockVisualizationData = {
        task_id: 'task-123',
        completion_timeline: [],
        dependency_graph: [],
        bottleneck_analysis: [],
        velocity_metrics: {
          current_velocity: 2.5,
          average_velocity: 2.3,
          velocity_trend: 'increasing' as const,
          projected_completion_date: '2024-02-01',
          confidence_interval: {
            optimistic: '2024-01-28',
            pessimistic: '2024-02-05'
          }
        },
        quality_trends: []
      };

      const event = createMockEvent(
        'GET',
        '/tasks/task-123/visualization',
        { taskId: 'task-123' },
        null,
        {
          start_date: '2024-01-01',
          end_date: '2024-01-15'
        }
      );

      mockTodoProgressTracker.generateVisualizationData.mockResolvedValue(mockVisualizationData);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockTodoProgressTracker.generateVisualizationData).toHaveBeenCalledWith(
        'task-123',
        { start_date: '2024-01-01', end_date: '2024-01-15' }
      );

      const responseBody = JSON.parse(result.body);
      expect(responseBody).toEqual(mockVisualizationData);
    });
  });

  describe('POST /tasks/{taskId}/triggers', () => {
    it('should setup notification triggers successfully', async () => {
      const mockTriggers = [
        {
          trigger_id: 'test-trigger',
          trigger_type: 'status_change' as const,
          conditions: [{ field: 'new_status', operator: 'equals' as const, value: 'blocked' }],
          notification_template: 'Todo blocked: {todo_title}',
          recipients: [{ type: 'team' as const, identifier: 'team-alpha', channel: 'slack' as const }],
          urgency: 'high' as const,
          enabled: true
        }
      ];

      const event = createMockEvent(
        'POST',
        '/tasks/task-123/triggers',
        { taskId: 'task-123' },
        JSON.stringify({ triggers: mockTriggers })
      );

      mockTodoProgressTracker.setupNotificationTriggers.mockResolvedValue();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockTodoProgressTracker.setupNotificationTriggers).toHaveBeenCalledWith(
        'task-123',
        mockTriggers
      );

      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.triggerCount).toBe(1);
    });

    it('should return 400 if triggers array is missing', async () => {
      const event = createMockEvent(
        'POST',
        '/tasks/task-123/triggers',
        { taskId: 'task-123' },
        JSON.stringify({}) // missing triggers
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Triggers array is required');
    });
  });

  describe('Error handling', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const event = createMockEvent('DELETE', '/tasks/task-123/progress', { taskId: 'task-123' });

      const result = await handler(event);

      expect(result.statusCode).toBe(405);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Method not allowed');
    });

    it('should return 404 for unknown endpoints', async () => {
      const event = createMockEvent('GET', '/tasks/task-123/unknown', { taskId: 'task-123' });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Endpoint not found');
    });

    it('should handle unexpected errors gracefully', async () => {
      const event = createMockEvent(
        'GET',
        '/tasks/task-123/progress',
        { taskId: 'task-123' }
      );

      // Mock an unexpected error
      mockTodoProgressTracker.trackProgress.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toBe('Internal server error');
      expect(responseBody.correlationId).toBe('test-correlation-id');
    });
  });
});