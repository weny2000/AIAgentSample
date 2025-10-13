import { ArtifactValidationService } from '../artifact-validation-service';
import { 
  DeliverableRecord, 
  TodoItemRecord
} from '../../models/work-task-models';

// Mock AWS SDK v3
const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: mockS3Send
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

describe('ArtifactValidationService - Basic Tests', () => {
  let service: ArtifactValidationService;
  let mockDeliverable: DeliverableRecord;
  let mockTodoItem: TodoItemRecord;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArtifactValidationService();
    
    mockDeliverable = {
      deliverable_id: 'del-123',
      todo_id: 'todo-123',
      file_name: 'test-document.pdf',
      file_type: 'document',
      file_size: 1024 * 1024, // 1MB
      s3_key: 'deliverables/todo-123/del-123/test-document.pdf',
      submitted_by: 'user@example.com',
      submitted_at: '2024-01-01T00:00:00Z',
      status: 'submitted'
    };

    mockTodoItem = {
      todo_id: 'todo-123',
      task_id: 'task-123',
      title: 'Create documentation',
      description: 'Write comprehensive documentation for the feature',
      priority: 'medium',
      estimated_hours: 8,
      dependencies: [],
      category: 'documentation',
      status: 'in_progress',
      related_workgroups: ['docs-team'],
      deliverables: [],
      quality_checks: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    };
  });

  describe('validateDeliverable', () => {
    it('should successfully validate a valid deliverable', async () => {
      // Mock S3 file content
      const mockContent = 'This is a test document with proper content.';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(mockContent)
        }
      });

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.is_valid).toBe(result.validation_score >= 0.7 && !result.issues_found.some(issue => issue.severity === 'critical'));
      expect(result.validation_score).toBeGreaterThan(0);
      expect(result.checks_performed.length).toBeGreaterThan(0);
      expect(result.validated_at).toBeDefined();
    });

    it('should fail validation for oversized files', async () => {
      const oversizedDeliverable = {
        ...mockDeliverable,
        file_size: 100 * 1024 * 1024 // 100MB (exceeds 50MB limit for documents)
      };

      const result = await service.validateDeliverable('todo-123', oversizedDeliverable);

      expect(result.is_valid).toBe(false);
      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          category: 'format',
          description: 'File size exceeds maximum allowed size'
        })
      );
    });

    it('should fail validation for unsupported file extensions', async () => {
      const invalidExtensionDeliverable = {
        ...mockDeliverable,
        file_name: 'test-file.xyz',
        file_type: 'document'
      };

      const result = await service.validateDeliverable('todo-123', invalidExtensionDeliverable);

      expect(result.is_valid).toBe(false);
      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          severity: 'medium',
          category: 'format',
          description: 'File extension not supported for this deliverable type'
        })
      );
    });

    it('should handle validation errors gracefully', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 access denied'));

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.is_valid).toBe(false);
      expect(result.validation_score).toBeLessThan(0.5);
      expect(result.issues_found.length).toBeGreaterThan(0);
      expect(result.issues_found[0].severity).toBe('high');
    });
  });

  describe('assessCompleteness', () => {
    it('should assess completeness for documentation todo', async () => {
      const result = await service.assessCompleteness(mockTodoItem, mockDeliverable);

      expect(result.isComplete).toBe(true);
      expect(result.completionScore).toBeGreaterThan(0);
      expect(result.satisfiedRequirements).toContain('document');
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('should identify missing requirements for development todo', async () => {
      const devTodoItem = {
        ...mockTodoItem,
        category: 'development' as const
      };
      
      const result = await service.assessCompleteness(devTodoItem, mockDeliverable);

      expect(result.isComplete).toBe(false);
      expect(result.missingRequirements).toContain('code');
      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Missing code deliverable')
      );
    });
  });

  describe('performQualityCheck', () => {
    beforeEach(() => {
      const mockContent = 'This is a well-structured document with proper content and formatting.';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(mockContent)
        }
      });
    });

    it('should perform quality assessment with high scores', async () => {
      const qualityStandards = ['format_compliance', 'content_completeness', 'readability'];

      const result = await service.performQualityCheck(mockDeliverable, qualityStandards);

      expect(result.overall_score).toBeGreaterThan(70);
      expect(result.quality_dimensions).toHaveLength(3);
      expect(result.compliance_status.is_compliant).toBe(true);
      expect(result.assessed_at).toBeDefined();
    });

    it('should handle quality check errors gracefully', async () => {
      mockS3Send.mockRejectedValue(new Error('File not found'));

      const result = await service.performQualityCheck(mockDeliverable, ['format_compliance']);

      expect(result.overall_score).toBe(0);
      expect(result.improvement_suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('generateImprovementSuggestions', () => {
    it('should generate suggestions based on validation issues', async () => {
      const validationResult = {
        is_valid: false,
        validation_score: 0.6,
        checks_performed: [],
        issues_found: [
          {
            severity: 'critical' as const,
            category: 'security' as const,
            description: 'Malware detected',
            suggested_fix: 'Remove malicious content'
          }
        ],
        recommendations: ['Review file content'],
        validated_at: '2024-01-01T00:00:00Z'
      };

      const suggestions = await service.generateImprovementSuggestions(validationResult);

      expect(suggestions).toContainEqual(
        expect.stringContaining('Critical security issues found')
      );
      expect(suggestions).toContain('Review file content');
    });
  });
});