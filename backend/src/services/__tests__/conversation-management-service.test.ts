/**
 * Unit tests for ConversationManagementService
 */

import { ConversationManagementService } from '../conversation-management-service';
import {
  AgentSession,
  ConversationMessage,
  ConversationBranch,
  ConversationSummary,
  ConversationInsights
} from '../../models/agent-core';

// Mock the dependencies
const mockConversationRepository = {
  storeSession: jest.fn(),
  getSession: jest.fn(),
  updateSession: jest.fn(),
  endSession: jest.fn(),
  storeMessage: jest.fn(),
  getConversationHistory: jest.fn(),
  createBranch: jest.fn(),
  getConversationBranches: jest.fn(),
  storeSummary: jest.fn(),
  getSummaries: jest.fn(),
  searchConversations: jest.fn(),
  getConversationAnalytics: jest.fn(),
  cleanupExpiredSessions: jest.fn()
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

describe('ConversationManagementService', () => {
  let service: ConversationManagementService;

  const mockSession: AgentSession = {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    teamId: 'test-team-id',
    personaId: 'test-persona-id',
    startTime: new Date('2024-01-01T10:00:00Z'),
    lastActivity: new Date('2024-01-01T10:30:00Z'),
    context: {
      conversationId: 'test-conversation-id',
      messages: [],
      relatedArtifacts: [],
      referencedPolicies: [],
      actionItems: []
    },
    metadata: {
      sessionQuality: 1.0
    }
  };

  const mockMessage: ConversationMessage = {
    messageId: 'test-message-id',
    role: 'user',
    content: 'Hello, I need help with security policies',
    timestamp: new Date('2024-01-01T10:15:00Z'),
    metadata: {}
  };

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

    // Reset all mocks
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
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation session created successfully',
        { sessionId: result.sessionId }
      );
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

    it('should handle session creation errors', async () => {
      const error = new Error('Database error');
      mockConversationRepository.storeSession.mockRejectedValue(error);

      await expect(service.createSession(
        'test-user-id',
        'test-team-id',
        'test-persona-id'
      )).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create conversation session',
        error,
        { userId: 'test-user-id', teamId: 'test-team-id', personaId: 'test-persona-id' }
      );
    });
  });

  describe('getSession', () => {
    it('should retrieve session without history', async () => {
      mockRepository.getSession.mockResolvedValue(mockSession);

      const result = await service.getSession('test-session-id', false);

      expect(result).toEqual(mockSession);
      expect(mockRepository.getSession).toHaveBeenCalledWith('test-session-id');
      expect(mockRepository.getConversationHistory).not.toHaveBeenCalled();
    });

    it('should retrieve session with history', async () => {
      const mockHistory = {
        messages: [mockMessage],
        totalCount: 1,
        hasMore: false
      };

      mockRepository.getSession.mockResolvedValue(mockSession);
      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);

      const result = await service.getSession('test-session-id', true);

      expect(result).toEqual({
        ...mockSession,
        context: {
          ...mockSession.context,
          messages: [mockMessage]
        }
      });
      expect(mockRepository.getConversationHistory).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        limit: 1000,
        includeReferences: true
      });
    });

    it('should return null for non-existent session', async () => {
      mockRepository.getSession.mockResolvedValue(null);

      const result = await service.getSession('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add message to conversation successfully', async () => {
      mockRepository.storeMessage.mockResolvedValue();
      mockRepository.updateSession.mockResolvedValue();

      await service.addMessage('test-session-id', mockMessage);

      expect(mockRepository.storeMessage).toHaveBeenCalledWith(
        'test-session-id',
        mockMessage,
        undefined
      );
      expect(mockRepository.updateSession).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({
          lastActivity: expect.any(Date)
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message added successfully',
        { sessionId: 'test-session-id', messageId: 'test-message-id' }
      );
    });

    it('should add message to specific branch', async () => {
      mockRepository.storeMessage.mockResolvedValue();
      mockRepository.updateSession.mockResolvedValue();

      await service.addMessage('test-session-id', mockMessage, 'test-branch-id');

      expect(mockRepository.storeMessage).toHaveBeenCalledWith(
        'test-session-id',
        mockMessage,
        'test-branch-id'
      );
    });

    it('should handle message addition errors', async () => {
      const error = new Error('Storage error');
      mockRepository.storeMessage.mockRejectedValue(error);

      await expect(service.addMessage('test-session-id', mockMessage))
        .rejects.toThrow('Storage error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add message to conversation',
        error,
        { sessionId: 'test-session-id', messageId: 'test-message-id' }
      );
    });
  });

  describe('getConversationHistory', () => {
    it('should get conversation history with default options', async () => {
      const mockHistory = {
        messages: [mockMessage],
        totalCount: 1,
        hasMore: false
      };
      const mockSummaries = [{
        summaryId: 'test-summary-id',
        sessionId: 'test-session-id',
        summaryType: 'session' as const,
        summaryText: 'Test summary',
        keyTopics: ['security'],
        actionItems: [],
        insights: {} as ConversationInsights,
        createdAt: new Date()
      }];

      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);
      mockRepository.getSummaries.mockResolvedValue(mockSummaries);

      const result = await service.getConversationHistory('test-session-id');

      expect(result).toEqual({
        ...mockHistory,
        summary: mockSummaries[0]
      });
      expect(mockRepository.getConversationHistory).toHaveBeenCalledWith({
        sessionId: 'test-session-id'
      });
    });

    it('should get conversation history with custom options', async () => {
      const mockHistory = {
        messages: [mockMessage],
        totalCount: 1,
        hasMore: false
      };

      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);
      mockRepository.getSummaries.mockResolvedValue([]);

      const options = {
        limit: 10,
        offset: 5,
        branchId: 'test-branch',
        includeReferences: false,
        messageTypes: ['user' as const],
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T11:00:00Z')
      };

      const result = await service.getConversationHistory('test-session-id', options);

      expect(mockRepository.getConversationHistory).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        ...options
      });
    });
  });

  describe('createBranch', () => {
    it('should create conversation branch successfully', async () => {
      const mockBranch: ConversationBranch = {
        branchId: 'test-branch-id',
        sessionId: 'test-session-id',
        parentMessageId: 'test-parent-message-id',
        branchName: 'Alternative Discussion',
        description: 'Exploring alternative approach',
        createdAt: new Date(),
        messages: []
      };

      mockRepository.createBranch.mockResolvedValue(mockBranch);

      const result = await service.createBranch(
        'test-session-id',
        'test-parent-message-id',
        'Alternative Discussion',
        'Exploring alternative approach'
      );

      expect(result).toEqual(mockBranch);
      expect(mockRepository.createBranch).toHaveBeenCalledWith(
        'test-session-id',
        'test-parent-message-id',
        'Alternative Discussion',
        'Exploring alternative approach'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation branch created successfully',
        { sessionId: 'test-session-id', branchId: 'test-branch-id' }
      );
    });

    it('should throw error when branching is disabled', async () => {
      const serviceWithoutBranching = new ConversationManagementService(
        mockRepository,
        mockLogger,
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
          mockMessage,
          {
            messageId: 'agent-message-id',
            role: 'agent' as const,
            content: 'I can help you with security policies. Here are the key points...',
            timestamp: new Date('2024-01-01T10:16:00Z'),
            metadata: {}
          }
        ],
        totalCount: 2,
        hasMore: false
      };

      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);
      mockRepository.getSummaries.mockResolvedValue([]);
      mockRepository.storeSummary.mockResolvedValue();

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
      expect(mockRepository.storeSummary).toHaveBeenCalledWith(result);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation summary generated successfully',
        { sessionId: 'test-session-id', summaryId: result.summaryId }
      );
    });

    it('should generate summary with time range', async () => {
      const timeRange = {
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T11:00:00Z')
      };

      mockRepository.getConversationHistory.mockResolvedValue({
        messages: [mockMessage],
        totalCount: 1,
        hasMore: false
      });
      mockRepository.storeSummary.mockResolvedValue();

      const result = await service.generateSummary('test-session-id', 'topic', timeRange);

      expect(result.timeRange).toEqual(timeRange);
      expect(result.summaryType).toBe('topic');
    });
  });

  describe('buildMemoryContext', () => {
    it('should build memory context successfully', async () => {
      const mockHistory = {
        messages: [mockMessage],
        totalCount: 1,
        hasMore: false
      };
      const mockSummaries = [{
        summaryId: 'test-summary-id',
        sessionId: 'test-session-id',
        summaryType: 'session' as const,
        summaryText: 'Test summary',
        keyTopics: ['security'],
        actionItems: [],
        insights: {} as ConversationInsights,
        createdAt: new Date()
      }];

      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);
      mockRepository.getSummaries.mockResolvedValue(mockSummaries);
      mockRepository.getSession.mockResolvedValue({
        ...mockSession,
        context: {
          ...mockSession.context,
          actionItems: [{
            id: 'action-1',
            description: 'Review security policy',
            priority: 'medium' as const,
            status: 'pending' as const,
            createdAt: new Date()
          }]
        }
      });

      const result = await service.buildMemoryContext('test-session-id');

      expect(result).toEqual({
        shortTermMemory: [mockMessage],
        longTermMemory: mockSummaries,
        semanticMemory: [],
        proceduralMemory: [{
          id: 'action-1',
          description: 'Review security policy',
          priority: 'medium',
          status: 'pending',
          createdAt: expect.any(Date)
        }]
      });
    });
  });

  describe('extractConversationInsights', () => {
    it('should extract conversation insights successfully', async () => {
      const mockHistory = {
        messages: [
          mockMessage,
          {
            messageId: 'agent-message-id',
            role: 'agent' as const,
            content: 'Great question! Here are the security policies...',
            timestamp: new Date('2024-01-01T10:16:00Z'),
            metadata: {}
          }
        ],
        totalCount: 2,
        hasMore: false
      };

      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);

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

    it('should identify knowledge gaps and learning opportunities', async () => {
      const mockHistory = {
        messages: [
          {
            messageId: 'user-message-1',
            role: 'user' as const,
            content: "I don't know how to implement security policies",
            timestamp: new Date('2024-01-01T10:15:00Z'),
            metadata: {}
          },
          {
            messageId: 'user-message-2',
            role: 'user' as const,
            content: 'What about deployment procedures?',
            timestamp: new Date('2024-01-01T10:16:00Z'),
            metadata: {}
          },
          {
            messageId: 'user-message-3',
            role: 'user' as const,
            content: 'How do I test this?',
            timestamp: new Date('2024-01-01T10:17:00Z'),
            metadata: {}
          },
          {
            messageId: 'user-message-4',
            role: 'user' as const,
            content: 'What about documentation?',
            timestamp: new Date('2024-01-01T10:18:00Z'),
            metadata: {}
          },
          {
            messageId: 'user-message-5',
            role: 'user' as const,
            content: 'Any other considerations?',
            timestamp: new Date('2024-01-01T10:19:00Z'),
            metadata: {}
          },
          {
            messageId: 'user-message-6',
            role: 'user' as const,
            content: 'How about compliance?',
            timestamp: new Date('2024-01-01T10:20:00Z'),
            metadata: {}
          }
        ],
        totalCount: 6,
        hasMore: false
      };

      mockRepository.getConversationHistory.mockResolvedValue(mockHistory);

      const result = await service.extractConversationInsights('test-session-id');

      expect(result.knowledgeGaps).toContain('User expressed uncertainty');
      expect(result.learningOpportunities).toContain('User has many questions - consider creating FAQ or training material');
      expect(result.learningOpportunities).toContain('Conversation covers multiple topics - consider topic-specific guidance');
    });
  });

  describe('endSession', () => {
    it('should end session successfully', async () => {
      const mockSummary: ConversationSummary = {
        summaryId: 'test-summary-id',
        sessionId: 'test-session-id',
        summaryType: 'session',
        summaryText: 'Session completed successfully',
        keyTopics: ['security'],
        actionItems: [],
        insights: {} as ConversationInsights,
        createdAt: new Date()
      };

      mockRepository.getConversationHistory.mockResolvedValue({
        messages: [mockMessage],
        totalCount: 1,
        hasMore: false
      });
      mockRepository.storeSummary.mockResolvedValue();
      mockRepository.endSession.mockResolvedValue();

      const result = await service.endSession('test-session-id');

      expect(result).toMatchObject({
        sessionId: 'test-session-id',
        summaryType: 'session'
      });
      expect(mockRepository.endSession).toHaveBeenCalledWith('test-session-id');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation session ended successfully',
        { sessionId: 'test-session-id', summaryId: result.summaryId }
      );
    });
  });
});