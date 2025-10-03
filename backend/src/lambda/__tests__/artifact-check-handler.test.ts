import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../handlers/artifact-check-handler';
import { ResponseBuilder } from '../utils/response-builder';

// Mock AWS SDK
jest.mock('@aws-sdk/client-sqs');
jest.mock('@aws-sdk/lib-dynamodb');

// Mock environment variables
process.env.ARTIFACT_CHECK_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
process.env.JOB_STATUS_TABLE = 'test-job-status-table';
process.env.AWS_REGION = 'us-east-1';

describe('Artifact Check Handler', () => {
  const mockEvent: Partial<APIGatewayProxyEvent> = {
    httpMethod: 'POST',
    path: '/agent/check',
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
        artifactType: 'code',
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

  it('should return 400 when neither artifactContent nor artifactUrl is provided', async () => {
    const event = {
      ...mockEvent,
      body: JSON.stringify({
        artifactType: 'code',
        userId: 'test-user-id',
        teamId: 'test-team-id',
        // Missing both artifactContent and artifactUrl
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
    expect(body.message).toBe('Either artifactContent or artifactUrl must be provided');
  });

  it('should return 403 when user cannot access team', async () => {
    const event = {
      ...mockEvent,
      body: JSON.stringify({
        artifactType: 'code',
        userId: 'test-user-id',
        teamId: 'different-team-id', // Different from user's team
        artifactContent: 'console.log("hello");',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'test-user-id',
            team_id: 'test-team-id',
            role: 'developer',
            department: 'engineering',
            clearance: 'standard',
            permissions: 'artifact-check,read', // No cross-team-access permission
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

  it('should handle missing authorization context', async () => {
    const event = {
      ...mockEvent,
      body: JSON.stringify({
        artifactType: 'code',
        userId: 'test-user-id',
        teamId: 'test-team-id',
        artifactContent: 'console.log("hello");',
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

describe('ResponseBuilder', () => {
  it('should create success response', () => {
    const data = { message: 'success' };
    const result = ResponseBuilder.success(data, 201);

    expect(result.statusCode).toBe(201);
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(result.body)).toEqual(data);
  });

  it('should create error response with correlation ID', () => {
    const result = ResponseBuilder.error('TEST_ERROR', 'Test error message', 400, { detail: 'test' }, 'test-correlation');

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('TEST_ERROR');
    expect(body.message).toBe('Test error message');
    expect(body.details).toEqual({ detail: 'test' });
    expect(body.correlationId).toBe('test-correlation');
  });

  it('should create bad request response', () => {
    const result = ResponseBuilder.badRequest('Invalid input');

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
    expect(body.message).toBe('Invalid input');
  });

  it('should create unauthorized response', () => {
    const result = ResponseBuilder.unauthorized();

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('UNAUTHORIZED');
    expect(body.message).toBe('Unauthorized');
  });

  it('should create forbidden response', () => {
    const result = ResponseBuilder.forbidden();

    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('FORBIDDEN');
    expect(body.message).toBe('Forbidden');
  });

  it('should create not found response', () => {
    const result = ResponseBuilder.notFound();

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('NOT_FOUND');
    expect(body.message).toBe('Resource not found');
  });

  it('should create internal error response', () => {
    const result = ResponseBuilder.internalError();

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.errorCode).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Internal server error');
  });
});