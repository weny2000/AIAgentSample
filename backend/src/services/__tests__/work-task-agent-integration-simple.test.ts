/**
 * Simple Work Task Agent Integration Tests
 * Basic smoke tests for the integration service
 */

import { WorkTaskAgentIntegration } from '../work-task-agent-integration';

describe('WorkTaskAgentIntegration - Simple Tests', () => {
  let integration: WorkTaskAgentIntegration;
  let mockServices: any;

  beforeEach(() => {
    // Create minimal mocks
    mockServices = {
      agentCore: {
        sendMessage: jest.fn().mockResolvedValue({
          messageId: 'msg-1',
          response: 'Hello',
          references: [],
          actionItems: [],
          suggestions: [],
          confidence: 0.9,
          processingTime: 100
        })
      },
      workTaskAnalysis: {
        analyzeWorkTask: jest.fn().mockResolvedValue({
          taskId: 'task-1',
          keyPoints: ['Key point 1'],
          relatedWorkgroups: [],
          todoList: [],
          knowledgeReferences: [],
          riskAssessment: {
            overallRiskLevel: 'low',
            riskFactors: []
          },
          recommendations: [],
          estimatedEffort: { totalHours: 0, breakdown: [] },
          dependencies: [],
          complianceChecks: []
        })
      },
      conversationService: {
        buildMemoryContext: jest.fn().mockResolvedValue({
          shortTermMemory: [],
          longTermMemory: [],
          semanticMemory: [],
          proceduralMemory: []
        })
      },
      auditService: {
        logAction: jest.fn().mockResolvedValue({})
      },
      notificationService: {},
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
      }
    };

    integration = new WorkTaskAgentIntegration(
      mockServices.agentCore as any,
      mockServices.workTaskAnalysis as any,
      mockServices.conversationService as any,
      mockServices.auditService as any,
      mockServices.notificationService as any,
      mockServices.logger as any
    );
  });

  it('should be instantiated', () => {
    expect(integration).toBeDefined();
  });

  it('should process a simple message', async () => {
    const response = await integration.processMessageWithWorkTaskContext(
      'session-1',
      'Hello',
      'user-1',
      'team-1'
    );

    expect(response).toBeDefined();
    expect(response.response).toBeDefined();
  });

  it('should detect task creation intent', async () => {
    const response = await integration.processMessageWithWorkTaskContext(
      'session-1',
      'Create a task: Test task',
      'user-1',
      'team-1'
    );

    expect(response).toBeDefined();
    expect(mockServices.workTaskAnalysis.analyzeWorkTask).toHaveBeenCalled();
  });

  it('should handle query intent', async () => {
    const response = await integration.processMessageWithWorkTaskContext(
      'session-1',
      'Show me my tasks',
      'user-1',
      'team-1'
    );

    expect(response).toBeDefined();
    expect(response.response).toContain('active work task');
  });

  it('should cleanup expired contexts', async () => {
    await expect(integration.cleanupExpiredContexts()).resolves.not.toThrow();
  });
});
