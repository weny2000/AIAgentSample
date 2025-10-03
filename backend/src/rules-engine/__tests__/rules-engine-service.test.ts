import { RulesEngineService } from '../rules-engine-service';
import { RuleDefinition, ArtifactValidationRequest } from '../types';

// Mock the dependencies
jest.mock('../rules-engine');
jest.mock('../../repositories/rule-repository');
jest.mock('../../lambda/utils/logger');

describe('RulesEngineService', () => {
  let service: RulesEngineService;

  beforeEach(() => {
    // Reset singleton instance
    (RulesEngineService as any).instance = undefined;
    service = RulesEngineService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = RulesEngineService.getInstance();
      const instance2 = RulesEngineService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('validateRuleConfig', () => {
    it('should validate a correct rule configuration', () => {
      const validRule: Omit<RuleDefinition, 'created_at' | 'updated_at'> = {
        id: 'test-rule-1',
        name: 'Test Rule',
        description: 'A test rule for validation',
        version: '1.0.0',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {},
        config: {
          applicable_types: ['typescript']
        }
      };

      const result = service.validateRuleConfig(validRule);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject rule with missing required fields', () => {
      const invalidRule: any = {
        id: '',
        name: '',
        description: '',
        version: 'invalid-version',
        type: 'invalid-type',
        severity: 'invalid-severity',
        enabled: true,
        schema: {},
        config: {}
      };

      const result = service.validateRuleConfig(invalidRule);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Rule ID is required');
      expect(result.errors).toContain('Rule name is required');
      expect(result.errors).toContain('Rule description is required');
      expect(result.errors).toContain('Rule version must be in semantic version format (e.g., 1.0.0)');
      expect(result.errors).toContain('Rule type must be one of: static, semantic, security');
      expect(result.errors).toContain('Rule severity must be one of: low, medium, high, critical');
    });

    it('should require applicable_types for static rules', () => {
      const staticRule: Omit<RuleDefinition, 'created_at' | 'updated_at'> = {
        id: 'static-rule',
        name: 'Static Rule',
        description: 'A static rule',
        version: '1.0.0',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {},
        config: {} // Missing applicable_types
      };

      const result = service.validateRuleConfig(staticRule);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Static rules must specify applicable_types in config');
    });

    it('should require applicable_types for semantic rules', () => {
      const semanticRule: Omit<RuleDefinition, 'created_at' | 'updated_at'> = {
        id: 'semantic-rule',
        name: 'Semantic Rule',
        description: 'A semantic rule',
        version: '1.0.0',
        type: 'semantic',
        severity: 'medium',
        enabled: true,
        schema: {},
        config: {} // Missing applicable_types
      };

      const result = service.validateRuleConfig(semanticRule);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Semantic rules must specify applicable_types in config');
    });

    it('should require applicable_types for security rules', () => {
      const securityRule: Omit<RuleDefinition, 'created_at' | 'updated_at'> = {
        id: 'security-rule',
        name: 'Security Rule',
        description: 'A security rule',
        version: '1.0.0',
        type: 'security',
        severity: 'critical',
        enabled: true,
        schema: {},
        config: {} // Missing applicable_types
      };

      const result = service.validateRuleConfig(securityRule);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Security rules must specify applicable_types in config');
    });
  });

  describe('getSupportedArtifactTypes', () => {
    it('should return list of supported artifact types', () => {
      const types = service.getSupportedArtifactTypes();
      
      expect(types).toContain('typescript');
      expect(types).toContain('javascript');
      expect(types).toContain('cloudformation');
      expect(types).toContain('terraform');
      expect(types).toContain('dockerfile');
      expect(types).toContain('python');
      expect(types).toContain('java');
      expect(types).toContain('yaml');
      expect(types).toContain('json');
      expect(types).toContain('markdown');
    });
  });

  describe('getRuleTemplates', () => {
    it('should return predefined rule templates', () => {
      const templates = service.getRuleTemplates();
      
      expect(templates).toHaveProperty('typescript-eslint');
      expect(templates).toHaveProperty('security-secrets');
      expect(templates).toHaveProperty('cloudformation-security');
      expect(templates).toHaveProperty('semantic-architecture');
      
      // Check TypeScript ESLint template
      const tsTemplate = templates['typescript-eslint'];
      expect(tsTemplate.name).toBe('TypeScript ESLint Rules');
      expect(tsTemplate.type).toBe('static');
      expect(tsTemplate.config?.applicable_types).toContain('typescript');
      
      // Check security secrets template
      const securityTemplate = templates['security-secrets'];
      expect(securityTemplate.name).toBe('Hardcoded Secrets Detection');
      expect(securityTemplate.type).toBe('security');
      expect(securityTemplate.severity).toBe('critical');
      
      // Check CloudFormation security template
      const cfnTemplate = templates['cloudformation-security'];
      expect(cfnTemplate.name).toBe('CloudFormation Security Rules');
      expect(cfnTemplate.type).toBe('security');
      expect(cfnTemplate.config?.applicable_types).toContain('cloudformation');
      
      // Check semantic architecture template
      const semanticTemplate = templates['semantic-architecture'];
      expect(semanticTemplate.name).toBe('Architecture Review');
      expect(semanticTemplate.type).toBe('semantic');
      expect(semanticTemplate.config?.analysis_categories).toContain('architecture_patterns');
    });
  });

  describe('validateArtifact', () => {
    it('should validate an artifact and return a report', async () => {
      const request: ArtifactValidationRequest = {
        artifact_id: 'test-artifact-123',
        artifact_type: 'typescript',
        content: 'const x = 1;',
        file_path: 'test.ts'
      };

      // Mock the rules engine validateArtifact method
      const mockReport = {
        artifact_id: 'test-artifact-123',
        overall_score: 85.5,
        max_score: 100,
        passed: true,
        results: [],
        summary: {
          total_rules: 5,
          passed_rules: 4,
          failed_rules: 1,
          critical_issues: 0,
          high_issues: 0,
          medium_issues: 1,
          low_issues: 0
        },
        execution_time_ms: 1500,
        timestamp: new Date().toISOString()
      };

      // Access the private rulesEngine property for mocking
      const rulesEngine = (service as any).rulesEngine;
      rulesEngine.validateArtifact = jest.fn().mockResolvedValue(mockReport);

      const result = await service.validateArtifact(request);
      
      expect(result).toEqual(mockReport);
      expect(rulesEngine.validateArtifact).toHaveBeenCalledWith(request);
    });

    it('should handle validation errors gracefully', async () => {
      const request: ArtifactValidationRequest = {
        artifact_id: 'test-artifact-123',
        artifact_type: 'typescript',
        content: 'const x = 1;',
        file_path: 'test.ts'
      };

      // Mock the rules engine to throw an error
      const rulesEngine = (service as any).rulesEngine;
      rulesEngine.validateArtifact = jest.fn().mockRejectedValue(new Error('Validation failed'));

      await expect(service.validateArtifact(request)).rejects.toThrow('Validation failed');
    });
  });

  describe('getValidationCapabilities', () => {
    it('should return validation capabilities for an artifact type', async () => {
      const mockCapabilities = {
        available_rules: 3,
        rule_types: ['static', 'security'],
        severity_distribution: { medium: 2, high: 1 },
        estimated_execution_time: '30s'
      };

      // Mock the rules engine method
      const rulesEngine = (service as any).rulesEngine;
      rulesEngine.getValidationCapabilities = jest.fn().mockResolvedValue(mockCapabilities);

      const result = await service.getValidationCapabilities('typescript');
      
      expect(result).toEqual(mockCapabilities);
      expect(rulesEngine.getValidationCapabilities).toHaveBeenCalledWith('typescript');
    });
  });
});