/**
 * Audit and Compliance Integration Example
 * 
 * This example demonstrates how to use the audit and compliance services together
 * to implement comprehensive audit logging, compliance verification, and data retention.
 * 
 * Requirements covered:
 * - 8.1: Record user identity, timestamps, task content
 * - 8.2: Record analysis process, knowledge sources, generated results
 * - 8.3: Record user feedback and modifications
 * - 8.4: Record error details and recovery processes
 * - 9.4: Record security events for unauthorized access
 */

import { WorkTaskAuditService } from '../services/work-task-audit-service';
import { ComplianceVerificationService } from '../services/compliance-verification-service';
import { DataRetentionPolicyService } from '../services/data-retention-policy-service';
import { AuditLogRepository } from '../repositories/audit-log-repository';
import { Logger } from '../lambda/utils/logger';

const logger = new Logger('AuditComplianceExample');

/**
 * Example 1: Complete Work Task Lifecycle Auditing
 */
export async function exampleWorkTaskLifecycleAudit() {
  logger.info('=== Example 1: Work Task Lifecycle Auditing ===');

  // Initialize services
  const auditLogRepository = new AuditLogRepository({
    tableName: 'audit-logs',
    region: 'us-east-1',
  });

  const auditService = new WorkTaskAuditService(auditLogRepository);

  // 1. Audit task submission
  const submissionAudit = await auditService.auditTaskSubmission({
    requestId: 'req-001',
    userId: 'user-123',
    teamId: 'team-456',
    taskId: 'task-789',
    taskContent: {
      title: 'Implement new feature',
      description: 'Add user authentication',
      priority: 'high',
      category: 'development',
    },
    sessionId: 'session-001',
    userRole: 'developer',
    performanceMetrics: {
      execution_time_ms: 150,
      api_calls_made: 2,
    },
  });

  logger.info('Task submission audited', { auditId: submissionAudit.request_id });

  // 2. Audit task analysis
  const analysisAudit = await auditService.auditTaskAnalysis({
    requestId: 'req-002',
    userId: 'user-123',
    teamId: 'team-456',
    taskId: 'task-789',
    analysisDetails: {
      keyPointsCount: 5,
      workgroupsIdentified: 3,
      todosGenerated: 10,
      knowledgeSourcesUsed: ['kendra', 'confluence', 'jira'],
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
      {
        source_system: 'confluence',
        source_id: 'page-456',
        data_classification: 'internal',
        access_level_required: 'user',
        pii_detected: false,
        sensitive_data_types: [],
      },
    ],
    performanceMetrics: {
      execution_time_ms: 5000,
      api_calls_made: 15,
      tokens_consumed: 2500,
    },
    sessionId: 'session-001',
  });

  logger.info('Task analysis audited', { auditId: analysisAudit.request_id });

  // 3. Audit user feedback
  const feedbackAudit = await auditService.auditUserModification({
    requestId: 'req-003',
    userId: 'user-123',
    teamId: 'team-456',
    taskId: 'task-789',
    modificationType: 'feedback',
    modificationDetails: {
      field: 'analysis_result',
      comment: 'Great analysis! Please add security considerations.',
    },
    sessionId: 'session-001',
  });

  logger.info('User feedback audited', { auditId: feedbackAudit.request_id });

  // 4. Audit todo operations
  const todoAudit = await auditService.auditTodoOperation({
    requestId: 'req-004',
    userId: 'user-123',
    teamId: 'team-456',
    taskId: 'task-789',
    todoId: 'todo-001',
    operation: 'complete',
    todoDetails: {
      title: 'Implement authentication',
      status: 'completed',
      priority: 'high',
    },
    sessionId: 'session-001',
  });

  logger.info('Todo operation audited', { auditId: todoAudit.request_id });

  // 5. Audit deliverable submission
  const deliverableAudit = await auditService.auditDeliverableOperation({
    requestId: 'req-005',
    userId: 'user-123',
    teamId: 'team-456',
    taskId: 'task-789',
    todoId: 'todo-001',
    deliverableId: 'deliv-001',
    operation: 'submit',
    deliverableDetails: {
      fileName: 'auth-implementation.zip',
      fileType: 'application/zip',
      fileSize: 1024000,
      validationResult: {
        status: 'passed',
        qualityScore: 92,
        issues: ['Minor code style issues'],
      },
    },
    sessionId: 'session-001',
  });

  logger.info('Deliverable submission audited', { auditId: deliverableAudit.request_id });

  return {
    submissionAudit,
    analysisAudit,
    feedbackAudit,
    todoAudit,
    deliverableAudit,
  };
}

/**
 * Example 2: Security Event Auditing
 */
