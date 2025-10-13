import { 
  DeliverableRecord, 
  ValidationResult, 
  QualityAssessmentResult, 
  TodoItemRecord,
  ValidationCheck,
  ValidationIssue,
  QualityDimension,
  ComplianceStatus,
  ComplianceViolation,
  DeliverableRequirement
} from '../models/work-task-models';
import { RulesEngineService } from '../rules-engine/rules-engine-service';
import { ArtifactValidationRequest, ValidationReport } from '../rules-engine/types';
import { Logger } from '../lambda/utils/logger';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

export interface FileTypeConfig {
  extensions: string[];
  mimeTypes: string[];
  maxSize: number; // in bytes
  securityChecks: string[];
  qualityStandards: string[];
}

export interface SecurityScanResult {
  isClean: boolean;
  threats: SecurityThreat[];
  scanEngine: string;
  scanTimestamp: string;
}

export interface SecurityThreat {
  type: 'virus' | 'malware' | 'suspicious_content' | 'embedded_script';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
}

export interface CompletionAssessment {
  isComplete: boolean;
  completionScore: number; // 0-100
  missingRequirements: string[];
  satisfiedRequirements: string[];
  recommendations: string[];
}

export class ArtifactValidationService {
  private rulesEngine: RulesEngineService;
  private s3: S3Client;
  private logger: Logger;
  
  // File type configurations
  private readonly fileTypeConfigs: Record<string, FileTypeConfig> = {
    'document': {
      extensions: ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'],
      mimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'text/markdown',
        'application/rtf'
      ],
      maxSize: 50 * 1024 * 1024, // 50MB
      securityChecks: ['virus_scan', 'content_analysis', 'metadata_check'],
      qualityStandards: ['format_compliance', 'content_completeness', 'readability']
    },
    'code': {
      extensions: ['.ts', '.js', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php'],
      mimeTypes: [
        'text/typescript',
        'text/javascript',
        'text/x-python',
        'text/x-java-source',
        'text/x-c++src',
        'text/x-csrc',
        'text/x-go',
        'text/x-rust',
        'text/x-php'
      ],
      maxSize: 10 * 1024 * 1024, // 10MB
      securityChecks: ['static_analysis', 'secret_detection', 'vulnerability_scan'],
      qualityStandards: ['syntax_check', 'style_compliance', 'security_standards']
    },
    'test': {
      extensions: ['.test.ts', '.test.js', '.spec.ts', '.spec.js', '.py'],
      mimeTypes: ['text/typescript', 'text/javascript', 'text/x-python'],
      maxSize: 5 * 1024 * 1024, // 5MB
      securityChecks: ['static_analysis', 'dependency_check'],
      qualityStandards: ['test_coverage', 'assertion_quality', 'test_structure']
    },
    'configuration': {
      extensions: ['.json', '.yaml', '.yml', '.xml', '.toml', '.ini'],
      mimeTypes: [
        'application/json',
        'application/x-yaml',
        'text/yaml',
        'application/xml',
        'text/xml',
        'application/toml'
      ],
      maxSize: 1 * 1024 * 1024, // 1MB
      securityChecks: ['schema_validation', 'secret_detection', 'permission_check'],
      qualityStandards: ['schema_compliance', 'format_validation', 'security_config']
    },
    'image': {
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
      mimeTypes: [
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/svg+xml',
        'image/webp'
      ],
      maxSize: 20 * 1024 * 1024, // 20MB
      securityChecks: ['virus_scan', 'metadata_analysis', 'embedded_content_check'],
      qualityStandards: ['resolution_check', 'format_optimization', 'accessibility']
    }
  };

  constructor() {
    this.rulesEngine = RulesEngineService.getInstance();
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.logger = new Logger({
      correlationId: crypto.randomUUID(),
      operation: 'ArtifactValidation'
    });
  }

