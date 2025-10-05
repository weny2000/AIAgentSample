/**
 * Simple integration test for Todo Progress Handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock all dependencies before importing the handler
jest.mock('../../../services/todo-progress-tracker');
jest.mock('../../../services/notification-service');

// Mock the Logger
const mockLoggerInstance = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  withContext: jest.fn(),
  context: { correlationId: 'test-correlation-id' }
};

// Make withContext return the same logger instance
mockLoggerInstance.withContext.mockReturnValue(mockLoggerInstance);

jest.mock('../../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => mockLoggerInstance)
}));

describe('Todo Progress Handler - Simple Tests', () => {
  let handler: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Dynamically import the handler after mocks are set up
    const handlerModule = await import('../todo-progress-handler');
    handler = handlerModule.handler;
  });

  const createMockEvent = (
    httpMethod: string,
    path: string,
    pathParameters?: Record<string, string>,
    body?: string,
    queryStringParameters?: Record<string, string>
  ): APIGatewayProxyEvent => ({
    httpMethod,
    path,
    pathParameters: pathParameters || null,
    body: body || null,
    queryStringParameters: queryStringParameters || null,
    headers: {
      'x-correlation-id': 'test-correlation-id',
      'x-team-id': 'test-team'
    },
    multiValueHeaders: {},
    isBase64Encoded: false,
    resource: '',
    requestContext: {} as any,
    multiValueQueryStringParameters: null,
    stageVariables: null
  });

  it('should return 400 for missing todo ID in status update', async () => {
    const event = createMockEvent(
      'PUT',
      '/todos/status',
      {},
      JSON.stringify({ status: 'in_progress', updated_by: 'user-789' })
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Todo ID is required');
    expect(responseBody.correlationId).toBe('test-correlation-id');
  });

  it('should return 400 for missing required fields in status update', async () => {
    const event = createMockEvent(
      'PUT',
      '/todos/todo-123/status',
      { todoId: 'todo-123' },
      JSON.stringify({ status: 'in_progress' }) // missing updated_by
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Status and updated_by are required');
  });

  it('should return 400 for missing task ID in progress request', async () => {
    const event = createMockEvent('GET', '/tasks/progress', {});

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Task ID is required');
  });

  it('should return 400 for missing date range in report request', async () => {
    const event = createMockEvent(
      'GET',
      '/tasks/task-123/report',
      { taskId: 'task-123' },
      null,
      { start_date: '2024-01-01' } // missing end_date
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('start_date and end_date are required');
  });

  it('should return 400 for missing triggers array', async () => {
    const event = createMockEvent(
      'POST',
      '/tasks/task-123/triggers',
      { taskId: 'task-123' },
      JSON.stringify({}) // missing triggers
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Triggers array is required');
  });

  it('should return 405 for unsupported HTTP methods', async () => {
    const event = createMockEvent('DELETE', '/tasks/task-123/progress', { taskId: 'task-123' });

    const result = await handler(event);

    expect(result.statusCode).toBe(405);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Method not allowed');
  });

  it('should return 404 for unknown endpoints', async () => {
    const event = createMockEvent('GET', '/tasks/task-123/unknown', { taskId: 'task-123' });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Endpoint not found');
  });

  it('should have proper CORS headers', async () => {
    const event = createMockEvent('GET', '/tasks/task-123/unknown', { taskId: 'task-123' });

    const result = await handler(event);

    expect(result.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
    );
  });

  it('should include correlation ID in error responses', async () => {
    const event = createMockEvent('GET', '/tasks/task-123/unknown', { taskId: 'task-123' });

    const result = await handler(event);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.correlationId).toBe('test-correlation-id');
    expect(responseBody.timestamp).toBeDefined();
    expect(responseBody.error).toBe(true);
  });
});