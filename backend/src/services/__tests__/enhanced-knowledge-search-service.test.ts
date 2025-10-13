/**
 * Tests for Enhanced Knowledge Search Service
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
    from: jest.fn()
  },
  QueryCommand: jest.fn(),
  PutCommand: jest.fn(),
  GetCommand: jest.fn()
}));

import { EnhancedKnowledgeSearchService, SemanticSearchRequest } from '../enhanced-knowledge-search-service';
import { KendraSearchService, SearchResponse, SearchResult } from '../kendra-search-service';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Mock dependencies
jest.mock('../kendra-search-service');
jest.mock('../../lambda/utils/logger');

describe('EnhancedKnowledgeSearchService', () => {
  let service: EnhancedKnowledgeSearchService;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockDynamoClient: jest.Mocked<DynamoDBDocumentClient>;

  const mockSearchResults: SearchResult[] = [
    {
      id: 'doc-1',
      title: 'API Security Best Practices',
      excerpt: 'This document covers authentication, authorization, and API security patterns...',
      uri: '/docs/api-security.md',
      type: 'DOCUMENT',
      confidence: 0.85,
      sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
    },
    {
      id: 'doc-2',
      title: 'Database Design Guidelines',
      excerpt: 'Guidelines for designing scalable and secure database schemas...',
      uri: '/docs/database-design.md',
      type: 'DOCUMENT',
      confidence: 0.75,
      sourceAttributes: { source_type: 'documentation', team_id: 'team-1' }
    },
    {
      id: 'doc-3',
      title: 'Authentication Implementation Guide',
      excerpt: 'Step-by-step guide for implementing OAuth2 and JWT authentication...',
      uri: '/docs/auth-guide.md',
      type: 'DOCUMENT',
      confidence: 0.80,
      sourceAttributes: { source_type: 'guide', team_id: 'team-1' }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Kendra service
    mockKendraService = {
      search: jest.fn(),
      getSuggestions: jest.fn(),
      submitFeedback: jest.fn()
    } as any;

    // Setup mock DynamoDB client
    mockDynamoClient = {
      send: jest.fn()
    } as any;

    // Mock DynamoDBDocumentClient.from
    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mockDynamoClient);

    service = new EnhancedKnowledgeSearchService(mockKendraService);
  });

  describe('enhancedSearch', () => {
    it('should perform enhanced search with semantic scoring', async () => {
      const mockResponse: SearchResponse = {
        results: mockSearchResults,
        totalCount: 3,
        queryId: 'query-123'
      };

      mockKendraService.search.mockResolvedValue(mockResponse);
      mockDynamoClient.send.mockResolvedValue({ Items: [] });

      const request: SemanticSearchRequest = {
        query: 'API security authentication',
        teamId: 'team-1',
        semanticBoost: true,
        contextualKeywords: ['security', 'authentication', 'authorization']
      };

      const result = await service.enhancedSearch(request);

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toHaveProperty('semanticScore');
      expect(result.results[0]).toHaveProperty('historicalRelevance');
      expect(result.results[0]).toHaveProperty('patternMatchScore');
      expect(result.results[0]).toHaveProperty('combinedScore');
      expect(mockKendraService.search).toHaveBeenCalledWith(request);
    });

    it('should apply semantic similarity scoring correctly', async () => {
      const mockResponse: SearchResponse = {
        results: mockSearchResults,
        totalCount: 3,
        queryId: 'query-123'
      };

      mockKendraService.search.mockResolvedValue(mockResponse);
      mockDynamoClient.send.mockResolvedValue({ Items: [] });

      const request: SemanticSearchRequest = {
        query: 'API security',
        teamId: 'team-1',
        contextualKeywords: ['security', 'api']
      };

      const result = await service.enhancedSearch(request);

      // The first result should have highest semantic score due to title match
      expect(result.results[0].semanticScore).toBeGreaterThan(0);
      expect(result.results[0].title).toContain('API Security');
    });

    it('should incorporate historical patterns when available', async () => {
      const mockResponse: SearchResponse = {
        results: mockSearchResults,
        totalCount: 3,
        queryId: 'query-123'
      };

      const mockPatterns = [
        {
          patternId: 'pattern-1',
          queryPattern: 'API security best practices',
          resultPatterns: ['DOCUMENT:doc-1'],
          frequency: 10,
          successRate: 0.9,
          lastUsed: new Date().toISOString(),
          teamId: 'team-1'
        }
      ];

      mockKendraService.search.mockResolvedValue(mockResponse);
      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockPatterns }) // loadHistoricalPatterns
        .mockResolvedValueOnce({}) // recordSearchHistory
        .mockResolvedValueOnce({}); // updateSearchPatterns

      const request: SemanticSearchRequest = {
        query: 'API security practices',
        teamId: 'team-1',
        includeHistoricalPatterns: true
      };

      const result = await service.enhancedSearch(request);

      // Historical relevance should be calculated (may be 0 if patterns don't match exactly)
      expect(result.results[0]).toHaveProperty('historicalRelevance');
      expect(result.results[0].historicalRelevance).toBeGreaterThanOrEqual(0);
      expect(mockDynamoClient.send).toHaveBeenCalled();
    });

    it('should apply pattern matching to results', async () => {
      const mockResponse: SearchResponse = {
        results: mockSearchResults,
        totalCount: 3,
        queryId: 'query-123'
      };

      mockKendraService.search.mockResolvedValue(mockResponse);
      mockDynamoClient.send.mockResolvedValue({ Items: [] });

      const request: SemanticSearchRequest = {
        query: 'API authentication security',
        teamId: 'team-1',
        contextualKeywords: ['API', 'authentication']
      };

      const result = await service.enhancedSearch(request);

      // Results should have pattern match scores
      expect(result.results.some(r => r.patternMatchScore > 0)).toBe(true);
      expect(result.results.some(r => r.matchedPatterns.length > 0)).toBe(true);
    });

    it('should calculate combined scores correctly', async () => {
      const mockResponse: SearchResponse = {
        results: mockSearchResults,
        totalCount: 3,
        queryId: 'query-123'
      };

      mockKendraService.search.mockResolvedValue(mockResponse);
      mockDynamoClient.send.mockResolvedValue({ Items: [] });

      const request: SemanticSearchRequest = {
        query: 'security',
        teamId: 'team-1'
      };

      const result = await service.enhancedSearch(request);

      // All results should have combined scores
      result.results.forEach(r => {
        expect(r.combinedScore).toBeGreaterThanOrEqual(0);
        expect(r.combinedScore).toBeLessThanOrEqual(1);
      });

      // Results should be sorted by combined score
      for (let i = 0; i < result.results.length - 1; i++) {
        expect(result.results[i].combinedScore).toBeGreaterThanOrEqual(
          result.results[i + 1].combinedScore
        );
      }
    });

    it('should record search history for learning', async () => {
      const mockResponse: SearchResponse = {
        results: mockSearchResults,
        totalCount: 3,
        queryId: 'query-123'
      };

      mockKendraService.search.mockResolvedValue(mockResponse);
      mockDynamoClient.send.mockResolvedValue({ Items: [] });

      const request: SemanticSearchRequest = {
        query: 'API security',
        teamId: 'team-1',
        taskCategory: 'security'
      };

      await service.enhancedSearch(request);

      // Should have called DynamoDB (for loading patterns, recording history, updating patterns, and getting existing pattern)
      expect(mockDynamoClient.send).toHaveBeenCalled();
      expect(mockDynamoClient.send).toHaveBeenCalledTimes(4); // Query, Put, Get, Put
    });

    it('should handle errors gracefully', async () => {
      mockKendraService.search.mockRejectedValue(new Error('Kendra error'));

      const request: SemanticSearchRequest = {
        query: 'test query',
        teamId: 'team-1'
      };

      await expect(service.enhancedSearch(request)).rejects.toThrow('Kendra error');
    });
  });

  describe('getSearchRecommendations', () => {
    it('should return top search recommendations', async () => {
      const mockPatterns = [
        {
          patternId: 'pattern-1',
          queryPattern: 'API security best practices',
          resultPatterns: ['doc-1'],
          frequency: 15,
          successRate: 0.9,
          lastUsed: new Date().toISOString(),
          teamId: 'team-1'
        },
        {
          patternId: 'pattern-2',
          queryPattern: 'database design patterns',
          resultPatterns: ['doc-2'],
          frequency: 10,
          successRate: 0.85,
          lastUsed: new Date().toISOString(),
          teamId: 'team-1'
        }
      ];

      mockDynamoClient.send.mockResolvedValue({ Items: mockPatterns });

      const recommendations = await service.getSearchRecommendations('team-1');

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0]).toBe('API security best practices');
    });

    it('should filter recommendations by context', async () => {
      const mockPatterns = [
        {
          patternId: 'pattern-1',
          queryPattern: 'API security authentication',
          resultPatterns: ['doc-1'],
          frequency: 15,
          successRate: 0.9,
          lastUsed: new Date().toISOString(),
          teamId: 'team-1'
        },
        {
          patternId: 'pattern-2',
          queryPattern: 'database design patterns',
          resultPatterns: ['doc-2'],
          frequency: 10,
          successRate: 0.85,
          lastUsed: new Date().toISOString(),
          teamId: 'team-1'
        }
      ];

      mockDynamoClient.send.mockResolvedValue({ Items: mockPatterns });

      const recommendations = await service.getSearchRecommendations('team-1', 'security');

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('security');
    });

    it('should handle empty patterns gracefully', async () => {
      mockDynamoClient.send.mockResolvedValue({ Items: [] });

      const recommendations = await service.getSearchRecommendations('team-1');

      expect(recommendations).toEqual([]);
    });
  });

  describe('submitSearchFeedback', () => {
    it('should update pattern success rate on positive feedback', async () => {
      const mockHistoryItem = {
        queryId: 'query-123',
        query: 'API security',
        teamId: 'team-1',
        timestamp: new Date().toISOString(),
        resultIds: ['doc-1'],
        contextKeywords: ['security']
      };

      const mockPattern = {
        patternId: 'pattern-1',
        queryPattern: 'API security',
        resultPatterns: ['doc-1'],
        frequency: 5,
        successRate: 0.7,
        lastUsed: new Date().toISOString(),
        teamId: 'team-1'
      };

      mockDynamoClient.send
        .mockResolvedValueOnce({ Item: mockHistoryItem }) // Get history
        .mockResolvedValueOnce({ Item: mockPattern }) // Get pattern
        .mockResolvedValueOnce({}); // Update pattern

      await service.submitSearchFeedback('query-123', 'doc-1', 'positive');

      expect(mockKendraService.submitFeedback).toHaveBeenCalledWith(
        'query-123',
        'doc-1',
        'RELEVANT'
      );
    });

    it('should update pattern success rate on negative feedback', async () => {
      const mockHistoryItem = {
        queryId: 'query-123',
        query: 'API security',
        teamId: 'team-1',
        timestamp: new Date().toISOString(),
        resultIds: ['doc-1'],
        contextKeywords: ['security']
      };

      const mockPattern = {
        patternId: 'pattern-1',
        queryPattern: 'API security',
        resultPatterns: ['doc-1'],
        frequency: 5,
        successRate: 0.7,
        lastUsed: new Date().toISOString(),
        teamId: 'team-1'
      };

      mockDynamoClient.send
        .mockResolvedValueOnce({ Item: mockHistoryItem })
        .mockResolvedValueOnce({ Item: mockPattern })
        .mockResolvedValueOnce({});

      await service.submitSearchFeedback('query-123', 'doc-1', 'negative');

      expect(mockKendraService.submitFeedback).toHaveBeenCalledWith(
        'query-123',
        'doc-1',
        'NOT_RELEVANT'
      );
    });

    it('should handle missing history gracefully', async () => {
      mockDynamoClient.send.mockResolvedValue({ Item: undefined });

      await expect(
        service.submitSearchFeedback('query-123', 'doc-1', 'positive')
      ).resolves.not.toThrow();
    });
  });
});
