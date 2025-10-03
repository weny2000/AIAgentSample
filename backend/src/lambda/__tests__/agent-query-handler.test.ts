import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../handlers/agent-query-handler';

// Mock AWS SDK
jest.mock('@aws-sdk/client-kendra');
jest.mock('@aws-sdk/lib-dynamodb');

// Mock environment variables
process.env.KENDRA_INDEX_ID = 'test-kendra-index';
process.env.TEAM_ROSTER_TABLE = 'test-team-roster-table';
process.env.AUDIT_LOG_TABLE = 'test-audit-log-table';
process.env.AWS_REGION = 'us-east-1';

describe('Agent Query Handler', () => {
  const mockEvent: Partial<APIGatewayProxyEvent> = {
    httpMethod: 'POST',
    path: '/agent/query',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': 'test-correlation-id',
    },
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-id',
          team_id: 'test-team-id',
          role: 'developer',
          department: 'engineering',
          clearance: 'standard',
          permissions: 'agent-query,read',
        },
      },
    } as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 when request body is missing', async () => {
    const event = {
      ...mockEvent,
      body: null,
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
    expect(body.message).toBe('Request body is required');
  });

  it('should return 400 when request body is invalid JSON', async () => {
    const event = {
      ...mockEvent,
      body: 'invalid json',
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
    expect(body.message).toBe('Invalid JSON in request body');
  });

  it('should return 400 when required fields are missing', async () => {
    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our coding standard?',
        // Missing userId and teamId
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
    expect(body.message).toBe('Missing required fields');
    expect(body.details.missingFields).toContain('userId');
    expect(body.details.missingFields).toContain('teamId');
  });

  it('should return 403 when user cannot access team', async () => {
    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our coding standard?',
        userId: 'test-user-id',
        teamId: 'different-team-id', // Different from user's team
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'test-user-id',
            team_id: 'test-team-id',
            role: 'developer',
            department: 'engineering',
            clearance: 'standard',
            permissions: 'agent-query,read', // No cross-team-access permission
          },
        },
      } as any,
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('FORBIDDEN');
    expect(body.message).toBe('Access denied to team resources');
  });

  it('should process query and return agent response with no sources', async () => {
    // Mock DynamoDB calls
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn()
      .mockResolvedValueOnce({ Item: { leader_persona_id: 'supportive' } }) // Team info
      .mockResolvedValueOnce({}); // Audit log write

    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    // Mock Kendra call to return no results
    const { KendraClient } = require('@aws-sdk/client-kendra');
    const mockKendraSend = jest.fn().mockResolvedValue({ ResultItems: [] });
    KendraClient.mockImplementation(() => ({ send: mockKendraSend }));

    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our coding standard?',
        userId: 'test-user-id',
        teamId: 'test-team-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response).toContain("I don't have enough information");
    expect(body.confidence).toBe(0.1);
    expect(body.sources).toHaveLength(0);
    expect(body.personaUsed).toBe('supportive');
    expect(body.escalationRequired).toBe(true);
    expect(body.followUpQuestions).toBeDefined();
  });

  it('should process query and return agent response with sources', async () => {
    // Mock DynamoDB calls
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn()
      .mockResolvedValueOnce({ Item: { leader_persona_id: 'analytical' } }) // Team info
      .mockResolvedValueOnce({}); // Audit log write

    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    // Mock Kendra call to return results
    const { KendraClient } = require('@aws-sdk/client-kendra');
    const mockKendraSend = jest.fn().mockResolvedValue({
      ResultItems: [
        {
          Id: 'doc-1',
          Type: 'DOCUMENT',
          DocumentExcerpt: { Text: 'Our coding standard requires TypeScript for all new projects.' },
          DocumentURI: 'https://wiki.company.com/coding-standards',
          ScoreAttributes: { ScoreConfidence: 'HIGH' },
        },
        {
          Id: 'doc-2',
          Type: 'DOCUMENT',
          DocumentExcerpt: { Text: 'Use ESLint with our custom configuration for code quality.' },
          DocumentURI: 'https://wiki.company.com/eslint-config',
          ScoreAttributes: { ScoreConfidence: 'MEDIUM' },
        },
      ],
    });
    KendraClient.mockImplementation(() => ({ send: mockKendraSend }));

    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our coding standard?',
        userId: 'test-user-id',
        teamId: 'test-team-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response).toContain('Based on multiple sources');
    expect(body.confidence).toBe(0.8);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0].sourceId).toBe('doc-1');
    expect(body.sources[0].confidenceScore).toBe(0.85); // HIGH confidence
    expect(body.sources[1].confidenceScore).toBe(0.65); // MEDIUM confidence
    expect(body.personaUsed).toBe('analytical');
    expect(body.escalationRequired).toBe(false);
  });

  it('should handle escalation keywords', async () => {
    // Mock DynamoDB calls
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn()
      .mockResolvedValueOnce({ Item: { leader_persona_id: 'direct' } }) // Team info
      .mockResolvedValueOnce({}); // Audit log write

    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    // Mock Kendra call to return results
    const { KendraClient } = require('@aws-sdk/client-kendra');
    const mockKendraSend = jest.fn().mockResolvedValue({
      ResultItems: [
        {
          Id: 'doc-1',
          Type: 'DOCUMENT',
          DocumentExcerpt: { Text: 'Budget allocation requires manager approval.' },
          DocumentURI: 'https://wiki.company.com/budget-policy',
          ScoreAttributes: { ScoreConfidence: 'HIGH' },
        },
      ],
    });
    KendraClient.mockImplementation(() => ({ send: mockKendraSend }));

    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our budget for the new project?', // Contains escalation keyword 'budget'
        userId: 'test-user-id',
        teamId: 'test-team-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.escalationRequired).toBe(true);
    expect(body.escalationReason).toBe('Insufficient information or complex decision required');
    expect(body.personaUsed).toBe('direct');
  });

  it('should use default persona when team info is not available', async () => {
    // Mock DynamoDB calls
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn()
      .mockResolvedValueOnce({ Item: null }) // No team info
      .mockResolvedValueOnce({}); // Audit log write

    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    // Mock Kendra call
    const { KendraClient } = require('@aws-sdk/client-kendra');
    const mockKendraSend = jest.fn().mockResolvedValue({ ResultItems: [] });
    KendraClient.mockImplementation(() => ({ send: mockKendraSend }));

    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our coding standard?',
        userId: 'test-user-id',
        teamId: 'test-team-id',
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.personaUsed).toBe('default');
  });

  it('should handle missing authorization context', async () => {
    const event = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'What is our coding standard?',
        userId: 'test-user-id',
        teamId: 'test-team-id',
      }),
      requestContext: {
        // Missing authorizer context
      } as any,
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('UNAUTHORIZED');
  });
});