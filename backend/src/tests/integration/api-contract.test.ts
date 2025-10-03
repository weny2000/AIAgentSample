import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { artifactCheckHandler } from '../../lambda/handlers/artifact-check-handler';
import { statusCheckHandler } from '../../lambda/handlers/status-check-handler';
import { agentQueryHandler } from '../../lambda/handlers/agent-query-handler';
import { personaManagementHandler } from '../../lambda/handlers/persona-management-handler';

describe('API Contract Validation', () => {
  describe('POST /agent/check', () => {
    it('should validate artifact check request schema', async () => {
      const validRequest: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/agent/check',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          artifact_type: 'cloudformation',
          content: 'AWSTemplateFormatVersion: "2010-09-09"',
          team_id: 'team-123',
          user_id: 'user-456'
        }),
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {
          requestId: 'test-request-id',
          stage: 'test',
          httpMethod: 'POST',
          path: '/agent/check',
          protocol: 'HTTP/1.1',
          resourcePath: '/agent/check',
          accountId: '123456789012',
          apiId: 'test-api',
          identity: {
            sourceIp: '127.0.0.1',
            userAgent: 'test-agent'
          }
        } as any,
        resource: '/agent/check',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await artifactCheckHandler(validRequest, {} as any);
      const response = JSON.parse(result.body);

      expect(result.statusCode).toBe(202);
      expect(response).toHaveProperty('job_id');
      expect(response).toHaveProperty('status', 'queued');
      expect(response).toHaveProperty('estimated_completion_time');
    });

    it('should reject invalid artifact type', async () => {
      const invalidRequest: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/agent/check',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact_type: 'invalid-type',
          content: 'some content'
        }),
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/agent/check',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await artifactCheckHandler(invalidRequest, {} as any);
      
      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response).toHaveProperty('error_code', 'INVALID_ARTIFACT_TYPE');
    });

    it('should require authentication', async () => {
      const unauthenticatedRequest: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/agent/check',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact_type: 'cloudformation',
          content: 'valid content'
        }),
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/agent/check',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await artifactCheckHandler(unauthenticatedRequest, {} as any);
      
      expect(result.statusCode).toBe(401);
    });
  });

  describe('GET /agent/status/{jobId}', () => {
    it('should return job status with valid format', async () => {
      const request: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/agent/status/job-123',
        headers: { 'Authorization': 'Bearer valid-token' },
        body: null,
        pathParameters: { jobId: 'job-123' },
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/agent/status/{jobId}',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await statusCheckHandler(request, {} as any);
      const response = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(response).toHaveProperty('job_id');
      expect(response).toHaveProperty('status');
      expect(['queued', 'processing', 'completed', 'failed']).toContain(response.status);
      
      if (response.status === 'completed') {
        expect(response).toHaveProperty('results');
        expect(response.results).toHaveProperty('compliance_score');
        expect(response.results).toHaveProperty('issues');
        expect(response.results).toHaveProperty('recommendations');
      }
    });

    it('should return 404 for non-existent job', async () => {
      const request: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/agent/status/non-existent-job',
        headers: { 'Authorization': 'Bearer valid-token' },
        body: null,
        pathParameters: { jobId: 'non-existent-job' },
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/agent/status/{jobId}',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await statusCheckHandler(request, {} as any);
      
      expect(result.statusCode).toBe(404);
    });
  });

  describe('POST /agent/query', () => {
    it('should handle agent query with persona context', async () => {
      const request: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/agent/query',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          query: 'What are the deployment best practices for our team?',
          context: {
            team_id: 'team-123',
            persona_id: 'leader-456'
          }
        }),
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/agent/query',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await agentQueryHandler(request, {} as any);
      const response = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(response).toHaveProperty('response');
      expect(response).toHaveProperty('sources');
      expect(response).toHaveProperty('confidence_score');
      expect(response.confidence_score).toBeGreaterThanOrEqual(0);
      expect(response.confidence_score).toBeLessThanOrEqual(1);
    });
  });

  describe('Admin Endpoints', () => {
    it('should validate persona management operations', async () => {
      const createPersonaRequest: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/admin/persona',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin-token'
        },
        body: JSON.stringify({
          name: 'Test Leader',
          leadership_style: 'collaborative',
          decision_patterns: ['data-driven', 'team-consensus'],
          escalation_criteria: ['budget-impact', 'security-risk']
        }),
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/admin/persona',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await personaManagementHandler(createPersonaRequest, {} as any);
      const response = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(response).toHaveProperty('persona_id');
      expect(response).toHaveProperty('version');
    });

    it('should require admin privileges for persona management', async () => {
      const unauthorizedRequest: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/admin/persona',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer user-token'
        },
        body: JSON.stringify({
          name: 'Test Leader'
        }),
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/admin/persona',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await personaManagementHandler(unauthorizedRequest, {} as any);
      
      expect(result.statusCode).toBe(403);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format across all endpoints', async () => {
      const invalidRequest: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/agent/check',
        headers: {},
        body: 'invalid-json',
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {} as any,
        resource: '/agent/check',
        stageVariables: null,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await artifactCheckHandler(invalidRequest, {} as any);
      const response = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(response).toHaveProperty('error_code');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('correlation_id');
      expect(typeof response.error_code).toBe('string');
      expect(typeof response.message).toBe('string');
      expect(typeof response.correlation_id).toBe('string');
    });
  });
});