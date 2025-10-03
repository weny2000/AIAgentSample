import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler, batchAnalysisHandler } from '../impact-analysis-handler.js';
import { ImpactAnalysisService } from '../../../services/impact-analysis-service.js';
import { DatabaseConnection } from '../../../database/connection.js';

// Mock dependencies
jest.mock('../../../services/impact-analysis-service.js');
jest.mock('../../../database/connection.js');
jest.mock('../../utils/auth-utils.js');
jest.mock('../../utils/logger.js');

import { extractUserFromEvent } from '../../utils/auth-utils.js';
import { logger } from '../../utils/logger.js';

const mockExtractUserFromEvent = extractUserFromEvent as jest.MockedFunction<typeof extractUserFromEvent>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Impact Analysis Handler', () => {
  let mockDb: jest.Mocked<DatabaseConnection>;
  let mockService: jest.Mocked<ImpactAnalysisService>;

  const mockUser = {
    sub: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockImpactAnalysis = {
    service_id: 'service-1',
    service_name: 'Test Service',
    team_id: 'team-alpha',
    analysis_type: 'full' as const,
    affected_services: [
      {
        service_id: 'service-2',
        service_name: 'Dependent Service',
        team_id: 'team-beta',
        depth: 1,
        path: ['service-1', 'service-2'],
        criticality: 'high' as const,
        impact_type: 'direct' as const,
        dependency_types: ['downstream'],
        estimated_impact_score: 75
      }
    ],
    risk_assessment: {
      overall_risk_level: 'medium' as const,
      risk_factors: [],
      cross_team_impact_count: 1,
      critical_path_services: [],
      business_impact_estimate: 'Medium business impact'
    },
    stakeholders: [
      {
        team_id: 'team-beta',
        contact_info: ['team-beta@example.com'],
        role: 'dependent' as const,
        priority: 'high' as const
      }
    ],
    mitigation_strategies: [],
    visualization_data: {
      nodes: [],
      edges: [],
      clusters: [],
      layout_hints: {}
    }
  };

  beforeEach(() => {
    mockDb = new DatabaseConnection() as jest.Mocked<DatabaseConnection>;
    mockService = new ImpactAnalysisService(mockDb) as jest.Mocked<ImpactAnalysisService>;

    mockDb.connect = jest.fn().mockResolvedValue(undefined);
    mockDb.disconnect = jest.fn().mockResolvedValue(undefined);

    mockExtractUserFromEvent.mockReturnValue(mockUser);
    mockLogger.setCorrelationId = jest.fn();
    mockLogger.getCorrelationId = jest.fn().mockReturnValue('correlation-123');
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();

    // Mock the service constructor to return our mock
    (ImpactAnalysisService as jest.MockedClass<typeof ImpactAnalysisService>).mockImplementation(() => mockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /impact-analysis', () => {
    const createEvent = (body: any): APIGatewayProxyEvent => ({
      httpMethod: 'POST',
      path: '/impact-analysis',
      pathParameters: null,
      queryStringParameters: null,
      headers: {},
      body: JSON.stringify(body),
      requestContext: {
        requestId: 'test-request-id'
      } as any,
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      resource: '',
      stageVariables: null
    });

    it('should analyze impact successfully', async () => {
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);

      const event = createEvent({
        service_id: 'service-1',
        analysis_type: 'full',
        max_depth: 3
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockImpactAnalysis);
      expect(body.metadata.analyzed_by).toBe('user-123');

      expect(mockService.analyzeImpact).toHaveBeenCalledWith('service-1', 'full', 3);
    });

    it('should use default values for optional parameters', async () => {
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);

      const event = createEvent({
        service_id: 'service-1'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.analyzeImpact).toHaveBeenCalledWith('service-1', 'full', 3);
    });

    it('should return 400 for missing service_id', async () => {
      const event = createEvent({
        analysis_type: 'full'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('service_id is required');
    });

    it('should return 400 for invalid analysis_type', async () => {
      const event = createEvent({
        service_id: 'service-1',
        analysis_type: 'invalid'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('analysis_type must be one of: downstream, upstream, full');
    });

    it('should return 400 for invalid max_depth', async () => {
      const event = createEvent({
        service_id: 'service-1',
        max_depth: 15
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('max_depth must be between 1 and 10');
    });

    it('should return 404 for non-existent service', async () => {
      mockService.analyzeImpact.mockRejectedValue(new Error('Service not found: non-existent'));

      const event = createEvent({
        service_id: 'non-existent'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('SERVICE_NOT_FOUND');
    });

    it('should return 401 for unauthenticated request', async () => {
      mockExtractUserFromEvent.mockReturnValue(null);

      const event = createEvent({
        service_id: 'service-1'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('UNAUTHORIZED');
    });

    it('should handle service errors gracefully', async () => {
      mockService.analyzeImpact.mockRejectedValue(new Error('Database connection failed'));

      const event = createEvent({
        service_id: 'service-1'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('ANALYSIS_ERROR');
    });
  });

  describe('GET /impact-analysis/{serviceId}', () => {
    const createGetEvent = (serviceId: string, queryParams?: Record<string, string>): APIGatewayProxyEvent => ({
      httpMethod: 'GET',
      path: `/impact-analysis/${serviceId}`,
      pathParameters: { serviceId },
      queryStringParameters: queryParams || null,
      headers: {},
      body: null,
      requestContext: {
        requestId: 'test-request-id'
      } as any,
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      resource: '',
      stageVariables: null
    });

    it('should get impact analysis successfully', async () => {
      mockService.getCachedAnalysis.mockResolvedValue(null);
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);
      mockService.cacheAnalysis.mockResolvedValue(undefined);

      const event = createGetEvent('service-1');

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockImpactAnalysis);
      expect(body.metadata.cached).toBe(false);

      expect(mockService.getCachedAnalysis).toHaveBeenCalledWith('service-1', 'full');
      expect(mockService.analyzeImpact).toHaveBeenCalledWith('service-1', 'full', 3);
      expect(mockService.cacheAnalysis).toHaveBeenCalledWith(mockImpactAnalysis);
    });

    it('should return cached analysis when available', async () => {
      mockService.getCachedAnalysis.mockResolvedValue(mockImpactAnalysis);

      const event = createGetEvent('service-1');

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockImpactAnalysis);
      expect(body.metadata.cached).toBe(true);

      expect(mockService.getCachedAnalysis).toHaveBeenCalledWith('service-1', 'full');
      expect(mockService.analyzeImpact).not.toHaveBeenCalled();
    });

    it('should skip cache when use_cache=false', async () => {
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);

      const event = createGetEvent('service-1', { use_cache: 'false' });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.getCachedAnalysis).not.toHaveBeenCalled();
      expect(mockService.analyzeImpact).toHaveBeenCalledWith('service-1', 'full', 3);
    });

    it('should use query parameters for analysis options', async () => {
      mockService.getCachedAnalysis.mockResolvedValue(null);
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);

      const event = createGetEvent('service-1', {
        analysis_type: 'downstream',
        max_depth: '2'
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.analyzeImpact).toHaveBeenCalledWith('service-1', 'downstream', 2);
    });

    it('should return 400 for empty service ID', async () => {
      const event = createGetEvent('');

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Batch Analysis Handler', () => {
    const createBatchEvent = (body: any): APIGatewayProxyEvent => ({
      httpMethod: 'POST',
      path: '/impact-analysis/batch',
      pathParameters: null,
      queryStringParameters: null,
      headers: {},
      body: JSON.stringify(body),
      requestContext: {
        requestId: 'test-request-id'
      } as any,
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      resource: '',
      stageVariables: null
    });

    it('should perform batch analysis successfully', async () => {
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);

      const event = createBatchEvent({
        service_ids: ['service-1', 'service-2'],
        analysis_type: 'full',
        max_depth: 3
      });

      const result: APIGatewayProxyResult = await batchAnalysisHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.successful_analyses).toHaveLength(2);
      expect(body.data.failed_analyses).toHaveLength(0);
      expect(body.data.summary.total_requested).toBe(2);
      expect(body.data.summary.successful_count).toBe(2);
      expect(body.data.summary.failed_count).toBe(0);

      expect(mockService.analyzeImpact).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch analysis', async () => {
      mockService.analyzeImpact
        .mockResolvedValueOnce(mockImpactAnalysis)
        .mockRejectedValueOnce(new Error('Service not found'));

      const event = createBatchEvent({
        service_ids: ['service-1', 'non-existent'],
        analysis_type: 'full'
      });

      const result: APIGatewayProxyResult = await batchAnalysisHandler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.successful_analyses).toHaveLength(1);
      expect(body.data.failed_analyses).toHaveLength(1);
      expect(body.data.failed_analyses[0].service_id).toBe('non-existent');
      expect(body.data.failed_analyses[0].error).toBe('Service not found');
    });

    it('should return 400 for missing service_ids', async () => {
      const event = createBatchEvent({
        analysis_type: 'full'
      });

      const result: APIGatewayProxyResult = await batchAnalysisHandler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('service_ids array is required');
    });

    it('should return 400 for too many services', async () => {
      const event = createBatchEvent({
        service_ids: Array.from({ length: 15 }, (_, i) => `service-${i}`)
      });

      const result: APIGatewayProxyResult = await batchAnalysisHandler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Maximum 10 services can be analyzed at once');
    });

    it('should return 401 for unauthenticated request', async () => {
      mockExtractUserFromEvent.mockReturnValue(null);

      const event = createBatchEvent({
        service_ids: ['service-1']
      });

      const result: APIGatewayProxyResult = await batchAnalysisHandler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('UNAUTHORIZED');
    });
  });

  describe('Method Not Allowed', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'DELETE',
        path: '/impact-analysis',
        pathParameters: null,
        queryStringParameters: null,
        headers: {},
        body: null,
        requestContext: {
          requestId: 'test-request-id'
        } as any,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        resource: '',
        stageVariables: null
      };

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error_code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  describe('Database Connection', () => {
    it('should properly connect and disconnect from database', async () => {
      mockService.analyzeImpact.mockResolvedValue(mockImpactAnalysis);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/impact-analysis',
        pathParameters: null,
        queryStringParameters: null,
        headers: {},
        body: JSON.stringify({ service_id: 'service-1' }),
        requestContext: {
          requestId: 'test-request-id'
        } as any,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        resource: '',
        stageVariables: null
      };

      await handler(event);

      expect(mockDb.connect).toHaveBeenCalledTimes(1);
      expect(mockDb.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should disconnect even when service throws error', async () => {
      mockService.analyzeImpact.mockRejectedValue(new Error('Service error'));

      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/impact-analysis',
        pathParameters: null,
        queryStringParameters: null,
        headers: {},
        body: JSON.stringify({ service_id: 'service-1' }),
        requestContext: {
          requestId: 'test-request-id'
        } as any,
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        resource: '',
        stageVariables: null
      };

      await handler(event);

      expect(mockDb.connect).toHaveBeenCalledTimes(1);
      expect(mockDb.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});