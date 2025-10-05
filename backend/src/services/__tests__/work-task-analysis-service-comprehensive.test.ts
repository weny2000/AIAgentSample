/**
 * Comprehensive unit tests for WorkTaskAnalysisService
 * Tests all analysis capabilities including edge cases and error scenarios
 */

import { WorkTaskAnalysisService } from '../work-task-analysis-service';
import { KendraSearchService } from '../kendra-search-service';
import { WorkTaskContent, AnalysisContext } from '../../models/work-task';

// Mock dependencies
jest.mock('../kendra-search-service');
jest.mock('aws-sdk');

describe('WorkTaskAnalysisService - Comprehensive Tests', () => {
  let service: WorkTaskAnalysisService;
  let mockKendraService: jest.Mocked<KendraSearchService>;

  beforeEach(() => {
    mockKendraService = new KendraSearchService({} as any) as jest.Mocked<KendraSearchService>;
    service = new WorkTaskAnalysisService({
      kendraService: mockKendraService,
      dynamoDb: {} as any,
      s3: {} as any
    });
    jest.clearAllMocks();
  });

  describe('analyzeWorkTask', () => {
    const mockTaskContent: WorkTaskContent = {
      title: 'Implement User Authentication',
      description: 'Add OAuth2 authentication to the application',
      content: 'We need to implement OAuth2 authentication using AWS Cognito. The system should support social login providers including Google and Facebook.',
      priority: 'high',
      category: 'development',
      tags: ['security', 'authentication']
    };

    it('should perform complete task analysis', async () => {
      mockKendraService.search = jest.fn().mockResolvedValue({
        results: [
          {
            id: 'doc-1',
            title: 'OAuth2 Implementation Guide',
            excerpt: 'Guide for implementing OAuth2...',
            relevanceScore: 0.95
          }
        ]
      });

      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result).toHaveProperty('key_points');
      expect(result).toHaveProperty('related_workgroups');
      expect(result).toHaveProperty('todo_list');
      expect(result).toHaveProperty('knowledge_references');
      expect(result).toHaveProperty('risk_assessment');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('analysis_metadata');
    });

    it('should extract key points from task content', async () => {
      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result.key_points).toBeDefined();
      expect(result.key_points.length).toBeGreaterThan(0);
      expect(result.key_points[0]).toHaveProperty('text');
      expect(result.key_points[0]).toHaveProperty('category');
      expect(result.key_points[0]).toHaveProperty('importance');
    });

    it('should identify related workgroups', async () => {
      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result.related_workgroups).toBeDefined();
      expect(result.related_workgroups.length).toBeGreaterThan(0);
      expect(result.related_workgroups[0]).toHaveProperty('team_id');
      expect(result.related_workgroups[0]).toHaveProperty('relevance_score');
      expect(result.related_workgroups[0].relevance_score).toBeGreaterThanOrEqual(0);
      expect(result.related_workgroups[0].relevance_score).toBeLessThanOrEqual(1);
    });

    it('should generate structured todo list', async () => {
      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result.todo_list).toBeDefined();
      expect(result.todo_list.length).toBeGreaterThan(0);
      expect(result.todo_list[0]).toHaveProperty('title');
      expect(result.todo_list[0]).toHaveProperty('description');
      expect(result.todo_list[0]).toHaveProperty('priority');
      expect(result.todo_list[0]).toHaveProperty('estimated_hours');
      expect(result.todo_list[0]).toHaveProperty('dependencies');
    });

    it('should search knowledge base and include references', async () => {
      mockKendraService.search = jest.fn().mockResolvedValue({
        results: [
          {
            id: 'doc-1',
            title: 'OAuth2 Guide',
            excerpt: 'Implementation guide...',
            relevanceScore: 0.9,
            source: 'confluence'
          }
        ]
      });

      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(mockKendraService.search).toHaveBeenCalled();
      expect(result.knowledge_references).toBeDefined();
      expect(result.knowledge_references.length).toBeGreaterThan(0);
    });

    it('should assess risks in the task', async () => {
      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result.risk_assessment).toBeDefined();
      expect(result.risk_assessment).toHaveProperty('overall_risk_level');
      expect(result.risk_assessment).toHaveProperty('identified_risks');
      expect(result.risk_assessment).toHaveProperty('mitigation_suggestions');
    });

    it('should provide recommendations', async () => {
      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should include analysis metadata', async () => {
      const result = await service.analyzeWorkTask(mockTaskContent);

      expect(result.analysis_metadata).toBeDefined();
      expect(result.analysis_metadata).toHaveProperty('analysis_version');
      expect(result.analysis_metadata).toHaveProperty('processing_time_ms');
      expect(result.analysis_metadata).toHaveProperty('confidence_score');
      expect(result.analysis_metadata).toHaveProperty('analysis_timestamp');
    });
  });

  describe('extractKeyPoints', () => {
    it('should extract key points from simple content', async () => {
      const content = 'We need to implement user authentication. This is a high priority task.';
      
      const keyPoints = await service.extractKeyPoints(content);

      expect(keyPoints).toBeDefined();
      expect(keyPoints.length).toBeGreaterThan(0);
    });

    it('should categorize key points correctly', async () => {
      const content = `
        Objective: Implement OAuth2 authentication
        Milestone: Complete by end of Q1
        Constraint: Must support mobile devices
        Risk: Potential security vulnerabilities
        Dependency: Requires AWS Cognito setup
      `;

      const keyPoints = await service.extractKeyPoints(content);

      const categories = keyPoints.map(kp => kp.category);
      expect(categories).toContain('objective');
      expect(categories).toContain('milestone');
      expect(categories).toContain('constraint');
    });

    it('should assign importance levels', async () => {
      const content = 'Critical: Security implementation required. Nice to have: Dark mode support.';

      const keyPoints = await service.extractKeyPoints(content);

      expect(keyPoints.some(kp => kp.importance === 'critical')).toBe(true);
      expect(keyPoints.some(kp => kp.importance === 'low')).toBe(true);
    });

    it('should handle empty content', async () => {
      const keyPoints = await service.extractKeyPoints('');

      expect(keyPoints).toBeDefined();
      expect(Array.isArray(keyPoints)).toBe(true);
    });

    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(50000);

      const keyPoints = await service.extractKeyPoints(longContent);

      expect(keyPoints).toBeDefined();
      expect(Array.isArray(keyPoints)).toBe(true);
    });

    it('should extract source location for key points', async () => {
      const content = 'Section 1: Authentication. Section 2: Authorization.';

      const keyPoints = await service.extractKeyPoints(content);

      expect(keyPoints[0]).toHaveProperty('extracted_from');
      expect(keyPoints[0].extracted_from).toBeTruthy();
    });
  });

  describe('identifyRelatedWorkgroups', () => {
    it('should identify workgroups based on skills', async () => {
      const content = 'Need backend development and security expertise';
      const keyPoints = [
        { id: '1', text: 'Backend development', category: 'objective' as const, importance: 'high' as const, extracted_from: 'content' }
      ];

      const workgroups = await service.identifyRelatedWorkgroups(content, keyPoints);

      expect(workgroups).toBeDefined();
      expect(workgroups.length).toBeGreaterThan(0);
      expect(workgroups[0]).toHaveProperty('skills_matched');
    });

    it('should calculate relevance scores', async () => {
      const content = 'React frontend development needed';
      const keyPoints = [
        { id: '1', text: 'Frontend', category: 'objective' as const, importance: 'high' as const, extracted_from: 'content' }
      ];

      const workgroups = await service.identifyRelatedWorkgroups(content, keyPoints);

      workgroups.forEach(wg => {
        expect(wg.relevance_score).toBeGreaterThanOrEqual(0);
        expect(wg.relevance_score).toBeLessThanOrEqual(1);
      });
    });

    it('should include contact information', async () => {
      const content = 'Need DevOps support';
      const keyPoints = [];

      const workgroups = await service.identifyRelatedWorkgroups(content, keyPoints);

      if (workgroups.length > 0) {
        expect(workgroups[0]).toHaveProperty('contact_info');
      }
    });

    it('should sort workgroups by relevance', async () => {
      const content = 'Full stack development with focus on backend';
      const keyPoints = [];

      const workgroups = await service.identifyRelatedWorkgroups(content, keyPoints);

      if (workgroups.length > 1) {
        for (let i = 0; i < workgroups.length - 1; i++) {
          expect(workgroups[i].relevance_score).toBeGreaterThanOrEqual(workgroups[i + 1].relevance_score);
        }
      }
    });

    it('should handle no matching workgroups', async () => {
      const content = 'Very specific niche technology';
      const keyPoints = [];

      const workgroups = await service.identifyRelatedWorkgroups(content, keyPoints);

      expect(workgroups).toBeDefined();
      expect(Array.isArray(workgroups)).toBe(true);
    });
  });

  describe('generateTodoList', () => {
    it('should generate todos from task content', async () => {
      const content = 'Implement authentication system with OAuth2';
      const keyPoints = [
        { id: '1', text: 'Authentication', category: 'objective' as const, importance: 'high' as const, extracted_from: 'content' }
      ];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      expect(todos).toBeDefined();
      expect(todos.length).toBeGreaterThan(0);
    });

    it('should assign priorities to todos', async () => {
      const content = 'Critical: Setup infrastructure. Then implement features.';
      const keyPoints = [];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      expect(todos.some(todo => todo.priority === 'critical' || todo.priority === 'high')).toBe(true);
    });

    it('should identify dependencies between todos', async () => {
      const content = 'First setup database, then create API, finally build UI';
      const keyPoints = [];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      const todosWithDeps = todos.filter(todo => todo.dependencies.length > 0);
      expect(todosWithDeps.length).toBeGreaterThan(0);
    });

    it('should estimate hours for each todo', async () => {
      const content = 'Implement user registration and login';
      const keyPoints = [];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      todos.forEach(todo => {
        expect(todo.estimated_hours).toBeGreaterThan(0);
        expect(todo.estimated_hours).toBeLessThan(200); // Reasonable upper bound
      });
    });

    it('should categorize todos', async () => {
      const content = 'Research OAuth2, develop API, write tests, create documentation';
      const keyPoints = [];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      const categories = todos.map(todo => todo.category);
      expect(categories).toContain('development');
    });

    it('should include required skills for todos', async () => {
      const content = 'Implement React frontend with TypeScript';
      const keyPoints = [];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      expect(todos[0]).toHaveProperty('required_skills');
      expect(Array.isArray(todos[0].required_skills)).toBe(true);
    });

    it('should define deliverable requirements', async () => {
      const content = 'Create API documentation and implementation';
      const keyPoints = [];
      const knowledge = [];

      const todos = await service.generateTodoList(content, keyPoints, knowledge);

      expect(todos[0]).toHaveProperty('deliverable_requirements');
      expect(Array.isArray(todos[0].deliverable_requirements)).toBe(true);
    });
  });

  describe('assessRisks', () => {
    it('should identify technical risks', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Migrate to new database',
        description: 'Migrate from MySQL to PostgreSQL',
        content: 'Complex data migration with minimal downtime',
        priority: 'critical'
      };
      const context: AnalysisContext = {};

      const assessment = await service.assessRisks(taskContent, context);

      expect(assessment.identified_risks).toBeDefined();
      const technicalRisks = assessment.identified_risks.filter(r => r.category === 'technical');
      expect(technicalRisks.length).toBeGreaterThan(0);
    });

    it('should identify timeline risks', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Urgent feature',
        description: 'Implement by end of week',
        content: 'Complex feature with tight deadline',
        priority: 'critical'
      };
      const context: AnalysisContext = {};

      const assessment = await service.assessRisks(taskContent, context);

      const timelineRisks = assessment.identified_risks.filter(r => r.category === 'timeline');
      expect(timelineRisks.length).toBeGreaterThan(0);
    });

    it('should assess probability and impact', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Test task',
        description: 'Test',
        content: 'Test content',
        priority: 'medium'
      };
      const context: AnalysisContext = {};

      const assessment = await service.assessRisks(taskContent, context);

      assessment.identified_risks.forEach(risk => {
        expect(['low', 'medium', 'high']).toContain(risk.probability);
        expect(['low', 'medium', 'high']).toContain(risk.impact);
      });
    });

    it('should provide mitigation suggestions', async () => {
      const taskContent: WorkTaskContent = {
        title: 'High risk task',
        description: 'Complex integration',
        content: 'Integrate with third-party API',
        priority: 'high'
      };
      const context: AnalysisContext = {};

      const assessment = await service.assessRisks(taskContent, context);

      expect(assessment.mitigation_suggestions).toBeDefined();
      expect(assessment.mitigation_suggestions.length).toBeGreaterThan(0);
    });

    it('should calculate overall risk level', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Test task',
        description: 'Test',
        content: 'Test',
        priority: 'low'
      };
      const context: AnalysisContext = {};

      const assessment = await service.assessRisks(taskContent, context);

      expect(['low', 'medium', 'high', 'critical']).toContain(assessment.overall_risk_level);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate actionable recommendations', async () => {
      const analysisResult = {
        key_points: [],
        related_workgroups: [],
        todo_list: [],
        knowledge_references: [],
        risk_assessment: {
          overall_risk_level: 'medium' as const,
          identified_risks: [],
          mitigation_suggestions: []
        },
        recommendations: [],
        analysis_metadata: {
          analysis_version: '1.0',
          processing_time_ms: 1000,
          confidence_score: 0.8,
          knowledge_sources_consulted: 5,
          ai_model_used: 'test',
          analysis_timestamp: new Date().toISOString()
        }
      };

      const recommendations = await service.generateRecommendations(analysisResult);

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should recommend based on risk level', async () => {
      const highRiskResult = {
        key_points: [],
        related_workgroups: [],
        todo_list: [],
        knowledge_references: [],
        risk_assessment: {
          overall_risk_level: 'high' as const,
          identified_risks: [
            {
              id: '1',
              description: 'High complexity',
              category: 'technical' as const,
              probability: 'high' as const,
              impact: 'high' as const
            }
          ],
          mitigation_suggestions: []
        },
        recommendations: [],
        analysis_metadata: {
          analysis_version: '1.0',
          processing_time_ms: 1000,
          confidence_score: 0.8,
          knowledge_sources_consulted: 5,
          ai_model_used: 'test',
          analysis_timestamp: new Date().toISOString()
        }
      };

      const recommendations = await service.generateRecommendations(highRiskResult);

      expect(recommendations.some(r => r.toLowerCase().includes('risk'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Kendra search failures gracefully', async () => {
      mockKendraService.search = jest.fn().mockRejectedValue(new Error('Kendra unavailable'));

      const taskContent: WorkTaskContent = {
        title: 'Test',
        description: 'Test',
        content: 'Test',
        priority: 'medium'
      };

      const result = await service.analyzeWorkTask(taskContent);

      // Should still return analysis even if Kendra fails
      expect(result).toBeDefined();
      expect(result.knowledge_references).toBeDefined();
    });

    it('should handle invalid task content', async () => {
      const invalidContent: any = {
        title: '',
        description: '',
        content: '',
        priority: 'invalid'
      };

      await expect(service.analyzeWorkTask(invalidContent)).rejects.toThrow();
    });

    it('should handle timeout scenarios', async () => {
      jest.setTimeout(10000);

      const taskContent: WorkTaskContent = {
        title: 'Test',
        description: 'Test',
        content: 'Test',
        priority: 'medium'
      };

      // Should complete within reasonable time
      const startTime = Date.now();
      await service.analyzeWorkTask(taskContent);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds max
    });
  });
});
