/**
 * Deliverable Quality Handler
 * Handles quality checks, validation, and assessment of deliverables
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ResponseBuilder, ErrorContext } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { ArtifactValidationService } from '../../services/artifact-validation-service';
import { QualityAssessmentEngine } from '../../services/quality-assessment-engine';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import {
  QualityAssessmentResult,
  ValidationResult,
  DeliverableRecord
} from '../../models/work-task-models';

const logger = new Logger();

// Initialize services
const auditRepository = new AuditLogRepository();
const artifactValidationService = new ArtifactValidationService();
const qualityAssessmentEngine = new QualityAssessmentEngine();

/**
 * Perform quality check on a deliverable
 */
export const performQualityCheck = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Perform quality check request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Get deliverable ID from path parameters
    const deliverableId = event.pathParameters?.deliverableId;
    if (!deliverableId) {
      return ResponseBuilder.badRequest('Deliverable ID is required', undefined, context);
    }

    // Parse request body for quality check options
    let qualityCheckOptions: any = {};
    if (event.body) {
      try {
        qualityCheckOptions = JSON.parse(event.body);
      } catch (error) {
        return ResponseBuilder.badRequest('Invalid JSON in request body', undefined, context);
      }
    }

    // Validate quality standards if provided
    const requestedStandards = qualityCheckOptions.standards || ['completeness', 'accuracy', 'format'];
    const validStandards = ['completeness', 'accuracy', 'clarity', 'consistency', 'format', 'compliance'];
    const invalidStandards = requestedStandards.filter((std: string) => !validStandards.includes(std));
    
    if (invalidStandards.length > 0) {
      return ResponseBuilder.badRequest(
        `Invalid quality standards: ${invalidStandards.join(', ')}. Valid standards: ${validStandards.join(', ')}`,
        { invalidStandards, validStandards },
        context
      );
    }

    // In a real implementation, this would retrieve the deliverable from DynamoDB
    // For now, create mock deliverable data
    const mockDeliverable = {
      deliverable_id: deliverableId,
      file_name: 'auth-flow-diagram.pdf',
      file_type: 'application/pdf',
      file_size: 1024000,
      s3_key: `deliverables/todo-1/${deliverableId}/auth-flow-diagram.pdf`,
      submitted_by: userContext.userId,
      submitted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'submitted'
    };

    logger.info('Starting quality check', { 
      deliverableId,
      fileName: mockDeliverable.file_name,
      standards: requestedStandards,
      userId: userContext.userId
    });

    // Perform quality assessment using QualityAssessmentEngine
    const qualityResult = await qualityAssessmentEngine.performQualityCheck(
      mockDeliverable,
      requestedStandards
    );

    // Also perform basic validation using ArtifactValidationService
    const validationResult = await artifactValidationService.validateDeliverable(
      'todo-1', // This would be retrieved from the deliverable record
      mockDeliverable
    );

    // Combine results
    const combinedResult = {
      deliverable_id: deliverableId,
      quality_assessment: qualityResult,
      validation_result: validationResult,
      overall_status: determineOverallStatus(qualityResult, validationResult),
      checked_at: new Date().toISOString(),
      checked_by: userContext.userId
    };

    // Log the quality check for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'quality_checker',
      action: 'quality_check_performed',
      references: [],
      result_summary: `Quality check performed on deliverable ${deliverableId}: ${combinedResult.overall_status}`,
      compliance_score: qualityResult.overall_score / 100,
      team_id: userContext.teamId,
      session_id: deliverableId
    });

    logger.info('Quality check completed', { 
      deliverableId,
      overallScore: qualityResult.overall_score,
      overallStatus: combinedResult.overall_status,
      userId: userContext.userId
    });

    return ResponseBuilder.success(combinedResult, 200, context);

  } catch (error) {
    logger.error('Failed to perform quality check', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to perform quality check', undefined, context);
  }
};

/**
 * Get quality report for a deliverable
 */