  /**
   * Validate a deliverable file against requirements and quality standards
   */
  async validateDeliverable(
    todoId: string, 
    deliverable: DeliverableRecord
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    
    this.logger.info('Starting deliverable validation', {
      deliverable_id: deliverable.deliverable_id,
      todo_id: todoId,
      file_type: deliverable.file_type,
      file_size: deliverable.file_size
    });

    try {
      // 1. Basic file validation
      const basicValidation = await this.performBasicValidation(deliverable);
      
      // 2. Security scanning
      const securityScan = await this.performSecurityScan(deliverable);
      
      // 3. Rules engine compliance check
      const complianceCheck = await this.performComplianceCheck(deliverable);
      
      // 4. File type specific validation
      const typeSpecificValidation = await this.performTypeSpecificValidation(deliverable);
      
      // Combine all validation results
      const allChecks = [
        ...basicValidation.checks_performed,
        ...securityScan.checks_performed,
        ...complianceCheck.checks_performed,
        ...typeSpecificValidation.checks_performed
      ];
      
      const allIssues = [
        ...basicValidation.issues_found,
        ...securityScan.issues_found,
        ...complianceCheck.issues_found,
        ...typeSpecificValidation.issues_found
      ];
      
      const allRecommendations = [
        ...basicValidation.recommendations,
        ...securityScan.recommendations,
        ...complianceCheck.recommendations,
        ...typeSpecificValidation.recommendations
      ];

      // Calculate overall validation score
      const validationScore = this.calculateValidationScore(allChecks, allIssues);
      const isValid = validationScore >= 0.7 && !allIssues.some(issue => issue.severity === 'critical');

      const result: ValidationResult = {
        is_valid: isValid,
        validation_score: validationScore,
        checks_performed: allChecks,
        issues_found: allIssues,
        recommendations: allRecommendations,
        validated_at: new Date().toISOString()
      };

      this.logger.performance('Deliverable validation completed', {
        deliverable_id: deliverable.deliverable_id,
        is_valid: isValid,
        validation_score: validationScore,
        checks_count: allChecks.length,
        issues_count: allIssues.length,
        duration_ms: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Deliverable validation failed', error, {
        errorType: 'ValidationError'
      });
      
      // Return a failed validation result
      return {
        is_valid: false,
        validation_score: 0,
        checks_performed: [{
          check_name: 'validation_error',
          check_type: 'format',
          status: 'failed',
          details: error instanceof Error ? error.message : 'Unknown validation error'
        }],
        issues_found: [{
          severity: 'critical',
          category: 'format',
          description: 'Validation process failed',
          suggested_fix: 'Please resubmit the deliverable or contact support'
        }],
        recommendations: ['Resubmit the deliverable with correct format'],
        validated_at: new Date().toISOString()
      };
    }
  }

  /**
   * Assess completion of a todo item based on its deliverables
   */
  async assessCompleteness(
    todoItem: TodoItemRecord, 
    deliverable: DeliverableRecord
  ): Promise<CompletionAssessment> {
    this.logger.info('Assessing deliverable completeness', {
      todo_id: todoItem.todo_id,
      deliverable_id: deliverable.deliverable_id
    });

    try {
      const requirements = this.extractDeliverableRequirements(todoItem);
      const satisfiedRequirements: string[] = [];
      const missingRequirements: string[] = [];
      const recommendations: string[] = [];

      // Check each requirement
      for (const requirement of requirements) {
        const isSatisfied = await this.checkRequirementSatisfaction(
          requirement, 
          deliverable
        );
        
        if (isSatisfied) {
          satisfiedRequirements.push(requirement.type);
        } else {
          missingRequirements.push(requirement.type);
          recommendations.push(
            `Missing ${requirement.type} deliverable. Expected formats: ${requirement.format.join(', ')}`
          );
        }
      }

      // Calculate completion score
      const totalRequirements = requirements.length;
      const satisfiedCount = satisfiedRequirements.length;
      const completionScore = totalRequirements > 0 
        ? Math.round((satisfiedCount / totalRequirements) * 100)
        : 100;

      const isComplete = missingRequirements.length === 0 && completionScore >= 80;

      // Add quality-based recommendations
      if (deliverable.validation_result && deliverable.validation_result.validation_score < 0.8) {
        recommendations.push('Consider improving deliverable quality based on validation feedback');
      }

      const assessment: CompletionAssessment = {
        isComplete,
        completionScore,
        missingRequirements,
        satisfiedRequirements,
        recommendations
      };

      this.logger.info('Completeness assessment completed', {
        todo_id: todoItem.todo_id,
        deliverable_id: deliverable.deliverable_id,
        is_complete: isComplete,
        completion_score: completionScore,
        satisfied_count: satisfiedCount,
        missing_count: missingRequirements.length
      });

      return assessment;

    } catch (error) {
      this.logger.error('Completeness assessment failed', error);
      
      return {
        isComplete: false,
        completionScore: 0,
        missingRequirements: ['assessment_failed'],
        satisfiedRequirements: [],
        recommendations: ['Unable to assess completeness. Please review deliverable manually.']
      };
    }
  }

