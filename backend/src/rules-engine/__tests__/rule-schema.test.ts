import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { 
  RULE_DEFINITION_SCHEMA, 
  STATIC_ANALYSIS_CONFIG_SCHEMA, 
  SEMANTIC_ANALYSIS_CONFIG_SCHEMA,
  DEFAULT_RULE_TEMPLATES 
} from '../rule-schema';
import { RuleDefinition } from '../types';

describe('Rule Schema Validation', () => {
  let ajv: Ajv;

  beforeEach(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
  });

  describe('RULE_DEFINITION_SCHEMA', () => {
    it('should validate a correct rule definition', () => {
      const validRule: RuleDefinition = {
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
        },
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      const valid = validate(validRule);
      
      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it('should reject rule with invalid ID format', () => {
      const invalidRule = {
        id: 'invalid id with spaces',
        name: 'Test Rule',
        description: 'A test rule',
        version: '1.0.0',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {},
        config: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      const valid = validate(invalidRule);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors![0].instancePath).toBe('/id');
    });

    it('should reject rule with invalid version format', () => {
      const invalidRule = {
        id: 'test-rule-1',
        name: 'Test Rule',
        description: 'A test rule',
        version: 'invalid-version',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {},
        config: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      const valid = validate(invalidRule);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors![0].instancePath).toBe('/version');
    });

    it('should reject rule with invalid type', () => {
      const invalidRule = {
        id: 'test-rule-1',
        name: 'Test Rule',
        description: 'A test rule',
        version: '1.0.0',
        type: 'invalid-type',
        severity: 'medium',
        enabled: true,
        schema: {},
        config: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      const valid = validate(invalidRule);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors![0].instancePath).toBe('/type');
    });

    it('should reject rule with invalid severity', () => {
      const invalidRule = {
        id: 'test-rule-1',
        name: 'Test Rule',
        description: 'A test rule',
        version: '1.0.0',
        type: 'static',
        severity: 'invalid-severity',
        enabled: true,
        schema: {},
        config: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z'
      };

      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      const valid = validate(invalidRule);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors![0].instancePath).toBe('/severity');
    });

    it('should reject rule with missing required fields', () => {
      const invalidRule = {
        id: 'test-rule-1',
        // Missing required fields
      };

      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      const valid = validate(invalidRule);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('STATIC_ANALYSIS_CONFIG_SCHEMA', () => {
    it('should validate a correct static analysis config', () => {
      const validConfig = {
        eslint: {
          enabled: true,
          config_path: '.eslintrc.js',
          rules: {
            'no-unused-vars': 'error',
            'prefer-const': 'warn'
          }
        },
        cfn_lint: {
          enabled: true,
          ignore_checks: ['W3002', 'W3003']
        },
        cfn_nag: {
          enabled: false,
          rule_directory: '/custom/rules'
        },
        snyk: {
          enabled: true,
          severity_threshold: 'medium'
        }
      };

      const validate = ajv.compile(STATIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(validConfig);
      
      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it('should reject config with invalid severity threshold', () => {
      const invalidConfig = {
        snyk: {
          enabled: true,
          severity_threshold: 'invalid-severity'
        }
      };

      const validate = ajv.compile(STATIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(invalidConfig);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });

    it('should require enabled field for each tool', () => {
      const invalidConfig = {
        eslint: {
          // Missing enabled field
          rules: {}
        }
      };

      const validate = ajv.compile(STATIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(invalidConfig);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });
  });

  describe('SEMANTIC_ANALYSIS_CONFIG_SCHEMA', () => {
    it('should validate a correct semantic analysis config', () => {
      const validConfig = {
        llm_provider: 'bedrock',
        model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.1,
        max_tokens: 4096,
        prompt_template: 'Analyze this code for issues: {content}',
        confidence_threshold: 0.8
      };

      const validate = ajv.compile(SEMANTIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(validConfig);
      
      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it('should reject config with invalid LLM provider', () => {
      const invalidConfig = {
        llm_provider: 'invalid-provider',
        model_name: 'test-model',
        temperature: 0.1,
        max_tokens: 1000,
        prompt_template: 'test',
        confidence_threshold: 0.8
      };

      const validate = ajv.compile(SEMANTIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(invalidConfig);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });

    it('should reject config with temperature out of range', () => {
      const invalidConfig = {
        llm_provider: 'bedrock',
        model_name: 'test-model',
        temperature: 3.0, // Out of range (0-2)
        max_tokens: 1000,
        prompt_template: 'test',
        confidence_threshold: 0.8
      };

      const validate = ajv.compile(SEMANTIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(invalidConfig);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });

    it('should reject config with confidence threshold out of range', () => {
      const invalidConfig = {
        llm_provider: 'bedrock',
        model_name: 'test-model',
        temperature: 0.1,
        max_tokens: 1000,
        prompt_template: 'test',
        confidence_threshold: 1.5 // Out of range (0-1)
      };

      const validate = ajv.compile(SEMANTIC_ANALYSIS_CONFIG_SCHEMA);
      const valid = validate(invalidConfig);
      
      expect(valid).toBe(false);
      expect(validate.errors).toBeDefined();
    });
  });

  describe('DEFAULT_RULE_TEMPLATES', () => {
    it('should have valid TypeScript template', () => {
      const template = DEFAULT_RULE_TEMPLATES.typescript;
      
      expect(template.id).toBe('typescript-default');
      expect(template.type).toBe('static');
      expect(template.severity).toBe('medium');
      expect(template.enabled).toBe(true);
      expect(template.config.eslint?.enabled).toBe(true);
      expect(template.config.eslint?.rules).toBeDefined();
    });

    it('should have valid CloudFormation template', () => {
      const template = DEFAULT_RULE_TEMPLATES.cloudformation;
      
      expect(template.id).toBe('cloudformation-default');
      expect(template.type).toBe('security');
      expect(template.severity).toBe('high');
      expect(template.enabled).toBe(true);
      expect(template.config.cfn_lint?.enabled).toBe(true);
      expect(template.config.cfn_nag?.enabled).toBe(true);
    });

    it('should have valid security template', () => {
      const template = DEFAULT_RULE_TEMPLATES.security;
      
      expect(template.id).toBe('security-default');
      expect(template.type).toBe('security');
      expect(template.severity).toBe('critical');
      expect(template.enabled).toBe(true);
      expect(template.config.snyk?.enabled).toBe(true);
    });

    it('should validate all default templates against schema', () => {
      const validate = ajv.compile(RULE_DEFINITION_SCHEMA);
      
      Object.values(DEFAULT_RULE_TEMPLATES).forEach(template => {
        const ruleWithTimestamps = {
          ...template,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        };
        
        const valid = validate(ruleWithTimestamps);
        
        if (!valid) {
          console.error(`Template ${template.id} validation errors:`, validate.errors);
        }
        
        expect(valid).toBe(true);
      });
    });
  });
});