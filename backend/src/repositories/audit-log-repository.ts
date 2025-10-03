import { BaseRepository, RepositoryConfig } from './base-repository';
import { 
  AuditLog, 
  AuditLogItem, 
  CreateAuditLogInput, 
  QueryAuditLogParams,
  QueryAuditLogResponse,
  ComplianceReport,
  SecurityAlertConfig,
  AuditLogStatistics,
  SecurityEvent,
  DataSourceAttribution,
  PerformanceMetrics
} from '../models';

export class AuditLogRepository extends BaseRepository<AuditLogItem> {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  /**
   * Validate required fields for input
   */
  private validateRequiredFields(input: any, fields: string[]): void {
    for (const field of fields) {
      if (!input[field]) {
        throw new Error(`Required field '${field}' is missing`);
      }
    }
  }

  /**
   * Get TTL timestamp for DynamoDB
   */
  private getTTL(days: number): number {
    const now = new Date();
    now.setDate(now.getDate() + days);
    return Math.floor(now.getTime() / 1000);
  }

  /**
   * Create a new audit log entry with comprehensive tracking
   */
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    this.validateRequiredFields(input, [
      'request_id', 
      'user_id', 
      'persona', 
      'action', 
      'references',
      'result_summary',
      'compliance_score'
    ]);

    const timestamp = this.getCurrentTimestamp();
    const retentionDays = input.retention_days || 2555; // Default 7 years for compliance
    
    // Set default values for enhanced fields
    const actionCategory = input.action_category || this.categorizeAction(input.action);
    const dataSourcesWithDefaults = input.data_sources || this.extractDataSources(input.references);
    const performanceMetrics = this.buildPerformanceMetrics(input.performance_metrics);
    const requestContext = input.request_context || {};
    
    const item: AuditLogItem = {
      pk: input.request_id,
      sk: timestamp,
      entity_type: 'audit_log',
      gsi1pk: input.user_id, // For querying by user
      gsi1sk: timestamp,     // For sorting by timestamp
      gsi2pk: input.action,  // For querying by action
      gsi2sk: timestamp,     // For sorting by timestamp
      gsi3pk: input.team_id || 'unknown', // For querying by team
      gsi3sk: timestamp,     // For sorting by timestamp
      
      // Core fields
      request_id: input.request_id,
      timestamp,
      user_id: input.user_id,
      persona: input.persona,
      action: input.action,
      references: input.references,
      result_summary: input.result_summary,
      compliance_score: input.compliance_score,
      
      // Enhanced fields
      session_id: input.session_id,
      team_id: input.team_id,
      department: input.department,
      user_role: input.user_role,
      action_category: actionCategory,
      action_subcategory: input.action_subcategory,
      security_event: input.security_event,
      data_sources: dataSourcesWithDefaults,
      compliance_flags: input.compliance_flags || [],
      policy_violations: input.policy_violations || [],
      performance_metrics: performanceMetrics,
      error_details: input.error_details,
      request_context: requestContext,
      business_context: input.business_context,
      created_at: timestamp,
      expires_at: input.retention_days ? this.addDays(timestamp, input.retention_days) : undefined,
      
      // Set TTL for automatic deletion
      ttl: this.getTTL(retentionDays),
    };

    await this.putItem(item);

    // Check for security alerts
    if (input.security_event) {
      await this.checkSecurityAlerts(item);
    }

