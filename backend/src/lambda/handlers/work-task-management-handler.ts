/**
 * Work Task Management Handler
 * Handles work task submission, retrieval, and management operations
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ResponseBuilder, ErrorContext } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import {
  TaskSubmissionRequest,
  WorkTaskQuery,
  WorkTaskRecord,
  WorkTaskSummary
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

/**
 * Submit a new work task for analysis
 */
export const submitWorkTask = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Work task submission request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Validate request body
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

    // Validate priority if provided
    if (requestBody.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(requestBody.priority)) {
        return ResponseBuilder.badRequest(
          `Invalid priority. Must be one of: ${validPriorities.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // Generate unique task ID
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Starting work task analysis', { 
      taskId, 
      title: requestBody.title,
      userId: userContext.userId 
    });

    // Create work task content for analysis
    const taskContent = {
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
    };

    // Perform task analysis
    const analysisResult = await workTaskService.analyzeWorkTask(taskContent);

    // Create work task record
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
      status: 'analyzed',
      updated_at: new Date().toISOString(),
      analysis_result: analysisResult
    };

    // In a real implementation, this would be saved to DynamoDB
    logger.info('Work task analysis completed', { 
      taskId,
      keyPointsCount: analysisResult.keyPoints.length,
      todoItemsCount: analysisResult.todoList.length,
      relatedWorkgroupsCount: analysisResult.relatedWorkgroups.length
    });

    // Log the submission for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'work_task_submitter',
      action: 'work_task_submitted',
      references: [],
      result_summary: `Work task "${requestBody.title}" submitted and analyzed successfully`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: taskId
    });

    return ResponseBuilder.success({
      taskId,
      status: workTask.status,
      analysisResult: workTask.analysis_result,
      submittedAt: workTask.created_at
    }, 201, context);

  } catch (error) {
    logger.error('Failed to submit work task', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to submit work task', undefined, context);
  }
};

/**
 * Get list of work tasks with filtering and pagination
 */
export const getWorkTasks = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Work tasks list request received', { correlationId });

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
    
    const query: WorkTaskQuery = {
      team_id: queryParams.teamId || userContext.teamId,
      status: queryParams.status,
      submitted_by: queryParams.submittedBy,
      priority: queryParams.priority,
      limit: Math.min(parseInt(queryParams.limit || '20'), 100) // Cap at 100
    };

    // Validate team access
    if (query.team_id !== userContext.teamId && 
        !AuthUtils.canAccessTeam(userContext, query.team_id!)) {
      return ResponseBuilder.forbidden('Cannot access other team resources', context);
    }

    // Validate status filter if provided
    if (query.status) {
      const validStatuses = ['submitted', 'analyzing', 'analyzed', 'in_progress', 'completed'];
      if (!validStatuses.includes(query.status)) {
        return ResponseBuilder.badRequest(
          `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // Validate priority filter if provided
    if (query.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(query.priority)) {
        return ResponseBuilder.badRequest(
          `Invalid priority filter. Must be one of: ${validPriorities.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // In a real implementation, this would query DynamoDB
    // For now, return mock data that respects the filters
    const mockTasks: WorkTaskSummary[] = [
      {
        task_id: 'task-1',
        title: 'Implement user authentication system',
        status: 'in_progress',
        priority: 'high',
        submitted_by: userContext.userId,
        team_id: userContext.teamId,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        progress_summary: {
          task_id: 'task-1',
          total_todos: 5,
          completed_todos: 2,
          in_progress_todos: 2,
          blocked_todos: 0,
          completion_percentage: 40,
          last_updated: new Date().toISOString()
        }
      },
      {
        task_id: 'task-2',
        title: 'Database migration planning',
        status: 'analyzed',
        priority: 'medium',
        submitted_by: userContext.userId,
        team_id: userContext.teamId,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // Apply filters to mock data
    let filteredTasks = mockTasks;
    
    if (query.status) {
      filteredTasks = filteredTasks.filter(task => task.status === query.status);
    }
    
    if (query.priority) {
      filteredTasks = filteredTasks.filter(task => task.priority === query.priority);
    }
    
    if (query.submitted_by) {
      filteredTasks = filteredTasks.filter(task => task.submitted_by === query.submitted_by);
    }

    // Apply pagination
    const paginatedTasks = filteredTasks.slice(0, query.limit);

    logger.info('Work tasks retrieved successfully', { 
      totalCount: filteredTasks.length,
      returnedCount: paginatedTasks.length,
      userId: userContext.userId
    });

    return ResponseBuilder.success({
      tasks: paginatedTasks,
      totalCount: filteredTasks.length,
      hasMore: filteredTasks.length > query.limit!,
      filters: {
        teamId: query.team_id,
        status: query.status,
        priority: query.priority,
        submittedBy: query.submitted_by
      }
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get work tasks', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get work tasks', undefined, context);
  }
};

/**
 * Get specific work task by ID
 */
export const getWorkTask = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Work task detail request received', { correlationId });

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

    // In a real implementation, this would query DynamoDB
    // For now, return mock data
    const mockTask: WorkTaskRecord = {
      task_id: taskId,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      title: 'Implement user authentication system',
      description: 'Design and implement a secure user authentication system with multi-factor authentication support',
      content: 'We need to implement a comprehensive authentication system that supports multiple authentication methods including username/password, OAuth, and multi-factor authentication. The system should be secure, scalable, and user-friendly.',
      submitted_by: userContext.userId,
      team_id: userContext.teamId,
      priority: 'high',
      category: 'security',
      tags: ['authentication', 'security', 'oauth', 'mfa'],
      status: 'analyzed',
      updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      analysis_result: {
        key_points: [
          {
            id: 'kp-1',
            text: 'Implement secure authentication system with OAuth support',
            category: 'objective',
            importance: 'high',
            extracted_from: 'main requirements'
          },
          {
            id: 'kp-2',
            text: 'Multi-factor authentication requirement',
            category: 'constraint',
            importance: 'critical',
            extracted_from: 'security requirements'
          }
        ],
        related_workgroups: [
          {
            team_id: 'security-team',
            team_name: 'Security Team',
            relevance_score: 0.95,
            skills_matched: ['authentication', 'security', 'oauth'],
            contact_info: {
              lead_email: 'security-lead@company.com',
              slack_channel: '#security-team'
            },
            collaboration_history: {
              previous_projects: 3,
              success_rate: 0.9
            }
          },
          {
            team_id: 'backend-team',
            team_name: 'Backend Development Team',
            relevance_score: 0.8,
            skills_matched: ['api-development', 'system-integration'],
            contact_info: {
              lead_email: 'backend-lead@company.com',
              slack_channel: '#backend-team'
            }
          }
        ],
        todo_list: [
          {
            id: 'todo-1',
            title: 'Design authentication flow',
            description: 'Create detailed authentication flow diagrams and specifications',
            priority: 'high',
            estimated_hours: 8,
            category: 'research',
            dependencies: [],
            required_skills: ['security', 'system-design'],
            deliverable_requirements: [
              {
                type: 'document',
                format: ['pdf', 'md'],
                mandatory: true,
                description: 'Authentication flow diagram and specification',
                quality_standards: ['technical-accuracy', 'completeness']
              }
            ]
          },
          {
            id: 'todo-2',
            title: 'Implement OAuth integration',
            description: 'Develop OAuth 2.0 integration with popular providers',
            priority: 'high',
            estimated_hours: 16,
            category: 'development',
            dependencies: ['todo-1'],
            required_skills: ['oauth', 'api-development', 'security'],
            deliverable_requirements: [
              {
                type: 'code',
                format: ['js', 'ts'],
                mandatory: true,
                description: 'OAuth integration code with tests',
                quality_standards: ['code-quality', 'test-coverage']
              }
            ]
          }
        ],
        knowledge_references: [
          {
            id: 'ref-1',
            title: 'OAuth 2.0 Security Best Practices',
            source: 'confluence',
            url: 'https://confluence.company.com/oauth-best-practices',
            relevance_score: 0.9,
            excerpt: 'Comprehensive guide to implementing OAuth 2.0 securely...',
            document_type: 'documentation'
          }
        ],
        risk_assessment: {
          overall_risk_level: 'medium',
          identified_risks: [
            {
              id: 'risk-1',
              description: 'Security vulnerabilities in authentication implementation',
              category: 'technical',
              probability: 'medium',
              impact: 'high',
              mitigation_strategy: 'Thorough security review and penetration testing'
            }
          ],
          mitigation_suggestions: [
            'Conduct security code review',
            'Implement comprehensive testing',
            'Use established authentication libraries'
          ]
        },
        recommendations: [
          'Consider using established OAuth libraries like Passport.js',
          'Implement rate limiting for authentication endpoints',
          'Use secure session management practices'
        ],
        analysis_metadata: {
          analysis_version: '1.0',
          processing_time_ms: 5000,
          confidence_score: 0.85,
          knowledge_sources_consulted: 15,
          ai_model_used: 'gpt-4',
          analysis_timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    };

    // Verify user has access to this task
    if (mockTask.team_id !== userContext.teamId && 
        !AuthUtils.canAccessTeam(userContext, mockTask.team_id)) {
      return ResponseBuilder.forbidden('Cannot access task from other team', context);
    }

    logger.info('Work task retrieved successfully', { 
      taskId,
      userId: userContext.userId
    });

    return ResponseBuilder.success(mockTask, 200, context);

  } catch (error) {
    logger.error('Failed to get work task', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get work task', undefined, context);
  }
};

/**
 * Update work task status or metadata
 */
export const updateWorkTask = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Work task update request received', { correlationId });

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

    // Validate request body
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required', undefined, context);
    }

    const updateData = JSON.parse(event.body);
    
    // Validate allowed fields
    const allowedFields = ['status', 'priority', 'category', 'tags'];
    const providedFields = Object.keys(updateData);
    const invalidFields = providedFields.filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return ResponseBuilder.badRequest(
        `Invalid fields: ${invalidFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`,
        { invalidFields, allowedFields },
        context
      );
    }

    // Validate status if provided
    if (updateData.status) {
      const validStatuses = ['submitted', 'analyzing', 'analyzed', 'in_progress', 'completed'];
      if (!validStatuses.includes(updateData.status)) {
        return ResponseBuilder.badRequest(
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // Validate priority if provided
    if (updateData.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(updateData.priority)) {
        return ResponseBuilder.badRequest(
          `Invalid priority. Must be one of: ${validPriorities.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // In a real implementation, this would update the DynamoDB record
    logger.info('Work task updated successfully', { 
      taskId,
      updatedFields: providedFields,
      userId: userContext.userId
    });

    // Log the update for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'work_task_manager',
      action: 'work_task_updated',
      references: [],
      result_summary: `Work task ${taskId} updated: ${providedFields.join(', ')}`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: taskId
    });

    return ResponseBuilder.success({
      taskId,
      updatedFields: providedFields,
      updatedBy: userContext.userId,
      updatedAt: new Date().toISOString()
    }, 200, context);

  } catch (error) {
    logger.error('Failed to update work task', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to update work task', undefined, context);
  }
};

/**
 * Get task analysis results
 */
export const getTaskAnalysis = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Task analysis request received', { correlationId });

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

    // In a real implementation, this would retrieve the analysis from DynamoDB
    // For now, return the same mock analysis as in getWorkTask
    const mockAnalysisResult = {
      key_points: [
        {
          id: 'kp-1',
          text: 'Implement secure authentication system with OAuth support',
          category: 'objective',
          importance: 'high',
          extracted_from: 'main requirements'
        },
        {
          id: 'kp-2',
          text: 'Multi-factor authentication requirement',
          category: 'constraint',
          importance: 'critical',
          extracted_from: 'security requirements'
        }
      ],
      related_workgroups: [
        {
          team_id: 'security-team',
          team_name: 'Security Team',
          relevance_score: 0.95,
          skills_matched: ['authentication', 'security', 'oauth'],
          contact_info: {
            lead_email: 'security-lead@company.com',
            slack_channel: '#security-team'
          }
        }
      ],
      todo_list: [
        {
          id: 'todo-1',
          title: 'Design authentication flow',
          description: 'Create detailed authentication flow diagrams and specifications',
          priority: 'high',
          estimated_hours: 8,
          category: 'research',
          dependencies: [],
          required_skills: ['security', 'system-design'],
          deliverable_requirements: []
        }
      ],
      knowledge_references: [
        {
          id: 'ref-1',
          title: 'OAuth 2.0 Security Best Practices',
          source: 'confluence',
          url: 'https://confluence.company.com/oauth-best-practices',
          relevance_score: 0.9,
          excerpt: 'Comprehensive guide to implementing OAuth 2.0 securely...',
          document_type: 'documentation'
        }
      ],
      risk_assessment: {
        overall_risk_level: 'medium',
        identified_risks: [],
        mitigation_suggestions: [
          'Conduct security code review',
          'Implement comprehensive testing'
        ]
      },
      recommendations: [
        'Consider using established OAuth libraries',
        'Implement rate limiting for authentication endpoints'
      ],
      analysis_metadata: {
        analysis_version: '1.0',
        processing_time_ms: 5000,
        confidence_score: 0.85,
        knowledge_sources_consulted: 15,
        ai_model_used: 'gpt-4',
        analysis_timestamp: new Date().toISOString()
      }
    };

    logger.info('Task analysis retrieved successfully', { 
      taskId,
      userId: userContext.userId
    });

    return ResponseBuilder.success(mockAnalysisResult, 200, context);

  } catch (error) {
    logger.error('Failed to get task analysis', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get task analysis', undefined, context);
  }
};