export const getQualityReport = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get quality report request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Get deliverable ID from path parameters
    const deliverableId = event.pathParameters?.deliverableId;
    if (!deliverableId) {
      return ResponseBuilder.badRequest('Deliverable ID is required', undefined, context);
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const includeHistory = queryParams.includeHistory === 'true';
    const format = queryParams.format || 'detailed'; // detailed, summary

    // Validate format parameter
    const validFormats = ['detailed', 'summary'];
    if (!validFormats.includes(format)) {
      return ResponseBuilder.badRequest(
        `Invalid format. Must be one of: ${validFormats.join(', ')}`,
        undefined,
        context
      );
    }

    // In a real implementation, this would retrieve the quality report from DynamoDB
    // For now, return mock quality report data
    const mockQualityReport = {
      deliverable_id: deliverableId,
      deliverable_info: {
        file_name: 'auth-flow-diagram.pdf',
        file_type: 'application/pdf',
        submitted_by: userContext.userId,
        submitted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      current_assessment: {
        overall_score: 85,
        quality_dimensions: [
          {
            dimension: 'completeness',
            score: 90,
            weight: 0.3,
            details: 'All required sections are present and well-documented'
          },
          {
            dimension: 'accuracy',
            score: 80,
            weight: 0.25,
            details: 'Minor factual inconsistencies found in technical specifications'
          },
          {
            dimension: 'clarity',
            score: 88,
            weight: 0.2,
            details: 'Clear and well-structured presentation with good visual hierarchy'
          },
          {
            dimension: 'consistency',
            score: 82,
            weight: 0.15,
            details: 'Mostly consistent formatting with minor deviations'
          },
          {
            dimension: 'format',
            score: 85,
            weight: 0.1,
            details: 'Follows standard formatting guidelines with room for improvement'
          }
        ],
        improvement_suggestions: [
          'Review technical accuracy in section 3.2 regarding OAuth token validation',
          'Standardize heading formats throughout the document',
          'Add more detailed error handling scenarios',
          'Include performance considerations for high-load scenarios'
        ],
        compliance_status: {
          is_compliant: true,
          standards_checked: ['ISO-9001', 'Company-Standard-v2', 'Security-Guidelines-v1'],
          violations: []
        },
        assessed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        assessed_by: 'quality-assessment-engine'
      },
      validation_status: {
        is_valid: true,
        validation_score: 0.92,
        checks_performed: [
          {
            check_name: 'file_format_validation',
            check_type: 'format',
            status: 'passed',
            details: 'PDF format is valid and readable'
          },
          {
            check_name: 'content_structure_check',
            check_type: 'content',
            status: 'passed',
            details: 'Document structure follows required template'
          },
          {
            check_name: 'security_scan',
            check_type: 'security',
            status: 'passed',
            details: 'No security issues detected'
          },
          {
            check_name: 'compliance_check',
            check_type: 'compliance',
            status: 'passed',
            details: 'Meets all compliance requirements'
          }
        ],
        issues_found: [],
        recommendations: [
          'Consider adding version control information',
          'Include change log for future updates'
        ],
        validated_at: new Date(Date.now() - 25 * 60 * 1000).toISOString()
      }
    };

    // Add history if requested
    if (includeHistory) {
      mockQualityReport.assessment_history = [
        {
          version: 1,
          overall_score: 78,
          assessed_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          assessed_by: userContext.userId,
          changes_made: 'Initial submission'
        },
        {
          version: 2,
          overall_score: 85,
          assessed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          assessed_by: 'quality-assessment-engine',
          changes_made: 'Addressed formatting issues and added missing sections'
        }
      ];
    }

    // Filter response based on format
    let responseData = mockQualityReport;
    if (format === 'summary') {
      responseData = {
        deliverable_id: mockQualityReport.deliverable_id,
        overall_score: mockQualityReport.current_assessment.overall_score,
        is_compliant: mockQualityReport.current_assessment.compliance_status.is_compliant,
        is_valid: mockQualityReport.validation_status.is_valid,
        assessed_at: mockQualityReport.current_assessment.assessed_at,
        key_issues: mockQualityReport.current_assessment.improvement_suggestions.slice(0, 3)
      };
    }

    logger.info('Quality report retrieved successfully', { 
      deliverableId,
      format,
      includeHistory,
      overallScore: mockQualityReport.current_assessment.overall_score,
      userId: userContext.userId
    });

    return ResponseBuilder.success(responseData, 200, context);

  } catch (error) {
    logger.error('Failed to get quality report', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get quality report', undefined, context);
  }
};

/**
 * Perform batch quality check on multiple deliverables
 */
export const batchQualityCheck = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Batch quality check request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Get task ID from path parameters
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    // Parse request body for batch options
    let batchOptions: any = {};
    if (event.body) {
      try {
        batchOptions = JSON.parse(event.body);
      } catch (error) {
        return ResponseBuilder.badRequest('Invalid JSON in request body', undefined, context);
      }
    }

    const standards = batchOptions.standards || ['completeness', 'accuracy', 'format'];
    const includeValidation = batchOptions.includeValidation !== false;
    const deliverableIds = batchOptions.deliverableIds; // Optional: specific deliverables

    // In a real implementation, this would:
    // 1. Query all deliverables for the task (or specific ones if provided)
    // 2. Perform quality checks on each deliverable
    // 3. Aggregate results

    // Mock batch processing results
    const mockBatchResults = {
      task_id: taskId,
      batch_id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      processing_options: {
        standards_checked: standards,
        validation_included: includeValidation,
        specific_deliverables: deliverableIds || null
      },
      summary: {
        total_deliverables: 3,
        processed_successfully: 3,
        processing_errors: 0,
        average_quality_score: 83.7,
        compliance_rate: 100,
        validation_pass_rate: 100
      },
      results: [
        {
          deliverable_id: 'deliverable-1',
          file_name: 'auth-flow-diagram.pdf',
          status: 'completed',
          quality_score: 85,
          is_compliant: true,
          is_valid: true,
          processing_time_ms: 2500,
          key_issues: ['Minor formatting inconsistencies']
        },
        {
          deliverable_id: 'deliverable-2',
          file_name: 'implementation-notes.md',
          status: 'completed',
          quality_score: 88,
          is_compliant: true,
          is_valid: true,
          processing_time_ms: 1800,
          key_issues: []
        },
        {
          deliverable_id: 'deliverable-3',
          file_name: 'test-results.json',
          status: 'completed',
          quality_score: 78,
          is_compliant: true,
          is_valid: true,
          processing_time_ms: 1200,
          key_issues: ['Missing test coverage for edge cases', 'Incomplete error scenarios']
        }
      ],
      quality_distribution: {
        excellent: 1, // 90-100
        good: 1,      // 80-89
        fair: 1,      // 70-79
        poor: 0       // <70
      },
      common_issues: [
        {
          issue: 'Formatting inconsistencies',
          frequency: 2,
          severity: 'low'
        },
        {
          issue: 'Missing test coverage',
          frequency: 1,
          severity: 'medium'
        }
      ],
      processed_at: new Date().toISOString(),
      processed_by: userContext.userId,
      total_processing_time_ms: 5500
    };

    // Log the batch quality check for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'batch_quality_checker',
      action: 'batch_quality_check_performed',
      references: [],
      result_summary: `Batch quality check performed on ${mockBatchResults.summary.total_deliverables} deliverables for task ${taskId}`,
      compliance_score: mockBatchResults.summary.average_quality_score / 100,
      team_id: userContext.teamId,
      session_id: taskId
    });

    logger.info('Batch quality check completed', { 
      taskId,
      batchId: mockBatchResults.batch_id,
      totalDeliverables: mockBatchResults.summary.total_deliverables,
      averageScore: mockBatchResults.summary.average_quality_score,
      userId: userContext.userId
    });

    return ResponseBuilder.success(mockBatchResults, 200, context);

  } catch (error) {
    logger.error('Failed to perform batch quality check', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to perform batch quality check', undefined, context);
  }
};