  /**
   * Perform quality assessment on a deliverable
   */
  async performQualityCheck(
    deliverable: DeliverableRecord, 
    qualityStandards: string[]
  ): Promise<QualityAssessmentResult> {
    this.logger.info('Starting quality assessment', {
      deliverable_id: deliverable.deliverable_id,
      standards: qualityStandards
    });

    try {
      const qualityDimensions: QualityDimension[] = [];
      const improvementSuggestions: string[] = [];
      
      // Get file type configuration
      const fileTypeConfig = this.getFileTypeConfig(deliverable.file_type);
      
      // Assess each quality dimension
      for (const standard of qualityStandards) {
        const dimension = await this.assessQualityDimension(
          deliverable, 
          standard, 
          fileTypeConfig
        );
        qualityDimensions.push(dimension);
        
        if (dimension.score < 70) {
          improvementSuggestions.push(
            `Improve ${dimension.dimension}: ${dimension.details}`
          );
        }
      }

      // Calculate overall quality score
      const totalWeight = qualityDimensions.reduce((sum, dim) => sum + dim.weight, 0);
      const weightedScore = qualityDimensions.reduce(
        (sum, dim) => sum + (dim.score * dim.weight), 
        0
      );
      const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

      // Check compliance status
      const complianceStatus = await this.checkComplianceStatus(
        deliverable, 
        qualityStandards
      );

      const result: QualityAssessmentResult = {
        overall_score: overallScore,
        quality_dimensions: qualityDimensions,
        improvement_suggestions: improvementSuggestions,
        compliance_status: complianceStatus,
        assessed_at: new Date().toISOString()
      };

      this.logger.info('Quality assessment completed', {
        deliverable_id: deliverable.deliverable_id,
        overall_score: overallScore,
        dimensions_count: qualityDimensions.length,
        suggestions_count: improvementSuggestions.length,
        is_compliant: complianceStatus.is_compliant
      });

      return result;

    } catch (error) {
      this.logger.error('Quality assessment failed', error);
      
      return {
        overall_score: 0,
        quality_dimensions: [],
        improvement_suggestions: ['Quality assessment failed. Please review manually.'],
        compliance_status: {
          is_compliant: false,
          standards_checked: qualityStandards,
          violations: [{
            standard: 'assessment_process',
            rule: 'quality_check',
            severity: 'high',
            description: 'Quality assessment process failed',
            remediation: 'Resubmit deliverable or contact support'
          }]
        },
        assessed_at: new Date().toISOString()
      };
    }
  }

  /**
   * Generate improvement suggestions based on validation results
   */
  async generateImprovementSuggestions(
    validationResult: ValidationResult
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Group issues by category
    const issuesByCategory = validationResult.issues_found.reduce((acc, issue) => {
      if (!acc[issue.category]) {
        acc[issue.category] = [];
      }
      acc[issue.category].push(issue);
      return acc;
    }, {} as Record<string, ValidationIssue[]>);

    // Generate category-specific suggestions
    for (const [category, issues] of Object.entries(issuesByCategory)) {
      const criticalIssues = issues.filter(i => i.severity === 'critical');
      const highIssues = issues.filter(i => i.severity === 'high');
      
      if (criticalIssues.length > 0) {
        suggestions.push(
          `Critical ${category} issues found: ${criticalIssues.map(i => i.description).join(', ')}`
        );
      }
      
      if (highIssues.length > 0) {
        suggestions.push(
          `High priority ${category} improvements needed: ${highIssues.map(i => i.suggested_fix || i.description).join(', ')}`
        );
      }
    }

    // Add general improvement suggestions
    if (validationResult.validation_score < 0.5) {
      suggestions.push('Consider reviewing the deliverable requirements and resubmitting');
    } else if (validationResult.validation_score < 0.8) {
      suggestions.push('Address the identified issues to improve deliverable quality');
    }

    // Add specific recommendations from validation
    suggestions.push(...validationResult.recommendations);

    return [...new Set(suggestions)]; // Remove duplicates
  }

  // Private helper methods

