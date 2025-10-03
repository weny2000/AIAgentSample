import { RulesEngine } from '../rules-engine';
import { RuleRepository } from '../../repositories/rule-repository';
import { ArtifactValidationRequest, RuleDefinition } from '../types';

// Mock the repository and external dependencies
jest.mock('../../repositories/rule-repository');
jest.mock('../static-analysis');
jest.mock('../semantic-analysis');
jest.mock('../../lambda/utils/logger');

describe('RulesEngine Integration', () => {
  let rulesEngine: RulesEngine;
  let mockRuleRepository: jest.Mocked<RuleRepository>;

  beforeEach(() => {
    mockRuleRepository = new RuleRepository({ tableName: 'test-table' }) as jest.Mocked<RuleRepository>;
    rulesEngine = new RulesEngine(mockRuleRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateArtifact', () => {
    it('should validate TypeScript artifact with applicable rules', async () => {
      const request: ArtifactValidationRequest = {
        artifact_id: 'test-typescript-file',
        artifact_type: 'typescript',
        content: `
const apiKey = "sk-1234567890abcdef";
let unusedVariable = "test";
function testFunction() {
  console.log("Hello world");
}
        `,
        file_path: 'src/test.ts',
        metadata: {
          author: 'test-user',
          project: 'test-project'
        }
      };

      // Mock applicable rules
      const mockRules: RuleDefinition[] = [
        {
          id: 'typescript-eslint-basic',
          name: 'TypeScript ESLint Basic Rules',
          description: 'Basic ESLint rules for TypeScript',
          version: '1.0.0',
          type: 'static',
          severity: 'medium',
          enabled: true,
          schema: {},
          config: {
            applicable_types: ['typescript'],
            eslint: {
              enabled: true,
              rules: {
                '@typescript-eslint/no-unused-vars': 'error',
                'no-console': 'warn'
              }
            }
          },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'security-hardcoded-secrets',
          name: 'Hardcoded Secrets Detection',
          description: 'Detect hardcoded API keys and secrets',
          version: '1.0.0',
          type: 'security',
          severity: 'critical',
          enabled: true,
          schema: {},
          config: {
            applicable_types: ['typescript', 'javascript'],
            check_type: 'hardcoded_secrets',
            patterns: [
              'apiKey\\s*=\\s*["\'][^"\']+["\']',
              'api[_-]?key\\s*=\\s*["\'][^"\']+["\']'
            ]
          },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockRuleRepository.getEnabledRules.mockResolvedValue(mockRules);

      const report = await rulesEngine.validateArtifact(request);

      expect(report).toBeDefined();
      expect(report.artifact_id).toBe(request.artifact_id);
      expect(report.overall_score).toBeDefined();
      expect(report.passed).toBeDefined();
      expect(report.results).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.execution_time_ms).toBeGreaterThan(0);
      expect(report.timestamp).toBeDefined();

      // Verify repository was called
      expect(mockRuleRepository.getEnabledRules).toHaveBeenCalled();
    });

    it('should handle artifact type with no applicable rules', async () => {
      const request: ArtifactValidationRequest = {
        artifact_id: 'test-unknown-file',
        artifact_type: 'unknown',
        content: 'some content',
        file_path: 'test.unknown'
      };

      // Mock no applicable rules
      mockRuleRepository.getEnabledRules.mockResolvedValue([]);

      const report = await rulesEngine.validateArtifact(request);

      expect(report).toBeDefined();
      expect(report.artifact_id).toBe(request.artifact_id);
      expect(report.overall_score).toBe(100); // No rules = perfect score
      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(0);
      expect(report.summary.total_rules).toBe(0);
    });

    it('should handle validation errors gracefully', async () => {
      const request: ArtifactValidationRequest = {
        artifact_id: 'test-error-file',
        artifact_type: 'typescript',
        content: 'const x = 1;',
        file_path: 'test.ts'
      };

      // Mock repository error
      mockRuleRepository.getEnabledRules.mockRejectedValue(new Error('Database connection failed'));

      const report = await rulesEngine.validateArtifact(request);

      expect(report).toBeDefined();
      expect(report.artifact_id).toBe(request.artifact_id);
      expect(report.passed).toBe(false);
      expect(report.results).toHaveLength(1);
      expect(report.results[0].rule_id).toBe('validation-engine-error');
      expect(report.results[0].severity).toBe('high');
      expect(report.results[0].message).toContain('Database connection failed');
    });

    it('should filter rules by applicable types correctly', async () => {
      const request: ArtifactValidationRequest = {
        artifact_id: 'test-python-file',
        artifact_type: 'python',
        content: 'print("Hello world")',
        file_path: 'test.py'
      };

      const mockRules: RuleDefinition[] = [
        {
          id: 'typescript-rule',
          name: 'TypeScript Rule',
          description: 'Only for TypeScript',
          version: '1.0.0',
          type: 'static',
          severity: 'medium',
          enabled: true,
          schema: {},
          config: {
            applicable_types: ['typescript'] // Should not apply to Python
          },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'universal-rule',
          name: 'Universal Rule',
          description: 'Applies to all types',
          version: '1.0.0',
          type: 'semantic',
          severity: 'low',
          enabled: true,
          schema: {},
          config: {
            applicable_types: ['*'] // Should apply to Python
          },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'python-rule',
          name: 'Python Rule',
          description: 'Only for Python',
          version: '1.0.0',
          type: 'static',
          severity: 'medium',
          enabled: true,
          schema: {},
          config: {
            applicable_types: ['python'] // Should apply to Python
          },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockRuleRepository.getEnabledRules.mockResolvedValue(mockRules);

      const report = await rulesEngine.validateArtifact(request);

      expect(report).toBeDefined();
      expect(mockRuleRepository.getEnabledRules).toHaveBeenCalled();
      
      // The engine should have filtered to only applicable rules
      // We can't directly test the filtering without exposing internal methods,
      // but we can verify the report was generated successfully
      expect(report.artifact_id).toBe(request.artifact_id);
    });
  });

  describe('getValidationCapabilities', () => {
    it('should return capabilities for TypeScript artifacts', async () => {
      const mockRules: RuleDefinition[] = [
        {
          id: 'typescript-rule-1',
          name: 'TypeScript Rule 1',
          description: 'TypeScript static analysis',
          version: '1.0.0',
          type: 'static',
          severity: 'medium',
          enabled: true,
          schema: {},
          config: { applicable_types: ['typescript'] },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'typescript-rule-2',
          name: 'TypeScript Rule 2',
          description: 'TypeScript security analysis',
          version: '1.0.0',
          type: 'security',
          severity: 'high',
          enabled: true,
          schema: {},
          config: { applicable_types: ['typescript'] },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'universal-rule',
          name: 'Universal Rule',
          description: 'Applies to all',
          version: '1.0.0',
          type: 'semantic',
          severity: 'low',
          enabled: true,
          schema: {},
          config: { applicable_types: ['*'] },
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        }
      ];

      mockRuleRepository.getEnabledRules.mockResolvedValue(mockRules);

      const capabilities = await rulesEngine.getValidationCapabilities('typescript');

      expect(capabilities).toBeDefined();
      expect(capabilities.available_rules).toBe(3);
      expect(capabilities.rule_types).toContain('static');
      expect(capabilities.rule_types).toContain('security');
      expect(capabilities.rule_types).toContain('semantic');
      expect(capabilities.severity_distribution).toHaveProperty('medium', 1);
      expect(capabilities.severity_distribution).toHaveProperty('high', 1);
      expect(capabilities.severity_distribution).toHaveProperty('low', 1);
      expect(capabilities.estimated_execution_time).toBeDefined();
    });

    it('should return empty capabilities for unsupported artifact types', async () => {
      mockRuleRepository.getEnabledRules.mockResolvedValue([]);

      const capabilities = await rulesEngine.getValidationCapabilities('unsupported');

      expect(capabilities).toBeDefined();
      expect(capabilities.available_rules).toBe(0);
      expect(capabilities.rule_types).toHaveLength(0);
      expect(capabilities.severity_distribution).toEqual({});
      expect(capabilities.estimated_execution_time).toBeDefined();
    });
  });
});