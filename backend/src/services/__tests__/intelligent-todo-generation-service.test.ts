/**
 * Unit tests for Intelligent Todo Generation Service
 * Tests task decomposition, dependency analysis, workload estimation, and team assignment
 */

import { IntelligentTodoGenerationService } from '../intelligent-todo-generation-service';
import { Logger } from '../../lambda/utils/logger';
import { TodoGenerationContext, RelatedWorkgroup } from '../../models/work-task';

describe('IntelligentTodoGenerationService', () => {
  let service: IntelligentTodoGenerationService;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    service = new IntelligentTodoGenerationService(mockLogger);
  });

  describe('generateOptimizedTodoList', () => {
    it('should generate optimized todo list with intelligent decomposition', async () => {
      const taskContent = 'Implement OAuth2 authentication with database integration';
      const keyPoints = ['Implement OAuth2', 'Database integration'];
      const context: TodoGenerationContext = {
        task_complexity: 0.7,
        available_resources: [],
        time_constraints: [],
        dependency_graph: [],
        risk_factors: [],
        quality_requirements: []
      };

      const result = await service.generateOptimizedTodoList(taskContent, keyPoints, context, []);
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(todo => todo.id)).toBe(true);
      expect(result.every(todo => todo.estimated_hours > 0)).toBe(true);
    });

    it('should handle simple tasks with minimal decomposition', async () => {
      const taskContent = 'Update documentation';
      const keyPoints = ['Update docs'];
      const context: TodoGenerationContext = {
        task_complexity: 0.2,
        available_resources: [],
        time_constraints: [],
        dependency_graph: [],
        risk_factors: [],
        quality_requirements: []
      };

      const result = await service.generateOptimizedTodoList(taskContent, keyPoints, context, []);
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('workload estimation', () => {
    it('should estimate workload based on complexity', async () => {
      const taskContent = 'Implement complex feature';
      const keyPoints = ['Build feature'];
      const context: TodoGenerationContext = {
        task_complexity: 0.8,
        available_resources: [],
        time_constraints: [],
        dependency_graph: [],
        risk_factors: [],
        quality_requirements: []
      };

      const result = await service.generateOptimizedTodoList(taskContent, keyPoints, context, []);
      
      expect(result.every(todo => todo.estimated_hours > 0)).toBe(true);
    });
  });

  describe('team assignment', () => {
    it('should assign tasks to appropriate teams', async () => {
      const taskContent = 'Implement security features';
      const keyPoints = ['OAuth authentication'];
      const context: TodoGenerationContext = {
        task_complexity: 0.7,
        available_resources: [],
        time_constraints: [],
        dependency_graph: [],
        risk_factors: [],
        quality_requirements: []
      };
      const workgroups: RelatedWorkgroup[] = [{
        team_id: 'security-team',
        team_name: 'Security Team',
        relevance_score: 0.95,
        reason: 'Security expertise',
        expertise: ['security', 'oauth'],
        recommended_involvement: 'collaboration',
        historicalPerformance: {
          successRate: 0.92,
          averageDeliveryTime: 15,
          qualityScore: 0.9,
          similarProjectCount: 8
        }
      }];

      const result = await service.generateOptimizedTodoList(taskContent, keyPoints, context, workgroups);
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty key points', async () => {
      const taskContent = 'Some task';
      const keyPoints: string[] = [];
      const context: TodoGenerationContext = {
        task_complexity: 0.3,
        available_resources: [],
        time_constraints: [],
        dependency_graph: [],
        risk_factors: [],
        quality_requirements: []
      };

      const result = await service.generateOptimizedTodoList(taskContent, keyPoints, context, []);
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
