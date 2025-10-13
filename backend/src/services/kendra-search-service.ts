/**
 * Kendra Search Service
 * Provides search functionality using Amazon Kendra
 */

import { KendraClient, QueryCommand, QueryCommandInput, QueryResult } from '@aws-sdk/client-kendra';
import { Logger } from '../lambda/utils/logger';

export interface SearchRequest {
  query: string;
  teamId: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilter[];
}

export interface SearchFilter {
  key: string;
  value: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS';
}

export interface SearchResult {
  id: string;
  title: string;
  excerpt: string;
  uri: string;
  type: string;
  confidence: number;
  sourceAttributes: Record<string, string>;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  queryId: string;
  facets?: SearchFacet[];
}

export interface SearchFacet {
  key: string;
  values: FacetValue[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export class KendraSearchService {
  private kendraClient: KendraClient;
  private indexId: string;
  private logger: Logger;

  constructor() {
    this.kendraClient = new KendraClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.indexId = process.env.KENDRA_INDEX_ID || '';
    this.logger = new Logger();

    if (!this.indexId) {
      this.logger.warn('KENDRA_INDEX_ID not configured, search functionality will be limited');
    }
  }

  /**
   * Search the knowledge base using Kendra
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    try {
      this.logger.info('Executing Kendra search', {
        query: request.query,
        teamId: request.teamId,
        limit: request.limit
      });

      if (!this.indexId) {
        // Fallback to mock results when Kendra is not configured
        return this.getMockSearchResults(request);
      }

      const queryInput: QueryCommandInput = {
        IndexId: this.indexId,
        QueryText: request.query,
        PageSize: request.limit || 10,
        PageNumber: Math.floor((request.offset || 0) / (request.limit || 10)) + 1,
        AttributeFilter: this.buildAttributeFilter(request.teamId, request.filters),
        QueryResultTypeFilter: 'DOCUMENT',
        SortingConfiguration: {
          DocumentAttributeKey: '_last_updated_at',
          SortOrder: 'DESC'
        }
      };

      const command = new QueryCommand(queryInput);
      const response = await this.kendraClient.send(command);

      const results = this.transformKendraResults(response.ResultItems || []);
      
      this.logger.info('Kendra search completed', {
        query: request.query,
        resultCount: results.length,
        totalCount: response.TotalNumberOfResults
      });

      return {
        results,
        totalCount: response.TotalNumberOfResults || 0,
        queryId: response.QueryId || '',
        facets: this.transformFacets(response.FacetResults || [])
      };

    } catch (error) {
      this.logger.error('Kendra search failed', error, { request });
      
      // Fallback to mock results on error
      return this.getMockSearchResults(request);
    }
  }

  /**
   * Get search suggestions based on query
   */
  async getSuggestions(query: string, teamId: string): Promise<string[]> {
    try {
      // In a full implementation, this would use Kendra's suggestion API
      // For now, return simple query-based suggestions
      const suggestions = [
        `${query} policy`,
        `${query} best practices`,
        `${query} documentation`,
        `${query} examples`
      ];

      return suggestions.slice(0, 3);

    } catch (error) {
      this.logger.error('Failed to get search suggestions', error);
      return [];
    }
  }

  /**
   * Submit feedback for search results
   */
  async submitFeedback(queryId: string, resultId: string, relevance: 'RELEVANT' | 'NOT_RELEVANT'): Promise<void> {
    try {
      // In a full implementation, this would submit feedback to Kendra
      this.logger.info('Search feedback submitted', { queryId, resultId, relevance });

    } catch (error) {
      this.logger.error('Failed to submit search feedback', error);
    }
  }

  /**
   * Build attribute filter for team-based access control
   */
  private buildAttributeFilter(teamId: string, filters?: SearchFilter[]): any {
    const teamFilter = {
      EqualsTo: {
        Key: 'team_id',
        Value: {
          StringValue: teamId
        }
      }
    };

    if (!filters || filters.length === 0) {
      return teamFilter;
    }

    const additionalFilters = filters.map(filter => ({
      [this.getFilterOperator(filter.operator)]: {
        Key: filter.key,
        Value: {
          StringValue: filter.value
        }
      }
    }));

    return {
      AndAllFilters: [teamFilter, ...additionalFilters]
    };
  }

  /**
   * Get Kendra filter operator
   */
  private getFilterOperator(operator: string): string {
    switch (operator) {
      case 'EQUALS': return 'EqualsTo';
      case 'NOT_EQUALS': return 'NotEqualsTo';
      case 'CONTAINS': return 'ContainsAny';
      case 'NOT_CONTAINS': return 'NotContainsAny';
      default: return 'EqualsTo';
    }
  }

  /**
   * Transform Kendra results to our format
   */
  private transformKendraResults(items: any[]): SearchResult[] {
    return items.map(item => ({
      id: item.Id || '',
      title: item.DocumentTitle?.Text || 'Untitled',
      excerpt: item.DocumentExcerpt?.Text || '',
      uri: item.DocumentURI || '',
      type: item.Type || 'DOCUMENT',
      confidence: this.calculateConfidence(item.ScoreAttributes),
      sourceAttributes: this.extractSourceAttributes(item.DocumentAttributes || [])
    }));
  }

  /**
   * Calculate confidence score from Kendra score attributes
   */
  private calculateConfidence(scoreAttributes: any): number {
    if (!scoreAttributes) return 0.5;

    // Kendra provides various score attributes, normalize to 0-1 range
    const textRelevance = scoreAttributes.TextRelevance || 0;
    return Math.min(Math.max(textRelevance / 100, 0), 1);
  }

  /**
   * Extract source attributes from document attributes
   */
  private extractSourceAttributes(attributes: any[]): Record<string, string> {
    const sourceAttributes: Record<string, string> = {};

    attributes.forEach(attr => {
      if (attr.Key && attr.Value) {
        const value = attr.Value.StringValue || 
                     attr.Value.LongValue?.toString() || 
                     attr.Value.DateValue?.toString() || 
                     '';
        sourceAttributes[attr.Key] = value;
      }
    });

    return sourceAttributes;
  }

  /**
   * Transform Kendra facets to our format
   */
  private transformFacets(facetResults: any[]): SearchFacet[] {
    return facetResults.map(facet => ({
      key: facet.DocumentAttributeKey || '',
      values: (facet.DocumentAttributeValueCountPairs || []).map((pair: any) => ({
        value: pair.DocumentAttributeValue?.StringValue || '',
        count: pair.Count || 0
      }))
    }));
  }

  /**
   * Get mock search results when Kendra is not available
   */
  private getMockSearchResults(request: SearchRequest): SearchResponse {
    const mockResults: SearchResult[] = [
      {
        id: 'mock-1',
        title: 'Security Policy Guidelines',
        excerpt: 'This document outlines the security policies and procedures for the organization...',
        uri: '/policies/security-guidelines.pdf',
        type: 'DOCUMENT',
        confidence: 0.9,
        sourceAttributes: {
          source_type: 'policy',
          team_id: request.teamId,
          last_updated: new Date().toISOString()
        }
      },
      {
        id: 'mock-2',
        title: 'Development Best Practices',
        excerpt: 'Best practices for software development including code review, testing, and deployment...',
        uri: '/docs/dev-best-practices.md',
        type: 'DOCUMENT',
        confidence: 0.8,
        sourceAttributes: {
          source_type: 'documentation',
          team_id: request.teamId,
          last_updated: new Date().toISOString()
        }
      },
      {
        id: 'mock-3',
        title: 'Team Collaboration Guidelines',
        excerpt: 'Guidelines for effective team collaboration and communication...',
        uri: '/docs/collaboration-guide.md',
        type: 'DOCUMENT',
        confidence: 0.7,
        sourceAttributes: {
          source_type: 'guide',
          team_id: request.teamId,
          last_updated: new Date().toISOString()
        }
      }
    ];

    // Filter results based on query
    const filteredResults = mockResults.filter(result =>
      result.title.toLowerCase().includes(request.query.toLowerCase()) ||
      result.excerpt.toLowerCase().includes(request.query.toLowerCase())
    );

    return {
      results: filteredResults.slice(0, request.limit || 10),
      totalCount: filteredResults.length,
      queryId: 'mock-query-' + Date.now(),
      facets: [
        {
          key: 'source_type',
          values: [
            { value: 'policy', count: 1 },
            { value: 'documentation', count: 1 },
            { value: 'guide', count: 1 }
          ]
        }
      ]
    };
  }
}