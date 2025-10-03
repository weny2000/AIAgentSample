import { Handler } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '../utils/logger';
import { ArtifactCheckRequest, ArtifactCheckResult, Issue, SourceReference, UserContext } from '../types';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { ValidationReport, ValidationResult, RuleDefinition } from '../../rules-engine/types';

interface ComposeReportEvent {
  jobId: string;
  artifactCheckRequest: ArtifactCheckRequest;
  userContext: UserContext;
  kendraResults: any;
  staticCheckResults: any;
  semanticCheckResults: any;
  rulesEngineResults?: ValidationReport;
  validationSummary?: {
    rulesEngineStatus: 'completed' | 'failed' | 'timeout' | 'skipped';
    rulesEngineExecutionTime: number;
    staticCheckStatus: string;
    semanticCheckStatus: string;
  };
  artifactData: {
    content: string;
    contentType: string;
    detectedArtifactType: string;
    applicableRules: RuleDefinition[];
    rulesEngineCapabilities?: {
      staticAnalysisEnabled: boolean;
      semanticAnalysisEnabled: boolean;
      securityAnalysisEnabled: boolean;
      supportedTypes: string[];
    };
    validationConfig?: {
      timeoutMs: number;
      maxRetries: number;
      enableParallelValidation: boolean;
    };
  };
}

interface ComposeReportResult {
  report: ArtifactCheckResult;
  reportUrl: string;
  jobStatus: 'completed' | 'failed';
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

export const handler: Handler<ComposeReportEvent, ComposeReportResult> = async (event) => {
  const correlationId = event.jobId;
  const logger = new Logger({ 
    correlationId, 
    operation: 'compose-report',
    userId: event.userContext.userId 
  });
  
  try {
    logger.info('Starting report composition', { 
      artifactType: event.artifactCheckRequest.artifactType,
      detectedArtifactType: event.artifactData.detectedArtifactType,
      applicableRulesCount: event.artifactData.applicableRules.length,
      rulesEngineStatus: event.validationSummary?.rulesEngineStatus,
      rulesEngineExecutionTime: event.validationSummary?.rulesEngineExecutionTime
    });

    // Use rules engine validation results from the workflow
    let rulesEngineReport: ValidationReport | null = event.rulesEngineResults || null;
    
    // Log rules engine execution status
    if (event.validationSummary?.rulesEngineStatus) {
      logger.info('Rules engine validation status', {
        status: event.validationSummary.rulesEngineStatus,
        executionTime: event.validationSummary.rulesEngineExecutionTime,
        hasReport: !!rulesEngineReport
      });
      
      // Handle different execution statuses
      switch (event.validationSummary.rulesEngineStatus) {
        case 'timeout':
          logger.warn('Rules engine validation timed out', {
            executionTime: event.validationSummary.rulesEngineExecutionTime,
            applicableRulesCount: event.artifactData.applicableRules.length
          });
          break;
        case 'failed':
          logger.warn('Rules engine validation failed', {
            executionTime: event.validationSummary.rulesEngineExecutionTime
          });
          break;
        case 'skipped':
          logger.info('Rules engine validation skipped (no applicable rules)');
          break;
        case 'completed':
          logger.info('Rules engine validation completed successfully', {
            executionTime: event.validationSummary.rulesEngineExecutionTime,
            overallScore: rulesEngineReport?.overall_score
          });
          break;
      }
    }
    
    // Fallback: run validation if no results and we have applicable rules
    if (!rulesEngineReport && 
        event.artifactData.applicableRules.length > 0 && 
        event.validationSummary?.rulesEngineStatus !== 'skipped') {
      
      logger.info('Running fallback rules engine validation');
      try {
        const timeoutMs = event.artifactData.validationConfig?.timeoutMs || 120000;
        rulesEngineReport = await Promise.race([
          runRulesEngineValidation(event, correlationId),
          new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Rules engine validation timeout')), timeoutMs)
          )
        ]);
      } catch (error) {
        logger.warn('Fallback rules engine validation failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          applicableRulesCount: event.artifactData.applicableRules.length
        });
        rulesEngineReport = null;
      }
    }

    // Parse and combine results from static and semantic checks
    const staticIssues = parseStaticCheckResults(event.staticCheckResults);
    const semanticIssues = parseSemanticCheckResults(event.semanticCheckResults);
    const rulesEngineIssues = rulesEngineReport ? parseRulesEngineResults(rulesEngineReport) : [];
    const sourceReferences = parseSourceReferences(event.kendraResults);

    // Combine all issues
    const allIssues = [...staticIssues, ...semanticIssues, ...rulesEngineIssues];

