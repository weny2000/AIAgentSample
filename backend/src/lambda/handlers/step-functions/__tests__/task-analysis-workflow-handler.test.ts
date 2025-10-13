// Mock all AWS SDK and service dependencies before importing
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-kendra');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('../../../../services/work-task-analysis-service');
jest.mock('../../../../services/kendra-search-service');
jest.mock('../../../../rules-engine/rules-engine-service');
jest.mock('../../../../repositories/audit-log-repository');

import { handler, TaskAnalysisWorkflowInput } from '../task-analysis-workflow-handler';

describe('Task Analysis Workflow Handler', () => {
  const mockTaskContent = {
    id: 'task-123',
    title: 'Test Task',
    description: 'Test Description',
    content: 'Test Content',
    submittedBy: 'user-123',
    teamId: 'team-123',
    submittedAt: new Date().toISOString(),
    priority: 'high' as const,
    category: 'development',
    tags: ['backend', 'api']
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extract_key_points step', () => {
    it('should extract key points successfully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'extract_key_points'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.taskId).toBe('task-123');
      expect(result.step).toBe('extract_key_points');
      expect(result.result).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: { ...mockTaskContent, id: '' }, // Invalid input
        step: 'extract_key_points'
      };

      const result = await handler(input);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });

  describe('search_knowledge step', () => {
    it('should search knowledge base successfully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'search_knowledge'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
    });
  });

  describe('identify_workgroups step', () => {
    it('should identify workgroups successfully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'identify_workgroups'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
    });
  });

  describe('generate_todos step', () => {
    it('should generate todos successfully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'generate_todos'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
    });
  });

  describe('assess_risks step', () => {
    it('should assess risks successfully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'assess_risks'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
    });
  });

  describe('compile_results step', () => {
    it('should compile results successfully', async () => {
      const input: TaskAnalysisWorkflowInput = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'compile_results',
        context: {
          keyPoints: ['Point 1', 'Point 2'],
          knowledgeReferences: [],
          relatedWorkgroups: [],
          todoList: [],
          riskAssessment: {},
          estimatedEffort: {},
          dependencies: [],
          complianceChecks: []
        }
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.compiledAt).toBeDefined();
    });
  });

  describe('unknown step', () => {
    it('should handle unknown step gracefully', async () => {
      const input: any = {
        taskId: 'task-123',
        taskContent: mockTaskContent,
        step: 'unknown_step'
      };

      const result = await handler(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unknown workflow step');
    });
  });
});
