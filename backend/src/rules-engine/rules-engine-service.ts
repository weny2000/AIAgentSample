import { RulesEngine } from './rules-engine';
import { RuleRepository } from '../repositories/rule-repository';
import {
  ArtifactValidationRequest,
  ValidationReport,
  RuleDefinition,
  SeverityWeights
} from './types';
import { logger } from '../lambda/utils/logger';

export class RulesEngineService {
  private static instance: RulesEngineService;
  private rulesEngine: RulesEngine;
  private ruleRepository: RuleRepository;

  private constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const tableName = process.env.RULE_DEFINITIONS_TABLE_NAME || 'ai-agent-rule-definitions';

    this.ruleRepository = new RuleRepository({
      region,
      tableName
    });

    // Custom severity weights can be configured via environment variables
    const severityWeights: SeverityWeights = {
      critical: parseInt(process.env.SEVERITY_WEIGHT_CRITICAL || '100'),
      high: parseInt(process.env.SEVERITY_WEIGHT_HIGH || '50'),
      medium: parseInt(process.env.SEVERITY_WEIGHT_MEDIUM || '20'),
      low: parseInt(process.env.SEVERITY_WEIGHT_LOW || '5')
    };

    this.rulesEngine = new RulesEngine(this.ruleRepository, severityWeights);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RulesEngineService {
    if (!RulesEngineService.instance) {
      RulesEngineService.instance = new RulesEngineService();
    }
    return RulesEngineService.instance;
  }

