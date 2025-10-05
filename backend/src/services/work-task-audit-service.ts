import { AuditLogRepository } from '../repositories/audit-log-repository';
import { Logger } from '../lambda/utils/logger';
import {
  AuditLog,
  CreateAuditLogInput,
  WorkTaskRecord,
  TodoItemRecord,
  DeliverableRecord,
  SecurityEvent,
  DataSourceAttribution,
  PerformanceMetrics,
} from '../models';

/**
 * Work Task Audit Service
 * Extends existing audit logging system to record all task-related operations
 * Requirements: 8.1, 8.2, 8.3, 9.4
 */
export class WorkTaskAuditService {
  private logger: Logger;

  constructor(
    private auditLogRepository: AuditLogRepository
  ) {
    this.logger = new Logger('WorkTaskAuditService');
  }

  /**
   * Audit work task submission
   * Requirement 8.1: Record user identity, timestamps, task content
   */
  async auditTaskSubmission(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId: string;
    taskContent: {
      title: string;
      description: string;
      priority: string;
      category?: string;
    };
    sessionId?: string;
    userRole?: string;
    performanceMetrics?: Partial<PerformanceMetrics>;
  }): Promise<AuditLog> {
    this.logger.info('Auditing task submission', { taskId: params.taskId });

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      user_role: params.userRole,
      persona: 'work-task-user',
      action: 'task-submission',
      action_category: 'task_management',
      action_subcategory: 'create',
      references: [
        {
          source_type: 'work_task',
          source_id: params.taskId,
          relevance_score: 1.0,
        },
      ],
      result_summary: {
        status: 'success',
        message: `Work task "${params.taskContent.title}" submitted successfully`,
        details: {
          task_id: params.taskId,
          priority: params.taskContent.priority,
          category: params.taskContent.category,
        },
      },
      compliance_score: 100,
      performance_metrics: params.performanceMetrics,
      business_context: {
        operation_type: 'task_submission',
        task_metadata: {
          title: params.taskContent.title,
          priority: params.taskContent.priority,
          category: params.taskContent.category,
        },
      },
      retention_days: 2555, // 7 years for compliance
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit task analysis process
   * Requirement 8.2: Record analysis process, knowledge sources used, generated results
   */
  async auditTaskAnalysis(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId: string;
    analysisDetails: {
      keyPointsCount: number;
      workgroupsIdentified: number;
      todosGenerated: number;
      knowledgeSourcesUsed: string[];
      risksIdentified: number;
    };
    dataSources: DataSourceAttribution[];
    performanceMetrics?: Partial<PerformanceMetrics>;
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.info('Auditing task analysis', { taskId: params.taskId });

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'ai-agent',
      action: 'task-analysis',
      action_category: 'ai_operation',
      action_subcategory: 'analysis',
      references: [
        {
          source_type: 'work_task',
          source_id: params.taskId,
          relevance_score: 1.0,
        },
      ],
      data_sources: params.dataSources,
      result_summary: {
        status: 'success',
        message: 'Task analysis completed successfully',
        details: {
          task_id: params.taskId,
          key_points_extracted: params.analysisDetails.keyPointsCount,
          workgroups_identified: params.analysisDetails.workgroupsIdentified,
          todos_generated: params.analysisDetails.todosGenerated,
          knowledge_sources_count: params.analysisDetails.knowledgeSourcesUsed.length,
          risks_identified: params.analysisDetails.risksIdentified,
        },
      },
      compliance_score: 100,
      performance_metrics: params.performanceMetrics,
      business_context: {
        operation_type: 'task_analysis',
        analysis_metadata: params.analysisDetails,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit user feedback and modifications
   * Requirement 8.3: Record user feedback and modification operations
   */
  async auditUserModification(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId: string;
    modificationType: 'feedback' | 'edit' | 'approval' | 'rejection';
    modificationDetails: {
      field: string;
      oldValue?: any;
      newValue?: any;
      comment?: string;
    };
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.info('Auditing user modification', { 
      taskId: params.taskId,
      type: params.modificationType 
    });

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'work-task-user',
      action: `task-${params.modificationType}`,
      action_category: 'task_management',
      action_subcategory: 'update',
      references: [
        {
          source_type: 'work_task',
          source_id: params.taskId,
          relevance_score: 1.0,
        },
      ],
      result_summary: {
        status: 'success',
        message: `Task ${params.modificationType} recorded`,
        details: {
          task_id: params.taskId,
          modification_type: params.modificationType,
          field_modified: params.modificationDetails.field,
          comment: params.modificationDetails.comment,
        },
      },
      compliance_score: 100,
      business_context: {
        operation_type: 'task_modification',
        modification_details: params.modificationDetails,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit todo item operations
   */
  async auditTodoOperation(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId: string;
    todoId: string;
    operation: 'create' | 'update' | 'complete' | 'delete';
    todoDetails: {
      title: string;
      status?: string;
      priority?: string;
    };
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.info('Auditing todo operation', { 
      todoId: params.todoId,
      operation: params.operation 
    });

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'work-task-user',
      action: `todo-${params.operation}`,
      action_category: 'task_management',
      action_subcategory: params.operation,
      references: [
        {
          source_type: 'work_task',
          source_id: params.taskId,
          relevance_score: 1.0,
        },
        {
          source_type: 'todo_item',
          source_id: params.todoId,
          relevance_score: 1.0,
        },
      ],
      result_summary: {
        status: 'success',
        message: `Todo ${params.operation} completed`,
        details: {
          task_id: params.taskId,
          todo_id: params.todoId,
          operation: params.operation,
          todo_title: params.todoDetails.title,
          status: params.todoDetails.status,
        },
      },
      compliance_score: 100,
      business_context: {
        operation_type: 'todo_management',
        todo_metadata: params.todoDetails,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit deliverable submission and validation
   */
  async auditDeliverableOperation(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId: string;
    todoId: string;
    deliverableId: string;
    operation: 'submit' | 'validate' | 'approve' | 'reject';
    deliverableDetails: {
      fileName: string;
      fileType: string;
      fileSize: number;
      validationResult?: {
        status: string;
        qualityScore?: number;
        issues?: string[];
      };
    };
    securityEvent?: SecurityEvent;
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.info('Auditing deliverable operation', { 
      deliverableId: params.deliverableId,
      operation: params.operation 
    });

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'work-task-user',
      action: `deliverable-${params.operation}`,
      action_category: 'artifact_check',
      action_subcategory: params.operation,
      references: [
        {
          source_type: 'work_task',
          source_id: params.taskId,
          relevance_score: 1.0,
        },
        {
          source_type: 'todo_item',
          source_id: params.todoId,
          relevance_score: 1.0,
        },
        {
          source_type: 'deliverable',
          source_id: params.deliverableId,
          relevance_score: 1.0,
        },
      ],
      result_summary: {
        status: 'success',
        message: `Deliverable ${params.operation} completed`,
        details: {
          task_id: params.taskId,
          todo_id: params.todoId,
          deliverable_id: params.deliverableId,
          file_name: params.deliverableDetails.fileName,
          file_type: params.deliverableDetails.fileType,
          file_size: params.deliverableDetails.fileSize,
          validation_status: params.deliverableDetails.validationResult?.status,
          quality_score: params.deliverableDetails.validationResult?.qualityScore,
        },
      },
      compliance_score: params.deliverableDetails.validationResult?.qualityScore || 100,
      security_event: params.securityEvent,
      business_context: {
        operation_type: 'deliverable_management',
        deliverable_metadata: params.deliverableDetails,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit system errors
   * Requirement 8.4: Record error details and recovery processes
   */
  async auditError(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId?: string;
    errorDetails: {
      errorType: string;
      errorMessage: string;
      errorStack?: string;
      recoveryAction?: string;
      recoveryStatus?: 'attempted' | 'successful' | 'failed';
    };
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.error('Auditing system error', { 
      errorType: params.errorDetails.errorType,
      taskId: params.taskId 
    });

    const references = params.taskId ? [
      {
        source_type: 'work_task',
        source_id: params.taskId,
        relevance_score: 1.0,
      },
    ] : [];

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'system',
      action: 'system-error',
      action_category: 'system_operation',
      action_subcategory: 'error',
      references,
      result_summary: {
        status: 'error',
        message: params.errorDetails.errorMessage,
        details: {
          error_type: params.errorDetails.errorType,
          recovery_action: params.errorDetails.recoveryAction,
          recovery_status: params.errorDetails.recoveryStatus,
        },
      },
      compliance_score: 50, // Lower score for errors
      error_details: {
        error_type: params.errorDetails.errorType,
        error_message: params.errorDetails.errorMessage,
        stack_trace: params.errorDetails.errorStack,
        recovery_attempted: !!params.errorDetails.recoveryAction,
      },
      business_context: {
        operation_type: 'error_handling',
        error_metadata: params.errorDetails,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit security events
   * Requirement 9.4: Record security events for unauthorized access
   */
  async auditSecurityEvent(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId?: string;
    securityEvent: SecurityEvent;
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.warn('Auditing security event', { 
      eventType: params.securityEvent.event_type,
      severity: params.securityEvent.severity 
    });

    const references = params.taskId ? [
      {
        source_type: 'work_task',
        source_id: params.taskId,
        relevance_score: 1.0,
      },
    ] : [];

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'security-system',
      action: 'security-event',
      action_category: 'security',
      action_subcategory: params.securityEvent.event_type,
      references,
      security_event: params.securityEvent,
      result_summary: {
        status: 'security_event',
        message: params.securityEvent.description,
        details: {
          event_type: params.securityEvent.event_type,
          severity: params.securityEvent.severity,
          affected_resource: params.securityEvent.affected_resource,
        },
      },
      compliance_score: this.calculateSecurityComplianceScore(params.securityEvent.severity),
      business_context: {
        operation_type: 'security_monitoring',
        security_metadata: params.securityEvent,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Audit data access operations
   * Requirement 9.2: Control access to knowledge base based on user permissions
   */
  async auditDataAccess(params: {
    requestId: string;
    userId: string;
    teamId?: string;
    taskId?: string;
    accessDetails: {
      resourceType: string;
      resourceId: string;
      accessType: 'read' | 'write' | 'delete';
      accessGranted: boolean;
      denialReason?: string;
    };
    dataSources: DataSourceAttribution[];
    sessionId?: string;
  }): Promise<AuditLog> {
    this.logger.info('Auditing data access', { 
      resourceType: params.accessDetails.resourceType,
      accessGranted: params.accessDetails.accessGranted 
    });

    const references = params.taskId ? [
      {
        source_type: 'work_task',
        source_id: params.taskId,
        relevance_score: 1.0,
      },
    ] : [];

    references.push({
      source_type: params.accessDetails.resourceType,
      source_id: params.accessDetails.resourceId,
      relevance_score: 1.0,
    });

    const input: CreateAuditLogInput = {
      request_id: params.requestId,
      user_id: params.userId,
      team_id: params.teamId,
      session_id: params.sessionId,
      persona: 'work-task-user',
      action: 'data-access',
      action_category: 'data_access',
      action_subcategory: params.accessDetails.accessType,
      references,
      data_sources: params.dataSources,
      result_summary: {
        status: params.accessDetails.accessGranted ? 'success' : 'denied',
        message: params.accessDetails.accessGranted 
          ? 'Data access granted' 
          : `Data access denied: ${params.accessDetails.denialReason}`,
        details: {
          resource_type: params.accessDetails.resourceType,
          resource_id: params.accessDetails.resourceId,
          access_type: params.accessDetails.accessType,
          access_granted: params.accessDetails.accessGranted,
        },
      },
      compliance_score: params.accessDetails.accessGranted ? 100 : 0,
      security_event: !params.accessDetails.accessGranted ? {
        event_type: 'unauthorized_access',
        severity: 'medium',
        description: `Unauthorized ${params.accessDetails.accessType} access attempt to ${params.accessDetails.resourceType}`,
        affected_resource: params.accessDetails.resourceId,
        detection_method: 'access_control',
        remediation_status: 'blocked',
      } : undefined,
      business_context: {
        operation_type: 'data_access',
        access_metadata: params.accessDetails,
      },
      retention_days: 2555,
    };

    return await this.auditLogRepository.create(input);
  }

  /**
   * Get audit trail for a specific work task
   */
  async getTaskAuditTrail(taskId: string, limit?: number): Promise<AuditLog[]> {
    this.logger.info('Retrieving task audit trail', { taskId });

    // Query audit logs that reference this task
    const allLogs = await this.auditLogRepository.getRecent(1000);
    
    return allLogs.items
      .filter(log => 
        log.references?.some(ref => 
          ref.source_type === 'work_task' && ref.source_id === taskId
        )
      )
      .slice(0, limit || 100);
  }

  /**
   * Get audit trail for a specific user
   */
  async getUserAuditTrail(
    userId: string,
    startTimestamp?: string,
    endTimestamp?: string,
    limit?: number
  ): Promise<AuditLog[]> {
    this.logger.info('Retrieving user audit trail', { userId });

    const result = await this.auditLogRepository.getByUserId({
      user_id: userId,
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      limit: limit || 100,
    });

    return result.items;
  }

  /**
   * Get security events for a team
   */
  async getTeamSecurityEvents(
    teamId: string,
    severity?: 'low' | 'medium' | 'high' | 'critical',
    startTimestamp?: string,
    endTimestamp?: string
  ): Promise<AuditLog[]> {
    this.logger.info('Retrieving team security events', { teamId, severity });

    const teamLogs = await this.auditLogRepository.getByTeam(
      teamId,
      startTimestamp,
      endTimestamp,
      1000
    );

    return teamLogs.items.filter(log => {
      if (!log.security_event) return false;
      if (severity && log.security_event.severity !== severity) return false;
      return true;
    });
  }

  /**
   * Calculate compliance score based on security event severity
   */
  private calculateSecurityComplianceScore(severity: string): number {
    switch (severity) {
      case 'critical':
        return 0;
      case 'high':
        return 25;
      case 'medium':
        return 50;
      case 'low':
        return 75;
      default:
        return 100;
    }
  }
}
