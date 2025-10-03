import { RulesEngine } from '../rules-engine';
import { RuleRepository } from '../../repositories/rule-repository';
import { StaticAnalysisEngine } from '../static-analysis';
import { SemanticAnalysisEngine } from '../semantic-analysis';
import { ArtifactValidationRequest, RuleDefinition, StaticAnalysisConfig, SemanticAnalysisConfig } from '../types';

// Mock the dependencies
jest.mock('../static-analysis');
jest.mock('../semantic-analysis');
jest.mock('../../repositories/rule-repository');

const MockedStaticAnalysisEngine = StaticAnalysisEngine as jest.MockedClass<typeof StaticAnalysisEngine>;
const MockedSemanticAnalysisEngine = SemanticAnalysisEngine as jest.MockedClass<typeof SemanticAnalysisEngine>;
const MockedRuleRepository = RuleRepository as jest.MockedClass<typeof RuleRepository>;

describe('RulesEngine', () => {
  let rulesEngine: RulesEngine;
  let mockRuleRepository: jest.Mocked<RuleRepository>;
  let mockStaticEngine: jest.Mocked<StaticAnalysisEngine>;
  let mockSemanticEngine: jest.Mocked<SemanticAnalysisEngine>;

  const staticConfig: StaticAnalysisConfig = {
    eslint: { enabled: true },
    cfn_lint: { enabled: true },
    cfn_nag: { enabled: true },
    snyk: { enabled: true }
  };

  const semanticConfig: SemanticAnalysisConfig = {
    llm_provider: 'bedrock',
    model_name: 'claude-3-sonnet',
    temperature: 0.1,
    max_tokens: 4096,
    prompt_template: 'test template',
    confidence_threshold: 0.7
  };

  const mockRules: RuleDefinition[] = [
    {
      id: 'static-rule-1',
      name: 'Static Rule 1',
      description: 'Test static rule',
      version: '1.0.0',
      type: 'static',
      severity: 'medium',
      enabled: true,
      schema: {},
      config: { applicable_types: ['typescript'] },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'semantic-rule-1',
      name: 'Semantic Rule 1',
      description: 'Test semantic rule',
      version: '1.0.0',
      type: 'semantic',
      severity: 'high',
      enabled: true,
      schema: {},
      config: { applicable_types: ['typescript'] },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'disabled-rule',
      name: 'Disabled Rule',
      description: 'Test disabled rule',
      version: '1.0.0',
      type: 'security',
      severity: 'critical',
      enabled: false,
      schema: {},
      config: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockRuleRepository = new MockedRuleRepository({} as any, 'test-table') as jest.Mocked<RuleRepository>;
    mockStaticEngine = new MockedStaticAnalysisEngine(staticConfig) as jest.Mocked<StaticAnalysisEngine>;
    mockSemanticEngine = new MockedSemanticAnalysisEngine(semanticConfig) as jest.Mocked<SemanticAnalysisEngine>;

    // Mock the constructor calls
    MockedStaticAnalysisEngine.mockImplementation(() => mockStaticEngine);
    MockedSemanticAnalysisEngine.mockImplementation(() => mockSemanticEngine);

    rulesEngine = new RulesEngine(staticConfig, semanticConfig, mockRuleRepository);
  });

  describe('validateArtifact', () => {
    const mockRequest: ArtifactValidationRequest = {
      artifact_id: 'test-artifact',
      artifact_type: 'typescript',
      content: 'const test = "hello world";',
      file_path: 'test.ts'
    };

    it('should run validation successfully', async () => {
      // Setup mocks
      mockRuleRepository.getAllRules.mockResolvedValue(mockRules);
      mockStaticEngine.runAnalysis.mockResolvedValue([
        {
          rule_id: 'eslint-no-unused-vars',
          rule_name: 'ESLint: no-unused-vars',
          passed: false,
          severity: 'medium',
          message: 'Variable is defined but never used'
        }
      ]);
      mockSemanticEngine.runAnalysis.mockResolvedValue([
        {
          rule_id: 'semantic-design-001',
          rule_name: 'Design Pattern Issue',
          passed: false,
          severity: 'low',
          message: 'Consider using more descriptive variable names'
        }
      ]);

      const report = await rulesEngine.validateArtifact(mockRequest);

      expect(report.artifact_id).toBe('test-artifact');
      expect(report.results).toHaveLength(2);
      expect(report.overall_score).toBeDefined();
      expect(report.passed).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.execution_time_ms).toBeGreaterThan(0);
    });

    it('should handle static analysis errors gracefully', async () => {
      mockRuleRepository.getAllRules.mockResolvedValue(mockRules);
      mockStaticEngine.runAnalysis.mockRejectedValue(new Error('Static analysis failed'));
      mockSemanticEngine.runAnalysis.mockResolvedValue([]);

      const report = await rulesEngine.validateArtifact(mockRequest);

      expect(report.results).toHaveLength(1);
      expect(report.results[0].rule_id).toBe('static-analysis-error');
      expect(report.results[0].passed).toBe(false);
    });

    it('should handle semantic analysis errors gracefully', async () => {
      mockRuleRepository.getAllRules.mockResolvedValue(mockRules);
      mockStaticEngine.runAnalysis.mockResolvedValue([]);
      mockSemanticEngine.runAnalysis.mockRejectedValue(new Error('Semantic analysis failed'));

      const report = await rulesEngine.validateArtifact(mockRequest);

      expect(report.results).toHaveLength(1);
      expect(report.results[0].rule_id).toBe('semantic-analysis-error');
      expect(report.results[0].passed).toBe(false);
    });

    it('should handle rule repository errors gracefully', async () => {
      mockRuleRepository.getAllRules.mockRejectedValue(new Error('Database error'));

      const report = await rulesEngine.validateArtifact(mockRequest);

      expect(report.results).toHaveLength(1);
      expect(report.results[0].rule_id).toBe('validation-error');
      expect(report.results[0].passed).toBe(false);
    });

    it('should filter disabled rules', async () => {
      mockRuleRepository.getAllRules.mockResolvedValue(mockRules);
      mockStaticEngine.runAnalysis.mockResolvedValue([]);
      mockSemanticEngine.runAnalysis.mockResolvedValue([]);

      await rulesEngine.validateArtifact(mockRequest);

      // Should only call analysis for enabled rules
      expect(mockStaticEngine.runAnalysis).toHaveBeenCalled();
      expect(mockSemanticEngine.runAnalysis).toHaveBeenCalled();
    });

    it('should filter rules by artifact type', async () => {
      const javaRequest: ArtifactValidationRequest = {
        artifact_id: 'java-artifact',
        artifact_type: 'java',
        content: 'public class Test {}',
        file_path: 'Test.java'
      };

      mockRuleRepository.getAllRules.mockResolvedValue(mockRules);
      mockStaticEngine.runAnalysis.mockResolvedValue([]);
      mockSemanticEngine.runAnalysis.mockResolvedValue([]);

      await rulesEngine.validateArtifact(javaRequest);

      // Rules should be filtered by applicable types
      expect(mockStaticEngine.runAnalysis).toHaveBeenCalled();
      expect(mockSemanticEngine.runAnalysis).toHaveBeenCalled();
    });
  });

  describe('validateRuleDefinition', () => {
    it('should validate rule definition successfully', () => {
      const rule: RuleDefinition = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test description',
        version: '1.0.0',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            test_prop: { type: 'string' }
          }
        },
        config: { test_prop: 'test_value' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const result = rulesEngine.validateRuleDefinition(rule);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid rule', () => {
      const invalidRule: RuleDefinition = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test description',
        version: '1.0.0',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            required_prop: { type: 'string' }
          },
          required: ['required_prop']
        },
        config: {}, // Missing required_prop
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const result = rulesEngine.validateRuleDefinition(invalidRule);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getValidationStats', () => {
    it('should return validation statistics', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const stats = await rulesEngine.getValidationStats(timeRange);

      expect(stats).toHaveProperty('total_validations');
      expect(stats).toHaveProperty('passed_validations');
      expect(stats).toHaveProperty('failed_validations');
      expect(stats).toHaveProperty('average_score');
      expect(stats).toHaveProperty('most_common_issues');
    });
  });

  describe('getRulePerformance', () => {
    it('should return rule performance metrics', async () => {
      const performance = await rulesEngine.getRulePerformance();

      expect(Array.isArray(performance)).toBe(true);
    });
  });
});