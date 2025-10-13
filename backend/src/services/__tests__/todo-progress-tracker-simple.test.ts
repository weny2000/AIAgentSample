/**
 * Simple test to verify TodoProgressTracker functionality
 */

import { TodoProgressTracker } from '../todo-progress-tracker';
import { NotificationService } from '../notification-service';
import { Logger } from '../../lambda/utils/logger';

// Mock dependencies
jest.mock('../notification-service');
jest.mock('../../lambda/utils/logger');

describe('TodoProgressTracker', () => {
  let todoProgressTracker: TodoProgressTracker;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mock instances
    mockNotificationService = {
      sendStakeholderNotifications: jest.fn(),
      createCoordinationIssues: jest.fn()
    } as any;
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    // Create service instance
    todoProgressTracker = new TodoProgressTracker(
      mockNotificationService,
      mockLogger
    );
  });

  it('should create TodoProgressTracker instance', () => {
    expect(todoProgressTracker).toBeDefined();
    expect(todoProgressTracker).toBeInstanceOf(TodoProgressTracker);
  });

  it('should have required methods', () => {
    expect(typeof todoProgressTracker.updateTodoStatus).toBe('function');
    expect(typeof todoProgressTracker.trackProgress).toBe('function');
    expect(typeof todoProgressTracker.identifyBlockers).toBe('function');
    expect(typeof todoProgressTracker.generateProgressReport).toBe('function');
    expect(typeof todoProgressTracker.generateVisualizationData).toBe('function');
    expect(typeof todoProgressTracker.setupNotificationTriggers).toBe('function');
  });
});