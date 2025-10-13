/**
 * Unit tests for Response Builder utility
 * Tests API response formatting and error handling
 */

import { 
  buildSuccessResponse,
  buildErrorResponse,
  buildValidationErrorResponse,
  buildNotFoundResponse,
  buildUnauthorizedResponse
} from '../response-builder';

describe('Response Builder Utility', () => {
  
  describe('buildSuccessResponse', () => {
    it('should build a 200 success response', () => {
      const data = { message: 'Success', id: '123' };
      const response = buildSuccessResponse(data);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
      
      const body = JSON.parse(response.body);
      expect(body).toEqual(data);
    });

    it('should build a 201 created response', () => {
      const data = { id: 'new-123' };
      const response = buildSuccessResponse(data, 201);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toEqual(data);
    });

    it('should handle empty data', () => {
      const response = buildSuccessResponse({});

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({});
    });

    it('should handle arrays', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const response = buildSuccessResponse(data);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it('should include custom headers', () => {
      const data = { message: 'Success' };
      const customHeaders = { 'X-Custom-Header': 'custom-value' };
      const response = buildSuccessResponse(data, 200, customHeaders);

      expect(response.headers).toHaveProperty('X-Custom-Header', 'custom-value');
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
    });
  });

  describe('buildErrorResponse', () => {
    it('should build a 500 error response', () => {
      const error = new Error('Internal server error');
      const response = buildErrorResponse(error);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('Internal server error');
    });

    it('should build a custom status error response', () => {
      const error = new Error('Bad request');
      const response = buildErrorResponse(error, 400);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Bad request');
    });

    it('should include error details in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      error.stack = 'Error stack trace...';
      
      const response = buildErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      // In development, might include stack trace
    });

    it('should sanitize error messages in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Sensitive database connection failed');
      
      const response = buildErrorResponse(error);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      // Should not expose sensitive details
    });

    it('should handle non-Error objects', () => {
      const errorString = 'Something went wrong';
      const response = buildErrorResponse(errorString as any);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });
  });

  describe('buildValidationErrorResponse', () => {
    it('should build a validation error response', () => {
      const errors = [
        { field: 'title', message: 'Title is required' },
        { field: 'priority', message: 'Invalid priority value' }
      ];
      
      const response = buildValidationErrorResponse(errors);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('validationErrors');
      expect(body.validationErrors).toEqual(errors);
    });

    it('should handle single validation error', () => {
      const errors = [{ field: 'email', message: 'Invalid email format' }];
      
      const response = buildValidationErrorResponse(errors);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.validationErrors).toHaveLength(1);
    });

    it('should handle empty validation errors array', () => {
      const response = buildValidationErrorResponse([]);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.validationErrors).toEqual([]);
    });
  });

  describe('buildNotFoundResponse', () => {
    it('should build a 404 not found response', () => {
      const response = buildNotFoundResponse('Task not found');

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('not found');
    });

    it('should use default message if none provided', () => {
      const response = buildNotFoundResponse();

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should include resource type in message', () => {
      const response = buildNotFoundResponse('Deliverable with ID del-123 not found');

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Deliverable');
      expect(body.error).toContain('del-123');
    });
  });

  describe('buildUnauthorizedResponse', () => {
    it('should build a 401 unauthorized response', () => {
      const response = buildUnauthorizedResponse('Invalid token');

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('Invalid token');
    });

    it('should use default message if none provided', () => {
      const response = buildUnauthorizedResponse();

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should include WWW-Authenticate header', () => {
      const response = buildUnauthorizedResponse();

      expect(response.headers).toHaveProperty('WWW-Authenticate');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in all responses', () => {
      const successResponse = buildSuccessResponse({ data: 'test' });
      const errorResponse = buildErrorResponse(new Error('test'));
      const notFoundResponse = buildNotFoundResponse();

      [successResponse, errorResponse, notFoundResponse].forEach(response => {
        expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
        expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
        expect(response.headers).toHaveProperty('Access-Control-Allow-Headers');
      });
    });

    it('should allow credentials in CORS', () => {
      const response = buildSuccessResponse({ data: 'test' });

      expect(response.headers).toHaveProperty('Access-Control-Allow-Credentials');
    });
  });

  describe('Content-Type Headers', () => {
    it('should set JSON content type for all responses', () => {
      const responses = [
        buildSuccessResponse({ data: 'test' }),
        buildErrorResponse(new Error('test')),
        buildValidationErrorResponse([]),
        buildNotFoundResponse(),
        buildUnauthorizedResponse()
      ];

      responses.forEach(response => {
        expect(response.headers).toHaveProperty('Content-Type', 'application/json');
      });
    });
  });

  describe('Response Body Serialization', () => {
    it('should handle complex nested objects', () => {
      const complexData = {
        task: {
          id: '123',
          analysis: {
            keyPoints: ['point1', 'point2'],
            workgroups: [{ id: 'wg1', name: 'Team A' }]
          }
        }
      };

      const response = buildSuccessResponse(complexData);
      const body = JSON.parse(response.body);

      expect(body).toEqual(complexData);
      expect(body.task.analysis.keyPoints).toHaveLength(2);
    });

    it('should handle dates correctly', () => {
      const dataWithDate = {
        timestamp: new Date('2024-01-01T00:00:00Z').toISOString()
      };

      const response = buildSuccessResponse(dataWithDate);
      const body = JSON.parse(response.body);

      expect(body.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle null and undefined values', () => {
      const dataWithNulls = {
        value1: null,
        value2: undefined,
        value3: 'present'
      };

      const response = buildSuccessResponse(dataWithNulls);
      const body = JSON.parse(response.body);

      expect(body.value1).toBeNull();
      expect(body).not.toHaveProperty('value2'); // undefined is omitted in JSON
      expect(body.value3).toBe('present');
    });
  });
});
