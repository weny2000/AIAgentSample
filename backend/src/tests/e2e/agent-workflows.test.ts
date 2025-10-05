/**
 * AgentCore End-to-End Tests - Complete Workflows
 * Tests complete agent workflows from start to finish including all integrations
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
  AgentSession,
  ConversationMessage,
  ConversationSummary
} from '../../models/agent-core';

// E2E test scenarios representing real-world usage patterns
describe('AgentCore End-to-End Tests - Complete Workflows', () => {
  let agentCoreService: AgentCoreService;
  let conversationService: ConversationManagementService;
  let mockPersonaRepository: jest.Mocked<PersonaRepository>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockConversationRepository: jest.Mocked<ConversationRepository>;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let logger: Logger;

  // Test personas for different scenarios
  const personas = {
    technical: {
      id: 'technical-lead-persona',
      name: 'Technical Lead',
      description: 'Experienced technical leader providing guidance on architecture and implementation',
      team_id: 'engineering-team',
      communication_style: 'technical',
      decision_making_style: 'analytical',
      escalation_criteria: ['architecture_decisions', 'security_concerns'],
      custom_instructions: 'Provide detailed technical guidance with code examples and best practices',
      created_at: new Date(),
      updated_at: new Date()
    },
    security: {
      id: 'security-officer-persona',
      name: 'Security Officer',
      description: 'Security-focused persona ensuring compliance and best practices',
      team_id: 'security-team',
      communication_style: 'formal',
      decision_making_style: 'cautious',
      escalation_criteria: ['security_violations', 'compliance_issues'],
      custom_instructions: 'Always prioritize security and compliance in all recommendations',
      created_at: new Date(),
      updated_at: new Date()
    },
    product: {
      id: 'product-manager-persona',
      name: 'Product Manager',
      description: 'Product-focused persona balancing user needs with technical constraints',
      team_id: 'product-team',
      communication_style: 'business',
      decision_making_style: 'collaborative',
      escalation_criteria: ['user_impact', 'business_critical'],
      custom_instructions: 'Focus on user value and business impact in all decisions',
      created_at: new Date(),
      updated_at: new Date()
    }
  };

  beforeAll(async () => {
    jest.setTimeout(120000); // 2 minutes for E2E tests

    logger = new Logger({ correlationId: 'e2e-test' });

    // Setup comprehensive mocks for E2E testing
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

    // Setup realistic conversation repository
    let sessionStore: Map<string, AgentSession> = new Map();
    let messageStore: Map<string, ConversationMessage[]> = new Map();
    let summaryStore: Map<string, ConversationSummary[]> = new Map();

    mockConversationRepository = {
      storeSession: jest.fn().mockImplementation(async (session) => {
        sessionStore.set(session.sessionId, { ...session });
      }),
      getSession: jest.fn().mockImplementation(async (sessionId) => {
        return sessionStore.get(sessionId) || null;
      }),
      updateSession: jest.fn().mockImplementation(async (sessionId, updates) => {
        const session = sessionStore.get(sessionId);
        if (session) {
          Object.assign(session, updates);
        }
      }),
      endSession: jest.fn().mockImplementation(async (sessionId) => {
        const session = sessionStore.get(sessionId);
        if (session) {
          session.metadata = { ...session.metadata, ended: true };
        }
      }),
      storeMessage: jest.fn().mockImplementation(async (sessionId, message) => {
        if (!messageStore.has(sessionId)) {
          messageStore.set(sessionId, []);
        }
        messageStore.get(sessionId)!.push({ ...message });
      }),
      getConversationHistory: jest.fn().mockImplementation(async ({ sessionId, limit = 100, offset = 0 }) => {
        const messages = messageStore.get(sessionId) || [];
        const paginatedMessages = messages.slice(offset, offset + limit);
        return {
          messages: paginatedMessages,
          totalCount: messages.length,
          hasMore: messages.length > offset + limit
        };
      }),
      createBranch: jest.fn(),
      storeSummary: jest.fn().mockImplementation(async (summary) => {
        if (!summaryStore.has(summary.sessionId)) {
          summaryStore.set(summary.sessionId, []);
        }
        summaryStore.get(summary.sessionId)!.push({ ...summary });
      }),
      getSummaries: jest.fn().mockImplementation(async (sessionId) => {
        return summaryStore.get(sessionId) || [];
      })
    } as any;

    // Create services
    conversationService = new ConversationManagementService(
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

    // Setup default mocks
    mockPersonaRepository.getPersonaById.mockImplementation(async (personaId) => {
      return Object.values(personas).find(p => p.id === personaId) || null;
    });

    mockAuditRepository.create.mockResolvedValue();
    mockRulesEngine.validateContent.mockResolvedValue({ compliant: true, score: 1.0 });
    mockNotificationService.sendStakeholderNotifications.mockResolvedValue();
  });

  describe('Technical Consultation Workflow', () => {
    it('should complete full technical consultation session', async () => {
      // Setup technical knowledge base responses
      mockKendraService.search.mockImplementation(async ({ query }) => {
        if (query.includes('architecture')) {
          return {
            results: [
              {
                id: 'arch-guide',
                title: 'System Architecture Guidelines',
                excerpt: 'Our microservices architecture follows domain-driven design principles',
                uri: '/docs/architecture.md',
                type: 'DOCUMENT',
                confidence: 0.9,
                sourceAttributes: { source_type: 'documentation' }
              }
            ],
            totalCount: 1,
            queryId: 'arch-query'
          };
        }
        if (query.includes('deployment')) {
          return {
            results: [
              {
                id: 'deploy-guide',
                title: 'Deployment Best Practices',
                excerpt: 'Use blue-green deployment strategy with automated rollback',
                uri: '/docs/deployment.md',
                type: 'DOCUMENT',
                confidence: 0.85,
                sourceAttributes: { source_type: 'documentation' }
              }
            ],
            totalCount: 1,
            queryId: 'deploy-query'
          };
        }
        return { results: [], totalCount: 0, queryId: 'empty-query' };
      });

      // 1. Start technical consultation session
      const session = await agentCoreService.startSession({
        userId: 'senior-developer',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona',
        initialMessage: 'I need guidance on our new service architecture'
      });

      expect(session.sessionId).toBeDefined();
      expect(session.agentConfiguration.personaId).toBe('technical-lead-persona');
      expect(session.welcomeMessage).toContain('architecture');

      // 2. Discuss architecture requirements
      const archResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What architecture patterns should we follow for a high-throughput API service?'
      });

      expect(archResponse.response).toContain('microservices');
      expect(archResponse.references).toHaveLength(1);
      expect(archResponse.confidence).toBeGreaterThan(0.7);

      // 3. Follow up with specific implementation questions
      const implResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'How should we handle database connections in this architecture?'
      });

      expect(implResponse.response).toBeDefined();
      expect(implResponse.suggestions).toBeDefined();

      // 4. Discuss deployment strategy
      const deployResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What deployment strategy would you recommend?'
      });

      expect(deployResponse.response).toContain('deployment');
      expect(deployResponse.references).toHaveLength(1);

      // 5. Request action items and next steps
      const actionResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Can you summarize the key action items from our discussion?'
      });

      expect(actionResponse.actionItems).toBeDefined();
      expect(actionResponse.actionItems.length).toBeGreaterThan(0);

      // 6. Generate conversation summary
      const summary = await agentCoreService.generateConversationSummary(session.sessionId, 'session');

      expect(summary.keyTopics).toContain('architecture');
      expect(summary.actionItems.length).toBeGreaterThan(0);
      expect(summary.insights.totalMessages).toBeGreaterThan(6);

      // 7. End session
      await agentCoreService.endSession(session.sessionId);

      // Verify complete workflow was audited
      expect(mockAuditRepository.create).toHaveBeenCalledTimes(7); // start + 5 messages + end
    });

    it('should handle complex multi-topic technical discussion', async () => {
      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'tech-doc',
            title: 'Technical Documentation',
            excerpt: 'Comprehensive technical guidance',
            uri: '/docs/tech.md',
            type: 'DOCUMENT',
            confidence: 0.8,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'tech-query'
      });

      const session = await agentCoreService.startSession({
        userId: 'tech-lead',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona'
      });

      // Discuss multiple technical topics
      const topics = [
        'database optimization strategies',
        'caching implementation approaches',
        'monitoring and observability setup',
        'security best practices for APIs',
        'performance testing methodologies'
      ];

      const responses = [];
      for (const topic of topics) {
        const response = await agentCoreService.sendMessage({
          sessionId: session.sessionId,
          message: `Tell me about ${topic}`
        });
        responses.push(response);
      }

      // Verify all topics were addressed
      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.response).toBeDefined();
        expect(response.confidence).toBeGreaterThan(0.5);
      });

      // Generate insights
      const insights = await agentCoreService.getConversationInsights(session.sessionId);
      expect(insights.topicProgression.length).toBeGreaterThan(3);

      await agentCoreService.endSession(session.sessionId);
    });
  });

  describe('Security Review Workflow', () => {
    it('should complete comprehensive security review process', async () => {
      // Setup security-focused knowledge base
      mockKendraService.search.mockImplementation(async ({ query }) => {
        if (query.includes('security')) {
          return {
            results: [
              {
                id: 'security-policy',
                title: 'Security Policy Guidelines',
                excerpt: 'All applications must implement multi-factor authentication and encryption at rest',
                uri: '/policies/security.pdf',
                type: 'DOCUMENT',
                confidence: 0.95,
                sourceAttributes: { source_type: 'policy' }
              }
            ],
            totalCount: 1,
            queryId: 'security-query'
          };
        }
        if (query.includes('compliance')) {
          return {
            results: [
              {
                id: 'compliance-checklist',
                title: 'Compliance Checklist',
                excerpt: 'SOC 2 Type II compliance requirements for data handling',
                uri: '/compliance/checklist.pdf',
                type: 'DOCUMENT',
                confidence: 0.9,
                sourceAttributes: { source_type: 'compliance' }
              }
            ],
            totalCount: 1,
            queryId: 'compliance-query'
          };
        }
        return { results: [], totalCount: 0, queryId: 'empty-query' };
      });

      // 1. Start security review session
      const session = await agentCoreService.startSession({
        userId: 'security-engineer',
        teamId: 'security-team',
        personaId: 'security-officer-persona',
        initialMessage: 'I need to conduct a security review for our new payment processing service'
      });

      expect(session.agentConfiguration.personaId).toBe('security-officer-persona');

      // 2. Review security requirements
      const requirementsResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are the key security requirements for payment processing?'
      });

      expect(requirementsResponse.response).toContain('authentication');
      expect(requirementsResponse.references).toHaveLength(1);

      // 3. Assess compliance needs
      const complianceResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What compliance standards do we need to meet?'
      });

      expect(complianceResponse.response).toContain('compliance');
      expect(complianceResponse.references).toHaveLength(1);

      // 4. Identify security risks
      const riskResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are the main security risks we should be concerned about?'
      });

      expect(riskResponse.response).toBeDefined();
      expect(riskResponse.actionItems).toBeDefined();

      // 5. Request security checklist
      const checklistResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Can you provide a security review checklist?'
      });

      expect(checklistResponse.actionItems.length).toBeGreaterThan(0);

      // 6. Trigger proactive security notification
      await agentCoreService.sendProactiveNotification(
        session.sessionId,
        'security_alert',
        'Critical security review required for payment processing service',
        'high'
      );

      expect(mockNotificationService.sendStakeholderNotifications).toHaveBeenCalled();

      // 7. Generate security summary
      const summary = await agentCoreService.generateConversationSummary(session.sessionId, 'session');

      expect(summary.keyTopics).toContain('security');
      expect(summary.keyTopics).toContain('compliance');

      await agentCoreService.endSession(session.sessionId);
    });
  });

  describe('Product Planning Workflow', () => {
    it('should complete product planning and prioritization session', async () => {
      // Setup product-focused knowledge base
      mockKendraService.search.mockImplementation(async ({ query }) => {
        if (query.includes('user') || query.includes('feature')) {
          return {
            results: [
              {
                id: 'user-research',
                title: 'User Research Findings',
                excerpt: 'Users are requesting better mobile experience and faster load times',
                uri: '/research/user-feedback.pdf',
                type: 'DOCUMENT',
                confidence: 0.85,
                sourceAttributes: { source_type: 'research' }
              }
            ],
            totalCount: 1,
            queryId: 'user-query'
          };
        }
        if (query.includes('metrics') || query.includes('analytics')) {
          return {
            results: [
              {
                id: 'analytics-report',
                title: 'Product Analytics Report',
                excerpt: 'Mobile usage has increased 40% while desktop conversion rates remain higher',
                uri: '/analytics/monthly-report.pdf',
                type: 'DOCUMENT',
                confidence: 0.8,
                sourceAttributes: { source_type: 'analytics' }
              }
            ],
            totalCount: 1,
            queryId: 'analytics-query'
          };
        }
        return { results: [], totalCount: 0, queryId: 'empty-query' };
      });

      // 1. Start product planning session
      const session = await agentCoreService.startSession({
        userId: 'product-manager',
        teamId: 'product-team',
        personaId: 'product-manager-persona',
        initialMessage: 'I need help planning our Q2 product roadmap'
      });

      // 2. Review user feedback and research
      const userResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What does our latest user research tell us about feature priorities?'
      });

      expect(userResponse.response).toContain('user');
      expect(userResponse.references).toHaveLength(1);

      // 3. Analyze product metrics
      const metricsResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What do our product analytics show about user behavior?'
      });

      expect(metricsResponse.response).toContain('mobile');
      expect(metricsResponse.references).toHaveLength(1);

      // 4. Discuss feature prioritization
      const priorityResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'How should we prioritize mobile improvements vs desktop features?'
      });

      expect(priorityResponse.response).toBeDefined();
      expect(priorityResponse.suggestions).toBeDefined();

      // 5. Create roadmap action items
      const roadmapResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Can you help me create action items for the Q2 roadmap?'
      });

      expect(roadmapResponse.actionItems.length).toBeGreaterThan(0);

      // 6. Analyze conversation for product insights
      const analysis = await agentCoreService.analyzeForProactiveActions(session.sessionId);

      expect(analysis.recommendations.length).toBeGreaterThan(0);
      expect(analysis.notifications.length).toBeGreaterThan(0);

      await agentCoreService.endSession(session.sessionId);
    });
  });

  describe('Cross-Team Collaboration Workflow', () => {
    it('should facilitate cross-team collaboration session', async () => {
      // Setup cross-team knowledge base
      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'cross-team-doc',
            title: 'Cross-Team Collaboration Guide',
            excerpt: 'Best practices for engineering and product team collaboration',
            uri: '/docs/collaboration.md',
            type: 'DOCUMENT',
            confidence: 0.8,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'collab-query'
      });

      // 1. Start collaboration session with technical persona
      const techSession = await agentCoreService.startSession({
        userId: 'tech-lead',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona'
      });

      // 2. Start parallel session with product persona
      const productSession = await agentCoreService.startSession({
        userId: 'product-owner',
        teamId: 'product-team',
        personaId: 'product-manager-persona'
      });

      // 3. Technical perspective on feature implementation
      const techResponse = await agentCoreService.sendMessage({
        sessionId: techSession.sessionId,
        message: 'What are the technical challenges for implementing real-time notifications?'
      });

      // 4. Product perspective on user value
      const productResponse = await agentCoreService.sendMessage({
        sessionId: productSession.sessionId,
        message: 'What user value would real-time notifications provide?'
      });

      // 5. Create conversation branches for different approaches
      const techBranch = await agentCoreService.createConversationBranch(
        techSession.sessionId,
        techResponse.messageId,
        'WebSocket Implementation',
        'Exploring WebSocket-based real-time notifications'
      );

      const productBranch = await agentCoreService.createConversationBranch(
        productSession.sessionId,
        productResponse.messageId,
        'User Experience Design',
        'Designing optimal notification UX'
      );

      expect(techBranch.branchName).toBe('WebSocket Implementation');
      expect(productBranch.branchName).toBe('User Experience Design');

      // 6. Generate summaries for both perspectives
      const techSummary = await agentCoreService.generateConversationSummary(
        techSession.sessionId,
        'session'
      );
      const productSummary = await agentCoreService.generateConversationSummary(
        productSession.sessionId,
        'session'
      );

      expect(techSummary.keyTopics).toContain('technical');
      expect(productSummary.keyTopics).toContain('user');

      // 7. End both sessions
      await Promise.all([
        agentCoreService.endSession(techSession.sessionId),
        agentCoreService.endSession(productSession.sessionId)
      ]);
    });
  });

  describe('Long-Running Project Workflow', () => {
    it('should handle extended project consultation over multiple sessions', async () => {
      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'project-doc',
            title: 'Project Management Guidelines',
            excerpt: 'Agile project management best practices',
            uri: '/docs/project-mgmt.md',
            type: 'DOCUMENT',
            confidence: 0.8,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'project-query'
      });

      // Phase 1: Project initiation
      const phase1Session = await agentCoreService.startSession({
        userId: 'project-manager',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona',
        context: {
          conversationId: 'project-alpha',
          messages: [],
          relatedArtifacts: ['project-charter', 'requirements-doc'],
          referencedPolicies: ['development-policy'],
          actionItems: []
        }
      });

      await agentCoreService.sendMessage({
        sessionId: phase1Session.sessionId,
        message: 'We are starting Project Alpha - a new customer portal. What should be our first steps?'
      });

      const phase1Summary = await agentCoreService.generateConversationSummary(
        phase1Session.sessionId,
        'session'
      );

      await agentCoreService.endSession(phase1Session.sessionId);

      // Phase 2: Development planning (new session with context)
      const phase2Session = await agentCoreService.startSession({
        userId: 'project-manager',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona',
        context: {
          conversationId: 'project-alpha',
          messages: [],
          relatedArtifacts: ['project-charter', 'requirements-doc', 'architecture-doc'],
          referencedPolicies: ['development-policy'],
          actionItems: phase1Summary.actionItems
        }
      });

      await agentCoreService.sendMessage({
        sessionId: phase2Session.sessionId,
        message: 'Based on our previous discussion, how should we structure the development phases?'
      });

      const phase2Summary = await agentCoreService.generateConversationSummary(
        phase2Session.sessionId,
        'session'
      );

      await agentCoreService.endSession(phase2Session.sessionId);

      // Phase 3: Implementation review
      const phase3Session = await agentCoreService.startSession({
        userId: 'project-manager',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona',
        context: {
          conversationId: 'project-alpha',
          messages: [],
          relatedArtifacts: ['project-charter', 'requirements-doc', 'architecture-doc', 'implementation-plan'],
          referencedPolicies: ['development-policy', 'security-policy'],
          actionItems: [...phase1Summary.actionItems, ...phase2Summary.actionItems]
        }
      });

      await agentCoreService.sendMessage({
        sessionId: phase3Session.sessionId,
        message: 'We have completed the first sprint. What should we review and adjust for the next phase?'
      });

      await agentCoreService.endSession(phase3Session.sessionId);

      // Verify project continuity across sessions
      expect(phase1Summary.keyTopics).toBeDefined();
      expect(phase2Summary.keyTopics).toBeDefined();
      expect(phase2Summary.actionItems.length).toBeGreaterThanOrEqual(phase1Summary.actionItems.length);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle and recover from service failures during workflow', async () => {
      const session = await agentCoreService.startSession({
        userId: 'resilience-user',
        teamId: 'engineering-team',
        personaId: 'technical-lead-persona'
      });

      // Normal operation
      const normalResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'What are our coding standards?'
      });

      expect(normalResponse.response).toBeDefined();

      // Simulate Kendra service failure
      mockKendraService.search.mockRejectedValueOnce(new Error('Service temporarily unavailable'));

      const degradedResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Tell me about deployment procedures'
      });

      // Should still provide response despite service failure
      expect(degradedResponse.response).toBeDefined();
      expect(degradedResponse.references).toEqual([]);

      // Simulate rules engine failure
      mockRulesEngine.validateContent.mockRejectedValueOnce(new Error('Validation service down'));

      const validationResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'This should still work despite validation failure'
      });

      expect(validationResponse.response).toBeDefined();

      // Service recovery
      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'recovery-doc',
            title: 'Service Recovery',
            excerpt: 'Services are back online',
            uri: '/docs/recovery.md',
            type: 'DOCUMENT',
            confidence: 0.8,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'recovery-query'
      });

      const recoveredResponse = await agentCoreService.sendMessage({
        sessionId: session.sessionId,
        message: 'Are services working normally now?'
      });

      expect(recoveredResponse.response).toBeDefined();
      expect(recoveredResponse.references).toHaveLength(1);

      await agentCoreService.endSession(session.sessionId);
    });
  });

  describe('Performance Under Real-World Load', () => {
    it('should maintain performance during realistic usage patterns', async () => {
      const sessions: any[] = [];
      const startTime = Date.now();

      // Create multiple concurrent sessions simulating real usage
      const sessionPromises = Array.from({ length: 10 }, async (_, i) => {
        const session = await agentCoreService.startSession({
          userId: `real-user-${i}`,
          teamId: 'engineering-team',
          personaId: 'technical-lead-persona'
        });

        sessions.push(session);

        // Simulate realistic conversation patterns
        const messages = [
          'I need help with our API design',
          'What are the best practices for error handling?',
          'How should we implement authentication?',
          'Can you review our database schema?',
          'What testing strategy should we use?'
        ];

        for (const message of messages) {
          await agentCoreService.sendMessage({
            sessionId: session.sessionId,
            message
          });

          // Realistic pause between messages
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        return session;
      });

      await Promise.all(sessionPromises);

      const conversationTime = Date.now() - startTime;

      // Generate summaries for all sessions
      const summaryPromises = sessions.map(session =>
        agentCoreService.generateConversationSummary(session.sessionId, 'session')
      );

      const summaries = await Promise.all(summaryPromises);

      // End all sessions
      const endPromises = sessions.map(session =>
        agentCoreService.endSession(session.sessionId)
      );

      await Promise.all(endPromises);

      const totalTime = Date.now() - startTime;

      // Performance assertions
      expect(totalTime).toBeLessThan(60000); // Complete within 1 minute
      expect(summaries).toHaveLength(10);
      summaries.forEach(summary => {
        expect(summary.keyTopics.length).toBeGreaterThan(0);
        expect(summary.insights.totalMessages).toBe(10); // 5 user + 5 agent messages
      });

      console.log(`Completed realistic workflow test in ${totalTime}ms`);
      console.log(`Average time per session: ${totalTime / sessions.length}ms`);
    });
  });

  afterEach(async () => {
    // Clean up any remaining sessions
    const internalSessions = (agentCoreService as any).sessions;
    const sessionIds = Array.from(internalSessions.keys());
    
    await Promise.all(
      sessionIds.map(sessionId => 
        agentCoreService.endSession(sessionId).catch(() => {})
      )
    );
    
    internalSessions.clear();
  });
});