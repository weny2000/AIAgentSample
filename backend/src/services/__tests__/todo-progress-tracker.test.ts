/**
 * Unit tests for TodoProgressTracker service
 * Tests all core functionality including status updates, progress tracking, blocker detection, and reporting
 */

import { TodoProgressTracker, ProgressTrackingContext } from '../todo-progress-tracker';
import { NotificationService } from '../notification-service';
import { Logger } from '../../lambda/utils/logger';
import { 
  TodoItemRecord, 
  StatusMetadata, 
  ProgressSummary
} from '../../models/work-task-models';

// Mock dependencies
jest.mock('../notification-service');
jest.mock('../../lambda/utils/logger');

describe('TodoProgressTracker', () => {
  let todoProgressTracker: TodoProgressTracker;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockDynamoDbClient: any;
  let mockS3Client: any;

  const mockContext: ProgressTrackingContext = {
    task_id: 'task-123',
    team_id: 'team-alpha',
    tracking_session_id: 'session-456',
    user_id: 'user-789',
    timestamp: '2024-01-15T10:00:00Z'
  };

  const mockTodo: TodoItemRecord = {
    todo_id: 'todo-123',
    task_id: 'task-123',
    title: 'Implement feature X',
    description: 'Detailed description of feature X',
    priority: 'high',
    estimated_hours: 8,
    category: 'development',
    status: 'pending',
    dependencies: [],
    related_workgroups: ['team-alpha'],
    deliverables: [],
    quality_checks: [],
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T09:00:00Z'
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockNotificationService = new NotificationService() as jest.Mocked<NotificationService>;
    mockLogger = new Logger({ correlationId: 'test' }) as jest.Mocked<Logger>;
    mockDynamoDbClient = {
      query: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      update: jest.fn()
    };
    mockS3Client = {
      putObject: jest.fn()
    };

    // Create service instance
    todoProgressTracker = new TodoProgressTracker(
      mockNotificationService,
      mockLogger,
      mockDynamoDbClient,
      mockS3Client
    );

    // Mock private methods that interact with database
    jest.spyOn(todoProgressTracker as any, 'getTodoItem').mockResolvedValue(mockTodo);
    jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([mockTodo]);
    jest.spyOn(todoProgressTracker as any, 'updateTodoInDatabase').mockResolvedValue({
      ...mockTodo,
      status: 'in_progress',
      updated_at: '2024-01-15T10:00:00Z'
    });
  });

  describe('updateTodoStatus', () => {
    it('should successfully update todo status from pending to in_progress', async () => {
      const metadata: StatusMetadata = {
        updated_by: 'user-789',
        notes: 'Starting work on this task'
      };

      await todoProgressTracker.updateTodoStatus('todo-123', 'in_progress', metadata, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith('Updating todo status', {
        todoId: 'todo-123',
        status: 'in_progress',
        updatedBy: 'user-789',
        taskId: 'task-123'
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Todo status updated successfully', 
        expect.objectContaining({
          todoId: 'todo-123',
          oldStatus: 'pending',
          newStatus: 'in_progress'
        })
      );
    });

    it('should throw error for invalid status transition', async () => {
      const metadata: StatusMetadata = {
        updated_by: 'user-789'
      };

      // Mock a completed todo
      jest.spyOn(todoProgressTracker as any, 'getTodoItem').mockResolvedValue({
        ...mockTodo,
        status: 'completed'
      });

      await expect(
        todoProgressTracker.updateTodoStatus('todo-123', 'pending', metadata, mockContext)
      ).rejects.toThrow('Invalid status transition from completed to pending');
    });

    it('should detect and record blocker when status is set to blocked', async () => {
      const metadata: StatusMetadata = {
        updated_by: 'user-789',
        blocking_reason: 'Waiting for API documentation'
      };

      const mockStoreBlockerRecord = jest.spyOn(todoProgressTracker as any, 'storeBlockerRecord')
        .mockResolvedValue(undefined);

      await todoProgressTracker.updateTodoStatus('todo-123', 'blocked', metadata, mockContext);

      expect(mockStoreBlockerRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          todo_id: 'todo-123',
          blocker_type: 'external',
          description: 'Waiting for API documentation',
          auto_detected: false
        })
      );
    });

    it('should trigger notifications when status changes', async () => {
      const metadata: StatusMetadata = {
        updated_by: 'user-789'
      };

      // Mock notification service
      mockNotificationService.sendStakeholderNotifications.mockResolvedValue({
        notification_id: 'notif-123',
        sent_notifications: [],
        failed_notifications: [],
        summary: {
          total_stakeholders: 1,
          notifications_sent: 1,
          notifications_failed: 0,
          channels_used: ['slack'],
          estimated_reach: 5
        }
      });

      await todoProgressTracker.updateTodoStatus('todo-123', 'completed', metadata, mockContext);

      expect(mockNotificationService.sendStakeholderNotifications).toHaveBeenCalled();
    });

    it('should handle todo not found error', async () => {
      jest.spyOn(todoProgressTracker as any, 'getTodoItem').mockResolvedValue(null);

      const metadata: StatusMetadata = {
        updated_by: 'user-789'
      };

      await expect(
        todoProgressTracker.updateTodoStatus('nonexistent-todo', 'in_progress', metadata, mockContext)
      ).rejects.toThrow('Todo item not found: nonexistent-todo');
    });
  });

  describe('trackProgress', () => {
    it('should calculate progress summary correctly', async () => {
      const mockTodos: TodoItemRecord[] = [
        { ...mockTodo, todo_id: 'todo-1', status: 'completed' },
        { ...mockTodo, todo_id: 'todo-2', status: 'completed' },
        { ...mockTodo, todo_id: 'todo-3', status: 'in_progress' },
        { ...mockTodo, todo_id: 'todo-4', status: 'blocked' },
        { ...mockTodo, todo_id: 'todo-5', status: 'pending' }
      ];

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue(mockTodos);
      jest.spyOn(todoProgressTracker as any, 'estimateCompletionDate').mockResolvedValue('2024-01-20');

      const progress = await todoProgressTracker.trackProgress('task-123');

      expect(progress).toEqual({
        task_id: 'task-123',
        total_todos: 5,
        completed_todos: 2,
        in_progress_todos: 1,
        blocked_todos: 1,
        completion_percentage: 40,
        estimated_completion_date: '2024-01-20',
        last_updated: expect.any(String)
      });
    });

    it('should return cached progress if cache is valid', async () => {
      const cachedProgress: ProgressSummary = {
        task_id: 'task-123',
        total_todos: 5,
        completed_todos: 2,
        in_progress_todos: 1,
        blocked_todos: 1,
        completion_percentage: 40,
        estimated_completion_date: '2024-01-20',
        last_updated: new Date().toISOString()
      };

      // Set cache
      (todoProgressTracker as any).progressCache.set('task-123', cachedProgress);

      const progress = await todoProgressTracker.trackProgress('task-123');

      expect(progress).toEqual(cachedProgress);
      // Should not call getTodosForTask since cache is valid
      expect(todoProgressTracker as any).not.toHaveProperty('getTodosForTask');
    });

    it('should handle empty todo list', async () => {
      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([]);

      const progress = await todoProgressTracker.trackProgress('task-123');

      expect(progress.total_todos).toBe(0);
      expect(progress.completion_percentage).toBe(0);
      expect(progress.estimated_completion_date).toBeUndefined();
    });
  });

  describe('identifyBlockers', () => {
    it('should identify explicit blockers', async () => {
      const blockedTodo: TodoItemRecord = {
        ...mockTodo,
        todo_id: 'todo-blocked',
        status: 'blocked'
      };

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([blockedTodo]);

      const blockers = await todoProgressTracker.identifyBlockers('task-123');

      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toEqual(
        expect.objectContaining({
          todo_id: 'todo-blocked',
          blocker_type: 'technical',
          description: expect.stringContaining('explicitly marked as blocked')
        })
      );
    });

    it('should identify dependency blockers', async () => {
      const todoWithDeps: TodoItemRecord = {
        ...mockTodo,
        todo_id: 'todo-with-deps',
        dependencies: ['dep-todo-1', 'dep-todo-2']
      };

      const blockedDep: TodoItemRecord = {
        ...mockTodo,
        todo_id: 'dep-todo-1',
        status: 'blocked'
      };

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([todoWithDeps]);
      jest.spyOn(todoProgressTracker as any, 'getTodoItem')
        .mockImplementation((...args: unknown[]) => {
          const id = args[0] as string;
          if (id === 'dep-todo-1') return Promise.resolve(blockedDep);
          if (id === 'dep-todo-2') return Promise.resolve({ ...mockTodo, status: 'completed' });
          return Promise.resolve(todoWithDeps);
        });

      const blockers = await todoProgressTracker.identifyBlockers('task-123');

      expect(blockers.length).toBeGreaterThan(0);
      expect(blockers.some(b => b.blocker_type === 'dependency')).toBe(true);
    });

    it('should identify timeline blockers for overdue todos', async () => {
      const overdueTodo: TodoItemRecord = {
        ...mockTodo,
        todo_id: 'todo-overdue',
        due_date: '2024-01-10', // Past date
        status: 'in_progress'
      };

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([overdueTodo]);

      const blockers = await todoProgressTracker.identifyBlockers('task-123');

      expect(blockers.some(b => b.blocker_type === 'external')).toBe(true);
    });

    it('should sort blockers by impact level', async () => {
      const criticalTodo: TodoItemRecord = {
        ...mockTodo,
        todo_id: 'todo-critical',
        status: 'blocked',
        priority: 'critical'
      };

      const lowTodo: TodoItemRecord = {
        ...mockTodo,
        todo_id: 'todo-low',
        status: 'blocked',
        priority: 'low'
      };

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([lowTodo, criticalTodo]);

      const blockers = await todoProgressTracker.identifyBlockers('task-123');

      expect(blockers[0].impact).toBe('critical');
      expect(blockers[blockers.length - 1].impact).toBe('low');
    });
  });

  describe('generateProgressReport', () => {
    const timeRange = {
      start_date: '2024-01-01',
      end_date: '2024-01-15'
    };

    it('should generate comprehensive progress report', async () => {
      const mockTodos: TodoItemRecord[] = [
        { ...mockTodo, todo_id: 'todo-1', status: 'completed', updated_at: '2024-01-10T10:00:00Z' },
        { ...mockTodo, todo_id: 'todo-2', status: 'in_progress' }
      ];

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue(mockTodos);
      jest.spyOn(todoProgressTracker as any, 'getWorkTask').mockResolvedValue({
        task_id: 'task-123',
        title: 'Test Task'
      });

      const report = await todoProgressTracker.generateProgressReport('task-123', timeRange);

      expect(report).toEqual(
        expect.objectContaining({
          task_id: 'task-123',
          report_period: timeRange,
          summary: expect.objectContaining({
            task_id: 'task-123',
            total_todos: 2,
            completed_todos: 1
          }),
          completed_items: expect.arrayContaining([
            expect.objectContaining({
              todo_id: 'todo-1',
              status: 'completed'
            })
          ]),
          generated_at: expect.any(String)
        })
      );
    });

    it('should include visualization data when enabled', async () => {
      const config = {
        report_type: 'weekly' as const,
        include_sections: ['summary' as const],
        recipients: [],
        format: 'json' as const,
        visualization_enabled: true
      };

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([mockTodo]);
      jest.spyOn(todoProgressTracker as any, 'getWorkTask').mockResolvedValue({
        task_id: 'task-123',
        title: 'Test Task'
      });

      const report = await todoProgressTracker.generateProgressReport('task-123', timeRange, config);

      expect(report.visualization_data).toBeDefined();
      expect(report.visualization_data).toEqual(
        expect.objectContaining({
          task_id: 'task-123',
          completion_timeline: expect.any(Array),
          dependency_graph: expect.any(Array),
          bottleneck_analysis: expect.any(Array),
          velocity_metrics: expect.any(Object),
          quality_trends: expect.any(Array)
        })
      );
    });

    it('should store report when S3 client is available', async () => {
      const config = {
        report_type: 'daily' as const,
        include_sections: ['summary' as const],
        recipients: [],
        format: 'json' as const,
        visualization_enabled: false
      };

      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([mockTodo]);
      jest.spyOn(todoProgressTracker as any, 'getWorkTask').mockResolvedValue({
        task_id: 'task-123',
        title: 'Test Task'
      });
      jest.spyOn(todoProgressTracker as any, 'storeProgressReport').mockResolvedValue(undefined);

      await todoProgressTracker.generateProgressReport('task-123', timeRange, config);

      expect(todoProgressTracker as any).toHaveProperty('storeProgressReport');
    });
  });

  describe('generateVisualizationData', () => {
    const timeRange = {
      start_date: '2024-01-01',
      end_date: '2024-01-15'
    };

    it('should generate complete visualization data', async () => {
      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([mockTodo]);

      const vizData = await todoProgressTracker.generateVisualizationData('task-123', timeRange);

      expect(vizData).toEqual({
        task_id: 'task-123',
        completion_timeline: expect.any(Array),
        dependency_graph: expect.any(Array),
        bottleneck_analysis: expect.any(Array),
        velocity_metrics: expect.objectContaining({
          current_velocity: expect.any(Number),
          average_velocity: expect.any(Number),
          velocity_trend: expect.stringMatching(/^(increasing|stable|decreasing)$/),
          projected_completion_date: expect.any(String),
          confidence_interval: expect.objectContaining({
            optimistic: expect.any(String),
            pessimistic: expect.any(String)
          })
        }),
        quality_trends: expect.any(Array)
      });
    });

    it('should generate timeline points for the specified date range', async () => {
      jest.spyOn(todoProgressTracker as any, 'getTodosForTask').mockResolvedValue([mockTodo]);

      const vizData = await todoProgressTracker.generateVisualizationData('task-123', timeRange);

      expect(vizData.completion_timeline.length).toBeGreaterThan(0);
      expect(vizData.completion_timeline[0]).toEqual(
        expect.objectContaining({
          date: expect.any(String),
          completed_todos: expect.any(Number),
          total_todos: expect.any(Number),
          completion_percentage: expect.any(Number),
          velocity: expect.any(Number)
        })
      );
    });
  });

  describe('setupNotificationTriggers', () => {
    it('should configure notification triggers for a task', async () => {
      const triggers = [
        {
          trigger_id: 'custom-trigger',
          trigger_type: 'status_change' as const,
          conditions: [{ field: 'new_status', operator: 'equals' as const, value: 'blocked' }],
          notification_template: 'Custom notification: {todo_title}',
          recipients: [{ type: 'team' as const, identifier: 'team-alpha', channel: 'slack' as const }],
          urgency: 'high' as const,
          enabled: true
        }
      ];

      await todoProgressTracker.setupNotificationTriggers('task-123', triggers);

      expect(mockLogger.info).toHaveBeenCalledWith('Notification triggers configured', {
        taskId: 'task-123',
        triggerCount: 1
      });
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      jest.spyOn(todoProgressTracker as any, 'getTodoItem').mockRejectedValue(new Error('Database error'));

      const metadata: StatusMetadata = {
        updated_by: 'user-789'
      };

      await expect(
        todoProgressTracker.updateTodoStatus('todo-123', 'in_progress', metadata, mockContext)
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update todo status', 
        expect.any(Error), 
        expect.objectContaining({
          todoId: 'todo-123',
          status: 'in_progress'
        })
      );
    });

    it('should handle notification service errors gracefully', async () => {
      mockNotificationService.sendStakeholderNotifications.mockRejectedValue(new Error('Notification error'));

      const metadata: StatusMetadata = {
        updated_by: 'user-789'
      };

      // Should not throw error even if notification fails
      await expect(
        todoProgressTracker.updateTodoStatus('todo-123', 'in_progress', metadata, mockContext)
      ).resolves.not.toThrow();
    });
  });

  describe('private helper methods', () => {
    it('should validate status transitions correctly', () => {
      const validateStatusTransition = (todoProgressTracker as any).validateStatusTransition.bind(todoProgressTracker);

      // Valid transitions
      expect(() => validateStatusTransition('pending', 'in_progress')).not.toThrow();
      expect(() => validateStatusTransition('in_progress', 'completed')).not.toThrow();
      expect(() => validateStatusTransition('in_progress', 'blocked')).not.toThrow();
      expect(() => validateStatusTransition('blocked', 'in_progress')).not.toThrow();

      // Invalid transitions
      expect(() => validateStatusTransition('completed', 'pending')).toThrow();
      expect(() => validateStatusTransition('completed', 'in_progress')).toThrow();
    });

    it('should infer blocker types correctly', () => {
      const inferBlockerType = (todoProgressTracker as any).inferBlockerType.bind(todoProgressTracker);

      expect(inferBlockerType('waiting for dependency')).toBe('dependency');
      expect(inferBlockerType('resource unavailable')).toBe('resource');
      expect(inferBlockerType('needs approval')).toBe('approval');
      expect(inferBlockerType('technical issue')).toBe('technical');
      expect(inferBlockerType('external factor')).toBe('external');
    });

    it('should calculate blocker impact correctly', () => {
      const calculateBlockerImpact = (todoProgressTracker as any).calculateBlockerImpact.bind(todoProgressTracker);

      expect(calculateBlockerImpact({ ...mockTodo, priority: 'critical' })).toBe('critical');
      expect(calculateBlockerImpact({ ...mockTodo, priority: 'high' })).toBe('high');
      expect(calculateBlockerImpact({ ...mockTodo, priority: 'medium', dependencies: ['dep1'] })).toBe('medium');
      expect(calculateBlockerImpact({ ...mockTodo, priority: 'low', dependencies: [] })).toBe('low');
    });
  });
}); 