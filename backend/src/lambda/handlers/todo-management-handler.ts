/**
 * Todo Management Handler
 * Handles todo list operations, status updates, and deliverable management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ResponseBuilder, ErrorContext } from '../utils/response-builder';
import { AuthUtils } from '../utils/auth-utils';
import { Logger } from '../utils/logger';
import { TodoProgressTracker } from '../../services/todo-progress-tracker';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import {
  TodoUpdateRequest,
  DeliverableSubmission,
  TodoItemQuery,
  DeliverableQuery,
  TodoItemRecord,
  DeliverableRecord
} from '../../models/work-task-models';

const logger = new Logger();

// Initialize services
const auditRepository = new AuditLogRepository();
const todoProgressTracker = new TodoProgressTracker();

/**
 * Get todos for a specific task
 */
export const getTodos = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get todos request received', { correlationId });

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
    
    const query: TodoItemQuery = {
      task_id: taskId,
      status: queryParams.status,
      assigned_to: queryParams.assignedTo,
      priority: queryParams.priority,
      limit: Math.min(parseInt(queryParams.limit || '50'), 100) // Cap at 100
    };

    // Validate status filter if provided
    if (query.status) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
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
    // For now, return mock data
    const mockTodos: TodoItemRecord[] = [
      {
        todo_id: 'todo-1',
        task_id: taskId,
        title: 'Design authentication flow',
        description: 'Create detailed authentication flow diagrams and specifications',
        priority: 'high',
        estimated_hours: 8,
        assigned_to: userContext.userId,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        dependencies: [],
        category: 'research',
        status: 'in_progress',
        related_workgroups: ['security-team'],
        deliverables: [
          {
            deliverable_id: 'deliverable-1',
            file_name: 'auth-flow-diagram.pdf',
            status: 'submitted',
            submitted_at: new Date().toISOString()
          }
        ],
        quality_checks: [
          {
            check_id: 'qc-1',
            check_type: 'completeness',
            status: 'passed',
            score: 85,
            executed_at: new Date().toISOString()
          }
        ],
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      },
      {
        todo_id: 'todo-2',
        task_id: taskId,
        title: 'Implement OAuth integration',
        description: 'Develop OAuth 2.0 integration with popular providers',
        priority: 'high',
        estimated_hours: 16,
        dependencies: ['todo-1'],
        category: 'development',
        status: 'pending',
        related_workgroups: ['security-team', 'backend-team'],
        deliverables: [],
        quality_checks: [],
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        todo_id: 'todo-3',
        task_id: taskId,
        title: 'Implement multi-factor authentication',
        description: 'Add MFA support with TOTP and SMS options',
        priority: 'medium',
        estimated_hours: 12,
        dependencies: ['todo-2'],
        category: 'development',
        status: 'pending',
        related_workgroups: ['security-team'],
        deliverables: [],
        quality_checks: [],
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // Apply filters to mock data
    let filteredTodos = mockTodos;
    
    if (query.status) {
      filteredTodos = filteredTodos.filter(todo => todo.status === query.status);
    }
    
    if (query.priority) {
      filteredTodos = filteredTodos.filter(todo => todo.priority === query.priority);
    }
    
    if (query.assigned_to) {
      filteredTodos = filteredTodos.filter(todo => todo.assigned_to === query.assigned_to);
    }

    // Apply pagination
    const paginatedTodos = filteredTodos.slice(0, query.limit);

    logger.info('Todos retrieved successfully', { 
      taskId,
      totalCount: filteredTodos.length,
      returnedCount: paginatedTodos.length,
      userId: userContext.userId
    });

    return ResponseBuilder.success({
      todos: paginatedTodos,
      totalCount: filteredTodos.length,
      hasMore: filteredTodos.length > query.limit!,
      filters: {
        taskId,
        status: query.status,
        priority: query.priority,
        assignedTo: query.assigned_to
      }
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get todos', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get todos', undefined, context);
  }
};

/**
 * Update todo status and metadata
 */
export const updateTodo = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Update todo request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Get todo ID from path parameters
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return ResponseBuilder.badRequest('Todo ID is required', undefined, context);
    }

    // Validate request body
    if (!event.body) {
      return ResponseBuilder.badRequest('Request body is required', undefined, context);
    }

    const updateData: TodoUpdateRequest = JSON.parse(event.body);
    
    // Validate allowed fields
    const allowedFields = ['status', 'assigned_to', 'due_date', 'notes', 'estimated_hours'];
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
      const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
      if (!validStatuses.includes(updateData.status)) {
        return ResponseBuilder.badRequest(
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // Validate due_date format if provided
    if (updateData.due_date) {
      const dueDate = new Date(updateData.due_date);
      if (isNaN(dueDate.getTime())) {
        return ResponseBuilder.badRequest(
          'Invalid due_date format. Must be a valid ISO date string',
          undefined,
          context
        );
      }
    }

    // Validate estimated_hours if provided
    if (updateData.estimated_hours !== undefined) {
      if (typeof updateData.estimated_hours !== 'number' || updateData.estimated_hours < 0) {
        return ResponseBuilder.badRequest(
          'estimated_hours must be a non-negative number',
          undefined,
          context
        );
      }
    }

    // Use TodoProgressTracker service to update status
    if (updateData.status) {
      await todoProgressTracker.updateTodoStatus(todoId, updateData.status, {
        updated_by: userContext.userId,
        notes: updateData.notes,
        blocking_reason: updateData.status === 'blocked' ? updateData.notes : undefined,
        estimated_completion: updateData.due_date
      });
    }

    // Log the update for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'todo_manager',
      action: 'todo_updated',
      references: [],
      result_summary: `Todo ${todoId} updated: ${providedFields.join(', ')}`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: todoId
    });

    logger.info('Todo updated successfully', { 
      todoId,
      updatedFields: providedFields,
      userId: userContext.userId
    });

    return ResponseBuilder.success({
      todoId,
      updatedFields: providedFields,
      updatedBy: userContext.userId,
      updatedAt: new Date().toISOString(),
      status: updateData.status
    }, 200, context);

  } catch (error) {
    logger.error('Failed to update todo', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to update todo', undefined, context);
  }
};

