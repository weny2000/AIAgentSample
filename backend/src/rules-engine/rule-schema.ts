import { JSONSchema7 } from 'json-schema';

export const RULE_DEFINITION_SCHEMA: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['id', 'name', 'description', 'version', 'type', 'severity', 'enabled', 'config'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]+$',
      minLength: 1,
      maxLength: 100
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 1000
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$'
    },
    type: {
      type: 'string',
      enum: ['static', 'semantic', 'security']
    },
    severity: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'critical']
    },
    enabled: {
      type: 'boolean'
    },
    schema: {
      type: 'object'
    },
    config: {
      type: 'object'
    },
    created_at: {
      type: 'string',
      format: 'date-time'
    },
    updated_at: {
      type: 'string',
      format: 'date-time'
    }
  },
  additionalProperties: false
};

export const STATIC_ANALYSIS_CONFIG_SCHEMA: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    eslint: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        config_path: { type: 'string' },
        rules: { type: 'object' }
      },
      required: ['enabled'],
      additionalProperties: false
    },
    cfn_lint: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        ignore_checks: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['enabled'],
      additionalProperties: false
    },
    cfn_nag: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        rule_directory: { type: 'string' }
      },
      required: ['enabled'],
      additionalProperties: false
    },
    snyk: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        severity_threshold: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical']
        }
      },
      required: ['enabled'],
      additionalProperties: false
    }
  },
  additionalProperties: false
};

export const SEMANTIC_ANALYSIS_CONFIG_SCHEMA: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['llm_provider', 'model_name', 'temperature', 'max_tokens', 'prompt_template', 'confidence_threshold'],
  properties: {
    llm_provider: {
      type: 'string',
      enum: ['bedrock', 'openai', 'custom']
    },
    model_name: {
      type: 'string',
      minLength: 1
    },
    temperature: {
      type: 'number',
      minimum: 0,
      maximum: 2
    },
    max_tokens: {
      type: 'integer',
      minimum: 1,
      maximum: 8192
    },
    prompt_template: {
      type: 'string',
      minLength: 1
    },
    confidence_threshold: {
      type: 'number',
      minimum: 0,
      maximum: 1
    }
  },
  additionalProperties: false
};

// Default rule templates for common artifact types
export const DEFAULT_RULE_TEMPLATES = {
  typescript: {
    id: 'typescript-default',
    name: 'TypeScript Default Rules',
    description: 'Standard TypeScript validation rules',
    version: '1.0.0',
    type: 'static' as const,
    severity: 'medium' as const,
    enabled: true,
    schema: STATIC_ANALYSIS_CONFIG_SCHEMA,
    config: {
      eslint: {
        enabled: true,
        rules: {
          '@typescript-eslint/no-unused-vars': 'error',
          '@typescript-eslint/no-explicit-any': 'warn',
          'prefer-const': 'error',
          'no-var': 'error'
        }
      }
    }
  },
  cloudformation: {
    id: 'cloudformation-default',
    name: 'CloudFormation Default Rules',
    description: 'Standard CloudFormation validation rules',
    version: '1.0.0',
    type: 'security' as const,
    severity: 'high' as const,
    enabled: true,
    schema: STATIC_ANALYSIS_CONFIG_SCHEMA,
    config: {
      cfn_lint: {
        enabled: true,
        ignore_checks: []
      },
      cfn_nag: {
        enabled: true
      }
    }
  },
  security: {
    id: 'security-default',
    name: 'Security Default Rules',
    description: 'Standard security validation rules',
    version: '1.0.0',
    type: 'security' as const,
    severity: 'critical' as const,
    enabled: true,
    schema: STATIC_ANALYSIS_CONFIG_SCHEMA,
    config: {
      snyk: {
        enabled: true,
        severity_threshold: 'medium'
      }
    }
  }
};