import { 
  SecurityAlertConfig, 
  SecurityEvent, 
  AuditLog 
} from '../models';
import { Logger } from '../lambda/utils/logger';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface SecurityAlertServiceConfig {
  snsTopicArn?: string;
  emailFromAddress?: string;
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  alertConfigs: SecurityAlertConfig[];
}

export interface AlertNotification {
  alertId: string;
  alertName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  eventType: string;
  userId: string;
  timestamp: string;
  description: string;
  recommendedActions: string[];
  affectedResources: string[];
  riskScore: number;
}

export class SecurityAlertService {
  private snsClient: SNSClient;
  private sesClient: SESClient;
  private alertConfigs: SecurityAlertConfig[];
  private logger: Logger;
  private config: SecurityAlertServiceConfig;

  constructor(config: SecurityAlertServiceConfig) {
    this.config = config;
    this.alertConfigs = config.alertConfigs;
    this.snsClient = new SNSClient({});
    this.sesClient = new SESClient({});
    this.logger = new Logger({ 
      correlationId: 'security-alert-service', 
      operation: 'security-alerting' 
    });
  }

  /**
   * Process a security event and trigger alerts if necessary
   */
  async processSecurityEvent(auditLog: AuditLog): Promise<void> {
    if (!auditLog.security_event) return;

    const triggeredAlerts: SecurityAlertConfig[] = [];

    // Check each alert configuration
    for (const alertConfig of this.alertConfigs) {
      if (!alertConfig.enabled) continue;

      if (this.shouldTriggerAlert(auditLog.security_event, alertConfig, auditLog)) {
        triggeredAlerts.push(alertConfig);
      }
    }

    // Process triggered alerts
    for (const alertConfig of triggeredAlerts) {
      await this.triggerAlert(alertConfig, auditLog);
    }
  }

  /**
   * Add or update a security alert configuration
   */
  async configureAlert(config: SecurityAlertConfig): Promise<void> {
    const existingIndex = this.alertConfigs.findIndex(
      alert => alert.alert_id === config.alert_id
    );

    if (existingIndex >= 0) {
      this.alertConfigs[existingIndex] = config;
    } else {
      this.alertConfigs.push(config);
    }

    this.logger.info('Security alert configured', {
      alert_id: config.alert_id,
      name: config.name,
      enabled: config.enabled,
    });
  }

  /**
   * Remove a security alert configuration
   */
  async removeAlert(alertId: string): Promise<void> {
    this.alertConfigs = this.alertConfigs.filter(
      alert => alert.alert_id !== alertId
    );

    this.logger.info('Security alert removed', { alert_id: alertId });
  }

  /**
   * Get all alert configurations
   */
  getAlertConfigurations(): SecurityAlertConfig[] {
    return [...this.alertConfigs];
  }

  /**
   * Get active alerts (enabled only)
   */
  getActiveAlerts(): SecurityAlertConfig[] {
    return this.alertConfigs.filter(alert => alert.enabled);
  }

  /**
   * Test an alert configuration
   */
  async testAlert(alertId: string, testEvent: SecurityEvent): Promise<boolean> {
    const alertConfig = this.alertConfigs.find(alert => alert.alert_id === alertId);
    if (!alertConfig) {
      throw new Error(`Alert configuration not found: ${alertId}`);
    }

    const mockAuditLog: AuditLog = {
      request_id: 'test-request',
      timestamp: new Date().toISOString(),
      user_id: 'test-user',
      persona: 'test-persona',
      action: 'test-action',
      references: [],
      result_summary: 'Test security event',
      compliance_score: 50,
      action_category: 'system_operation',
      security_event: testEvent,
      data_sources: [],
      compliance_flags: [],
      policy_violations: [],
      performance_metrics: {
        execution_time_ms: 100,
        api_calls_made: 1,
        error_count: 0,
      },
      request_context: {
        source_ip: '127.0.0.1',
        user_agent: 'test-agent',
        correlation_id: 'test-correlation',
      },
      created_at: new Date().toISOString(),
    };

    const shouldTrigger = this.shouldTriggerAlert(testEvent, alertConfig, mockAuditLog);
    
    if (shouldTrigger) {
      this.logger.info('Test alert would trigger', {
        alert_id: alertId,
        event_type: testEvent.event_type,
        severity: testEvent.severity,
      });
    }

    return shouldTrigger;
  }

