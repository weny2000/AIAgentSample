import { 
  ComplianceReport, 
  AuditLogStatistics,
  AuditLog,
  SecurityEvent 
} from '../models';
import { AuditService } from './audit-service';
import { Logger } from '../lambda/utils/logger';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface ComplianceReportingConfig {
  auditService: AuditService;
  s3BucketName?: string;
  reportRetentionDays?: number;
}

export interface ComplianceMetrics {
  totalActions: number;
  averageComplianceScore: number;
  policyViolationRate: number;
  securityEventRate: number;
  dataAccessEvents: number;
  piiAccessEvents: number;
  highRiskEvents: number;
  complianceScoreDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  topViolatedPolicies: Array<{
    policyId: string;
    violationCount: number;
    affectedUsers: number;
  }>;
  riskTrends: Array<{
    period: string;
    averageRiskScore: number;
    eventCount: number;
  }>;
}

export interface ComplianceReportOptions {
  startDate: string;
  endDate: string;
  includeRecommendations?: boolean;
  includeDetailedAnalysis?: boolean;
  includeUserBreakdown?: boolean;
  includeTeamBreakdown?: boolean;
  filterByTeam?: string;
  filterByUser?: string;
  filterBySeverity?: 'low' | 'medium' | 'high' | 'critical';
  exportFormat?: 'json' | 'pdf' | 'csv';
}

export class ComplianceReportingService {
  private auditService: AuditService;
  private s3Client: S3Client;
  private logger: Logger;
  private config: ComplianceReportingConfig;

  constructor(config: ComplianceReportingConfig) {
    this.config = config;
    this.auditService = config.auditService;
    this.s3Client = new S3Client({});
    this.logger = new Logger({ 
      correlationId: 'compliance-reporting', 
      operation: 'compliance-reporting' 
    });
  }

  /**
   * Generate a comprehensive compliance report
   */
  async generateComplianceReport(
    options: ComplianceReportOptions,
    generatedBy: string
  ): Promise<ComplianceReport> {
    this.logger.info('Generating compliance report', {
      start_date: options.startDate,
      end_date: options.endDate,
      generated_by: generatedBy,
      options,
    });

    try {
      // Get base compliance report from audit service
      const baseReport = await this.auditService.generateComplianceReport(
        options.startDate,
        options.endDate,
        generatedBy,
        options.includeRecommendations
      );

      // Enhance with additional analysis if requested
      if (options.includeDetailedAnalysis) {
        await this.enhanceWithDetailedAnalysis(baseReport, options);
      }

      if (options.includeUserBreakdown) {
        await this.addUserBreakdown(baseReport, options);
      }

      if (options.includeTeamBreakdown) {
        await this.addTeamBreakdown(baseReport, options);
      }

      // Apply filters if specified
      if (options.filterByTeam || options.filterByUser || options.filterBySeverity) {
        await this.applyFilters(baseReport, options);
      }

      // Store report if S3 bucket is configured
      if (this.config.s3BucketName) {
        await this.storeReport(baseReport, options.exportFormat || 'json');
      }

      this.logger.info('Compliance report generated successfully', {
        report_id: baseReport.report_id,
        total_actions: baseReport.summary.total_actions,
        avg_compliance_score: baseReport.summary.average_compliance_score,
      });

      return baseReport;

    } catch (error) {
      this.logger.error('Failed to generate compliance report', error as Error);
      throw error;
    }
  }

  /**
   * Get compliance metrics for a specific period
   */
  async getComplianceMetrics(
    startDate: string,
    endDate: string,
    teamId?: string
  ): Promise<ComplianceMetrics> {
    try {
      const statistics = await this.auditService.getAuditStatistics(startDate, endDate);
      const securityEvents = await this.auditService.getSecurityEvents(
        undefined, 
        startDate, 
        endDate
      );

      // Calculate additional metrics
      const totalActions = statistics.totalEntries;
      const policyViolationCount = Object.values(statistics.policyViolationCounts)
        .reduce((sum, count) => sum + count, 0);
      const securityEventCount = Object.values(statistics.securityEventCounts)
        .reduce((sum, count) => sum + count, 0);

      const policyViolationRate = totalActions > 0 ? 
        (policyViolationCount / totalActions) * 100 : 0;
      const securityEventRate = totalActions > 0 ? 
        (securityEventCount / totalActions) * 100 : 0;

      // Count high-risk events
      const highRiskEvents = securityEvents.filter(log => 
        log.security_event?.severity === 'high' || 
        log.security_event?.severity === 'critical'
      ).length;

      // Calculate PII access events (simplified)
      const piiAccessEvents = securityEvents.filter(log =>
        log.compliance_flags?.includes('pii_access')
      ).length;

      // Get top violated policies
      const topViolatedPolicies = Object.entries(statistics.policyViolationCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([policyId, violationCount]) => ({
          policyId,
          violationCount,
          affectedUsers: 0, // Would be calculated from actual data
        }));

      // Generate risk trends (simplified)
      const riskTrends = await this.calculateRiskTrends(startDate, endDate);

      return {
        totalActions,
        averageComplianceScore: statistics.averageComplianceScore,
        policyViolationRate,
        securityEventRate,
        dataAccessEvents: Object.values(statistics.dataSourceUsage)
          .reduce((sum, count) => sum + count, 0),
        piiAccessEvents,
        highRiskEvents,
        complianceScoreDistribution: statistics.complianceScoreDistribution,
        topViolatedPolicies,
        riskTrends,
      };

    } catch (error) {
      this.logger.error('Failed to get compliance metrics', error as Error);
      throw error;
    }
  }

