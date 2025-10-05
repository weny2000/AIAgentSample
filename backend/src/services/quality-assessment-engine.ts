import {
  DeliverableRecord,
  QualityAssessmentResult,
  QualityDimension,
  ComplianceStatus,
  ComplianceViolation,
  ValidationResult
} from '../models/work-task-models';
import { RulesEngineService } from '../rules-engine/rules-engine-service';
import { ArtifactValidationRequest } from '../rules-engine/types';
import { Logger } from '../lambda/utils/logger';
import { WorkTaskNotificationService } from './work-task-notification-service';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

/**
 * Configuration for quality standards by file type
 */
export interface QualityStandardConfig {
  fileTypes: string[];
  dimensions: QualityDimensionConfig[];
  complianceRules: string[];
  scoringWeights: QualityScoringWeights;
  improvementThresholds: QualityThresholds;
}

export interface QualityDimensionConfig {
  dimension: 'completeness' | 'accuracy' | 'clarity' | 'consistency' | 'format';
  weight: number; // 0-1
  checks: QualityCheck[];
  minimumScore: number; // 0-100
}

export interface QualityCheck {
  name: string;
  type: 'static_analysis' | 'semantic_validation' | 'format_check' | 'content_analysis';
  weight: number; // 0-1
  config: Record<string, any>;
}

export interface QualityScoringWeights {
  staticAnalysis: number;
  semanticValidation: number;
  formatCompliance: number;
  contentQuality: number;
}

export interface QualityThresholds {
  excellent: number; // 90+
  good: number; // 70-89
  acceptable: number; // 50-69
  poor: number; // <50
}

export interface QualityAssessmentContext {
  deliverable: DeliverableRecord;
  fileContent: string;
  validationResult?: ValidationResult;
  teamId?: string;
  projectContext?: Record<string, any>;
}

/**
 * Quality Assessment Engine for automated quality checking and scoring
 * Integrates with existing static analysis tools and semantic validation services
 */
export class QualityAssessmentEngine {
  private rulesEngine: RulesEngineService;
  private s3: S3Client;
  private logger: Logger;
  private workTaskNotificationService?: WorkTaskNotificationService;
  
