/**
 * Work Task Analysis API Handler
 * Comprehensive API endpoints for work task submission, management, and progress tracking
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ResponseBuilder, ErrorContext } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { TodoProgressTracker } from '../../services/todo-progress-tracker';
import { ArtifactValidationService } from '../../services/artifact-validation-service';
import { QualityAssessmentEngine } from '../../services/quality-assessment-engine';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import {
  TaskSubmissionRequest,
  TodoUpdateRequest,
  DeliverableSubmission,
  WorkTaskQuery,
  TodoItemQuery,
  DeliverableQuery,
  WorkTaskRecord,
  TodoItemRecord,
  DeliverableRecord,
  ProgressSummary,
  ProgressReport
} from '../../models/work-task-models';

const logger = new Logger();

// Initialize services
const auditRepository = new AuditLogRepository();
const kendraService = new KendraSearchService();
const rulesEngine = new RulesEngineService();
const workTaskService = new WorkTaskAnalysisService(
  kendraService,
  rulesEngine,
  auditRepository,
  logger
);
const todoProgressTracker = new TodoProgressTracker();
const artifactValidationService = new ArtifactValidationService();
const qualityAssessmentEngine = new QualityAssessmentEngine();

/**
 * Main API Gateway handler - routes requests to appropriate functions
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Work Task API request received', {
      path: event.path,
      method: event.httpMethod,
      correlationId
    });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      logger.warn('Failed to extract user context', error as Error);
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Route based on path and method
    const path = event.path;
    const method = event.httpMethod;

    // Work Task Management Routes
    if (path === '/api/v1/work-tasks' && method === 'POST') {
      return await submitWorkTask(event, userContext, context);
    }
    if (path === '/api/v1/work-tasks' && method === 'GET') {
      return await getWorkTasks(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+$/) && method === 'GET') {
      return await getWorkTask(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+$/) && method === 'PUT') {
      return await updateWorkTask(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+\/analysis$/) && method === 'GET') {
      return await getTaskAnalysis(event, userContext, context);
    }

    // Todo Management Routes
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+\/todos$/) && method === 'GET') {
      return await getTodos(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/todos\/[^\/]+$/) && method === 'PUT') {
      return await updateTodo(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/todos\/[^\/]+\/deliverables$/) && method === 'POST') {
      return await submitDeliverable(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/todos\/[^\/]+\/deliverables$/) && method === 'GET') {
      return await getDeliverables(event, userContext, context);
    }

    // Progress and Reporting Routes
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+\/progress$/) && method === 'GET') {
      return await getTaskProgress(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+\/progress-report$/) && method === 'GET') {
      return await generateProgressReport(event, userContext, context);
    }

    // Quality Check Routes
    if (path.match(/^\/api\/v1\/deliverables\/[^\/]+\/quality-check$/) && method === 'POST') {
      return await performQualityCheck(event, userContext, context);
    }
    if (path.match(/^\/api\/v1\/deliverables\/[^\/]+\/quality-report$/) && method === 'GET') {
      return await getQualityReport(event, userContext, context);
    }

    // Batch Operations
    if (path.match(/^\/api\/v1\/work-tasks\/[^\/]+\/batch-quality-check$/) && method === 'POST') {
      return await batchQualityCheck(event, userContext, context);
    }

    // Route not found
    return ResponseBuilder.notFound('API endpoint not found', context);

  } catch (error) {
    logger.error('Unhandled error in work task API', error as Error, { correlationId });
    return ResponseBuilder.internalError('Internal server error', undefined, context);
  }
};

/**
 * Submit a new work task for analysis
 */
async function submitWorkTask(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required', undefined, context);
    }

    const requestBody: TaskSubmissionRequest = JSON.parse(event.body);
    
    // Validate required fields
    const missingFields = AuthUtils.validateRequiredFields(requestBody, [
      'title', 'description', 'content'
    ]);
    
    if (missingFields.length > 0) {
      return ResponseBuilder.badRequest(
        `Missing required fields: ${missingFields.join(', ')}`,
        { missingFields },
        context
      );
    }

    // Create work task record
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workTask: WorkTaskRecord = {
      task_id: taskId,
      created_at: new Date().toISOString(),
      title: requestBody.title,
      description: requestBody.description,
      content: requestBody.content,
      submitted_by: userContext.userId,
      team_id: userContext.teamId,
      priority: requestBody.priority || 'medium',
      category: requestBody.category,
      tags: requestBody.tags || [],
      status: 'submitted',
      updated_at: new Date().toISOString()
    };

    // Start analysis process (this would typically be async)
    logger.info('Starting work task analysis', { taskId, userId: userContext.userId });
    
    // For now, we'll simulate the analysis process
    // In a real implementation, this would trigger a Step Function or SQS message
    const analysisResult = await workTaskService.analyzeWorkTask({
      id: taskId,
      title: requestBody.title,
      description: requestBody.description,
      content: requestBody.content,
      submittedBy: userContext.userId,
      teamId: userContext.teamId,
      submittedAt: new Date(),
      priority: requestBody.priority || 'medium',
      category: requestBody.category,
      tags: requestBody.tags || []
    });

    workTask.analysis_result = analysisResult;
    workTask.status = 'analyzed';
    workTask.updated_at = new Date().toISOString();

    // Log the submission
    await auditRepository.create({
      request_id: context.correlationId || taskId,
      user_id: userContext.userId,
      persona: 'work_task_submitter',
      action: 'work_task_submitted',
      references: [],
      result_summary: `Work task "${requestBody.title}" submitted and analyzed`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: taskId
    });

    return ResponseBuilder.success({
      taskId,
      status: workTask.status,
      analysisResult: workTask.analysis_result
    }, 201, context);

  } catch (error) {
    logger.error('Failed to submit work task', error as Error, { userId: userContext.userId });
    return ResponseBuilder.internalError('Failed to submit work task', undefined, context);
  }
}