    // Calculate compliance score using rules engine scoring if available
    const complianceScore = rulesEngineReport ? 
      rulesEngineReport.overall_score : 
      calculateComplianceScore(allIssues);

    // Generate recommendations
    const recommendations = generateRecommendations(
      allIssues, 
      event.artifactData.detectedArtifactType,
      rulesEngineReport
    );

    // Create summary
    const summary = generateSummary(
      allIssues, 
      complianceScore, 
      event.artifactData.detectedArtifactType,
      rulesEngineReport,
      event.validationSummary
    );

    // Compose final report
    const report: ArtifactCheckResult = {
      complianceScore,
      issues: allIssues,
      recommendations,
      sourceReferences,
      summary,
    };

    // Store report in S3
    const reportUrl = await storeReport(event.jobId, report, correlationId);

    // Update job status in DynamoDB
    await updateJobStatus(event.jobId, 'completed', report, correlationId);

    logger.info('Report composition completed successfully', { 
      complianceScore,
      issueCount: allIssues.length,
      reportUrl
    });

    return {
      report,
      reportUrl,
      jobStatus: 'completed',
    };

  } catch (error) {
    logger.error('Failed to compose report', error instanceof Error ? error : new Error('Unknown error'));

    // Update job status to failed
    try {
      await updateJobStatus(event.jobId, 'failed', undefined, correlationId);
    } catch (updateError) {
      logger.error('Failed to update job status to failed', updateError instanceof Error ? updateError : new Error('Unknown error'));
    }
    
    throw error;
  }
};

/**
 * Run rules engine validation on the artifact
 */
