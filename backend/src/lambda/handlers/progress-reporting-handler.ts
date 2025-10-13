/**
 * Progress Reporting Handler
 * Handles progress tracking, reporting, and analytics for work tasks
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ResponseBuilder, ErrorContext } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { TodoProgressTracker } from '../../services/todo-progress-tracker';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import {
  ProgressSummary,
  ProgressReport,
  BlockerAnalysis,
  TimeRange
} from '../../models/work-task-models';

const logger = new Logger();

// Initialize services
const auditRepository = new AuditLogRepository();
const todoProgressTracker = new TodoProgressTracker();

/**
 * Get task progress summary
 */
export const getTaskProgress = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get task progress request received', { correlationId });

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

    // Get progress summary using TodoProgressTracker service
    const progressSummary = await todoProgressTracker.trackProgress(taskId);

    // Get blockers analysis
    const blockers = await todoProgressTracker.identifyBlockers(taskId);

    logger.info('Task progress retrieved successfully', { 
      taskId,
      completionPercentage: progressSummary.completion_percentage,
      blockedTodos: progressSummary.blocked_todos,
      userId: userContext.userId
    });

    return ResponseBuilder.success({
      progress: progressSummary,
      blockers: blockers,
      retrievedAt: new Date().toISOString()
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get task progress', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get task progress', undefined, context);
  }
};

/**
 * Generate detailed progress report
 */
export const generateProgressReport = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Generate progress report request received', { correlationId });

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

    // Parse query parameters for date range
    const queryParams = event.queryStringParameters || {};
    
    // Default to last 30 days if not specified
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const defaultEndDate = new Date().toISOString();
    
    const startDate = queryParams.startDate || defaultStartDate;
    const endDate = queryParams.endDate || defaultEndDate;

    // Validate date format
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return ResponseBuilder.badRequest(
        'Invalid date format. Use ISO date strings (YYYY-MM-DDTHH:mm:ss.sssZ)',
        undefined,
        context
      );
    }

    if (startDateObj >= endDateObj) {
      return ResponseBuilder.badRequest(
        'Start date must be before end date',
        undefined,
        context
      );
    }

    // Check if date range is reasonable (not more than 1 year)
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
    if (endDateObj.getTime() - startDateObj.getTime() > maxRangeMs) {
      return ResponseBuilder.badRequest(
        'Date range cannot exceed 1 year',
        undefined,
        context
      );
    }

    const timeRange: TimeRange = {
      start_date: startDate,
      end_date: endDate
    };

    // Generate progress report using TodoProgressTracker service
    const progressReport = await todoProgressTracker.generateProgressReport(taskId, timeRange);

    // Log the report generation for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'progress_reporter',
      action: 'progress_report_generated',
      references: [],
      result_summary: `Progress report generated for task ${taskId} (${startDate} to ${endDate})`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: taskId
    });

    logger.info('Progress report generated successfully', { 
      taskId,
      reportPeriod: timeRange,
      completedItems: progressReport.completed_items.length,
      blockedItems: progressReport.blocked_items.length,
      userId: userContext.userId
    });

    return ResponseBuilder.success(progressReport, 200, context);

  } catch (error) {
    logger.error('Failed to generate progress report', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to generate progress report', undefined, context);
  }
};

/**
 * Get team progress overview (multiple tasks)
 */
export const getTeamProgressOverview = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get team progress overview request received', { correlationId });

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
    const teamId = queryParams.teamId || userContext.teamId;

    // Check if user can access team data
    if (teamId !== userContext.teamId && !AuthUtils.canAccessTeam(userContext, teamId)) {
      return ResponseBuilder.forbidden('Cannot access other team progress data', context);
    }

    // In a real implementation, this would query multiple tasks for the team
    // For now, return mock team overview data
    const mockTeamOverview = {
      team_id: teamId,
      overview_period: {
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString()
      },
      summary: {
        total_tasks: 5,
        active_tasks: 3,
        completed_tasks: 2,
        total_todos: 25,
        completed_todos: 15,
        in_progress_todos: 7,
        blocked_todos: 3,
        overall_completion_percentage: 60
      },
      task_summaries: [
        {
          task_id: 'task-1',
          title: 'Implement user authentication system',
          status: 'in_progress',
          priority: 'high',
          completion_percentage: 40,
          total_todos: 5,
          completed_todos: 2,
          blocked_todos: 0,
          last_updated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        },
        {
          task_id: 'task-2',
          title: 'Database migration planning',
          status: 'completed',
          priority: 'medium',
          completion_percentage: 100,
          total_todos: 8,
          completed_todos: 8,
          blocked_todos: 0,
          last_updated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          task_id: 'task-3',
          title: 'API documentation update',
          status: 'in_progress',
          priority: 'low',
          completion_percentage: 75,
          total_todos: 4,
          completed_todos: 3,
          blocked_todos: 0,
          last_updated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
        }
      ],
      team_performance: {
        velocity: 2.5, // todos completed per day
        quality_trend: 'improving',
        average_quality_score: 87,
        deliverables_submitted: 12,
        deliverables_approved: 10
      },
      blockers_summary: {
        total_blocked_todos: 3,
        blocker_categories: {
          dependency: 2,
          resource: 1,
          approval: 0,
          technical: 0,
          external: 0
        },
        average_blocking_time_hours: 18
      },
      generated_at: new Date().toISOString()
    };

    logger.info('Team progress overview retrieved successfully', { 
      teamId,
      totalTasks: mockTeamOverview.summary.total_tasks,
      overallCompletion: mockTeamOverview.summary.overall_completion_percentage,
      userId: userContext.userId
    });

    return ResponseBuilder.success(mockTeamOverview, 200, context);

  } catch (error) {
    logger.error('Failed to get team progress overview', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get team progress overview', undefined, context);
  }
};