/**
 * Get list of work tasks with filtering
 */
async function getWorkTasks(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    
    const query: WorkTaskQuery = {
      team_id: queryParams.teamId || userContext.teamId,
      status: queryParams.status,
      submitted_by: queryParams.submittedBy,
      priority: queryParams.priority,
      limit: parseInt(queryParams.limit || '20')
    };

    // Check if user can access other teams
    if (query.team_id !== userContext.teamId && 
        !AuthUtils.canAccessTeam(userContext, query.team_id!)) {
      return ResponseBuilder.forbidden('Cannot access other team resources', context);
    }

    // For now, return mock data
    // In real implementation, this would query DynamoDB
    const mockTasks = [
      {
        task_id: 'task-1',
        title: 'Implement user authentication',
        status: 'in_progress',
        priority: 'high',
        submitted_by: userContext.userId,
        team_id: userContext.teamId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    return ResponseBuilder.success({
      tasks: mockTasks,
      totalCount: mockTasks.length,
      hasMore: false
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get work tasks', error as Error);
    return ResponseBuilder.internalError('Failed to get work tasks', undefined, context);
  }
}

/**
 * Get specific work task by ID
 */
async function getWorkTask(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    // Mock implementation - would query DynamoDB in real system
    const mockTask: WorkTaskRecord = {
      task_id: taskId,
      created_at: new Date().toISOString(),
      title: 'Sample Task',
      description: 'Sample task description',
      content: 'Sample task content',
      submitted_by: userContext.userId,
      team_id: userContext.teamId,
      priority: 'medium',
      status: 'analyzed',
      updated_at: new Date().toISOString()
    };

    return ResponseBuilder.success(mockTask, 200, context);

  } catch (error) {
    logger.error('Failed to get work task', error as Error);
    return ResponseBuilder.internalError('Failed to get work task', undefined, context);
  }
}

/**
 * Update work task status or metadata
 */
async function updateWorkTask(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required', undefined, context);
    }

    const updateData = JSON.parse(event.body);
    
    // Validate allowed fields
    const allowedFields = ['status', 'priority', 'category', 'tags'];
    const invalidFields = Object.keys(updateData).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return ResponseBuilder.badRequest(
        `Invalid fields: ${invalidFields.join(', ')}`,
        { invalidFields },
        context
      );
    }

    // Log the update
    await auditRepository.create({
      request_id: context.correlationId || taskId,
      user_id: userContext.userId,
      persona: 'work_task_manager',
      action: 'work_task_updated',
      references: [],
      result_summary: `Work task ${taskId} updated`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: taskId
    });

    return ResponseBuilder.success({
      taskId,
      updatedFields: Object.keys(updateData),
      updatedAt: new Date().toISOString()
    }, 200, context);

  } catch (error) {
    logger.error('Failed to update work task', error as Error);
    return ResponseBuilder.internalError('Failed to update work task', undefined, context);
  }
}

/**
 * Get task analysis results
 */
