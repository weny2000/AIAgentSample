/**
 * Enhanced Knowledge Search Service
 * Provides advanced search with semantic similarity, historical learning, and pattern recognition
 */

import { KendraSearchService, SearchRequest, SearchResponse, SearchResult } from './kendra-search-service';
import { Logger } from '../lambda/utils/logger';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export interface SemanticSearchRequest extends SearchRequest {
  semanticBoost?: boolean;
  includeHistoricalPatterns?: boolean;
  contextualKeywords?: string[];
  taskCategory?: string;
}

export interface EnhancedSearchResult extends SearchResult {
  semanticScore: number;
  historicalRelevance: number;
  patternMatchScore: number;
  combinedScore: number;
  matchedPatterns: string[];
  relatedQueries: string[];
}

export interface SearchPattern {
  patternId: string;
  queryPattern: string;
  resultPatterns: string[];
  frequency: number;
  successRate: number;
  lastUsed: string;
  teamId: string;
}

export interface HistoricalSearchData {
  queryId: string;
  query: string;
  teamId: string;
  timestamp: string;
  resultIds: string[];
  userFeedback?: 'positive' | 'negative' | 'neutral';
  taskCategory?: string;
  contextKeywords: string[];
}

export class EnhancedKnowledgeSearchService {
  private kendraService: KendraSearchService;
  private dynamoClient: DynamoDBDocumentClient;
  private logger: Logger;
  private searchHistoryTable: string;
  private searchPatternsTable: string;

  constructor(kendraService?: KendraSearchService) {
    this.kendraService = kendraService || new KendraSearchService();
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.logger = new Logger();
    this.searchHistoryTable = process.env.SEARCH_HISTORY_TABLE || 'search_history';
    this.searchPatternsTable = process.env.SEARCH_PATTERNS_TABLE || 'search_patterns';
  }

  /**
   * Enhanced search with semantic similarity and historical learning
   */
  async enhancedSearch(request: SemanticSearchRequest): Promise<{ results: EnhancedSearchResult[]; totalCount: number; queryId: string }> {
    try {
      this.logger.info('Executing enhanced knowledge search', { query: request.query, teamId: request.teamId });

      // 1. Execute base Kendra search
      const baseResults = await this.kendraService.search(request);

      // 2. Load historical patterns for this team
      const historicalPatterns = await this.loadHistoricalPatterns(request.teamId, request.taskCategory);

      // 3. Apply semantic similarity scoring
      const semanticResults = await this.applySemanticScoring(
        baseResults.results,
        request.query,
        request.contextualKeywords || []
      );

      // 4. Apply historical relevance scoring
      const historicalResults = await this.applyHistoricalScoring(
        semanticResults,
        historicalPatterns,
        request.query
      );

      // 5. Apply pattern matching
      const patternResults = await this.applyPatternMatching(
        historicalResults,
        historicalPatterns,
        request.query
      );

      // 6. Calculate combined scores and rank
      const rankedResults = this.calculateCombinedScores(patternResults);

      // 7. Record search for future learning
      await this.recordSearchHistory({
        queryId: baseResults.queryId,
        query: request.query,
        teamId: request.teamId,
        timestamp: new Date().toISOString(),
        resultIds: rankedResults.map(r => r.id),
        taskCategory: request.taskCategory,
        contextKeywords: request.contextualKeywords || []
      });

      // 8. Update patterns based on this search
      await this.updateSearchPatterns(request.query, rankedResults, request.teamId);

      this.logger.info('Enhanced search completed', {
        query: request.query,
        resultCount: rankedResults.length,
        avgSemanticScore: this.calculateAverage(rankedResults.map(r => r.semanticScore))
      });

      return {
        results: rankedResults,
        totalCount: baseResults.totalCount,
        queryId: baseResults.queryId
      };

    } catch (error) {
      this.logger.error('Enhanced search failed', error as Error);
      throw error;
    }
  }

  /**
   * Apply semantic similarity scoring to search results
   */
  private async applySemanticScoring(
    results: SearchResult[],
    query: string,
    contextualKeywords: string[]
  ): Promise<EnhancedSearchResult[]> {
    const queryTokens = this.tokenize(query);
    const contextTokens = contextualKeywords.flatMap(k => this.tokenize(k));

    return results.map(result => {
      const titleTokens = this.tokenize(result.title);
      const excerptTokens = this.tokenize(result.excerpt);

      // Calculate semantic similarity using multiple methods
      const titleSimilarity = this.calculateCosineSimilarity(queryTokens, titleTokens);
      const excerptSimilarity = this.calculateCosineSimilarity(queryTokens, excerptTokens);
      const contextSimilarity = this.calculateCosineSimilarity(contextTokens, [...titleTokens, ...excerptTokens]);

      // Weighted semantic score
      const semanticScore = (
        titleSimilarity * 0.4 +
        excerptSimilarity * 0.3 +
        contextSimilarity * 0.3
      );

      return {
        ...result,
        semanticScore,
        historicalRelevance: 0,
        patternMatchScore: 0,
        combinedScore: 0,
        matchedPatterns: [],
        relatedQueries: []
      };
    });
  }