  /**
   * Validate an artifact using the rules engine
   */
  async validateArtifact(request: ArtifactValidationRequest): Promise<ValidationReport> {
    logger.info('RulesEngineService: Starting artifact validation', {
      artifact_id: request.artifact_id,
      artifact_type: request.artifact_type
    });

    try {
      const report = await this.rulesEngine.validateArtifact(request);

      logger.info('RulesEngineService: Validation completed', {
        artifact_id: request.artifact_id,
        overall_score: report.overall_score,
        passed: report.passed,
        execution_time_ms: report.execution_time_ms
      });

      return report;
    } catch (error) {
      logger.error('RulesEngineService: Validation failed', {
        artifact_id: request.artifact_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get validation capabilities for an artifact type
   */
  async getValidationCapabilities(artifactType: string) {
    return this.rulesEngine.getValidationCapabilities(artifactType);
  }

  /**
   * Get all available rules
   */
  async getAllRules(): Promise<RuleDefinition[]> {
    return this.ruleRepository.getAllRules();
  }

  /**
   * Get rules by type
   */
  async getRulesByType(type: 'static' | 'semantic' | 'security'): Promise<RuleDefinition[]> {
    return this.ruleRepository.getRulesByType(type);
  }

  /**
   * Get enabled rules only
   */
  async getEnabledRules(): Promise<RuleDefinition[]> {
    return this.ruleRepository.getEnabledRules();
  }

  /**
   * Create a new rule
   */
  async createRule(rule: Omit<RuleDefinition, 'created_at' | 'updated_at'>): Promise<RuleDefinition> {
    logger.info('RulesEngineService: Creating new rule', { rule_id: rule.id });
    return this.ruleRepository.createRule(rule);
  }

  /**
   * Update an existing rule
   */
  async updateRule(id: string, updates: Partial<Omit<RuleDefinition, 'id' | 'created_at'>>): Promise<RuleDefinition> {
    logger.info('RulesEngineService: Updating rule', { rule_id: id });
    return this.ruleRepository.updateRule(id, updates);
  }

  /**
   * Delete a rule
   */
  async deleteRule(id: string): Promise<void> {
    logger.info('RulesEngineService: Deleting rule', { rule_id: id });
    return this.ruleRepository.deleteRule(id);
  }

  /**
   * Enable or disable a rule
   */
  async toggleRule(id: string, enabled: boolean): Promise<RuleDefinition> {
    logger.info('RulesEngineService: Toggling rule', { rule_id: id, enabled });
    return this.ruleRepository.toggleRule(id, enabled);
  }

  /**
   * Search rules by name or description
   */
  async searchRules(searchTerm: string): Promise<RuleDefinition[]> {
    return this.ruleRepository.searchRules(searchTerm);
  }

  /**
   * Get rule statistics
   */
  async getRuleStats() {
    return this.ruleRepository.getRuleStats();
  }

  /**
   * Validate content against team policies
   */
  async validateContent(content: string, teamId: string): Promise<{
    compliant: boolean;
    score: number;
    violation?: string;
  }> {
    try {
      logger.info('RulesEngineService: Validating content', { teamId, contentLength: content.length });

      // Get team-specific rules
      const rules = await this.getEnabledRules();
      const teamRules = rules.filter(rule =>
        !rule.team_restrictions || rule.team_restrictions.includes(teamId)
      );

      // Check for policy violations
      let violations: string[] = [];
      let totalScore = 1.0;

      for (const rule of teamRules) {
        if (rule.type === 'semantic' && rule.config.contentValidation) {
          const ruleConfig = rule.config.contentValidation;

          // Check for prohibited terms
          if (ruleConfig.prohibitedTerms) {
            const prohibitedFound = ruleConfig.prohibitedTerms.some((term: string) =>
              content.toLowerCase().includes(term.toLowerCase())
            );
            if (prohibitedFound) {
              violations.push(`Content contains prohibited terms from rule: ${rule.name}`);
              totalScore -= rule.severity === 'critical' ? 0.5 : 0.2;
            }
          }

          // Check for required terms
          if (ruleConfig.requiredTerms) {
            const requiredMissing = ruleConfig.requiredTerms.some((term: string) =>
              !content.toLowerCase().includes(term.toLowerCase())
            );
            if (requiredMissing) {
              violations.push(`Content missing required terms from rule: ${rule.name}`);
              totalScore -= rule.severity === 'critical' ? 0.3 : 0.1;
            }
          }

          // Check content length limits
          if (ruleConfig.maxLength && content.length > ruleConfig.maxLength) {
            violations.push(`Content exceeds maximum length from rule: ${rule.name}`);
            totalScore -= 0.1;
          }
        }
      }

      const isCompliant = violations.length === 0;
      const finalScore = Math.max(totalScore, 0);

      logger.info('RulesEngineService: Content validation completed', {
        teamId,
        compliant: isCompliant,
        score: finalScore,
        violationCount: violations.length
      });

      return {
        compliant: isCompliant,
        score: finalScore,
        violation: violations.length > 0 ? violations[0] : undefined
      };

    } catch (error) {
      logger.error('RulesEngineService: Content validation failed', error);
      // Fail open for availability
      return { compliant: true, score: 1.0 };
    }
  }

  /**
   * Validate rule configuration against schema
   */
  validateRuleConfig(rule: Omit<RuleDefinition, 'created_at' | 'updated_at'>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!rule.id || rule.id.trim().length === 0) {
      errors.push('Rule ID is required');
    }

    if (!rule.name || rule.name.trim().length === 0) {
      errors.push('Rule name is required');
    }

    if (!rule.description || rule.description.trim().length === 0) {
      errors.push('Rule description is required');
    }

    if (!rule.version || !/^\d+\.\d+\.\d+$/.test(rule.version)) {
      errors.push('Rule version must be in semantic version format (e.g., 1.0.0)');
    }

    if (!['static', 'semantic', 'security'].includes(rule.type)) {
      errors.push('Rule type must be one of: static, semantic, security');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(rule.severity)) {
      errors.push('Rule severity must be one of: low, medium, high, critical');
    }

    // Type-specific validation
    if (rule.type === 'static') {
      if (!rule.config.applicable_types) {
        errors.push('Static rules must specify applicable_types in config');
      }
    }

    if (rule.type === 'semantic') {
      if (!rule.config.applicable_types) {
        errors.push('Semantic rules must specify applicable_types in config');
      }
    }

    if (rule.type === 'security') {
      if (!rule.config.applicable_types) {
        errors.push('Security rules must specify applicable_types in config');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get supported artifact types
   */
  getSupportedArtifactTypes(): string[] {
    return [
      'typescript',
      'javascript',
      'cloudformation',
      'terraform',
      'dockerfile',
      'python',
      'java',
      'yaml',
      'json',
      'markdown'
    ];
  }

  /**
   * Get rule templates for common scenarios
   */
  getRuleTemplates(): Record<string, Partial<RuleDefinition>> {
    return {
      'typescript-eslint': {
        name: 'TypeScript ESLint Rules',
        description: 'Standard ESLint rules for TypeScript code quality',
        type: 'static',
        severity: 'medium',
        config: {
          applicable_types: ['typescript', 'javascript'],
          eslint: {
            enabled: true,
            rules: {
              '@typescript-eslint/no-unused-vars': 'error',
              '@typescript-eslint/no-explicit-any': 'warn',
              'prefer-const': 'error'
            }
          }
        }
      },
      'security-secrets': {
        name: 'Hardcoded Secrets Detection',
        description: 'Detect hardcoded secrets and credentials in code',
        type: 'security',
        severity: 'critical',
        config: {
          applicable_types: ['*'],
          check_type: 'hardcoded_secrets',
          patterns: [
            'password\\s*=\\s*["\'][^"\']+["\']',
            'api[_-]?key\\s*=\\s*["\'][^"\']+["\']',
            'secret\\s*=\\s*["\'][^"\']+["\']'
          ]
        }
      },
      'cloudformation-security': {
        name: 'CloudFormation Security Rules',
        description: 'Security validation for CloudFormation templates',
        type: 'security',
        severity: 'high',
        config: {
          applicable_types: ['cloudformation', 'yaml', 'json'],
          cfn_nag: {
            enabled: true
          }
        }
      },
      'semantic-architecture': {
        name: 'Architecture Review',
        description: 'LLM-powered architecture and design review',
        type: 'semantic',
        severity: 'medium',
        config: {
          applicable_types: ['*'],
          analysis_categories: [
            'architecture_patterns',
            'code_maintainability',
            'performance_optimization'
          ]
        }
      }
    };
  }
}