async function getTaskAnalysis(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    // Mock analysis result - would be retrieved from DynamoDB in real system
    const mockAnalysisResult = {
      key_points: [
        {
          id: 'kp-1',
          text: 'Implement secure authentication system',
          category: 'objective',
          importance: 'high',
          extracted_from: 'main requirements'
        }
      ],
      related_workgroups: [
        {
          team_id: 'security-team',
          team_name: 'Security Team',
          relevance_score: 0.9,
          skills_matched: ['authentication', 'security'],
          contact_info: {
            lead_email: 'security-lead@company.com'
          }
        }
      ],
      todo_list: [
        {
          id: 'todo-1',
          title: 'Design authentication flow',
          description: 'Create detailed authentication flow diagram',
          priority: 'high',
          estimated_hours: 8,
          category: 'research',
          dependencies: [],
          required_skills: ['security', 'system design'],
          deliverable_requirements: []
        }
      ],
      knowledge_references: [],
      risk_assessment: {
        overall_risk_level: 'medium',
        identified_risks: [],
        mitigation_suggestions: []
      },
      recommendations: ['Consider using OAuth 2.0', 'Implement multi-factor authentication'],
      analysis_metadata: {
        analysis_version: '1.0',
        processing_time_ms: 5000,
        confidence_score: 0.85,
        knowledge_sources_consulted: 10,
        ai_model_used: 'gpt-4',
        analysis_timestamp: new Date().toISOString()
      }
    };

    return ResponseBuilder.success(mockAnalysisResult, 200, context);

  } catch (error) {
    logger.error('Failed to get task analysis', error as Error);
    return ResponseBuilder.internalError('Failed to get task analysis', undefined, context);
  }
}

/**
 * Get todos for a specific task
 */
