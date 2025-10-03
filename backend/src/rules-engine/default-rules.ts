import { RuleDefinition } from './types';

/**
 * Default rule definitions that are seeded into the system
 */
export const DEFAULT_RULES: Omit<RuleDefinition, 'created_at' | 'updated_at'>[] = [
  // TypeScript/JavaScript Static Analysis Rules
  {
    id: 'typescript-eslint-basic',
    name: 'TypeScript ESLint Basic Rules',
    description: 'Basic ESLint rules for TypeScript code quality and consistency',
    version: '1.0.0',
    type: 'static',
    severity: 'medium',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['typescript', 'javascript'],
      eslint: {
        enabled: true,
        rules: {
          '@typescript-eslint/no-unused-vars': 'error',
          '@typescript-eslint/no-explicit-any': 'warn',
          'prefer-const': 'error',
          'no-var': 'error',
          'no-console': 'warn',
          'eqeqeq': 'error',
          'no-eval': 'error'
        }
      }
    }
  },

  // Security Rules
  {
    id: 'security-hardcoded-secrets',
    name: 'Hardcoded Secrets Detection',
    description: 'Detect hardcoded secrets, passwords, and API keys in code',
    version: '1.0.0',
    type: 'security',
    severity: 'critical',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['*'],
      check_type: 'hardcoded_secrets',
      patterns: [
        'password\\s*[=:]\\s*["\'][^"\'\\s]{8,}["\']',
        'api[_-]?key\\s*[=:]\\s*["\'][^"\'\\s]{16,}["\']',
        'secret\\s*[=:]\\s*["\'][^"\'\\s]{16,}["\']',
        'token\\s*[=:]\\s*["\'][^"\'\\s]{20,}["\']',
        'aws[_-]?access[_-]?key[_-]?id\\s*[=:]\\s*["\'][A-Z0-9]{20}["\']',
        'aws[_-]?secret[_-]?access[_-]?key\\s*[=:]\\s*["\'][A-Za-z0-9/+=]{40}["\']'
      ]
    }
  },

  {
    id: 'security-snyk-vulnerabilities',
    name: 'Snyk Vulnerability Scanning',
    description: 'Scan for known security vulnerabilities using Snyk',
    version: '1.0.0',
    type: 'security',
    severity: 'high',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['typescript', 'javascript', 'python', 'java'],
      snyk: {
        enabled: true,
        severity_threshold: 'medium'
      }
    }
  },

  // CloudFormation Rules
  {
    id: 'cloudformation-lint',
    name: 'CloudFormation Template Validation',
    description: 'Validate CloudFormation templates for syntax and best practices',
    version: '1.0.0',
    type: 'static',
    severity: 'high',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['cloudformation', 'yaml', 'json'],
      cfn_lint: {
        enabled: true,
        ignore_checks: []
      }
    }
  },

  {
    id: 'cloudformation-security',
    name: 'CloudFormation Security Rules',
    description: 'Security validation for CloudFormation templates using cfn-nag',
    version: '1.0.0',
    type: 'security',
    severity: 'high',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['cloudformation', 'yaml', 'json'],
      cfn_nag: {
        enabled: true
      }
    }
  },

  // Semantic Analysis Rules
  {
    id: 'semantic-architecture-review',
    name: 'Architecture and Design Review',
    description: 'LLM-powered analysis of architecture patterns and design decisions',
    version: '1.0.0',
    type: 'semantic',
    severity: 'medium',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['*'],
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 4096,
      confidence_threshold: 0.7,
      analysis_categories: [
        'architecture_patterns',
        'design_principles',
        'code_maintainability',
        'performance_considerations'
      ]
    }
  },

  {
    id: 'semantic-security-review',
    name: 'Semantic Security Analysis',
    description: 'LLM-powered security analysis for complex security patterns',
    version: '1.0.0',
    type: 'semantic',
    severity: 'high',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['*'],
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 4096,
      confidence_threshold: 0.8,
      security_checks: [
        'authentication_flaws',
        'authorization_issues',
        'input_validation',
        'cryptographic_issues',
        'configuration_security',
        'data_exposure_risks'
      ]
    }
  },

  {
    id: 'semantic-business-logic',
    name: 'Business Logic Validation',
    description: 'Analyze business logic for correctness and edge cases',
    version: '1.0.0',
    type: 'semantic',
    severity: 'medium',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['typescript', 'javascript', 'python', 'java'],
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 4096,
      confidence_threshold: 0.7,
      analysis_categories: [
        'business_logic_errors',
        'edge_case_handling',
        'error_handling',
        'data_validation'
      ]
    }
  },

  // Documentation Rules
  {
    id: 'documentation-completeness',
    name: 'Documentation Completeness Check',
    description: 'Ensure adequate documentation and comments in code',
    version: '1.0.0',
    type: 'semantic',
    severity: 'low',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['*'],
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 2048,
      confidence_threshold: 0.6,
      analysis_categories: [
        'code_documentation',
        'api_documentation',
        'inline_comments',
        'readme_completeness'
      ]
    }
  },

  // Performance Rules
  {
    id: 'performance-optimization',
    name: 'Performance Optimization Analysis',
    description: 'Identify potential performance bottlenecks and optimization opportunities',
    version: '1.0.0',
    type: 'semantic',
    severity: 'low',
    enabled: true,
    schema: {},
    config: {
      applicable_types: ['typescript', 'javascript', 'python', 'java'],
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 4096,
      confidence_threshold: 0.7,
      analysis_categories: [
        'algorithmic_complexity',
        'memory_usage',
        'database_queries',
        'caching_opportunities',
        'async_patterns'
      ]
    }
  }
];

/**
 * Get default rules by type
 */
export function getDefaultRulesByType(type: 'static' | 'semantic' | 'security'): Omit<RuleDefinition, 'created_at' | 'updated_at'>[] {
  return DEFAULT_RULES.filter(rule => rule.type === type);
}

/**
 * Get default rules by artifact type
 */
export function getDefaultRulesForArtifactType(artifactType: string): Omit<RuleDefinition, 'created_at' | 'updated_at'>[] {
  return DEFAULT_RULES.filter(rule => {
    const applicableTypes = rule.config.applicable_types;
    if (Array.isArray(applicableTypes)) {
      return applicableTypes.includes(artifactType) || applicableTypes.includes('*');
    }
    return applicableTypes === artifactType || applicableTypes === '*';
  });
}

/**
 * Get rule template for creating custom rules
 */
export function getRuleTemplate(type: 'static' | 'semantic' | 'security'): Partial<RuleDefinition> {
  const templates = {
    static: {
      type: 'static' as const,
      severity: 'medium' as const,
      enabled: true,
      config: {
        applicable_types: ['typescript'],
        eslint: {
          enabled: true,
          rules: {}
        }
      }
    },
    semantic: {
      type: 'semantic' as const,
      severity: 'medium' as const,
      enabled: true,
      config: {
        applicable_types: ['*'],
        llm_provider: 'bedrock',
        model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.1,
        max_tokens: 4096,
        confidence_threshold: 0.7,
        analysis_categories: []
      }
    },
    security: {
      type: 'security' as const,
      severity: 'high' as const,
      enabled: true,
      config: {
        applicable_types: ['*'],
        check_type: 'custom_security_check'
      }
    }
  };

  return templates[type];
}