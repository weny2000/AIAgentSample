import { 
  AuditLogRepository, 
  RepositoryFactory 
} from '../repositories';
import { 
  CreateAuditLogInput, 
  AuditLog, 
  SecurityEvent, 
  ComplianceReport,
  SecurityAlertConfig,
  AuditLogStatistics,
  QueryAuditLogParams,
  QueryAuditLogResponse
} from '../models';
import { Logger } from '../lambda/utils/logger';

export interface AuditServiceConfig {
  repositories: RepositoryFactory;
  alertConfigs?: SecurityAlertConfig[];
  retentionPolicyDays?: number;
}

export class AuditService {
  private auditLogRepository: AuditLogRepository;
  private alertConfigs: SecurityAlertConfig[];
  private retentionPolicyDays: number;
  private logger: Logger;

  constructor(config: AuditServiceConfig) {
    this.auditLogRepository = config.repositories.auditLogRepository;
    this.alertConfigs = config.alertConfigs || [];
    this.retentionPolicyDays = config.retentionPolicyDays || 2555; // 7 years default
    this.logger = new Logger({ correlationId: 'audit-service', operation: 'audit-logging' });
  }

  /**
   * Log a comprehensive audit entry with automatic categorization and security analysis
   */
  async logAction(input: CreateAuditLogInput): Promise<AuditLog> {
    try {
      // Enhance input with automatic categorization
      const enhancedInput = await this.enhanceAuditInput(input);
      
      // Create the audit log entry
      const auditLog = await this.auditLogRepository.create(enhancedInput);
      
      // Check for security alerts
      if (enhancedInput.security_event) {
        await this.processSecurityEvent(auditLog);
      }
      
      // Check for policy violations
      if (enhancedInput.policy_violations && enhancedInput.policy_violations.length > 0) {
        await this.processPolicyViolations(auditLog);
      }
      
      this.logger.info('Audit log entry created', {
        request_id: auditLog.request_id,
        user_id: auditLog.user_id,
        action: auditLog.action,
        compliance_score: auditLog.compliance_score,
      });
      
      return auditLog;
    } catch (error) {
      this.logger.error('Failed to create audit log entry', error as Error);
      throw error;
    }
  }

  /**
   * Log a security event with automatic risk assessment
   */
  async logSecurityEvent(
    baseInput: CreateAuditLogInput,
    securityEvent: SecurityEvent
  ): Promise<AuditLog> {
    const enhancedInput: CreateAuditLogInput = {
      ...baseInput,
      security_event: securityEvent,
      action_category: 'system_operation',
      action_subcategory: 'security_event',
      compliance_flags: ['security_event', `severity_${securityEvent.severity}`],
    };

    return this.logAction(enhancedInput);
  }

  /**
   * Log a policy violation with context
   */
  async logPolicyViolation(
    baseInput: CreateAuditLogInput,
    violatedPolicies: string[],
    violationDetails: string
  ): Promise<AuditLog> {
    const enhancedInput: CreateAuditLogInput = {
      ...baseInput,
      policy_violations: violatedPolicies,
      compliance_flags: ['policy_violation'],
      result_summary: `${baseInput.result_summary}. Policy violations: ${violationDetails}`,
      compliance_score: Math.min(baseInput.compliance_score, 40), // Cap score for violations
    };

    return this.logAction(enhancedInput);
  }

  /**
   * Log data access with PII detection
   */
  async logDataAccess(
    baseInput: CreateAuditLogInput,
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted',
    piiDetected: boolean = false
  ): Promise<AuditLog> {
    const securityEvent: SecurityEvent | undefined = dataClassification === 'restricted' || piiDetected ? {
      event_type: 'data_access',
      severity: dataClassification === 'restricted' ? 'high' : 'medium',
      resource_accessed: baseInput.business_context?.artifact_type || 'unknown',
      risk_score: this.calculateDataAccessRiskScore(dataClassification, piiDetected),
    } : undefined;

    const enhancedInput: CreateAuditLogInput = {
      ...baseInput,
      action_category: 'data_access',
      security_event: securityEvent,
      compliance_flags: piiDetected ? ['pii_access'] : [],
      data_sources: baseInput.data_sources?.map(ds => ({
        ...ds,
        data_classification: dataClassification,
        pii_detected: piiDetected,
      })) || [],
    };

    return this.logAction(enhancedInput);
  }