/**
 * Submit deliverable for a todo item
 */
export const submitDeliverable = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Submit deliverable request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Get todo ID from path parameters
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return ResponseBuilder.badRequest('Todo ID is required', undefined, context);
    }

    // Validate request body
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

    // Validate file size (base64 encoded size)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (deliverableData.file_size > maxFileSize) {
      return ResponseBuilder.badRequest(
        `File size exceeds maximum allowed size of ${maxFileSize / (1024 * 1024)}MB`,
        { maxFileSize, actualSize: deliverableData.file_size },
        context
      );
    }

    // Validate file type
    const allowedFileTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'image/png',
      'image/jpeg',
      'application/zip',
      'text/javascript',
      'application/javascript',
      'text/typescript',
      'application/json'
    ];

    if (!allowedFileTypes.includes(deliverableData.file_type)) {
      return ResponseBuilder.badRequest(
        `File type ${deliverableData.file_type} is not allowed`,
        { allowedFileTypes },
        context
      );
    }

    // Generate unique deliverable ID
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

    // In a real implementation, this would:
    // 1. Upload the file to S3
    // 2. Store the deliverable record in DynamoDB
    // 3. Trigger validation and quality check processes

    // Log the submission for audit
    await auditRepository.create({
      request_id: correlationId,
      user_id: userContext.userId,
      persona: 'deliverable_submitter',
      action: 'deliverable_submitted',
      references: [],
      result_summary: `Deliverable "${deliverableData.file_name}" submitted for todo ${todoId}`,
      compliance_score: 1.0,
      team_id: userContext.teamId,
      session_id: deliverableId
    });

    logger.info('Deliverable submitted successfully', { 
      deliverableId,
      todoId,
      fileName: deliverableData.file_name,
      userId: userContext.userId
    });

    return ResponseBuilder.success({
      deliverableId,
      todoId,
      fileName: deliverable.file_name,
      status: deliverable.status,
      submittedAt: deliverable.submitted_at,
      s3Key: deliverable.s3_key
    }, 201, context);

  } catch (error) {
    logger.error('Failed to submit deliverable', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to submit deliverable', undefined, context);
  }
};

/**
 * Get deliverables for a todo item
 */