  private async performBasicValidation(deliverable: DeliverableRecord): Promise<{
    checks_performed: ValidationCheck[];
    issues_found: ValidationIssue[];
    recommendations: string[];
  }> {
    const checks: ValidationCheck[] = [];
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];

    // File size check
    const fileTypeConfig = this.getFileTypeConfig(deliverable.file_type);
    if (deliverable.file_size > fileTypeConfig.maxSize) {
      checks.push({
        check_name: 'file_size',
        check_type: 'format',
        status: 'failed',
        details: `File size ${deliverable.file_size} exceeds maximum ${fileTypeConfig.maxSize}`
      });
      issues.push({
        severity: 'high',
        category: 'format',
        description: 'File size exceeds maximum allowed size',
        suggested_fix: `Reduce file size to under ${Math.round(fileTypeConfig.maxSize / (1024 * 1024))}MB`
      });
    } else {
      checks.push({
        check_name: 'file_size',
        check_type: 'format',
        status: 'passed'
      });
    }

    // File extension check
    const fileExtension = this.getFileExtension(deliverable.file_name);
    if (!fileTypeConfig.extensions.includes(fileExtension)) {
      checks.push({
        check_name: 'file_extension',
        check_type: 'format',
        status: 'failed',
        details: `Extension ${fileExtension} not allowed for type ${deliverable.file_type}`
      });
      issues.push({
        severity: 'medium',
        category: 'format',
        description: 'File extension not supported for this deliverable type',
        suggested_fix: `Use one of: ${fileTypeConfig.extensions.join(', ')}`
      });
    } else {
      checks.push({
        check_name: 'file_extension',
        check_type: 'format',
        status: 'passed'
      });
    }