  /**
   * Query audit logs with enhanced filtering
   */
  async queryAuditLogs(params: QueryAuditLogParams): Promise<QueryAuditLogResponse> {
    try {
      let response: QueryAuditLogResponse;

      if (params.user_id) {
        response = await this.auditLogRepository.getByUserId(params);
      } else if (params.team_id) {
        response = await this.auditLogRepository.getByTeam(
          params.team_id,
          params.start_timestamp,
          params.end_timestamp,
          params.limit,
          params.last_evaluated_key
        );
      } else if (params.action) {
        response = await this.auditLogRepository.getByAction(
          params.action,
          params.start_timestamp,
          params.end_timestamp,
          params.limit,
          params.last_evaluated_key
        );
      } else {
        response = await this.auditLogRepository.getRecent(
          params.limit || 50,
          params.last_evaluated_key
        );
      }

      // Apply additional filters
      if (params.compliance_score_min || params.compliance_score_max || 
          params.security_event_severity || params.has_policy_violations) {
        response.items = this.applyAdditionalFilters(response.items, params);
      }

      // Calculate aggregations if requested
      response.aggregations = this.calculateAggregations(response.items);

      return response;
    } catch (error) {
      this.logger.error('Failed to query audit logs', error as Error);
      throw error;
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(
    startDate: string,
    endDate: string,
    generatedBy: string,
    includeRecommendations: boolean = true
  ): Promise<ComplianceReport> {
    try {
      this.logger.info('Generating compliance report', {
        start_date: startDate,
        end_date: endDate,
        generated_by: generatedBy,
      });

      const report = await this.auditLogRepository.generateComplianceReport(
        startDate,
        endDate,
        generatedBy
      );

      if (includeRecommendations) {
        // Enhanced recommendations based on patterns
        const enhancedRecommendations = await this.generateEnhancedRecommendations(
          startDate,
          endDate
        );
        report.recommendations.push(...enhancedRecommendations);
      }

      this.logger.info('Compliance report generated', {
        report_id: report.report_id,
        total_actions: report.summary.total_actions,
        avg_compliance_score: report.summary.average_compliance_score,
      });

      return report;
    } catch (error) {
      this.logger.error('Failed to generate compliance report', error as Error);
      throw error;
    }
  }

  /**
   * Get security events with risk analysis
   */
  async getSecurityEvents(
    severity?: 'low' | 'medium' | 'high' | 'critical',
    startTimestamp?: string,
    endTimestamp?: string,
    limit?: number
  ): Promise<AuditLog[]> {
    try {
      const events = await this.auditLogRepository.getSecurityEvents(
        severity,
        startTimestamp,
        endTimestamp,
        limit
      );

      // Sort by risk score if available
      return events.sort((a, b) => {
        const riskA = a.security_event?.risk_score || 0;
        const riskB = b.security_event?.risk_score || 0;
        return riskB - riskA;
      });
    } catch (error) {
      this.logger.error('Failed to get security events', error as Error);
      throw error;
    }
  }

  /**
   * Get comprehensive audit statistics
   */
  async getAuditStatistics(
    startTimestamp?: string,
    endTimestamp?: string
  ): Promise<AuditLogStatistics> {
    try {
      return await this.auditLogRepository.getStatistics(startTimestamp, endTimestamp);
    } catch (error) {
      this.logger.error('Failed to get audit statistics', error as Error);
      throw error;
    }
  }

  /**
   * Configure security alerts
   */
  async configureSecurityAlert(config: SecurityAlertConfig): Promise<void> {
    // In a full implementation, this would store the config in a database
    this.alertConfigs.push(config);
    this.logger.info('Security alert configured', {
      alert_id: config.alert_id,
      name: config.name,
      enabled: config.enabled,
    });
  }

  /**
   * Process retention policy and cleanup expired records
   */
  async processRetentionPolicy(): Promise<{ deletedCount: number; errors: number }> {
    try {
      this.logger.info('Processing retention policy', {
        retention_days: this.retentionPolicyDays,
      });

      // DynamoDB TTL handles automatic deletion, but we can query for expired records
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionPolicyDays);
      
      // This is a placeholder - in practice, TTL handles deletion automatically
      return { deletedCount: 0, errors: 0 };
    } catch (error) {
      this.logger.error('Failed to process retention policy', error as Error);
      throw error;
    }
  }

  // Private helper methods
  private async enhanceAuditInput(input: CreateAuditLogInput): Promise<CreateAuditLogInput> {
    // Auto-categorize action if not provided
    if (!input.action_category) {
      input.action_category = this.categorizeAction(input.action);
    }

    // Extract data sources if not provided
    if (!input.data_sources && input.references) {
      input.data_sources = input.references.map(ref => ({
        source_system: ref.source_type,
        source_id: ref.source_id,
        data_classification: this.classifyDataSource(ref.source_type),
        access_level_required: 'user',
        pii_detected: this.detectPII(ref.snippet),
        sensitive_data_types: this.identifySensitiveDataTypes(ref.snippet),
      }));
    }

    // Set default performance metrics if not provided
    if (!input.performance_metrics) {
      input.performance_metrics = {
        execution_time_ms: 0,
        api_calls_made: input.references?.length || 0,
        error_count: 0,
      };
    }

    // Set retention based on data classification
    if (!input.retention_days && input.data_sources) {
      const hasRestrictedData = input.data_sources.some(ds => ds.data_classification === 'restricted');
      input.retention_days = hasRestrictedData ? 3650 : this.retentionPolicyDays; // 10 years for restricted data
    }

    return input;
  }

  private async processSecurityEvent(auditLog: AuditLog): Promise<void> {
    if (!auditLog.security_event) return;

    // Check against configured alerts
    for (const alertConfig of this.alertConfigs) {
      if (!alertConfig.enabled) continue;

      const shouldTrigger = this.shouldTriggerAlert(auditLog.security_event, alertConfig);
      if (shouldTrigger) {
        await this.triggerSecurityAlert(auditLog, alertConfig);
      }
    }
  }

  private async processPolicyViolations(auditLog: AuditLog): Promise<void> {
    if (!auditLog.policy_violations || auditLog.policy_violations.length === 0) return;

    this.logger.warn('Policy violations detected', {
      request_id: auditLog.request_id,
      user_id: auditLog.user_id,
      violations: auditLog.policy_violations,
    });

    // In a full implementation, this would trigger notifications or create incidents
  }

  private shouldTriggerAlert(securityEvent: SecurityEvent, alertConfig: SecurityAlertConfig): boolean {
    // Check event type
    if (!alertConfig.triggers.event_types.includes(securityEvent.event_type)) {
      return false;
    }

    // Check severity threshold
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const eventSeverityIndex = severityLevels.indexOf(securityEvent.severity);
    const thresholdIndex = severityLevels.indexOf(alertConfig.triggers.severity_threshold);
    
    return eventSeverityIndex >= thresholdIndex;
  }

  private async triggerSecurityAlert(auditLog: AuditLog, alertConfig: SecurityAlertConfig): Promise<void> {
    this.logger.warn('Security alert triggered', {
      alert_id: alertConfig.alert_id,
      alert_name: alertConfig.name,
      request_id: auditLog.request_id,
      user_id: auditLog.user_id,
      event_type: auditLog.security_event?.event_type,
      severity: auditLog.security_event?.severity,
    });

    // In a full implementation, this would send notifications, create incidents, etc.
  }

  private categorizeAction(action: string): CreateAuditLogInput['action_category'] {
    if (action.includes('query') || action.includes('search')) return 'query';
    if (action.includes('check') || action.includes('validate')) return 'artifact_check';
    if (action.includes('policy') || action.includes('rule')) return 'policy_update';
    if (action.includes('config') || action.includes('setting')) return 'configuration_change';
    if (action.includes('access') || action.includes('read')) return 'data_access';
    return 'system_operation';
  }

  private classifyDataSource(sourceType: string): 'public' | 'internal' | 'confidential' | 'restricted' {
    switch (sourceType) {
      case 'confluence':
      case 'jira':
        return 'internal';
      case 'slack':
      case 'teams':
        return 'confidential';
      case 'git':
        return 'internal';
      case 's3':
        return 'confidential';
      case 'internal-policy':
        return 'restricted';
      default:
        return 'internal';
    }
  }

  private detectPII(text: string): boolean {
    // Simple PII detection patterns
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
      /\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/, // Phone number
    ];

    return piiPatterns.some(pattern => pattern.test(text));
  }

