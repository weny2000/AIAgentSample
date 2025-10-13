/**
 * AgentCore Service Tests
 */

import { AgentCoreService } from '../agent-core-service';
import { PersonaRepository } from '../../repositories/persona-repository';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { KendraSearchService } from '../kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { Logger } from '../../lambda/utils/logger';
import {
  StartSessionRequest,
  SendMessageRequest,
  SessionNotFoundError,
  InvalidPersonaError
} from '../../models/agent-core';

// Mock dependencies
jest.mock('../../repositories/persona-repository');
jest.mock('../../repositories/audit-log-repository');
jest.mock('../kendra-search-service');
jest.mock('../../rules-engine/rules-engine-service');
jest.mock('../../lambda/utils/logger');

describe('AgentCoreService', () => {
  let service: AgentCoreService;
  let mockPersonaRepository: jest.Mocked<PersonaRepository>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockPersonaRepository = new PersonaRepository() as jest.Mocked<PersonaRepository>;
    mockAuditRepository = new AuditLogRepository() as jest.Mocked<AuditLogRepository>;
    mockKendraService = new KendraSearchService() as jest.Mocked<KendraSearchService>;
    mockRulesEngine = RulesEngineService.getInstance() as jest.Mocked<RulesEngineService>;
    mockLogger = new Logger() as jest.Mocked<Logger>;

    // Setup default mock implementations
    mockPersonaRepository.getPersona.mockResolvedValue({
      id: 'test-persona',
      name: 'Test Persona',
      description: 'Test persona for unit tests',
      team_id: 'test-team',
      communication_style: 'professional',
      decision_making_style: 'collaborative',
      escalation_criteria: [],
      custom_instructions: '',
      created_at: new Date(),
      updated_at: new Date()
    });

    mockAuditRepository.logAction.mockResolvedValue();

    mockKendraService.search.mockResolvedValue({
      results: [
        {
          id: 'test-result-1',
          title: 'Test Document',
          excerpt: 'This is a test document excerpt',
          uri: '/test/document.pdf',
          type: 'DOCUMENT',
          confidence: 0.9,
          sourceAttributes: { source_type: 'policy' }
        }
      ],
      totalCount: 1,
      queryId: 'test-query-id'
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
      mockLogger
    );
  });

  describe('startSession', () => {
    it('should start a new session successfully', async () => {
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
      expect(mockPersonaRepository.getPersona).toHaveBeenCalledWith('test-persona');
      expect(mockAuditRepository.logAction).toHaveBeenCalled();
    });

    it('should throw error for invalid persona', async () => {
      mockPersonaRepository.getPersona.mockResolvedValue(null);

      const request: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'invalid-persona'
      };

      await expect(service.startSession(request)).rejects.toThrow(InvalidPersonaError);
    });

    it('should generate welcome message when initial message provided', async () => {
      const request: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona',
        initialMessage: 'Hello'
      };

      const response = await service.startSession(request);

      expect(response.welcomeMessage).toBeDefined();
      expect(response.welcomeMessage).toContain('help');
    });
  });

  describe('sendMessage', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Start a session first
      const startRequest: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };
      const startResponse = await service.startSession(startRequest);
      sessionId = startResponse.sessionId;
    });

    it('should process message successfully', async () => {
      const request: SendMessageRequest = {
        sessionId,
        message: 'What are the security policies?'
      };

      const response = await service.sendMessage(request);

      expect(response).toHaveProperty('messageId');
      expect(response).toHaveProperty('response');
      expect(response).toHaveProperty('confidence');
      expect(response).toHaveProperty('processingTime');
      expect(response.response).toBeTruthy();
      expect(mockKendraService.search).toHaveBeenCalled();
      expect(mockRulesEngine.validateContent).toHaveBeenCalled();
    });

    it('should throw error for invalid session', async () => {
      const request: SendMessageRequest = {
        sessionId: 'invalid-session',
        message: 'Test message'
      };

      await expect(service.sendMessage(request)).rejects.toThrow(SessionNotFoundError);
    });

    it('should handle compliance violations', async () => {
      mockRulesEngine.validateContent.mockResolvedValue({
        compliant: false,
        score: 0.5,
        violation: 'Content contains prohibited terms'
      });

      const request: SendMessageRequest = {
        sessionId,
        message: 'This message contains prohibited content'
      };

      await expect(service.sendMessage(request)).rejects.toThrow();
    });
  });

  describe('getSessionHistory', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Start a session and send a message
      const startRequest: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };
      const startResponse = await service.startSession(startRequest);
      sessionId = startResponse.sessionId;

      // Send a message to create history
      await service.sendMessage({
        sessionId,
        message: 'Test message'
      });
    });

    it('should retrieve session history', async () => {
      const response = await service.getSessionHistory({
        sessionId,
        limit: 10,
        includeReferences: true
      });

      expect(response).toHaveProperty('messages');
      expect(response).toHaveProperty('totalCount');
      expect(response).toHaveProperty('hasMore');
      expect(response.messages.length).toBeGreaterThan(0);
    });

    it('should handle pagination', async () => {
      const response = await service.getSessionHistory({
        sessionId,
        limit: 1,
        offset: 0
      });

      expect(response.messages.length).toBeLessThanOrEqual(1);
      expect(response.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('endSession', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Start a session
      const startRequest: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };
      const startResponse = await service.startSession(startRequest);
      sessionId = startResponse.sessionId;
    });

    it('should end session successfully', async () => {
      await expect(service.endSession(sessionId)).resolves.not.toThrow();
      expect(mockAuditRepository.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'agent_session_ended'
        })
      );
    });

    it('should throw error for invalid session', async () => {
      await expect(service.endSession('invalid-session')).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('error handling', () => {
    it('should handle persona repository errors gracefully', async () => {
      mockPersonaRepository.getPersona.mockRejectedValue(new Error('Database error'));

      const request: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };

      await expect(service.startSession(request)).rejects.toThrow('Database error');
    });

    it('should handle Kendra service errors gracefully', async () => {
      mockKendraService.search.mockRejectedValue(new Error('Kendra error'));

      const startRequest: StartSessionRequest = {
        userId: 'test-user',
        teamId: 'test-team',
        personaId: 'test-persona'
      };
      const startResponse = await service.startSession(startRequest);

      const messageRequest: SendMessageRequest = {
        sessionId: startResponse.sessionId,
        message: 'Test message'
      };

      // Should not throw error, should handle gracefully
      const response = await service.sendMessage(messageRequest);
      expect(response).toHaveProperty('response');
    });
  });
});