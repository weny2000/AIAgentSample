/**
 * Conversation Repository
 * Handles persistent storage and retrieval of conversation sessions and messages
 */

import { BaseRepository, RepositoryConfig } from './base-repository';
import { 
  AgentSession,
  ConversationContext,
  ConversationMessage,
  ConversationBranch,
  ConversationSummary,
  ConversationInsights
} from '../models/agent-core';

// DynamoDB item structure for conversations
interface ConversationItem {
  pk: string; // session_id
  sk: string; // timestamp or message_id
  entity_type: 'session' | 'message' | 'branch' | 'summary';
  gsi1pk: string; // user_id
  gsi1sk: string; // timestamp
  gsi2pk: string; // team_id
  gsi2sk: string; // timestamp
  ttl?: number; // TTL for automatic cleanup
  
  // Session data (when entity_type = 'session')
  session_id?: string;
  user_id?: string;
  team_id?: string;
  persona_id?: string;
  start_time?: string;
  last_activity?: string;
  session_status?: 'active' | 'ended' | 'expired';
  context?: ConversationContext;
  metadata?: any;
  
  // Message data (when entity_type = 'message')
  message_id?: string;
  conversation_id?: string;
  role?: 'user' | 'agent' | 'system';
  content?: string;
  timestamp?: string;
  message_metadata?: any;
  references?: any[];
  parent_message_id?: string; // For branching
  branch_id?: string; // For conversation branches
  
  // Branch data (when entity_type = 'branch')
  branch_name?: string;
  branch_description?: string;
  created_at?: string;
  
  // Summary data (when entity_type = 'summary')
  summary_text?: string;
  key_topics?: string[];
  action_items?: any[];
  insights?: ConversationInsights;
  summary_type?: 'session' | 'periodic' | 'topic';
}

export interface ConversationBranch {
  branchId: string;
  sessionId: string;
  parentMessageId: string;
  branchName: string;
  description?: string;
  createdAt: Date;
  messages: ConversationMessage[];
}

export interface ConversationSummary {
  summaryId: string;
  sessionId: string;
  summaryType: 'session' | 'periodic' | 'topic';
  summaryText: string;
  keyTopics: string[];
  actionItems: any[];
  insights: ConversationInsights;
  createdAt: Date;
  timeRange?: {
    startTime: Date;
    endTime: Date;
  };
}

export interface ConversationInsights {
  totalMessages: number;
  userEngagement: number; // 0-1 score
  topicProgression: string[];
  sentimentTrend: ('positive' | 'neutral' | 'negative')[];
  knowledgeGaps: string[];
  recommendedActions: string[];
  learningOpportunities: string[];
}

export interface GetConversationHistoryParams {
  sessionId: string;
  limit?: number;
  offset?: number;
  branchId?: string;
  includeReferences?: boolean;
  messageTypes?: ('user' | 'agent' | 'system')[];
  startTime?: Date;
  endTime?: Date;
}

export interface ConversationSearchParams {
  userId?: string;
  teamId?: string;
  personaId?: string;
  query?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  lastEvaluatedKey?: Record<string, any>;
}

export class ConversationRepository extends BaseRepository<ConversationItem> {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  /**
   * Store a conversation session
   */
  async storeSession(session: AgentSession): Promise<void> {
    const item: ConversationItem = {
      pk: session.sessionId,
      sk: 'SESSION',
      entity_type: 'session',
      gsi1pk: session.userId,
      gsi1sk: session.startTime.toISOString(),
      gsi2pk: session.teamId,
      gsi2sk: session.startTime.toISOString(),
      ttl: this.getTTL(90), // 90 days retention
      
      session_id: session.sessionId,
      user_id: session.userId,
      team_id: session.teamId,
      persona_id: session.personaId,
      start_time: session.startTime.toISOString(),
      last_activity: session.lastActivity.toISOString(),
      session_status: 'active',
      context: session.context,
      metadata: session.metadata
    };

    await this.putItem(item);
  }