export async function exampleSecurityEventAuditing() {
  logger.info('=== Example 2: Security Event Auditing ===');

  const auditLogRepository = new AuditLogRepository({
    tableName: 'audit-logs',
    region: 'us-east-1',
  });

  const auditService = new WorkTaskAuditService(auditLogRepository);

  // 1. Audit unauthorized access attempt
  const unauthorizedAccessAudit = await auditService.auditSecurityEvent({
    requestId: 'req-sec-001',
    userId: 'user-456',
    teamId: 'team-789',
    taskId: 'task-sensitive',
    securityEvent: {
      event_type: 'unauthorized_access',
      severity: 'high',
      description: 'User attempted to access task without proper permissions',
      affected_resource: 'task-sensitive',
      detection_method: 'access_control',
      remediation_status: 'blocked',
    },
    sessionId: 'session-002',
  });

  logger.info('Unauthorized access audited', { auditId: unauthorizedAccessAudit.request_id });

  // 2. Audit data access
  const dataAccessAudit = await auditService.auditDataAccess({
    requestId: 'req-sec-002',
    userId: 'user-123',
    teamId: 'team-456',
    taskId: 'task-789',
    accessDetails: {
      resourceType: 'knowledge_base',
      resourceId: 'kb-sensitive',
      accessType: 'read',
      accessGranted: false,
      denialReason: 'Insufficient permissions - requires admin role',
    },
    dataSources: [],
    sessionId: 'session-001',
  });

  logger.info('Data access audited', { auditId: dataAccessAudit.request_id });

  // 3. Get security events for team
  const securityEvents = await auditService.getTeamSecurityEvents(
    'team-456',
    'high',
    '2025-01-01T00:00:00.000Z',
    '2025-12-31T23:59:59.999Z'
  );

  logger.info('Retrieved security events', { count: securityEvents.length });

  return {
    unauthorizedAccessAudit,
    dataAccessAudit,
    securityEvents,
  };
}

/**
 * Example 3: Compliance Verification
 */
export async function exampleComplianceVerification() {
  logger.info('=== Example 3: Compliance Verification ===');

  const auditLogRepository = new AuditLogRepository({
    tableName: 'audit-logs',
    region: 'us-east-1',
  });

  const complianceService = new ComplianceVerificationService(auditLogRepository);

  // 1. Run all compliance checks
  const checkResults = await complianceService.runComplianceChecks(
    '2025-01-01T00:00:00.000Z',
    '2025-12-31T23:59:59.999Z'
  );

  logger.info('Compliance checks completed', { 
    totalChecks: checkResults.length,
    passed: checkResults.filter(r => r.passed).length,
    failed: checkResults.filter(r => !r.passed).length,
  });

  // 2. Generate compliance report
  const complianceReport = await complianceService.generateComplianceReport(
    '2025-01-01T00:00:00.000Z',
    '2025-12-31T23:59:59.999Z',
    'admin-user'
  );

  logger.info('Compliance report generated', {
    reportId: complianceReport.report_id,
    averageScore: complianceReport.summary.average_compliance_score,
    violations: complianceReport.summary.policy_violations,
  });

  // 3. Verify specific task compliance
  const taskCompliance = await complianceService.verifyTaskCompliance('task-789');

  logger.info('Task compliance verified', {
    taskId: 'task-789',
    compliant: taskCompliance.compliant,
    score: taskCompliance.score,
    violations: taskCompliance.violations.length,
  });

  return {
    checkResults,
    complianceReport,
    taskCompliance,
  };
}

/**
 * Example 4: Data Retention Management
 */
export async function exampleDataRetentionManagement() {
  logger.info('=== Example 4: Data Retention Management ===');

  const auditLogRepository = new AuditLogRepository({
    tableName: 'audit-logs',
    region: 'us-east-1',
  });

  const retentionService = new DataRetentionPolicyService(auditLogRepository);

  // 1. Get all retention policies
  const allPolicies = retentionService.getAllPolicies();
  logger.info('Retention policies', { count: allPolicies.length });

  allPolicies.forEach(policy => {
    logger.info('Policy details', {
      policyId: policy.policyId,
      dataType: policy.dataType,
      retentionDays: policy.retentionPeriodDays,
      archiveBeforeDelete: policy.archiveBeforeDelete,
    });
  });

  // 2. Check retention status for a record
  const retentionStatus = retentionService.getRetentionStatus(
    '2025-01-01T00:00:00.000Z',
    'audit_log'
  );

  logger.info('Retention status', {
    shouldRetain: retentionStatus.shouldRetain,
    daysUntilExpiry: retentionStatus.daysUntilExpiry,
    expiryDate: retentionStatus.expiryDate,
  });

  // 3. Execute retention policy
  const executionResult = await retentionService.executeAuditLogRetention('RETENTION-AUDIT-001');

  logger.info('Retention policy executed', {
    policyId: executionResult.policyId,
    recordsEvaluated: executionResult.recordsEvaluated,
    recordsArchived: executionResult.recordsArchived,
    recordsDeleted: executionResult.recordsDeleted,
    errors: executionResult.errors,
  });

  // 4. Generate retention report
  const retentionReport = await retentionService.generateRetentionReport();

  logger.info('Retention report generated', {
    totalPolicies: retentionReport.totalPolicies,
    complianceStatus: retentionReport.complianceStatus,
    upcomingExpirations: retentionReport.upcomingExpirations.length,
  });

  return {
    allPolicies,
    retentionStatus,
    executionResult,
    retentionReport,
  };
}

