import { WorkTaskAuditService } from '../work-task-audit-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { AuditLog, SecurityEvent } from '../../models';

describe('WorkTaskAuditService', () => {
  let service: WorkTaskAuditService;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;

  beforeEach(() => {
    mockAuditLogRepository = {
      create: jest.fn(),
      getByUserId: jest.fn(),
      getByTeam: jest.fn(),
      getRecent: jest.fn(),
    } as any;

    service = new WorkTaskAuditService(mockAuditLogRepository);
  });

  describe('auditTaskSubmission', () => {
    it('should audit task submission with all required fields', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-123',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'task-submission',
        references: [],
        result_summary: { status: 'success', message: 'Task submitted' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditTaskSubmission({
        requestId: 'req-123',
        userId: 'user-123',
        teamId: 'team-123',
        taskId: 'task-123',
        taskContent: {
          title: 'Test Task',
          description: 'Test Description',
          priority: 'high',
          category: 'development',
        },
        sessionId: 'session-123',
        userRole: 'developer',
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-123',
          user_id: 'user-123',
          team_id: 'team-123',
          action: 'task-submission',
          action_category: 'task_management',
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('auditTaskAnalysis', () => {
    it('should audit task analysis with knowledge sources', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-124',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'ai-agent',
        action: 'task-analysis',
        references: [],
        result_summary: { status: 'success', message: 'Analysis complete' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditTaskAnalysis({
        requestId: 'req-124',
        userId: 'user-123',
        teamId: 'team-123',
        taskId: 'task-123',
        analysisDetails: {
          keyPointsCount: 5,
          workgroupsIdentified: 3,
          todosGenerated: 10,
          knowledgeSourcesUsed: ['kendra', 'confluence'],
          risksIdentified: 2,
        },
        dataSources: [
          {
            source_system: 'kendra',
            source_id: 'doc-123',
            data_classification: 'internal',
            access_level_required: 'user',
            pii_detected: false,
            sensitive_data_types: [],
          },
        ],
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task-analysis',
          action_category: 'ai_operation',
          persona: 'ai-agent',
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('auditUserModification', () => {
    it('should audit user feedback', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-125',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'task-feedback',
        references: [],
        result_summary: { status: 'success', message: 'Feedback recorded' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditUserModification({
        requestId: 'req-125',
        userId: 'user-123',
        taskId: 'task-123',
        modificationType: 'feedback',
        modificationDetails: {
          field: 'analysis_result',
          comment: 'Great analysis!',
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task-feedback',
          action_category: 'task_management',
        })
      );
      expect(result).toEqual(mockAuditLog);
    });

    it('should audit user edits', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-126',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'task-edit',
        references: [],
        result_summary: { status: 'success', message: 'Edit recorded' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditUserModification({
        requestId: 'req-126',
        userId: 'user-123',
        taskId: 'task-123',
        modificationType: 'edit',
        modificationDetails: {
          field: 'priority',
          oldValue: 'medium',
          newValue: 'high',
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task-edit',
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('auditTodoOperation', () => {
    it('should audit todo creation', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-127',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'todo-create',
        references: [],
        result_summary: { status: 'success', message: 'Todo created' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditTodoOperation({
        requestId: 'req-127',
        userId: 'user-123',
        taskId: 'task-123',
        todoId: 'todo-123',
        operation: 'create',
        todoDetails: {
          title: 'Implement feature',
          status: 'pending',
          priority: 'high',
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'todo-create',
          action_category: 'task_management',
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('auditDeliverableOperation', () => {
    it('should audit deliverable submission', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-128',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'deliverable-submit',
        references: [],
        result_summary: { status: 'success', message: 'Deliverable submitted' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditDeliverableOperation({
        requestId: 'req-128',
        userId: 'user-123',
        taskId: 'task-123',
        todoId: 'todo-123',
        deliverableId: 'deliv-123',
        operation: 'submit',
        deliverableDetails: {
          fileName: 'report.pdf',
          fileType: 'application/pdf',
          fileSize: 1024000,
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deliverable-submit',
          action_category: 'artifact_check',
        })
      );
      expect(result).toEqual(mockAuditLog);
    });

    it('should audit deliverable validation with quality score', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-129',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'deliverable-validate',
        references: [],
        result_summary: { status: 'success', message: 'Validation complete' },
        compliance_score: 85,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditDeliverableOperation({
        requestId: 'req-129',
        userId: 'user-123',
        taskId: 'task-123',
        todoId: 'todo-123',
        deliverableId: 'deliv-123',
        operation: 'validate',
        deliverableDetails: {
          fileName: 'report.pdf',
          fileType: 'application/pdf',
          fileSize: 1024000,
          validationResult: {
            status: 'passed',
            qualityScore: 85,
            issues: ['Minor formatting issue'],
          },
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          compliance_score: 85,
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('auditError', () => {
    it('should audit system errors with recovery details', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-130',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'system',
        persona: 'system',
        action: 'system-error',
        references: [],
        result_summary: { status: 'error', message: 'Database connection failed' },
        compliance_score: 50,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditError({
        requestId: 'req-130',
        userId: 'system',
        taskId: 'task-123',
        errorDetails: {
          errorType: 'DatabaseError',
          errorMessage: 'Database connection failed',
          errorStack: 'Error: Connection timeout...',
          recoveryAction: 'Retry with exponential backoff',
          recoveryStatus: 'successful',
        },
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'system-error',
          action_category: 'system_operation',
          compliance_score: 50,
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('auditSecurityEvent', () => {
    it('should audit unauthorized access attempts', async () => {
      const securityEvent: SecurityEvent = {
        event_type: 'unauthorized_access',
        severity: 'high',
        description: 'Unauthorized access attempt to sensitive data',
        affected_resource: 'task-123',
        detection_method: 'access_control',
        remediation_status: 'blocked',
      };

      const mockAuditLog: AuditLog = {
        request_id: 'req-131',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-456',
        persona: 'security-system',
        action: 'security-event',
        references: [],
        result_summary: { status: 'security_event', message: 'Unauthorized access' },
        compliance_score: 25,
        security_event: securityEvent,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditSecurityEvent({
        requestId: 'req-131',
        userId: 'user-456',
        taskId: 'task-123',
        securityEvent,
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security-event',
          action_category: 'security',
          security_event: securityEvent,
          compliance_score: 25,
        })
      );
      expect(result).toEqual(mockAuditLog);
    });

    it('should calculate compliance score based on severity', async () => {
      const criticalEvent: SecurityEvent = {
        event_type: 'data_breach',
        severity: 'critical',
        description: 'Critical security breach detected',
        affected_resource: 'database',
        detection_method: 'intrusion_detection',
        remediation_status: 'in_progress',
      };

      const mockAuditLog: AuditLog = {
        request_id: 'req-132',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'system',
        persona: 'security-system',
        action: 'security-event',
        references: [],
        result_summary: { status: 'security_event', message: 'Critical breach' },
        compliance_score: 0,
        security_event: criticalEvent,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditSecurityEvent({
        requestId: 'req-132',
        userId: 'system',
        securityEvent: criticalEvent,
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          compliance_score: 0,
        })
      );
    });
  });

  describe('auditDataAccess', () => {
    it('should audit successful data access', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-133',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-123',
        persona: 'work-task-user',
        action: 'data-access',
        references: [],
        result_summary: { status: 'success', message: 'Data access granted' },
        compliance_score: 100,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditDataAccess({
        requestId: 'req-133',
        userId: 'user-123',
        taskId: 'task-123',
        accessDetails: {
          resourceType: 'knowledge_base',
          resourceId: 'kb-123',
          accessType: 'read',
          accessGranted: true,
        },
        dataSources: [
          {
            source_system: 'kendra',
            source_id: 'kb-123',
            data_classification: 'internal',
            access_level_required: 'user',
            pii_detected: false,
            sensitive_data_types: [],
          },
        ],
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'data-access',
          action_category: 'data_access',
          compliance_score: 100,
        })
      );
      expect(result).toEqual(mockAuditLog);
    });

    it('should audit denied data access with security event', async () => {
      const mockAuditLog: AuditLog = {
        request_id: 'req-134',
        timestamp: '2025-01-01T00:00:00.000Z',
        user_id: 'user-456',
        persona: 'work-task-user',
        action: 'data-access',
        references: [],
        result_summary: { status: 'denied', message: 'Data access denied' },
        compliance_score: 0,
      };

      mockAuditLogRepository.create.mockResolvedValue(mockAuditLog);

      const result = await service.auditDataAccess({
        requestId: 'req-134',
        userId: 'user-456',
        accessDetails: {
          resourceType: 'knowledge_base',
          resourceId: 'kb-sensitive',
          accessType: 'read',
          accessGranted: false,
          denialReason: 'Insufficient permissions',
        },
        dataSources: [],
      });

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          compliance_score: 0,
          security_event: expect.objectContaining({
            event_type: 'unauthorized_access',
            severity: 'medium',
          }),
        })
      );
      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('getTaskAuditTrail', () => {
    it('should retrieve audit trail for a specific task', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-135',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-123',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [{ source_type: 'work_task', source_id: 'task-123', relevance_score: 1.0 }],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
        },
        {
          request_id: 'req-136',
          timestamp: '2025-01-01T01:00:00.000Z',
          user_id: 'user-123',
          persona: 'ai-agent',
          action: 'task-analysis',
          references: [{ source_type: 'work_task', source_id: 'task-123', relevance_score: 1.0 }],
          result_summary: { status: 'success', message: 'Analysis complete' },
          compliance_score: 100,
        },
      ];

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 2,
        scannedCount: 2,
      });

      const result = await service.getTaskAuditTrail('task-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('task-submission');
      expect(result[1].action).toBe('task-analysis');
    });
  });

  describe('getUserAuditTrail', () => {
    it('should retrieve audit trail for a specific user', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-137',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-123',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
        },
      ];

      mockAuditLogRepository.getByUserId.mockResolvedValue({
        items: mockLogs,
        count: 1,
        scannedCount: 1,
      });

      const result = await service.getUserAuditTrail('user-123');

      expect(mockAuditLogRepository.getByUserId).toHaveBeenCalledWith({
        user_id: 'user-123',
        start_timestamp: undefined,
        end_timestamp: undefined,
        limit: 100,
      });
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getTeamSecurityEvents', () => {
    it('should retrieve security events for a team', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-138',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-123',
          persona: 'security-system',
          action: 'security-event',
          references: [],
          result_summary: { status: 'security_event', message: 'Security event' },
          compliance_score: 50,
          security_event: {
            event_type: 'unauthorized_access',
            severity: 'high',
            description: 'Unauthorized access',
            affected_resource: 'resource-123',
            detection_method: 'access_control',
            remediation_status: 'blocked',
          },
        },
      ];

      mockAuditLogRepository.getByTeam.mockResolvedValue({
        items: mockLogs,
        count: 1,
        scannedCount: 1,
      });

      const result = await service.getTeamSecurityEvents('team-123', 'high');

      expect(mockAuditLogRepository.getByTeam).toHaveBeenCalledWith(
        'team-123',
        undefined,
        undefined,
        1000
      );
      expect(result).toHaveLength(1);
      expect(result[0].security_event?.severity).toBe('high');
    });
  });
});