  /**
   * Apply historical relevance scoring based on past searches
   */
  private async applyHistoricalScoring(
    results: EnhancedSearchResult[],
    patterns: SearchPattern[],
    query: string
  ): Promise<EnhancedSearchResult[]> {
    // Find similar historical queries
    const similarQueries = patterns.filter(p =>
      this.calculateTextSimilarity(p.queryPattern, query) > 0.6
    );

    return results.map(result => {
      let historicalScore = 0;

      // Check if this result appeared in successful historical searches
      for (const pattern of similarQueries) {
        if (pattern.resultPatterns.some(rp => this.matchesPattern(result, rp))) {
          // Weight by pattern success rate and frequency
          historicalScore += pattern.successRate * Math.log(pattern.frequency + 1) * 0.1;
        }
      }

      return {
        ...result,
        historicalRelevance: Math.min(1.0, historicalScore),
        relatedQueries: similarQueries.slice(0, 3).map(p => p.queryPattern)
      };
    });
  }

  /**
   * Apply pattern matching to identify relevant results
   */
  private async applyPatternMatching(
    results: EnhancedSearchResult[],
    patterns: SearchPattern[],
    query: string
  ): Promise<EnhancedSearchResult[]> {
    const queryPatterns = this.extractQueryPatterns(query);

    return results.map(result => {
      const matchedPatterns: string[] = [];
      let patternScore = 0;

      // Check for technical patterns
      for (const pattern of queryPatterns) {
        if (this.containsPattern(result.title, pattern) || this.containsPattern(result.excerpt, pattern)) {
          matchedPatterns.push(pattern);
          patternScore += 0.2;
        }
      }

      // Check for learned patterns
      for (const learnedPattern of patterns) {
        if (this.matchesLearnedPattern(result, learnedPattern, query)) {
          matchedPatterns.push(learnedPattern.queryPattern);
          patternScore += 0.15 * learnedPattern.successRate;
        }
      }

      return {
        ...result,
        patternMatchScore: Math.min(1.0, patternScore),
        matchedPatterns
      };
    });
  }