  // Private methods
  private shouldTriggerAlert(
    securityEvent: SecurityEvent, 
    alertConfig: SecurityAlertConfig,
    auditLog: AuditLog
  ): boolean {
    // Check event type
    if (!alertConfig.triggers.event_types.includes(securityEvent.event_type)) {
      return false;
    }

    // Check severity threshold
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const eventSeverityIndex = severityLevels.indexOf(securityEvent.severity);
    const thresholdIndex = severityLevels.indexOf(alertConfig.triggers.severity_threshold);
    
    if (eventSeverityIndex < thresholdIndex) {
      return false;
    }

    // Check compliance score threshold
    if (alertConfig.triggers.compliance_score_threshold && 
        auditLog.compliance_score > alertConfig.triggers.compliance_score_threshold) {
      return false;
    }

    // Check policy violations
    if (alertConfig.triggers.policy_violations && 
        alertConfig.triggers.policy_violations.length > 0) {
      const hasMatchingViolation = alertConfig.triggers.policy_violations.some(
        policyId => auditLog.policy_violations?.includes(policyId)
      );
      if (!hasMatchingViolation) {
        return false;
      }
    }

    // Check frequency threshold (simplified - in production would check recent events)
    if (alertConfig.triggers.frequency_threshold) {
      // This would require checking recent events from the audit log
      // For now, we'll assume frequency check passes
    }

    return true;
  }

  private async triggerAlert(
    alertConfig: SecurityAlertConfig, 
    auditLog: AuditLog
  ): Promise<void> {
    this.logger.warn('Security alert triggered', {
      alert_id: alertConfig.alert_id,
      alert_name: alertConfig.name,
      user_id: auditLog.user_id,
      event_type: auditLog.security_event?.event_type,
      severity: auditLog.security_event?.severity,
    });

    const notification = this.createNotification(alertConfig, auditLog);

    // Execute alert actions
    const actions = alertConfig.actions;

    // Send notifications to users
    if (actions.notify_users && actions.notify_users.length > 0) {
      await this.notifyUsers(actions.notify_users, notification);
    }

    // Send notifications to teams
    if (actions.notify_teams && actions.notify_teams.length > 0) {
      await this.notifyTeams(actions.notify_teams, notification);
    }

    // Create incident if configured
    if (actions.create_incident) {
      await this.createIncident(notification);
    }

    // Block user if configured (this would integrate with IAM/auth system)
    if (actions.block_user) {
      await this.blockUser(auditLog.user_id, notification);
    }

    // Escalate if configured
    if (actions.escalate_to) {
      await this.escalateAlert(actions.escalate_to, notification);
    }
  }

  private createNotification(
    alertConfig: SecurityAlertConfig, 
    auditLog: AuditLog
  ): AlertNotification {
    const securityEvent = auditLog.security_event!;
    
    return {
      alertId: alertConfig.alert_id,
      alertName: alertConfig.name,
      severity: securityEvent.severity,
      eventType: securityEvent.event_type,
      userId: auditLog.user_id,
      timestamp: auditLog.timestamp,
      description: this.generateAlertDescription(alertConfig, auditLog),
      recommendedActions: this.generateRecommendedActions(securityEvent),
      affectedResources: this.extractAffectedResources(auditLog),
      riskScore: securityEvent.risk_score || 0,
    };
  }

  private generateAlertDescription(
    alertConfig: SecurityAlertConfig, 
    auditLog: AuditLog
  ): string {
    const securityEvent = auditLog.security_event!;
    
    return `Security Alert: ${alertConfig.name}
    
Event Type: ${securityEvent.event_type}
Severity: ${securityEvent.severity}
User: ${auditLog.user_id}
Action: ${auditLog.action}
Time: ${auditLog.timestamp}
Compliance Score: ${auditLog.compliance_score}

${securityEvent.violation_details || 'No additional details available.'}`;
  }

  private generateRecommendedActions(securityEvent: SecurityEvent): string[] {
    const actions: string[] = [];

    switch (securityEvent.event_type) {
      case 'authentication':
        actions.push('Review user authentication logs');
        actions.push('Check for suspicious login patterns');
        actions.push('Consider enabling MFA if not already active');
        break;
      
      case 'authorization':
        actions.push('Review user permissions and access levels');
        actions.push('Verify resource access requirements');
        actions.push('Check for privilege escalation attempts');
        break;
      
      case 'data_access':
        actions.push('Review data access patterns');
        actions.push('Verify data classification and access controls');
        actions.push('Check for unauthorized data exfiltration');
        break;
      
      case 'policy_violation':
        actions.push('Review and update relevant policies');
        actions.push('Provide additional user training');
        actions.push('Consider automated policy enforcement');
        break;
      
      case 'suspicious_activity':
        actions.push('Investigate user activity patterns');
        actions.push('Review system logs for anomalies');
        actions.push('Consider temporary access restrictions');
        break;
      
      case 'configuration_change':
        actions.push('Review configuration change approval process');
        actions.push('Verify change was authorized');
        actions.push('Check for security impact of changes');
        break;
      
      default:
        actions.push('Investigate the security event');
        actions.push('Review relevant system logs');
        actions.push('Consider implementing additional monitoring');
    }

    // Add severity-specific actions
    if (securityEvent.severity === 'critical' || securityEvent.severity === 'high') {
      actions.push('Consider immediate incident response');
      actions.push('Notify security team immediately');
      actions.push('Document all response actions');
    }

    return actions;
  }

