/**
 * Simple unit tests for ConversationManagementService
 */

import { ConversationManagementService } from '../conversation-management-service';

// Mock the dependencies
const mockConversationRepository = {
  storeSession: jest.fn(),
  getSession: jest.fn(),
  updateSession: jest.fn(),
  endSession: jest.fn(),
  storeMessage: jest.fn(),
  getConversationHistory: jest.fn(),
  createBranch: jest.fn(),
  storeSummary: jest.fn(),
  getSummaries: jest.fn()
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

describe('ConversationManagementService', () => {
  let service: ConversationManagementService;

  beforeEach(() => {
    service = new ConversationManagementService(
      mockConversationRepository as any,
      mockLogger as any,
      {
        maxContextLength: 1000,
        memoryRetentionDays: 30,
        summaryThreshold: 5,
        branchingEnabled: true,
        insightsEnabled: true
      }
    );

    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new conversation session successfully', async () => {
      mockConversationRepository.storeSession.mockResolvedValue();

      const result = await service.createSession(
        'test-user-id',
        'test-team-id',
        'test-persona-id'
      );

      expect(result).toMatchObject({
        userId: 'test-user-id',
        teamId: 'test-team-id',
        personaId: 'test-persona-id'
      });
      expect(result.sessionId).toBeDefined();
      expect(result.context.conversationId).toBeDefined();
      expect(mockConversationRepository.storeSession).toHaveBeenCalledWith(result);
    });

    it('should create session with initial context', async () => {
      mockConversationRepository.storeSession.mockResolvedValue();

      const initialContext = {
        currentTopic: 'security',
        relatedArtifacts: ['artifact-1']
      };

      const result = await service.createSession(
        'test-user-id',
        'test-team-id',
        'test-persona-id',
        initialContext
      );

      expect(result.context.currentTopic).toBe('security');
      expect(result.context.relatedArtifacts).toEqual(['artifact-1']);
    });
  });

  describe('getSession', () => {
    it('should retrieve session without history', async () => {
      const mockSession = {
        sessionId: 'test-session-id',
        userId: 'test-user-id',
        teamId: 'test-team-id',
        personaId: 'test-persona-id',
        startTime: new Date(),
        lastActivity: new Date(),
        context: {
          conversationId: 'test-conversation-id',
          messages: [],
          relatedArtifacts: [],
          referencedPolicies: [],
          actionItems: []
        },
        metadata: { sessionQuality: 1.0 }
      };

      mockConversationRepository.getSession.mockResolvedValue(mockSession);

      const result = await service.getSession('test-session-id', false);

      expect(result).toEqual(mockSession);
      expect(mockConversationRepository.getSession).toHaveBeenCalledWith('test-session-id');
      expect(mockConversationRepository.getConversationHistory).not.toHaveBeenCalled();
    });

    it('should return null for non-existent session', async () => {
      mockConversationRepository.getSession.mockResolvedValue(null);

      const result = await service.getSession('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add message to conversation successfully', async () => {
      const mockMessage = {
        messageId: 'test-message-id',
        role: 'user' as const,
        content: 'Hello, I need help with security policies',
        timestamp: new Date(),
        metadata: {}
      };

      mockConversationRepository.storeMessage.mockResolvedValue();
      mockConversationRepository.updateSession.mockResolvedValue();

      await service.addMessage('test-session-id', mockMessage);

      expect(mockConversationRepository.storeMessage).toHaveBeenCalledWith(
        'test-session-id',
        mockMessage,
        undefined
      );
      expect(mockConversationRepository.updateSession).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({
          lastActivity: expect.any(Date)
        })
      );
    });
  });

  describe('createBranch', () => {
    it('should create conversation branch successfully', async () => {
      const mockBranch = {
        branchId: 'test-branch-id',
        sessionId: 'test-session-id',
        parentMessageId: 'test-parent-message-id',
        branchName: 'Alternative Discussion',
        description: 'Exploring alternative approach',
        createdAt: new Date(),
        messages: []
      };

      mockConversationRepository.createBranch.mockResolvedValue(mockBranch);

      const result = await service.createBranch(
        'test-session-id',
        'test-parent-message-id',
        'Alternative Discussion',
        'Exploring alternative approach'
      );

      expect(result).toEqual(mockBranch);
      expect(mockConversationRepository.createBranch).toHaveBeenCalledWith(
        'test-session-id',
        'test-parent-message-id',
        'Alternative Discussion',
        'Exploring alternative approach'
      );
    });

    it('should throw error when branching is disabled', async () => {
      const serviceWithoutBranching = new ConversationManagementService(
        mockConversationRepository as any,
        mockLogger as any,
        { branchingEnabled: false }
      );

      await expect(serviceWithoutBranching.createBranch(
        'test-session-id',
        'test-parent-message-id',
        'Test Branch'
      )).rejects.toThrow('Conversation branching is disabled');
    });
  });

  describe('generateSummary', () => {
    it('should generate conversation summary successfully', async () => {
      const mockHistory = {
        messages: [
          {
            messageId: 'user-message-id',
            role: 'user' as const,
            content: 'Hello, I need help with security policies',
            timestamp: new Date(),
            metadata: {}
          },
          {
            messageId: 'agent-message-id',
            role: 'agent' as const,
            content: 'I can help you with security policies. Here are the key points...',
            timestamp: new Date(),
            metadata: {}
          }
        ],
        totalCount: 2,
        hasMore: false
      };

      mockConversationRepository.getConversationHistory.mockResolvedValue(mockHistory);
      mockConversationRepository.getSummaries.mockResolvedValue([]);
      mockConversationRepository.storeSummary.mockResolvedValue();

      const result = await service.generateSummary('test-session-id', 'periodic');

      expect(result).toMatchObject({
        sessionId: 'test-session-id',
        summaryType: 'periodic',
        keyTopics: ['security'],
        insights: expect.objectContaining({
          totalMessages: 2,
          userEngagement: expect.any(Number),
          topicProgression: expect.any(Array),
          sentimentTrend: expect.any(Array),
          knowledgeGaps: expect.any(Array),
          recommendedActions: expect.any(Array),
          learningOpportunities: expect.any(Array)
        })
      });
      expect(mockConversationRepository.storeSummary).toHaveBeenCalledWith(result);
    });
  });

  describe('extractConversationInsights', () => {
    it('should extract conversation insights successfully', async () => {
      const mockHistory = {
        messages: [
          {
            messageId: 'user-message-id',
            role: 'user' as const,
            content: 'Hello, I need help with security policies',
            timestamp: new Date(),
            metadata: {}
          },
          {
            messageId: 'agent-message-id',
            role: 'agent' as const,
            content: 'Great question! Here are the security policies...',
            timestamp: new Date(),
            metadata: {}
          }
        ],
        totalCount: 2,
        hasMore: false
      };

      mockConversationRepository.getConversationHistory.mockResolvedValue(mockHistory);

      const result = await service.extractConversationInsights('test-session-id');

      expect(result).toEqual({
        totalMessages: 2,
        userEngagement: expect.any(Number),
        topicProgression: ['security'],
        sentimentTrend: ['positive'],
        knowledgeGaps: [],
        recommendedActions: ['Review security policies and compliance requirements'],
        learningOpportunities: []
      });
    });
  });
});