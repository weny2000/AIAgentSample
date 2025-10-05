import { ComplianceVerificationService } from '../compliance-verification-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { AuditLog, ComplianceReport } from '../../models';

describe('ComplianceVerificationService', () => {
  let service: ComplianceVerificationService;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;

  beforeEach(() => {
    mockAuditLogRepository = {
      getRecent: jest.fn(),
      generateComplianceReport: jest.fn(),
    } as any;

    service = new ComplianceVerificationService(mockAuditLogRepository);
  });

  describe('runComplianceChecks', () => {
    it('should run all compliance checks successfully', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-1',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
          expires_at: '2032-01-01T00:00:00.000Z',
        },
        {
          request_id: 'req-2',
          timestamp: '2025-01-01T01:00:00.000Z',
          user_id: 'user-1',
          persona: 'ai-agent',
          action: 'task-analysis',
          references: [],
          result_summary: { status: 'success', message: 'Analysis complete' },
          compliance_score: 100,
          expires_at: '2032-01-01T00:00:00.000Z',
        },
      ];

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 2,
        scannedCount: 2,
      });

      const results = await service.runComplianceChecks(
        '2025-01-01T00:00:00.000Z',
        '2025-01-02T00:00:00.000Z'
      );

      expect(results).toHaveLength(5); // 5 built-in rules
      expect(results.every(r => r.ruleId)).toBe(true);
    });

    it('should detect missing task operation audits', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-1',
          persona: 'system',
          action: 'system-operation',
          references: [],
          result_summary: { status: 'success', message: 'Operation complete' },
          compliance_score: 100,
        },
      ];

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 1,
        scannedCount: 1,
      });

      const results = await service.runComplianceChecks(
        '2025-01-01T00:00:00.000Z',
        '2025-01-02T00:00:00.000Z'
      );

      const taskAuditCheck = results.find(r => r.ruleId === 'AUDIT-001');
      expect(taskAuditCheck).toBeDefined();
      expect(taskAuditCheck?.passed).toBe(false);
      expect(taskAuditCheck?.violations.length).toBeGreaterThan(0);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate comprehensive compliance report', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-1',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
          expires_at: '2032-01-01T00:00:00.000Z',
        },
      ];

      const mockBaseReport: ComplianceReport = {
        report_id: 'report-1',
        generated_at: '2025-01-01T00:00:00.000Z',
        generated_by: 'admin',
        report_period: {
          start_date: '2025-01-01T00:00:00.000Z',
          end_date: '2025-01-02T00:00:00.000Z',
        },
        summary: {
          total_actions: 1,
          total_users: 1,
          total_teams: 1,
          average_compliance_score: 100,
          policy_violations: 0,
          security_events: 0,
        },
        compliance_metrics: {
          score_distribution: {},
          trend_analysis: [],
          top_violations: [],
        },
        security_analysis: {
          event_distribution: {},
          high_risk_events: [],
          user_risk_scores: [],
        },
        data_governance: {
          data_source_usage: {},
          pii_access_events: 0,
          retention_compliance: {
            compliant_records: 1,
            expired_records: 0,
            pending_deletion: 0,
          },
        },
        recommendations: [],
      };

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 1,
        scannedCount: 1,
      });

      mockAuditLogRepository.generateComplianceReport.mockResolvedValue(mockBaseReport);

      const report = await service.generateComplianceReport(
        '2025-01-01T00:00:00.000Z',
        '2025-01-02T00:00:00.000Z',
        'admin'
      );

      expect(report.report_id).toBe('report-1');
      expect(report.compliance_metrics).toHaveProperty('automated_checks');
      expect(report.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('verifyTaskCompliance', () => {
    it('should verify compliant task', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-1',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [{ source_type: 'work_task', source_id: 'task-123', relevance_score: 1.0 }],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
        },
        {
          request_id: 'req-2',
          timestamp: '2025-01-01T01:00:00.000Z',
          user_id: 'user-1',
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

      const result = await service.verifyTaskCompliance('task-123');

      expect(result.compliant).toBe(true);
      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect non-compliant task with missing audits', async () => {
      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: [],
        count: 0,
        scannedCount: 0,
      });

      const result = await service.verifyTaskCompliance('task-456');

      expect(result.compliant).toBe(false);
      expect(result.score).toBe(0);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].description).toContain('No audit logs found');
    });

    it('should detect missing required audit events', async () => {
      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-1',
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: 'user-1',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [{ source_type: 'work_task', source_id: 'task-789', relevance_score: 1.0 }],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
        },
      ];

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 1,
        scannedCount: 1,
      });

      const result = await service.verifyTaskCompliance('task-789');

      expect(result.compliant).toBe(false);
      expect(result.score).toBe(50); // Only 1 of 2 required events
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].description).toContain('task-analysis');
    });
  });

  describe('Compliance Rules', () => {
    describe('AUDIT-001: Task Operations Audit', () => {
      it('should pass when task operations are audited', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'work-task-user',
            action: 'task-submission',
            references: [],
            result_summary: { status: 'success', message: 'Task submitted' },
            compliance_score: 100,
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 1,
          scannedCount: 1,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'AUDIT-001');
        expect(rule?.passed).toBe(true);
        expect(rule?.score).toBe(100);
      });
    });

    describe('AUDIT-002: Security Event Logging', () => {
      it('should pass when security events are properly logged', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'security-system',
            action: 'security-event',
            references: [],
            result_summary: { status: 'security_event', message: 'Security event' },
            compliance_score: 50,
            security_event: {
              event_type: 'unauthorized_access',
              severity: 'high',
              description: 'Unauthorized access attempt',
              affected_resource: 'resource-1',
              detection_method: 'access_control',
              remediation_status: 'blocked',
            },
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 1,
          scannedCount: 1,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'AUDIT-002');
        expect(rule?.passed).toBe(true);
        expect(rule?.score).toBe(100);
      });

      it('should fail when security events lack required fields', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'security-system',
            action: 'security-event',
            references: [],
            result_summary: { status: 'security_event', message: 'Security event' },
            compliance_score: 50,
            security_event: {
              event_type: '',
              severity: undefined as any,
              description: 'Incomplete event',
              affected_resource: 'resource-1',
              detection_method: 'access_control',
              remediation_status: 'blocked',
            },
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 1,
          scannedCount: 1,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'AUDIT-002');
        expect(rule?.passed).toBe(false);
        expect(rule?.violations.length).toBeGreaterThan(0);
      });
    });

    describe('ACCESS-001: Data Access Control', () => {
      it('should pass with low unauthorized access rate', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'work-task-user',
            action: 'data-access',
            references: [],
            result_summary: { status: 'success', message: 'Access granted' },
            compliance_score: 100,
          },
          {
            request_id: 'req-2',
            timestamp: '2025-01-01T01:00:00.000Z',
            user_id: 'user-2',
            persona: 'work-task-user',
            action: 'data-access',
            references: [],
            result_summary: { status: 'success', message: 'Access granted' },
            compliance_score: 100,
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 2,
          scannedCount: 2,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'ACCESS-001');
        expect(rule?.passed).toBe(true);
      });

      it('should fail with high unauthorized access rate', async () => {
        const mockLogs: AuditLog[] = Array.from({ length: 10 }, (_, i) => ({
          request_id: `req-${i}`,
          timestamp: '2025-01-01T00:00:00.000Z',
          user_id: `user-${i}`,
          persona: 'work-task-user',
          action: 'data-access',
          references: [],
          result_summary: { status: i < 5 ? 'success' : 'denied', message: 'Access' },
          compliance_score: i < 5 ? 100 : 0,
          security_event: i >= 5 ? {
            event_type: 'unauthorized_access',
            severity: 'medium',
            description: 'Unauthorized access',
            affected_resource: 'resource',
            detection_method: 'access_control',
            remediation_status: 'blocked',
          } : undefined,
        }));

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 10,
          scannedCount: 10,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'ACCESS-001');
        expect(rule?.passed).toBe(false);
        expect(rule?.violations.length).toBeGreaterThan(0);
      });
    });

    describe('RETENTION-001: Audit Log Retention', () => {
      it('should pass when all logs have retention policy', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'work-task-user',
            action: 'task-submission',
            references: [],
            result_summary: { status: 'success', message: 'Task submitted' },
            compliance_score: 100,
            expires_at: '2032-01-01T00:00:00.000Z',
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 1,
          scannedCount: 1,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'RETENTION-001');
        expect(rule?.passed).toBe(true);
        expect(rule?.score).toBe(100);
      });

      it('should fail when logs lack retention policy', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'work-task-user',
            action: 'task-submission',
            references: [],
            result_summary: { status: 'success', message: 'Task submitted' },
            compliance_score: 100,
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 1,
          scannedCount: 1,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'RETENTION-001');
        expect(rule?.passed).toBe(false);
        expect(rule?.violations.length).toBeGreaterThan(0);
      });
    });

    describe('AUDIT-003: User Modification Tracking', () => {
      it('should pass when modifications have proper context', async () => {
        const mockLogs: AuditLog[] = [
          {
            request_id: 'req-1',
            timestamp: '2025-01-01T00:00:00.000Z',
            user_id: 'user-1',
            persona: 'work-task-user',
            action: 'task-edit',
            references: [],
            result_summary: { status: 'success', message: 'Task edited' },
            compliance_score: 100,
            business_context: {
              operation_type: 'task_modification',
              modification_details: {
                field: 'priority',
                oldValue: 'medium',
                newValue: 'high',
              },
            },
          },
        ];

        mockAuditLogRepository.getRecent.mockResolvedValue({
          items: mockLogs,
          count: 1,
          scannedCount: 1,
        });

        const results = await service.runComplianceChecks(
          '2025-01-01T00:00:00.000Z',
          '2025-01-02T00:00:00.000Z'
        );

        const rule = results.find(r => r.ruleId === 'AUDIT-003');
        expect(rule?.passed).toBe(true);
        expect(rule?.score).toBe(100);
      });
    });
  });
});