  private extractAffectedResources(auditLog: AuditLog): string[] {
    const resources: string[] = [];
    
    if (auditLog.security_event?.resource_accessed) {
      resources.push(auditLog.security_event.resource_accessed);
    }
    
    if (auditLog.business_context?.project_id) {
      resources.push(`Project: ${auditLog.business_context.project_id}`);
    }
    
    if (auditLog.team_id) {
      resources.push(`Team: ${auditLog.team_id}`);
    }
    
    auditLog.data_sources?.forEach(source => {
      resources.push(`${source.source_system}: ${source.source_id}`);
    });
    
    return resources;
  }

  private async notifyUsers(userIds: string[], notification: AlertNotification): Promise<void> {
    for (const userId of userIds) {
      try {
        // In a real implementation, this would look up user email/contact info
        await this.sendEmailNotification(
          `user-${userId}@company.com`, // Placeholder
          notification
        );
      } catch (error) {
        this.logger.error('Failed to notify user', {
          user_id: userId,
          error: error as Error,
        });
      }
    }
  }

  private async notifyTeams(teamIds: string[], notification: AlertNotification): Promise<void> {
    for (const teamId of teamIds) {
      try {
        // Send to team channels (Slack/Teams)
        await this.sendTeamNotification(teamId, notification);
      } catch (error) {
        this.logger.error('Failed to notify team', {
          team_id: teamId,
          error: error as Error,
        });
      }
    }
  }

  private async sendEmailNotification(
    email: string, 
    notification: AlertNotification
  ): Promise<void> {
    if (!this.config.emailFromAddress) return;

    const subject = `Security Alert: ${notification.alertName} (${notification.severity.toUpperCase()})`;
    const body = this.formatEmailBody(notification);

    const command = new SendEmailCommand({
      Source: this.config.emailFromAddress,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    });

    await this.sesClient.send(command);
  }

  private async sendTeamNotification(
    teamId: string, 
    notification: AlertNotification
  ): Promise<void> {
    // This would integrate with Slack/Teams APIs
    // For now, just log the notification
    this.logger.info('Team notification sent', {
      team_id: teamId,
      alert_id: notification.alertId,
      severity: notification.severity,
    });
  }

  private async createIncident(notification: AlertNotification): Promise<void> {
    // This would integrate with incident management systems (PagerDuty, Jira Service Desk, etc.)
    this.logger.info('Incident created for security alert', {
      alert_id: notification.alertId,
      severity: notification.severity,
      risk_score: notification.riskScore,
    });
  }

  private async blockUser(userId: string, notification: AlertNotification): Promise<void> {
    // This would integrate with IAM/authentication systems to temporarily block the user
    this.logger.warn('User blocked due to security alert', {
      user_id: userId,
      alert_id: notification.alertId,
      severity: notification.severity,
    });
  }

  private async escalateAlert(
    escalateTo: string, 
    notification: AlertNotification
  ): Promise<void> {
    // Send escalation notification
    await this.sendEmailNotification(escalateTo, notification);
    
    this.logger.info('Alert escalated', {
      escalated_to: escalateTo,
      alert_id: notification.alertId,
      severity: notification.severity,
    });
  }

  private formatEmailBody(notification: AlertNotification): string {
    return `
Security Alert: ${notification.alertName}

Severity: ${notification.severity.toUpperCase()}
Event Type: ${notification.eventType}
User: ${notification.userId}
Time: ${notification.timestamp}
Risk Score: ${notification.riskScore}/100

Description:
${notification.description}

Affected Resources:
${notification.affectedResources.map(resource => `- ${resource}`).join('\n')}

Recommended Actions:
${notification.recommendedActions.map(action => `- ${action}`).join('\n')}

This is an automated security alert. Please investigate immediately.
`;
  }
}