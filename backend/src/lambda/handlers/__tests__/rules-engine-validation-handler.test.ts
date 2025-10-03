import { handler } from '../rules-engine-validation-handler';
import { RulesEngineService } from '../../../rules-engine/rules-engine-service';
import { ValidationReport, RuleDefinition } from '../../../rules-engine/types';

// Mock the RulesEngineService
jest.mock('../../../rules-engine/rules-engine-service');
const mockRulesEngineService = RulesEngineService as jest.MockedClass<typeof RulesEngineService>;

// Mock Logger
jest.mock('../../utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('RulesEngineValidationHandler', () => {
  const mockValidationReport: ValidationReport = {
    artifact_id: 'test-job-123',
    overall_score: 85,
    max_score: 100,
    passed: true,
    results: [
      {
        rule_id: 'test-rule-1',
        rule_name: 'Test Rule 1',
        passed: true,
        severity: 'medium',
        message: 'Rule passed successfully',
      },
    ],
    summary: {
      total_rules: 1,
      passed_rules: 1,
      failed_rules: 0,
      critical_issues: 0,
      high_issues: 0,
      medium_issues: 0,
      low_issues: 0,
    },
    execution_time_ms: 1500,
    timestamp: '2024-01-01T00:00:00.000Z',
  };

  const mockApplicableRules: RuleDefinition[] = [
    {
      id: 'test-rule-1',
      name: 'Test Rule 1',
      description: 'A test rule',
      version: '1.0.0',
      type: 'static',
      severity: 'medium',
      enabled: true,
      schema: {},
      config: {
        applicable_types: ['typescript'],
      },
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockEvent = {
    jobId: 'test-job-123',
    artifactData: {
      content: 'const test = "hello world";',
      contentType: 'text/plain',
      detectedArtifactType: 'typescript',
      applicableRules: mockApplicableRules,
      validationConfig: {
        timeoutMs: 60000,
        maxRetries: 2,
        enableParallelValidation: true,
      },
    },
    userContext: {
      userId: 'user-123',
      teamId: 'team-456',
      role: 'developer',
    },
    artifactCheckRequest: {
      artifactUrl: 's3://test-bucket/test-artifact.ts',
      artifactType: 'typescript',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementation
    const mockInstance = {
      validateArtifact: jest.fn().mockResolvedValue(mockValidationReport),
    };
    
    mockRulesEngineService.getInstance.mockReturnValue(mockInstance as any);
  });

  describe('successful validation', () => {
    it('should validate artifact and return successful result', async () => {
      const result = await handler(mockEvent);

      expect(result).toEqual({
        validationReport: mockValidationReport,
        executionStatus: 'completed',
        executionTime: expect.any(Number),
      });

      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should call rules engine with correct parameters', async () => {
      const mockInstance = mockRulesEngineService.getInstance();
      
      await handler(mockEvent);

      expect(mockInstance.validateArtifact).toHaveBeenCalledWith({
        artifact_id: 'test-job-123',
        artifact_type: 'typescript',
        content: 'const test = "hello world";',
        file_path: 's3://test-bucket/test-artifact.ts',
        metadata: {
          user_id: 'user-123',
          team_id: 'team-456',
          role: 'developer',
          content_type: 'text/plain',
          applicable_rules: ['test-rule-1'],
          validation_config: mockEvent.artifactData.validationConfig,
          attempt_number: 1,
        },
      });
    });
  });

  describe('no applicable rules', () => {
    it('should skip validation when no applicable rules', async () => {
      const eventWithNoRules = {
        ...mockEvent,
        artifactData: {
          ...mockEvent.artifactData,
          applicableRules: [],
        },
      };

      const result = await handler(eventWithNoRules);

      expect(result).toEqual({
        validationReport: null,
        executionStatus: 'skipped',
        executionTime: expect.any(Number),
      });

      const mockInstance = mockRulesEngineService.getInstance();
      expect(mockInstance.validateArtifact).not.toHaveBeenCalled();
    });
  });

  describe('validation failures', () => {
    it('should handle validation errors gracefully', async () => {
      const mockInstance = mockRulesEngineService.getInstance();
      mockInstance.validateArtifact.mockRejectedValue(new Error('Validation failed'));

      const result = await handler(mockEvent);

      expect(result).toEqual({
        validationReport: null,
        executionStatus: 'failed',
        executionTime: expect.any(Number),
        errorDetails: {
          error: 'Validation failed',
          retryCount: 0,
          lastAttemptTime: expect.any(String),
        },
      });
    });

    it('should handle timeout errors', async () => {
      const mockInstance = mockRulesEngineService.getInstance();
      mockInstance.validateArtifact.mockRejectedValue(new Error('Validation timeout after 60000ms'));

      const result = await handler(mockEvent);

      expect(result.executionStatus).toBe('timeout');
      expect(result.errorDetails?.error).toContain('timeout');
    });

    it('should handle large artifact size', async () => {
      const largeContent = 'x'.repeat(51 * 1024 * 1024); // 51MB
      const eventWithLargeContent = {
        ...mockEvent,
        artifactData: {
          ...mockEvent.artifactData,
          content: largeContent,
        },
      };

      const result = await handler(eventWithLargeContent);

      expect(result.executionStatus).toBe('failed');
      expect(result.errorDetails?.error).toContain('exceeds maximum allowed size');
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failures', async () => {
      const mockInstance = mockRulesEngineService.getInstance();
      
      // First call fails, second succeeds
      mockInstance.validateArtifact
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce(mockValidationReport);

      const result = await handler(mockEvent);

      expect(result.executionStatus).toBe('completed');
      expect(result.validationReport).toEqual(mockValidationReport);
      expect(mockInstance.validateArtifact).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockInstance = mockRulesEngineService.getInstance();
      mockInstance.validateArtifact.mockRejectedValue(new Error('Invalid artifact type'));

      const result = await handler(mockEvent);

      expect(result.executionStatus).toBe('failed');
      expect(mockInstance.validateArtifact).toHaveBeenCalledTimes(1);
    });

    it('should exhaust all retries before failing', async () => {
      const mockInstance = mockRulesEngineService.getInstance();
      mockInstance.validateArtifact.mockRejectedValue(new Error('Persistent error'));

      const result = await handler(mockEvent);

      expect(result.executionStatus).toBe('failed');
      // Should be called maxRetries + 1 times (initial + retries)
      expect(mockInstance.validateArtifact).toHaveBeenCalledTimes(3);
    });
  });

  describe('validation configuration', () => {
    it('should respect timeout configuration', async () => {
      const shortTimeoutEvent = {
        ...mockEvent,
        artifactData: {
          ...mockEvent.artifactData,
          validationConfig: {
            ...mockEvent.artifactData.validationConfig,
            timeoutMs: 100, // Very short timeout
          },
        },
      };

      const mockInstance = mockRulesEngineService.getInstance();
      // Simulate slow validation
      mockInstance.validateArtifact.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockValidationReport), 200))
      );

      const result = await handler(shortTimeoutEvent);

      expect(result.executionStatus).toBe('timeout');
    });

    it('should respect retry configuration', async () => {
      const noRetryEvent = {
        ...mockEvent,
        artifactData: {
          ...mockEvent.artifactData,
          validationConfig: {
            ...mockEvent.artifactData.validationConfig,
            maxRetries: 0,
          },
        },
      };

      const mockInstance = mockRulesEngineService.getInstance();
      mockInstance.validateArtifact.mockRejectedValue(new Error('Transient error'));

      const result = await handler(noRetryEvent);

      expect(result.executionStatus).toBe('failed');
      expect(mockInstance.validateArtifact).toHaveBeenCalledTimes(1);
    });
  });
});