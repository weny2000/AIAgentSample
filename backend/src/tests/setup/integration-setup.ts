/**
 * Integration Test Setup
 * Configuration and utilities for integration tests
 */

import { jest } from '@jest/globals';

// Extend Jest timeout for integration tests
jest.setTimeout(60000);

// Mock AWS SDK for integration tests
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
      send: jest.fn()
    }))
  }
}));

jest.mock('@aws-sdk/client-kendra', () => ({
  KendraClient: jest.fn(),
  QueryCommand: jest.fn(),
  SubmitFeedbackCommand: jest.fn()
}));

// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_NAME = 'test-agent-system';
process.env.KENDRA_INDEX_ID = 'test-kendra-index';

// Global test utilities
(global as any).testUtils = {
  createMockSession: () => ({
    sessionId: `test-session-${Date.now()}`,
    userId: 'test-user',
    teamId: 'test-team',
    personaId: 'test-persona',
    startTime: new Date(),
    lastActivity: new Date(),
    context: {
      conversationId: `conv-${Date.now()}`,
      messages: [],
      relatedArtifacts: [],
      referencedPolicies: [],
      actionItems: []
    },
    metadata: {
      sessionQuality: 1.0
    }
  }),

  createMockMessage: (role: 'user' | 'agent' = 'user', content: string = 'Test message') => ({
    messageId: `msg-${Date.now()}`,
    role,
    content,
    timestamp: new Date(),
    metadata: {}
  }),

  createMockPersona: (overrides: any = {}) => ({
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona for integration tests',
    team_id: 'test-team',
    communication_style: 'professional',
    decision_making_style: 'collaborative',
    escalation_criteria: [],
    custom_instructions: 'Provide helpful responses',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  })
};

// Setup console logging for integration tests
const originalConsole = console;
(global as any).console = {
  ...originalConsole,
  log: jest.fn((...args) => {
    if (process.env.VERBOSE_TESTS === 'true') {
      originalConsole.log(...args);
    }
  }),
  error: jest.fn((...args) => {
    originalConsole.error(...args);
  }),
  warn: jest.fn((...args) => {
    if (process.env.VERBOSE_TESTS === 'true') {
      originalConsole.warn(...args);
    }
  })
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

export {};