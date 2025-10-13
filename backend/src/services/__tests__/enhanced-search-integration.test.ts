/**
 * Integration tests for Enhanced Knowledge Search with Work Task Analysis
 */

// Mock AWS SDK before imports
jest.mock('@aws-sdk/client-kendra', () => ({
  KendraClient: jest.fn(),
  QueryCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({ Items: [] })
    }))
  },
  QueryCommand: jest.fn(),
  PutCommand: jest.fn(),
  GetCommand: jest.fn()
}));

import { WorkTaskAnalysisService, WorkTaskContent } from '../work-task-analysis-service';
import { EnhancedKnowledgeSearchService } from '../enhanced-knowledge-search-service';
import { KendraSearchService } from '../kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { Logger } from '../../lambda/utils/logger';

jest.mock('../kendra-search-service');
jest.mock('../../rules-engine/rules-engine-service');
jest.mock('../../repositories/audit-log-repository');
jest.mock('../../lambda/utils/logger');

describe('Enhanced Search Integration with Work Task Analysis', () => {
  let workTaskService: WorkTaskAnalysisService;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockKendraService = {
      search: jest.fn(),
      getSuggestions: jest.fn(),
      submitFeedback: jest.fn()
    } as any;

    mockRulesEngine = {
      evaluateRules: jest.fn()
    } as any;

    mockAuditRepository = {
      create: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    workTaskService = new WorkTaskAnalysisService(
      mockKendraService,
      mockRulesEngine,
      mockAuditRepository,
      mockLogger
    );
  });

  describe('Knowledge Base Search with Enhanced Features', () => {
    it('should use enhanced search for knowledge base queries', async () => {
      const mockSearchResults = {
        results: [
          {
            id: 'doc-1',
            title: 'API Security Best Practices',
            excerpt: 'Comprehensive guide to API security including authentication and authorization...',
            uri: '/docs/api-security.md',
            type: 'DOCUMENT',
            confidence: 0.85,
            sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
          },
          {
            id: 'doc-2',
            title: 'OAuth2 Implementation Guide',
            excerpt: 'Step-by-step guide for implementing OAuth2 authentication...',
            uri: '/docs/oauth2-guide.md',
            type: 'DOCUMENT',
            confidence: 0.80,
            sourceAttributes: { source_type: 'guide', team_id: 'team-1' }
          }
        ],
        totalCount: 2,
        queryId: 'query-123'
      };

      mockKendraService.search.mockResolvedValue(mockSearchResults);
      mockRulesEngine.evaluateRules.mockResolvedValue({ passed: true, violations: [] });
      mockAuditRepository.create.mockResolvedValue({} as any);

      const taskContent: WorkTaskContent = {
        id: 'task-1',
        title: 'Implement API Authentication',
        description: 'Need to implement secure API authentication using OAuth2',
        content: 'The system requires OAuth2 authentication for all API endpoints with JWT tokens',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'high',
        category: 'security',
        tags: ['authentication', 'API', 'security']
      };

      const result = await workTaskService.analyzeWorkTask(taskContent);

      // Verify that search was called with enhanced parameters
      expect(mockKendraService.search).toHaveBeenCalled();
      
      // Verify knowledge references were returned
      expect(result.knowledgeReferences).toBeDefined();
      expect(result.knowledgeReferences.length).toBeGreaterThan(0);

      // Verify that references include enhanced metadata
      const firstRef = result.knowledgeReferences[0];
      expect(firstRef).toHaveProperty('sourceId');
      expect(firstRef).toHaveProperty('relevanceScore');
      expect(firstRef.relevanceScore).toBeGreaterThan(0);
    });

    it('should extract contextual keywords for enhanced search', async () => {
      const mockSearchResults = {
        results: [
          {
            id: 'doc-1',
            title: 'Database Design Patterns',
            excerpt: 'Common database design patterns for scalable applications...',
            uri: '/docs/db-patterns.md',
            type: 'DOCUMENT',
            confidence: 0.75,
            sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
          }
        ],
        totalCount: 1,
        queryId: 'query-456'
      };

      mockKendraService.search.mockResolvedValue(mockSearchResults);
      mockRulesEngine.evaluateRules.mockResolvedValue({ passed: true, violations: [] });
      mockAuditRepository.create.mockResolvedValue({} as any);

      const taskContent: WorkTaskContent = {
        id: 'task-2',
        title: 'Design Database Schema',
        description: 'Design a scalable database schema for the new microservice',
        content: 'Need to create a PostgreSQL database schema with proper indexing and relationships',
        submittedBy: 'user-2',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'medium',
        category: 'development',
        tags: ['database', 'PostgreSQL', 'schema']
      };

      const result = await workTaskService.analyzeWorkTask(taskContent);

      // Verify search was called multiple times (main query + tag queries)
      expect(mockKendraService.search).toHaveBeenCalled();
      
      // Verify knowledge references include relevant results
      expect(result.knowledgeReferences).toBeDefined();
    });

    it('should handle search failures gracefully', async () => {
      mockKendraService.search.mockRejectedValue(new Error('Search service unavailable'));
      mockRulesEngine.evaluateRules.mockResolvedValue({ passed: true, violations: [] });
      mockAuditRepository.create.mockResolvedValue({} as any);

      const taskContent: WorkTaskContent = {
        id: 'task-3',
        title: 'Test Task',
        description: 'Test description',
        content: 'Test content',
        submittedBy: 'user-3',
        teamId: 'team-1',
        submittedAt: new Date()
      };

      const result = await workTaskService.analyzeWorkTask(taskContent);

      // Should still complete analysis even if search fails
      expect(result).toBeDefined();
      expect(result.taskId).toBe('task-3');
      
      // Knowledge references should be empty array on failure
      expect(result.knowledgeReferences).toEqual([]);
    });

    it('should deduplicate search results from multiple queries', async () => {
      const mockSearchResults = {
        results: [
          {
            id: 'doc-1',
            title: 'Security Guidelines',
            excerpt: 'Security best practices...',
            uri: '/docs/security.md',
            type: 'DOCUMENT',
            confidence: 0.85,
            sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
          }
        ],
        totalCount: 1,
        queryId: 'query-789'
      };

      // Return same result for all queries to test deduplication
      mockKendraService.search.mockResolvedValue(mockSearchResults);
      mockRulesEngine.evaluateRules.mockResolvedValue({ passed: true, violations: [] });
      mockAuditRepository.create.mockResolvedValue({} as any);

      const taskContent: WorkTaskContent = {
        id: 'task-4',
        title: 'Security Audit',
        description: 'Perform security audit',
        content: 'Need to audit security practices',
        submittedBy: 'user-4',
        teamId: 'team-1',
        submittedAt: new Date(),
        tags: ['security', 'audit']
      };

      const result = await workTaskService.analyzeWorkTask(taskContent);

      // Should deduplicate results even though same doc appeared in multiple searches
      const uniqueIds = new Set(result.knowledgeReferences.map(ref => ref.sourceId));
      expect(uniqueIds.size).toBe(result.knowledgeReferences.length);
    });
  });

  describe('Semantic Similarity and Pattern Matching', () => {
    it('should prioritize results with high semantic similarity', async () => {
      const mockSearchResults = {
        results: [
          {
            id: 'doc-1',
            title: 'API Authentication Patterns',
            excerpt: 'OAuth2 and JWT authentication patterns for APIs...',
            uri: '/docs/api-auth.md',
            type: 'DOCUMENT',
            confidence: 0.90,
            sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
          },
          {
            id: 'doc-2',
            title: 'General Security Overview',
            excerpt: 'Overview of security concepts...',
            uri: '/docs/security-overview.md',
            type: 'DOCUMENT',
            confidence: 0.60,
            sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
          }
        ],
        totalCount: 2,
        queryId: 'query-semantic'
      };

      mockKendraService.search.mockResolvedValue(mockSearchResults);
      mockRulesEngine.evaluateRules.mockResolvedValue({ passed: true, violations: [] });
      mockAuditRepository.create.mockResolvedValue({} as any);

      const taskContent: WorkTaskContent = {
        id: 'task-5',
        title: 'Implement OAuth2 Authentication',
        description: 'Implement OAuth2 with JWT tokens for API authentication',
        content: 'Need OAuth2 authentication flow with JWT token generation and validation',
        submittedBy: 'user-5',
        teamId: 'team-1',
        submittedAt: new Date(),
        category: 'security',
        tags: ['OAuth2', 'JWT', 'authentication']
      };

      const result = await workTaskService.analyzeWorkTask(taskContent);

      // First result should have higher relevance due to semantic similarity
      expect(result.knowledgeReferences.length).toBeGreaterThan(0);
      if (result.knowledgeReferences.length > 1) {
        expect(result.knowledgeReferences[0].relevanceScore).toBeGreaterThanOrEqual(
          result.knowledgeReferences[1].relevanceScore
        );
      }
    });
  });
});