async function runRulesEngineValidation(event: ComposeReportEvent, correlationId: string): Promise<ValidationReport | null> {
  const logger = new Logger({ correlationId, operation: 'rules-engine-validation' });
  
  try {
    const rulesEngineService = RulesEngineService.getInstance();
    
    const validationRequest = {
      artifact_id: event.jobId,
      artifact_type: event.artifactData.detectedArtifactType,
      content: event.artifactData.content,
      file_path: event.artifactCheckRequest.artifactUrl,
      metadata: {
        user_id: event.userContext.userId,
        team_id: event.userContext.teamId,
        content_type: event.artifactData.contentType,
        applicable_rules: event.artifactData.applicableRules.map(r => r.id)
      }
    };

    logger.info('Running rules engine validation', {
      artifact_id: validationRequest.artifact_id,
      artifact_type: validationRequest.artifact_type,
      applicable_rules_count: event.artifactData.applicableRules.length
    });

    const report = await rulesEngineService.validateArtifact(validationRequest);
    
    logger.info('Rules engine validation completed', {
      overall_score: report.overall_score,
      passed: report.passed,
      total_rules: report.summary.total_rules,
      failed_rules: report.summary.failed_rules,
      execution_time_ms: report.execution_time_ms
    });

    return report;
  } catch (error) {
    logger.error('Rules engine validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Return null to allow workflow to continue with other validation results
    return null;
  }
}

/**
 * Parse rules engine validation results into issues
 */
function parseRulesEngineResults(report: ValidationReport): Issue[] {
  const issues: Issue[] = [];
  
  try {
    for (const result of report.results) {
      if (!result.passed) {
        issues.push({
          id: `rules-engine-${result.rule_id}`,
          severity: result.severity,
          type: 'rules-engine',
          description: result.message,
          location: result.source_location ? 
            `${result.source_location.file || 'unknown'}:${result.source_location.line || 0}` : 
            undefined,
          remediation: result.suggested_fix || 'Review and address the rule violation',
          ruleId: result.rule_id,
          ruleName: result.rule_name,
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to parse rules engine results', { error });
  }

  return issues;
}

function parseStaticCheckResults(staticResults: any): Issue[] {
  const issues: Issue[] = [];
  
  try {
    if (staticResults?.taskResult?.issues) {
      for (const issue of staticResults.taskResult.issues) {
        issues.push({
          id: `static-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          severity: mapSeverity(issue.severity),
          type: 'static',
          description: issue.description || 'Static analysis issue detected',
          location: issue.location || issue.file,
          remediation: issue.remediation || 'Review and fix the identified issue',
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to parse static check results', { error });
  }

  return issues;
}

function parseSemanticCheckResults(semanticResults: any): Issue[] {
  const issues: Issue[] = [];
  
  try {
    if (semanticResults?.taskResult?.issues) {
      for (const issue of semanticResults.taskResult.issues) {
        issues.push({
          id: `semantic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          severity: mapSeverity(issue.severity),
          type: 'semantic',
          description: issue.description || 'Semantic analysis issue detected',
          location: issue.location,
          remediation: issue.remediation || 'Review the semantic context and alignment with policies',
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to parse semantic check results', { error });
  }

  return issues;
}

function parseSourceReferences(kendraResults: any): SourceReference[] {
  const references: SourceReference[] = [];
  
  try {
    if (kendraResults?.Payload?.results) {
      for (const result of kendraResults.Payload.results) {
        references.push({
          sourceId: result.id,
          sourceType: result.sourceType || 'document',
          confidenceScore: result.confidence || 0.5,
          snippet: result.excerpt || '',
          url: result.uri,
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to parse source references', { error });
  }

  return references;
}

function mapSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  const normalizedSeverity = severity?.toLowerCase();
  
  switch (normalizedSeverity) {
    case 'critical':
    case 'error':
      return 'critical';
    case 'high':
    case 'warning':
      return 'high';
    case 'medium':
    case 'info':
      return 'medium';
    case 'low':
    case 'minor':
    default:
      return 'low';
  }
}

function calculateComplianceScore(issues: Issue[]): number {
  if (issues.length === 0) {
    return 100;
  }

  // Weight issues by severity
  const severityWeights = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
  };

  const totalPenalty = issues.reduce((sum, issue) => {
    return sum + severityWeights[issue.severity];
  }, 0);

  // Calculate score (max penalty of 100 points)
  const score = Math.max(0, 100 - totalPenalty);
  
  return Math.round(score);
}

function generateRecommendations(
  issues: Issue[], 
  artifactType: string, 
  rulesEngineReport?: ValidationReport | null
): string[] {
  const recommendations: string[] = [];
  
  // Critical issues recommendations
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    recommendations.push(`Address ${criticalIssues.length} critical issue(s) before proceeding with deployment`);
  }

  // High severity issues
  const highIssues = issues.filter(i => i.severity === 'high');
  if (highIssues.length > 0) {
    recommendations.push(`Review and resolve ${highIssues.length} high-severity issue(s) to improve compliance`);
  }

  // Type-specific recommendations
  const staticIssues = issues.filter(i => i.type === 'static');
  const semanticIssues = issues.filter(i => i.type === 'semantic');
  const rulesEngineIssues = issues.filter(i => i.type === 'rules-engine');

  if (staticIssues.length > 0) {
    recommendations.push('Run automated linting and formatting tools to address static analysis issues');
  }

  if (semanticIssues.length > 0) {
    recommendations.push('Review artifact content for alignment with organizational policies and standards');
  }

  if (rulesEngineIssues.length > 0) {
    recommendations.push(`Address ${rulesEngineIssues.length} rule violation(s) identified by the rules engine`);
    
    // Add specific rule-based recommendations
    const failedRules = rulesEngineIssues.map(i => i.ruleName).filter(Boolean);
    if (failedRules.length > 0) {
      recommendations.push(`Review and fix violations for: ${failedRules.slice(0, 3).join(', ')}${failedRules.length > 3 ? ' and others' : ''}`);
    }
  }

  // Rules engine specific recommendations
  if (rulesEngineReport && !rulesEngineReport.passed) {
    if (rulesEngineReport.summary.critical_issues > 0) {
      recommendations.push('Critical rule violations must be resolved before deployment');
    }
    
    if (rulesEngineReport.overall_score < 70) {
      recommendations.push('Significant improvements needed to meet organizational standards');
    } else if (rulesEngineReport.overall_score < 90) {
      recommendations.push('Minor improvements recommended to achieve full compliance');
    }
  }

  // Artifact-specific recommendations
  switch (artifactType.toLowerCase()) {
    case 'cloudformation':
    case 'terraform':
      recommendations.push('Validate infrastructure code against security best practices');
      break;
    case 'dockerfile':
      recommendations.push('Ensure container images follow security hardening guidelines');
      break;
    case 'kubernetes':
      recommendations.push('Review Kubernetes manifests for security and resource configurations');
      break;
  }

  // Default recommendation if no specific ones
  if (recommendations.length === 0) {
    recommendations.push('Artifact meets current compliance standards');
  }

  return recommendations;
}

function generateSummary(
  issues: Issue[], 
  complianceScore: number, 
  artifactType: string,
  rulesEngineReport?: ValidationReport | null,
  validationSummary?: {
    rulesEngineStatus: string;
    rulesEngineExecutionTime: number;
    staticCheckStatus: string;
    semanticCheckStatus: string;
  }
): string {
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const highCount = issues.filter(i => i.severity === 'high').length;
  const mediumCount = issues.filter(i => i.severity === 'medium').length;
  const lowCount = issues.filter(i => i.severity === 'low').length;

  let summary = `Compliance analysis completed for ${artifactType} artifact. `;
  summary += `Overall compliance score: ${complianceScore}/100. `;

  // Add validation execution information
  if (validationSummary) {
    const validationParts: string[] = [];
    
    if (validationSummary.rulesEngineStatus === 'completed' && rulesEngineReport) {
      validationParts.push(`Rules engine evaluated ${rulesEngineReport.summary.total_rules} rule(s) in ${validationSummary.rulesEngineExecutionTime}ms`);
    } else if (validationSummary.rulesEngineStatus === 'timeout') {
      validationParts.push(`Rules engine validation timed out after ${validationSummary.rulesEngineExecutionTime}ms`);
    } else if (validationSummary.rulesEngineStatus === 'failed') {
      validationParts.push('Rules engine validation failed');
    } else if (validationSummary.rulesEngineStatus === 'skipped') {
      validationParts.push('Rules engine validation skipped (no applicable rules)');
    }
    
    if (validationSummary.staticCheckStatus === 'completed') {
      validationParts.push('static analysis completed');
    }
    
    if (validationSummary.semanticCheckStatus === 'completed') {
      validationParts.push('semantic analysis completed');
    }
    
    if (validationParts.length > 0) {
      summary += `Validation: ${validationParts.join(', ')}. `;
    }
  } else if (rulesEngineReport) {
    // Fallback to original rules engine information
    summary += `Rules engine evaluated ${rulesEngineReport.summary.total_rules} rule(s) in ${rulesEngineReport.execution_time_ms}ms. `;
  }

  if (issues.length === 0) {
    summary += 'No issues detected. Artifact meets all compliance requirements.';
  } else {
    summary += `Found ${issues.length} issue(s): `;
    
    const issueParts: string[] = [];
    if (criticalCount > 0) issueParts.push(`${criticalCount} critical`);
    if (highCount > 0) issueParts.push(`${highCount} high`);
    if (mediumCount > 0) issueParts.push(`${mediumCount} medium`);
    if (lowCount > 0) issueParts.push(`${lowCount} low`);
    
    summary += issueParts.join(', ') + ' severity.';

    // Add rules engine specific summary
    if (rulesEngineReport && rulesEngineReport.summary.failed_rules > 0) {
      summary += ` Rules engine identified ${rulesEngineReport.summary.failed_rules} rule violation(s).`;
    }

    // Add validation status context
    if (validationSummary?.rulesEngineStatus === 'timeout') {
      summary += ' Note: Rules engine validation was incomplete due to timeout.';
    } else if (validationSummary?.rulesEngineStatus === 'failed') {
      summary += ' Note: Rules engine validation encountered errors.';
    }

    if (criticalCount > 0) {
      summary += ' Immediate action required for critical issues.';
    } else if (complianceScore >= 80) {
      summary += ' Artifact is generally compliant with minor issues to address.';
    } else {
      summary += ' Significant improvements needed to meet compliance standards.';
    }
  }

  return summary;
}

async function storeReport(jobId: string, report: ArtifactCheckResult, correlationId: string): Promise<string> {
  const bucketName = process.env.ARTIFACTS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('ARTIFACTS_BUCKET_NAME environment variable not set');
  }

  const key = `reports/${jobId}/compliance-report.json`;
  
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(report, null, 2),
      ContentType: 'application/json',
      Metadata: {
        jobId,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    
    const reportUrl = `s3://${bucketName}/${key}`;
    
    logger.info('Report stored successfully', { 
      reportUrl 
    });
    
    return reportUrl;

  } catch (error) {
    logger.error('Failed to store report', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

async function updateJobStatus(
  jobId: string, 
  status: 'completed' | 'failed', 
  result?: ArtifactCheckResult,
  correlationId?: string
): Promise<void> {
  const tableName = process.env.JOB_STATUS_TABLE;
  if (!tableName) {
    throw new Error('JOB_STATUS_TABLE environment variable not set');
  }

  try {
    let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt, #progress = :progress';
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
      '#progress': 'progress',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':status': { S: status },
      ':updatedAt': { S: new Date().toISOString() },
      ':progress': { N: status === 'completed' ? '100' : '0' },
    };

    if (result) {
      updateExpression += ', #result = :result';
      expressionAttributeNames['#result'] = 'result';
      expressionAttributeValues[':result'] = { S: JSON.stringify(result) };
    }

    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        jobId: { S: jobId },
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await dynamoClient.send(command);

    logger.info('Job status updated successfully', { 
      jobId,
      status 
    });

  } catch (error) {
    logger.error('Failed to update job status', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}