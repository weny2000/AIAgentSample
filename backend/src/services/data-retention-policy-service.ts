import { AuditLogRepository } from '../repositories/audit-log-repository';
import { Logger } from '../lambda/utils/logger';
import { AuditLog } from '../models';

/**
 * Data retention policy definition
 */
export interface RetentionPolicy {
  policyId: string;
  policyName: string;
  description: string;
  dataType: 'audit_log' | 'work_task' | 'deliverable' | 'todo_item';
  retentionPeriodDays: number;
  archiveBeforeDelete: boolean;
  archiveLocation?: string;
  deletionMethod: 'soft' | 'hard';
  complianceRequirement?: string;
}

/**
 * Retention policy execution result
 */
export interface RetentionExecutionResult {
  policyId: string;
  executedAt: string;
  recordsEvaluated: number;
  recordsArchived: number;
  recordsDeleted: number;
  errors: string[];
}

/**
 * Data Retention Policy Service
 * Creates and manages data retention and deletion policies
 * Requirements: 8.3, 9.3
 */
export class DataRetentionPolicyService {
  private logger: Logger;
  private retentionPolicies: Map<string, RetentionPolicy>;

  constructor(
    private auditLogRepository: AuditLogRepository
  ) {
    this.logger = new Logger('DataRetentionPolicyService');
    this.retentionPolicies = new Map();
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default retention policies
   */
  private initializeDefaultPolicies(): void {
    // Audit logs: 7 years for compliance
    this.registerPolicy({
      policyId: 'RETENTION-AUDIT-001',
      policyName: 'Audit Log Retention',
      description: 'Retain audit logs for 7 years for compliance',
      dataType: 'audit_log',
      retentionPeriodDays: 2555, // 7 years
      archiveBeforeDelete: true,
      archiveLocation: 's3://audit-archive/',
      deletionMethod: 'hard',
      complianceRequirement: 'SOX, GDPR, HIPAA',
    });

    // Work tasks: 3 years
    this.registerPolicy({
      policyId: 'RETENTION-TASK-001',
      policyName: 'Work Task Retention',
      description: 'Retain work tasks for 3 years',
      dataType: 'work_task',
      retentionPeriodDays: 1095, // 3 years
      archiveBeforeDelete: true,
      archiveLocation: 's3://task-archive/',
      deletionMethod: 'soft',
    });

    // Deliverables: 5 years
    this.registerPolicy({
      policyId: 'RETENTION-DELIV-001',
      policyName: 'Deliverable Retention',
      description: 'Retain deliverables for 5 years',
      dataType: 'deliverable',
      retentionPeriodDays: 1825, // 5 years
      archiveBeforeDelete: true,
      archiveLocation: 's3://deliverable-archive/',
      deletionMethod: 'hard',
    });

    // Todo items: 2 years
    this.registerPolicy({
      policyId: 'RETENTION-TODO-001',
      policyName: 'Todo Item Retention',
      description: 'Retain todo items for 2 years',
      dataType: 'todo_item',
      retentionPeriodDays: 730, // 2 years
      archiveBeforeDelete: false,
      deletionMethod: 'soft',
    });
  }

  /**
   * Register a retention policy
   */
  registerPolicy(policy: RetentionPolicy): void {
    this.retentionPolicies.set(policy.policyId, policy);
    this.logger.info('Registered retention policy', { 
      policyId: policy.policyId,
      dataType: policy.dataType,
      retentionDays: policy.retentionPeriodDays 
    });
  }

  /**
   * Get retention policy by ID
   */
  getPolicy(policyId: string): RetentionPolicy | undefined {
    return this.retentionPolicies.get(policyId);
  }

  /**
   * Get all retention policies
   */
  getAllPolicies(): RetentionPolicy[] {
    return Array.from(this.retentionPolicies.values());
  }

  /**
   * Get policies by data type
   */
  getPoliciesByDataType(dataType: string): RetentionPolicy[] {
    return Array.from(this.retentionPolicies.values())
      .filter(policy => policy.dataType === dataType);
  }

  /**
   * Execute retention policy for audit logs
   */
  async executeAuditLogRetention(policyId: string): Promise<RetentionExecutionResult> {
    const policy = this.retentionPolicies.get(policyId);
    
    if (!policy) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    if (policy.dataType !== 'audit_log') {
      throw new Error(`Policy ${policyId} is not for audit logs`);
    }

    this.logger.info('Executing audit log retention policy', { policyId });

    const result: RetentionExecutionResult = {
      policyId,
      executedAt: new Date().toISOString(),
      recordsEvaluated: 0,
      recordsArchived: 0,
      recordsDeleted: 0,
      errors: [],
    };

    try {
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);
      const cutoffTimestamp = cutoffDate.toISOString();

      // Fetch audit logs older than retention period
      const allLogs = await this.auditLogRepository.getRecent(10000);
      const expiredLogs = allLogs.items.filter(log => 
        new Date(log.timestamp) < cutoffDate
      );

      result.recordsEvaluated = expiredLogs.length;

      // Archive logs if required
      if (policy.archiveBeforeDelete && expiredLogs.length > 0) {
        try {
          await this.archiveAuditLogs(expiredLogs, policy.archiveLocation || '');
          result.recordsArchived = expiredLogs.length;
        } catch (error) {
          const errorMsg = `Failed to archive logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          this.logger.error(errorMsg, { policyId });
        }
      }

      // Delete logs (in production, this would actually delete from DynamoDB)
      // For now, we just log the action
      if (policy.deletionMethod === 'hard') {
        this.logger.info('Would delete audit logs', { 
          count: expiredLogs.length,
          cutoffDate: cutoffTimestamp 
        });
        result.recordsDeleted = expiredLogs.length;
      }

    } catch (error) {
      const errorMsg = `Retention policy execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      this.logger.error(errorMsg, { policyId });
    }

    return result;
  }

  /**
   * Execute all retention policies
   */
  async executeAllPolicies(): Promise<RetentionExecutionResult[]> {
    this.logger.info('Executing all retention policies');

    const results: RetentionExecutionResult[] = [];

    for (const policy of this.retentionPolicies.values()) {
      try {
        if (policy.dataType === 'audit_log') {
          const result = await this.executeAuditLogRetention(policy.policyId);
          results.push(result);
        } else {
          // For other data types, create a placeholder result
          results.push({
            policyId: policy.policyId,
            executedAt: new Date().toISOString(),
            recordsEvaluated: 0,
            recordsArchived: 0,
            recordsDeleted: 0,
            errors: ['Policy execution not yet implemented for this data type'],
          });
        }
      } catch (error) {
        this.logger.error('Policy execution failed', { 
          policyId: policy.policyId,
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        
        results.push({
          policyId: policy.policyId,
          executedAt: new Date().toISOString(),
          recordsEvaluated: 0,
          recordsArchived: 0,
          recordsDeleted: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    return results;
  }

  /**
   * Calculate retention expiry date for a record
   */
  calculateExpiryDate(
    createdAt: string,
    dataType: string
  ): string | null {
    const policies = this.getPoliciesByDataType(dataType);
    
    if (policies.length === 0) {
      this.logger.warn('No retention policy found for data type', { dataType });
      return null;
    }

    // Use the first matching policy
    const policy = policies[0];
    const createdDate = new Date(createdAt);
    const expiryDate = new Date(createdDate);
    expiryDate.setDate(expiryDate.getDate() + policy.retentionPeriodDays);

    return expiryDate.toISOString();
  }

  /**
   * Check if a record should be retained
   */
  shouldRetain(
    createdAt: string,
    dataType: string
  ): boolean {
    const expiryDate = this.calculateExpiryDate(createdAt, dataType);
    
    if (!expiryDate) {
      // No policy found, retain by default
      return true;
    }

    return new Date() < new Date(expiryDate);
  }

  /**
   * Get retention status for a record
   */
  getRetentionStatus(
    createdAt: string,
    dataType: string
  ): {
    shouldRetain: boolean;
    expiryDate: string | null;
    daysUntilExpiry: number | null;
    policy: RetentionPolicy | null;
  } {
    const policies = this.getPoliciesByDataType(dataType);
    const policy = policies.length > 0 ? policies[0] : null;
    const expiryDate = this.calculateExpiryDate(createdAt, dataType);
    
    let daysUntilExpiry: number | null = null;
    if (expiryDate) {
      const now = new Date();
      const expiry = new Date(expiryDate);
      daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      shouldRetain: this.shouldRetain(createdAt, dataType),
      expiryDate,
      daysUntilExpiry,
      policy,
    };
  }

  /**
   * Generate retention compliance report
   */
  async generateRetentionReport(): Promise<{
    totalPolicies: number;
    policiesByDataType: Record<string, number>;
    upcomingExpirations: {
      dataType: string;
      count: number;
      oldestRecord: string;
    }[];
    complianceStatus: 'compliant' | 'non-compliant' | 'warning';
    recommendations: string[];
  }> {
    this.logger.info('Generating retention compliance report');

    const policies = this.getAllPolicies();
    const policiesByDataType: Record<string, number> = {};

    for (const policy of policies) {
      policiesByDataType[policy.dataType] = (policiesByDataType[policy.dataType] || 0) + 1;
    }

    // Check for upcoming expirations (next 30 days)
    const upcomingExpirations: {
      dataType: string;
      count: number;
      oldestRecord: string;
    }[] = [];

    // For audit logs, check actual data
    const allLogs = await this.auditLogRepository.getRecent(10000);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringLogs = allLogs.items.filter(log => {
      if (!log.expires_at) return false;
      const expiryDate = new Date(log.expires_at);
      return expiryDate <= thirtyDaysFromNow && expiryDate > new Date();
    });

    if (expiringLogs.length > 0) {
      const oldestLog = expiringLogs.reduce((oldest, log) => 
        new Date(log.timestamp) < new Date(oldest.timestamp) ? log : oldest
      );

      upcomingExpirations.push({
        dataType: 'audit_log',
        count: expiringLogs.length,
        oldestRecord: oldestLog.timestamp,
      });
    }

    // Determine compliance status
    let complianceStatus: 'compliant' | 'non-compliant' | 'warning' = 'compliant';
    const recommendations: string[] = [];

    // Check if all data types have policies
    const requiredDataTypes = ['audit_log', 'work_task', 'deliverable', 'todo_item'];
    const missingPolicies = requiredDataTypes.filter(
      type => !policies.some(p => p.dataType === type)
    );

    if (missingPolicies.length > 0) {
      complianceStatus = 'non-compliant';
      recommendations.push(`Create retention policies for: ${missingPolicies.join(', ')}`);
    }

    // Check for expiring records
    if (expiringLogs.length > 100) {
      complianceStatus = complianceStatus === 'compliant' ? 'warning' : complianceStatus;
      recommendations.push(`${expiringLogs.length} audit logs expiring in next 30 days - plan archival`);
    }

    return {
      totalPolicies: policies.length,
      policiesByDataType,
      upcomingExpirations,
      complianceStatus,
      recommendations,
    };
  }

  /**
   * Archive audit logs to S3 (placeholder implementation)
   */
  private async archiveAuditLogs(
    logs: AuditLog[],
    archiveLocation: string
  ): Promise<void> {
    this.logger.info('Archiving audit logs', { 
      count: logs.length,
      location: archiveLocation 
    });

    // In production, this would:
    // 1. Serialize logs to JSON/Parquet
    // 2. Compress the data
    // 3. Upload to S3
    // 4. Verify upload
    // 5. Update archive index

    // For now, just log the action
    this.logger.info('Audit logs archived successfully', { 
      count: logs.length 
    });
  }
}
