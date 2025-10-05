import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler, batchQualityCheckHandler } from '../quality-assessment-handler';
import { QualityAssessmentEngine } from '../../../services/quality-assessment-engine';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock dependencies
jest.mock('../../../services/quality-assessment-engine');
jest.mock('../../../lambda/utils/logger');

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('Quality Assessment Handler', () => {
  let mockQualityEngine: jest.Mocked<QualityAssessmentEngine>;

  const mockDeliverable = {
    deliverable_id: 'test-deliverable-1',
    todo_id: 'test-todo-1',
    file_name: 'test-file.ts',
    file_type: 'code',
    file_size: 1024,
    s3_key: 'deliverables/test-todo-1/test-deliverable-1/test-file.ts',
    submitted_by: 'test-user',
    submitted_at: '2024-01-01T00:00:00Z',
    status: 'submitted'
  };

  const mockQualityResult = {
    overall_score: 85,
    quality_dimensions: [
      {
        dimension: 'format' as const,
        score: 90,
        weight: 0.2,
        details: 'Format validation passed'
      },
      {
        dimension: 'completeness' as const,
        score: 80,
        weight: 0.25,
        details: 'Good documentation coverage'
      }
    ],
    improvement_suggestions: ['Consider adding more unit tests'],
    compliance_status: {
      is_compliant: true,
      standards_checked: ['coding-standards'],
      violations: []
    },
    assessed_at: '2024-01-01T00:00:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dynamoMock.reset();

    // Mock QualityAssessmentEngine
    mockQualityEngine = {
      performQualityAssessment: jest.fn(),
      getAvailableQualityStandards: jest.fn(),
      getQualityDimensionConfig: jest.fn(),
      validateQualityStandardConfig: jest.fn()
    } as any;

    // Mock the constructor to return our mock
    (QualityAssessmentEngine as jest.Mock).mockImplementation(() => mockQualityEngine);
  });

  describe('POST /quality-check', () => {
    it('should perform quality check successfully', async () => {
      // Mock DynamoDB responses
      dynamoMock.on(require('@aws-sdk/lib-dynamodb').GetCommand).resolves({
        Item: mockDeliverable
      });

      dynamoMock.on(require('@aws-sdk/lib-dynamodb').UpdateCommand).resolves({});

      // Mock quality engine
      mockQualityEngine.performQualityAssessment.mockResolvedValue(mockQualityResult);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/deliverables/test-deliverable-1/quality-check',
        pathParameters: {
          deliverableId: 'test-deliverable-1'
        },
        body: JSON.stringify({
          qualityStandards: ['coding-standards', 'security-standards'],
          teamId: 'test-team'
        }),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.deliverable_id).toBe('test-deliverable-1');
      expect(responseBody.quality_assessment).toEqual(mockQualityResult);

      // Verify quality engine was called correctly
      expect(mockQualityEngine.performQualityAssessment).toHaveBeenCalledWith(
        mockDeliverable,
        ['coding-standards', 'security-standards'],
        {
          teamId: 'test-team',
          projectContext: undefined
        }
      );
    });

    it('should return 404 when deliverable not found', async () => {
      dynamoMock.on(require('@aws-sdk/lib-dynamodb').GetCommand).resolves({
        Item: undefined
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/deliverables/nonexistent/quality-check',
        pathParameters: {
          deliverableId: 'nonexistent'
        },
        body: JSON.stringify({}),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Not Found');
      expect(responseBody.message).toBe('Deliverable not found');
    });

    it('should return 400 when deliverable ID is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/deliverables//quality-check',
        pathParameters: {},
        body: JSON.stringify({}),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad Request');
      expect(responseBody.message).toBe('Deliverable ID is required');
    });

    it('should handle quality assessment failures', async () => {
      dynamoMock.on(require('@aws-sdk/lib-dynamodb').GetCommand).resolves({
        Item: mockDeliverable
      });

      mockQualityEngine.performQualityAssessment.mockRejectedValue(
        new Error('Quality assessment failed')
      );

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/deliverables/test-deliverable-1/quality-check',
        pathParameters: {
          deliverableId: 'test-deliverable-1'
        },
        body: JSON.stringify({}),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Internal Server Error');
      expect(responseBody.message).toBe('Quality check failed');
    });
  });

  describe('GET /quality-standards', () => {
    it('should return quality standards for file type', async () => {
      mockQualityEngine.getAvailableQualityStandards.mockReturnValue([
        'coding-standards',
        'security-standards',
        'team-conventions'
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/quality-standards',
        queryStringParameters: {
          fileType: 'code'
        },
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.file_type).toBe('code');
      expect(responseBody.quality_standards).toEqual([
        'coding-standards',
        'security-standards',
        'team-conventions'
      ]);

      expect(mockQualityEngine.getAvailableQualityStandards).toHaveBeenCalledWith('code');
    });

    it('should return 400 when file type is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/quality-standards',
        queryStringParameters: {},
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Bad Request');
      expect(responseBody.message).toBe('File type parameter is required');
    });
  });

  describe('GET /quality-dimensions', () => {
    it('should return quality dimensions for file type', async () => {
      const mockDimensions = [
        {
          dimension: 'format' as const,
          weight: 0.2,
          minimumScore: 80,
          checks: []
        },
        {
          dimension: 'completeness' as const,
          weight: 0.25,
          minimumScore: 70,
          checks: []
        }
      ];

      mockQualityEngine.getQualityDimensionConfig.mockReturnValue(mockDimensions);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/quality-dimensions',
        queryStringParameters: {
          fileType: 'code'
        },
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.file_type).toBe('code');
      expect(responseBody.quality_dimensions).toEqual(mockDimensions);

      expect(mockQualityEngine.getQualityDimensionConfig).toHaveBeenCalledWith('code');
    });
  });

  describe('POST /validate-config', () => {
    it('should validate quality standard configuration', async () => {
      const mockConfig = {
        fileTypes: ['.ts', '.js'],
        dimensions: [
          {
            dimension: 'format',
            weight: 1.0,
            minimumScore: 70,
            checks: [
              {
                name: 'syntax',
                type: 'static_analysis',
                weight: 1.0,
                config: {}
              }
            ]
          }
        ],
        complianceRules: ['coding-standards'],
        scoringWeights: {
          staticAnalysis: 0.4,
          semanticValidation: 0.3,
          formatCompliance: 0.2,
          contentQuality: 0.1
        },
        improvementThresholds: {
          excellent: 90,
          good: 70,
          acceptable: 50,
          poor: 50
        }
      };

      mockQualityEngine.validateQualityStandardConfig.mockReturnValue({
        valid: true,
        errors: []
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/quality-standards/validate-config',
        body: JSON.stringify(mockConfig),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.valid).toBe(true);
      expect(responseBody.errors).toEqual([]);

      expect(mockQualityEngine.validateQualityStandardConfig).toHaveBeenCalledWith(mockConfig);
    });

    it('should return validation errors for invalid configuration', async () => {
      const invalidConfig = {
        fileTypes: ['.ts'],
        dimensions: [], // Invalid - empty dimensions
        complianceRules: ['coding-standards'],
        scoringWeights: {
          staticAnalysis: 0.4,
          semanticValidation: 0.3,
          formatCompliance: 0.2,
          contentQuality: 0.1
        },
        improvementThresholds: {
          excellent: 90,
          good: 70,
          acceptable: 50,
          poor: 50
        }
      };

      mockQualityEngine.validateQualityStandardConfig.mockReturnValue({
        valid: false,
        errors: ['Quality standard must define at least one dimension']
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/quality-standards/validate-config',
        body: JSON.stringify(invalidConfig),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.valid).toBe(false);
      expect(responseBody.errors).toContain('Quality standard must define at least one dimension');
    });
  });

  describe('batchQualityCheckHandler', () => {
    it('should perform batch quality check successfully', async () => {
      const deliverables = [
        { ...mockDeliverable, deliverable_id: 'deliverable-1' },
        { ...mockDeliverable, deliverable_id: 'deliverable-2' }
      ];

      // Mock DynamoDB query for deliverables
      dynamoMock.on(require('@aws-sdk/lib-dynamodb').QueryCommand).resolves({
        Items: deliverables
      });

      // Mock update commands
      dynamoMock.on(require('@aws-sdk/lib-dynamodb').UpdateCommand).resolves({});

      // Mock quality assessments
      mockQualityEngine.performQualityAssessment
        .mockResolvedValueOnce({ ...mockQualityResult, overall_score: 85 })
        .mockResolvedValueOnce({ ...mockQualityResult, overall_score: 75 });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks/test-task-1/batch-quality-check',
        pathParameters: {
          taskId: 'test-task-1'
        },
        body: JSON.stringify({
          qualityStandards: ['coding-standards'],
          teamId: 'test-team'
        }),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await batchQualityCheckHandler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.task_id).toBe('test-task-1');
      expect(responseBody.total_deliverables).toBe(2);
      expect(responseBody.successful_results).toHaveLength(2);
      expect(responseBody.failed_results).toHaveLength(0);
      expect(responseBody.summary.success_rate).toBe(1);
      expect(responseBody.summary.average_score).toBe(80); // (85 + 75) / 2

      expect(mockQualityEngine.performQualityAssessment).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch quality check', async () => {
      const deliverables = [
        { ...mockDeliverable, deliverable_id: 'deliverable-1' },
        { ...mockDeliverable, deliverable_id: 'deliverable-2' }
      ];

      dynamoMock.on(require('@aws-sdk/lib-dynamodb').QueryCommand).resolves({
        Items: deliverables
      });

      dynamoMock.on(require('@aws-sdk/lib-dynamodb').UpdateCommand).resolves({});

      // Mock one success and one failure
      mockQualityEngine.performQualityAssessment
        .mockResolvedValueOnce(mockQualityResult)
        .mockRejectedValueOnce(new Error('Assessment failed'));

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks/test-task-1/batch-quality-check',
        pathParameters: {
          taskId: 'test-task-1'
        },
        body: JSON.stringify({
          qualityStandards: ['coding-standards']
        }),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await batchQualityCheckHandler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.successful_results).toHaveLength(1);
      expect(responseBody.failed_results).toHaveLength(1);
      expect(responseBody.summary.success_rate).toBe(0.5);
    });

    it('should return 404 when no deliverables found for task', async () => {
      dynamoMock.on(require('@aws-sdk/lib-dynamodb').QueryCommand).resolves({
        Items: []
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/api/v1/work-tasks/nonexistent-task/batch-quality-check',
        pathParameters: {
          taskId: 'nonexistent-task'
        },
        body: JSON.stringify({}),
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await batchQualityCheckHandler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Not Found');
      expect(responseBody.message).toBe('No deliverables found for task');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/unknown-endpoint',
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Not Found');
      expect(responseBody.message).toBe('Endpoint not found');
    });

    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error
      mockQualityEngine.getAvailableQualityStandards.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/api/v1/quality-standards',
        queryStringParameters: {
          fileType: 'code'
        },
        requestContext: {
          requestId: 'test-request-id'
        } as any
      };

      const result: APIGatewayProxyResult = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Internal Server Error');
    });
  });
});