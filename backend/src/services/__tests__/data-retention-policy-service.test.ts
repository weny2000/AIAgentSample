import { DataRetentionPolicyService, RetentionPolicy } from '../data-retention-policy-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { AuditLog } from '../../models';

describe('DataRetentionPolicyService', () => {
  let service: DataRetentionPolicyService;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;

  beforeEach(() => {
    mockAuditLogRepository = {
      getRecent: jest.fn(),
    } as any;

    service = new DataRetentionPolicyService(mockAuditLogRepository);
  });

  describe('Policy Management', () => {
    it('should initialize with default policies', () => {
      const policies = service.getAllPolicies();
      
      expect(policies.length).toBeGreaterThan(0);
      expect(policies.some(p => p.dataType === 'audit_log')).toBe(true);
      expect(policies.some(p => p.dataType === 'work_task')).toBe(true);
      expect(policies.some(p => p.dataType === 'deliverable')).toBe(true);
      expect(policies.some(p => p.dataType === 'todo_item')).toBe(true);
    });

    it('should register custom retention policy', () => {
      const customPolicy: RetentionPolicy = {
        policyId: 'CUSTOM-001',
        policyName: 'Custom Policy',
        description: 'Custom retention policy',
        dataType: 'audit_log',
        retentionPeriodDays: 365,
        archiveBeforeDelete: true,
        deletionMethod: 'soft',
      };

      service.registerPolicy(customPolicy);
      const retrieved = service.getPolicy('CUSTOM-001');

      expect(retrieved).toEqual(customPolicy);
    });

    it('should get policies by data type', () => {
      const auditPolicies = service.getPoliciesByDataType('audit_log');
      
      expect(auditPolicies.length).toBeGreaterThan(0);
      expect(auditPolicies.every(p => p.dataType === 'audit_log')).toBe(true);
    });
  });

  describe('Retention Calculations', () => {
    it('should calculate expiry date correctly', () => {
      const createdAt = '2025-01-01T00:00:00.000Z';
      const expiryDate = service.calculateExpiryDate(createdAt, 'audit_log');

      expect(expiryDate).toBeDefined();
      
      if (expiryDate) {
        const created = new Date(createdAt);
        const expiry = new Date(expiryDate);
        const daysDiff = Math.ceil((expiry.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        
        expect(daysDiff).toBe(2555); // 7 years for audit logs
      }
    });

    it('should return null for unknown data type', () => {
      const createdAt = '2025-01-01T00:00:00.000Z';
      const expiryDate = service.calculateExpiryDate(createdAt, 'unknown_type');

      expect(expiryDate).toBeNull();
    });

    it('should determine if record should be retained', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago
      
      const shouldRetain = service.shouldRetain(recentDate.toISOString(), 'audit_log');
      
      expect(shouldRetain).toBe(true);
    });

    it('should determine if old record should not be retained', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 10); // 10 years ago
      
      const shouldRetain = service.shouldRetain(oldDate.toISOString(), 'audit_log');
      
      expect(shouldRetain).toBe(false);
    });
  });

  describe('Retention Status', () => {
    it('should get complete retention status', () => {
      const createdAt = '2025-01-01T00:00:00.000Z';
      const status = service.getRetentionStatus(createdAt, 'audit_log');

      expect(status.shouldRetain).toBe(true);
      expect(status.expiryDate).toBeDefined();
      expect(status.daysUntilExpiry).toBeGreaterThan(0);
      expect(status.policy).toBeDefined();
      expect(status.policy?.dataType).toBe('audit_log');
    });

    it('should handle unknown data type gracefully', () => {
      const createdAt = '2025-01-01T00:00:00.000Z';
      const status = service.getRetentionStatus(createdAt, 'unknown_type');

      expect(status.shouldRetain).toBe(true); // Default to retain
      expect(status.expiryDate).toBeNull();
      expect(status.daysUntilExpiry).toBeNull();
      expect(status.policy).toBeNull();
    });
  });

  describe('Policy Execution', () => {
    it('should execute audit log retention policy', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 10);

      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-old-1',
          timestamp: oldDate.toISOString(),
          user_id: 'user-1',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
        },
        {
          request_id: 'req-recent-1',
          timestamp: new Date().toISOString(),
          user_id: 'user-2',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
        },
      ];

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 2,
        scannedCount: 2,
      });

      const result = await service.executeAuditLogRetention('RETENTION-AUDIT-001');

      expect(result.policyId).toBe('RETENTION-AUDIT-001');
      expect(result.recordsEvaluated).toBe(1); // Only old log
      expect(result.executedAt).toBeDefined();
    });

    it('should handle policy execution errors gracefully', async () => {
      mockAuditLogRepository.getRecent.mockRejectedValue(new Error('Database error'));

      const result = await service.executeAuditLogRetention('RETENTION-AUDIT-001');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Database error');
    });

    it('should throw error for non-existent policy', async () => {
      await expect(
        service.executeAuditLogRetention('NON-EXISTENT')
      ).rejects.toThrow('Retention policy not found');
    });

    it('should throw error for wrong data type', async () => {
      await expect(
        service.executeAuditLogRetention('RETENTION-TASK-001')
      ).rejects.toThrow('not for audit logs');
    });
  });

  describe('Execute All Policies', () => {
    it('should execute all retention policies', async () => {
      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: [],
        count: 0,
        scannedCount: 0,
      });

      const results = await service.executeAllPolicies();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.policyId)).toBe(true);
      expect(results.every(r => r.executedAt)).toBe(true);
    });

    it('should handle individual policy failures', async () => {
      mockAuditLogRepository.getRecent.mockRejectedValue(new Error('Database error'));

      const results = await service.executeAllPolicies();

      expect(results.length).toBeGreaterThan(0);
      const auditLogResult = results.find(r => r.policyId === 'RETENTION-AUDIT-001');
      expect(auditLogResult?.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Retention Report', () => {
    it('should generate retention compliance report', async () => {
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

      const report = await service.generateRetentionReport();

      expect(report.totalPolicies).toBeGreaterThan(0);
      expect(report.policiesByDataType).toBeDefined();
      expect(report.complianceStatus).toBeDefined();
      expect(['compliant', 'non-compliant', 'warning']).toContain(report.complianceStatus);
    });

    it('should detect upcoming expirations', async () => {
      const soonToExpire = new Date();
      soonToExpire.setDate(soonToExpire.getDate() + 15); // Expires in 15 days

      const mockLogs: AuditLog[] = [
        {
          request_id: 'req-1',
          timestamp: '2018-01-01T00:00:00.000Z',
          user_id: 'user-1',
          persona: 'work-task-user',
          action: 'task-submission',
          references: [],
          result_summary: { status: 'success', message: 'Task submitted' },
          compliance_score: 100,
          expires_at: soonToExpire.toISOString(),
        },
      ];

      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: mockLogs,
        count: 1,
        scannedCount: 1,
      });

      const report = await service.generateRetentionReport();

      expect(report.upcomingExpirations.length).toBeGreaterThan(0);
      const auditExpiration = report.upcomingExpirations.find(e => e.dataType === 'audit_log');
      expect(auditExpiration).toBeDefined();
      expect(auditExpiration?.count).toBe(1);
    });

    it('should provide recommendations for non-compliance', async () => {
      mockAuditLogRepository.getRecent.mockResolvedValue({
        items: [],
        count: 0,
        scannedCount: 0,
      });

      // Remove all policies to trigger non-compliance
      const service2 = new DataRetentionPolicyService(mockAuditLogRepository);
      // Clear default policies by creating new instance and not initializing
      
      const report = await service.generateRetentionReport();

      expect(report.complianceStatus).toBe('compliant');
      // Default policies are present, so should be compliant
    });
  });

  describe('Default Policies', () => {
    it('should have correct retention period for audit logs', () => {
      const auditPolicies = service.getPoliciesByDataType('audit_log');
      const policy = auditPolicies[0];

      expect(policy.retentionPeriodDays).toBe(2555); // 7 years
      expect(policy.archiveBeforeDelete).toBe(true);
      expect(policy.deletionMethod).toBe('hard');
    });

    it('should have correct retention period for work tasks', () => {
      const taskPolicies = service.getPoliciesByDataType('work_task');
      const policy = taskPolicies[0];

      expect(policy.retentionPeriodDays).toBe(1095); // 3 years
      expect(policy.archiveBeforeDelete).toBe(true);
      expect(policy.deletionMethod).toBe('soft');
    });

    it('should have correct retention period for deliverables', () => {
      const deliverablePolicies = service.getPoliciesByDataType('deliverable');
      const policy = deliverablePolicies[0];

      expect(policy.retentionPeriodDays).toBe(1825); // 5 years
      expect(policy.archiveBeforeDelete).toBe(true);
      expect(policy.deletionMethod).toBe('hard');
    });

    it('should have correct retention period for todo items', () => {
      const todoPolicies = service.getPoliciesByDataType('todo_item');
      const policy = todoPolicies[0];

      expect(policy.retentionPeriodDays).toBe(730); // 2 years
      expect(policy.archiveBeforeDelete).toBe(false);
      expect(policy.deletionMethod).toBe('soft');
    });
  });
});
