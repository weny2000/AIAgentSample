import { ArtifactValidationService } from '../artifact-validation-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { 
  DeliverableRecord, 
  TodoItemRecord, 
  ValidationResult,
  QualityAssessmentResult,
  ComplianceStatus
} from '../../models/work-task-models';
import { ValidationReport } from '../../rules-engine/types';
// Mock AWS SDK v3
jest.mock('@aws-sdk/client-s3');
const mockS3Send = jest.fn();
const mockS3 = {
  send: mockS3Send
};
import { S3Client } from '@aws-sdk/client-s3';
(S3Client as jest.Mock).mockImplementation(() => mockS3);

// Mock RulesEngineService
jest.mock('../../rules-engine/rules-engine-service', () => ({
  RulesEngineService: {
    getInstance: jest.fn(() => ({
      validateArtifact: jest.fn()
    }))
  }
}));

const mockRulesEngine = {
  validateArtifact: jest.fn()
};
(RulesEngineService.getInstance as jest.Mock).mockReturnValue(mockRulesEngine);

// Mock Logger
jest.mock('../../lambda/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    performance: jest.fn()
  }))
}));

describe('ArtifactValidationService', () => {
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

      // Mock rules engine response
      const mockRulesReport: ValidationReport = {
        artifact_id: 'del-123',
        overall_score: 85,
        max_score: 100,
        passed: true,
        results: [{
          rule_id: 'doc-format',
          rule_name: 'Document Format Check',
          passed: true,
          severity: 'medium',
          message: 'Document format is valid'
        }],
        summary: {
          total_rules: 1,
          passed_rules: 1,
          failed_rules: 0,
          critical_issues: 0,
          high_issues: 0,
          medium_issues: 0,
          low_issues: 0
        },
        execution_time_ms: 150,
        timestamp: '2024-01-01T00:00:00Z'
      };
      mockRulesEngine.validateArtifact.mockResolvedValue(mockRulesReport);

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.is_valid).toBe(true);
      expect(result.validation_score).toBeGreaterThan(0.7);
      expect(result.checks_performed).toHaveLength(6); // Basic + security + compliance + type-specific
      expect(result.issues_found).toHaveLength(0);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'work-task-analysis-bucket',
            Key: mockDeliverable.s3_key
          }
        })
      );
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

    it('should detect security threats in file content', async () => {
      const maliciousContent = '<script>alert("xss")</script>This is malicious content';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(maliciousContent)
        }
      });

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          category: 'security',
          description: expect.stringContaining('Security threat detected')
        })
      );
    });

    it('should detect sensitive data in file content', async () => {
      const sensitiveContent = 'password=secret123\napi_key=abc123def456';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(sensitiveContent)
        }
      });

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          category: 'security',
          description: 'File may contain sensitive information'
        })
      );
    });

    it('should handle validation errors gracefully', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 access denied'));

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.is_valid).toBe(false);
      expect(result.validation_score).toBe(0);
      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          description: 'Validation process failed'
        })
      );
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
      expect(result.recommendations).toContain(
        expect.stringContaining('Missing code deliverable')
      );
    });

    it('should handle assessment errors gracefully', async () => {
      const invalidTodoItem = null as any;

      const result = await service.assessCompleteness(invalidTodoItem, mockDeliverable);

      expect(result.isComplete).toBe(false);
      expect(result.completionScore).toBe(0);
      expect(result.recommendations).toContain(
        'Unable to assess completeness. Please review deliverable manually.'
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
      expect(result.improvement_suggestions).toHaveLength(0);
    });

    it('should identify quality issues and provide suggestions', async () => {
      const poorContent = 'TODO: Write content here';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(poorContent)
        }
      });

      const qualityStandards = ['content_completeness'];

      const result = await service.performQualityCheck(mockDeliverable, qualityStandards);

      expect(result.overall_score).toBeLessThan(70);
      expect(result.improvement_suggestions.length).toBeGreaterThan(0);
      expect(result.compliance_status.violations.length).toBeGreaterThan(0);
    });

    it('should handle quality check errors gracefully', async () => {
      mockS3Send.mockRejectedValue(new Error('File not found'));

      const result = await service.performQualityCheck(mockDeliverable, ['format_compliance']);

      expect(result.overall_score).toBe(0);
      expect(result.improvement_suggestions).toContain(
        'Quality assessment failed. Please review manually.'
      );
    });
  });

  describe('generateImprovementSuggestions', () => {
    it('should generate suggestions based on validation issues', async () => {
      const validationResult: ValidationResult = {
        is_valid: false,
        validation_score: 0.6,
        checks_performed: [],
        issues_found: [
          {
            severity: 'critical',
            category: 'security',
            description: 'Malware detected',
            suggested_fix: 'Remove malicious content'
          },
          {
            severity: 'high',
            category: 'format',
            description: 'Invalid file format',
            suggested_fix: 'Convert to supported format'
          }
        ],
        recommendations: ['Review file content', 'Check file format'],
        validated_at: '2024-01-01T00:00:00Z'
      };

      const suggestions = await service.generateImprovementSuggestions(validationResult);

      expect(suggestions).toContain(
        expect.stringContaining('Critical security issues found')
      );
      expect(suggestions).toContain(
        expect.stringContaining('High priority format improvements needed')
      );
      expect(suggestions).toContain('Review file content');
      expect(suggestions).toContain('Check file format');
    });

    it('should provide general suggestions for low scores', async () => {
      const validationResult: ValidationResult = {
        is_valid: false,
        validation_score: 0.3,
        checks_performed: [],
        issues_found: [],
        recommendations: [],
        validated_at: '2024-01-01T00:00:00Z'
      };

      const suggestions = await service.generateImprovementSuggestions(validationResult);

      expect(suggestions).toContain(
        'Consider reviewing the deliverable requirements and resubmitting'
      );
    });
  });

  describe('file type specific validations', () => {
    it('should validate code files for syntax', async () => {
      const codeDeliverable = {
        ...mockDeliverable,
        file_name: 'test.ts',
        file_type: 'code'
      };

      const validCode = 'const message = "Hello World";\nconsole.log(message);';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(validCode)
        }
      });

      const result = await service.validateDeliverable('todo-123', codeDeliverable);

      expect(result.checks_performed).toContainEqual(
        expect.objectContaining({
          check_name: 'syntax_check',
          status: 'passed'
        })
      );
    });

    it('should detect syntax errors in code files', async () => {
      const codeDeliverable = {
        ...mockDeliverable,
        file_name: 'test.js',
        file_type: 'code'
      };

      const invalidCode = 'const message = "Hello World"\nconsole.log(message'; // Missing closing parenthesis
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(invalidCode)
        }
      });

      const result = await service.validateDeliverable('todo-123', codeDeliverable);

      expect(result.checks_performed).toContainEqual(
        expect.objectContaining({
          check_name: 'syntax_check',
          status: 'failed'
        })
      );
    });

    it('should validate JSON configuration files', async () => {
      const configDeliverable = {
        ...mockDeliverable,
        file_name: 'config.json',
        file_type: 'configuration'
      };

      const validJson = '{"name": "test", "version": "1.0.0"}';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(validJson)
        }
      });

      const result = await service.validateDeliverable('todo-123', configDeliverable);

      expect(result.checks_performed).toContainEqual(
        expect.objectContaining({
          check_name: 'json_syntax',
          status: 'passed'
        })
      );
    });

    it('should detect invalid JSON syntax', async () => {
      const configDeliverable = {
        ...mockDeliverable,
        file_name: 'config.json',
        file_type: 'configuration'
      };

      const invalidJson = '{"name": "test", "version": 1.0.0}'; // Missing quotes around number
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(invalidJson)
        }
      });

      const result = await service.validateDeliverable('todo-123', configDeliverable);

      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          category: 'format',
          description: 'Configuration file has syntax errors'
        })
      );
    });

    it('should validate test files for test patterns', async () => {
      const testDeliverable = {
        ...mockDeliverable,
        file_name: 'test.test.ts',
        file_type: 'test'
      };

      const validTest = `
        describe('Test Suite', () => {
          it('should pass test', () => {
            expect(true).toBe(true);
          });
        });
      `;
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(validTest)
        }
      });

      const result = await service.validateDeliverable('todo-123', testDeliverable);

      expect(result.checks_performed).toContainEqual(
        expect.objectContaining({
          check_name: 'test_patterns',
          status: 'passed'
        })
      );
    });

    it('should detect missing test patterns', async () => {
      const testDeliverable = {
        ...mockDeliverable,
        file_name: 'test.test.ts',
        file_type: 'test'
      };

      const invalidTest = 'console.log("This is not a test file");';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(invalidTest)
        }
      });

      const result = await service.validateDeliverable('todo-123', testDeliverable);

      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          category: 'content',
          description: 'File does not appear to contain valid test cases'
        })
      );
    });
  });

  describe('security scanning', () => {
    it('should detect embedded scripts', async () => {
      const maliciousContent = 'Some content <script>alert("xss")</script> more content';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(maliciousContent)
        }
      });

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          category: 'security',
          description: expect.stringContaining('embedded_script')
        })
      );
    });

    it('should detect suspicious eval usage', async () => {
      const suspiciousContent = 'const result = eval("2 + 2");';
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: jest.fn().mockResolvedValue(suspiciousContent)
        }
      });

      const result = await service.validateDeliverable('todo-123', mockDeliverable);

      expect(result.issues_found).toContainEqual(
        expect.objectContaining({
          category: 'security',
          description: expect.stringContaining('suspicious_content')
        })
      );
    });
  });
});