async function getTodos(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    const queryParams = event.queryStringParameters || {};
    const query: TodoItemQuery = {
      task_id: taskId,
      status: queryParams.status,
      assigned_to: queryParams.assignedTo,
      priority: queryParams.priority,
      limit: parseInt(queryParams.limit || '50')
    };

    // Mock todos - would query DynamoDB in real system
    const mockTodos: TodoItemRecord[] = [
      {
        todo_id: 'todo-1',
        task_id: taskId,
        title: 'Design authentication flow',
        description: 'Create detailed authentication flow diagram',
        priority: 'high',
        estimated_hours: 8,
        category: 'research',
        status: 'pending',
        related_workgroups: ['security-team'],
        deliverables: [],
        quality_checks: [],
        dependencies: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    return ResponseBuilder.success({
      todos: mockTodos,
      totalCount: mockTodos.length
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get todos', error as Error);
    return ResponseBuilder.internalError('Failed to get todos', undefined, context);
  }
}

/**
 * Update todo status and metadata
 */
async function updateTodo(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return ResponseBuilder.badRequest('Todo ID is required', undefined, context);
    }

    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required', undefined, context);
    }

    const updateData: TodoUpdateRequest = JSON.parse(event.body);
    
    // Validate status if provided
    if (updateData.status) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
      if (!validStatuses.includes(updateData.status)) {
        return ResponseBuilder.badRequest(
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // Use TodoProgressTracker service
    await todoProgressTracker.updateTodoStatus(todoId, updateData.status || 'pending', {
      updated_by: userContext.userId,
      notes: updateData.notes,
      blocking_reason: updateData.status === 'blocked' ? updateData.notes : undefined,
      estimated_completion: updateData.due_date
    });

    return ResponseBuilder.success({
      todoId,
      status: updateData.status,
      updatedBy: userContext.userId,
      updatedAt: new Date().toISOString()
    }, 200, context);

  } catch (error) {
    logger.error('Failed to update todo', error as Error);
    return ResponseBuilder.internalError('Failed to update todo', undefined, context);
  }
}

/**
 * Submit deliverable for a todo item
 */
async function submitDeliverable(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return ResponseBuilder.badRequest('Todo ID is required', undefined, context);
    }

    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required', undefined, context);
    }

    const deliverableData: DeliverableSubmission = JSON.parse(event.body);
    
    // Validate required fields
    const missingFields = AuthUtils.validateRequiredFields(deliverableData, [
      'file_name', 'file_type', 'content_base64'
    ]);
    
    if (missingFields.length > 0) {
      return ResponseBuilder.badRequest(
        `Missing required fields: ${missingFields.join(', ')}`,
        { missingFields },
        context
      );
    }

    const deliverableId = `deliverable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create deliverable record
    const deliverable: DeliverableRecord = {
      deliverable_id: deliverableId,
      todo_id: todoId,
      file_name: deliverableData.file_name,
      file_type: deliverableData.file_type,
      file_size: deliverableData.file_size,
      s3_key: `deliverables/${todoId}/${deliverableId}/${deliverableData.file_name}`,
      submitted_by: userContext.userId,
      submitted_at: new Date().toISOString(),
      status: 'submitted'
    };

    // In real implementation, would upload to S3 and store in DynamoDB
    logger.info('Deliverable submitted', { deliverableId, todoId, userId: userContext.userId });

    return ResponseBuilder.success({
      deliverableId,
      status: 'submitted',
      submittedAt: deliverable.submitted_at
    }, 201, context);

  } catch (error) {
    logger.error('Failed to submit deliverable', error as Error);
    return ResponseBuilder.internalError('Failed to submit deliverable', undefined, context);
  }
}

/**
 * Get deliverables for a todo item
 */
async function getDeliverables(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return ResponseBuilder.badRequest('Todo ID is required', undefined, context);
    }

    // Mock deliverables - would query DynamoDB in real system
    const mockDeliverables: DeliverableRecord[] = [
      {
        deliverable_id: 'deliverable-1',
        todo_id: todoId,
        file_name: 'auth-flow-diagram.pdf',
        file_type: 'application/pdf',
        file_size: 1024000,
        s3_key: `deliverables/${todoId}/deliverable-1/auth-flow-diagram.pdf`,
        submitted_by: userContext.userId,
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      }
    ];

    return ResponseBuilder.success({
      deliverables: mockDeliverables,
      totalCount: mockDeliverables.length
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get deliverables', error as Error);
    return ResponseBuilder.internalError('Failed to get deliverables', undefined, context);
  }
}

/**
 * Get task progress summary
 */
async function getTaskProgress(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    const progressSummary = await todoProgressTracker.trackProgress(taskId);

    return ResponseBuilder.success(progressSummary, 200, context);

  } catch (error) {
    logger.error('Failed to get task progress', error as Error);
    return ResponseBuilder.internalError('Failed to get task progress', undefined, context);
  }
}

/**
 * Generate detailed progress report
 */
async function generateProgressReport(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = queryParams.endDate || new Date().toISOString();

    const progressReport = await todoProgressTracker.generateProgressReport(taskId, {
      start_date: startDate,
      end_date: endDate
    });

    return ResponseBuilder.success(progressReport, 200, context);

  } catch (error) {
    logger.error('Failed to generate progress report', error as Error);
    return ResponseBuilder.internalError('Failed to generate progress report', undefined, context);
  }
}

/**
 * Perform quality check on deliverable
 */
async function performQualityCheck(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const deliverableId = event.pathParameters?.deliverableId;
    if (!deliverableId) {
      return ResponseBuilder.badRequest('Deliverable ID is required', undefined, context);
    }

    // Mock deliverable for quality check
    const mockDeliverable = {
      deliverable_id: deliverableId,
      file_name: 'test-document.pdf',
      file_type: 'application/pdf',
      s3_key: `deliverables/test/${deliverableId}/test-document.pdf`
    };

    const qualityResult = await qualityAssessmentEngine.performQualityCheck(
      mockDeliverable,
      ['completeness', 'accuracy', 'format']
    );

    return ResponseBuilder.success(qualityResult, 200, context);

  } catch (error) {
    logger.error('Failed to perform quality check', error as Error);
    return ResponseBuilder.internalError('Failed to perform quality check', undefined, context);
  }
}

/**
 * Get quality report for deliverable
 */
async function getQualityReport(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const deliverableId = event.pathParameters?.deliverableId;
    if (!deliverableId) {
      return ResponseBuilder.badRequest('Deliverable ID is required', undefined, context);
    }

    // Mock quality report - would be retrieved from DynamoDB in real system
    const mockQualityReport = {
      deliverable_id: deliverableId,
      overall_score: 85,
      quality_dimensions: [
        {
          dimension: 'completeness',
          score: 90,
          weight: 0.3,
          details: 'All required sections present'
        },
        {
          dimension: 'accuracy',
          score: 80,
          weight: 0.4,
          details: 'Minor factual inconsistencies found'
        },
        {
          dimension: 'format',
          score: 85,
          weight: 0.3,
          details: 'Formatting mostly consistent with standards'
        }
      ],
      improvement_suggestions: [
        'Review technical accuracy in section 3',
        'Standardize heading formats'
      ],
      compliance_status: {
        is_compliant: true,
        standards_checked: ['ISO-9001', 'Company-Standard-v2'],
        violations: []
      },
      assessed_at: new Date().toISOString()
    };

    return ResponseBuilder.success(mockQualityReport, 200, context);

  } catch (error) {
    logger.error('Failed to get quality report', error as Error);
    return ResponseBuilder.internalError('Failed to get quality report', undefined, context);
  }
}

/**
 * Perform batch quality check on all deliverables for a task
 */
async function batchQualityCheck(
  event: APIGatewayProxyEvent,
  userContext: any,
  context: ErrorContext
): Promise<APIGatewayProxyResult> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return ResponseBuilder.badRequest('Task ID is required', undefined, context);
    }

    // Mock batch quality check results
    const mockResults = [
      {
        deliverable_id: 'deliverable-1',
        overall_score: 85,
        status: 'completed'
      },
      {
        deliverable_id: 'deliverable-2',
        overall_score: 92,
        status: 'completed'
      }
    ];

    return ResponseBuilder.success({
      taskId,
      results: mockResults,
      averageScore: 88.5,
      totalDeliverables: mockResults.length,
      processedAt: new Date().toISOString()
    }, 200, context);

  } catch (error) {
    logger.error('Failed to perform batch quality check', error as Error);
    return ResponseBuilder.internalError('Failed to perform batch quality check', undefined, context);
  }
}