export const getDeliverables = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const context: ErrorContext = { correlationId };

  try {
    logger.info('Get deliverables request received', { correlationId });

    // Extract user context
    let userContext;
    try {
      userContext = AuthUtils.extractUserContext(event);
      context.userId = userContext.userId;
    } catch (error) {
      return ResponseBuilder.unauthorized('Invalid or missing authorization', context);
    }

    // Get todo ID from path parameters
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return ResponseBuilder.badRequest('Todo ID is required', undefined, context);
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    
    const query: DeliverableQuery = {
      todo_id: todoId,
      status: queryParams.status,
      submitted_by: queryParams.submittedBy,
      limit: Math.min(parseInt(queryParams.limit || '20'), 100) // Cap at 100
    };

    // Validate status filter if provided
    if (query.status) {
      const validStatuses = ['submitted', 'validating', 'approved', 'rejected', 'needs_revision'];
      if (!validStatuses.includes(query.status)) {
        return ResponseBuilder.badRequest(
          `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`,
          undefined,
          context
        );
      }
    }

    // In a real implementation, this would query DynamoDB
    // For now, return mock data
    const mockDeliverables: DeliverableRecord[] = [
      {
        deliverable_id: 'deliverable-1',
        todo_id: todoId,
        file_name: 'auth-flow-diagram.pdf',
        file_type: 'application/pdf',
        file_size: 1024000,
        s3_key: `deliverables/${todoId}/deliverable-1/auth-flow-diagram.pdf`,
        submitted_by: userContext.userId,
        submitted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        status: 'approved',
        validation_result: {
          is_valid: true,
          validation_score: 0.9,
          checks_performed: [
            {
              check_name: 'file_format',
              check_type: 'format',
              status: 'passed'
            },
            {
              check_name: 'content_completeness',
              check_type: 'content',
              status: 'passed'
            }
          ],
          issues_found: [],
          recommendations: [],
          validated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
        },
        quality_assessment: {
          overall_score: 85,
          quality_dimensions: [
            {
              dimension: 'completeness',
              score: 90,
              weight: 0.4,
              details: 'All required sections present'
            },
            {
              dimension: 'clarity',
              score: 80,
              weight: 0.3,
              details: 'Clear and well-structured'
            },
            {
              dimension: 'format',
              score: 85,
              weight: 0.3,
              details: 'Follows standard formatting guidelines'
            }
          ],
          improvement_suggestions: [
            'Consider adding more detailed explanations in section 3'
          ],
          compliance_status: {
            is_compliant: true,
            standards_checked: ['company-standard-v2'],
            violations: []
          },
          assessed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        }
      },
      {
        deliverable_id: 'deliverable-2',
        todo_id: todoId,
        file_name: 'auth-implementation-notes.md',
        file_type: 'text/markdown',
        file_size: 5120,
        s3_key: `deliverables/${todoId}/deliverable-2/auth-implementation-notes.md`,
        submitted_by: userContext.userId,
        submitted_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        status: 'submitted'
      }
    ];

    // Apply filters to mock data
    let filteredDeliverables = mockDeliverables;
    
    if (query.status) {
      filteredDeliverables = filteredDeliverables.filter(deliverable => 
        deliverable.status === query.status
      );
    }
    
    if (query.submitted_by) {
      filteredDeliverables = filteredDeliverables.filter(deliverable => 
        deliverable.submitted_by === query.submitted_by
      );
    }

    // Apply pagination
    const paginatedDeliverables = filteredDeliverables.slice(0, query.limit);

    logger.info('Deliverables retrieved successfully', { 
      todoId,
      totalCount: filteredDeliverables.length,
      returnedCount: paginatedDeliverables.length,
      userId: userContext.userId
    });

    return ResponseBuilder.success({
      deliverables: paginatedDeliverables,
      totalCount: filteredDeliverables.length,
      hasMore: filteredDeliverables.length > query.limit!,
      filters: {
        todoId,
        status: query.status,
        submittedBy: query.submitted_by
      }
    }, 200, context);

  } catch (error) {
    logger.error('Failed to get deliverables', error as Error, { correlationId });
    return ResponseBuilder.internalError('Failed to get deliverables', undefined, context);
  }
};