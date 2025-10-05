/**
 * Comprehensive AgentCore Service Tests
 * Complete test suite covering all AgentCore functionality including edge cases and error scenarios
 */

import { AgentCoreService } from '../agent-core-service';
import { ConversationManagementService } from '../conversation-management-service';
import { PersonaRepository } from '../../repositories/persona-repository';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { KendraSearchService } from '../kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { NotificationService } from '../notification-service';
import { Logger } from '../../lambda/utils/logger';
import {
  StartSessionRequest,
  SendMessageRequest,
  GetSessionHistoryRequest,
  AgentSession,
  ConversationMessage,
  SessionNotFoundError,
  InvalidPersonaError,
  SessionExpiredError,
  ComplianceViolationError,
  AgentCoreError
} from '../../models/agent-core';

// Mock all dependencies
jest.mock('../conversation-management-service');
jest.mock('../../repositories/persona-repository');
jest.mock('../../repositories/audit-log-repository');
jest.mock('../kendra-search-service');
jest.mock('../../rules-engine/rules-engine-service');
jest.mock('../notification-service');
jest.mock('../../lambda/utils/logger');

describe('AgentCoreService - Comprehensive Tests', () => {
  let service: AgentCoreService;
  let mockConversationService: jest.Mocked<ConversationManagementService>;
  let mockPersonaRepository: jest.Mocked<PersonaRepository>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockLogger: jest.Mocked<Logger>;

  const mockPersona = {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona for comprehensive tests',
    team_id: 'test-team',
    communication_style: 'professional',
    decision_making_style: 'collaborative',
    escalation_criteria: ['critical_issues', 'policy_violations'],
    custom_instructions: 'Always be helpful and accurate',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
  };

  const mockSession: AgentSession = {
    sessionId: 'test-session-123',
    userId: 'test-user',
    teamId: 'test-team',
    personaId: 'test-persona',
    startTime: new Date(),
    lastActivity: new Date(),
    context: {
      conversationId: 'conv-123',
      messages: [],
      relatedArtifacts: [],
      referencedPolicies: [],
      actionItems: []
    },
    metadata: {
      sessionQuality: 1.0
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockConversationService = new ConversationManagementService({} as any, {} as any) as jest.Mocked<ConversationManagementService>;
    mockPersonaRepository = new PersonaRepository({} as any) as jest.Mocked<PersonaRepository>;
    mockAuditRepository = new AuditLogRepository({} as any) as jest.Mocked<AuditLogRepository>;
    mockKendraService = new KendraSearchService() as jest.Mocked<KendraSearchService>;
    mockRulesEngine = RulesEngineService.getInstance() as jest.Mocked<RulesEngineService>;
    mockNotificationService = new NotificationService() as jest.Mocked<NotificationService>;
    mockLogger = new Logger({} as any) as jest.Mocked<Logger>;

    // Setup default mock implementations
    mockPersonaRepository.getPersonaById.mockResolvedValue(mockPersona);
    mockAuditRepository.create.mockResolvedValue();
    mockConversationService.createSession.mockResolvedValue(mockSession);
    mockConversationService.addMessage.mockResolvedValue();
    mockConversationService.getConversationHistory.mockResolvedValue({
      messages: [],
      totalCount: 0,
      hasMore: false
    });
    mockConversationService.endSession.mockResolvedValue({
      summaryId: 'summary-123',
      sessionId: 'test-session-123',
      summaryType: 'session',
      summaryText: 'Session completed successfully',
      keyTopics: [],
      actionItems: [],
      insights: {
        totalMessages: 0,
        userEngagement: 0,
        topicProgression: [],
        sentimentTrend: [],
        knowledgeGaps: [],
        recommendedActions: [],
        learningOpportunities: []
      },
      createdAt: new Date()
    });

    mockKendraService.search.mockResolvedValue({
      results: [],
      totalCount: 0,
      queryId: 'query-123'
    });

    mockRulesEngine.validateContent.mockResolvedValue({
      compliant: true,
      score: 1.0
    });

    // Create service instance
    service = new AgentCoreService(
      mockPersonaRepository,
      mockAuditRepository,
      mockKendraService,
      mockRulesEngine,
      mockConversationService,
      mockNotificationService,
      mockLogger
    );
  });

  describe('Session Management', () => {
    describe('startSession', () => {
      it('should start session with all required parameters', async () => {
        const request: StartSessionRequest = {
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'test-persona'
        };

        const response = await service.startSession(request);

        expect(response).toHaveProperty('sessionId');
        expect(response).toHaveProperty('agentConfiguration');
        expect(response).toHaveProperty('capabilities');
        expect(response.agentConfiguration.personaId).toBe('test-persona');
        expect(mockConversationService.createSession).toHaveBeenCalledWith(
          'test-user',
          'test-team',
          'test-persona',
          undefined
        );
        expect(mockAuditRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'agent_session_started',
            user_id: 'test-user'
          })
        );
      });

      it('should start session with initial context', async () => {
        const request: StartSessionRequest = {
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'test-persona',
          context: {
            conversationId: 'existing-conv',
            messages: [],
            relatedArtifacts: ['artifact-1'],
            referencedPolicies: ['policy-1'],
            actionItems: []
          }
        };

        await service.startSession(request);

        expect(mockConversationService.createSession).toHaveBeenCalledWith(
          'test-user',
          'test-team',
          'test-persona',
          request.context
        );
      });

      it('should generate welcome message with initial message', async () => {
        const request: StartSessionRequest = {
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'test-persona',
          initialMessage: 'Hello, I need help'
        };

        const response = await service.startSession(request);

        expect(response.welcomeMessage).toBeDefined();
        expect(response.welcomeMessage).toContain('help');
      });

      it('should use default persona when not specified', async () => {
        mockPersonaRepository.getPersonaById.mockResolvedValueOnce(null);
        mockPersonaRepository.getPersonaById.mockResolvedValueOnce(mockPersona);

        const request: StartSessionRequest = {
          userId: 'test-user',
          teamId: 'test-team'
        };

        await service.startSession(request);

        expect(mockPersonaRepository.getPersonaById).toHaveBeenCalledTimes(2);
      });

      it('should throw InvalidPersonaError for non-existent persona', async () => {
        mockPersonaRepository.getPersonaById.mockResolvedValue(null);

        const request: StartSessionRequest = {
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'invalid-persona'
        };

        await expect(service.startSession(request)).rejects.toThrow(InvalidPersonaError);
      });

      it('should handle conversation service errors', async () => {
        mockConversationService.createSession.mockRejectedValue(new Error('Database error'));

        const request: StartSessionRequest = {
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'test-persona'
        };

        await expect(service.startSession(request)).rejects.toThrow('Database error');
      });
    });

    describe('endSession', () => {
      let sessionId: string;

      beforeEach(async () => {
        const startResponse = await service.startSession({
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'test-persona'
        });
        sessionId = startResponse.sessionId;
      });

      it('should end session successfully', async () => {
        await service.endSession(sessionId);

        expect(mockConversationService.endSession).toHaveBeenCalledWith(sessionId);
        expect(mockAuditRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'agent_session_ended',
            session_id: sessionId
          })
        );
      });

      it('should throw SessionNotFoundError for invalid session', async () => {
        await expect(service.endSession('invalid-session')).rejects.toThrow(SessionNotFoundError);
      });

      it('should handle conversation service errors during end session', async () => {
        mockConversationService.endSession.mockRejectedValue(new Error('Service error'));

        await expect(service.endSession(sessionId)).rejects.toThrow('Service error');
      });
    });
  });

  describe('Message Processing', () => {
    let sessionId: string;

    beforeEach(async () => {
      const startResponse = await service.startSession({
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      });
      sessionId = startResponse.sessionId;
    });

    describe('sendMessage', () => {
      it('should process message successfully', async () => {
        const request: SendMessageRequest = {
          sessionId,
          message: 'What are the security policies?',
          messageType: 'text'
        };

        const response = await service.sendMessage(request);

        expect(response).toHaveProperty('messageId');
        expect(response).toHaveProperty('response');
        expect(response).toHaveProperty('confidence');
        expect(response).toHaveProperty('processingTime');
        expect(response.response).toBeTruthy();
        expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2); // user + agent message
        expect(mockKendraService.search).toHaveBeenCalled();
        expect(mockRulesEngine.validateContent).toHaveBeenCalled();
      });

      it('should handle different message types', async () => {
        const requests = [
          { sessionId, message: 'Text message', messageType: 'text' as const },
          { sessionId, message: '/help', messageType: 'command' as const },
          { sessionId, message: 'file:document.pdf', messageType: 'file_upload' as const }
        ];

        for (const request of requests) {
          const response = await service.sendMessage(request);
          expect(response).toHaveProperty('response');
        }
      });

      it('should throw ComplianceViolationError for non-compliant content', async () => {
        mockRulesEngine.validateContent.mockResolvedValue({
          compliant: false,
          score: 0.3,
          violation: 'Content contains prohibited terms'
        });

        const request: SendMessageRequest = {
          sessionId,
          message: 'This contains prohibited content'
        };

        await expect(service.sendMessage(request)).rejects.toThrow(ComplianceViolationError);
      });

      it('should handle PII detection', async () => {
        const request: SendMessageRequest = {
          sessionId,
          message: 'My SSN is 123-45-6789'
        };

        await expect(service.sendMessage(request)).rejects.toThrow(ComplianceViolationError);
      });

      it('should handle Kendra service failures gracefully', async () => {
        mockKendraService.search.mockRejectedValue(new Error('Kendra unavailable'));

        const request: SendMessageRequest = {
          sessionId,
          message: 'Test message'
        };

        const response = await service.sendMessage(request);
        expect(response).toHaveProperty('response');
        expect(response.references).toEqual([]);
      });

      it('should throw SessionNotFoundError for invalid session', async () => {
        const request: SendMessageRequest = {
          sessionId: 'invalid-session',
          message: 'Test message'
        };

        await expect(service.sendMessage(request)).rejects.toThrow(SessionNotFoundError);
      });

      it('should handle expired sessions', async () => {
        // Mock expired session by manipulating the session's lastActivity
        const expiredSession = {
          ...mockSession,
          lastActivity: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
        };
        
        // Start a new session to get a valid sessionId, then simulate expiration
        const startResponse = await service.startSession({
          userId: 'test-user',
          teamId: 'test-team',
          personaId: 'test-persona'
        });
        
        // Manually set the session to expired state
        (service as any).sessions.set(startResponse.sessionId, expiredSession);

        const request: SendMessageRequest = {
          sessionId: startResponse.sessionId,
          message: 'Test message'
        };

        await expect(service.sendMessage(request)).rejects.toThrow(SessionExpiredError);
      });
    });

    describe('getSessionHistory', () => {
      beforeEach(async () => {
        // Send some messages to create history
        await service.sendMessage({
          sessionId,
          message: 'First message'
        });
        await service.sendMessage({
          sessionId,
          message: 'Second message'
        });
      });

      it('should retrieve session history with default parameters', async () => {
        mockConversationService.getConversationHistory.mockResolvedValue({
          messages: [
            {
              messageId: 'msg-1',
              role: 'user',
              content: 'First message',
              timestamp: new Date(),
              metadata: {}
            },
            {
              messageId: 'msg-2',
              role: 'agent',
              content: 'Response to first message',
              timestamp: new Date(),
              metadata: {}
            }
          ],
          totalCount: 2,
          hasMore: false
        });

        const request: GetSessionHistoryRequest = {
          sessionId
        };

        const response = await service.getSessionHistory(request);

        expect(response).toHaveProperty('messages');
        expect(response).toHaveProperty('totalCount');
        expect(response).toHaveProperty('hasMore');
        expect(response.messages.length).toBe(2);
        expect(response.totalCount).toBe(2);
      });

      it('should handle pagination parameters', async () => {
        const request: GetSessionHistoryRequest = {
          sessionId,
          limit: 10,
          offset: 5,
          includeReferences: true
        };

        await service.getSessionHistory(request);

        expect(mockConversationService.getConversationHistory).toHaveBeenCalledWith(
          sessionId,
          {
            limit: 10,
            offset: 5,
            includeReferences: true
          }
        );
      });

      it('should throw SessionNotFoundError for invalid session', async () => {
        const request: GetSessionHistoryRequest = {
          sessionId: 'invalid-session'
        };

        await expect(service.getSessionHistory(request)).rejects.toThrow(SessionNotFoundError);
      });
    });
  });

  describe('Advanced Features', () => {
    let sessionId: string;

    beforeEach(async () => {
      const startResponse = await service.startSession({
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      });
      sessionId = startResponse.sessionId;
    });

    describe('Conversation Branching', () => {
      it('should create conversation branch successfully', async () => {
        const mockBranch = {
          branchId: 'branch-123',
          sessionId,
          parentMessageId: 'msg-123',
          branchName: 'Alternative Discussion',
          description: 'Exploring alternative approach',
          createdAt: new Date(),
          messages: []
        };

        mockConversationService.createBranch.mockResolvedValue(mockBranch);

        const branch = await service.createConversationBranch(
          sessionId,
          'msg-123',
          'Alternative Discussion',
          'Exploring alternative approach'
        );

        expect(branch).toEqual(mockBranch);
        expect(mockConversationService.createBranch).toHaveBeenCalledWith(
          sessionId,
          'msg-123',
          'Alternative Discussion',
          'Exploring alternative approach'
        );
        expect(mockAuditRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'conversation_branch_created'
          })
        );
      });
    });

    describe('Conversation Summarization', () => {
      it('should generate conversation summary', async () => {
        const mockSummary = {
          summaryId: 'summary-123',
          sessionId,
          summaryType: 'periodic' as const,
          summaryText: 'Discussion about security policies',
          keyTopics: ['security', 'policies'],
          actionItems: [],
          insights: {
            totalMessages: 5,
            userEngagement: 0.8,
            topicProgression: ['security', 'compliance'],
            sentimentTrend: ['positive'],
            knowledgeGaps: [],
            recommendedActions: [],
            learningOpportunities: []
          },
          createdAt: new Date()
        };

        mockConversationService.generateSummary.mockResolvedValue(mockSummary);

        const summary = await service.generateConversationSummary(sessionId, 'periodic');

        expect(summary).toEqual(mockSummary);
        expect(mockConversationService.generateSummary).toHaveBeenCalledWith(sessionId, 'periodic');
        expect(mockAuditRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'conversation_summary_generated'
          })
        );
      });
    });

    describe('Proactive Notifications', () => {
      it('should send proactive notification successfully', async () => {
        await service.sendProactiveNotification(
          sessionId,
          'policy_update',
          'New security policy has been published',
          'high'
        );

        expect(mockNotificationService.sendStakeholderNotifications).toHaveBeenCalled();
        expect(mockAuditRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'proactive_notification_sent'
          })
        );
      });

      it('should analyze conversation for proactive opportunities', async () => {
        const mockInsights = {
          knowledgeGaps: ['security policies'],
          topicProgression: ['security', 'compliance'],
          userEngagement: 0.7,
          learningOpportunities: ['Create FAQ for security questions']
        };

        mockConversationService.extractConversationInsights.mockResolvedValue(mockInsights);

        const analysis = await service.analyzeForProactiveActions(sessionId);

        expect(analysis.recommendations.length).toBeGreaterThan(0);
        expect(analysis.notifications.length).toBeGreaterThan(0);
      });
    });

    describe('Memory Integration', () => {
      it('should build memory context successfully', async () => {
        const mockMemoryContext = {
          shortTermMemory: [],
          longTermMemory: [],
          semanticMemory: [],
          proceduralMemory: []
        };

        mockConversationService.buildMemoryContext.mockResolvedValue(mockMemoryContext);

        const memoryContext = await service.buildMemoryContext(sessionId);

        expect(memoryContext).toEqual(mockMemoryContext);
        expect(mockConversationService.buildMemoryContext).toHaveBeenCalledWith(sessionId);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle multiple concurrent session starts', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        userId: `user-${i}`,
        teamId: 'test-team',
        personaId: 'test-persona'
      }));

      const promises = requests.map(req => service.startSession(req));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response).toHaveProperty('sessionId');
      });
    });

    it('should handle repository failures gracefully', async () => {
      mockPersonaRepository.getPersonaById.mockRejectedValue(new Error('Database connection failed'));

      const request: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };

      await expect(service.startSession(request)).rejects.toThrow('Database connection failed');
    });

    it('should handle audit logging failures gracefully', async () => {
      mockAuditRepository.create.mockRejectedValue(new Error('Audit service unavailable'));

      const request: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };

      // Should still succeed even if audit logging fails
      const response = await service.startSession(request);
      expect(response).toHaveProperty('sessionId');
    });

    it('should handle malformed messages', async () => {
      const sessionId = (await service.startSession({
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      })).sessionId;

      const malformedRequests = [
        { sessionId, message: '' }, // Empty message
        { sessionId, message: null as any }, // Null message
        { sessionId, message: undefined as any }, // Undefined message
        { sessionId, message: 'a'.repeat(10000) } // Very long message
      ];

      for (const request of malformedRequests) {
        try {
          await service.sendMessage(request);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle service timeouts', async () => {
      jest.setTimeout(10000);
      
      mockKendraService.search.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      );

      const sessionId = (await service.startSession({
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      })).sessionId;

      const request: SendMessageRequest = {
        sessionId,
        message: 'Test timeout'
      };

      // Should handle timeout gracefully
      const response = await service.sendMessage(request);
      expect(response).toHaveProperty('response');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should clean up expired sessions', async () => {
      // Create multiple sessions
      const sessions = await Promise.all([
        service.startSession({ userId: 'user1', teamId: 'test-team', personaId: 'test-persona' }),
        service.startSession({ userId: 'user2', teamId: 'test-team', personaId: 'test-persona' }),
        service.startSession({ userId: 'user3', teamId: 'test-team', personaId: 'test-persona' })
      ]);

      // Verify sessions are created
      expect(sessions).toHaveLength(3);

      // Simulate session expiration by manipulating internal state
      const internalSessions = (service as any).sessions;
      expect(internalSessions.size).toBe(3);

      // Try to access expired session
      const expiredSessionId = sessions[0].sessionId;
      const expiredSession = internalSessions.get(expiredSessionId);
      expiredSession.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      await expect(service.sendMessage({
        sessionId: expiredSessionId,
        message: 'Test'
      })).rejects.toThrow(SessionExpiredError);

      // Verify expired session is cleaned up
      expect(internalSessions.has(expiredSessionId)).toBe(false);
    });

    it('should handle memory pressure gracefully', async () => {
      // Create many sessions to simulate memory pressure
      const sessionPromises = Array.from({ length: 100 }, (_, i) =>
        service.startSession({
          userId: `user-${i}`,
          teamId: 'test-team',
          personaId: 'test-persona'
        })
      );

      const sessions = await Promise.all(sessionPromises);
      expect(sessions).toHaveLength(100);

      // All sessions should be functional
      const messagePromises = sessions.slice(0, 10).map(session =>
        service.sendMessage({
          sessionId: session.sessionId,
          message: 'Test message'
        })
      );

      const responses = await Promise.all(messagePromises);
      expect(responses).toHaveLength(10);
    });
  });
});