    return { checks_performed: checks, issues_found: issues, recommendations };
  }

  private async performSecurityScan(deliverable: DeliverableRecord): Promise<{
    checks_performed: ValidationCheck[];
    issues_found: ValidationIssue[];
    recommendations: string[];
  }> {
    const checks: ValidationCheck[] = [];
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];

    try {
      // Download file content for scanning
      const fileContent = await this.downloadFileContent(deliverable.s3_key);
      
      // Virus scan simulation (in real implementation, integrate with actual AV service)
      const virusScanResult = await this.simulateVirusScan(fileContent);
      
      if (virusScanResult.isClean) {
        checks.push({
          check_name: 'virus_scan',
          check_type: 'security',
          status: 'passed'
        });
      } else {
        checks.push({
          check_name: 'virus_scan',
          check_type: 'security',
          status: 'failed',
          details: `Threats detected: ${virusScanResult.threats.map(t => t.type).join(', ')}`
        });
        
        virusScanResult.threats.forEach(threat => {
          issues.push({
            severity: threat.severity,
            category: 'security',
            description: `Security threat detected: ${threat.description}`,
            location: threat.location,
            suggested_fix: 'Remove malicious content and resubmit'
          });
        });
      }

      // Content analysis for sensitive data
      const sensitiveDataCheck = await this.checkForSensitiveData(fileContent);
      if (sensitiveDataCheck.found) {
        checks.push({
          check_name: 'sensitive_data',
          check_type: 'security',
          status: 'warning',
          details: 'Potential sensitive data detected'
        });
        issues.push({
          severity: 'medium',
          category: 'security',
          description: 'File may contain sensitive information',
          suggested_fix: 'Review and remove any sensitive data before submission'
        });
        recommendations.push('Scan for and remove any passwords, API keys, or personal information');
      } else {
        checks.push({
          check_name: 'sensitive_data',
          check_type: 'security',
          status: 'passed'
        });
      }

    } catch (error) {
      checks.push({
        check_name: 'security_scan',
        check_type: 'security',
        status: 'failed',
        details: 'Security scan failed'
      });
      issues.push({
        severity: 'high',
        category: 'security',
        description: 'Unable to complete security scan',
        suggested_fix: 'Resubmit file or contact security team'
      });
    }

    return { checks_performed: checks, issues_found: issues, recommendations };
  }

  private async performComplianceCheck(deliverable: DeliverableRecord): Promise<{
    checks_performed: ValidationCheck[];
    issues_found: ValidationIssue[];
    recommendations: string[];
  }> {
    const checks: ValidationCheck[] = [];
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];

    try {
      // Download file content for rules engine validation
      const fileContent = await this.downloadFileContent(deliverable.s3_key);
      
      // Create validation request for rules engine
      const validationRequest: ArtifactValidationRequest = {
        artifact_id: deliverable.deliverable_id,
        artifact_type: deliverable.file_type,
        content: fileContent,
        file_path: deliverable.file_name,
        metadata: {
          file_size: deliverable.file_size,
          submitted_by: deliverable.submitted_by,
          todo_id: deliverable.todo_id
        }
      };

      // Run rules engine validation
      const rulesReport = await this.rulesEngine.validateArtifact(validationRequest);
      
      // Convert rules engine results to our format
      rulesReport.results.forEach(result => {
        checks.push({
          check_name: result.rule_name,
          check_type: 'compliance',
          status: result.passed ? 'passed' : 'failed',
          details: result.message
        });

        if (!result.passed) {
          issues.push({
            severity: result.severity,
            category: 'compliance',
            description: result.message,
            location: result.source_location?.file,
            suggested_fix: result.suggested_fix
          });
        }
      });

      // Add overall compliance recommendations
      if (rulesReport.overall_score < rulesReport.max_score) {
        recommendations.push(
          `Compliance score: ${rulesReport.overall_score}/${rulesReport.max_score}. Address failed rules to improve compliance.`
        );
      }

    } catch (error) {
      this.logger.error('Compliance check failed', error);
      checks.push({
        check_name: 'compliance_check',
        check_type: 'compliance',
        status: 'failed',
        details: 'Compliance validation failed'
      });
    }

    return { checks_performed: checks, issues_found: issues, recommendations };
  }

  private async performTypeSpecificValidation(deliverable: DeliverableRecord): Promise<{
    checks_performed: ValidationCheck[];
    issues_found: ValidationIssue[];
    recommendations: string[];
  }> {
    const checks: ValidationCheck[] = [];
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];

    const fileTypeConfig = this.getFileTypeConfig(deliverable.file_type);
    
    try {
      const fileContent = await this.downloadFileContent(deliverable.s3_key);
      
      // Perform type-specific validations based on file type
      switch (deliverable.file_type) {
        case 'code':
          await this.validateCodeFile(fileContent, deliverable, checks, issues, recommendations);
          break;
        case 'document':
          await this.validateDocumentFile(fileContent, deliverable, checks, issues, recommendations);
          break;
        case 'configuration':
          await this.validateConfigFile(fileContent, deliverable, checks, issues, recommendations);
          break;
        case 'test':
          await this.validateTestFile(fileContent, deliverable, checks, issues, recommendations);
          break;
        default:
          checks.push({
            check_name: 'type_specific_validation',
            check_type: 'format',
            status: 'passed',
            details: 'No specific validation rules for this file type'
          });
      }

    } catch (error) {
      checks.push({
        check_name: 'type_specific_validation',
        check_type: 'format',
        status: 'failed',
        details: 'Type-specific validation failed'
      });
    }

    return { checks_performed: checks, issues_found: issues, recommendations };
  }

  private async validateCodeFile(
    content: string,
    deliverable: DeliverableRecord,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    recommendations: string[]
  ): Promise<void> {
    // Syntax check
    const syntaxValid = this.checkSyntax(content, deliverable.file_name);
    checks.push({
      check_name: 'syntax_check',
      check_type: 'format',
      status: syntaxValid ? 'passed' : 'failed',
      details: syntaxValid ? 'Syntax is valid' : 'Syntax errors detected'
    });

    if (!syntaxValid) {
      issues.push({
        severity: 'high',
        category: 'format',
        description: 'Code contains syntax errors',
        suggested_fix: 'Fix syntax errors and resubmit'
      });
    }

    // Check for TODO/FIXME comments
    const todoCount = (content.match(/TODO|FIXME|HACK/gi) || []).length;
    if (todoCount > 0) {
      checks.push({
        check_name: 'todo_comments',
        check_type: 'content',
        status: 'warning',
        details: `Found ${todoCount} TODO/FIXME comments`
      });
      recommendations.push('Consider addressing TODO/FIXME comments before final submission');
    }
  }

  private async validateDocumentFile(
    content: string,
    deliverable: DeliverableRecord,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    recommendations: string[]
  ): Promise<void> {
    // Check document length
    const wordCount = content.split(/\s+/).length;
    checks.push({
      check_name: 'document_length',
      check_type: 'content',
      status: wordCount > 10 ? 'passed' : 'warning',
      details: `Document contains ${wordCount} words`
    });

    if (wordCount < 10) {
      issues.push({
        severity: 'medium',
        category: 'content',
        description: 'Document appears to be very short',
        suggested_fix: 'Ensure document contains sufficient content'
      });
    }

    // Check for proper structure (headers, etc.)
    const hasHeaders = /^#+\s/.test(content) || /<h[1-6]>/i.test(content);
    checks.push({
      check_name: 'document_structure',
      check_type: 'format',
      status: hasHeaders ? 'passed' : 'warning',
      details: hasHeaders ? 'Document has proper structure' : 'No headers detected'
    });
  }

  private async validateConfigFile(
    content: string,
    deliverable: DeliverableRecord,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    recommendations: string[]
  ): Promise<void> {
    const extension = this.getFileExtension(deliverable.file_name);
    
    try {
      // Validate JSON/YAML syntax
      if (extension === '.json') {
        JSON.parse(content);
        checks.push({
          check_name: 'json_syntax',
          check_type: 'format',
          status: 'passed'
        });
      } else if (['.yaml', '.yml'].includes(extension)) {
        // Basic YAML validation (in real implementation, use yaml parser)
        const hasValidYaml = !content.includes('\t') && /^[\s\w\-:]+$/m.test(content);
        checks.push({
          check_name: 'yaml_syntax',
          check_type: 'format',
          status: hasValidYaml ? 'passed' : 'failed'
        });
      }
    } catch (error) {
      checks.push({
        check_name: 'config_syntax',
        check_type: 'format',
        status: 'failed',
        details: 'Invalid configuration file syntax'
      });
      issues.push({
        severity: 'high',
        category: 'format',
        description: 'Configuration file has syntax errors',
        suggested_fix: 'Fix syntax errors and validate configuration'
      });
    }
  }

  private async validateTestFile(
    content: string,
    deliverable: DeliverableRecord,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    recommendations: string[]
  ): Promise<void> {
    // Check for test patterns
    const hasTestCases = /describe|it|test|expect|assert/i.test(content);
    checks.push({
      check_name: 'test_patterns',
      check_type: 'content',
      status: hasTestCases ? 'passed' : 'failed',
      details: hasTestCases ? 'Test patterns detected' : 'No test patterns found'
    });

    if (!hasTestCases) {
      issues.push({
        severity: 'high',
        category: 'content',
        description: 'File does not appear to contain valid test cases',
        suggested_fix: 'Add proper test cases with assertions'
      });
    }

    // Count test cases
    const testCount = (content.match(/it\(|test\(/gi) || []).length;
    if (testCount === 0) {
      recommendations.push('Add test cases to improve test coverage');
    } else {
      checks.push({
        check_name: 'test_count',
        check_type: 'content',
        status: 'passed',
        details: `Found ${testCount} test cases`
      });
    }
  }

  // Additional helper methods

  private calculateValidationScore(
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): number {
    if (checks.length === 0) return 0;

    const passedChecks = checks.filter(check => check.status === 'passed').length;
    const baseScore = passedChecks / checks.length;

    // Reduce score based on issue severity
    const severityPenalties = {
      'critical': 0.3,
      'high': 0.2,
      'medium': 0.1,
      'low': 0.05
    };

    let penalty = 0;
    issues.forEach(issue => {
      penalty += severityPenalties[issue.severity] || 0;
    });

    return Math.max(0, Math.min(1, baseScore - penalty));
  }

  private getFileTypeConfig(fileType: string): FileTypeConfig {
    return this.fileTypeConfigs[fileType] || this.fileTypeConfigs['document'];
  }

  private getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';
  }

  private async downloadFileContent(s3Key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.WORK_TASK_BUCKET_NAME || 'work-task-analysis-bucket',
        Key: s3Key
      });

      const result = await this.s3.send(command);
      const bodyContents = await result.Body?.transformToString('utf-8');
      return bodyContents || '';
    } catch (error) {
      this.logger.error('Failed to download file content', error as Error);
      throw new Error('Unable to download file for validation');
    }
  }

  private async simulateVirusScan(content: string): Promise<SecurityScanResult> {
    // Simulate virus scanning - in production, integrate with actual AV service
    const threats: SecurityThreat[] = [];
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /<script[^>]*>.*<\/script>/gi, type: 'embedded_script' as const },
      { pattern: /eval\s*\(/gi, type: 'suspicious_content' as const },
      { pattern: /document\.write/gi, type: 'suspicious_content' as const },
      { pattern: /\.exe\s*$/gi, type: 'malware' as const }
    ];

    suspiciousPatterns.forEach(({ pattern, type }) => {
      const matches = content.match(pattern);
      if (matches) {
        threats.push({
          type,
          severity: type === 'malware' ? 'critical' : 'medium',
          description: `Suspicious ${type.replace('_', ' ')} detected`,
          location: `Pattern: ${pattern.source}`
        });
      }
    });

    return {
      isClean: threats.length === 0,
      threats,
      scanEngine: 'SimulatedAV',
      scanTimestamp: new Date().toISOString()
    };
  }

  private async checkForSensitiveData(content: string): Promise<{ found: boolean; patterns: string[] }> {
    const sensitivePatterns = [
      /password\s*[:=]\s*[^\s\n]+/gi,
      /api[_-]?key\s*[:=]\s*[^\s\n]+/gi,
      /secret\s*[:=]\s*[^\s\n]+/gi,
      /token\s*[:=]\s*[^\s\n]+/gi,
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN pattern
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g // Credit card pattern
    ];

    const foundPatterns: string[] = [];
    
    sensitivePatterns.forEach(pattern => {
      if (pattern.test(content)) {
        foundPatterns.push(pattern.source);
      }
    });

    return {
      found: foundPatterns.length > 0,
      patterns: foundPatterns
    };
  }

  private checkSyntax(content: string, fileName: string): boolean {
    const extension = this.getFileExtension(fileName);
    
    try {
      switch (extension) {
        case '.json':
          JSON.parse(content);
          return true;
        case '.js':
        case '.ts':
          // Basic syntax check - look for unmatched brackets
          const openBrackets = (content.match(/[{[(]/g) || []).length;
          const closeBrackets = (content.match(/[}\])]/g) || []).length;
          return openBrackets === closeBrackets;
        default:
          return true; // Assume valid for other file types
      }
    } catch {
      return false;
    }
  }

  private extractDeliverableRequirements(todoItem: TodoItemRecord): DeliverableRequirement[] {
    // Extract requirements from todo item description and category
    const requirements: DeliverableRequirement[] = [];
    
    // Default requirements based on category
    switch (todoItem.category) {
      case 'development':
        requirements.push({
          type: 'code',
          format: ['.ts', '.js', '.py', '.java'],
          mandatory: true,
          description: 'Implementation code'
        });
        break;
      case 'documentation':
        requirements.push({
          type: 'document',
          format: ['.md', '.pdf', '.docx'],
          mandatory: true,
          description: 'Documentation file'
        });
        break;
      case 'testing':
        requirements.push({
          type: 'test',
          format: ['.test.ts', '.test.js', '.spec.ts'],
          mandatory: true,
          description: 'Test files'
        });
        break;
      case 'review':
        requirements.push({
          type: 'document',
          format: ['.md', '.pdf'],
          mandatory: true,
          description: 'Review report'
        });
        break;
      default:
        requirements.push({
          type: 'document',
          format: ['.md', '.txt', '.pdf'],
          mandatory: false,
          description: 'General deliverable'
        });
    }

    return requirements;
  }

  private async checkRequirementSatisfaction(
    requirement: DeliverableRequirement,
    deliverable: DeliverableRecord
  ): Promise<boolean> {
    // Check if deliverable satisfies the requirement
    const fileExtension = this.getFileExtension(deliverable.file_name);
    
    // Check format compatibility
    const formatMatch = requirement.format.includes(fileExtension);
    
    // Check if validation passed (if available)
    const validationPassed = !deliverable.validation_result || 
                           deliverable.validation_result.is_valid;

    return formatMatch && validationPassed;
  }

  private async assessQualityDimension(
    deliverable: DeliverableRecord,
    standard: string,
    fileTypeConfig: FileTypeConfig
  ): Promise<QualityDimension> {
    let score = 100;
    let details = '';
    let weight = 1;

    try {
      const content = await this.downloadFileContent(deliverable.s3_key);
      
      switch (standard) {
        case 'format_compliance':
          score = this.assessFormatCompliance(content, deliverable);
          details = 'File format and structure compliance';
          weight = 0.3;
          break;
        case 'content_completeness':
          score = this.assessContentCompleteness(content, deliverable);
          details = 'Content completeness and thoroughness';
          weight = 0.4;
          break;
        case 'readability':
          score = this.assessReadability(content);
          details = 'Code/document readability and clarity';
          weight = 0.2;
          break;
        case 'security_standards':
          score = await this.assessSecurityStandards(content);
          details = 'Security best practices compliance';
          weight = 0.3;
          break;
        default:
          score = 80; // Default score for unknown standards
          details = `Assessment for ${standard}`;
          weight = 0.1;
      }
    } catch (error) {
      score = 0;
      details = `Failed to assess ${standard}`;
    }

    return {
      dimension: standard,
      score: Math.max(0, Math.min(100, score)),
      weight,
      details
    };
  }

  private assessFormatCompliance(content: string, deliverable: DeliverableRecord): number {
    let score = 100;
    const extension = this.getFileExtension(deliverable.file_name);

    try {
      switch (extension) {
        case '.json':
          JSON.parse(content);
          break;
        case '.md':
          // Check for proper markdown structure
          if (!content.includes('#')) score -= 20;
          break;
        case '.ts':
        case '.js':
          // Check for basic code structure
          if (!content.includes('function') && !content.includes('=>') && !content.includes('class')) {
            score -= 30;
          }
          break;
      }
    } catch {
      score -= 50;
    }

    return score;
  }

  private assessContentCompleteness(content: string, deliverable: DeliverableRecord): number {
    let score = 100;
    
    // Basic completeness checks
    if (content.length < 100) score -= 30;
    if (content.length < 50) score -= 50;
    
    // Check for placeholder content
    const placeholders = ['TODO', 'FIXME', 'placeholder', 'lorem ipsum'];
    placeholders.forEach(placeholder => {
      if (content.toLowerCase().includes(placeholder.toLowerCase())) {
        score -= 10;
      }
    });

    return Math.max(0, score);
  }

  private assessReadability(content: string): number {
    let score = 100;
    
    // Check line length (penalize very long lines)
    const lines = content.split('\n');
    const longLines = lines.filter(line => line.length > 120).length;
    score -= Math.min(30, longLines * 2);
    
    // Check for comments (bonus for documented code)
    const commentLines = lines.filter(line => 
      line.trim().startsWith('//') || 
      line.trim().startsWith('#') || 
      line.trim().startsWith('*')
    ).length;
    
    if (commentLines > lines.length * 0.1) {
      score += 10; // Bonus for good documentation
    }

    return Math.max(0, Math.min(100, score));
  }

  private async assessSecurityStandards(content: string): Promise<number> {
    let score = 100;
    
    // Check for security anti-patterns
    const securityIssues = [
      /eval\s*\(/gi,
      /innerHTML\s*=/gi,
      /document\.write/gi,
      /password\s*[:=]\s*['"]/gi,
      /api[_-]?key\s*[:=]\s*['"]/gi
    ];

    securityIssues.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        score -= matches.length * 15;
      }
    });

    return Math.max(0, score);
  }

  private async checkComplianceStatus(
    deliverable: DeliverableRecord,
    qualityStandards: string[]
  ): Promise<ComplianceStatus> {
    const violations: ComplianceViolation[] = [];
    
    try {
      // Check each standard for compliance
      for (const standard of qualityStandards) {
        const dimension = await this.assessQualityDimension(
          deliverable, 
          standard, 
          this.getFileTypeConfig(deliverable.file_type)
        );
        
        if (dimension.score < 70) {
          violations.push({
            standard,
            rule: `${standard}_threshold`,
            severity: dimension.score < 50 ? 'high' : 'medium',
            description: `${standard} score (${dimension.score}) below acceptable threshold`,
            remediation: `Improve ${standard} to achieve minimum score of 70`
          });
        }
      }
    } catch (error) {
      violations.push({
        standard: 'compliance_check',
        rule: 'assessment_process',
        severity: 'high',
        description: 'Failed to assess compliance',
        remediation: 'Review deliverable manually or resubmit'
      });
    }

    return {
      is_compliant: violations.length === 0,
      standards_checked: qualityStandards,
      violations
    };
  }
}