  /**
   * Update session activity and context
   */
  async updateSession(sessionId: string, updates: Partial<AgentSession>): Promise<void> {
    const updateExpressions: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = {};

    if (updates.lastActivity) {
      updateExpressions.push('#last_activity = :last_activity');
      attributeNames['#last_activity'] = 'last_activity';
      attributeValues[':last_activity'] = updates.lastActivity.toISOString();
    }

    if (updates.context) {
      updateExpressions.push('#context = :context');
      attributeNames['#context'] = 'context';
      attributeValues[':context'] = updates.context;
    }

    if (updates.metadata) {
      updateExpressions.push('#metadata = :metadata');
      attributeNames['#metadata'] = 'metadata';
      attributeValues[':metadata'] = updates.metadata;
    }

    if (updateExpressions.length > 0) {
      await this.updateItem(
        { pk: sessionId, sk: 'SESSION' },
        `SET ${updateExpressions.join(', ')}`,
        attributeNames,
        attributeValues
      );
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.updateItem(
      { pk: sessionId, sk: 'SESSION' },
      'SET #session_status = :status, #last_activity = :last_activity',
      {
        '#session_status': 'session_status',
        '#last_activity': 'last_activity'
      },
      {
        ':status': 'ended',
        ':last_activity': new Date().toISOString()
      }
    );
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    const item = await this.getItem({ pk: sessionId, sk: 'SESSION' });
    if (!item) return null;

    return {
      sessionId: item.session_id!,
      userId: item.user_id!,
      teamId: item.team_id!,
      personaId: item.persona_id!,
      startTime: new Date(item.start_time!),
      lastActivity: new Date(item.last_activity!),
      context: item.context!,
      metadata: item.metadata || {}
    };
  }

  /**
   * Store a conversation message
   */
  async storeMessage(sessionId: string, message: ConversationMessage, branchId?: string): Promise<void> {
    const item: ConversationItem = {
      pk: sessionId,
      sk: `MSG#${message.timestamp.toISOString()}#${message.messageId}`,
      entity_type: 'message',
      gsi1pk: sessionId, // For querying messages by session
      gsi1sk: message.timestamp.toISOString(),
      gsi2pk: message.role, // For querying by role
      gsi2sk: message.timestamp.toISOString(),
      ttl: this.getTTL(90), // 90 days retention
      
      message_id: message.messageId,
      conversation_id: sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      message_metadata: message.metadata,
      references: message.references,
      branch_id: branchId
    };

    await this.putItem(item);
  }

  /**
   * Get conversation history with advanced filtering
   */
  async getConversationHistory(params: GetConversationHistoryParams): Promise<{
    messages: ConversationMessage[];
    totalCount: number;
    hasMore: boolean;
    branches?: ConversationBranch[];
  }> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    // Query messages for the session
    let keyConditionExpression = 'pk = :session_id AND begins_with(sk, :msg_prefix)';
    const expressionAttributeValues: Record<string, any> = {
      ':session_id': params.sessionId,
      ':msg_prefix': 'MSG#'
    };

    // Add branch filter if specified
    let filterExpression: string | undefined;
    if (params.branchId) {
      filterExpression = 'branch_id = :branch_id';
      expressionAttributeValues[':branch_id'] = params.branchId;
    }

    // Add message type filter
    if (params.messageTypes && params.messageTypes.length > 0) {
      const typeFilter = params.messageTypes.map((_, index) => `:type${index}`).join(', ');
      filterExpression = filterExpression 
        ? `${filterExpression} AND #role IN (${typeFilter})`
        : `#role IN (${typeFilter})`;
      
      params.messageTypes.forEach((type, index) => {
        expressionAttributeValues[`:type${index}`] = type;
      });
    }

    const result = await this.queryItems(
      keyConditionExpression,
      params.messageTypes ? { '#role': 'role' } : undefined,
      expressionAttributeValues,
      filterExpression,
      undefined,
      limit + offset, // Get more to handle offset
      undefined,
      true // Sort ascending by timestamp
    );

    // Convert items to messages and apply offset
    const allMessages = result.items
      .map(item => ({
        messageId: item.message_id!,
        role: item.role! as 'user' | 'agent' | 'system',
        content: item.content!,
        timestamp: new Date(item.timestamp!),
        metadata: item.message_metadata || {},
        references: params.includeReferences ? item.references : undefined
      }))
      .slice(offset, offset + limit);

    // Get branches if requested
    let branches: ConversationBranch[] | undefined;
    if (params.branchId === undefined) { // Only get branches if not filtering by specific branch
      branches = await this.getConversationBranches(params.sessionId);
    }

    return {
      messages: allMessages,
      totalCount: result.count,
      hasMore: offset + limit < result.count,
      branches
    };
  }

