import { 
  RuleDefinition, 
  ValidationResult, 
  ValidationReport, 
  ArtifactValidationRequest,
  StaticAnalysisConfig,
  SemanticAnalysisConfig,
  SeverityWeights
} from './types';
import { StaticAnalysisEngine } from './static-analysis';
import { SemanticAnalysisEngine } from './semantic-analysis';
import { ScoringAlgorithm } from './scoring-algorithm';
import { RuleRepository } from '../repositories/rule-repository';
import { logger } from '../lambda/utils/logger';

export class RulesEngine {
  private ruleRepository: RuleRepository;
  private staticAnalysisEngine: StaticAnalysisEngine;
  private semanticAnalysisEngine: SemanticAnalysisEngine;
  private severityWeights: SeverityWeights;

  constructor(
    ruleRepository: RuleRepository,
    severityWeights?: SeverityWeights
  ) {
    this.ruleRepository = ruleRepository;
    this.severityWeights = severityWeights || {
      critical: 100,
      high: 50,
      medium: 20,
      low: 5
    };
    
    // Initialize engines with default configs - will be overridden by rule configs
    this.staticAnalysisEngine = new StaticAnalysisEngine({});
    this.semanticAnalysisEngine = new SemanticAnalysisEngine({
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 4096,
      prompt_template: '',
      confidence_threshold: 0.7
    });
  }

  /**
   * Validate an artifact against all applicable rules
   */
  async validateArtifact(request: ArtifactValidationRequest): Promise<ValidationReport> {
    const startTime = Date.now();
    
    logger.info('Starting artifact validation', {
      artifact_id: request.artifact_id,
      artifact_type: request.artifact_type,
      file_path: request.file_path
    });

    try {
      // Get applicable rules for this artifact type
      const applicableRules = await this.getApplicableRules(request.artifact_type);
      
      if (applicableRules.length === 0) {
        logger.warn('No applicable rules found for artifact type', {
          artifact_type: request.artifact_type
        });
        
        return ScoringAlgorithm.createReport(
          request.artifact_id,
          [],
          Date.now() - startTime,
          this.severityWeights
        );
      }

      logger.info(`Found ${applicableRules.length} applicable rules`, {
        rule_types: this.groupRulesByType(applicableRules)
      });

      // Run validation for each rule type
      const allResults: ValidationResult[] = [];

      // Run static analysis rules
      const staticRules = applicableRules.filter(rule => rule.type === 'static');
      if (staticRules.length > 0) {
        const staticResults = await this.runStaticAnalysis(request, staticRules);
        allResults.push(...staticResults);
      }

      // Run security analysis rules
      const securityRules = applicableRules.filter(rule => rule.type === 'security');
      if (securityRules.length > 0) {
        const securityResults = await this.runSecurityAnalysis(request, securityRules);
        allResults.push(...securityResults);
      }

      // Run semantic analysis rules
      const semanticRules = applicableRules.filter(rule => rule.type === 'semantic');
      if (semanticRules.length > 0) {
        const semanticResults = await this.runSemanticAnalysis(request, semanticRules);
        allResults.push(...semanticResults);
      }

      const executionTime = Date.now() - startTime;
      const report = ScoringAlgorithm.createReport(
        request.artifact_id,
        allResults,
        executionTime,
        this.severityWeights
      );

      logger.info('Artifact validation completed', {
        artifact_id: request.artifact_id,
        overall_score: report.overall_score,
        passed: report.passed,
        total_issues: report.summary.failed_rules,
        critical_issues: report.summary.critical_issues,
        execution_time_ms: executionTime
      });

      return report;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Artifact validation failed', {
        artifact_id: request.artifact_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time_ms: executionTime
      });

      // Return a report with an error result
      const errorResult: ValidationResult = {
        rule_id: 'validation-engine-error',
        rule_name: 'Validation Engine Error',
        passed: false,
        severity: 'high',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };

