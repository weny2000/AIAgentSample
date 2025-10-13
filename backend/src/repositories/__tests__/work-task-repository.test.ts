/**
 * Unit tests for Work Task Repository
 * Tests CRUD operations and query functionality
 */

import { DynamoDB } from 'aws-sdk';
import { WorkTaskRepository } from '../work-task-repository';
import { WorkTaskRecord, TodoItemRecord, DeliverableRecord } from '../../models/work-task-models';

// Mock DynamoDB
const mockPut = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });
const mockGet = jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Item: {} }) });
const mockQuery = jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });
const mockUpdate = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });
const mockDelete = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });
const mockScan = jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      put: mockPut,
      get: mockGet,
      query: mockQuery,
      update: mockUpdate,
      delete: mockDelete,
      scan: mockScan
    }))
  }
}));

describe('WorkTaskRepository', () => {
  let repository: WorkTaskRepository;
  let dynamoDb: DynamoDB.DocumentClient;

  beforeEach(() => {
    dynamoDb = new DynamoDB.DocumentClient();
    repository = new WorkTaskRepository(dynamoDb);
    jest.clearAllMocks();
  });

  describe('createWorkTask', () => {
    it('should create a new work task', async () => {
      const task: WorkTaskRecord = {
        id: 'task-123',
        task_id: 'task-123',
        title: 'Test Task',
        description: 'Test Description',
        content: 'Test Content',
        submitted_by: 'user-123',
        team_id: 'team-123',
        priority: 'medium',
        status: 'submitted',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await repository.createWorkTask(task);

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: expect.any(String),
          Item: task
        })
      );
    });
  });
});
