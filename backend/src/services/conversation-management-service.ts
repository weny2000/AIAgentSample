/**
 * Conversation Management Service
 * Handles conversation session management, context persistence, and intelligent response generation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentSession,
  ConversationContext,
  ConversationMessage,
  ConversationBranch,
  ConversationSummary,
  ConversationInsights,
  MessageReference,
  ActionItem
} from '../models/agent-core';
import { ConversationRepository } from '../repositories/conversation-repository';
import { Logger } from '../lambda/utils/logger';

export interface ConversationSessionConfig {
  maxContextLength: number;
  memoryRetentionDays: number;
  summaryThreshold: number; // Number of messages before creating summary
  branchingEnabled: boolean;
  insightsEnabled: boolean;
}

export interface ContextPersistenceOptions {
  includeReferences: boolean;
  includeMetadata: boolean;
  compressOldMessages: boolean;
  maxStoredMessages: number;
}

export interface ConversationAnalysisResult {
  keyTopics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  userEngagement: number;
  knowledgeGaps: string[];
  recommendedActions: string[];
  conversationFlow: string[];
}

export interface MemoryIntegrationContext {
  shortTermMemory: ConversationMessage[];
  longTermMemory: ConversationSummary[];
  semanticMemory: MessageReference[];
  proceduralMemory: ActionItem[];
}

export class ConversationManagementService {
  private readonly config: ConversationSessionConfig;
  private readonly persistenceOptions: ContextPersistenceOptions;

  constructor(
    private conversationRepository: ConversationRepository,
    private logger: Logger,
    config?: Partial<ConversationSessionConfig>,
    persistenceOptions?: Partial<ContextPersistenceOptions>
  ) {
    this.config = {
      maxContextLength: 10000,
      memoryRetentionDays: 30,
      summaryThreshold: 20,
      branchingEnabled: true,
      insightsEnabled: true,
      ...config
    };

    this.persistenceOptions = {
      includeReferences: true,
      includeMetadata: true,
      compressOldMessages: false,
      maxStoredMessages: 1000,
      ...persistenceOptions
    };
  }

  /**
   * Create a new conversation session with context persistence
   */
  async createSession(
    userId: string,
    teamId: string,
    personaId: string,
    initialContext?: Partial<ConversationContext>
  ): Promise<AgentSession> {
    try {
      this.logger.info('Creating new conversation session', { userId, teamId, personaId });

      const session: AgentSession = {
        sessionId: uuidv4(),
        userId,
        teamId,
        personaId,
        startTime: new Date(),
        lastActivity: new Date(),
        context: {
          conversationId: uuidv4(),
          messages: [],
          relatedArtifacts: [],
          referencedPolicies: [],
          actionItems: [],
          ...initialContext
        },
        metadata: {
          sessionQuality: 1.0
        }
      };

      // Store session in repository
      await this.conversationRepository.storeSession(session);

      // Initialize memory integration context
      await this.initializeMemoryContext(session.sessionId);

      this.logger.info('Conversation session created successfully', { 
        sessionId: session.sessionId 
      });

      return session;

    } catch (error) {
      this.logger.error('Failed to create conversation session', error, { userId, teamId, personaId });
      throw error;
    }
  }

  /**
   * Retrieve conversation session with full context
   */
  async getSession(sessionId: string, includeHistory: boolean = true): Promise<AgentSession | null> {
    try {
      const session = await this.conversationRepository.getSession(sessionId);
      if (!session) {
        return null;
      }

      if (includeHistory) {
        // Load conversation history
        const history = await this.conversationRepository.getConversationHistory({
          sessionId,
          limit: this.config.maxContextLength,
          includeReferences: this.persistenceOptions.includeReferences
        });

        session.context.messages = history.messages;
      }

      return session;

    } catch (error) {
      this.logger.error('Failed to retrieve conversation session', error, { sessionId });
      throw error;
    }
  }

  /**
   * Add message to conversation with context-aware processing
   */
  async addMessage(
    sessionId: string,
    message: ConversationMessage,
    branchId?: string
  ): Promise<void> {
    try {
      this.logger.info('Adding message to conversation', { 
        sessionId, 
        messageId: message.messageId,
        role: message.role 
      });

      // Store message in repository
      await this.conversationRepository.storeMessage(sessionId, message, branchId);

      // Update session activity
      await this.conversationRepository.updateSession(sessionId, {
        lastActivity: new Date()
      });

      // Update context with memory integration
      await this.updateContextWithMemory(sessionId, message);

      // Check if summary is needed
      await this.checkAndCreateSummary(sessionId);

      // Extract insights if enabled
      if (this.config.insightsEnabled) {
        await this.extractConversationInsights(sessionId);
      }

      this.logger.info('Message added successfully', { sessionId, messageId: message.messageId });

    } catch (error) {
      this.logger.error('Failed to add message to conversation', error, { 
        sessionId, 
        messageId: message.messageId 
      });
      throw error;
    }
  }

  /**
   * Get conversation history with advanced filtering and pagination
   */
  async getConversationHistory(
    sessionId: string,
    options: {
      limit?: number;
      offset?: number;
      branchId?: string;
      includeReferences?: boolean;
      messageTypes?: ('user' | 'agent' | 'system')[];
      startTime?: Date;
      endTime?: Date;
    } = {}
  ): Promise<{
    messages: ConversationMessage[];
    totalCount: number;
    hasMore: boolean;
    branches?: ConversationBranch[];
    summary?: ConversationSummary;
  }> {
    try {
      const history = await this.conversationRepository.getConversationHistory({
        sessionId,
        ...options
      });

      // Get latest summary if available
      let summary: ConversationSummary | undefined;
      const summaries = await this.conversationRepository.getSummaries(sessionId, 'session');
      if (summaries.length > 0) {
        summary = summaries[0]; // Most recent summary
      }

      return {
        ...history,
        summary
      };

    } catch (error) {
      this.logger.error('Failed to get conversation history', error, { sessionId });
      throw error;
    }
  }

  /**
   * Create conversation branch for multi-turn dialogue support
   */
  async createBranch(
    sessionId: string,
    parentMessageId: string,
    branchName: string,
    description?: string
  ): Promise<ConversationBranch> {
    try {
      if (!this.config.branchingEnabled) {
        throw new Error('Conversation branching is disabled');
      }

      this.logger.info('Creating conversation branch', { 
        sessionId, 
        parentMessageId, 
        branchName 
      });

      const branch = await this.conversationRepository.createBranch(
        sessionId,
        parentMessageId,
        branchName,
        description
      );

      this.logger.info('Conversation branch created successfully', { 
        sessionId, 
        branchId: branch.branchId 
      });

      return branch;

    } catch (error) {
      this.logger.error('Failed to create conversation branch', error, { 
        sessionId, 
        parentMessageId, 
        branchName 
      });
      throw error;
    }
  }

  /**
   * Generate conversation summary with key insights
   */
  async generateSummary(
    sessionId: string,
    summaryType: 'session' | 'periodic' | 'topic' = 'periodic',
    timeRange?: { startTime: Date; endTime: Date }
  ): Promise<ConversationSummary> {
    try {
      this.logger.info('Generating conversation summary', { sessionId, summaryType });

      // Get conversation history for analysis
      const history = await this.getConversationHistory(sessionId, {
        limit: 1000,
        includeReferences: true,
        startTime: timeRange?.startTime,
        endTime: timeRange?.endTime
      });

      // Analyze conversation for insights
      const analysis = await this.analyzeConversation(history.messages);

      // Generate summary text
      const summaryText = await this.generateSummaryText(history.messages, analysis);

      // Extract action items
      const actionItems = await this.extractActionItemsFromHistory(history.messages);

      // Create summary object
      const summary: ConversationSummary = {
        summaryId: uuidv4(),
        sessionId,
        summaryType,
        summaryText,
        keyTopics: analysis.keyTopics,
        actionItems,
        insights: {
          totalMessages: history.messages.length,
          userEngagement: analysis.userEngagement,
          topicProgression: analysis.conversationFlow,
          sentimentTrend: [analysis.sentiment],
          knowledgeGaps: analysis.knowledgeGaps,
          recommendedActions: analysis.recommendedActions,
          learningOpportunities: this.identifyLearningOpportunities(history.messages)
        },
        createdAt: new Date(),
        timeRange
      };

      // Store summary
      await this.conversationRepository.storeSummary(summary);

      this.logger.info('Conversation summary generated successfully', { 
        sessionId, 
        summaryId: summary.summaryId 
      });

      return summary;

    } catch (error) {
      this.logger.error('Failed to generate conversation summary', error, { sessionId });
      throw error;
    }
  }

  /**
   * Build memory integration context for context-aware responses
   */
  async buildMemoryContext(sessionId: string): Promise<MemoryIntegrationContext> {
    try {
      // Get recent messages (short-term memory)
      const recentHistory = await this.getConversationHistory(sessionId, {
        limit: 10,
        includeReferences: true
      });

      // Get summaries (long-term memory)
      const summaries = await this.conversationRepository.getSummaries(sessionId);

      // Get semantic references from messages
      const semanticMemory: MessageReference[] = [];
      recentHistory.messages.forEach(message => {
        if (message.references) {
          semanticMemory.push(...message.references);
        }
      });

      // Get procedural memory (action items)
      const session = await this.getSession(sessionId, false);
      const proceduralMemory = session?.context.actionItems || [];

      return {
        shortTermMemory: recentHistory.messages,
        longTermMemory: summaries,
        semanticMemory,
        proceduralMemory
      };

    } catch (error) {
      this.logger.error('Failed to build memory context', error, { sessionId });
      throw error;
    }
  }

  /**
   * Extract key insights from conversation
   */
  async extractConversationInsights(sessionId: string): Promise<ConversationInsights> {
    try {
      const history = await this.getConversationHistory(sessionId, {
        limit: 1000,
        includeReferences: true
      });

      const analysis = await this.analyzeConversation(history.messages);

      const insights: ConversationInsights = {
        totalMessages: history.messages.length,
        userEngagement: analysis.userEngagement,
        topicProgression: analysis.conversationFlow,
        sentimentTrend: [analysis.sentiment],
        knowledgeGaps: analysis.knowledgeGaps,
        recommendedActions: analysis.recommendedActions,
        learningOpportunities: this.identifyLearningOpportunities(history.messages)
      };

      return insights;

    } catch (error) {
      this.logger.error('Failed to extract conversation insights', error, { sessionId });
      throw error;
    }
  }

  /**
   * End conversation session with cleanup
   */
  async endSession(sessionId: string): Promise<ConversationSummary> {
    try {
      this.logger.info('Ending conversation session', { sessionId });

      // Generate final session summary
      const summary = await this.generateSummary(sessionId, 'session');

      // Mark session as ended
      await this.conversationRepository.endSession(sessionId);

      this.logger.info('Conversation session ended successfully', { 
        sessionId, 
        summaryId: summary.summaryId 
      });

      return summary;

    } catch (error) {
      this.logger.error('Failed to end conversation session', error, { sessionId });
      throw error;
    }
  }

  /**
   * Initialize memory context for new session
   */
  private async initializeMemoryContext(sessionId: string): Promise<void> {
    // Initialize empty memory context - in production, could load from user's previous sessions
    this.logger.info('Memory context initialized', { sessionId });
  }

  /**
   * Update context with memory integration
   */
  private async updateContextWithMemory(
    sessionId: string,
    message: ConversationMessage
  ): Promise<void> {
    try {
      // Build current memory context
      const memoryContext = await this.buildMemoryContext(sessionId);

      // Update session context with relevant memory
      const contextUpdates: Partial<ConversationContext> = {};

      // Add relevant references from semantic memory
      if (message.references) {
        const session = await this.getSession(sessionId, false);
        if (session) {
          // Merge with existing references, avoiding duplicates
          const existingRefs = session.context.referencedPolicies || [];
          const newRefs = message.references
            .filter(ref => !existingRefs.includes(ref.sourceId))
            .map(ref => ref.sourceId);
          
          contextUpdates.referencedPolicies = [...existingRefs, ...newRefs];
        }
      }

      // Update action items if message contains new actions
      const extractedActions = await this.extractActionItemsFromMessage(message);
      if (extractedActions.length > 0) {
        const session = await this.getSession(sessionId, false);
        if (session) {
          contextUpdates.actionItems = [
            ...(session.context.actionItems || []),
            ...extractedActions
          ];
        }
      }

      // Update session if there are changes
      if (Object.keys(contextUpdates).length > 0) {
        await this.conversationRepository.updateSession(sessionId, {
          context: contextUpdates as ConversationContext
        });
      }

    } catch (error) {
      this.logger.error('Failed to update context with memory', error, { sessionId });
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Check if summary should be created and create it
   */
  private async checkAndCreateSummary(sessionId: string): Promise<void> {
    try {
      const history = await this.getConversationHistory(sessionId, {
        limit: this.config.summaryThreshold + 1
      });

      if (history.messages.length >= this.config.summaryThreshold) {
        // Check if we already have a recent summary
        const summaries = await this.conversationRepository.getSummaries(sessionId, 'periodic');
        const lastSummary = summaries[0];

        if (!lastSummary || 
            history.messages.length - lastSummary.insights.totalMessages >= this.config.summaryThreshold) {
          await this.generateSummary(sessionId, 'periodic');
        }
      }

    } catch (error) {
      this.logger.error('Failed to check and create summary', error, { sessionId });
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Analyze conversation for insights
   */
  private async analyzeConversation(messages: ConversationMessage[]): Promise<ConversationAnalysisResult> {
    // Simple analysis - in production, use NLP services
    const keyTopics = this.extractTopics(messages);
    const sentiment = this.analyzeSentiment(messages);
    const userEngagement = this.calculateUserEngagement(messages);
    const knowledgeGaps = this.identifyKnowledgeGaps(messages);
    const recommendedActions = this.generateRecommendedActions(messages);
    const conversationFlow = this.analyzeConversationFlow(messages);

    return {
      keyTopics,
      sentiment,
      userEngagement,
      knowledgeGaps,
      recommendedActions,
      conversationFlow
    };
  }

  /**
   * Generate summary text from messages and analysis
   */
  private async generateSummaryText(
    messages: ConversationMessage[],
    analysis: ConversationAnalysisResult
  ): Promise<string> {
    const userMessages = messages.filter(m => m.role === 'user').length;
    const agentMessages = messages.filter(m => m.role === 'agent').length;
    const duration = messages.length > 0 ? 
      messages[messages.length - 1].timestamp.getTime() - messages[0].timestamp.getTime() : 0;

    return `Conversation summary: ${userMessages} user messages and ${agentMessages} agent responses over ${Math.round(duration / 60000)} minutes. ` +
           `Key topics discussed: ${analysis.keyTopics.join(', ')}. ` +
           `Overall sentiment: ${analysis.sentiment}. ` +
           `User engagement level: ${Math.round(analysis.userEngagement * 100)}%.`;
  }

  /**
   * Extract action items from conversation history
   */
  private async extractActionItemsFromHistory(messages: ConversationMessage[]): Promise<ActionItem[]> {
    const actionItems: ActionItem[] = [];

    for (const message of messages) {
      const messageActions = await this.extractActionItemsFromMessage(message);
      actionItems.push(...messageActions);
    }

    return actionItems;
  }

  /**
   * Extract action items from a single message
   */
  private async extractActionItemsFromMessage(message: ConversationMessage): Promise<ActionItem[]> {
    const actionItems: ActionItem[] = [];
    const content = message.content.toLowerCase();

    // Simple action item extraction - in production, use NLP
    if (content.includes('todo') || content.includes('action item') || content.includes('follow up')) {
      actionItems.push({
        id: uuidv4(),
        description: `Follow up on: ${message.content.substring(0, 100)}...`,
        priority: 'medium',
        status: 'pending',
        createdAt: message.timestamp
      });
    }

    if (content.includes('urgent') || content.includes('critical')) {
      actionItems.push({
        id: uuidv4(),
        description: `Urgent action required: ${message.content.substring(0, 100)}...`,
        priority: 'high',
        status: 'pending',
        createdAt: message.timestamp
      });
    }

    return actionItems;
  }

  /**
   * Extract topics from messages
   */
  private extractTopics(messages: ConversationMessage[]): string[] {
    const topics = new Set<string>();
    
    messages.forEach(message => {
      const content = message.content.toLowerCase();
      if (content.includes('security')) topics.add('security');
      if (content.includes('policy')) topics.add('policy');
      if (content.includes('compliance')) topics.add('compliance');
      if (content.includes('deployment')) topics.add('deployment');
      if (content.includes('testing')) topics.add('testing');
      if (content.includes('documentation')) topics.add('documentation');
    });

    return Array.from(topics);
  }

  /**
   * Analyze overall sentiment of conversation
   */
  private analyzeSentiment(messages: ConversationMessage[]): 'positive' | 'neutral' | 'negative' {
    let positiveCount = 0;
    let negativeCount = 0;

    messages.forEach(message => {
      const content = message.content.toLowerCase();
      if (content.includes('good') || content.includes('great') || content.includes('excellent') || 
          content.includes('thanks') || content.includes('helpful')) {
        positiveCount++;
      }
      if (content.includes('bad') || content.includes('error') || content.includes('problem') || 
          content.includes('issue') || content.includes('wrong')) {
        negativeCount++;
      }
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Calculate user engagement score
   */
  private calculateUserEngagement(messages: ConversationMessage[]): number {
    const userMessages = messages.filter(m => m.role === 'user');
    const totalMessages = messages.length;
    
    if (totalMessages === 0) return 0;

    const userRatio = userMessages.length / totalMessages;
    const averageLength = userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length;
    
    // Normalize engagement score (0-1)
    return Math.min((userRatio * 2 + averageLength / 1000) / 2, 1);
  }

  /**
   * Identify knowledge gaps from conversation
   */
  private identifyKnowledgeGaps(messages: ConversationMessage[]): string[] {
    const gaps: string[] = [];
    
    messages.forEach(message => {
      const content = message.content.toLowerCase();
      if (content.includes("don't know") || content.includes("not sure") || 
          content.includes("unclear") || content.includes("confused")) {
        gaps.push('User expressed uncertainty');
      }
      if (content.includes('no results') || content.includes('not found')) {
        gaps.push('Information not available in knowledge base');
      }
    });

    return [...new Set(gaps)];
  }

  /**
   * Generate recommended actions based on conversation
   */
  private generateRecommendedActions(messages: ConversationMessage[]): string[] {
    const actions: string[] = [];
    
    const topics = this.extractTopics(messages);
    
    if (topics.includes('security')) {
      actions.push('Review security policies and compliance requirements');
    }
    if (topics.includes('deployment')) {
      actions.push('Check deployment procedures and rollback plans');
    }
    if (topics.includes('testing')) {
      actions.push('Ensure comprehensive test coverage');
    }

    return actions;
  }

  /**
   * Analyze conversation flow and progression
   */
  private analyzeConversationFlow(messages: ConversationMessage[]): string[] {
    const flow: string[] = [];
    let currentTopic = '';

    messages.forEach(message => {
      const topics = this.extractTopics([message]);
      if (topics.length > 0 && topics[0] !== currentTopic) {
        currentTopic = topics[0];
        flow.push(currentTopic);
      }
    });

    return flow;
  }

  /**
   * Identify learning opportunities from conversation
   */
  private identifyLearningOpportunities(messages: ConversationMessage[]): string[] {
    const opportunities: string[] = [];
    
    const userQuestions = messages.filter(m => 
      m.role === 'user' && m.content.includes('?')
    );

    if (userQuestions.length > 5) {
      opportunities.push('User has many questions - consider creating FAQ or training material');
    }

    const topics = this.extractTopics(messages);
    if (topics.length > 3) {
      opportunities.push('Conversation covers multiple topics - consider topic-specific guidance');
    }

    return opportunities;
  }
} 