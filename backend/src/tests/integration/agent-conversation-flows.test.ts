/**
 * AgentCore Integration Tests - Conversation Flows
 * Tests complete conversation workflows including multi-turn dialogues and context management
 */

import { AgentCoreService } from '../../services/agent-core-service';
import { ConversationManagementService } from '../../services/conversation-management-service';
import { PersonaRepository } from '../../repositories/persona-repository';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { ConversationRepository } from '../../repositories/conversation-repository';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { NotificationService } from '../../services/notification-service';
import { Logger } from '../../lambda/utils/logger';
import {
  StartSessionRequest,
  SendMessageRequest,
  ConversationMessage,
  AgentSession
} from '../../models/agent-core';

// Integration test setup - uses real implementations with mocked external dependencies
describe('AgentCore Integration Tests - Conversation Flows', () => {
  let agentCoreService: AgentCoreService;
  let conversationService: ConversationManagementService;
  let mockPersonaRepository: jest.Mocked<PersonaRepository>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockConversationRepository: jest.Mocked<ConversationRepository>;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let logger: Logger;

  const testPersona = {
    id: 'integration-persona',
    name: 'Integration Test Persona',
    description: 'Persona for integration testing',
    team_id: 'integration-team',
    communication_style: 'professional',
    decision_making_style: 'analytical',
    escalation_criteria: ['critical_issues'],
    custom_instructions: 'Provide detailed technical responses',
    created_at: new Date(),
    updated_at: new Date()
  };

  beforeAll(async () => {
    // Setup logger
    logger = new Logger({ correlationId: 'integration-test' });

    // Setup mocked repositories and services
    mockPersonaRepository = {
      getPersonaById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn()
    } as any;

    mockAuditRepository = {
      create: jest.fn(),
      getByRequestId: jest.fn(),
      getByUserId: jest.fn(),
      getByTeamId: jest.fn(),
      list: jest.fn()
    } as any;

    mockConversationRepository = {
      storeSession: jest.fn(),
      getSession: jest.fn(),
      updateSession: jest.fn(),
      endSession: jest.fn(),
      storeMessage: jest.fn(),
      getConversationHistory: jest.fn(),
      createBranch: jest.fn(),
      storeSummary: jest.fn(),
      getSummaries: jest.fn()
    } as any;

    mockKendraService = {
      search: jest.fn(),
      submitFeedback: jest.fn()
    } as any;

    mockRulesEngine = {
      validateContent: jest.fn(),
      validateArtifact: jest.fn(),
      getValidationRules: jest.fn()
    } as any;

    mockNotificationService = {
      sendStakeholderNotifications: jest.fn(),
      createJiraTicket: jest.fn(),
      sendSlackNotification: jest.fn()
    } as any;

    // Setup default mock responses
    mockPersonaRepository.getPersonaById.mockResolvedValue(testPersona);
    mockAuditRepository.create.mockResolvedValue();
    mockRulesEngine.validateContent.mockResolvedValue({ compliant: true, score: 1.0 });
    mockKendraService.search.mockResolvedValue({
      results: [
        {
          id: 'doc-1',
          title: 'Security Policy',
          excerpt: 'Our security policy requires multi-factor authentication',
          uri: '/policies/security.pdf',
          type: 'DOCUMENT',
          confidence: 0.9,
          sourceAttributes: { source_type: 'policy' }
        }
      ],
      totalCount: 1,
      queryId: 'query-123'
    });

    // Create real conversation service with mocked repository
    conversationService = new ConversationManagementService(
      mockConversationRepository,
      logger
    );

    // Create AgentCore service with real conversation service
    agentCoreService = new AgentCoreService(
      mockPersonaRepository,
      mockAuditRepository,
      mockKendraService,
      mockRulesEngine,
      conversationService,
      mockNotificationService,
      logger
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup conversation repository mocks for each test
    let sessionStore: Map<string, AgentSession> = new Map();
    let messageStore: Map<string, ConversationMessage[]> = new Map();

    mockConversationRepository.storeSession.mockImplementation(async (session) => {
      sessionStore.set(session.sessionId, session);
    });

    mockConversationRepository.getSession.mockImplementation(async (sessionId) => {
      return sessionStore.get(sessionId) || null;
    });

    mockConversationRepository.storeMessage.mockImplementation(async (sessionId, message) => {
      if (!messageStore.has(sessionId)) {
        messageStore.set(sessionId, []);
      }
      messageStore.get(sessionId)!.push(message);
    });

    mockConversationRepository.getConversationHistory.mockImplementation(async ({ sessionId, limit = 100 }) => {
      const messages = messageStore.get(sessionId) || [];
      return {
        messages: messages.slice(0, limit),
        totalCount: messages.length,
        hasMore: messages.length > limit
      };
    });
  });

  describe('Single-Turn Conversations', () => {
    it('should handle simple question-answer flow', async () => {
      // Start session
      const startRequest: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      };

      const session = await agentCoreService.startSession(startRequest);
      expect(session.sessionId).toBeDefined();

      // Send a simple question
      const messageRequest: SendMessageRequest = {
        sessionId: session.sessionId,
        message: 'What is our security policy?'
      };

      const response = await agentCoreService.sendMessage(messageRequest);

      expect(response.messageId).toBeDefined();
      expect(response.response).toContain('security');
      expect(response.confidence).toBeGreaterThan(0);
      expect(response.references).toHaveLength(1);
      expect(response.references[0].sourceType).toBe('policy');

      // Verify conversation history
      const history = await agentCoreService.getSessionHistory({
        sessionId: session.sessionId
      });

      expect(history.messages).toHaveLength(2); // user question + agent response
      expect(history.messages[0].role).toBe('user');
      expect(history.messages[1].role).toBe('agent');
    });

    it('should handle command-type messages', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      const commandRequest: SendMessageRequest = {
        sessionId: session.sessionId,
        message: '/help',
        messageType: 'command'
      };

      const response = await agentCoreService.sendMessage(commandRequest);

      expect(response.response).toContain('help');
      expect(response.suggestions).toBeDefined();
      expect(response.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Turn Conversations', () => {
    it('should maintain context across multiple messages', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // First message about security
      const message1: SendMessageRequest = {
        sessionId: session.sessionId,
        message: 'Tell me about our security policies'
      };

      const response1 = await agentCoreService.sendMessage(message1);
      expect(response1.response).toContain('security');

      // Follow-up question that should use context
      const message2: SendMessageRequest = {
        sessionId: session.sessionId,
        message: 'What about multi-factor authentication specifically?'
      };

      const response2 = await agentCoreService.sendMessage(message2);
      expect(response2.response).toContain('authentication');

      // Third message building on previous context
      const message3: SendMessageRequest = {
        sessionId: session.sessionId,
        message: 'How do I enable it?'
      };

      const response3 = await agentCoreService.sendMessage(message3);
      expect(response3.response).toBeDefined();

      // Verify conversation history maintains context
      const history = await agentCoreService.getSessionHistory({
        sessionId: session.sessionId
      });

      expect(history.messages).toHaveLength(6); // 3 user + 3 agent messages
      expect(history.totalCount).toBe(6);
    });

    it('should handle topic transitions smoothly', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Start with security topic
      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are our security requirements?'
      });

      // Transition to deployment topic
      const deploymentResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Now tell me about deployment procedures'
      });

      expect(deploymentResponse.response).toBeDefined();

      // Transition to testing topic
      const testingResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What about testing requirements?'
      });

      expect(testingResponse.response).toBeDefined();

      // Verify all topics are captured in history
      const history = await agentCoreService.getSessionHistory({
        sessionId: session.sessionId
      });

      const userMessages = history.messages.filter(m => m.role === 'user');
      expect(userMessages.some(m => m.content.includes('security'))).toBe(true);
      expect(userMessages.some(m => m.content.includes('deployment'))).toBe(true);
      expect(userMessages.some(m => m.content.includes('testing'))).toBe(true);
    });
  });

  describe('Conversation Branching', () => {
    it('should create and manage conversation branches', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Send initial message
      const initialResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What deployment options do we have?'
      });

      // Mock branch creation
      const mockBranch = {
        branchId: 'branch-123',
        sessionId: session.sessionId,
        parentMessageId: initialResponse.messageId,
        branchName: 'Cloud Deployment Discussion',
        description: 'Exploring cloud deployment options',
        createdAt: new Date(),
        messages: []
      };

      mockConversationRepository.createBranch.mockResolvedValue(mockBranch);

      // Create a branch to explore cloud deployment
      const branch = await agentCoreService.createConversationBranch(
        session.sessionId,
        initialResponse.messageId,
        'Cloud Deployment Discussion',
        'Exploring cloud deployment options'
      );

      expect(branch.branchId).toBe('branch-123');
      expect(branch.branchName).toBe('Cloud Deployment Discussion');
      expect(mockConversationRepository.createBranch).toHaveBeenCalledWith(
        session.sessionId,
        initialResponse.messageId,
        'Cloud Deployment Discussion',
        'Exploring cloud deployment options'
      );
    });
  });

  describe('Context-Aware Responses', () => {
    it('should provide context-aware responses based on conversation history', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Establish context about a specific project
      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'I am working on the user authentication service'
      });

      // Ask a question that should use the established context
      const contextualResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What security considerations should I keep in mind?'
      });

      expect(contextualResponse.response).toContain('authentication');
      expect(contextualResponse.confidence).toBeGreaterThan(0.5);
    });

    it('should reference previous artifacts and policies mentioned', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Mention specific artifacts
      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'I need to review the API documentation and security policy'
      });

      // Ask for related information
      const relatedResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Are there any updates to these documents?'
      });

      expect(relatedResponse.response).toBeDefined();
      expect(relatedResponse.references.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery in Conversations', () => {
    it('should recover gracefully from service errors', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Simulate Kendra service failure
      mockKendraService.search.mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are our policies?'
      });

      // Should still provide a response even without search results
      expect(response.response).toBeDefined();
      expect(response.references).toEqual([]);

      // Next message should work normally
      mockKendraService.search.mockResolvedValueOnce({
        results: [],
        totalCount: 0,
        queryId: 'query-456'
      });

      const nextResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Tell me about deployment'
      });

      expect(nextResponse.response).toBeDefined();
    });

    it('should handle compliance violations gracefully', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Send a compliant message first
      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are our coding standards?'
      });

      // Simulate compliance violation
      mockRulesEngine.validateContent.mockResolvedValueOnce({
        compliant: false,
        score: 0.2,
        violation: 'Message contains inappropriate content'
      });

      await expect(agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'This message violates policy'
      })).rejects.toThrow();

      // Reset compliance check
      mockRulesEngine.validateContent.mockResolvedValue({
        compliant: true,
        score: 1.0
      });

      // Next message should work normally
      const recoveryResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Let me rephrase that question'
      });

      expect(recoveryResponse.response).toBeDefined();
    });
  });

  describe('Session Lifecycle Management', () => {
    it('should handle complete session lifecycle', async () => {
      // Start session
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      expect(session.sessionId).toBeDefined();
      expect(session.agentConfiguration).toBeDefined();

      // Have a conversation
      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Hello, I need help with deployment'
      });

      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are the steps involved?'
      });

      // Check history before ending
      const historyBeforeEnd = await agentCoreService.getSessionHistory({
        sessionId: session.sessionId
      });

      expect(historyBeforeEnd.messages.length).toBeGreaterThan(0);

      // Mock session end
      mockConversationRepository.endSession.mockResolvedValue();

      // End session
      await agentCoreService.endSession(session.sessionId);

      expect(mockConversationRepository.endSession).toHaveBeenCalledWith(session.sessionId);
    });

    it('should handle session timeout gracefully', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Simulate session timeout by manipulating internal state
      const internalSessions = (agentCoreService as any).sessions;
      const sessionData = internalSessions.get(session.sessionId);
      sessionData.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      // Attempt to send message to expired session
      await expect(agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'This should fail due to timeout'
      })).rejects.toThrow('Session expired');
    });
  });

  describe('Conversation Analytics and Insights', () => {
    it('should generate conversation insights', async () => {
      const session = await agentCoreService.startSession({
        userId: 'test-user',
        teamId: 'integration-team',
        personaId: 'integration-persona'
      });

      // Have a multi-topic conversation
      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Tell me about security policies'
      });

      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What about deployment procedures?'
      });

      await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'I am not sure about the testing requirements'
      });

      // Mock insights extraction
      const mockInsights = {
        totalMessages: 6,
        userEngagement: 0.8,
        topicProgression: ['security', 'deployment', 'testing'],
        sentimentTrend: ['neutral', 'positive', 'uncertain'],
        knowledgeGaps: ['testing requirements'],
        recommendedActions: ['Review testing documentation'],
        learningOpportunities: ['Create testing FAQ']
      };

      mockConversationRepository.getSummaries = jest.fn().mockResolvedValue([]);
      
      // Mock the conversation service method
      jest.spyOn(conversationService, 'extractConversationInsights')
        .mockResolvedValue(mockInsights);

      const insights = await agentCoreService.getConversationInsights(session.sessionId);

      expect(insights.totalMessages).toBe(6);
      expect(insights.topicProgression).toContain('security');
      expect(insights.topicProgression).toContain('deployment');
      expect(insights.topicProgression).toContain('testing');
      expect(insights.knowledgeGaps).toContain('testing requirements');
    });
  });

  afterEach(async () => {
    // Clean up any active sessions
    const internalSessions = (agentCoreService as any).sessions;
    internalSessions.clear();
  });
});