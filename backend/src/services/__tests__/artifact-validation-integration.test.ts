import { ArtifactValidationService } from '../artifact-validation-service';
import { DeliverableRecord } from '../../models/work-task-models';

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: jest.fn()
  })),
  GetObjectCommand: jest.fn()
}));

// Mock RulesEngineService completely
jest.mock('../../rules-engine/rules-engine-service', () => ({
  RulesEngineService: {
    getInstance: jest.fn(() => ({
      validateArtifact: jest.fn().mockResolvedValue({
        artifact_id: 'test',
        overall_score: 85,
        max_score: 100,
        passed: true,
        results: [],
        summary: {
          total_rules: 0,
          passed_rules: 0,
          failed_rules: 0,
          critical_issues: 0,
          high_issues: 0,
          medium_issues: 0,
          low_issues: 0
        },
        execution_time_ms: 100,
        timestamp: '2024-01-01T00:00:00Z'
      })
    }))
  }
}));

// Mock Logger
jest.mock('../../lambda/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    performance: jest.fn()
  }))
}));

// Integration test to verify the service can be instantiated and basic methods work
describe('ArtifactValidationService - Integration Tests', () => {
  let service: ArtifactValidationService;

  beforeAll(() => {
    // Set environment variables for testing
    process.env.AWS_REGION = 'us-east-1';
    process.env.WORK_TASK_BUCKET_NAME = 'test-work-task-bucket';
  });

  beforeEach(() => {
    service = new ArtifactValidationService();
  });

  it('should instantiate the service without errors', () => {
    expect(service).toBeInstanceOf(ArtifactValidationService);
  });

  it('should have all required public methods', () => {
    expect(typeof service.validateDeliverable).toBe('function');
    expect(typeof service.assessCompleteness).toBe('function');
    expect(typeof service.performQualityCheck).toBe('function');
    expect(typeof service.generateImprovementSuggestions).toBe('function');
  });

  it('should handle file type configurations correctly', () => {
    const mockDeliverable: DeliverableRecord = {
      deliverable_id: 'test-123',
      todo_id: 'todo-123',
      file_name: 'test.pdf',
      file_type: 'document',
      file_size: 1024,
      s3_key: 'test/path',
      submitted_by: 'test@example.com',
      submitted_at: '2024-01-01T00:00:00Z',
      status: 'submitted'
    };

    // This should not throw an error even without S3 access
    expect(() => {
      service.validateDeliverable('todo-123', mockDeliverable);
    }).not.toThrow();
  });

  it('should generate improvement suggestions for empty validation result', async () => {
    const emptyValidationResult = {
      is_valid: true,
      validation_score: 1.0,
      checks_performed: [],
      issues_found: [],
      recommendations: [],
      validated_at: '2024-01-01T00:00:00Z'
    };

    const suggestions = await service.generateImprovementSuggestions(emptyValidationResult);
    expect(Array.isArray(suggestions)).toBe(true);
  });
});