/**
 * Example 5: Complete Audit Trail Retrieval
 */
export async function exampleAuditTrailRetrieval() {
  logger.info('=== Example 5: Audit Trail Retrieval ===');

  const auditLogRepository = new AuditLogRepository({
    tableName: 'audit-logs',
    region: 'us-east-1',
  });

  const auditService = new WorkTaskAuditService(auditLogRepository);

  // 1. Get audit trail for a specific task
  const taskAuditTrail = await auditService.getTaskAuditTrail('task-789', 50);

  logger.info('Task audit trail retrieved', {
    taskId: 'task-789',
    totalEvents: taskAuditTrail.length,
  });

  // Log each audit event
  taskAuditTrail.forEach((audit, index) => {
    logger.info(`Audit event ${index + 1}`, {
      timestamp: audit.timestamp,
      action: audit.action,
      userId: audit.user_id,
      status: audit.result_summary.status,
    });
  });

  // 2. Get audit trail for a specific user
  const userAuditTrail = await auditService.getUserAuditTrail(
    'user-123',
    '2025-01-01T00:00:00.000Z',
    '2025-12-31T23:59:59.999Z',
    100
  );

  logger.info('User audit trail retrieved', {
    userId: 'user-123',
    totalEvents: userAuditTrail.length,
  });

  return {
    taskAuditTrail,
    userAuditTrail,
  };
}

/**
 * Example 6: Error Auditing and Recovery
 */
export async function exampleErrorAuditing() {
  logger.info('=== Example 6: Error Auditing and Recovery ===');

  const auditLogRepository = new AuditLogRepository({
    tableName: 'audit-logs',
    region: 'us-east-1',
  });

  const auditService = new WorkTaskAuditService(auditLogRepository);

  // 1. Audit system error with recovery
  const errorAudit = await auditService.auditError({
    requestId: 'req-err-001',
    userId: 'system',
    teamId: 'team-456',
    taskId: 'task-789',
    errorDetails: {
      errorType: 'DatabaseConnectionError',
      errorMessage: 'Failed to connect to DynamoDB',
      errorStack: 'Error: Connection timeout at ...',
      recoveryAction: 'Retry with exponential backoff',
      recoveryStatus: 'successful',
    },
    sessionId: 'session-001',
  });

  logger.info('Error audited', {
    auditId: errorAudit.request_id,
    errorType: 'DatabaseConnectionError',
    recoveryStatus: 'successful',
  });

  // 2. Audit error without recovery
  const criticalErrorAudit = await auditService.auditError({
    requestId: 'req-err-002',
    userId: 'system',
    errorDetails: {
      errorType: 'CriticalSystemFailure',
      errorMessage: 'System encountered unrecoverable error',
      errorStack: 'Error: Critical failure at ...',
      recoveryAction: 'Manual intervention required',
      recoveryStatus: 'failed',
    },
  });

  logger.info('Critical error audited', {
    auditId: criticalErrorAudit.request_id,
    errorType: 'CriticalSystemFailure',
    recoveryStatus: 'failed',
  });

  return {
    errorAudit,
    criticalErrorAudit,
  };
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
  try {
    logger.info('Starting Audit and Compliance Integration Examples');

    await exampleWorkTaskLifecycleAudit();
    await exampleSecurityEventAuditing();
    await exampleComplianceVerification();
    await exampleDataRetentionManagement();
    await exampleAuditTrailRetrieval();
    await exampleErrorAuditing();

    logger.info('All examples completed successfully');
  } catch (error) {
    logger.error('Example execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// Export all examples
export default {
  exampleWorkTaskLifecycleAudit,
  exampleSecurityEventAuditing,
  exampleComplianceVerification,
  exampleDataRetentionManagement,
  exampleAuditTrailRetrieval,
  exampleErrorAuditing,
  runAllExamples,
};