  private identifySensitiveDataTypes(text: string): string[] {
    const types: string[] = [];
    
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) types.push('ssn');
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text)) types.push('email');
    if (/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/.test(text)) types.push('credit_card');
    if (/\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/.test(text)) types.push('phone');
    
    return types;
  }

  private calculateDataAccessRiskScore(
    classification: 'public' | 'internal' | 'confidential' | 'restricted',
    piiDetected: boolean
  ): number {
    let baseScore = 0;
    
    switch (classification) {
      case 'public': baseScore = 10; break;
      case 'internal': baseScore = 30; break;
      case 'confidential': baseScore = 60; break;
      case 'restricted': baseScore = 90; break;
    }
    
    if (piiDetected) baseScore += 20;
    
    return Math.min(baseScore, 100);
  }

  private applyAdditionalFilters(items: AuditLog[], params: QueryAuditLogParams): AuditLog[] {
    return items.filter(item => {
      if (params.compliance_score_min && item.compliance_score < params.compliance_score_min) {
        return false;
      }
      if (params.compliance_score_max && item.compliance_score > params.compliance_score_max) {
        return false;
      }
      if (params.security_event_severity && 
          item.security_event?.severity !== params.security_event_severity) {
        return false;
      }
      if (params.has_policy_violations && 
          (!item.policy_violations || item.policy_violations.length === 0)) {
        return false;
      }
      if (params.data_classification && 
          !item.data_sources?.some(ds => ds.data_classification === params.data_classification)) {
        return false;
      }
      return true;
    });
  }

  private calculateAggregations(items: AuditLog[]): QueryAuditLogResponse['aggregations'] {
    const uniqueUsers = new Set(items.map(item => item.user_id)).size;
    const uniqueTeams = new Set(items.map(item => item.team_id).filter(Boolean)).size;
    const totalComplianceScore = items.reduce((sum, item) => sum + item.compliance_score, 0);
    const averageComplianceScore = items.length > 0 ? totalComplianceScore / items.length : 0;
    
    const policyViolationCount = items.filter(item => 
      item.policy_violations && item.policy_violations.length > 0
    ).length;
    
    const securityEventCount = items.filter(item => item.security_event).length;
    
    const actionDistribution: Record<string, number> = {};
    items.forEach(item => {
      actionDistribution[item.action] = (actionDistribution[item.action] || 0) + 1;
    });

    let excellent = 0, good = 0, fair = 0, poor = 0;
    items.forEach(item => {
      const score = item.compliance_score;
      if (score >= 90) excellent++;
      else if (score >= 70) good++;
      else if (score >= 50) fair++;
      else poor++;
    });

    return {
      total_entries: items.length,
      unique_users: uniqueUsers,
      unique_teams: uniqueTeams,
      average_compliance_score: averageComplianceScore,
      policy_violation_count: policyViolationCount,
      security_event_count: securityEventCount,
      action_distribution: actionDistribution,
      compliance_score_distribution: {
        excellent,
        good,
        fair,
        poor,
      },
    };
  }

  private async generateEnhancedRecommendations(
    startDate: string,
    endDate: string
  ): Promise<ComplianceReport['recommendations']> {
    const recommendations: ComplianceReport['recommendations'] = [];
    
    // Get recent security events for analysis
    const securityEvents = await this.getSecurityEvents(undefined, startDate, endDate);
    const highRiskEvents = securityEvents.filter(log => 
      log.security_event?.severity === 'high' || log.security_event?.severity === 'critical'
    );

    // Analyze patterns and generate specific recommendations
    if (highRiskEvents.length > 0) {
      const eventTypes = highRiskEvents.map(log => log.security_event?.event_type);
      const mostCommonEventType = this.getMostCommon(eventTypes);
      
      recommendations.push({
        priority: 'high',
        category: 'Security',
        description: `High frequency of ${mostCommonEventType} security events detected. Consider implementing additional controls.`,
        estimated_impact: 'Reduced security incidents and improved threat detection',
      });
    }

    return recommendations;
  }

  private getMostCommon<T>(array: (T | undefined)[]): T | undefined {
    const counts: Record<string, number> = {};
    let maxCount = 0;
    let mostCommon: T | undefined;

    array.forEach(item => {
      if (item !== undefined) {
        const key = String(item);
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > maxCount) {
          maxCount = counts[key];
          mostCommon = item;
        }
      }
    });

    return mostCommon;
  }
}