/**
 * AgentCore Performance Tests - Concurrent Sessions
 * Tests performance under load with multiple concurrent agent sessions
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
  AgentSession
} from '../../models/agent-core';

// Performance test configuration
const PERFORMANCE_CONFIG = {
  CONCURRENT_SESSIONS: 50,
  MESSAGES_PER_SESSION: 10,
  MAX_RESPONSE_TIME_MS: 5000,
  MAX_MEMORY_USAGE_MB: 512,
  TARGET_THROUGHPUT_RPS: 100
};

describe('AgentCore Performance Tests - Concurrent Sessions', () => {
  let agentCoreService: AgentCoreService;
  let mockPersonaRepository: jest.Mocked<PersonaRepository>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockConversationRepository: jest.Mocked<ConversationRepository>;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let logger: Logger;

  const testPersona = {
    id: 'perf-test-persona',
    name: 'Performance Test Persona',
    description: 'Persona for performance testing',
    team_id: 'perf-test-team',
    communication_style: 'concise',
    decision_making_style: 'quick',
    escalation_criteria: [],
    custom_instructions: 'Provide brief responses',
    created_at: new Date(),
    updated_at: new Date()
  };

  beforeAll(async () => {
    // Increase timeout for performance tests
    jest.setTimeout(60000);

    // Setup logger with performance tracking
    logger = new Logger({ correlationId: 'performance-test' });

    // Setup optimized mocks for performance testing
    mockPersonaRepository = {
      getPersonaById: jest.fn().mockResolvedValue(testPersona),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn()
    } as any;

    mockAuditRepository = {
      create: jest.fn().mockResolvedValue(undefined),
      getByRequestId: jest.fn(),
      getByUserId: jest.fn(),
      getByTeamId: jest.fn(),
      list: jest.fn()
    } as any;

    // Fast mock responses for performance testing
    mockKendraService = {
      search: jest.fn().mockResolvedValue({
        results: [
          {
            id: 'perf-doc-1',
            title: 'Quick Reference',
            excerpt: 'Brief information for performance testing',
            uri: '/docs/quick-ref.pdf',
            type: 'DOCUMENT',
            confidence: 0.8,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'perf-query'
      }),
      submitFeedback: jest.fn()
    } as any;

    mockRulesEngine = {
      validateContent: jest.fn().mockResolvedValue({ compliant: true, score: 1.0 }),
      validateArtifact: jest.fn(),
      getValidationRules: jest.fn()
    } as any;

    mockNotificationService = {
      sendStakeholderNotifications: jest.fn().mockResolvedValue(undefined),
      createJiraTicket: jest.fn(),
      sendSlackNotification: jest.fn()
    } as any;

    // Setup in-memory conversation repository for performance
    let sessionStore: Map<string, AgentSession> = new Map();
    let messageStore: Map<string, any[]> = new Map();

    mockConversationRepository = {
      storeSession: jest.fn().mockImplementation(async (session) => {
        sessionStore.set(session.sessionId, session);
      }),
      getSession: jest.fn().mockImplementation(async (sessionId) => {
        return sessionStore.get(sessionId) || null;
      }),
      updateSession: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
      storeMessage: jest.fn().mockImplementation(async (sessionId, message) => {
        if (!messageStore.has(sessionId)) {
          messageStore.set(sessionId, []);
        }
        messageStore.get(sessionId)!.push(message);
      }),
      getConversationHistory: jest.fn().mockImplementation(async ({ sessionId, limit = 100 }) => {
        const messages = messageStore.get(sessionId) || [];
        return {
          messages: messages.slice(0, limit),
          totalCount: messages.length,
          hasMore: messages.length > limit
        };
      }),
      createBranch: jest.fn(),
      storeSummary: jest.fn(),
      getSummaries: jest.fn().mockResolvedValue([])
    } as any;

    // Create services
    const conversationService = new ConversationManagementService(
      mockConversationRepository,
      logger
    );

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
  });

  describe('Concurrent Session Creation', () => {
    it('should handle multiple concurrent session starts', async () => {
      const startTime = Date.now();
      
      // Create concurrent session start requests
      const sessionRequests: StartSessionRequest[] = Array.from(
        { length: PERFORMANCE_CONFIG.CONCURRENT_SESSIONS },
        (_, i) => ({
          userId: `perf-user-${i}`,
          teamId: 'perf-test-team',
          personaId: 'perf-test-persona'
        })
      );

      // Start all sessions concurrently
      const sessionPromises = sessionRequests.map(request => 
        agentCoreService.startSession(request)
      );

      const sessions = await Promise.all(sessionPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all sessions were created
      expect(sessions).toHaveLength(PERFORMANCE_CONFIG.CONCURRENT_SESSIONS);
      sessions.forEach(session => {
        expect(session.sessionId).toBeDefined();
        expect(session.agentConfiguration).toBeDefined();
      });

      // Performance assertions
      const averageTimePerSession = totalTime / PERFORMANCE_CONFIG.CONCURRENT_SESSIONS;
      expect(averageTimePerSession).toBeLessThan(1000); // Less than 1 second per session

      console.log(`Created ${PERFORMANCE_CONFIG.CONCURRENT_SESSIONS} sessions in ${totalTime}ms`);
      console.log(`Average time per session: ${averageTimePerSession.toFixed(2)}ms`);
    });

    it('should maintain performance with session cleanup', async () => {
      const sessions: any[] = [];
      const batchSize = 10;
      const batches = Math.ceil(PERFORMANCE_CONFIG.CONCURRENT_SESSIONS / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchStartTime = Date.now();
        
        // Create batch of sessions
        const batchRequests = Array.from({ length: batchSize }, (_, i) => ({
          userId: `batch-${batch}-user-${i}`,
          teamId: 'perf-test-team',
          personaId: 'perf-test-persona'
        }));

        const batchSessions = await Promise.all(
          batchRequests.map(req => agentCoreService.startSession(req))
        );

        sessions.push(...batchSessions);

        const batchEndTime = Date.now();
        const batchTime = batchEndTime - batchStartTime;

        expect(batchTime).toBeLessThan(5000); // Each batch should complete in under 5 seconds
        
        // Clean up half the sessions to test cleanup performance
        if (batch % 2 === 1) {
          const sessionsToEnd = sessions.splice(0, batchSize);
          await Promise.all(
            sessionsToEnd.map(session => agentCoreService.endSession(session.sessionId))
          );
        }
      }

      console.log(`Processed ${batches} batches of ${batchSize} sessions each`);
    });
  });

  describe('Concurrent Message Processing', () => {
    let testSessions: any[] = [];

    beforeEach(async () => {
      // Create test sessions for message processing tests
      const sessionRequests = Array.from({ length: 20 }, (_, i) => ({
        userId: `msg-test-user-${i}`,
        teamId: 'perf-test-team',
        personaId: 'perf-test-persona'
      }));

      testSessions = await Promise.all(
        sessionRequests.map(req => agentCoreService.startSession(req))
      );
    });

    afterEach(async () => {
      // Clean up test sessions
      await Promise.all(
        testSessions.map(session => agentCoreService.endSession(session.sessionId))
      );
      testSessions = [];
    });

    it('should handle concurrent messages across multiple sessions', async () => {
      const startTime = Date.now();
      
      // Create concurrent message requests across all sessions
      const messageRequests: SendMessageRequest[] = testSessions.flatMap(session =>
        Array.from({ length: 5 }, (_, i) => ({
          sessionId: session.sessionId,
          message: `Performance test message ${i + 1}`,
          messageType: 'text' as const
        }))
      );

      // Send all messages concurrently
      const responses = await Promise.all(
        messageRequests.map(req => agentCoreService.sendMessage(req))
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all messages were processed
      expect(responses).toHaveLength(messageRequests.length);
      responses.forEach(response => {
        expect(response.messageId).toBeDefined();
        expect(response.response).toBeDefined();
        expect(response.processingTime).toBeLessThan(PERFORMANCE_CONFIG.MAX_RESPONSE_TIME_MS);
      });

      // Performance assertions
      const throughput = (responses.length / totalTime) * 1000; // messages per second
      expect(throughput).toBeGreaterThan(10); // At least 10 messages per second

      console.log(`Processed ${responses.length} messages in ${totalTime}ms`);
      console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
    });

    it('should maintain response quality under load', async () => {
      const messageRequests: SendMessageRequest[] = testSessions.map(session => ({
        sessionId: session.sessionId,
        message: 'What are our security policies and deployment procedures?',
        messageType: 'text' as const
      }));

      const responses = await Promise.all(
        messageRequests.map(req => agentCoreService.sendMessage(req))
      );

      // Verify response quality is maintained under load
      responses.forEach(response => {
        expect(response.confidence).toBeGreaterThan(0.5);
        expect(response.response.length).toBeGreaterThan(10);
        expect(response.references).toBeDefined();
      });

      // Check that all responses are unique (not cached incorrectly)
      const uniqueResponses = new Set(responses.map(r => r.response));
      expect(uniqueResponses.size).toBeGreaterThan(1);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should manage memory efficiently with many concurrent sessions', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create many sessions
      const sessionRequests = Array.from({ length: 100 }, (_, i) => ({
        userId: `memory-test-user-${i}`,
        teamId: 'perf-test-team',
        personaId: 'perf-test-persona'
      }));

      const sessions = await Promise.all(
        sessionRequests.map(req => agentCoreService.startSession(req))
      );

      // Send messages to create conversation history
      const messagePromises = sessions.map(session =>
        agentCoreService.sendMessage({
          sessionId: session.sessionId,
          message: 'Test message for memory usage'
        })
      );

      await Promise.all(messagePromises);

      const peakMemory = process.memoryUsage();
      const memoryIncrease = (peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024; // MB

      // Clean up sessions
      await Promise.all(
        sessions.map(session => agentCoreService.endSession(session.sessionId))
      );

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryAfterCleanup = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024; // MB

      console.log(`Memory increase during test: ${memoryIncrease.toFixed(2)}MB`);
      console.log(`Memory after cleanup: ${memoryAfterCleanup.toFixed(2)}MB`);

      // Memory should not exceed reasonable limits
      expect(memoryIncrease).toBeLessThan(PERFORMANCE_CONFIG.MAX_MEMORY_USAGE_MB);
      
      // Memory should be mostly cleaned up after session end
      expect(memoryAfterCleanup).toBeLessThan(memoryIncrease * 0.5);
    });

    it('should handle session expiration efficiently', async () => {
      // Create sessions
      const sessions = await Promise.all(
        Array.from({ length: 50 }, (_, i) => 
          agentCoreService.startSession({
            userId: `expiry-test-user-${i}`,
            teamId: 'perf-test-team',
            personaId: 'perf-test-persona'
          })
        )
      );

      // Simulate session expiration by manipulating internal state
      const internalSessions = (agentCoreService as any).sessions;
      const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      sessions.forEach(session => {
        const sessionData = internalSessions.get(session.sessionId);
        if (sessionData) {
          sessionData.lastActivity = expiredTime;
        }
      });

      // Try to send messages to expired sessions
      const expiredMessagePromises = sessions.map(session =>
        agentCoreService.sendMessage({
          sessionId: session.sessionId,
          message: 'This should fail due to expiration'
        }).catch(error => error)
      );

      const results = await Promise.all(expiredMessagePromises);

      // All should fail due to expiration
      results.forEach(result => {
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toContain('expired');
      });

      // Verify expired sessions are cleaned up
      const remainingSessions = internalSessions.size;
      expect(remainingSessions).toBe(0);
    });
  });

  describe('Stress Testing', () => {
    it('should handle burst traffic patterns', async () => {
      const burstSizes = [10, 25, 50, 25, 10]; // Simulating traffic bursts
      const results: any[] = [];

      for (const burstSize of burstSizes) {
        const burstStartTime = Date.now();
        
        // Create burst of sessions
        const burstSessions = await Promise.all(
          Array.from({ length: burstSize }, (_, i) =>
            agentCoreService.startSession({
              userId: `burst-user-${Date.now()}-${i}`,
              teamId: 'perf-test-team',
              personaId: 'perf-test-persona'
            })
          )
        );

        // Send messages in burst
        const burstMessages = await Promise.all(
          burstSessions.map(session =>
            agentCoreService.sendMessage({
              sessionId: session.sessionId,
              message: `Burst test message for ${burstSize} concurrent sessions`
            })
          )
        );

        const burstEndTime = Date.now();
        const burstDuration = burstEndTime - burstStartTime;

        results.push({
          burstSize,
          duration: burstDuration,
          throughput: (burstSize / burstDuration) * 1000
        });

        // Clean up burst sessions
        await Promise.all(
          burstSessions.map(session => agentCoreService.endSession(session.sessionId))
        );

        // Brief pause between bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify system handled all bursts successfully
      results.forEach(result => {
        expect(result.duration).toBeLessThan(10000); // Each burst under 10 seconds
        expect(result.throughput).toBeGreaterThan(1); // At least 1 session/second
      });

      console.log('Burst test results:', results);
    });

    it('should maintain stability under sustained load', async () => {
      const loadDurationMs = 30000; // 30 seconds of sustained load
      const sessionCreationInterval = 500; // Create new session every 500ms
      const startTime = Date.now();
      const activeSessions: any[] = [];
      const completedSessions: any[] = [];

      const loadTest = async () => {
        while (Date.now() - startTime < loadDurationMs) {
          try {
            // Create new session
            const session = await agentCoreService.startSession({
              userId: `load-user-${Date.now()}`,
              teamId: 'perf-test-team',
              personaId: 'perf-test-persona'
            });

            activeSessions.push(session);

            // Send a message
            await agentCoreService.sendMessage({
              sessionId: session.sessionId,
              message: 'Sustained load test message'
            });

            // Randomly end some sessions to simulate realistic usage
            if (activeSessions.length > 20 && Math.random() > 0.7) {
              const sessionToEnd = activeSessions.shift();
              if (sessionToEnd) {
                await agentCoreService.endSession(sessionToEnd.sessionId);
                completedSessions.push(sessionToEnd);
              }
            }

            await new Promise(resolve => setTimeout(resolve, sessionCreationInterval));
          } catch (error) {
            console.error('Error during sustained load test:', error);
          }
        }
      };

      await loadTest();

      // Clean up remaining active sessions
      await Promise.all(
        activeSessions.map(session => 
          agentCoreService.endSession(session.sessionId).catch(console.error)
        )
      );

      const totalSessions = activeSessions.length + completedSessions.length;
      const actualDuration = Date.now() - startTime;

      console.log(`Sustained load test completed:`);
      console.log(`- Duration: ${actualDuration}ms`);
      console.log(`- Total sessions processed: ${totalSessions}`);
      console.log(`- Average sessions per second: ${(totalSessions / actualDuration * 1000).toFixed(2)}`);

      // Verify system remained stable
      expect(totalSessions).toBeGreaterThan(10); // Should have processed multiple sessions
      expect(actualDuration).toBeLessThan(loadDurationMs + 5000); // Should complete within reasonable time
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet response time SLA', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          agentCoreService.startSession({
            userId: `sla-user-${i}`,
            teamId: 'perf-test-team',
            personaId: 'perf-test-persona'
          })
        )
      );

      const messageRequests = sessions.map(session => ({
        sessionId: session.sessionId,
        message: 'What are our current policies and procedures?'
      }));

      const startTime = Date.now();
      const responses = await Promise.all(
        messageRequests.map(req => agentCoreService.sendMessage(req))
      );
      const endTime = Date.now();

      // Verify SLA compliance
      const averageResponseTime = (endTime - startTime) / responses.length;
      expect(averageResponseTime).toBeLessThan(2000); // Under 2 seconds average

      responses.forEach(response => {
        expect(response.processingTime).toBeLessThan(PERFORMANCE_CONFIG.MAX_RESPONSE_TIME_MS);
      });

      // Clean up
      await Promise.all(
        sessions.map(session => agentCoreService.endSession(session.sessionId))
      );

      console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
    });

    it('should achieve target throughput', async () => {
      const testDurationMs = 10000; // 10 seconds
      const startTime = Date.now();
      let completedRequests = 0;

      // Create pool of sessions
      const sessionPool = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          agentCoreService.startSession({
            userId: `throughput-user-${i}`,
            teamId: 'perf-test-team',
            personaId: 'perf-test-persona'
          })
        )
      );

      // Continuously send messages for test duration
      const throughputTest = async () => {
        const promises: Promise<any>[] = [];
        
        while (Date.now() - startTime < testDurationMs) {
          const session = sessionPool[completedRequests % sessionPool.length];
          
          const messagePromise = agentCoreService.sendMessage({
            sessionId: session.sessionId,
            message: `Throughput test message ${completedRequests}`
          }).then(() => {
            completedRequests++;
          }).catch(console.error);

          promises.push(messagePromise);

          // Control concurrency
          if (promises.length >= 50) {
            await Promise.race(promises);
          }
        }

        await Promise.all(promises);
      };

      await throughputTest();

      const actualDuration = Date.now() - startTime;
      const actualThroughput = (completedRequests / actualDuration) * 1000;

      // Clean up
      await Promise.all(
        sessionPool.map(session => agentCoreService.endSession(session.sessionId))
      );

      console.log(`Throughput test results:`);
      console.log(`- Completed requests: ${completedRequests}`);
      console.log(`- Duration: ${actualDuration}ms`);
      console.log(`- Throughput: ${actualThroughput.toFixed(2)} requests/second`);

      // Verify throughput meets target
      expect(actualThroughput).toBeGreaterThan(PERFORMANCE_CONFIG.TARGET_THROUGHPUT_RPS * 0.8); // 80% of target
    });
  });
});