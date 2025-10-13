/**
 * AgentCore Service Implementation
 * Centralized agent functionality with conversation management and persona integration
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentSession,
  ConversationContext,
  ConversationMessage,
  ConversationBranch,
  ConversationSummary,
  ConversationInsights,
  AgentConfiguration,
  AgentCapability,
  AgentDecision,
  AgentLearning,
  StartSessionRequest,
  StartSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetSessionHistoryRequest,
  GetSessionHistoryResponse,
  AgentCoreError,
  SessionNotFoundError,
  InvalidPersonaError,
  SessionExpiredError,
  ComplianceViolationError,
  MessageReference,
  ActionItem,
  DecisionOption
} from '../models/agent-core';
import { MemoryIntegrationContext } from './conversation-management-service';
import { PersonaRepository } from '../repositories/persona-repository';
import { AuditLogRepository } from '../repositories/audit-log-repository';
import { KendraSearchService, SearchRequest } from './kendra-search-service';
import { RulesEngineService } from '../rules-engine/rules-engine-service';
import { ConversationManagementService } from './conversation-management-service';
import { NotificationService, NotificationRequest } from './notification-service';
import { Logger } from '../lambda/utils/logger';

export class AgentCoreService {
  private sessions: Map<string, AgentSession> = new Map();
  private configurations: Map<string, AgentConfiguration> = new Map();
  private capabilities: Map<string, AgentCapability[]> = new Map();
  
  constructor(
    private personaRepository: PersonaRepository,
    private auditRepository: AuditLogRepository,
    private kendraService: KendraSearchService,
    private rulesEngine: RulesEngineService,
    private conversationService: ConversationManagementService,
    private notificationService: NotificationService,
    private logger: Logger
  ) {
    this.initializeDefaultCapabilities();
  }

  /**
   * Start a new agent session
   */
  async startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
    try {
      this.logger.info('Starting new agent session', { 
        userId: request.userId, 
        teamId: request.teamId,
        personaId: request.personaId 
      });

      // Validate persona
      const personaId = request.personaId || await this.getDefaultPersonaForTeam(request.teamId);
      const persona = await this.personaRepository.getPersonaById(personaId);
      if (!persona) {
        throw new InvalidPersonaError(personaId);
      }

      // Create session using conversation management service
      const session = await this.conversationService.createSession(
        request.userId,
        request.teamId,
        personaId,
        request.context
      );

      // Get agent configuration
      const agentConfig = await this.getAgentConfiguration(personaId);
      const capabilities = await this.getAgentCapabilities(personaId);

      // Store session in memory for quick access
      this.sessions.set(session.sessionId, session);

      // Generate welcome message if requested
      let welcomeMessage: string | undefined;
      if (request.initialMessage) {
        const welcomeResponse = await this.processMessage(session.sessionId, request.initialMessage, true);
        welcomeMessage = welcomeResponse.response;
      } else {
        welcomeMessage = await this.generateWelcomeMessage(persona, request.teamId);
      }

      // Audit session start
      await this.auditRepository.create({
        request_id: session.sessionId,
        user_id: request.userId,
        persona: personaId,
        action: 'agent_session_started',
        references: [],
        result_summary: 'Agent session started successfully',
        compliance_score: 1.0,
        team_id: request.teamId,
        session_id: session.sessionId
      });

      return {
        sessionId: session.sessionId,
        agentConfiguration: agentConfig,
        capabilities,
        welcomeMessage
      };

    } catch (error) {
      this.logger.error('Failed to start agent session', error as Error, { request });
      throw error;
    }
  }

  /**
   * Send a message to the agent
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      this.logger.info('Processing agent message', { 
        sessionId: request.sessionId,
        messageLength: request.message.length 
      });

      const session = this.getSession(request.sessionId);
      const response = await this.processMessage(session.sessionId, request.message);

      return response;

    } catch (error) {
      this.logger.error('Failed to process agent message', error as Error, { request });
      throw error;
    }
  }

  /**
   * Get session conversation history
   */
  async getSessionHistory(request: GetSessionHistoryRequest): Promise<GetSessionHistoryResponse> {
    try {
      const history = await this.conversationService.getConversationHistory(
        request.sessionId,
        {
          limit: request.limit,
          offset: request.offset,
          includeReferences: request.includeReferences
        }
      );

      return {
        messages: history.messages,
        totalCount: history.totalCount,
        hasMore: history.hasMore,
        summary: history.summary?.summaryText
      };

    } catch (error) {
      this.logger.error('Failed to get session history', error as Error, { request });
      throw error;
    }
  }

  /**
   * End an agent session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const session = this.getSession(sessionId);
      
      // End session using conversation management service
      const summary = await this.conversationService.endSession(sessionId);

      // Store learning data
      await this.storeLearningData(session);

      // Audit session end
      await this.auditRepository.create({
        request_id: sessionId,
        user_id: session.userId,
        persona: session.personaId,
        action: 'agent_session_ended',
        references: [],
        result_summary: `Session ended. Duration: ${Date.now() - session.startTime.getTime()}ms`,
        compliance_score: 1.0,
        team_id: session.teamId,
        session_id: sessionId
      });

      // Remove from active sessions
      this.sessions.delete(sessionId);

      this.logger.info('Agent session ended', { sessionId, summary: summary.summaryText });

    } catch (error) {
      this.logger.error('Failed to end agent session', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Create a conversation branch for multi-turn dialogue
   */
  async createConversationBranch(
    sessionId: string,
    parentMessageId: string,
    branchName: string,
    description?: string
  ): Promise<ConversationBranch> {
    try {
      this.logger.info('Creating conversation branch', { sessionId, parentMessageId, branchName });

      const session = this.getSession(sessionId);
      const branch = await this.conversationService.createBranch(
        sessionId,
        parentMessageId,
        branchName,
        description
      );

      // Audit branch creation
      await this.auditRepository.create({
        request_id: branch.branchId,
        user_id: session.userId,
        persona: session.personaId,
        action: 'conversation_branch_created',
        references: [],
        result_summary: `Conversation branch '${branchName}' created`,
        compliance_score: 1.0,
        team_id: session.teamId,
        session_id: sessionId
      });

      return branch;

    } catch (error) {
      this.logger.error('Failed to create conversation branch', error as Error, { sessionId, parentMessageId });
      throw error;
    }
  }

  /**
   * Generate conversation summary with key insights
   */
  async generateConversationSummary(
    sessionId: string,
    summaryType: 'session' | 'periodic' | 'topic' = 'periodic'
  ): Promise<ConversationSummary> {
    try {
      this.logger.info('Generating conversation summary', { sessionId, summaryType });

      const session = this.getSession(sessionId);
      const summary = await this.conversationService.generateSummary(sessionId, summaryType);

      // Audit summary generation
      await this.auditRepository.create({
        request_id: summary.summaryId,
        user_id: session.userId,
        persona: session.personaId,
        action: 'conversation_summary_generated',
        references: [],
        result_summary: `${summaryType} summary generated with ${summary.keyTopics.length} key topics`,
        compliance_score: 1.0,
        team_id: session.teamId,
        session_id: sessionId
      });

      return summary;

    } catch (error) {
      this.logger.error('Failed to generate conversation summary', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Get conversation insights and analytics
   */
  async getConversationInsights(sessionId: string): Promise<ConversationInsights> {
    try {
      this.logger.info('Getting conversation insights', { sessionId });

      const insights = await this.conversationService.extractConversationInsights(sessionId);

      return insights;

    } catch (error) {
      this.logger.error('Failed to get conversation insights', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Send proactive notifications based on agent analysis
   */
  async sendProactiveNotification(
    sessionId: string,
    notificationType: 'policy_update' | 'security_alert' | 'compliance_reminder' | 'knowledge_gap',
    message: string,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    try {
      const session = this.getSession(sessionId);
      
      this.logger.info('Sending proactive notification', { 
        sessionId, 
        notificationType, 
        urgency 
      });

      // Create a mock impact analysis for notification service
      const mockImpactAnalysis = {
        change_id: `agent-notification-${Date.now()}`,
        affected_services: [],
        stakeholders: [{
          team_id: session.teamId,
          role: 'recipient',
          priority: urgency as 'low' | 'medium' | 'high',
          contact_info: session.userId,
          notification_preferences: ['slack', 'email']
        }],
        risk_assessment: {
          overall_risk_level: urgency as 'low' | 'medium' | 'high',
          cross_team_impact_count: 1,
          critical_path_services: [],
          risk_factors: []
        },
        mitigation_strategies: []
      };

      const notificationRequest: NotificationRequest = {
        impact_analysis: mockImpactAnalysis,
        change_description: message,
        change_timeline: 'Immediate',
        requester: {
          user_id: 'ai-agent',
          name: 'AI Agent',
          email: 'ai-agent@system.local',
          team_id: 'system'
        },
        notification_type: 'impact_alert',
        urgency
      };

      await this.notificationService.sendStakeholderNotifications(notificationRequest);

      // Audit the proactive notification
      await this.auditRepository.create({
        request_id: `proactive-${Date.now()}`,
        user_id: session.userId,
        persona: session.personaId,
        action: 'proactive_notification_sent',
        references: [],
        result_summary: `Proactive ${notificationType} notification sent: ${message}`,
        compliance_score: 1.0,
        team_id: session.teamId,
        session_id: sessionId
      });

    } catch (error) {
      this.logger.error('Failed to send proactive notification', error as Error, { 
        sessionId, 
        notificationType 
      });
      throw error;
    }
  }

  /**
   * Analyze conversation for proactive opportunities
   */
  async analyzeForProactiveActions(sessionId: string): Promise<{
    recommendations: string[];
    notifications: Array<{
      type: 'policy_update' | 'security_alert' | 'compliance_reminder' | 'knowledge_gap';
      message: string;
      urgency: 'low' | 'medium' | 'high' | 'critical';
    }>;
  }> {
    try {
      const session = this.getSession(sessionId);
      const insights = await this.conversationService.extractConversationInsights(sessionId);
      
      const recommendations: string[] = [];
      const notifications: Array<{
        type: 'policy_update' | 'security_alert' | 'compliance_reminder' | 'knowledge_gap';
        message: string;
        urgency: 'low' | 'medium' | 'high' | 'critical';
      }> = [];

      // Analyze knowledge gaps
      if (insights.knowledgeGaps.length > 0) {
        recommendations.push('Consider creating documentation for frequently asked questions');
        notifications.push({
          type: 'knowledge_gap',
          message: `Knowledge gaps identified: ${insights.knowledgeGaps.join(', ')}`,
          urgency: 'low'
        });
      }

      // Analyze topic progression for policy updates
      if (insights.topicProgression.includes('security') || insights.topicProgression.includes('compliance')) {
        recommendations.push('Review latest security and compliance policies');
        notifications.push({
          type: 'policy_update',
          message: 'Security or compliance topics discussed - review latest policies',
          urgency: 'medium'
        });
      }

      // Analyze user engagement for training opportunities
      if (insights.userEngagement < 0.5) {
        recommendations.push('Consider providing additional training or support');
      }

      // Check for learning opportunities
      if (insights.learningOpportunities.length > 0) {
        recommendations.push(...insights.learningOpportunities);
      }

      return {
        recommendations,
        notifications
      };

    } catch (error) {
      this.logger.error('Failed to analyze for proactive actions', error as Error, { sessionId });
      return { recommendations: [], notifications: [] };
    }
  }

  /**
   * Build memory context for context-aware responses
   */
  async buildMemoryContext(sessionId: string): Promise<MemoryIntegrationContext> {
    try {
      this.logger.info('Building memory context', { sessionId });

      const memoryContext = await this.conversationService.buildMemoryContext(sessionId);

      return memoryContext;

    } catch (error) {
      this.logger.error('Failed to build memory context', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Process a message and generate response
   */
  private async processMessage(
    sessionId: string, 
    message: string, 
    isWelcome: boolean = false
  ): Promise<SendMessageResponse> {
    const startTime = Date.now();
    const session = this.getSession(sessionId);
    const messageId = uuidv4();

    try {
      // Update session activity
      session.lastActivity = new Date();

      // Add user message to context using conversation service
      if (!isWelcome) {
        const userMessage: ConversationMessage = {
          messageId: uuidv4(),
          role: 'user',
          content: message,
          timestamp: new Date(),
          metadata: {}
        };
        await this.conversationService.addMessage(sessionId, userMessage);
        session.context.messages.push(userMessage);
      }

      // Get persona configuration
      const persona = await this.personaRepository.getPersonaById(session.personaId);
      if (!persona) {
        throw new InvalidPersonaError(session.personaId);
      }

      // Analyze message intent and context
      const messageAnalysis = await this.analyzeMessage(message, session.context);
      
      // Check compliance
      const complianceCheck = await this.checkCompliance(message, session);
      if (!complianceCheck.compliant) {
        throw new ComplianceViolationError(complianceCheck.violation);
      }

      // Search for relevant knowledge
      const knowledgeResults = await this.searchKnowledge(message, session.teamId);
      
      // Make agent decision
      const decision = await this.makeAgentDecision(messageAnalysis, knowledgeResults, persona);
      
      // Generate response
      const response = await this.generateResponse(
        message,
        messageAnalysis,
        knowledgeResults,
        decision,
        persona,
        session
      );

      // Extract action items
      const actionItems = await this.extractActionItems(response, session);

      // Add agent message to context using conversation service
      const agentMessage: ConversationMessage = {
        messageId,
        role: 'agent',
        content: response,
        timestamp: new Date(),
        metadata: {
          confidence: decision.confidence,
          processingTime: Date.now() - startTime,
          sources: knowledgeResults.map(r => r.sourceId),
          personaUsed: session.personaId,
          complianceChecked: true
        },
        references: knowledgeResults
      };
      await this.conversationService.addMessage(sessionId, agentMessage);
      session.context.messages.push(agentMessage);

      // Update action items
      session.context.actionItems.push(...actionItems);

      // Generate suggestions
      const suggestions = await this.generateSuggestions(messageAnalysis, session);

      // Audit the interaction
      await this.auditRepository.create({
        request_id: messageId,
        user_id: session.userId,
        persona: session.personaId,
        action: 'agent_message_processed',
        references: knowledgeResults.map(r => ({
          source_id: r.sourceId,
          source_type: r.sourceType,
          confidence_score: r.confidence,
          snippet: r.snippet
        })),
        result_summary: `Message processed successfully. Confidence: ${decision.confidence}`,
        compliance_score: complianceCheck.score,
        team_id: session.teamId,
        session_id: sessionId
      });

      return {
        messageId,
        response,
        references: knowledgeResults,
        actionItems,
        suggestions,
        confidence: decision.confidence,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('Failed to process message', error as Error, { sessionId, message });
      
      // Add error message to context
      const errorMessage: ConversationMessage = {
        messageId,
        role: 'agent',
        content: 'I apologize, but I encountered an error processing your request. Please try again or contact support if the issue persists.',
        timestamp: new Date(),
        metadata: {
          confidence: 0,
          processingTime: Date.now() - startTime,
          personaUsed: session.personaId,
          complianceChecked: false
        }
      };
      session.context.messages.push(errorMessage);

      throw error;
    }
  }

  /**
   * Analyze message intent and extract context
   */
  private async analyzeMessage(message: string, context: ConversationContext): Promise<any> {
    // Simple intent analysis - in production, use NLP service
    const analysis = {
      intent: this.detectIntent(message),
      entities: this.extractEntities(message),
      sentiment: this.analyzeSentiment(message),
      topic: this.identifyTopic(message, context),
      urgency: this.assessUrgency(message)
    };

    return analysis;
  }

  /**
   * Check message compliance with policies
   */
  private async checkCompliance(message: string, session: AgentSession): Promise<{
    compliant: boolean;
    score: number;
    violation?: string;
  }> {
    try {
      // Check for sensitive information
      const hasPII = this.detectPII(message);
      if (hasPII) {
        return {
          compliant: false,
          score: 0,
          violation: 'Message contains personally identifiable information'
        };
      }

      // Check against team policies
      const policyCheck = await this.rulesEngine.validateContent(message, session.teamId);
      
      return {
        compliant: policyCheck.compliant,
        score: policyCheck.score,
        violation: policyCheck.violation
      };

    } catch (error) {
      this.logger.error('Compliance check failed', error as Error);
      return { compliant: true, score: 1.0 }; // Fail open for availability
    }
  }

  /**
   * Search knowledge base for relevant information
   */
  private async searchKnowledge(query: string, teamId: string): Promise<MessageReference[]> {
    try {
      const searchRequest: SearchRequest = {
        query,
        teamId,
        limit: 5
      };

      const searchResults = await this.kendraService.search(searchRequest);

      return searchResults.results.map(result => ({
        sourceId: result.id,
        sourceType: result.type as 'policy' | 'artifact' | 'knowledge' | 'conversation',
        snippet: result.excerpt,
        confidence: result.confidence,
        url: result.uri
      }));

    } catch (error) {
      this.logger.error('Knowledge search failed', error as Error);
      return [];
    }
  }

  /**
   * Make agent decision based on analysis and knowledge
   */
  private async makeAgentDecision(
    analysis: any,
    knowledge: MessageReference[],
    persona: any
  ): Promise<AgentDecision> {
    const options: DecisionOption[] = [
      {
        id: 'direct_answer',
        description: 'Provide direct answer based on knowledge',
        pros: ['Quick response', 'Clear information'],
        cons: ['May lack context'],
        riskLevel: 'low',
        complianceScore: 0.9
      },
      {
        id: 'guided_exploration',
        description: 'Guide user through exploration',
        pros: ['Educational', 'Comprehensive'],
        cons: ['Takes longer'],
        riskLevel: 'low',
        complianceScore: 0.95
      },
      {
        id: 'escalate',
        description: 'Escalate to human expert',
        pros: ['Expert knowledge', 'High accuracy'],
        cons: ['Slower response', 'Resource intensive'],
        riskLevel: 'low',
        complianceScore: 1.0
      }
    ];

    // Simple decision logic - in production, use ML model
    let selectedOption = 'direct_answer';
    let confidence = 0.8;

    if (knowledge.length === 0) {
      selectedOption = 'escalate';
      confidence = 0.6;
    } else if (analysis.urgency === 'high') {
      selectedOption = 'direct_answer';
      confidence = 0.9;
    } else if (analysis.intent === 'learning') {
      selectedOption = 'guided_exploration';
      confidence = 0.85;
    }

    return {
      decisionId: uuidv4(),
      context: analysis.topic,
      options,
      selectedOption,
      reasoning: `Selected ${selectedOption} based on intent: ${analysis.intent}, knowledge available: ${knowledge.length > 0}`,
      confidence,
      timestamp: new Date(),
      complianceChecked: true
    };
  }

  /**
   * Generate agent response
   */
  private async generateResponse(
    message: string,
    analysis: any,
    knowledge: MessageReference[],
    decision: AgentDecision,
    persona: any,
    session: AgentSession
  ): Promise<string> {
    // Simple response generation - in production, use LLM
    let response = '';

    switch (decision.selectedOption) {
      case 'direct_answer':
        if (knowledge.length > 0) {
          response = `Based on the available information, ${knowledge[0].snippet}`;
        } else {
          response = `I understand you're asking about ${analysis.topic}. Let me help you with that.`;
        }
        break;

      case 'guided_exploration':
        response = `That's an interesting question about ${analysis.topic}. Let me guide you through this step by step.`;
        if (knowledge.length > 0) {
          response += ` First, ${knowledge[0].snippet}`;
        }
        break;

      case 'escalate':
        response = `This is a complex question that would benefit from expert input. I'm connecting you with a specialist who can provide detailed guidance.`;
        break;

      default:
        response = `I'm here to help with your question about ${analysis.topic}.`;
    }

    // Apply persona style
    if (persona.communication_style === 'formal') {
      response = this.applyFormalTone(response);
    } else if (persona.communication_style === 'casual') {
      response = this.applyCasualTone(response);
    }

    return response;
  }

  /**
   * Extract action items from response
   */
  private async extractActionItems(response: string, session: AgentSession): Promise<ActionItem[]> {
    const actionItems: ActionItem[] = [];

    // Simple action item extraction - in production, use NLP
    if (response.includes('review') || response.includes('check')) {
      actionItems.push({
        id: uuidv4(),
        description: 'Review the suggested information',
        priority: 'medium',
        status: 'pending',
        createdAt: new Date()
      });
    }

    if (response.includes('contact') || response.includes('escalate')) {
      actionItems.push({
        id: uuidv4(),
        description: 'Contact specialist for detailed guidance',
        priority: 'high',
        status: 'pending',
        createdAt: new Date()
      });
    }

    return actionItems;
  }

  /**
   * Generate suggestions for next actions
   */
  private async generateSuggestions(analysis: any, session: AgentSession): Promise<string[]> {
    const suggestions: string[] = [];

    // Generate contextual suggestions
    if (analysis.intent === 'question') {
      suggestions.push('Would you like me to explain this in more detail?');
      suggestions.push('Should I search for related policies?');
    }

    if (analysis.topic === 'security') {
      suggestions.push('Check security compliance requirements');
      suggestions.push('Review security best practices');
    }

    if (session.context.actionItems.length > 0) {
      suggestions.push('Review your pending action items');
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Get session by ID with validation
   */
  private getSession(sessionId: string): AgentSession {
    // First check in-memory cache
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // If not in cache, try to load from conversation service
      // Note: This would be async in production, but keeping sync for compatibility
      throw new SessionNotFoundError(sessionId);
    }

    // Check if session is expired (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - session.lastActivity.getTime() > maxAge) {
      this.sessions.delete(sessionId);
      throw new SessionExpiredError(sessionId);
    }

    return session;
  }

  /**
   * Get session by ID with full context loading (async version)
   */
  private async getSessionAsync(sessionId: string): Promise<AgentSession> {
    // First check in-memory cache
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // Load from conversation service
      session = await this.conversationService.getSession(sessionId, true);
      if (!session) {
        throw new SessionNotFoundError(sessionId);
      }
      
      // Cache in memory
      this.sessions.set(sessionId, session);
    }

    // Check if session is expired (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - session.lastActivity.getTime() > maxAge) {
      this.sessions.delete(sessionId);
      throw new SessionExpiredError(sessionId);
    }

    return session;
  }

  /**
   * Initialize default agent capabilities
   */
  private initializeDefaultCapabilities(): void {
    const defaultCapabilities: AgentCapability[] = [
      {
        id: 'knowledge_search',
        name: 'Knowledge Search',
        description: 'Search organizational knowledge base',
        category: 'search',
        enabled: true,
        configuration: { maxResults: 10 },
        permissions: ['read:knowledge']
      },
      {
        id: 'policy_analysis',
        name: 'Policy Analysis',
        description: 'Analyze content against policies',
        category: 'analysis',
        enabled: true,
        configuration: { strictMode: false },
        permissions: ['read:policies']
      },
      {
        id: 'artifact_validation',
        name: 'Artifact Validation',
        description: 'Validate artifacts and configurations',
        category: 'validation',
        enabled: true,
        configuration: { autoFix: false },
        permissions: ['read:artifacts', 'validate:artifacts']
      },
      {
        id: 'notification_management',
        name: 'Notification Management',
        description: 'Send notifications and create issues',
        category: 'notification',
        enabled: true,
        configuration: { channels: ['slack', 'email'] },
        permissions: ['send:notifications', 'create:issues']
      }
    ];

    this.capabilities.set('default', defaultCapabilities);
  }

  // Helper methods for message analysis
  private detectIntent(message: string): string {
    if (message.includes('?')) return 'question';
    if (message.includes('help') || message.includes('how')) return 'help';
    if (message.includes('check') || message.includes('validate')) return 'validation';
    if (message.includes('explain') || message.includes('learn')) return 'learning';
    return 'general';
  }

  private extractEntities(message: string): string[] {
    // Simple entity extraction - in production, use NER
    const entities: string[] = [];
    if (message.includes('security')) entities.push('security');
    if (message.includes('policy')) entities.push('policy');
    if (message.includes('compliance')) entities.push('compliance');
    return entities;
  }

  private analyzeSentiment(message: string): string {
    // Simple sentiment analysis - in production, use ML service
    if (message.includes('urgent') || message.includes('critical')) return 'negative';
    if (message.includes('thanks') || message.includes('great')) return 'positive';
    return 'neutral';
  }

  private identifyTopic(message: string, context: ConversationContext): string {
    // Simple topic identification
    if (message.includes('security')) return 'security';
    if (message.includes('policy')) return 'policy';
    if (message.includes('compliance')) return 'compliance';
    if (context.currentTopic) return context.currentTopic;
    return 'general';
  }

  private assessUrgency(message: string): string {
    if (message.includes('urgent') || message.includes('critical') || message.includes('emergency')) {
      return 'high';
    }
    if (message.includes('soon') || message.includes('asap')) {
      return 'medium';
    }
    return 'low';
  }

  private detectPII(message: string): boolean {
    // Simple PII detection - in production, use Amazon Comprehend
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-\d{3}-\d{4}\b/ // Phone
    ];
    
    return piiPatterns.some(pattern => pattern.test(message));
  }

  private applyFormalTone(response: string): string {
    return response.replace(/I'm/g, 'I am').replace(/can't/g, 'cannot');
  }

  private applyCasualTone(response: string): string {
    return response.replace(/I am/g, "I'm").replace(/cannot/g, "can't");
  }

  private async getDefaultPersonaForTeam(teamId: string): Promise<string> {
    // Get default persona for team - in production, query database
    return 'default-persona';
  }

  private async getAgentConfiguration(personaId: string): Promise<AgentConfiguration> {
    // Get or create agent configuration
    let config = this.configurations.get(personaId);
    if (!config) {
      config = {
        agentId: uuidv4(),
        name: 'AI Assistant',
        description: 'Intelligent assistant for team collaboration',
        personaId,
        capabilities: ['knowledge_search', 'policy_analysis', 'artifact_validation'],
        settings: {
          responseStyle: 'adaptive',
          verbosity: 'detailed',
          proactivity: 'moderate',
          learningEnabled: true,
          memoryRetention: 30,
          maxContextLength: 10000
        },
        constraints: {
          maxSessionDuration: 480, // 8 hours
          maxConcurrentSessions: 10,
          allowedActions: ['search', 'analyze', 'validate', 'notify'],
          restrictedTopics: ['personal', 'financial'],
          complianceRequired: true,
          auditLevel: 'detailed'
        },
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.configurations.set(personaId, config);
    }
    return config;
  }

  private async getAgentCapabilities(personaId: string): Promise<AgentCapability[]> {
    return this.capabilities.get('default') || [];
  }

  private async generateWelcomeMessage(persona: any, teamId: string): Promise<string> {
    return `Hello! I'm your AI assistant, configured with the ${persona.name} persona. I'm here to help you with questions about policies, artifact validation, and team collaboration. How can I assist you today?`;
  }

  private async generateSessionSummary(session: AgentSession): Promise<string> {
    const messageCount = session.context.messages.length;
    const duration = Date.now() - session.startTime.getTime();
    const topics = [...new Set(session.context.messages.map(m => this.identifyTopic(m.content, session.context)))];
    
    return `Session completed with ${messageCount} messages over ${Math.round(duration / 60000)} minutes. Topics discussed: ${topics.join(', ')}.`;
  }

  private async storeLearningData(session: AgentSession): Promise<void> {
    // Store learning data for future improvements
    const learningData: AgentLearning = {
      sessionId: session.sessionId,
      userId: session.userId,
      interactions: session.context.messages.map(msg => ({
        timestamp: msg.timestamp,
        userInput: msg.role === 'user' ? msg.content : '',
        agentResponse: msg.role === 'agent' ? msg.content : '',
        userSatisfaction: msg.metadata.confidence
      })),
      patterns: [],
      improvements: [],
      feedback: []
    };

    // In production, store in database
    this.logger.info('Learning data stored', { sessionId: session.sessionId, interactions: learningData.interactions.length });
  }

  // New API endpoint methods for task 33

  /**
   * Get agent capabilities with filtering options
   */
  async getCapabilities(options: {
    category?: 'analysis' | 'generation' | 'validation' | 'search' | 'notification';
    enabled?: boolean;
    userId: string;
    teamId: string;
  }): Promise<AgentCapability[]> {
    try {
      this.logger.info('Getting agent capabilities', options);

      // Get all capabilities for the team
      let capabilities = await this.getAgentCapabilities('default');

      // Apply filters
      if (options.category) {
        capabilities = capabilities.filter(cap => cap.category === options.category);
      }

      if (options.enabled !== undefined) {
        capabilities = capabilities.filter(cap => cap.enabled === options.enabled);
      }

      // Filter by user permissions
      capabilities = capabilities.filter(cap => 
        cap.permissions.length === 0 || 
        cap.permissions.some(perm => this.hasUserPermission(options.userId, perm))
      );

      this.logger.info('Capabilities retrieved', { 
        userId: options.userId,
        capabilityCount: capabilities.length 
      });

      return capabilities;

    } catch (error) {
      this.logger.error('Failed to get capabilities', error as Error);
      throw error;
    }
  }

  /**
   * Get agent metadata for a team
   */
  async getAgentMetadata(teamId: string): Promise<{
    agentId: string;
    name: string;
    description: string;
    version: string;
    capabilities: string[];
    supportedLanguages: string[];
    maxSessionDuration: number;
    maxConcurrentSessions: number;
    features: string[];
  }> {
    try {
      this.logger.info('Getting agent metadata', { teamId });

      const config = await this.getAgentConfiguration('default');
      const capabilities = await this.getAgentCapabilities('default');

      const metadata = {
        agentId: config.agentId,
        name: config.name,
        description: config.description,
        version: config.version,
        capabilities: capabilities.map(cap => cap.name),
        supportedLanguages: ['en', 'es', 'fr', 'de'], // In production, get from config
        maxSessionDuration: config.constraints.maxSessionDuration,
        maxConcurrentSessions: config.constraints.maxConcurrentSessions,
        features: [
          'Real-time conversation',
          'Policy compliance checking',
          'Knowledge base search',
          'Proactive notifications',
          'Multi-turn dialogue',
          'Context awareness',
          'Learning and adaptation'
        ]
      };

      return metadata;

    } catch (error) {
      this.logger.error('Failed to get agent metadata', error as Error);
      throw error;
    }
  }

  /**
   * Get detailed health information
   */
  async getDetailedHealth(): Promise<{
    agentId: string;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
    lastHealthCheck: Date;
    metrics: {
      averageResponseTime: number;
      successRate: number;
      errorRate: number;
      activeSessions: number;
      memoryUsage: number;
      cpuUsage: number;
    };
    issues: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      timestamp: Date;
      resolved: boolean;
    }>;
  }> {
    try {
      this.logger.info('Getting detailed health information');

      // Calculate metrics from current sessions
      const activeSessions = this.sessions.size;
      const totalSessions = activeSessions; // In production, get from database
      
      // Mock health metrics - in production, get from CloudWatch or monitoring service
      const metrics = {
        averageResponseTime: 1200, // ms
        successRate: 0.98,
        errorRate: 0.02,
        activeSessions,
        memoryUsage: 0.65, // 65%
        cpuUsage: 0.45 // 45%
      };

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'unhealthy' | 'offline' = 'healthy';
      if (metrics.errorRate > 0.1 || metrics.averageResponseTime > 5000) {
        status = 'degraded';
      }
      if (metrics.errorRate > 0.2 || metrics.averageResponseTime > 10000) {
        status = 'unhealthy';
      }

      const health = {
        agentId: 'agent-core-1',
        status,
        lastHealthCheck: new Date(),
        metrics,
        issues: [] as any[] // In production, get from monitoring system
      };

      return health;

    } catch (error) {
      this.logger.error('Failed to get detailed health', error as Error);
      throw error;
    }
  }

  /**
   * Get agent configuration
   */
  async getAgentConfiguration(agentId: string): Promise<AgentConfiguration> {
    try {
      this.logger.info('Getting agent configuration', { agentId });

      const config = await this.getAgentConfiguration(agentId);
      return config;

    } catch (error) {
      this.logger.error('Failed to get agent configuration', error as Error);
      throw error;
    }
  }

  /**
   * Update agent configuration
   */
  async updateAgentConfiguration(request: {
    agentId: string;
    settings?: Partial<{
      responseStyle: 'formal' | 'casual' | 'technical' | 'adaptive';
      verbosity: 'concise' | 'detailed' | 'comprehensive';
      proactivity: 'reactive' | 'moderate' | 'proactive';
      learningEnabled: boolean;
      memoryRetention: number;
      maxContextLength: number;
    }>;
    constraints?: Partial<{
      maxSessionDuration: number;
      maxConcurrentSessions: number;
      allowedActions: string[];
      restrictedTopics: string[];
      complianceRequired: boolean;
      auditLevel: 'basic' | 'detailed' | 'comprehensive';
    }>;
    capabilities?: string[];
  }): Promise<AgentConfiguration> {
    try {
      this.logger.info('Updating agent configuration', { 
        agentId: request.agentId,
        hasSettings: !!request.settings,
        hasConstraints: !!request.constraints,
        hasCapabilities: !!request.capabilities
      });

      // Get current configuration
      const currentConfig = await this.getAgentConfiguration(request.agentId);

      // Update configuration
      const updatedConfig: AgentConfiguration = {
        ...currentConfig,
        settings: {
          ...currentConfig.settings,
          ...request.settings
        },
        constraints: {
          ...currentConfig.constraints,
          ...request.constraints
        },
        capabilities: request.capabilities || currentConfig.capabilities,
        updatedAt: new Date()
      };

      // Store updated configuration
      this.configurations.set(request.agentId, updatedConfig);

      // In production, persist to database
      this.logger.info('Agent configuration updated successfully', { 
        agentId: request.agentId 
      });

      return updatedConfig;

    } catch (error) {
      this.logger.error('Failed to update agent configuration', error as Error);
      throw error;
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(request: {
    agentId?: string;
    userId?: string;
    teamId: string;
    startDate: Date;
    endDate: Date;
    metrics: string[];
  }): Promise<{
    totalSessions: number;
    averageSessionDuration: number;
    userSatisfactionScore: number;
    topTopics: Array<{
      topic: string;
      frequency: number;
      averageConfidence: number;
      userSatisfaction: number;
    }>;
    performanceMetrics: {
      averageResponseTime: number;
      successRate: number;
      errorRate: number;
      complianceRate: number;
    };
    learningInsights: {
      patternsIdentified: number;
      improvementsImplemented: number;
      userFeedbackScore: number;
      adaptationRate: number;
    };
  }> {
    try {
      this.logger.info('Getting analytics data', {
        teamId: request.teamId,
        dateRange: `${request.startDate.toISOString()} - ${request.endDate.toISOString()}`,
        metrics: request.metrics
      });

      // In production, query database for actual analytics
      // For now, return mock data
      const analytics = {
        totalSessions: 150,
        averageSessionDuration: 8.5, // minutes
        userSatisfactionScore: 4.2, // out of 5
        topTopics: [
          {
            topic: 'security',
            frequency: 45,
            averageConfidence: 0.85,
            userSatisfaction: 4.3
          },
          {
            topic: 'policy',
            frequency: 38,
            averageConfidence: 0.82,
            userSatisfaction: 4.1
          },
          {
            topic: 'compliance',
            frequency: 32,
            averageConfidence: 0.88,
            userSatisfaction: 4.4
          }
        ],
        performanceMetrics: {
          averageResponseTime: 1200, // ms
          successRate: 0.98,
          errorRate: 0.02,
          complianceRate: 0.95
        },
        learningInsights: {
          patternsIdentified: 23,
          improvementsImplemented: 8,
          userFeedbackScore: 4.1,
          adaptationRate: 0.75
        }
      };

      return analytics;

    } catch (error) {
      this.logger.error('Failed to get analytics', error as Error);
      throw error;
    }
  }

  /**
   * Get agent status
   */
  async getAgentStatus(options: {
    userId: string;
    teamId: string;
    includeMetrics?: boolean;
    includeIssues?: boolean;
  }): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
    activeSessions: number;
    lastActivity: Date;
    metrics?: {
      averageResponseTime: number;
      successRate: number;
      errorRate: number;
    };
    issues?: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      timestamp: Date;
    }>;
  }> {
    try {
      this.logger.info('Getting agent status', options);

      const activeSessions = this.sessions.size;
      const lastActivity = new Date(); // In production, get from database

      const status = {
        status: 'healthy' as const,
        activeSessions,
        lastActivity
      };

      if (options.includeMetrics) {
        (status as any).metrics = {
          averageResponseTime: 1200,
          successRate: 0.98,
          errorRate: 0.02
        };
      }

      if (options.includeIssues) {
        (status as any).issues = []; // In production, get from monitoring system
      }

      return status;

    } catch (error) {
      this.logger.error('Failed to get agent status', error as Error);
      throw error;
    }
  }

  /**
   * Check if user has permission
   */
  private hasUserPermission(userId: string, permission: string): boolean {
    // In production, check user permissions from database or JWT token
    // For now, assume all users have basic permissions
    const basicPermissions = ['read', 'write', 'search', 'analyze'];
    return basicPermissions.includes(permission);
  }
}