/**
 * Get quality trends and analytics
 */
export const getQualityAnalytics = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get quality analytics request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const taskId = event.pathParameters?.taskId;
    const teamId = queryParams.teamId || userContext.teamId;
    const period = queryParams.period || '30d'; // 7d, 30d, 90d
    const dimension = queryParams.dimension || 'overall'; // overall, completeness, accuracy, etc.

    // Validate parameters
    const validPeriods = ['7d', '30d', '90d'];
    if (!validPeriods.includes(period)) {
      return ResponseBuilder.badRequest(
        `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
        undefined,
        context
      );
    }

    const validDimensions = ['overall', 'completeness', 'accuracy', 'clarity', 'consistency', 'format'];
    if (!validDimensions.includes(dimension)) {
      return ResponseBuilder.badRequest(
        `Invalid dimension. Must be one of: ${validDimensions.join(', ')}`,
        undefined,
        context
      );
    }

    // Check team access
    if (!taskId && teamId !== userContext.teamId && !AuthUtils.canAccessTeam(userContext, teamId)) {
      return ResponseBuilder.forbidden('Cannot access other team quality analytics', context);
    }

    // Mock quality analytics data
    const periodDays = parseInt(period.replace('d', ''));
    const mockAnalytics = {
      scope: taskId ? 'task' : 'team',
      task_id: taskId,
      team_id: teamId,
      period: {
        duration: period,
        start_date: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString()
      },
      dimension: dimension,
      summary: {
        total_deliverables: 25,
        average_quality_score: 84.2,
        quality_trend: 'improving', // improving, stable, declining
        compliance_rate: 96,
        validation_pass_rate: 98
      },
      trends: {
        daily_scores: generateMockQualityTrend(periodDays),
        score_change_percentage: 12,
        trend_direction: 'upward'
      },
      dimension_breakdown: dimension === 'overall' ? {
        completeness: { average: 87, trend: 'stable' },
        accuracy: { average: 82, trend: 'improving' },
        clarity: { average: 85, trend: 'improving' },
        consistency: { average: 81, trend: 'stable' },
        format: { average: 88, trend: 'declining' }
      } : {
        [dimension]: { 
          average: 84, 
          trend: 'improving',
          distribution: {
            excellent: 32, // percentage
            good: 48,
            fair: 16,
            poor: 4
          }
        }
      },
      common_issues: [
        {
          issue: 'Formatting inconsistencies',
          frequency: 15,
          trend: 'decreasing',
          severity: 'low'
        },
        {
          issue: 'Missing technical details',
          frequency: 8,
          trend: 'stable',
          severity: 'medium'
        },
        {
          issue: 'Incomplete test coverage',
          frequency: 5,
          trend: 'decreasing',
          severity: 'high'
        }
      ],
      improvement_areas: [
        {
          area: 'Technical accuracy',
          current_score: 78,
          target_score: 85,
          recommendations: ['Implement peer review process', 'Provide technical writing training']
        },
        {
          area: 'Consistency',
          current_score: 81,
          target_score: 88,
          recommendations: ['Create style guide', 'Use automated formatting tools']
        }
      ],
      generated_at: new Date().toISOString()
    };

    logger.info('Quality analytics retrieved successfully', { 
      scope: mockAnalytics.scope,
      taskId,
      teamId,
      period,
      dimension,
      averageScore: mockAnalytics.summary.average_quality_score,
      userId: userContext.userId
    });

    return ResponseBuilder.success(mockAnalytics, 200, context);

  } catch (error) {
    logger.error('Failed to get quality analytics', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get quality analytics', undefined, context);
  }
};

/**
 * Helper function to determine overall status from quality and validation results
 */
function determineOverallStatus(qualityResult: QualityAssessmentResult, validationResult: ValidationResult): string {
  if (!validationResult.is_valid) {
    return 'validation_failed';
  }
  
  if (!qualityResult.compliance_status.is_compliant) {
    return 'non_compliant';
  }
  
  if (qualityResult.overall_score >= 90) {
    return 'excellent';
  } else if (qualityResult.overall_score >= 80) {
    return 'good';
  } else if (qualityResult.overall_score >= 70) {
    return 'acceptable';
  } else {
    return 'needs_improvement';
  }
}

/**
 * Helper function to generate mock quality trend data
 */
function generateMockQualityTrend(days: number): Array<{date: string, score: number}> {
  const data = [];
  const baseScore = 75;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const randomVariation = (Math.random() - 0.5) * 10;
    const improvementTrend = (days - i) / days * 15; // Gradual improvement
    const score = Math.max(0, Math.min(100, baseScore + randomVariation + improvementTrend));
    
    data.push({
      date: date.toISOString().split('T')[0],
      score: Math.round(score)
    });
  }
  
  return data;
}