  /**
   * Generate a compliance dashboard summary
   */
  async getComplianceDashboard(
    period: 'day' | 'week' | 'month' | 'quarter' = 'month'
  ): Promise<{
    currentPeriod: ComplianceMetrics;
    previousPeriod: ComplianceMetrics;
    trends: {
      complianceScoreTrend: number;
      violationTrend: number;
      securityEventTrend: number;
    };
    alerts: Array<{
      type: 'compliance_drop' | 'violation_spike' | 'security_event';
      severity: 'low' | 'medium' | 'high';
      message: string;
      value: number;
    }>;
  }> {
    const { startDate: currentStart, endDate: currentEnd } = this.getPeriodDates(period);
    const { startDate: previousStart, endDate: previousEnd } = this.getPeriodDates(period, 1);

    const currentMetrics = await this.getComplianceMetrics(currentStart, currentEnd);
    const previousMetrics = await this.getComplianceMetrics(previousStart, previousEnd);

    // Calculate trends
    const complianceScoreTrend = currentMetrics.averageComplianceScore - 
      previousMetrics.averageComplianceScore;
    const violationTrend = currentMetrics.policyViolationRate - 
      previousMetrics.policyViolationRate;
    const securityEventTrend = currentMetrics.securityEventRate - 
      previousMetrics.securityEventRate;

    // Generate alerts
    const alerts = this.generateComplianceAlerts(currentMetrics, previousMetrics);

    return {
      currentPeriod: currentMetrics,
      previousPeriod: previousMetrics,
      trends: {
        complianceScoreTrend,
        violationTrend,
        securityEventTrend,
      },
      alerts,
    };
  }