  /**
   * Create a conversation branch
   */
  async createBranch(
    sessionId: string,
    parentMessageId: string,
    branchName: string,
    description?: string
  ): Promise<ConversationBranch> {
    const branchId = `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const branch: ConversationBranch = {
      branchId,
      sessionId,
      parentMessageId,
      branchName,
      description,
      createdAt: new Date(),
      messages: []
    };

    const item: ConversationItem = {
      pk: sessionId,
      sk: `BRANCH#${branchId}`,
      entity_type: 'branch',
      gsi1pk: sessionId,
      gsi1sk: branch.createdAt.toISOString(),
      gsi2pk: 'branch',
      gsi2sk: branch.createdAt.toISOString(),
      ttl: this.getTTL(90),
      
      branch_id: branchId,
      branch_name: branchName,
      branch_description: description,
      parent_message_id: parentMessageId,
      created_at: branch.createdAt.toISOString()
    };

    await this.putItem(item);
    return branch;
  }

  /**
   * Get conversation branches
   */
  async getConversationBranches(sessionId: string): Promise<ConversationBranch[]> {
    const result = await this.queryItems(
      'pk = :session_id AND begins_with(sk, :branch_prefix)',
      undefined,
      {
        ':session_id': sessionId,
        ':branch_prefix': 'BRANCH#'
      }
    );

    const branches: ConversationBranch[] = [];
    for (const item of result.items) {
      // Get messages for this branch
      const branchMessages = await this.getConversationHistory({
        sessionId,
        branchId: item.branch_id!,
        includeReferences: true
      });

      branches.push({
        branchId: item.branch_id!,
        sessionId,
        parentMessageId: item.parent_message_id!,
        branchName: item.branch_name!,
        description: item.branch_description,
        createdAt: new Date(item.created_at!),
        messages: branchMessages.messages
      });
    }

    return branches;
  }

  /**
   * Store conversation summary
   */
  async storeSummary(summary: ConversationSummary): Promise<void> {
    const item: ConversationItem = {
      pk: summary.sessionId,
      sk: `SUMMARY#${summary.summaryType}#${summary.createdAt.toISOString()}`,
      entity_type: 'summary',
      gsi1pk: summary.sessionId,
      gsi1sk: summary.createdAt.toISOString(),
      gsi2pk: summary.summaryType,
      gsi2sk: summary.createdAt.toISOString(),
      ttl: this.getTTL(365), // Keep summaries longer
      
      summary_text: summary.summaryText,
      key_topics: summary.keyTopics,
      action_items: summary.actionItems,
      insights: summary.insights,
      summary_type: summary.summaryType
    };

    await this.putItem(item);
  }

  /**
   * Get conversation summaries
   */
  async getSummaries(
    sessionId: string,
    summaryType?: 'session' | 'periodic' | 'topic'
  ): Promise<ConversationSummary[]> {
    let keyConditionExpression = 'pk = :session_id AND begins_with(sk, :summary_prefix)';
    const expressionAttributeValues: Record<string, any> = {
      ':session_id': sessionId,
      ':summary_prefix': 'SUMMARY#'
    };

    if (summaryType) {
      keyConditionExpression = 'pk = :session_id AND begins_with(sk, :type_prefix)';
      expressionAttributeValues[':type_prefix'] = `SUMMARY#${summaryType}#`;
    }

    const result = await this.queryItems(
      keyConditionExpression,
      undefined,
      expressionAttributeValues,
      undefined,
      undefined,
      undefined,
      undefined,
      false // Sort descending by timestamp (newest first)
    );

    return result.items.map(item => ({
      summaryId: `${item.pk}_${item.sk}`,
      sessionId: item.pk,
      summaryType: item.summary_type! as 'session' | 'periodic' | 'topic',
      summaryText: item.summary_text!,
      keyTopics: item.key_topics || [],
      actionItems: item.action_items || [],
      insights: item.insights!,
      createdAt: new Date(item.sk!.split('#')[2])
    }));
  }

  /**
   * Search conversations across sessions
   */
  async searchConversations(params: ConversationSearchParams): Promise<{
    sessions: AgentSession[];
    messages: ConversationMessage[];
    totalCount: number;
    lastEvaluatedKey?: Record<string, any>;
  }> {
    let filterExpression = 'entity_type = :entity_type';
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {
      ':entity_type': 'session'
    };

    // Add user filter
    if (params.userId) {
      filterExpression += ' AND user_id = :user_id';
      expressionAttributeValues[':user_id'] = params.userId;
    }

    // Add team filter
    if (params.teamId) {
      filterExpression += ' AND team_id = :team_id';
      expressionAttributeValues[':team_id'] = params.teamId;
    }

    // Add persona filter
    if (params.personaId) {
      filterExpression += ' AND persona_id = :persona_id';
      expressionAttributeValues[':persona_id'] = params.personaId;
    }

    // Add date range filter
    if (params.startDate && params.endDate) {
      filterExpression += ' AND start_time BETWEEN :start_date AND :end_date';
      expressionAttributeValues[':start_date'] = params.startDate.toISOString();
      expressionAttributeValues[':end_date'] = params.endDate.toISOString();
    }

    const result = await this.scanItems(
      filterExpression,
      Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      expressionAttributeValues,
      params.limit,
      params.lastEvaluatedKey
    );

    const sessions = result.items.map(item => ({
      sessionId: item.session_id!,
      userId: item.user_id!,
      teamId: item.team_id!,
      personaId: item.persona_id!,
      startTime: new Date(item.start_time!),
      lastActivity: new Date(item.last_activity!),
      context: item.context!,
      metadata: item.metadata || {}
    }));

    // If text query is provided, search in messages
    let messages: ConversationMessage[] = [];
    if (params.query) {
      // This is a simplified text search - in production, use full-text search service
      for (const session of sessions.slice(0, 10)) { // Limit to avoid performance issues
        const history = await this.getConversationHistory({
          sessionId: session.sessionId,
          limit: 100
        });
        
        const matchingMessages = history.messages.filter(msg =>
          msg.content.toLowerCase().includes(params.query!.toLowerCase())
        );
        messages.push(...matchingMessages);
      }
    }

    return {
      sessions,
      messages,
      totalCount: result.count,
      lastEvaluatedKey: result.lastEvaluatedKey
    };
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(
    userId?: string,
    teamId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalSessions: number;
    totalMessages: number;
    averageSessionDuration: number;
    topTopics: string[];
    userEngagement: number;
    commonPatterns: string[];
  }> {
    const searchParams: ConversationSearchParams = {
      userId,
      teamId,
      startDate,
      endDate,
      limit: 1000 // Get a large sample
    };

    const { sessions } = await this.searchConversations(searchParams);
    
    let totalMessages = 0;
    let totalDuration = 0;
    const topics: string[] = [];
    const patterns: string[] = [];

    for (const session of sessions) {
      // Calculate session duration
      const duration = session.lastActivity.getTime() - session.startTime.getTime();
      totalDuration += duration;

      // Get message count and topics
      const history = await this.getConversationHistory({
        sessionId: session.sessionId,
        limit: 1000
      });
      
      totalMessages += history.messages.length;
      
      // Extract topics from context
      if (session.context.currentTopic) {
        topics.push(session.context.currentTopic);
      }
      
      // Simple pattern detection
      const userMessages = history.messages.filter(m => m.role === 'user');
      if (userMessages.length > 5) {
        patterns.push('long_conversation');
      }
      if (userMessages.some(m => m.content.includes('?'))) {
        patterns.push('question_heavy');
      }
    }

    // Calculate metrics
    const averageSessionDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;
    const averageMessagesPerSession = sessions.length > 0 ? totalMessages / sessions.length : 0;
    const userEngagement = Math.min(averageMessagesPerSession / 10, 1); // Normalize to 0-1

    // Get top topics
    const topicCounts = topics.reduce((acc, topic) => {
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topTopics = Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([topic]) => topic);

    // Get common patterns
    const patternCounts = patterns.reduce((acc, pattern) => {
      acc[pattern] = (acc[pattern] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const commonPatterns = Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern]) => pattern);

    return {
      totalSessions: sessions.length,
      totalMessages,
      averageSessionDuration,
      topTopics,
      userEngagement,
      commonPatterns
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24); // 24 hours ago

    const result = await this.scanItems(
      'entity_type = :entity_type AND last_activity < :cutoff_time',
      undefined,
      {
        ':entity_type': 'session',
        ':cutoff_time': cutoffTime.toISOString()
      }
    );

    let cleanedCount = 0;
    for (const item of result.items) {
      await this.updateItem(
        { pk: item.pk, sk: item.sk },
        'SET session_status = :status',
        undefined,
        { ':status': 'expired' }
      );
      cleanedCount++;
    }

    return cleanedCount;
  }

  /**
   * Get TTL timestamp for DynamoDB
   */
  private getTTL(days: number): number {
    const now = new Date();
    now.setDate(now.getDate() + days);
    return Math.floor(now.getTime() / 1000);
  }
}