  /**
   * Calculate combined scores and rank results
   */
  private calculateCombinedScores(results: EnhancedSearchResult[]): EnhancedSearchResult[] {
    const scoredResults = results.map(result => ({
      ...result,
      combinedScore: (
        result.confidence * 0.25 +
        result.semanticScore * 0.35 +
        result.historicalRelevance * 0.25 +
        result.patternMatchScore * 0.15
      )
    }));

    return scoredResults.sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Load historical search patterns for a team
   */
  private async loadHistoricalPatterns(teamId: string, category?: string): Promise<SearchPattern[]> {
    try {
      const command = new QueryCommand({
        TableName: this.searchPatternsTable,
        KeyConditionExpression: 'teamId = :teamId',
        ExpressionAttributeValues: {
          ':teamId': teamId,
          ':minFrequency': 2
        },
        FilterExpression: 'frequency >= :minFrequency',
        Limit: 50
      });

      const response = await this.dynamoClient.send(command);
      const patterns = (response.Items || []) as SearchPattern[];

      // Filter by category if provided
      if (category) {
        return patterns.filter(p => p.queryPattern.toLowerCase().includes(category.toLowerCase()));
      }

      return patterns;

    } catch (error) {
      this.logger.error('Failed to load historical patterns', error as Error);
      return [];
    }
  }

  /**
   * Record search history for future learning
   */
  private async recordSearchHistory(data: HistoricalSearchData): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.searchHistoryTable,
        Item: {
          ...data,
          ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days retention
        }
      });

      await this.dynamoClient.send(command);

    } catch (error) {
      this.logger.error('Failed to record search history', error as Error);
    }
  }

  /**
   * Update search patterns based on new search
   */
  private async updateSearchPatterns(
    query: string,
    results: EnhancedSearchResult[],
    teamId: string
  ): Promise<void> {
    try {
      const patternKey = this.generatePatternKey(query);
      
      // Get existing pattern
      const getCommand = new GetCommand({
        TableName: this.searchPatternsTable,
        Key: { teamId, patternId: patternKey }
      });

      const existing = await this.dynamoClient.send(getCommand);
      const existingPattern = existing.Item as SearchPattern | undefined;

      // Create or update pattern
      const pattern: SearchPattern = {
        patternId: patternKey,
        queryPattern: query,
        resultPatterns: results.slice(0, 5).map(r => this.createResultPattern(r)),
        frequency: (existingPattern?.frequency || 0) + 1,
        successRate: existingPattern?.successRate || 0.5,
        lastUsed: new Date().toISOString(),
        teamId
      };

      const putCommand = new PutCommand({
        TableName: this.searchPatternsTable,
        Item: pattern
      });

      await this.dynamoClient.send(putCommand);

    } catch (error) {
      this.logger.error('Failed to update search patterns', error as Error);
    }
  }

  /**
   * Get search recommendations based on historical data
   */
  async getSearchRecommendations(teamId: string, context?: string): Promise<string[]> {
    try {
      const patterns = await this.loadHistoricalPatterns(teamId);
      
      // Sort by frequency and success rate
      const topPatterns = patterns
        .sort((a, b) => (b.frequency * b.successRate) - (a.frequency * a.successRate))
        .slice(0, 10);

      // Filter by context if provided
      if (context) {
        return topPatterns
          .filter(p => this.calculateTextSimilarity(p.queryPattern, context) > 0.3)
          .map(p => p.queryPattern)
          .slice(0, 5);
      }

      return topPatterns.map(p => p.queryPattern).slice(0, 5);

    } catch (error) {
      this.logger.error('Failed to get search recommendations', error as Error);
      return [];
    }
  }

  /**
   * Submit feedback to improve future searches
   */
  async submitSearchFeedback(
    queryId: string,
    resultId: string,
    feedback: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    try {
      // Update the historical search record
      const getCommand = new GetCommand({
        TableName: this.searchHistoryTable,
        Key: { queryId }
      });

      const response = await this.dynamoClient.send(getCommand);
      if (response.Item) {
        const historyData = response.Item as HistoricalSearchData;
        
        // Update pattern success rate based on feedback
        await this.updatePatternSuccessRate(
          historyData.query,
          historyData.teamId,
          feedback === 'positive'
        );
      }

      // Also submit to Kendra for its learning
      await this.kendraService.submitFeedback(
        queryId,
        resultId,
        feedback === 'positive' ? 'RELEVANT' : 'NOT_RELEVANT'
      );

    } catch (error) {
      this.logger.error('Failed to submit search feedback', error as Error);
    }
  }

  /**
   * Update pattern success rate based on feedback
   */
  private async updatePatternSuccessRate(
    query: string,
    teamId: string,
    isPositive: boolean
  ): Promise<void> {
    try {
      const patternKey = this.generatePatternKey(query);
      
      const getCommand = new GetCommand({
        TableName: this.searchPatternsTable,
        Key: { teamId, patternId: patternKey }
      });

      const response = await this.dynamoClient.send(getCommand);
      if (response.Item) {
        const pattern = response.Item as SearchPattern;
        
        // Update success rate using exponential moving average
        const alpha = 0.2; // Learning rate
        const newSuccessRate = pattern.successRate * (1 - alpha) + (isPositive ? 1 : 0) * alpha;

        const putCommand = new PutCommand({
          TableName: this.searchPatternsTable,
          Item: {
            ...pattern,
            successRate: newSuccessRate
          }
        });

        await this.dynamoClient.send(putCommand);
      }

    } catch (error) {
      this.logger.error('Failed to update pattern success rate', error as Error);
    }
  }

  // Helper methods for text processing and similarity calculation

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !this.isStopWord(token));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  private calculateCosineSimilarity(tokens1: string[], tokens2: string[]): number {
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    if (intersection.size === 0) return 0;

    const magnitude1 = Math.sqrt(tokens1.length);
    const magnitude2 = Math.sqrt(tokens2.length);

    return intersection.size / (magnitude1 * magnitude2);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const tokens1 = this.tokenize(text1);
    const tokens2 = this.tokenize(text2);
    return this.calculateCosineSimilarity(tokens1, tokens2);
  }

  private extractQueryPatterns(query: string): string[] {
    const patterns: string[] = [];
    
    // Extract technical terms (words with special characters or camelCase)
    const technicalTerms = query.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b|\b\w+[-_]\w+\b/g);
    if (technicalTerms) patterns.push(...technicalTerms);

    // Extract quoted phrases
    const quotedPhrases = query.match(/"([^"]+)"/g);
    if (quotedPhrases) patterns.push(...quotedPhrases.map(p => p.replace(/"/g, '')));

    // Extract domain-specific terms
    const domainTerms = query.match(/\b(?:api|database|security|authentication|authorization|deployment|testing)\b/gi);
    if (domainTerms) patterns.push(...domainTerms);

    return [...new Set(patterns)];
  }

  private containsPattern(text: string, pattern: string): boolean {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }

  private matchesPattern(result: SearchResult, pattern: string): boolean {
    return result.id === pattern || 
           result.title.toLowerCase().includes(pattern.toLowerCase()) ||
           result.uri.toLowerCase().includes(pattern.toLowerCase());
  }

  private matchesLearnedPattern(
    result: EnhancedSearchResult,
    pattern: SearchPattern,
    query: string
  ): boolean {
    const querySimilarity = this.calculateTextSimilarity(query, pattern.queryPattern);
    if (querySimilarity < 0.5) return false;

    return pattern.resultPatterns.some(rp => this.matchesPattern(result, rp));
  }

  private generatePatternKey(query: string): string {
    // Create a normalized pattern key from the query
    const normalized = query.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => !this.isStopWord(w))
      .sort()
      .join('_');
    
    return normalized.substring(0, 100); // Limit length
  }

  private createResultPattern(result: EnhancedSearchResult): string {
    // Create a pattern identifier for the result
    return `${result.type}:${result.id}`;
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
}