    // Return the created item without DynamoDB metadata
    const { pk, sk, entity_type, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, ttl, ...auditLog } = item;
    return auditLog as AuditLog;
  }

  /**
   * Get audit log entries by request ID
   */
  async getByRequestId(requestId: string, limit?: number): Promise<AuditLog[]> {
    const result = await this.queryItems(
      'pk = :request_id',
      undefined,
      { ':request_id': requestId },
      undefined,
      undefined,
      limit,
      undefined,
      false // Sort by timestamp descending (newest first)
    );

    return result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });
  }

  /**
   * Get audit log entries by user ID
   */
  async getByUserId(params: QueryAuditLogParams): Promise<QueryAuditLogResponse> {
    if (!params.user_id) {
      throw new Error('user_id is required for this query');
    }

    let keyConditionExpression = 'gsi1pk = :user_id';
    const expressionAttributeValues: Record<string, any> = {
      ':user_id': params.user_id,
    };

    // Add timestamp range if provided
    if (params.start_timestamp && params.end_timestamp) {
      keyConditionExpression += ' AND gsi1sk BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeValues[':start_timestamp'] = params.start_timestamp;
      expressionAttributeValues[':end_timestamp'] = params.end_timestamp;
    } else if (params.start_timestamp) {
      keyConditionExpression += ' AND gsi1sk >= :start_timestamp';
      expressionAttributeValues[':start_timestamp'] = params.start_timestamp;
    } else if (params.end_timestamp) {
      keyConditionExpression += ' AND gsi1sk <= :end_timestamp';
      expressionAttributeValues[':end_timestamp'] = params.end_timestamp;
    }

    const result = await this.queryItems(
      keyConditionExpression,
      undefined,
      expressionAttributeValues,
      undefined,
      'user-index',
      params.limit,
      params.lastEvaluatedKey,
      false // Sort by timestamp descending (newest first)
    );

    const items = result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });

    return {
      items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
      scannedCount: result.scannedCount,
    };
  }

  /**
   * Get audit log entries by action type
   */
  async getByAction(
    action: string, 
    startTimestamp?: string, 
    endTimestamp?: string,
    limit?: number,
    lastEvaluatedKey?: Record<string, any>
  ): Promise<QueryAuditLogResponse> {
    let keyConditionExpression = '#action = :action';
    const expressionAttributeNames = { '#action': 'action' };
    const expressionAttributeValues: Record<string, any> = {
      ':action': action,
    };

    // Add timestamp range if provided
    if (startTimestamp && endTimestamp) {
      keyConditionExpression += ' AND sk BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    } else if (startTimestamp) {
      keyConditionExpression += ' AND sk >= :start_timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
    } else if (endTimestamp) {
      keyConditionExpression += ' AND sk <= :end_timestamp';
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    }

    const result = await this.queryItems(
      keyConditionExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      undefined,
      'action-index',
      limit,
      lastEvaluatedKey,
      false // Sort by timestamp descending (newest first)
    );

    const items = result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });

    return {
      items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
      scannedCount: result.scannedCount,
    };
  }

  /**
   * Get recent audit log entries across all users
   */
  async getRecent(
    limit: number = 50,
    lastEvaluatedKey?: Record<string, any>
  ): Promise<QueryAuditLogResponse> {
    // Use scan with filter for recent entries (not ideal for large datasets)
    const result = await this.scanItems(
      '#entity_type = :entity_type',
      { '#entity_type': 'entity_type' },
      { ':entity_type': 'audit_log' },
      limit,
      lastEvaluatedKey
    );

    // Sort by timestamp descending
    const sortedItems = result.items.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const items = sortedItems.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });

    return {
      items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
      scannedCount: result.scannedCount,
    };
  }

  /**
   * Get audit log entries by compliance score range
   */
  async getByComplianceScoreRange(
    minScore: number,
    maxScore: number,
    limit?: number
  ): Promise<AuditLog[]> {
    const result = await this.scanItems(
      '#entity_type = :entity_type AND #compliance_score BETWEEN :min_score AND :max_score',
      { 
        '#entity_type': 'entity_type',
        '#compliance_score': 'compliance_score'
      },
      { 
        ':entity_type': 'audit_log',
        ':min_score': minScore,
        ':max_score': maxScore
      },
      undefined,
      limit
    );

    return result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });
  }

  /**
   * Get audit log entries by persona
   */
  async getByPersona(
    persona: string,
    startTimestamp?: string,
    endTimestamp?: string,
    limit?: number
  ): Promise<AuditLog[]> {
    let filterExpression = '#entity_type = :entity_type AND #persona = :persona';
    const expressionAttributeNames: Record<string, string> = { 
      '#entity_type': 'entity_type',
      '#persona': 'persona'
    };
    const expressionAttributeValues: Record<string, any> = {
      ':entity_type': 'audit_log',
      ':persona': persona,
    };

    // Add timestamp range if provided
    if (startTimestamp && endTimestamp) {
      filterExpression += ' AND #timestamp BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    } else if (startTimestamp) {
      filterExpression += ' AND #timestamp >= :start_timestamp';
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
    } else if (endTimestamp) {
      filterExpression += ' AND #timestamp <= :end_timestamp';
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    }

    const result = await this.scanItems(
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      limit
    );

    return result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });
  }

  /**
   * Get comprehensive statistics for audit logs
   */
  async getStatistics(
    startTimestamp?: string,
    endTimestamp?: string
  ): Promise<AuditLogStatistics> {
    let filterExpression = '#entity_type = :entity_type';
    const expressionAttributeNames = { '#entity_type': 'entity_type' };
    const expressionAttributeValues: Record<string, any> = {
      ':entity_type': 'audit_log',
    };

    // Add timestamp range if provided
    if (startTimestamp && endTimestamp) {
      filterExpression += ' AND #timestamp BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    }

    const result = await this.scanItems(
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues
    );

    const totalEntries = result.items.length;
    const totalComplianceScore = result.items.reduce((sum, item) => sum + (item.compliance_score || 0), 0);
    const averageComplianceScore = totalEntries > 0 ? totalComplianceScore / totalEntries : 0;

    // Basic counts
    const actionCounts: Record<string, number> = {};
    const personaCounts: Record<string, number> = {};
    const teamCounts: Record<string, number> = {};
    const securityEventCounts: Record<string, number> = {};
    const policyViolationCounts: Record<string, number> = {};
    const dataSourceUsage: Record<string, number> = {};

    // Compliance score distribution
    let excellent = 0, good = 0, fair = 0, poor = 0;

    result.items.forEach(item => {
      // Basic counts
      actionCounts[item.action] = (actionCounts[item.action] || 0) + 1;
      personaCounts[item.persona] = (personaCounts[item.persona] || 0) + 1;
      if (item.team_id) {
        teamCounts[item.team_id] = (teamCounts[item.team_id] || 0) + 1;
      }

      // Security events
      if (item.security_event) {
        const eventKey = `${item.security_event.event_type}-${item.security_event.severity}`;
        securityEventCounts[eventKey] = (securityEventCounts[eventKey] || 0) + 1;
      }

      // Policy violations
      if (item.policy_violations && item.policy_violations.length > 0) {
        item.policy_violations.forEach(violation => {
          policyViolationCounts[violation] = (policyViolationCounts[violation] || 0) + 1;
        });
      }

      // Data source usage
      if (item.data_sources) {
        item.data_sources.forEach(source => {
          dataSourceUsage[source.source_system] = (dataSourceUsage[source.source_system] || 0) + 1;
        });
      }

      // Compliance score distribution
      const score = item.compliance_score || 0;
      if (score >= 90) excellent++;
      else if (score >= 70) good++;
      else if (score >= 50) fair++;
      else poor++;
    });

    // Generate trend data (simplified for now)
    const trends = await this.generateTrendData(startTimestamp, endTimestamp);

    return {
      totalEntries,
      averageComplianceScore,
      actionCounts,
      personaCounts,
      teamCounts,
      securityEventCounts,
      policyViolationCounts,
      dataSourceUsage,
      complianceScoreDistribution: {
        excellent,
        good,
        fair,
        poor,
      },
      trends,
    };
  }

  /**
   * Get audit logs with security events
   */
  async getSecurityEvents(
    severity?: 'low' | 'medium' | 'high' | 'critical',
    startTimestamp?: string,
    endTimestamp?: string,
    limit?: number
  ): Promise<AuditLog[]> {
    let filterExpression = '#entity_type = :entity_type AND attribute_exists(security_event)';
    const expressionAttributeNames: Record<string, string> = { '#entity_type': 'entity_type' };
    const expressionAttributeValues: Record<string, any> = {
      ':entity_type': 'audit_log',
    };

    if (severity) {
      filterExpression += ' AND security_event.severity = :severity';
      expressionAttributeValues[':severity'] = severity;
    }

    if (startTimestamp && endTimestamp) {
      filterExpression += ' AND #timestamp BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    }

    const result = await this.scanItems(
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      limit
    );

    return result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });
  }

  /**
   * Get audit logs with policy violations
   */
  async getPolicyViolations(
    policyId?: string,
    startTimestamp?: string,
    endTimestamp?: string,
    limit?: number
  ): Promise<AuditLog[]> {
    let filterExpression = '#entity_type = :entity_type AND size(policy_violations) > :zero';
    const expressionAttributeNames: Record<string, string> = { '#entity_type': 'entity_type' };
    const expressionAttributeValues: Record<string, any> = {
      ':entity_type': 'audit_log',
      ':zero': 0,
    };

    if (policyId) {
      filterExpression += ' AND contains(policy_violations, :policy_id)';
      expressionAttributeValues[':policy_id'] = policyId;
    }

    if (startTimestamp && endTimestamp) {
      filterExpression += ' AND #timestamp BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    }

    const result = await this.scanItems(
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      limit
    );

    return result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });
  }

  /**
   * Get audit logs by team
   */
  async getByTeam(
    teamId: string,
    startTimestamp?: string,
    endTimestamp?: string,
    limit?: number,
    lastEvaluatedKey?: Record<string, any>
  ): Promise<QueryAuditLogResponse> {
    let keyConditionExpression = 'gsi3pk = :team_id';
    const expressionAttributeValues: Record<string, any> = {
      ':team_id': teamId,
    };

    if (startTimestamp && endTimestamp) {
      keyConditionExpression += ' AND gsi3sk BETWEEN :start_timestamp AND :end_timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    } else if (startTimestamp) {
      keyConditionExpression += ' AND gsi3sk >= :start_timestamp';
      expressionAttributeValues[':start_timestamp'] = startTimestamp;
    } else if (endTimestamp) {
      keyConditionExpression += ' AND gsi3sk <= :end_timestamp';
      expressionAttributeValues[':end_timestamp'] = endTimestamp;
    }

    const result = await this.queryItems(
      keyConditionExpression,
      undefined,
      expressionAttributeValues,
      undefined,
      'team-index',
      limit,
      lastEvaluatedKey,
      false
    );

    const items = result.items.map(item => {
      const { pk, sk, entity_type, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, ttl, ...auditLog } = item;
      return auditLog as AuditLog;
    });

    return {
      items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
      scannedCount: result.scannedCount,
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: string,
    endDate: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    const stats = await this.getStatistics(startDate, endDate);
    const securityEvents = await this.getSecurityEvents(undefined, startDate, endDate);
    const policyViolations = await this.getPolicyViolations(undefined, startDate, endDate);

    // Generate trend analysis (simplified)
    const trendPeriods = this.generateTrendPeriods(startDate, endDate);
    const trendAnalysis = await Promise.all(
      trendPeriods.map(async period => {
        const periodStats = await this.getStatistics(period.start, period.end);
        return {
          period: period.label,
          score_change: periodStats.averageComplianceScore,
          violation_change: Object.values(periodStats.policyViolationCounts).reduce((sum, count) => sum + count, 0),
        };
      })
    );

    // Top violations analysis
    const topViolations = Object.entries(stats.policyViolationCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([policyId, count]) => ({
        policy_id: policyId,
        policy_name: policyId, // Would be resolved from policy repository
        violation_count: count,
        affected_teams: [], // Would be calculated from violation data
      }));

    // High-risk security events
    const highRiskEvents = securityEvents
      .filter(log => log.security_event?.severity === 'high' || log.security_event?.severity === 'critical')
      .map(log => log.security_event!)
      .slice(0, 20);

    return {
      report_id: `compliance-${Date.now()}`,
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
      report_period: {
        start_date: startDate,
        end_date: endDate,
      },
      summary: {
        total_actions: stats.totalEntries,
        total_users: Object.keys(stats.personaCounts).length,
        total_teams: Object.keys(stats.teamCounts).length,
        average_compliance_score: stats.averageComplianceScore,
        policy_violations: Object.values(stats.policyViolationCounts).reduce((sum, count) => sum + count, 0),
        security_events: Object.values(stats.securityEventCounts).reduce((sum, count) => sum + count, 0),
      },
      compliance_metrics: {
        score_distribution: {
          'excellent (90-100)': stats.complianceScoreDistribution.excellent,
          'good (70-89)': stats.complianceScoreDistribution.good,
          'fair (50-69)': stats.complianceScoreDistribution.fair,
          'poor (0-49)': stats.complianceScoreDistribution.poor,
        },
        trend_analysis: trendAnalysis,
        top_violations: topViolations,
      },
      security_analysis: {
        event_distribution: stats.securityEventCounts,
        high_risk_events: highRiskEvents,
        user_risk_scores: [], // Would be calculated from user activity patterns
      },
      data_governance: {
        data_source_usage: stats.dataSourceUsage,
        pii_access_events: 0, // Would be calculated from data source analysis
        retention_compliance: {
          compliant_records: stats.totalEntries,
          expired_records: 0,
          pending_deletion: 0,
        },
      },
      recommendations: this.generateRecommendations(stats, securityEvents, policyViolations),
    };
  }

  // Helper methods
  private categorizeAction(action: string): string {
    if (action.includes('query') || action.includes('search')) return 'query';
    if (action.includes('check') || action.includes('validate')) return 'artifact_check';
    if (action.includes('policy') || action.includes('rule')) return 'policy_update';
    if (action.includes('config') || action.includes('setting')) return 'configuration_change';
    if (action.includes('access') || action.includes('read')) return 'data_access';
    return 'system_operation';
  }

  private extractDataSources(references: any[]): DataSourceAttribution[] {
    return references.map(ref => ({
      source_system: ref.source_type,
      source_id: ref.source_id,
      data_classification: 'internal', // Default classification
      access_level_required: 'user',
      pii_detected: false,
      sensitive_data_types: [],
    }));
  }

  private buildPerformanceMetrics(input?: Partial<PerformanceMetrics>): PerformanceMetrics {
    return {
      execution_time_ms: input?.execution_time_ms || 0,
      memory_usage_mb: input?.memory_usage_mb,
      api_calls_made: input?.api_calls_made || 0,
      tokens_consumed: input?.tokens_consumed,
      cache_hit_ratio: input?.cache_hit_ratio,
      error_count: input?.error_count || 0,
    };
  }

  private addDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  private async checkSecurityAlerts(auditLogItem: AuditLogItem): Promise<void> {
    // This would check against configured security alert rules
    // For now, just log high-severity events
    if (auditLogItem.security_event?.severity === 'high' || auditLogItem.security_event?.severity === 'critical') {
      console.log('SECURITY_ALERT', {
        request_id: auditLogItem.request_id,
        user_id: auditLogItem.user_id,
        event_type: auditLogItem.security_event.event_type,
        severity: auditLogItem.security_event.severity,
        timestamp: auditLogItem.timestamp,
      });
    }
  }

  private async generateTrendData(startTimestamp?: string, endTimestamp?: string): Promise<AuditLogStatistics['trends']> {
    // Simplified trend generation - in production this would be more sophisticated
    return {
      daily_activity: [],
      weekly_violations: [],
      monthly_compliance: [],
    };
  }

  private generateTrendPeriods(startDate: string, endDate: string): { start: string; end: string; label: string }[] {
    // Generate weekly periods for trend analysis
    const periods: { start: string; end: string; label: string }[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let current = new Date(start);
    let weekNum = 1;
    
    while (current < end) {
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > end) weekEnd.setTime(end.getTime());
      
      periods.push({
        start: current.toISOString(),
        end: weekEnd.toISOString(),
        label: `Week ${weekNum}`,
      });
      
      current.setDate(current.getDate() + 7);
      weekNum++;
    }
    
    return periods;
  }

  private generateRecommendations(
    stats: AuditLogStatistics,
    securityEvents: AuditLog[],
    policyViolations: AuditLog[]
  ): ComplianceReport['recommendations'] {
    const recommendations: ComplianceReport['recommendations'] = [];

    // Low compliance score recommendation
    if (stats.averageComplianceScore < 70) {
      recommendations.push({
        priority: 'high',
        category: 'Compliance',
        description: 'Average compliance score is below acceptable threshold. Review and update policies and training.',
        estimated_impact: 'Improved compliance scores and reduced risk',
      });
    }

    // High security event count
    const highSeverityEvents = securityEvents.filter(log => 
      log.security_event?.severity === 'high' || log.security_event?.severity === 'critical'
    );
    if (highSeverityEvents.length > 10) {
      recommendations.push({
        priority: 'high',
        category: 'Security',
        description: 'High number of critical security events detected. Review access controls and user permissions.',
        estimated_impact: 'Reduced security risk and improved access control',
      });
    }

    // Policy violation patterns
    if (policyViolations.length > stats.totalEntries * 0.1) {
      recommendations.push({
        priority: 'medium',
        category: 'Policy',
        description: 'Policy violation rate exceeds 10%. Consider policy review and additional training.',
        estimated_impact: 'Reduced policy violations and improved compliance',
      });
    }

    return recommendations;
  }
}