  // Quality standards configuration by file type
  private readonly qualityStandards: Record<string, QualityStandardConfig> = {
    'code': {
      fileTypes: ['.ts', '.js', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php'],
      dimensions: [
        {
          dimension: 'format',
          weight: 0.2,
          minimumScore: 80,
          checks: [
            {
              name: 'syntax_validation',
              type: 'static_analysis',
              weight: 0.4,
              config: { enableLinting: true, strictMode: true }
            },
            {
              name: 'style_compliance',
              type: 'static_analysis',
              weight: 0.3,
              config: { checkIndentation: true, checkNaming: true }
            },
            {
              name: 'structure_validation',
              type: 'format_check',
              weight: 0.3,
              config: { checkImports: true, checkExports: true }
            }
          ]
        },
        {
          dimension: 'completeness',
          weight: 0.25,
          minimumScore: 70,
          checks: [
            {
              name: 'documentation_coverage',
              type: 'content_analysis',
              weight: 0.4,
              config: { requireComments: true, requireJSDoc: true }
            },
            {
              name: 'test_coverage',
              type: 'static_analysis',
              weight: 0.4,
              config: { minimumCoverage: 70 }
            },
            {
              name: 'error_handling',
              type: 'semantic_validation',
              weight: 0.2,
              config: { checkTryCatch: true, checkErrorTypes: true }
            }
          ]
        },
        {
          dimension: 'accuracy',
          weight: 0.25,
          minimumScore: 75,
          checks: [
            {
              name: 'type_safety',
              type: 'static_analysis',
              weight: 0.5,
              config: { strictTypes: true, noImplicitAny: true }
            },
            {
              name: 'logic_validation',
              type: 'semantic_validation',
              weight: 0.3,
              config: { checkNullChecks: true, checkBoundaries: true }
            },
            {
              name: 'security_validation',
              type: 'static_analysis',
              weight: 0.2,
              config: { checkVulnerabilities: true, checkSecrets: true }
            }
          ]
        },
        {
          dimension: 'clarity',
          weight: 0.15,
          minimumScore: 60,
          checks: [
            {
              name: 'naming_conventions',
              type: 'static_analysis',
              weight: 0.4,
              config: { checkVariableNames: true, checkFunctionNames: true }
            },
            {
              name: 'code_complexity',
              type: 'static_analysis',
              weight: 0.4,
              config: { maxCyclomaticComplexity: 10, maxFunctionLength: 50 }
            },
            {
              name: 'readability_score',
              type: 'semantic_validation',
              weight: 0.2,
              config: { checkCommentQuality: true, checkStructure: true }
            }
          ]
        },
        {
          dimension: 'consistency',
          weight: 0.15,
          minimumScore: 65,
          checks: [
            {
              name: 'style_consistency',
              type: 'static_analysis',
              weight: 0.5,
              config: { checkFormatting: true, checkPatterns: true }
            },
            {
              name: 'architecture_consistency',
              type: 'semantic_validation',
              weight: 0.5,
              config: { checkPatterns: true, checkConventions: true }
            }
          ]
        }
      ],
      complianceRules: ['security-standards', 'coding-standards', 'team-conventions'],
      scoringWeights: {
        staticAnalysis: 0.4,
        semanticValidation: 0.3,
        formatCompliance: 0.2,
        contentQuality: 0.1
      },
      improvementThresholds: {
        excellent: 90,
        good: 70,
        acceptable: 50,
        poor: 50
      }
    },
    'document': {
      fileTypes: ['.md', '.pdf', '.docx', '.txt'],
      dimensions: [
        {
          dimension: 'format',
          weight: 0.2,
          minimumScore: 75,
          checks: [
            {
              name: 'structure_validation',
              type: 'format_check',
              weight: 0.5,
              config: { checkHeaders: true, checkSections: true }
            },
            {
              name: 'markup_validation',
              type: 'format_check',
              weight: 0.3,
              config: { checkMarkdown: true, checkLinks: true }
            },
            {
              name: 'formatting_consistency',
              type: 'format_check',
              weight: 0.2,
              config: { checkSpacing: true, checkIndentation: true }
            }
          ]
        },
        {
          dimension: 'completeness',
          weight: 0.3,
          minimumScore: 70,
          checks: [
            {
              name: 'content_coverage',
              type: 'content_analysis',
              weight: 0.4,
              config: { checkSections: true, minimumWordCount: 100 }
            },
            {
              name: 'requirement_coverage',
              type: 'semantic_validation',
              weight: 0.4,
              config: { checkRequirements: true, checkExamples: true }
            },
            {
              name: 'reference_completeness',
              type: 'content_analysis',
              weight: 0.2,
              config: { checkCitations: true, checkLinks: true }
            }
          ]
        },
        {
          dimension: 'clarity',
          weight: 0.25,
          minimumScore: 65,
          checks: [
            {
              name: 'readability_score',
              type: 'semantic_validation',
              weight: 0.5,
              config: { checkGrammar: true, checkSentenceLength: true }
            },
            {
              name: 'terminology_consistency',
              type: 'semantic_validation',
              weight: 0.3,
              config: { checkTerms: true, checkDefinitions: true }
            },
            {
              name: 'structure_clarity',
              type: 'content_analysis',
              weight: 0.2,
              config: { checkFlow: true, checkTransitions: true }
            }
          ]
        },
        {
          dimension: 'accuracy',
          weight: 0.15,
          minimumScore: 80,
          checks: [
            {
              name: 'fact_checking',
              type: 'semantic_validation',
              weight: 0.6,
              config: { checkClaims: true, checkData: true }
            },
            {
              name: 'technical_accuracy',
              type: 'semantic_validation',
              weight: 0.4,
              config: { checkTechnicalTerms: true, checkProcedures: true }
            }
          ]
        },
        {
          dimension: 'consistency',
          weight: 0.1,
          minimumScore: 70,
          checks: [
            {
              name: 'style_consistency',
              type: 'format_check',
              weight: 0.5,
              config: { checkFormatting: true, checkTone: true }
            },
            {
              name: 'terminology_consistency',
              type: 'semantic_validation',
              weight: 0.5,
              config: { checkTermUsage: true, checkDefinitions: true }
            }
          ]
        }
      ],
      complianceRules: ['documentation-standards', 'accessibility-standards'],
      scoringWeights: {
        staticAnalysis: 0.1,
        semanticValidation: 0.5,
        formatCompliance: 0.2,
        contentQuality: 0.2
      },
      improvementThresholds: {
        excellent: 85,
        good: 70,
        acceptable: 55,
        poor: 55
      }
    },
    'test': {
      fileTypes: ['.test.ts', '.test.js', '.spec.ts', '.spec.js', '.test.py'],
      dimensions: [
        {
          dimension: 'completeness',
          weight: 0.35,
          minimumScore: 80,
          checks: [
            {
              name: 'test_coverage',
              type: 'static_analysis',
              weight: 0.5,
              config: { minimumCoverage: 80, checkBranches: true }
            },
            {
              name: 'scenario_coverage',
              type: 'semantic_validation',
              weight: 0.3,
              config: { checkEdgeCases: true, checkErrorCases: true }
            },
            {
              name: 'assertion_coverage',
              type: 'content_analysis',
              weight: 0.2,
              config: { minimumAssertions: 1, checkAssertionTypes: true }
            }
          ]
        },
        {
          dimension: 'accuracy',
          weight: 0.3,
          minimumScore: 85,
          checks: [
            {
              name: 'test_correctness',
              type: 'static_analysis',
              weight: 0.5,
              config: { checkTestLogic: true, checkMocks: true }
            },
            {
              name: 'assertion_quality',
              type: 'semantic_validation',
              weight: 0.3,
              config: { checkAssertions: true, checkExpectations: true }
            },
            {
              name: 'data_validation',
              type: 'content_analysis',
              weight: 0.2,
              config: { checkTestData: true, checkFixtures: true }
            }
          ]
        },
        {
          dimension: 'clarity',
          weight: 0.2,
          minimumScore: 70,
          checks: [
            {
              name: 'test_naming',
              type: 'static_analysis',
              weight: 0.4,
              config: { checkDescriptiveNames: true, checkConventions: true }
            },
            {
              name: 'test_structure',
              type: 'format_check',
              weight: 0.4,
              config: { checkArrangeActAssert: true, checkGrouping: true }
            },
            {
              name: 'documentation',
              type: 'content_analysis',
              weight: 0.2,
              config: { checkComments: true, checkDescriptions: true }
            }
          ]
        },
        {
          dimension: 'format',
          weight: 0.1,
          minimumScore: 75,
          checks: [
            {
              name: 'syntax_validation',
              type: 'static_analysis',
              weight: 0.6,
              config: { enableLinting: true }
            },
            {
              name: 'style_compliance',
              type: 'static_analysis',
              weight: 0.4,
              config: { checkFormatting: true }
            }
          ]
        },
        {
          dimension: 'consistency',
          weight: 0.05,
          minimumScore: 65,
          checks: [
            {
              name: 'pattern_consistency',
              type: 'semantic_validation',
              weight: 1.0,
              config: { checkTestPatterns: true, checkNaming: true }
            }
          ]
        }
      ],
      complianceRules: ['testing-standards', 'code-quality-standards'],
      scoringWeights: {
        staticAnalysis: 0.5,
        semanticValidation: 0.3,
        formatCompliance: 0.1,
        contentQuality: 0.1
      },
      improvementThresholds: {
        excellent: 90,
        good: 75,
        acceptable: 60,
        poor: 60
      }
    },
    'configuration': {
      fileTypes: ['.json', '.yaml', '.yml', '.xml', '.toml', '.ini'],
      dimensions: [
        {
          dimension: 'format',
          weight: 0.4,
          minimumScore: 90,
          checks: [
            {
              name: 'syntax_validation',
              type: 'static_analysis',
              weight: 0.6,
              config: { validateSyntax: true, strictParsing: true }
            },
            {
              name: 'schema_validation',
              type: 'format_check',
              weight: 0.4,
              config: { validateSchema: true, checkRequired: true }
            }
          ]
        },
        {
          dimension: 'accuracy',
          weight: 0.3,
          minimumScore: 85,
          checks: [
            {
              name: 'value_validation',
              type: 'semantic_validation',
              weight: 0.5,
              config: { checkTypes: true, checkRanges: true }
            },
            {
              name: 'reference_validation',
              type: 'semantic_validation',
              weight: 0.3,
              config: { checkReferences: true, checkPaths: true }
            },
            {
              name: 'security_validation',
              type: 'static_analysis',
              weight: 0.2,
              config: { checkSecrets: true, checkPermissions: true }
            }
          ]
        },
        {
          dimension: 'completeness',
          weight: 0.2,
          minimumScore: 75,
          checks: [
            {
              name: 'required_fields',
              type: 'format_check',
              weight: 0.6,
              config: { checkRequired: true, checkDefaults: true }
            },
            {
              name: 'documentation',
              type: 'content_analysis',
              weight: 0.4,
              config: { checkComments: true, checkDescriptions: true }
            }
          ]
        },
        {
          dimension: 'consistency',
          weight: 0.05,
          minimumScore: 70,
          checks: [
            {
              name: 'naming_consistency',
              type: 'semantic_validation',
              weight: 0.6,
              config: { checkNaming: true, checkConventions: true }
            },
            {
              name: 'structure_consistency',
              type: 'format_check',
              weight: 0.4,
              config: { checkPatterns: true, checkOrganization: true }
            }
          ]
        },
        {
          dimension: 'clarity',
          weight: 0.05,
          minimumScore: 60,
          checks: [
            {
              name: 'readability',
              type: 'content_analysis',
              weight: 1.0,
              config: { checkStructure: true, checkComments: true }
            }
          ]
        }
      ],
      complianceRules: ['security-config-standards', 'infrastructure-standards'],
      scoringWeights: {
        staticAnalysis: 0.4,
        semanticValidation: 0.4,
        formatCompliance: 0.2,
        contentQuality: 0.0
      },
      improvementThresholds: {
        excellent: 95,
        good: 85,
        acceptable: 70,
        poor: 70
      }
    }
  };

  constructor(workTaskNotificationService?: WorkTaskNotificationService) {
    this.rulesEngine = RulesEngineService.getInstance();
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.logger = new Logger({
      correlationId: crypto.randomUUID(),
      operation: 'QualityAssessment'
    });
    this.workTaskNotificationService = workTaskNotificationService;
  }

  /**
   * Perform comprehensive quality assessment on a deliverable
   */
  async performQualityAssessment(
    deliverable: DeliverableRecord,
    qualityStandards: string[] = [],
    context?: Partial<QualityAssessmentContext>
  ): Promise<QualityAssessmentResult> {
    const startTime = Date.now();
    
    this.logger.info('Starting quality assessment', {
      deliverable_id: deliverable.deliverable_id,
      file_type: deliverable.file_type,
      standards: qualityStandards
    });

    try {
      // Download file content
      const fileContent = await this.downloadFileContent(deliverable.s3_key);
      
      // Create assessment context
      const assessmentContext: QualityAssessmentContext = {
        deliverable,
        fileContent,
        validationResult: context?.validationResult,
        teamId: context?.teamId,
        projectContext: context?.projectContext
      };

      // Get quality standard configuration for file type
      const standardConfig = this.getQualityStandardConfig(deliverable.file_type);
      
      // Assess each quality dimension
      const qualityDimensions = await this.assessQualityDimensions(
        assessmentContext,
        standardConfig
      );

      // Calculate overall quality score
      const overallScore = this.calculateOverallScore(qualityDimensions, standardConfig);

      // Generate improvement suggestions
      const improvementSuggestions = await this.generateImprovementSuggestions(
        qualityDimensions,
        standardConfig,
        assessmentContext
      );

      // Check compliance status
      const complianceStatus = await this.checkComplianceStatus(
        assessmentContext,
        qualityStandards.length > 0 ? qualityStandards : standardConfig.complianceRules
      );

      const result: QualityAssessmentResult = {
        overall_score: overallScore,
        quality_dimensions: qualityDimensions,
        improvement_suggestions: improvementSuggestions,
        compliance_status: complianceStatus,
        assessed_at: new Date().toISOString()
      };

      this.logger.performance('Quality assessment completed', {
        deliverable_id: deliverable.deliverable_id,
        overall_score: overallScore,
        dimensions_count: qualityDimensions.length,
        suggestions_count: improvementSuggestions.length,
        is_compliant: complianceStatus.is_compliant,
        duration_ms: Date.now() - startTime
      });

      // Send quality issue notification if there are issues (Requirement 12.3)
      if (improvementSuggestions.length > 0 && this.workTaskNotificationService && context) {
        const severity = this.determineSeverity(overallScore, complianceStatus);
        
        await this.workTaskNotificationService.sendQualityIssueNotification(
          context.task_id || '',
          context.todo_id || '',
          deliverable.deliverable_id,
          {
            severity,
            issues: improvementSuggestions.map(suggestion => ({
              type: suggestion.category || 'general',
              description: suggestion.description,
              suggestion: suggestion.action_items?.[0] || 'Review and fix the issue'
            })),
            quality_score: overallScore,
            submitted_by: context.submitted_by || '',
            team_id: context.team_id || ''
          }
        );
      }

      return result;

    } catch (error) {
      this.logger.error('Quality assessment failed', error, {
        errorType: 'QualityAssessmentError'
      });
      
      return this.createFailedAssessmentResult(error);
    }
  }

  /**
   * Get available quality standards for a file type
   */
  getAvailableQualityStandards(fileType: string): string[] {
    const config = this.getQualityStandardConfig(fileType);
    return config.complianceRules;
  }

  /**
   * Get quality dimension configuration for a file type
   */
  getQualityDimensionConfig(fileType: string): QualityDimensionConfig[] {
    const config = this.getQualityStandardConfig(fileType);
    return config.dimensions;
  }

  /**
   * Validate quality standard configuration
   */
  validateQualityStandardConfig(config: QualityStandardConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Handle null/undefined config
    if (!config || typeof config !== 'object') {
      errors.push('Configuration object is required');
      return { valid: false, errors };
    }

    // Check dimensions
    if (!config.dimensions || !Array.isArray(config.dimensions) || config.dimensions.length === 0) {
      errors.push('Quality standard must define at least one dimension');
      return { valid: false, errors }; // Return early to avoid further null reference errors
    }

    // Check dimension weights sum to 1
    const totalWeight = config.dimensions.reduce((sum, dim) => sum + (dim?.weight || 0), 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      errors.push(`Dimension weights must sum to 1.0, got ${totalWeight}`);
    }

    // Validate each dimension
    config.dimensions.forEach((dimension, index) => {
      if (!dimension) {
        errors.push(`Dimension ${index} is null or undefined`);
        return;
      }

      if (!dimension.checks || !Array.isArray(dimension.checks) || dimension.checks.length === 0) {
        errors.push(`Dimension ${index} must define at least one check`);
        return;
      }

      const checkWeightSum = dimension.checks.reduce((sum, check) => sum + (check?.weight || 0), 0);
      if (Math.abs(checkWeightSum - 1.0) > 0.01) {
        errors.push(`Dimension ${index} check weights must sum to 1.0, got ${checkWeightSum}`);
      }
    });

    // Check scoring weights
    if (config.scoringWeights && typeof config.scoringWeights === 'object') {
      const scoringWeightSum = Object.values(config.scoringWeights).reduce((sum, weight) => sum + (weight || 0), 0);
      if (Math.abs(scoringWeightSum - 1.0) > 0.01) {
        errors.push(`Scoring weights must sum to 1.0, got ${scoringWeightSum}`);
      }
    } else {
      errors.push('Scoring weights configuration is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Private helper methods

  private async assessQualityDimensions(
    context: QualityAssessmentContext,
    config: QualityStandardConfig
  ): Promise<QualityDimension[]> {
    const dimensions: QualityDimension[] = [];

    for (const dimensionConfig of config.dimensions) {
      const dimension = await this.assessSingleDimension(context, dimensionConfig);
      dimensions.push(dimension);
    }

    return dimensions;
  }

  private async assessSingleDimension(
    context: QualityAssessmentContext,
    dimensionConfig: QualityDimensionConfig
  ): Promise<QualityDimension> {
    const checkResults: { score: number; weight: number; details: string }[] = [];

    for (const check of dimensionConfig.checks) {
      const result = await this.executeQualityCheck(context, check);
      checkResults.push({
        score: result.score,
        weight: check.weight,
        details: result.details
      });
    }

    // Calculate weighted score for this dimension
    const totalWeight = checkResults.reduce((sum, result) => sum + result.weight, 0);
    const weightedScore = checkResults.reduce(
      (sum, result) => sum + (result.score * result.weight),
      0
    );
    const dimensionScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    // Combine details from all checks
    const details = checkResults
      .map(result => result.details)
      .filter(detail => detail.length > 0)
      .join('; ');

    return {
      dimension: dimensionConfig.dimension,
      score: dimensionScore,
      weight: dimensionConfig.weight,
      details: details || `${dimensionConfig.dimension} assessment completed`
    };
  }

  private async executeQualityCheck(
    context: QualityAssessmentContext,
    check: QualityCheck
  ): Promise<{ score: number; details: string }> {
    try {
      switch (check.type) {
        case 'static_analysis':
          return await this.executeStaticAnalysisCheck(context, check);
        case 'semantic_validation':
          return await this.executeSemanticValidationCheck(context, check);
        case 'format_check':
          return await this.executeFormatCheck(context, check);
        case 'content_analysis':
          return await this.executeContentAnalysisCheck(context, check);
        default:
          return { score: 50, details: `Unknown check type: ${check.type}` };
      }
    } catch (error) {
      this.logger.error(`Quality check failed: ${check.name}`, error);
      return { score: 0, details: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  private async executeStaticAnalysisCheck(
    context: QualityAssessmentContext,
    check: QualityCheck
  ): Promise<{ score: number; details: string }> {
    // Integrate with rules engine for static analysis
    try {
      const validationRequest: ArtifactValidationRequest = {
        artifact_id: context.deliverable.deliverable_id,
        artifact_type: context.deliverable.file_type,
        content: context.fileContent,
        file_path: context.deliverable.file_name,
        metadata: {
          file_size: context.deliverable.file_size,
          submitted_by: context.deliverable.submitted_by,
          check_name: check.name,
          check_config: check.config
        }
      };

      const report = await this.rulesEngine.validateArtifact(validationRequest);
      
      // Convert rules engine score to 0-100 scale
      const score = Math.round((report.overall_score / report.max_score) * 100);
      
      const details = report.results
        .filter(result => !result.passed)
        .map(result => result.message)
        .join('; ') || 'Static analysis passed';

      return { score, details };
    } catch (error) {
      return { score: 0, details: `Static analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  private async executeSemanticValidationCheck(
    context: QualityAssessmentContext,
    check: QualityCheck
  ): Promise<{ score: number; details: string }> {
    // Use rules engine for semantic validation if team context is available
    if (context.teamId) {
      try {
        const contentValidation = await this.rulesEngine.validateContent(
          context.fileContent,
          context.teamId
        );
        
        const score = Math.round(contentValidation.score * 100);
        const details = contentValidation.compliant 
          ? 'Semantic validation passed'
          : contentValidation.violation || 'Semantic validation failed';

        return { score, details };
      } catch (error) {
        // Fall back to basic semantic checks
      }
    }

    // Basic semantic validation checks
    return await this.executeBasicSemanticChecks(context, check);
  }

  private async executeBasicSemanticChecks(
    context: QualityAssessmentContext,
    check: QualityCheck
  ): Promise<{ score: number; details: string }> {
    let score = 100;
    const issues: string[] = [];

    const content = context.fileContent;
    const config = check.config;

    // Check for common semantic issues based on check configuration
    if (config.checkCommentQuality && this.isCodeFile(context.deliverable.file_name)) {
      const commentRatio = this.calculateCommentRatio(content);
      if (commentRatio < 0.1) {
        score -= 20;
        issues.push('Low comment coverage');
      }
    }

    if (config.checkNullChecks && this.isCodeFile(context.deliverable.file_name)) {
      const nullCheckIssues = this.findNullCheckIssues(content);
      if (nullCheckIssues > 0) {
        score -= Math.min(30, nullCheckIssues * 10);
        issues.push(`${nullCheckIssues} potential null check issues`);
      }
    }

    if (config.checkGrammar && this.isDocumentFile(context.deliverable.file_name)) {
      const grammarScore = this.assessGrammarQuality(content);
      score = Math.min(score, grammarScore);
      if (grammarScore < 80) {
        issues.push('Grammar and readability issues detected');
      }
    }

    return {
      score: Math.max(0, score),
      details: issues.length > 0 ? issues.join('; ') : 'Semantic validation passed'
    };
  }

  private async executeFormatCheck(
    context: QualityAssessmentContext,
    check: QualityCheck
  ): Promise<{ score: number; details: string }> {
    let score = 100;
    const issues: string[] = [];

    const content = context.fileContent;
    const fileName = context.deliverable.file_name;
    const config = check.config;

    // File extension and type validation
    const expectedExtensions = this.getExpectedExtensions(context.deliverable.file_type);
    const actualExtension = this.getFileExtension(fileName);
    if (!expectedExtensions.includes(actualExtension)) {
      score -= 30;
      issues.push(`Unexpected file extension: ${actualExtension}`);
    }

    // Syntax validation for structured files
    if (config.validateSyntax) {
      const syntaxValid = this.validateSyntax(content, actualExtension);
      if (!syntaxValid) {
        score -= 50;
        issues.push('Syntax validation failed');
      }
    }

    // Structure validation
    if (config.checkHeaders && this.isDocumentFile(fileName)) {
      const hasHeaders = /^#+\s/.test(content) || /<h[1-6]>/i.test(content);
      if (!hasHeaders) {
        score -= 20;
        issues.push('No headers found in document');
      }
    }

    if (config.checkIndentation && this.isCodeFile(fileName)) {
      const indentationConsistent = this.checkIndentationConsistency(content);
      if (!indentationConsistent) {
        score -= 15;
        issues.push('Inconsistent indentation');
      }
    }

    return {
      score: Math.max(0, score),
      details: issues.length > 0 ? issues.join('; ') : 'Format validation passed'
    };
  }

  private async executeContentAnalysisCheck(
    context: QualityAssessmentContext,
    check: QualityCheck
  ): Promise<{ score: number; details: string }> {
    let score = 100;
    const issues: string[] = [];

    const content = context.fileContent;
    const config = check.config;

    // Content length validation
    if (config.minimumWordCount) {
      const wordCount = content.split(/\s+/).length;
      if (wordCount < config.minimumWordCount) {
        score -= 30;
        issues.push(`Content too short: ${wordCount} words (minimum: ${config.minimumWordCount})`);
      }
    }

    // Documentation coverage for code files
    if (config.requireComments && this.isCodeFile(context.deliverable.file_name)) {
      const commentCoverage = this.calculateCommentRatio(content);
      if (commentCoverage < 0.15) {
        score -= 25;
        issues.push('Insufficient code documentation');
      }
    }

    // Test coverage analysis for test files
    if (config.minimumAssertions && this.isTestFile(context.deliverable.file_name)) {
      const assertionCount = this.countAssertions(content);
      if (assertionCount < config.minimumAssertions) {
        score -= 40;
        issues.push(`Insufficient test assertions: ${assertionCount} (minimum: ${config.minimumAssertions})`);
      }
    }

    // Link validation for documents
    if (config.checkLinks && this.isDocumentFile(context.deliverable.file_name)) {
      const brokenLinks = this.findBrokenLinks(content);
      if (brokenLinks > 0) {
        score -= Math.min(20, brokenLinks * 5);
        issues.push(`${brokenLinks} potentially broken links`);
      }
    }

    return {
      score: Math.max(0, score),
      details: issues.length > 0 ? issues.join('; ') : 'Content analysis passed'
    };
  }

  private calculateOverallScore(
    dimensions: QualityDimension[],
    config: QualityStandardConfig
  ): number {
    const totalWeight = dimensions.reduce((sum, dim) => sum + dim.weight, 0);
    if (totalWeight === 0) return 0;

    const weightedScore = dimensions.reduce(
      (sum, dim) => sum + (dim.score * dim.weight),
      0
    );

    return Math.round(weightedScore / totalWeight);
  }

  private async generateImprovementSuggestions(
    dimensions: QualityDimension[],
    config: QualityStandardConfig,
    context: QualityAssessmentContext
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Analyze each dimension for improvement opportunities
    for (const dimension of dimensions) {
      const dimensionConfig = config.dimensions.find(d => d.dimension === dimension.dimension);
      if (!dimensionConfig) continue;

      if (dimension.score < dimensionConfig.minimumScore) {
        suggestions.push(
          `Improve ${dimension.dimension}: ${dimension.details} (current: ${dimension.score}, minimum: ${dimensionConfig.minimumScore})`
        );
      } else if (dimension.score < config.improvementThresholds.good) {
        suggestions.push(
          `Consider enhancing ${dimension.dimension} quality: ${dimension.details}`
        );
      }
    }

    // Add file-type specific suggestions
    const fileTypeSpecificSuggestions = this.generateFileTypeSpecificSuggestions(
      context,
      dimensions
    );
    suggestions.push(...fileTypeSpecificSuggestions);

    // Add general improvement suggestions based on overall score
    const overallScore = this.calculateOverallScore(dimensions, config);
    if (overallScore < config.improvementThresholds.acceptable) {
      suggestions.push('Consider reviewing the deliverable requirements and resubmitting');
    } else if (overallScore < config.improvementThresholds.good) {
      suggestions.push('Address the identified issues to improve overall quality');
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  private generateFileTypeSpecificSuggestions(
    context: QualityAssessmentContext,
    dimensions: QualityDimension[]
  ): string[] {
    const suggestions: string[] = [];
    const fileName = context.deliverable.file_name;

    if (this.isCodeFile(fileName)) {
      const formatDimension = dimensions.find(d => d.dimension === 'format');
      if (formatDimension && formatDimension.score < 80) {
        suggestions.push('Run code formatter and linter to improve code style');
      }

      const completenessDimension = dimensions.find(d => d.dimension === 'completeness');
      if (completenessDimension && completenessDimension.score < 70) {
        suggestions.push('Add more comprehensive documentation and error handling');
      }
    }

    if (this.isTestFile(fileName)) {
      const completenessDimension = dimensions.find(d => d.dimension === 'completeness');
      if (completenessDimension && completenessDimension.score < 80) {
        suggestions.push('Increase test coverage and add more edge case scenarios');
      }
    }

    if (this.isDocumentFile(fileName)) {
      const clarityDimension = dimensions.find(d => d.dimension === 'clarity');
      if (clarityDimension && clarityDimension.score < 70) {
        suggestions.push('Improve document structure and readability');
      }
    }

    return suggestions;
  }

  private async checkComplianceStatus(
    context: QualityAssessmentContext,
    standards: string[]
  ): Promise<ComplianceStatus> {
    const violations: ComplianceViolation[] = [];

    // Check each compliance standard
    for (const standard of standards) {
      const standardViolations = await this.checkComplianceStandard(context, standard);
      violations.push(...standardViolations);
    }

    return {
      is_compliant: violations.length === 0,
      standards_checked: standards,
      violations
    };
  }

  private async checkComplianceStandard(
    context: QualityAssessmentContext,
    standard: string
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Use rules engine to check compliance if available
    try {
      const validationRequest: ArtifactValidationRequest = {
        artifact_id: context.deliverable.deliverable_id,
        artifact_type: context.deliverable.file_type,
        content: context.fileContent,
        file_path: context.deliverable.file_name,
        metadata: {
          compliance_standard: standard,
          team_id: context.teamId
        }
      };

      const report = await this.rulesEngine.validateArtifact(validationRequest);
      
      // Convert failed rules to compliance violations
      report.results
        .filter(result => !result.passed)
        .forEach(result => {
          violations.push({
            standard,
            rule: result.rule_name,
            severity: result.severity,
            description: result.message,
            remediation: result.suggested_fix || 'Review and fix the identified issue'
          });
        });

    } catch (error) {
      // Fall back to basic compliance checks
      const basicViolations = this.performBasicComplianceChecks(context, standard);
      violations.push(...basicViolations);
    }

    return violations;
  }

  private performBasicComplianceChecks(
    context: QualityAssessmentContext,
    standard: string
  ): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];
    const content = context.fileContent;
    const fileName = context.deliverable.file_name;

    switch (standard) {
      case 'security-standards':
        // Check for hardcoded secrets
        if (this.containsHardcodedSecrets(content)) {
          violations.push({
            standard,
            rule: 'no-hardcoded-secrets',
            severity: 'critical',
            description: 'File contains potential hardcoded secrets or credentials',
            remediation: 'Remove hardcoded secrets and use secure configuration management'
          });
        }
        break;

      case 'coding-standards':
        if (this.isCodeFile(fileName)) {
          // Check for basic coding standards
          if (!this.hasProperErrorHandling(content)) {
            violations.push({
              standard,
              rule: 'error-handling',
              severity: 'medium',
              description: 'Insufficient error handling in code',
              remediation: 'Add proper try-catch blocks and error handling'
            });
          }
        }
        break;

      case 'documentation-standards':
        if (this.isDocumentFile(fileName)) {
          const wordCount = content.split(/\s+/).length;
          if (wordCount < 50) {
            violations.push({
              standard,
              rule: 'minimum-content',
              severity: 'medium',
              description: 'Document content is too brief',
              remediation: 'Expand documentation with more detailed information'
            });
          }
        }
        break;
    }

    return violations;
  }

  // Utility methods for file type detection and content analysis

  private getQualityStandardConfig(fileType: string): QualityStandardConfig {
    // Handle null/undefined file types
    if (!fileType || typeof fileType !== 'string') {
      return this.qualityStandards['document'];
    }

    // Try exact match first
    if (this.qualityStandards[fileType]) {
      return this.qualityStandards[fileType];
    }

    // Fall back to generic configuration based on file characteristics
    if (fileType.includes('code') || fileType.includes('script')) {
      return this.qualityStandards['code'];
    }
    if (fileType.includes('test')) {
      return this.qualityStandards['test'];
    }
    if (fileType.includes('config')) {
      return this.qualityStandards['configuration'];
    }
    if (fileType.includes('document') || fileType.includes('text')) {
      return this.qualityStandards['document'];
    }

    // Default to document standards
    return this.qualityStandards['document'];
  }

  private async downloadFileContent(s3Key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.WORK_TASK_BUCKET_NAME || 'work-task-analysis-bucket',
        Key: s3Key
      });

      const response = await this.s3.send(command);
      const body = await response.Body?.transformToString();
      return body || '';
    } catch (error) {
      this.logger.error('Failed to download file content', error);
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private isCodeFile(fileName: string): boolean {
    const codeExtensions = ['.ts', '.js', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.cs'];
    const extension = this.getFileExtension(fileName);
    return codeExtensions.includes(extension);
  }

  private isTestFile(fileName: string): boolean {
    return fileName.includes('.test.') || fileName.includes('.spec.') || fileName.includes('test');
  }

  private isDocumentFile(fileName: string): boolean {
    const docExtensions = ['.md', '.txt', '.pdf', '.docx', '.doc', '.rtf'];
    const extension = this.getFileExtension(fileName);
    return docExtensions.includes(extension);
  }

  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot >= 0 ? fileName.substring(lastDot) : '';
  }

  private getExpectedExtensions(fileType: string): string[] {
    const config = this.getQualityStandardConfig(fileType);
    return config.fileTypes;
  }

  private validateSyntax(content: string, extension: string): boolean {
    try {
      switch (extension) {
        case '.json':
          JSON.parse(content);
          return true;
        case '.yaml':
        case '.yml':
          // Basic YAML validation - in production, use proper YAML parser
          return !content.includes('\t') && !/^\s*-\s*$/.test(content);
        case '.xml':
          // Basic XML validation - in production, use proper XML parser
          return content.includes('<') && content.includes('>');
        default:
          return true; // Assume valid for other file types
      }
    } catch {
      return false;
    }
  }

  private checkIndentationConsistency(content: string): boolean {
    const lines = content.split('\n');
    let usesSpaces = false;
    let usesTabs = false;

    for (const line of lines) {
      if (line.startsWith(' ')) usesSpaces = true;
      if (line.startsWith('\t')) usesTabs = true;
      if (usesSpaces && usesTabs) return false;
    }

    return true;
  }

  private calculateCommentRatio(content: string): number {
    const lines = content.split('\n');
    const commentLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('//') || trimmed.startsWith('#') || 
             trimmed.startsWith('/*') || trimmed.startsWith('*');
    });
    
    return lines.length > 0 ? commentLines.length / lines.length : 0;
  }

  private findNullCheckIssues(content: string): number {
    // Simple heuristic for potential null check issues
    const nullAccessPatterns = [
      /\w+\.\w+/g, // property access without null check
      /\w+\[\w+\]/g // array access without null check
    ];

    let issues = 0;
    nullAccessPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        // Check if there are corresponding null checks
        const nullChecks = content.match(/if\s*\(\s*\w+\s*[!=]=\s*null\s*\)/g);
        const nullCheckCount = nullChecks ? nullChecks.length : 0;
        if (matches.length > nullCheckCount * 2) {
          issues += Math.floor((matches.length - nullCheckCount * 2) / 5);
        }
      }
    });

    return issues;
  }

  private assessGrammarQuality(content: string): number {
    // Basic grammar and readability assessment
    let score = 100;

    // Check sentence length
    const sentences = content.split(/[.!?]+/);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
    if (avgSentenceLength > 25) score -= 10;

    // Check for common grammar issues
    const grammarIssues = [
      /\s{2,}/g, // Multiple spaces
      /\n{3,}/g, // Multiple line breaks
      /[a-z]\.[A-Z]/g, // Missing space after period
    ];

    grammarIssues.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        score -= Math.min(15, matches.length * 2);
      }
    });

    return Math.max(0, score);
  }

  private countAssertions(content: string): number {
    const assertionPatterns = [
      /expect\(/g,
      /assert\(/g,
      /should\./g,
      /\.toBe\(/g,
      /\.toEqual\(/g,
      /\.toHaveBeenCalled/g
    ];

    let count = 0;
    assertionPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) count += matches.length;
    });

    return count;
  }

  private findBrokenLinks(content: string): number {
    // Simple check for potentially broken links
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const matches = content.match(linkPattern);
    
    if (!matches) return 0;

    let brokenCount = 0;
    matches.forEach(match => {
      const urlMatch = match.match(/\(([^)]+)\)/);
      if (urlMatch) {
        const url = urlMatch[1];
        // Basic validation - in production, could make HTTP requests to validate
        if (!url.startsWith('http') && !url.startsWith('#') && !url.includes('.')) {
          brokenCount++;
        }
      }
    });

    return brokenCount;
  }

  private containsHardcodedSecrets(content: string): boolean {
    const secretPatterns = [
      /password\s*[=:]\s*["'][^"']{8,}["']/i,
      /api[_-]?key\s*[=:]\s*["'][^"']{16,}["']/i,
      /secret\s*[=:]\s*["'][^"']{16,}["']/i,
      /token\s*[=:]\s*["'][^"']{20,}["']/i,
      /[A-Za-z0-9]{32,}/g // Long alphanumeric strings that might be secrets
    ];

    return secretPatterns.some(pattern => pattern.test(content));
  }

  private hasProperErrorHandling(content: string): boolean {
    const errorHandlingPatterns = [
      /try\s*{/g,
      /catch\s*\(/g,
      /throw\s+/g,
      /\.catch\(/g,
      /Promise\.reject/g
    ];

    // Check if there are function definitions
    const functionCount = (content.match(/function\s+\w+|=>\s*{|\w+\s*\(/g) || []).length;
    
    // Check if there are error handling patterns
    const errorHandlingCount = errorHandlingPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);

    // Expect at least one error handling pattern per 3 functions
    return functionCount === 0 || errorHandlingCount >= Math.ceil(functionCount / 3);
  }

  private determineSeverity(overallScore: number, complianceStatus: ComplianceStatus): 'low' | 'medium' | 'high' | 'critical' {
    // Critical if not compliant and score is very low
    if (!complianceStatus.is_compliant && overallScore < 50) {
      return 'critical';
    }
    
    // High if not compliant or score is low
    if (!complianceStatus.is_compliant || overallScore < 60) {
      return 'high';
    }
    
    // Medium if score is below good threshold
    if (overallScore < 70) {
      return 'medium';
    }
    
    // Low for minor issues
    return 'low';
  }

  private createFailedAssessmentResult(error: any): QualityAssessmentResult {
    return {
      overall_score: 0,
      quality_dimensions: [],
      improvement_suggestions: [
        'Quality assessment failed. Please review the deliverable and resubmit.',
        error instanceof Error ? error.message : 'Unknown assessment error'
      ],
      compliance_status: {
        is_compliant: false,
        standards_checked: [],
        violations: [{
          standard: 'assessment_process',
          rule: 'quality_assessment',
          severity: 'high',
          description: 'Quality assessment process failed',
          remediation: 'Resubmit deliverable or contact support'
        }]
      },
      assessed_at: new Date().toISOString()
    };
  }
}