/**
 * Get progress analytics and trends
 */
export const getProgressAnalytics = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get progress analytics request received', { correlationId });

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

    // Validate period parameter
    const validPeriods = ['7d', '30d', '90d'];
    if (!validPeriods.includes(period)) {
      return ResponseBuilder.badRequest(
        `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
        undefined,
        context
      );
    }

    // Check team access if querying team analytics
    if (!taskId && teamId !== userContext.teamId && !AuthUtils.canAccessTeam(userContext, teamId)) {
      return ResponseBuilder.forbidden('Cannot access other team analytics', context);
    }

    // Calculate period dates
    const periodDays = parseInt(period.replace('d', ''));
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    // Mock analytics data
    const mockAnalytics = {
      scope: taskId ? 'task' : 'team',
      task_id: taskId,
      team_id: teamId,
      period: {
        duration: period,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      },
      completion_trends: {
        daily_completion_rates: generateMockDailyData(periodDays, 'completion'),
        velocity_trend: 'increasing', // increasing, stable, decreasing
        average_completion_time_hours: 24,
        completion_rate_change_percentage: 15
      },
      quality_trends: {
        daily_quality_scores: generateMockDailyData(periodDays, 'quality'),
        quality_trend: 'improving', // improving, stable, declining
        average_quality_score: 85,
        quality_score_change_percentage: 8
      },
      blocker_analysis: {
        blocker_frequency: {
          dependency: 40,
          resource: 30,
          approval: 15,
          technical: 10,
          external: 5
        },
        average_resolution_time_hours: 16,
        blocker_trend: 'decreasing'
      },
      productivity_metrics: {
        todos_per_day: 3.2,
        deliverables_per_week: 8,
        rework_rate_percentage: 12,
        first_time_approval_rate: 78
      },
      team_collaboration: taskId ? undefined : {
        cross_team_interactions: 15,
        knowledge_sharing_events: 8,
        peer_review_participation: 85
      },
      generated_at: new Date().toISOString()
    };

    logger.info('Progress analytics retrieved successfully', { 
      scope: mockAnalytics.scope,
      taskId,
      teamId,
      period,
      userId: userContext.userId
    });

    return ResponseBuilder.success(mockAnalytics, 200, context);

  } catch (error) {
    logger.error('Failed to get progress analytics', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get progress analytics', undefined, context);
  }
};

/**
 * Export progress report in different formats
 */
export const exportProgressReport = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Export progress report request received', { correlationId });

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

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const format = queryParams.format || 'json'; // json, csv, pdf
    const startDate = queryParams.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = queryParams.endDate || new Date().toISOString();

    // Validate format
    const validFormats = ['json', 'csv', 'pdf'];
    if (!validFormats.includes(format)) {
      return ResponseBuilder.badRequest(
        `Invalid format. Must be one of: ${validFormats.join(', ')}`,
        undefined,
        context
      );
    }

    // Generate the report
    const timeRange: TimeRange = { start_date: startDate, end_date: endDate };
    const progressReport = await todoProgressTracker.generateProgressReport(taskId, timeRange);

    // In a real implementation, this would:
    // 1. Generate the report in the requested format
    // 2. Store it in S3
    // 3. Return a download URL or the content directly

    let exportData: any;
    let contentType: string;
    let fileName: string;

    switch (format) {
      case 'json':
        exportData = progressReport;
        contentType = 'application/json';
        fileName = `progress-report-${taskId}-${Date.now()}.json`;
        break;
      
      case 'csv':
        // Mock CSV conversion
        exportData = convertToCSV(progressReport);
        contentType = 'text/csv';
        fileName = `progress-report-${taskId}-${Date.now()}.csv`;
        break;
      
      case 'pdf':
        // Mock PDF generation
        exportData = { 
          message: 'PDF generation would be implemented here',
          downloadUrl: `https://s3.amazonaws.com/reports/${fileName}`
        };
        contentType = 'application/json';
        fileName = `progress-report-${taskId}-${Date.now()}.pdf`;
        break;
    }

    // Log the export for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'report_exporter',
      action: 'progress_report_exported',
      references: [],
      result_summary: `Progress report exported for task ${taskId} in ${format} format`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: taskId
    });

    logger.info('Progress report exported successfully', { 
      taskId,
      format,
      fileName,
      userId: userContext.userId
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-ID': correlationId
      },
      body: typeof exportData === 'string' ? exportData : JSON.stringify(exportData)
    };

  } catch (error) {
    logger.error('Failed to export progress report', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to export progress report', undefined, context);
  }
};

/**
 * Helper function to generate mock daily data for analytics
 */
function generateMockDailyData(days: number, type: 'completion' | 'quality'): Array<{date: string, value: number}> {
  const data = [];
  const baseValue = type === 'completion' ? 70 : 80;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const randomVariation = (Math.random() - 0.5) * 20;
    const trendFactor = (days - i) / days * 10; // Slight upward trend
    const value = Math.max(0, Math.min(100, baseValue + randomVariation + trendFactor));
    
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value)
    });
  }
  
  return data;
}

/**
 * Helper function to convert progress report to CSV format
 */
function convertToCSV(progressReport: ProgressReport): string {
  // Mock CSV conversion - in real implementation would properly format all data
  const headers = ['Date', 'Task ID', 'Completion %', 'Completed Items', 'Blocked Items'];
  const rows = [
    headers.join(','),
    [
      progressReport.generated_at.split('T')[0],
      progressReport.task_id,
      progressReport.summary.completion_percentage,
      progressReport.completed_items.length,
      progressReport.blocked_items.length
    ].join(',')
  ];
  
  return rows.join('\n');
}