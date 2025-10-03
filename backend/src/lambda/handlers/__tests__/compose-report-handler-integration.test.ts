import { handler } from '../compose-report-handler';
import { RulesEngineService } from '../../../rules-engine/rules-engine-service';
import { ValidationReport, RuleDefinition } from '../../../rules-engine/types';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');

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

// Mock environment variables
process.env.ARTIFACTS_BUCKET_NAME = 'test-artifacts-bucket';
process.env.JOB_STATUS_TABLE = 'test-job-status-table';

describe('ComposeReportHandler - Rules Engine Integration', () => {
  const mockValidationReport: ValidationReport = {
    artifact_id: 'test-job-123',
    overall_score: 75,
    max_score: 100,
    passed: false,
    results: [
      {
        rule_id: 'security-rule-1',
        rule_name: 'No Hardcoded Secrets',
        passed: false,
        severity: 'critical',
        message: 'Hardcoded API key detected',
        source_location: {
          file: 'config.ts',
          line: 15,
          column: 10,
        },
        suggested_fix: 'Use environment variables for API keys',
      },
      {
        rule_id: 'static-rule-1',
        rule_name: 'TypeScript Strict Mode',
        passed: true,
        severity: 'medium',
        message: 'TypeScript strict mode is enabled',
      },
    ],
    summary: {
      total_rules: 2,
      passed_rules: 1,
      failed_rules: 1,
      critical_issues: 1,
      high_issues: 0,
      medium_issues: 0,
      low_issues: 0,
    },
    execution_time_ms: 2500,
    timestamp: '2024-01-01T00:00:00.000Z',
  };

  const mockApplicableRules: RuleDefinition[] = [
    {
      id: 'security-rule-1',
      name: 'No Hardcoded Secrets',
      description: 'Detect hardcoded secrets in code',
      version: '1.0.0',
      type: 'security',
      severity: 'critical',
      enabled: true,
      schema: {},
      config: {
        applicable_types: ['typescript', 'javascript'],
      },
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ];

  const baseEvent = {
    jobId: 'test-job-123',
    artifactCheckRequest: {
      artifactUrl: 's3://test-bucket/config.ts',
      artifactType: 'typescript',
    },
    userContext: {
      userId: 'user-123',
      teamId: 'team-456',
      role: 'developer',
    },
    kendraResults: {
      Payload: {
        results: [
          {
            id: 'doc-1',
            sourceType: 'confluence',
            confidence: 0.8,
            excerpt: 'Security best practices for API keys',
            uri: 'https://confluence.example.com/security-guide',
          },
        ],
      },
    },
    staticCheckResults: {
      taskResult: {
        issues: [
          {
            severity: 'warning',
            description: 'Unused variable detected',
            location: 'config.ts:20',
            remediation: 'Remove unused variable',
          },
        ],
      },
    },
    semanticCheckResults: {
      taskResult: {
        issues: [
          {
            severity: 'info',
            description: 'Consider using more descriptive variable names',
            location: 'config.ts:10',
            remediation: 'Use descriptive variable names for better code readability',
          },
        ],
      },
    },
    artifactData: {
      content: 'const API_KEY = "sk-1234567890abcdef";',
      contentType: 'text/plain',
      detectedArtifactType: 'typescript',
      applicableRules: mockApplicableRules,
      rulesEngineCapabilities: {
        staticAnalysisEnabled: true,
        semanticAnalysisEnabled: true,
        securityAnalysisEnabled: true,
        supportedTypes: ['typescript', 'javascript'],
      },
      validationConfig: {
        timeoutMs: 120000,
        maxRetries: 2,
        enableParallelValidation: true,
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with rules engine results from workflow', () => {
    it('should use provided rules engine results', async () => {
      const eventWithRulesEngineResults = {
        ...baseEvent,
        rulesEngineResults: mockValidationReport,
        validationSummary: {
          rulesEngineStatus: 'completed' as const,
          rulesEngineExecutionTime: 2500,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithRulesEngineResults);

      expect(result.jobStatus).toBe('completed');
      expect(result.report.complianceScore).toBe(75); // From rules engine
      expect(result.report.issues).toHaveLength(3); // 1 from rules engine + 1 static + 1 semantic
      
      // Check that rules engine issue is properly parsed
      const rulesEngineIssue = result.report.issues.find(i => i.type === 'rules-engine');
      expect(rulesEngineIssue).toBeDefined();
      expect(rulesEngineIssue?.severity).toBe('critical');
      expect(rulesEngineIssue?.ruleId).toBe('security-rule-1');
      expect(rulesEngineIssue?.location).toBe('config.ts:15');
    });

    it('should handle rules engine timeout status', async () => {
      const eventWithTimeout = {
        ...baseEvent,
        rulesEngineResults: null,
        validationSummary: {
          rulesEngineStatus: 'timeout' as const,
          rulesEngineExecutionTime: 120000,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithTimeout);

      expect(result.jobStatus).toBe('completed');
      expect(result.report.summary).toContain('Rules engine validation was incomplete due to timeout');
      expect(result.report.issues).toHaveLength(2); // Only static + semantic
    });

    it('should handle rules engine failure status', async () => {
      const eventWithFailure = {
        ...baseEvent,
        rulesEngineResults: null,
        validationSummary: {
          rulesEngineStatus: 'failed' as const,
          rulesEngineExecutionTime: 5000,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithFailure);

      expect(result.jobStatus).toBe('completed');
      expect(result.report.summary).toContain('Rules engine validation encountered errors');
      expect(result.report.issues).toHaveLength(2); // Only static + semantic
    });

    it('should handle rules engine skipped status', async () => {
      const eventWithSkipped = {
        ...baseEvent,
        artifactData: {
          ...baseEvent.artifactData,
          applicableRules: [], // No applicable rules
        },
        rulesEngineResults: null,
        validationSummary: {
          rulesEngineStatus: 'skipped' as const,
          rulesEngineExecutionTime: 100,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithSkipped);

      expect(result.jobStatus).toBe('completed');
      expect(result.report.summary).toContain('Rules engine validation skipped (no applicable rules)');
      expect(result.report.issues).toHaveLength(2); // Only static + semantic
    });
  });

  describe('fallback rules engine execution', () => {
    it('should run fallback validation when no results provided', async () => {
      const mockInstance = {
        validateArtifact: jest.fn().mockResolvedValue(mockValidationReport),
      };
      mockRulesEngineService.getInstance.mockReturnValue(mockInstance as any);

      const eventWithoutRulesEngineResults = {
        ...baseEvent,
        rulesEngineResults: undefined,
        validationSummary: undefined,
      };

      const result = await handler(eventWithoutRulesEngineResults);

      expect(mockInstance.validateArtifact).toHaveBeenCalledWith({
        artifact_id: 'test-job-123',
        artifact_type: 'typescript',
        content: 'const API_KEY = "sk-1234567890abcdef";',
        file_path: 's3://test-bucket/config.ts',
        metadata: {
          user_id: 'user-123',
          team_id: 'team-456',
          content_type: 'text/plain',
          applicable_rules: ['security-rule-1'],
        },
      });

      expect(result.jobStatus).toBe('completed');
      expect(result.report.complianceScore).toBe(75);
    });

    it('should handle fallback validation failure gracefully', async () => {
      const mockInstance = {
        validateArtifact: jest.fn().mockRejectedValue(new Error('Validation failed')),
      };
      mockRulesEngineService.getInstance.mockReturnValue(mockInstance as any);

      const eventWithoutRulesEngineResults = {
        ...baseEvent,
        rulesEngineResults: undefined,
        validationSummary: undefined,
      };

      const result = await handler(eventWithoutRulesEngineResults);

      expect(result.jobStatus).toBe('completed');
      // Should still complete with static and semantic results
      expect(result.report.issues).toHaveLength(2);
    });
  });

  describe('compliance scoring with rules engine', () => {
    it('should use rules engine score when available', async () => {
      const eventWithHighScore = {
        ...baseEvent,
        rulesEngineResults: {
          ...mockValidationReport,
          overall_score: 95,
          passed: true,
          summary: {
            ...mockValidationReport.summary,
            failed_rules: 0,
            critical_issues: 0,
          },
        },
        validationSummary: {
          rulesEngineStatus: 'completed' as const,
          rulesEngineExecutionTime: 1500,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithHighScore);

      expect(result.report.complianceScore).toBe(95);
      expect(result.report.summary).toContain('95/100');
    });

    it('should fall back to calculated score when rules engine unavailable', async () => {
      const eventWithoutRulesEngine = {
        ...baseEvent,
        rulesEngineResults: null,
        validationSummary: {
          rulesEngineStatus: 'skipped' as const,
          rulesEngineExecutionTime: 100,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithoutRulesEngine);

      // Should calculate score based on static and semantic issues
      expect(result.report.complianceScore).toBeGreaterThan(0);
      expect(result.report.complianceScore).toBeLessThan(100);
    });
  });

  describe('recommendations with rules engine context', () => {
    it('should include rules engine specific recommendations', async () => {
      const eventWithCriticalIssues = {
        ...baseEvent,
        rulesEngineResults: mockValidationReport,
        validationSummary: {
          rulesEngineStatus: 'completed' as const,
          rulesEngineExecutionTime: 2500,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithCriticalIssues);

      expect(result.report.recommendations).toContain('Address 1 critical issue(s) before proceeding with deployment');
      expect(result.report.recommendations).toContain('Address 1 rule violation(s) identified by the rules engine');
      expect(result.report.recommendations).toContain('Review and fix violations for: No Hardcoded Secrets');
    });

    it('should include timeout-specific recommendations', async () => {
      const eventWithTimeout = {
        ...baseEvent,
        rulesEngineResults: null,
        validationSummary: {
          rulesEngineStatus: 'timeout' as const,
          rulesEngineExecutionTime: 120000,
          staticCheckStatus: 'completed',
          semanticCheckStatus: 'completed',
        },
      };

      const result = await handler(eventWithTimeout);

      expect(result.report.summary).toContain('Rules engine validation was incomplete due to timeout');
    });
  });
});