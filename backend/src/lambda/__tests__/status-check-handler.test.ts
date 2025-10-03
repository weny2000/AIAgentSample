import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../handlers/status-check-handler';

// Mock AWS SDK
jest.mock('@aws-sdk/lib-dynamodb');

// Mock environment variables
process.env.JOB_STATUS_TABLE = 'test-job-status-table';
process.env.AWS_REGION = 'us-east-1';

describe('Status Check Handler', () => {
  const mockEvent: Partial<APIGatewayProxyEvent> = {
    httpMethod: 'GET',
    path: '/agent/status/test-job-id',
    pathParameters: {
      jobId: 'test-job-id',
    },
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
          permissions: 'artifact-check,read',
        },
      },
    } as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 when job ID is missing from path', async () => {
    const event = {
      ...mockEvent,
      pathParameters: null,
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
    expect(body.message).toBe('Job ID is required in path');
  });

  it('should return 404 when job is not found', async () => {
    // Mock DynamoDB to return empty result
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({ Item: null });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const event = mockEvent as APIGatewayProxyEvent;
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('NOT_FOUND');
    expect(body.message).toBe('Job not found');
  });

  it('should return 403 when user cannot access job', async () => {
    // Mock DynamoDB to return job owned by different user/team
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({
      Item: {
        jobId: 'test-job-id',
        userId: 'different-user-id',
        teamId: 'different-team-id',
        status: 'completed',
        progress: 100,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:05:00Z',
      },
    });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const event = mockEvent as APIGatewayProxyEvent;
    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('FORBIDDEN');
    expect(body.message).toBe('Access denied to this job');
  });

  it('should return job status when user has access', async () => {
    // Mock DynamoDB to return job owned by the user
    const mockJobItem = {
      jobId: 'test-job-id',
      userId: 'test-user-id',
      teamId: 'test-team-id',
      status: 'processing',
      progress: 50,
      currentStep: 'static-analysis',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:02:30Z',
    };

    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({ Item: mockJobItem });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const event = mockEvent as APIGatewayProxyEvent;
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.jobId).toBe('test-job-id');
    expect(body.status).toBe('processing');
    expect(body.progress).toBe(50);
    expect(body.currentStep).toBe('static-analysis');
    expect(body.createdAt).toBe('2023-01-01T00:00:00Z');
    expect(body.updatedAt).toBe('2023-01-01T00:02:30Z');
  });

  it('should set appropriate cache headers for completed jobs', async () => {
    // Mock DynamoDB to return completed job
    const mockJobItem = {
      jobId: 'test-job-id',
      userId: 'test-user-id',
      teamId: 'test-team-id',
      status: 'completed',
      progress: 100,
      result: {
        complianceScore: 85,
        issues: [],
        recommendations: ['Consider adding more comments'],
        sourceReferences: [],
        summary: 'Code quality is good',
      },
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:05:00Z',
    };

    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({ Item: mockJobItem });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const event = mockEvent as APIGatewayProxyEvent;
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toBe('public, max-age=300');
    
    const body = JSON.parse(result.body);
    expect(body.status).toBe('completed');
    expect(body.result).toBeDefined();
    expect(body.result.complianceScore).toBe(85);
  });

  it('should set no-cache headers for in-progress jobs', async () => {
    // Mock DynamoDB to return in-progress job
    const mockJobItem = {
      jobId: 'test-job-id',
      userId: 'test-user-id',
      teamId: 'test-team-id',
      status: 'processing',
      progress: 30,
      currentStep: 'semantic-analysis',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:01:30Z',
    };

    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    const mockSend = jest.fn().mockResolvedValue({ Item: mockJobItem });
    DynamoDBDocumentClient.from = jest.fn().mockReturnValue({ send: mockSend });

    const event = mockEvent as APIGatewayProxyEvent;
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toBe('no-cache, no-store, must-revalidate');
    
    const body = JSON.parse(result.body);
    expect(body.status).toBe('processing');
    expect(body.progress).toBe(30);
    expect(body.currentStep).toBe('semantic-analysis');
  });

  it('should handle missing authorization context', async () => {
    const event = {
      ...mockEvent,
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