  /**
   * Export compliance report in different formats
   */
  async exportReport(
    report: ComplianceReport,
    format: 'json' | 'pdf' | 'csv'
  ): Promise<Buffer> {
    switch (format) {
      case 'json':
        return Buffer.from(JSON.stringify(report, null, 2));
      
      case 'csv':
        return this.exportToCsv(report);
      
      case 'pdf':
        return this.exportToPdf(report);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Private methods
  private async enhanceWithDetailedAnalysis(
    report: ComplianceReport,
    options: ComplianceReportOptions
  ): Promise<void> {
    // Add detailed analysis sections
    const securityEvents = await this.auditService.getSecurityEvents(
      undefined,
      options.startDate,
      options.endDate
    );

    // Analyze security event patterns
    const eventPatterns = this.analyzeSecurityEventPatterns(securityEvents);
    
    // Add to report (extend the report structure as needed)
    (report as any).detailed_analysis = {
      security_event_patterns: eventPatterns,
      risk_assessment: this.calculateRiskAssessment(securityEvents),
      compliance_gaps: this.identifyComplianceGaps(report),
    };
  }

  private async addUserBreakdown(
    report: ComplianceReport,
    options: ComplianceReportOptions
  ): Promise<void> {
    // Get user-specific statistics
    // This would require querying audit logs by user
    (report as any).user_breakdown = {
      top_users_by_activity: [],
      users_with_violations: [],
      users_with_security_events: [],
    };
  }

  private async addTeamBreakdown(
    report: ComplianceReport,
    options: ComplianceReportOptions
  ): Promise<void> {
    // Get team-specific statistics
    (report as any).team_breakdown = {
      team_compliance_scores: {},
      team_violation_counts: {},
      team_security_events: {},
    };
  }

  private async applyFilters(
    report: ComplianceReport,
    options: ComplianceReportOptions
  ): Promise<void> {
    // Apply filters to report data
    if (options.filterBySeverity) {
      report.security_analysis.high_risk_events = 
        report.security_analysis.high_risk_events.filter(
          event => event.severity === options.filterBySeverity
        );
    }
  }

  private async storeReport(
    report: ComplianceReport,
    format: string
  ): Promise<void> {
    if (!this.config.s3BucketName) return;

    const key = `compliance-reports/${report.report_id}.${format}`;
    const body = await this.exportReport(report, format as any);

    const command = new PutObjectCommand({
      Bucket: this.config.s3BucketName,
      Key: key,
      Body: body,
      ContentType: this.getContentType(format),
      Metadata: {
        'report-id': report.report_id,
        'generated-by': report.generated_by,
        'generated-at': report.generated_at,
      },
    });

    await this.s3Client.send(command);

    this.logger.info('Compliance report stored', {
      bucket: this.config.s3BucketName,
      key,
      format,
    });
  }

  private async calculateRiskTrends(
    startDate: string,
    endDate: string
  ): Promise<ComplianceMetrics['riskTrends']> {
    // Generate weekly risk trends
    const trends: ComplianceMetrics['riskTrends'] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let current = new Date(start);
    let weekNum = 1;
    
    while (current < end) {
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > end) weekEnd.setTime(end.getTime());
      
      // Get security events for this week
      const weekEvents = await this.auditService.getSecurityEvents(
        undefined,
        current.toISOString(),
        weekEnd.toISOString()
      );
      
      const averageRiskScore = weekEvents.length > 0 ?
        weekEvents.reduce((sum, log) => sum + (log.security_event?.risk_score || 0), 0) / weekEvents.length :
        0;
      
      trends.push({
        period: `Week ${weekNum}`,
        averageRiskScore,
        eventCount: weekEvents.length,
      });
      
      current.setDate(current.getDate() + 7);
      weekNum++;
    }
    
    return trends;
  }

  private analyzeSecurityEventPatterns(securityEvents: AuditLog[]): any {
    const patterns = {
      most_common_event_types: {},
      peak_activity_hours: {},
      user_risk_profiles: {},
      resource_access_patterns: {},
    };

    securityEvents.forEach(log => {
      if (log.security_event) {
        // Count event types
        const eventType = log.security_event.event_type;
        patterns.most_common_event_types[eventType] = 
          (patterns.most_common_event_types[eventType] || 0) + 1;

        // Analyze activity by hour
        const hour = new Date(log.timestamp).getHours();
        patterns.peak_activity_hours[hour] = 
          (patterns.peak_activity_hours[hour] || 0) + 1;
      }
    });

    return patterns;
  }

  private calculateRiskAssessment(securityEvents: AuditLog[]): any {
    const totalEvents = securityEvents.length;
    const criticalEvents = securityEvents.filter(log => 
      log.security_event?.severity === 'critical'
    ).length;
    const highEvents = securityEvents.filter(log => 
      log.security_event?.severity === 'high'
    ).length;

    const overallRiskScore = totalEvents > 0 ?
      securityEvents.reduce((sum, log) => sum + (log.security_event?.risk_score || 0), 0) / totalEvents :
      0;

    return {
      overall_risk_score: overallRiskScore,
      risk_level: this.getRiskLevel(overallRiskScore),
      critical_events: criticalEvents,
      high_events: highEvents,
      risk_distribution: {
        critical: criticalEvents,
        high: highEvents,
        medium: securityEvents.filter(log => log.security_event?.severity === 'medium').length,
        low: securityEvents.filter(log => log.security_event?.severity === 'low').length,
      },
    };
  }

  private identifyComplianceGaps(report: ComplianceReport): any {
    const gaps = [];

    if (report.summary.average_compliance_score < 70) {
      gaps.push({
        type: 'low_compliance_score',
        severity: 'high',
        description: 'Average compliance score is below acceptable threshold',
        recommendation: 'Review and update policies, provide additional training',
      });
    }

    if (report.summary.policy_violations > report.summary.total_actions * 0.1) {
      gaps.push({
        type: 'high_violation_rate',
        severity: 'medium',
        description: 'Policy violation rate exceeds 10%',
        recommendation: 'Analyze violation patterns and improve policy enforcement',
      });
    }

    return gaps;
  }

  private getPeriodDates(
    period: 'day' | 'week' | 'month' | 'quarter',
    periodsAgo: number = 0
  ): { startDate: string; endDate: string } {
    const now = new Date();
    const endDate = new Date(now);
    const startDate = new Date(now);

    // Adjust for periods ago
    switch (period) {
      case 'day':
        endDate.setDate(endDate.getDate() - periodsAgo);
        startDate.setDate(startDate.getDate() - periodsAgo - 1);
        break;
      case 'week':
        endDate.setDate(endDate.getDate() - (periodsAgo * 7));
        startDate.setDate(startDate.getDate() - ((periodsAgo + 1) * 7));
        break;
      case 'month':
        endDate.setMonth(endDate.getMonth() - periodsAgo);
        startDate.setMonth(startDate.getMonth() - periodsAgo - 1);
        break;
      case 'quarter':
        endDate.setMonth(endDate.getMonth() - (periodsAgo * 3));
        startDate.setMonth(startDate.getMonth() - ((periodsAgo + 1) * 3));
        break;
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }

  private generateComplianceAlerts(
    current: ComplianceMetrics,
    previous: ComplianceMetrics
  ): Array<{
    type: 'compliance_drop' | 'violation_spike' | 'security_event';
    severity: 'low' | 'medium' | 'high';
    message: string;
    value: number;
  }> {
    const alerts = [];

    // Check for compliance score drop
    const scoreDrop = previous.averageComplianceScore - current.averageComplianceScore;
    if (scoreDrop > 10) {
      alerts.push({
        type: 'compliance_drop' as const,
        severity: scoreDrop > 20 ? 'high' as const : 'medium' as const,
        message: `Compliance score dropped by ${scoreDrop.toFixed(1)} points`,
        value: scoreDrop,
      });
    }

    // Check for violation spike
    const violationIncrease = current.policyViolationRate - previous.policyViolationRate;
    if (violationIncrease > 5) {
      alerts.push({
        type: 'violation_spike' as const,
        severity: violationIncrease > 15 ? 'high' as const : 'medium' as const,
        message: `Policy violation rate increased by ${violationIncrease.toFixed(1)}%`,
        value: violationIncrease,
      });
    }

    // Check for security event increase
    const securityEventIncrease = current.securityEventRate - previous.securityEventRate;
    if (securityEventIncrease > 3) {
      alerts.push({
        type: 'security_event' as const,
        severity: securityEventIncrease > 10 ? 'high' as const : 'medium' as const,
        message: `Security event rate increased by ${securityEventIncrease.toFixed(1)}%`,
        value: securityEventIncrease,
      });
    }

    return alerts;
  }

  private getRiskLevel(riskScore: number): string {
    if (riskScore >= 80) return 'Critical';
    if (riskScore >= 60) return 'High';
    if (riskScore >= 40) return 'Medium';
    if (riskScore >= 20) return 'Low';
    return 'Minimal';
  }

  private getContentType(format: string): string {
    switch (format) {
      case 'json': return 'application/json';
      case 'csv': return 'text/csv';
      case 'pdf': return 'application/pdf';
      default: return 'application/octet-stream';
    }
  }

  private exportToCsv(report: ComplianceReport): Buffer {
    // Simple CSV export of key metrics
    const lines = [
      'Metric,Value',
      `Report ID,${report.report_id}`,
      `Generated At,${report.generated_at}`,
      `Generated By,${report.generated_by}`,
      `Period Start,${report.report_period.start_date}`,
      `Period End,${report.report_period.end_date}`,
      `Total Actions,${report.summary.total_actions}`,
      `Total Users,${report.summary.total_users}`,
      `Total Teams,${report.summary.total_teams}`,
      `Average Compliance Score,${report.summary.average_compliance_score}`,
      `Policy Violations,${report.summary.policy_violations}`,
      `Security Events,${report.summary.security_events}`,
    ];

    return Buffer.from(lines.join('\n'));
  }

  private exportToPdf(report: ComplianceReport): Buffer {
    // For a real implementation, this would use a PDF library like puppeteer or jsPDF
    // For now, return a simple text representation
    const content = `
COMPLIANCE REPORT
================

Report ID: ${report.report_id}
Generated: ${report.generated_at}
Generated By: ${report.generated_by}
Period: ${report.report_period.start_date} to ${report.report_period.end_date}

SUMMARY
-------
Total Actions: ${report.summary.total_actions}
Total Users: ${report.summary.total_users}
Total Teams: ${report.summary.total_teams}
Average Compliance Score: ${report.summary.average_compliance_score}
Policy Violations: ${report.summary.policy_violations}
Security Events: ${report.summary.security_events}

RECOMMENDATIONS
--------------
${report.recommendations.map(rec => `- ${rec.description}`).join('\n')}
`;

    return Buffer.from(content);
  }
}