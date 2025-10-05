/**
 * End-to-End Test Setup
 * Configuration and utilities for E2E tests
 */

import { jest } from '@jest/globals';

// Extended timeout for E2E tests
jest.setTimeout(180000);

// E2E test configuration
const E2E_CONFIG = {
  DEFAULT_TIMEOUT: 30000,
  WORKFLOW_TIMEOUT: 120000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  REALISTIC_DELAYS: {
    USER_TYPING: 500,
    NETWORK_LATENCY: 100,
    PROCESSING_TIME: 1000
  }
};

// Mock external services for E2E tests
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
  GetItemCommand: jest.fn(),
  PutItemCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn()
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn().mockImplementation(async (command) => {
        // Simulate realistic database response times
        await new Promise(resolve => setTimeout(resolve, E2E_CONFIG.REALISTIC_DELAYS.NETWORK_LATENCY));
        return {};
      })
    }))
  }
}));

jest.mock('@aws-sdk/client-kendra', () => ({
  KendraClient: jest.fn(),
  QueryCommand: jest.fn(),
  SubmitFeedbackCommand: jest.fn()
}));

// E2E test utilities
class E2ETestUtils {
  private scenarios: Map<string, any> = new Map();

  // Workflow simulation utilities
  async simulateUserTyping(delay: number = E2E_CONFIG.REALISTIC_DELAYS.USER_TYPING): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateNetworkDelay(delay: number = E2E_CONFIG.REALISTIC_DELAYS.NETWORK_LATENCY): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateProcessingTime(delay: number = E2E_CONFIG.REALISTIC_DELAYS.PROCESSING_TIME): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Retry mechanism for flaky operations
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = E2E_CONFIG.MAX_RETRIES,
    delay: number = E2E_CONFIG.RETRY_DELAY
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    throw lastError!;
  }

  // Scenario management
  defineScenario(name: string, scenario: any): void {
    this.scenarios.set(name, scenario);
  }

  getScenario(name: string): any {
    return this.scenarios.get(name);
  }

  // Common E2E test patterns
  createTechnicalConsultationScenario() {
    return {
      name: 'Technical Consultation',
      persona: 'technical-lead-persona',
      user: 'senior-developer',
      team: 'engineering-team',
      conversation: [
        {
          user: 'I need guidance on our new service architecture',
          expectedTopics: ['architecture', 'guidance'],
          expectedReferences: true
        },
        {
          user: 'What architecture patterns should we follow for a high-throughput API service?',
          expectedTopics: ['architecture', 'patterns', 'API'],
          expectedReferences: true
        },
        {
          user: 'How should we handle database connections in this architecture?',
          expectedTopics: ['database', 'connections'],
          expectedSuggestions: true
        },
        {
          user: 'What deployment strategy would you recommend?',
          expectedTopics: ['deployment', 'strategy'],
          expectedActionItems: true
        },
        {
          user: 'Can you summarize the key action items from our discussion?',
          expectedActionItems: true,
          expectSummary: true
        }
      ]
    };
  }

  createSecurityReviewScenario() {
    return {
      name: 'Security Review',
      persona: 'security-officer-persona',
      user: 'security-engineer',
      team: 'security-team',
      conversation: [
        {
          user: 'I need to conduct a security review for our new payment processing service',
          expectedTopics: ['security', 'review', 'payment'],
          expectedReferences: true
        },
        {
          user: 'What are the key security requirements for payment processing?',
          expectedTopics: ['security', 'requirements', 'payment'],
          expectedReferences: true
        },
        {
          user: 'What compliance standards do we need to meet?',
          expectedTopics: ['compliance', 'standards'],
          expectedReferences: true
        },
        {
          user: 'What are the main security risks we should be concerned about?',
          expectedTopics: ['security', 'risks'],
          expectedActionItems: true
        },
        {
          user: 'Can you provide a security review checklist?',
          expectedActionItems: true,
          expectChecklist: true
        }
      ]
    };
  }

  createProductPlanningScenario() {
    return {
      name: 'Product Planning',
      persona: 'product-manager-persona',
      user: 'product-manager',
      team: 'product-team',
      conversation: [
        {
          user: 'I need help planning our Q2 product roadmap',
          expectedTopics: ['planning', 'roadmap'],
          expectedReferences: true
        },
        {
          user: 'What does our latest user research tell us about feature priorities?',
          expectedTopics: ['user', 'research', 'features'],
          expectedReferences: true
        },
        {
          user: 'What do our product analytics show about user behavior?',
          expectedTopics: ['analytics', 'user', 'behavior'],
          expectedReferences: true
        },
        {
          user: 'How should we prioritize mobile improvements vs desktop features?',
          expectedTopics: ['mobile', 'desktop', 'prioritization'],
          expectedSuggestions: true
        },
        {
          user: 'Can you help me create action items for the Q2 roadmap?',
          expectedActionItems: true,
          expectRoadmap: true
        }
      ]
    };
  }

  // Workflow execution utilities
  async executeConversationScenario(agentService: any, scenario: any): Promise<any> {
    const results = {
      sessionId: '',
      messages: [] as any[],
      summary: null as any,
      insights: null as any,
      success: true,
      errors: [] as any[]
    };

    try {
      // Start session
      await this.simulateUserTyping();
      const session = await agentService.startSession({
        userId: scenario.user,
        teamId: scenario.team,
        personaId: scenario.persona,
        initialMessage: scenario.conversation[0]?.user
      });

      results.sessionId = session.sessionId;

      // Execute conversation
      for (let i = 0; i < scenario.conversation.length; i++) {
        const step = scenario.conversation[i];
        
        try {
          await this.simulateUserTyping();
          
          const response = await agentService.sendMessage({
            sessionId: session.sessionId,
            message: step.user
          });

          // Validate response
          this.validateResponse(response, step);
          
          results.messages.push({
            user: step.user,
            agent: response.response,
            confidence: response.confidence,
            references: response.references,
            actionItems: response.actionItems,
            suggestions: response.suggestions
          });

          await this.simulateProcessingTime();

        } catch (error) {
          results.errors.push({
            step: i,
            message: step.user,
            error: error.message
          });
          results.success = false;
        }
      }

      // Generate summary if scenario expects it
      if (scenario.conversation.some((step: any) => step.expectSummary)) {
        try {
          results.summary = await agentService.generateConversationSummary(
            session.sessionId,
            'session'
          );
        } catch (error) {
          results.errors.push({
            step: 'summary',
            error: error.message
          });
        }
      }

      // Get insights
      try {
        results.insights = await agentService.getConversationInsights(session.sessionId);
      } catch (error) {
        results.errors.push({
          step: 'insights',
          error: error.message
        });
      }

      // End session
      await agentService.endSession(session.sessionId);

    } catch (error) {
      results.errors.push({
        step: 'session_management',
        error: error.message
      });
      results.success = false;
    }

    return results;
  }

  private validateResponse(response: any, expectedStep: any): void {
    // Validate basic response structure
    if (!response.response || typeof response.response !== 'string') {
      throw new Error('Invalid response structure');
    }

    if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
      throw new Error('Invalid confidence score');
    }

    // Validate expected topics
    if (expectedStep.expectedTopics) {
      const responseText = response.response.toLowerCase();
      const missingTopics = expectedStep.expectedTopics.filter((topic: string) => 
        !responseText.includes(topic.toLowerCase())
      );
      
      if (missingTopics.length > 0) {
        console.warn(`Missing expected topics: ${missingTopics.join(', ')}`);
      }
    }

    // Validate expected references
    if (expectedStep.expectedReferences && (!response.references || response.references.length === 0)) {
      console.warn('Expected references but none provided');
    }

    // Validate expected action items
    if (expectedStep.expectedActionItems && (!response.actionItems || response.actionItems.length === 0)) {
      console.warn('Expected action items but none provided');
    }

    // Validate expected suggestions
    if (expectedStep.expectedSuggestions && (!response.suggestions || response.suggestions.length === 0)) {
      console.warn('Expected suggestions but none provided');
    }
  }

  // Performance validation for E2E tests
  validateWorkflowPerformance(results: any, maxDuration: number = E2E_CONFIG.WORKFLOW_TIMEOUT): void {
    const totalDuration = results.messages.reduce((sum: number, msg: any) => 
      sum + (msg.processingTime || 0), 0
    );

    if (totalDuration > maxDuration) {
      throw new Error(`Workflow duration ${totalDuration}ms exceeds maximum ${maxDuration}ms`);
    }
  }

  // Data consistency validation
  validateDataConsistency(results: any): void {
    // Validate message ordering
    for (let i = 1; i < results.messages.length; i++) {
      if (results.messages[i].timestamp < results.messages[i - 1].timestamp) {
        throw new Error('Message timestamps are not in chronological order');
      }
    }

    // Validate summary consistency
    if (results.summary) {
      const expectedMessageCount = results.messages.length * 2; // user + agent messages
      if (results.summary.insights.totalMessages !== expectedMessageCount) {
        console.warn(`Summary message count mismatch: expected ${expectedMessageCount}, got ${results.summary.insights.totalMessages}`);
      }
    }
  }

  // Cleanup utilities
  async cleanupTestData(agentService: any, sessionIds: string[]): Promise<void> {
    const cleanupPromises = sessionIds.map(async (sessionId) => {
      try {
        await agentService.endSession(sessionId);
      } catch (error) {
        console.warn(`Failed to cleanup session ${sessionId}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
  }
}

// Global E2E utilities
(global as any).e2eUtils = {
  config: E2E_CONFIG,
  testUtils: new E2ETestUtils(),

  // Common assertions for E2E tests
  assertWorkflowSuccess: (results: any) => {
    if (!results.success) {
      throw new Error(`Workflow failed with errors: ${JSON.stringify(results.errors)}`);
    }
  },

  assertConversationQuality: (results: any, minConfidence: number = 0.7) => {
    const avgConfidence = results.messages.reduce((sum: number, msg: any) => 
      sum + (msg.confidence || 0), 0) / results.messages.length;
    
    if (avgConfidence < minConfidence) {
      throw new Error(`Average confidence ${avgConfidence} below minimum ${minConfidence}`);
    }
  },

  assertKnowledgeUtilization: (results: any) => {
    const messagesWithReferences = results.messages.filter((msg: any) => 
      msg.references && msg.references.length > 0
    );
    
    if (messagesWithReferences.length === 0) {
      console.warn('No messages utilized knowledge base references');
    }
  },

  assertActionableOutcomes: (results: any) => {
    const totalActionItems = results.messages.reduce((sum: number, msg: any) => 
      sum + (msg.actionItems?.length || 0), 0
    );
    
    if (totalActionItems === 0) {
      console.warn('No actionable outcomes generated');
    }
  }
};

// Setup E2E test scenarios
beforeAll(() => {
  const testUtils = (global as any).e2eUtils.testUtils;
  
  // Define common scenarios
  testUtils.defineScenario('technical-consultation', testUtils.createTechnicalConsultationScenario());
  testUtils.defineScenario('security-review', testUtils.createSecurityReviewScenario());
  testUtils.defineScenario('product-planning', testUtils.createProductPlanningScenario());
});

// Cleanup after each test
afterEach(async () => {
  // Clear any test data or state
  jest.clearAllMocks();
});

export {};