      return ScoringAlgorithm.createReport(
        request.artifact_id,
        [errorResult],
        executionTime,
        this.severityWeights
      );
    }
  }

  /**
   * Get rules applicable to a specific artifact type
   */
  private async getApplicableRules(artifactType: string): Promise<RuleDefinition[]> {
    const enabledRules = await this.ruleRepository.getEnabledRules();
    
    return enabledRules.filter(rule => {
      const applicableTypes = rule.config.applicable_types;
      
      if (!applicableTypes) {
        return false;
      }
      
      if (Array.isArray(applicableTypes)) {
        return applicableTypes.includes(artifactType) || applicableTypes.includes('*');
      }
      
      return applicableTypes === artifactType || applicableTypes === '*';
    });
  }

  /**
   * Run static analysis rules
   */
  private async runStaticAnalysis(
    request: ArtifactValidationRequest,
    rules: RuleDefinition[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of rules) {
      try {
        logger.debug('Running static analysis rule', { rule_id: rule.id });
        
        // Configure static analysis engine for this rule
        const config: StaticAnalysisConfig = {
          eslint: rule.config.eslint,
          cfn_lint: rule.config.cfn_lint,
          cfn_nag: rule.config.cfn_nag,
          snyk: rule.config.snyk
        };

        const engine = new StaticAnalysisEngine(config);
        const ruleResults = await engine.runAnalysis(request);
        
        // Add rule context to results
        const contextualResults = ruleResults.map(result => ({
          ...result,
          rule_id: `${rule.id}-${result.rule_id}`,
          details: {
            ...result.details,
            parent_rule_id: rule.id,
            parent_rule_name: rule.name
          }
        }));

        results.push(...contextualResults);
        
      } catch (error) {
        logger.error('Static analysis rule failed', {
          rule_id: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        results.push({
          rule_id: `${rule.id}-error`,
          rule_name: `${rule.name} (Error)`,
          passed: false,
          severity: 'medium',
          message: `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { 
            rule_id: rule.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }

    return results;
  }

  /**
   * Run security analysis rules
   */
  private async runSecurityAnalysis(
    request: ArtifactValidationRequest,
    rules: RuleDefinition[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of rules) {
      try {
        logger.debug('Running security analysis rule', { rule_id: rule.id });

        if (rule.config.check_type === 'hardcoded_secrets') {
          const secretResults = await this.checkHardcodedSecrets(request, rule);
          results.push(...secretResults);
        } else if (rule.config.snyk?.enabled) {
          // Use static analysis engine for Snyk security scanning
          const config: StaticAnalysisConfig = { snyk: rule.config.snyk };
          const engine = new StaticAnalysisEngine(config);
          const snykResults = await engine.runAnalysis(request);
          
          const contextualResults = snykResults.map(result => ({
            ...result,
            rule_id: `${rule.id}-${result.rule_id}`,
            details: {
              ...result.details,
              parent_rule_id: rule.id,
              parent_rule_name: rule.name
            }
          }));

          results.push(...contextualResults);
        } else {
          // Generic security rule - use semantic analysis
          const semanticResults = await this.runSemanticSecurityAnalysis(request, rule);
          results.push(...semanticResults);
        }

      } catch (error) {
        logger.error('Security analysis rule failed', {
          rule_id: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        results.push({
          rule_id: `${rule.id}-error`,
          rule_name: `${rule.name} (Error)`,
          passed: false,
          severity: rule.severity,
          message: `Security rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { 
            rule_id: rule.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }

    return results;
  }

  /**
   * Run semantic analysis rules
   */
  private async runSemanticAnalysis(
    request: ArtifactValidationRequest,
    rules: RuleDefinition[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of rules) {
      try {
        logger.debug('Running semantic analysis rule', { rule_id: rule.id });

        // Configure semantic analysis engine for this rule
        const config: SemanticAnalysisConfig = {
          llm_provider: rule.config.llm_provider || 'bedrock',
          model_name: rule.config.model_name || 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: rule.config.temperature || 0.1,
          max_tokens: rule.config.max_tokens || 4096,
          prompt_template: this.buildSemanticPrompt(rule),
          confidence_threshold: rule.config.confidence_threshold || 0.7
        };

        const engine = new SemanticAnalysisEngine(config);
        const ruleResults = await engine.runAnalysis(request);
        
        // Add rule context to results
        const contextualResults = ruleResults.map(result => ({
          ...result,
          rule_id: `${rule.id}-${result.rule_id}`,
          details: {
            ...result.details,
            parent_rule_id: rule.id,
            parent_rule_name: rule.name,
            analysis_categories: rule.config.analysis_categories
          }
        }));

        results.push(...contextualResults);

      } catch (error) {
        logger.error('Semantic analysis rule failed', {
          rule_id: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        results.push({
          rule_id: `${rule.id}-error`,
          rule_name: `${rule.name} (Error)`,
          passed: false,
          severity: rule.severity,
          message: `Semantic rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { 
            rule_id: rule.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }

    return results;
  }

  /**
   * Check for hardcoded secrets using regex patterns
   */
  private async checkHardcodedSecrets(
    request: ArtifactValidationRequest,
    rule: RuleDefinition
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const patterns = rule.config.patterns || [];
    const content = request.content;
    const lines = content.split('\n');

    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = line.match(regex);
        
        if (matches) {
          for (const match of matches) {
            results.push({
              rule_id: `${rule.id}-hardcoded-secret`,
              rule_name: `${rule.name}: Hardcoded Secret Detected`,
              passed: false,
              severity: rule.severity,
              message: `Potential hardcoded secret found: ${match.substring(0, 20)}...`,
              source_location: {
                file: request.file_path,
                line: i + 1,
                column: line.indexOf(match) + 1
              },
              suggested_fix: 'Move sensitive values to environment variables or secure secret storage',
              details: {
                pattern: pattern,
                match_preview: match.substring(0, 50)
              }
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Run semantic security analysis
   */
  private async runSemanticSecurityAnalysis(
    request: ArtifactValidationRequest,
    rule: RuleDefinition
  ): Promise<ValidationResult[]> {
    const config: SemanticAnalysisConfig = {
      llm_provider: 'bedrock',
      model_name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.1,
      max_tokens: 4096,
      prompt_template: this.buildSecurityPrompt(rule),
      confidence_threshold: 0.8 // Higher threshold for security issues
    };

    const engine = new SemanticAnalysisEngine(config);
    return engine.runAnalysis(request);
  }

  /**
   * Build semantic analysis prompt based on rule configuration
   */
  private buildSemanticPrompt(rule: RuleDefinition): string {
    const categories = rule.config.analysis_categories || [];
    const categoriesText = categories.length > 0 
      ? `Focus on these specific areas: ${categories.join(', ')}`
      : 'Perform general code quality analysis';

    return `You are a senior software architect analyzing a {artifact_type} artifact for quality and best practices.

${categoriesText}

Artifact Type: {artifact_type}
File Path: {file_path}
Metadata: {metadata}

Content:
{content}

Please analyze this artifact and identify any issues. For each issue found, provide:
- A unique rule_id (use format: semantic-[category]-[number])
- A descriptive rule_name
- Severity level (critical, high, medium, low)
- Clear description of the issue
- Specific location if applicable (line numbers)
- Suggested fix or improvement
- Confidence score (0.0 to 1.0)

Respond in JSON format:
{
  "issues": [
    {
      "rule_id": "semantic-architecture-001",
      "rule_name": "Architecture Pattern Violation",
      "severity": "medium",
      "message": "Description of the issue",
      "line": 15,
      "suggested_fix": "Suggested improvement",
      "confidence": 0.85
    }
  ]
}

If no issues are found, return: {"issues": []}`;
  }

  /**
   * Build security analysis prompt
   */
  private buildSecurityPrompt(rule: RuleDefinition): string {
    const securityChecks = rule.config.security_checks || rule.config.compliance_checks || [];
    const checksText = securityChecks.length > 0 
      ? `Focus on these security aspects: ${securityChecks.join(', ')}`
      : 'Perform comprehensive security analysis';

    return `You are a cybersecurity expert analyzing a {artifact_type} artifact for security vulnerabilities and compliance issues.

${checksText}

Artifact Type: {artifact_type}
File Path: {file_path}
Metadata: {metadata}

Content:
{content}

Please analyze this artifact for security issues including:
- Authentication and authorization flaws
- Input validation issues
- Cryptographic problems
- Configuration security
- Data exposure risks
- Injection vulnerabilities
- Access control issues

For each security issue found, provide:
- A unique rule_id (use format: security-[category]-[number])
- A descriptive rule_name
- Severity level (critical, high, medium, low) - be conservative with critical
- Clear description of the security risk
- Specific location if applicable (line numbers)
- Suggested remediation
- Confidence score (0.0 to 1.0)

Respond in JSON format:
{
  "issues": [
    {
      "rule_id": "security-auth-001",
      "rule_name": "Weak Authentication",
      "severity": "high",
      "message": "Description of the security issue",
      "line": 15,
      "suggested_fix": "Security remediation steps",
      "confidence": 0.90
    }
  ]
}

If no security issues are found, return: {"issues": []}`;
  }

  /**
   * Group rules by type for logging
   */
  private groupRulesByType(rules: RuleDefinition[]): Record<string, number> {
    return rules.reduce((acc, rule) => {
      acc[rule.type] = (acc[rule.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get validation capabilities for an artifact type
   */
  async getValidationCapabilities(artifactType: string): Promise<{
    available_rules: number;
    rule_types: string[];
    severity_distribution: Record<string, number>;
    estimated_execution_time: string;
  }> {
    const applicableRules = await this.getApplicableRules(artifactType);
    
    const ruleTypes = [...new Set(applicableRules.map(rule => rule.type))];
    const severityDistribution = applicableRules.reduce((acc, rule) => {
      acc[rule.severity] = (acc[rule.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Estimate execution time based on rule types
    let estimatedSeconds = 10; // Base time
    if (ruleTypes.includes('static')) estimatedSeconds += 20;
    if (ruleTypes.includes('security')) estimatedSeconds += 30;
    if (ruleTypes.includes('semantic')) estimatedSeconds += 60;

    return {
      available_rules: applicableRules.length,
      rule_types: ruleTypes,
      severity_distribution: severityDistribution,
      estimated_execution_time: `${estimatedSeconds}s`
    };
  }
}