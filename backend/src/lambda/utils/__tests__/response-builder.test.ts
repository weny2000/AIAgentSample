import { buildSuccessResponse, buildErrorResponse, buildResponse } from '../response-builder';

describe('Response Builder', () => {
  describe('buildSuccessResponse', () => {
    it('should build a success response with data', () => {
      const data = { message: 'Success', id: 123 };
      const response = buildSuccessResponse(data);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(data);
      expect(body.timestamp).toBeDefined();
    });

    it('should build a success response with custom status code', () => {
      const data = { created: true };
      const response = buildSuccessResponse(data, 201);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(data);
    });

    it('should build a success response with null data', () => {
      const response = buildSuccessResponse(null);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    it('should build a success response with empty object', () => {
      const response = buildSuccessResponse({});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({});
    });
  });

  describe('buildErrorResponse', () => {
    it('should build an error response with all parameters', () => {
      const response = buildErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input provided', {
        field: 'email',
        reason: 'invalid format',
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input provided',
        details: {
          field: 'email',
          reason: 'invalid format',
        },
        timestamp: expect.any(String),
      });
    });

    it('should build an error response without details', () => {
      const response = buildErrorResponse(500, 'INTERNAL_ERROR', 'Something went wrong');

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Something went wrong');
      expect(body.error.details).toBeUndefined();
    });

    it('should build an error response with minimal parameters', () => {
      const response = buildErrorResponse(404, 'NOT_FOUND');

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBeUndefined();
      expect(body.error.details).toBeUndefined();
    });

    it('should handle common HTTP status codes correctly', () => {
      const testCases = [
        { status: 400, code: 'BAD_REQUEST' },
        { status: 401, code: 'UNAUTHORIZED' },
        { status: 403, code: 'FORBIDDEN' },
        { status: 404, code: 'NOT_FOUND' },
        { status: 500, code: 'INTERNAL_ERROR' },
      ];

      testCases.forEach(({ status, code }) => {
        const response = buildErrorResponse(status, code);
        expect(response.statusCode).toBe(status);
        
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe(code);
      });
    });
  });

  describe('buildResponse', () => {
    it('should build a custom response with all parameters', () => {
      const data = { custom: 'response' };
      const headers = { 'X-Custom-Header': 'custom-value' };
      
      const response = buildResponse(201, data, headers);

      expect(response.statusCode).toBe(201);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'X-Custom-Header': 'custom-value',
      });
      expect(response.body).toBe(JSON.stringify(data));
    });

    it('should build a response with default headers only', () => {
      const data = { message: 'test' };
      
      const response = buildResponse(200, data);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });
      expect(response.body).toBe(JSON.stringify(data));
    });

    it('should handle string data', () => {
      const response = buildResponse(200, 'plain text response');

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('"plain text response"');
    });

    it('should handle number data', () => {
      const response = buildResponse(200, 42);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('42');
    });

    it('should handle boolean data', () => {
      const response = buildResponse(200, true);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('true');
    });

    it('should handle null data', () => {
      const response = buildResponse(204, null);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('null');
    });

    it('should merge custom headers with default headers', () => {
      const customHeaders = {
        'X-Request-ID': 'req-123',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/xml', // Should override default
      };

      const response = buildResponse(200, {}, customHeaders);

      expect(response.headers).toEqual({
        'Content-Type': 'application/xml', // Overridden
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'X-Request-ID': 'req-123',
        'Cache-Control': 'no-cache',
      });
    });
  });

  describe('Response format consistency', () => {
    it('should ensure all responses have consistent structure', () => {
      const successResponse = buildSuccessResponse({ data: 'test' });
      const errorResponse = buildErrorResponse(400, 'ERROR');

      // Both should have the same headers structure
      expect(successResponse.headers).toHaveProperty('Content-Type');
      expect(successResponse.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(errorResponse.headers).toHaveProperty('Content-Type');
      expect(errorResponse.headers).toHaveProperty('Access-Control-Allow-Origin');

      // Both should have valid JSON bodies
      expect(() => JSON.parse(successResponse.body)).not.toThrow();
      expect(() => JSON.parse(errorResponse.body)).not.toThrow();

      // Success response should have success: true
      const successBody = JSON.parse(successResponse.body);
      expect(successBody.success).toBe(true);

      // Error response should have success: false
      const errorBody = JSON.parse(errorResponse.body);
      expect(errorBody.success).toBe(false);
    });

    it('should include timestamp in all structured responses', () => {
      const successResponse = buildSuccessResponse({ data: 'test' });
      const errorResponse = buildErrorResponse(400, 'ERROR', 'Test error');

      const successBody = JSON.parse(successResponse.body);
      const errorBody = JSON.parse(errorResponse.body);

      expect(successBody.timestamp).toBeDefined();
      expect(errorBody.error.timestamp).toBeDefined();

      // Timestamps should be valid ISO strings
      expect(() => new Date(successBody.timestamp)).not.toThrow();
      expect(() => new Date(errorBody.error.timestamp)).not.toThrow();
    });
  });
});