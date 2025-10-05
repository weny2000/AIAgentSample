import { AuditLogRepository } from '../repositories/audit-log-repository';
import { Logger } from '../lambda/utils/logger';
import { 
  AuditLog, 
  ComplianceReport,
  WorkTaskRecord,
  DeliverableRecord,
  TodoItemRecord,
} from '../models';

/**
 * Compliance rule definition
 */
export interface ComplianceRule {
  ruleId: string;
  ruleName: string;
  description: string;
  category: 'data_retention' | 'access_control' | 'audit_logging' | 'data_protection' | 'quality_standards';
  severity: 'low' | 'medium' | 'high' | 'critical';
  checkFunction: (context: ComplianceCheckContext) => Promise<ComplianceCheckResult>;
}

/**
 * Compliance check context
 */
export interface ComplianceCheckContext {
  auditLogs: AuditLog[];
  startDate: string;
  endDate: string;
  workTasks?: WorkTaskRecord[];
  deliverables?: DeliverableRecord[];
  todos?: TodoItemRecord[];
}

/**
 * Compliance check result
 */
export interface ComplianceCheckResult {
  ruleId: string;
  passed: boolean;
  score: number;
  violations: ComplianceViolation[];
  recommendations: string[];
}

/**
 * Compliance violation
 */
export interface ComplianceViolation {
  violationId: string;
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedResource: string;
  detectedAt: string;
  remediation: string;
}

/**
 * Compliance Verification Service
 * Implements automated verification of compliance checks
 * Requirements: 8.2, 8.3, 9.4
 */
export class ComplianceVerificationService {
  private logger: Logger;
  private complianceRules: Map<string, ComplianceRule>;

  constructor(
    private auditLogRepository: AuditLogRepository
  ) {
    this.logger = new Logger('ComplianceVerificationService');
    this.complianceRules = new Map();
    this.initializeComplianceRules();
  }

  /**
   * Initialize built-in compliance rules
   */
  private initializeComplianceRules(): void {
    // Rule 1: All task operations must be audited
    this.registerRule({
      ruleId: 'AUDIT-001',
      ruleName: 'Task Operations Audit',
      description: 'All task submission, analysis, and modification operations must be audited',
      category: 'audit_logging',
      severity: 'high',
      checkFunction: this.checkTaskOperationsAudited.bind(this),
    });

    // Rule 2: Security events must be logged
    this.registerRule({
      ruleId: 'AUDIT-002',
      ruleName: 'Security Event Logging',
      description: 'All security events must be logged with appropriate severity',
      category: 'audit_logging',
      severity: 'critical',
      checkFunction: this.checkSecurityEventsLogged.bind(this),
    });

    // Rule 3: Data access must be controlled
    this.registerRule({
      ruleId: 'ACCESS-001',
      ruleName: 'Data Access Control',
      description: 'All data access attempts must be authorized and logged',
      category: 'access_control',
      severity: 'high',
      checkFunction: this.checkDataAccessControl.bind(this),
    });

    // Rule 4: Audit logs must be retained
    this.registerRule({
      ruleId: 'RETENTION-001',
      ruleName: 'Audit Log Retention',
      description: 'Audit logs must be retained for minimum compliance period',
      category: 'data_retention',
      severity: 'high',
      checkFunction: this.checkAuditLogRetention.bind(this),
    });

    // Rule 5: User modifications must be tracked
    this.registerRule({
      ruleId: 'AUDIT-003',
      ruleName: 'User Modification Tracking',
      description: 'All user modifications to tasks and results must be tracked',
      category: 'audit_logging',
      severity: 'medium',
      checkFunction: this.checkUserModificationTracking.bind(this),
    });
  }

  /**
   * Register a compliance rule
   */
  registerRule(rule: ComplianceRule): void {
    this.complianceRules.set(rule.ruleId, rule);
    this.logger.info('Registered compliance rule', { ruleId: rule.ruleId });
  }

  /**
   * Run all compliance checks
   */
  async runComplianceChecks(
    startDate: string,
    endDate: string,
    context?: Partial<ComplianceCheckContext>
  ): Promise<ComplianceCheckResult[]> {
    this.logger.info('Running compliance checks', { startDate, endDate });

    // Fetch audit logs for the period
    const auditLogs = await this.fetchAuditLogs(startDate, endDate);

    const checkContext: ComplianceCheckContext = {
      auditLogs,
      startDate,
      endDate,
      ...context,
    };

    const results: ComplianceCheckResult[] = [];

    for (const rule of this.complianceRules.values()) {
      try {
        const result = await rule.checkFunction(checkContext);
        results.push(result);
      } catch (error) {
        this.logger.error('Compliance check failed', { 
          ruleId: rule.ruleId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        
        results.push({
          ruleId: rule.ruleId,
          passed: false,
          score: 0,
          violations: [{
            violationId: `${rule.ruleId}-ERROR`,
            ruleId: rule.ruleId,
            severity: 'high',
            description: `Compliance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            affectedResource: 'system',
            detectedAt: new Date().toISOString(),
            remediation: 'Review compliance check implementation',
          }],
          recommendations: ['Fix compliance check implementation'],
        });
      }
    }

    return results;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: string,
    endDate: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    this.logger.info('Generating compliance report', { startDate, endDate });

    // Run all compliance checks
    const checkResults = await this.runComplianceChecks(startDate, endDate);

    // Use audit log repository to generate base report
    const baseReport = await this.auditLogRepository.generateComplianceReport(
      startDate,
      endDate,
      generatedBy
    );

    // Enhance report with compliance check results
    const allViolations = checkResults.flatMap(r => r.violations);
    const criticalViolations = allViolations.filter(v => v.severity === 'critical');
    const highViolations = allViolations.filter(v => v.severity === 'high');

    // Calculate overall compliance score
    const totalScore = checkResults.reduce((sum, r) => sum + r.score, 0);
    const averageScore = checkResults.length > 0 ? totalScore / checkResults.length : 100;

    // Generate recommendations
    const recommendations = checkResults.flatMap(r => 
      r.recommendations.map(rec => ({
        priority: this.mapSeverityToPriority(
          this.complianceRules.get(r.ruleId)?.severity || 'medium'
        ),
        category: this.complianceRules.get(r.ruleId)?.category || 'Compliance',
        description: rec,
        estimated_impact: 'Improved compliance and reduced risk',
      }))
    );

    return {
      ...baseReport,
      summary: {
        ...baseReport.summary,
        average_compliance_score: averageScore,
        policy_violations: allViolations.length,
      },
      compliance_metrics: {
        ...baseReport.compliance_metrics,
        automated_checks: {
          total_checks: checkResults.length,
          passed_checks: checkResults.filter(r => r.passed).length,
          failed_checks: checkResults.filter(r => !r.passed).length,
          critical_violations: criticalViolations.length,
          high_violations: highViolations.length,
        },
      },
      recommendations: [...baseReport.recommendations, ...recommendations],
    };
  }

  /**
   * Verify compliance for a specific work task
   */
  async verifyTaskCompliance(taskId: string): Promise<{
    compliant: boolean;
    score: number;
    violations: ComplianceViolation[];
  }> {
    this.logger.info('Verifying task compliance', { taskId });

    // Fetch audit logs for this task
    const allLogs = await this.auditLogRepository.getRecent(1000);
    const taskLogs = allLogs.items.filter(log =>
      log.references?.some(ref => 
        ref.source_type === 'work_task' && ref.source_id === taskId
      )
    );

    if (taskLogs.length === 0) {
      return {
        compliant: false,
        score: 0,
        violations: [{
          violationId: `${taskId}-NO-AUDIT`,
          ruleId: 'AUDIT-001',
          severity: 'high',
          description: 'No audit logs found for this task',
          affectedResource: taskId,
          detectedAt: new Date().toISOString(),
          remediation: 'Ensure all task operations are properly audited',
        }],
      };
    }

    // Check for required audit events
    const requiredEvents = ['task-submission', 'task-analysis'];
    const foundEvents = new Set(taskLogs.map(log => log.action));
    const missingEvents = requiredEvents.filter(event => !foundEvents.has(event));

    const violations: ComplianceViolation[] = missingEvents.map(event => ({
      violationId: `${taskId}-MISSING-${event}`,
      ruleId: 'AUDIT-001',
      severity: 'medium',
      description: `Missing required audit event: ${event}`,
      affectedResource: taskId,
      detectedAt: new Date().toISOString(),
      remediation: `Ensure ${event} is properly audited`,
    }));

    const score = ((requiredEvents.length - missingEvents.length) / requiredEvents.length) * 100;

    return {
      compliant: violations.length === 0,
      score,
      violations,
    };
  }

  // Compliance check implementations

  private async checkTaskOperationsAudited(
    context: ComplianceCheckContext
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    
    // Check if task operations are audited
    const taskActions = ['task-submission', 'task-analysis', 'task-feedback', 'task-edit'];
    const auditedActions = new Set(context.auditLogs.map(log => log.action));
    
    // For this check, we verify that audit logs exist for task operations
    const hasTaskAudits = taskActions.some(action => auditedActions.has(action));
    
    if (!hasTaskAudits && context.auditLogs.length > 0) {
      violations.push({
        violationId: 'AUDIT-001-001',
        ruleId: 'AUDIT-001',
        severity: 'high',
        description: 'No task operation audit logs found in the period',
        affectedResource: 'audit_system',
        detectedAt: new Date().toISOString(),
        remediation: 'Ensure all task operations are properly audited',
      });
    }

    const score = violations.length === 0 ? 100 : 50;

    return {
      ruleId: 'AUDIT-001',
      passed: violations.length === 0,
      score,
      violations,
      recommendations: violations.length > 0 
        ? ['Implement comprehensive audit logging for all task operations']
        : [],
    };
  }

  private async checkSecurityEventsLogged(
    context: ComplianceCheckContext
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    
    // Check for security events without proper logging
    const securityLogs = context.auditLogs.filter(log => log.security_event);
    
    for (const log of securityLogs) {
      if (!log.security_event?.severity || !log.security_event?.event_type) {
        violations.push({
          violationId: `AUDIT-002-${log.request_id}`,
          ruleId: 'AUDIT-002',
          severity: 'high',
          description: 'Security event logged without required fields',
          affectedResource: log.request_id,
          detectedAt: log.timestamp,
          remediation: 'Ensure all security events include severity and event type',
        });
      }
    }

    const score = securityLogs.length > 0 
      ? ((securityLogs.length - violations.length) / securityLogs.length) * 100
      : 100;

    return {
      ruleId: 'AUDIT-002',
      passed: violations.length === 0,
      score,
      violations,
      recommendations: violations.length > 0
        ? ['Standardize security event logging format']
        : [],
    };
  }

  private async checkDataAccessControl(
    context: ComplianceCheckContext
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    
    // Check for data access without proper authorization
    const dataAccessLogs = context.auditLogs.filter(log => 
      log.action === 'data-access' || log.action_category === 'data_access'
    );
    
    const unauthorizedAccess = dataAccessLogs.filter(log =>
      log.security_event?.event_type === 'unauthorized_access'
    );

    // High rate of unauthorized access is a violation
    if (dataAccessLogs.length > 0) {
      const unauthorizedRate = unauthorizedAccess.length / dataAccessLogs.length;
      
      if (unauthorizedRate > 0.1) { // More than 10% unauthorized
        violations.push({
          violationId: 'ACCESS-001-001',
          ruleId: 'ACCESS-001',
          severity: 'high',
          description: `High rate of unauthorized access attempts: ${(unauthorizedRate * 100).toFixed(1)}%`,
          affectedResource: 'access_control_system',
          detectedAt: new Date().toISOString(),
          remediation: 'Review and strengthen access control policies',
        });
      }
    }

    const score = violations.length === 0 ? 100 : 60;

    return {
      ruleId: 'ACCESS-001',
      passed: violations.length === 0,
      score,
      violations,
      recommendations: violations.length > 0
        ? ['Review user permissions', 'Implement stricter access controls']
        : [],
    };
  }

  private async checkAuditLogRetention(
    context: ComplianceCheckContext
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    
    // Check if audit logs have proper retention settings
    const logsWithoutRetention = context.auditLogs.filter(log => 
      !log.expires_at && !log.ttl
    );

    if (logsWithoutRetention.length > 0) {
      violations.push({
        violationId: 'RETENTION-001-001',
        ruleId: 'RETENTION-001',
        severity: 'medium',
        description: `${logsWithoutRetention.length} audit logs without retention policy`,
        affectedResource: 'audit_log_system',
        detectedAt: new Date().toISOString(),
        remediation: 'Set retention policy for all audit logs',
      });
    }

    const score = context.auditLogs.length > 0
      ? ((context.auditLogs.length - logsWithoutRetention.length) / context.auditLogs.length) * 100
      : 100;

    return {
      ruleId: 'RETENTION-001',
      passed: violations.length === 0,
      score,
      violations,
      recommendations: violations.length > 0
        ? ['Implement automatic retention policy for all audit logs']
        : [],
    };
  }

  private async checkUserModificationTracking(
    context: ComplianceCheckContext
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    
    // Check if user modifications are tracked
    const modificationActions = ['task-feedback', 'task-edit', 'task-approval', 'task-rejection'];
    const modificationLogs = context.auditLogs.filter(log =>
      modificationActions.includes(log.action)
    );

    // Check if modifications have proper context
    const logsWithoutContext = modificationLogs.filter(log =>
      !log.business_context || !log.business_context.modification_details
    );

    if (logsWithoutContext.length > 0) {
      violations.push({
        violationId: 'AUDIT-003-001',
        ruleId: 'AUDIT-003',
        severity: 'low',
        description: `${logsWithoutContext.length} modification logs without proper context`,
        affectedResource: 'audit_log_system',
        detectedAt: new Date().toISOString(),
        remediation: 'Include modification details in all user modification audit logs',
      });
    }

    const score = modificationLogs.length > 0
      ? ((modificationLogs.length - logsWithoutContext.length) / modificationLogs.length) * 100
      : 100;

    return {
      ruleId: 'AUDIT-003',
      passed: violations.length === 0,
      score,
      violations,
      recommendations: violations.length > 0
        ? ['Enhance modification tracking with detailed context']
        : [],
    };
  }

  // Helper methods

  private async fetchAuditLogs(startDate: string, endDate: string): Promise<AuditLog[]> {
    const result = await this.auditLogRepository.getRecent(10000);
    
    // Filter by date range
    return result.items.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= new Date(startDate) && logDate <= new Date(endDate);
    });
  }

  private mapSeverityToPriority(severity: string): 'low' | 'medium' | 'high' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      default:
        return 'low';
    }
  }
}
