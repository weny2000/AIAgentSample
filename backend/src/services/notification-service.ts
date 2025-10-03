import { ImpactAnalysisResult, Stakeholder } from './impact-analysis-service.js';

export interface NotificationRequest {
  impact_analysis: ImpactAnalysisResult;
  change_description: string;
  change_timeline: string;
  requester: {
    user_id: string;
    name: string;
    email: string;
    team_id: string;
  };
  notification_type: 'impact_alert' | 'coordination_request' | 'approval_request';
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface NotificationResult {
  notification_id: string;
  sent_notifications: SentNotification[];
  failed_notifications: FailedNotification[];
  summary: NotificationSummary;
 
}

export interface RetryStatus {
  total_retries: number;
  successful_retries: number;
  failed_retries: number;
  next_retry_at?: Date;
}

export interface SentNotification {
  stakeholder_team_id: string;
  channel: 'slack' | 'teams' | 'email' | 'jira';
  message_id?: string;
  sent_at: Date;
  delivery_status: 'sent' | 'delivered' | 'failed';
  retry_status?: RetryStatus;
}

export interface FailedNotification {
  stakeholder_team_id: string;
  channel: 'slack' | 'teams' | 'email' | 'jira';
  error_message: string;
  retry_count: number;
}

export interface NotificationSummary {
  total_stakeholders: number;
  notifications_sent: number;
  notifications_failed: number;
  channels_used: string[];
  estimated_reach: number;
}

export interface IssueCreationRequest {
  impact_analysis: ImpactAnalysisResult;
  change_description: string;
  requester: {
    user_id: string;
    name: string;
    email: string;
    team_id: string;
  };
  issue_type: 'coordination' | 'approval' | 'risk_mitigation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  affected_teams: string[];
}

export interface CreatedIssue {
  issue_key: string;
  issue_url: string;
  project_key: string;
  created_at: Date;
  assignees: string[];
  watchers: string[];
}

/**
 * Service for sending notifications and creating issues based on impact analysis
 */
export class NotificationService {
  private slackWebhookUrl?: string;
  private teamsWebhookUrl?: string;
  private jiraConfig?: {
    baseUrl: string;
    username: string;
    apiToken: string;
    defaultProject: string;
  };

  constructor(config?: {
    slackWebhookUrl?: string;
    teamsWebhookUrl?: string;
    jiraConfig?: {
      baseUrl: string;
      username: string;
      apiToken: string;
      defaultProject: string;
    };
  }) {
    this.slackWebhookUrl = config?.slackWebhookUrl;
    this.teamsWebhookUrl = config?.teamsWebhookUrl;
    this.jiraConfig = config?.jiraConfig;
  }

  /**
   * Send notifications to all stakeholders based on impact analysis
   */
  async sendStakeholderNotifications(request: NotificationRequest): Promise<NotificationResult> {
    const notificationId = this.generateNotificationId();
    const sentNotifications: SentNotification[] = [];
    const failedNotifications: FailedNotification[] = [];

    // Sort stakeholders by priority
    const prioritizedStakeholders = request.impact_analysis.stakeholders
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

    // Send notifications to each stakeholder
    for (const stakeholder of prioritizedStakeholders) {
      const channels = this.determineNotificationChannels(stakeholder, request.urgency);
      
      for (const channel of channels) {
        try {
          const result = await this.sendNotification(
            stakeholder,
            channel,
            request,
            notificationId
          );
          
          sentNotifications.push(result);
        } catch (error) {
          failedNotifications.push({
            stakeholder_team_id: stakeholder.team_id,
            channel,
            error_message: error instanceof Error ? error.message : 'Unknown error',
            retry_count: 0
          });
        }
      }
    }

    // Calculate summary
    const summary: NotificationSummary = {
      total_stakeholders: prioritizedStakeholders.length,
      notifications_sent: sentNotifications.length,
      notifications_failed: failedNotifications.length,
      channels_used: [...new Set(sentNotifications.map(n => n.channel))],
      estimated_reach: this.calculateEstimatedReach(sentNotifications, prioritizedStakeholders)
    };

    return {
      notification_id: notificationId,
      sent_notifications: sentNotifications,
      failed_notifications: failedNotifications,
      summary
    };
  }

  /**
   * Create Jira issues for coordination and approval
   */
  async createCoordinationIssues(request: IssueCreationRequest): Promise<CreatedIssue[]> {
    if (!this.jiraConfig) {
      throw new Error('Jira configuration not provided');
    }

    const createdIssues: CreatedIssue[] = [];
    const riskLevel = request.impact_analysis.risk_assessment.overall_risk_level;

    // Create main coordination issue
    const mainIssue = await this.createJiraIssue({
      project: this.jiraConfig.defaultProject,
      issueType: this.mapIssueType(request.issue_type),
      summary: `Cross-team Impact: ${request.change_description}`,
      description: this.buildIssueDescription(request),
      priority: this.mapPriority(request.priority),
      labels: ['cross-team-impact', `risk-${riskLevel}`, 'auto-generated'],
      assignee: request.requester.user_id,
      components: request.affected_teams.map(team => ({ name: team }))
    });

    createdIssues.push(mainIssue);

    // Create team-specific issues for high-priority stakeholders
    const highPriorityStakeholders = request.impact_analysis.stakeholders
      .filter(s => s.priority === 'high');

    for (const stakeholder of highPriorityStakeholders) {
      try {
        const teamIssue = await this.createJiraIssue({
          project: this.jiraConfig.defaultProject,
          issueType: 'Task',
          summary: `Action Required: Impact on ${stakeholder.team_id} services`,
          description: this.buildTeamSpecificDescription(request, stakeholder),
          priority: this.mapPriority(request.priority),
          labels: ['team-action-required', `team-${stakeholder.team_id}`, 'auto-generated'],
          assignee: null, // Will be assigned to team lead
          parent: mainIssue.issue_key
        });

        createdIssues.push(teamIssue);
      } catch (error) {
        console.warn(`Failed to create team issue for ${stakeholder.team_id}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return createdIssues;
  }

  /**
   * Determine appropriate notification channels for a stakeholder
   */
  private determineNotificationChannels(
    stakeholder: Stakeholder,
    urgency: string
  ): ('slack' | 'teams' | 'email')[] {
    const channels: ('slack' | 'teams' | 'email')[] = [];

    // Use stakeholder preferences if available
    if (stakeholder.notification_preferences) {
      for (const pref of stakeholder.notification_preferences) {
        if (['slack', 'teams', 'email'].includes(pref)) {
          channels.push(pref as 'slack' | 'teams' | 'email');
        }
      }
    }

    // Default channels based on urgency and priority
    if (channels.length === 0) {
      if (urgency === 'critical' || stakeholder.priority === 'high') {
        channels.push('slack', 'email');
      } else if (urgency === 'high' || stakeholder.priority === 'medium') {
        channels.push('slack');
      } else {
        channels.push('email');
      }
    }

    return channels;
  }

  /**
   * Send notification via specific channel
   */
  private async sendNotification(
    stakeholder: Stakeholder,
    channel: 'slack' | 'teams' | 'email',
    request: NotificationRequest,
    notificationId: string
  ): Promise<SentNotification> {
    const message = this.buildNotificationMessage(stakeholder, request);

    switch (channel) {
      case 'slack':
        return await this.sendSlackNotification(stakeholder, message, notificationId);
      case 'teams':
        return await this.sendTeamsNotification(stakeholder, message, notificationId);
      case 'email':
        return await this.sendEmailNotification(stakeholder, message, notificationId);
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    stakeholder: Stakeholder,
    message: any,
    notificationId: string
  ): Promise<SentNotification> {
    if (!this.slackWebhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const slackMessage = {
      channel: `#team-${stakeholder.team_id}`,
      username: 'Impact Analysis Bot',
      icon_emoji: ':warning:',
      attachments: [{
        color: this.getColorForPriority(stakeholder.priority),
        title: message.title,
        text: message.body,
        fields: message.fields,
        footer: `Notification ID: ${notificationId}`,
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    // In a real implementation, this would use the Slack Web API
    // For now, we'll simulate the API call
    const response = await this.simulateSlackAPI(slackMessage);

    return {
      stakeholder_team_id: stakeholder.team_id,
      channel: 'slack',
      message_id: response.ts,
      sent_at: new Date(),
      delivery_status: 'sent'
    };
  }

  /**
   * Send Teams notification
   */
  private async sendTeamsNotification(
    stakeholder: Stakeholder,
    message: any,
    notificationId: string
  ): Promise<SentNotification> {
    if (!this.teamsWebhookUrl) {
      throw new Error('Teams webhook URL not configured');
    }

    const teamsMessage = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: message.title,
      themeColor: this.getColorForPriority(stakeholder.priority),
      sections: [{
        activityTitle: message.title,
        activitySubtitle: `Team: ${stakeholder.team_id}`,
        text: message.body,
        facts: message.fields.map((field: any) => ({
          name: field.title,
          value: field.value
        }))
      }]
    };

    // In a real implementation, this would use the Teams webhook
    // For now, we'll simulate the API call
    const response = await this.simulateTeamsAPI(teamsMessage);

    return {
      stakeholder_team_id: stakeholder.team_id,
      channel: 'teams',
      message_id: response.id,
      sent_at: new Date(),
      delivery_status: 'sent'
    };
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    stakeholder: Stakeholder,
    message: any,
    notificationId: string
  ): Promise<SentNotification> {
    // In a real implementation, this would use SES or another email service
    // For now, we'll simulate the email sending
    const emailData = {
      to: stakeholder.contact_info,
      subject: message.title,
      body: this.buildEmailBody(message, notificationId),
      priority: stakeholder.priority
    };

    const response = await this.simulateEmailAPI(emailData);

    return {
      stakeholder_team_id: stakeholder.team_id,
      channel: 'email',
      message_id: response.messageId,
      sent_at: new Date(),
      delivery_status: 'sent'
    };
  }

  /**
   * Build notification message content
   */
  private buildNotificationMessage(stakeholder: Stakeholder, request: NotificationRequest): any {
    const analysis = request.impact_analysis;
    const riskLevel = analysis.risk_assessment.overall_risk_level;
    
    return {
      title: `🚨 Cross-Team Impact Alert: ${request.change_description}`,
      body: this.buildMessageBody(stakeholder, request),
      fields: [
        {
          title: 'Risk Level',
          value: riskLevel.toUpperCase(),
          short: true
        },
        {
          title: 'Affected Services',
          value: analysis.affected_services.length.toString(),
          short: true
        },
        {
          title: 'Your Team\'s Role',
          value: stakeholder.role,
          short: true
        },
        {
          title: 'Timeline',
          value: request.change_timeline,
          short: true
        },
        {
          title: 'Requester',
          value: `${request.requester.name} (${request.requester.team_id})`,
          short: false
        }
      ]
    };
  }

  /**
   * Build message body text
   */
  private buildMessageBody(stakeholder: Stakeholder, request: NotificationRequest): string {
    const analysis = request.impact_analysis;
    const teamServices = analysis.affected_services.filter(s => s.team_id === stakeholder.team_id);
    
    let body = `A planned change will impact services owned by your team.\n\n`;
    body += `**Change Description:** ${request.change_description}\n`;
    body += `**Timeline:** ${request.change_timeline}\n\n`;
    
    if (teamServices.length > 0) {
      body += `**Your Team's Affected Services:**\n`;
      teamServices.forEach(service => {
        body += `• ${service.service_name} (${service.criticality} impact)\n`;
      });
      body += `\n`;
    }

    body += `**Recommended Actions:**\n`;
    const relevantStrategies = analysis.mitigation_strategies
      .filter(s => s.responsible_teams.includes(stakeholder.team_id) || s.priority === 'high')
      .slice(0, 3);
    
    relevantStrategies.forEach(strategy => {
      body += `• ${strategy.description}\n`;
    });

    body += `\n**Next Steps:** Please review the impact analysis and coordinate with the requesting team.`;
    
    return body;
  }

  /**
   * Create Jira issue
   */
  private async createJiraIssue(issueData: any): Promise<CreatedIssue> {
    // In a real implementation, this would use the Jira REST API
    // For now, we'll simulate the API call
    const response = await this.simulateJiraAPI(issueData);

    return {
      issue_key: response.key,
      issue_url: `${this.jiraConfig!.baseUrl}/browse/${response.key}`,
      project_key: issueData.project,
      created_at: new Date(),
      assignees: issueData.assignee ? [issueData.assignee] : [],
      watchers: []
    };
  }

  /**
   * Build issue description for Jira
   */
  private buildIssueDescription(request: IssueCreationRequest): string {
    const analysis = request.impact_analysis;
    
    let description = `h2. Change Impact Analysis\n\n`;
    description += `*Change Description:* ${request.change_description}\n`;
    description += `*Requested by:* ${request.requester.name} (${request.requester.team_id})\n`;
    description += `*Risk Level:* ${analysis.risk_assessment.overall_risk_level.toUpperCase()}\n\n`;
    
    description += `h3. Impact Summary\n`;
    description += `* Affected Services: ${analysis.affected_services.length}\n`;
    description += `* Cross-team Impact: ${analysis.risk_assessment.cross_team_impact_count} teams\n`;
    description += `* Critical Services: ${analysis.risk_assessment.critical_path_services.length}\n\n`;
    
    description += `h3. Affected Services\n`;
    analysis.affected_services.slice(0, 10).forEach(service => {
      description += `* ${service.service_name} (${service.team_id}) - ${service.criticality} impact\n`;
    });
    
    if (analysis.affected_services.length > 10) {
      description += `* ... and ${analysis.affected_services.length - 10} more services\n`;
    }
    
    description += `\nh3. Risk Factors\n`;
    analysis.risk_assessment.risk_factors.forEach(factor => {
      description += `* *${factor.type}* (${factor.severity}): ${factor.description}\n`;
    });
    
    description += `\nh3. Mitigation Strategies\n`;
    analysis.mitigation_strategies.forEach((strategy, index) => {
      description += `h4. ${index + 1}. ${strategy.description}\n`;
      description += `*Priority:* ${strategy.priority}\n`;
      description += `*Estimated Effort:* ${strategy.estimated_effort}\n`;
      description += `*Action Items:*\n`;
      strategy.action_items.forEach(item => {
        description += `* ${item}\n`;
      });
      description += `\n`;
    });
    
    return description;
  }

  /**
   * Build team-specific issue description
   */
  private buildTeamSpecificDescription(request: IssueCreationRequest, stakeholder: Stakeholder): string {
    const analysis = request.impact_analysis;
    const teamServices = analysis.affected_services.filter(s => s.team_id === stakeholder.team_id);
    
    let description = `h2. Action Required: Impact on Your Team's Services\n\n`;
    description += `*Change Description:* ${request.change_description}\n`;
    description += `*Requested by:* ${request.requester.name} (${request.requester.team_id})\n\n`;
    
    description += `h3. Your Team's Affected Services\n`;
    teamServices.forEach(service => {
      description += `* *${service.service_name}*\n`;
      description += `  * Impact Level: ${service.criticality}\n`;
      description += `  * Impact Type: ${service.impact_type}\n`;
      description += `  * Dependency Path Depth: ${service.depth}\n\n`;
    });
    
    const teamStrategies = analysis.mitigation_strategies
      .filter(s => s.responsible_teams.includes(stakeholder.team_id));
    
    if (teamStrategies.length > 0) {
      description += `h3. Recommended Actions for Your Team\n`;
      teamStrategies.forEach(strategy => {
        description += `h4. ${strategy.description}\n`;
        description += `*Priority:* ${strategy.priority}\n`;
        description += `*Estimated Effort:* ${strategy.estimated_effort}\n`;
        description += `*Action Items:*\n`;
        strategy.action_items.forEach(item => {
          description += `* ${item}\n`;
        });
        description += `\n`;
      });
    }
    
    return description;
  }

  // Utility methods
  private generateNotificationId(): string {
    return `impact-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private getColorForPriority(priority: string): string {
    switch (priority) {
      case 'high': return '#FF6B6B';
      case 'medium': return '#FFD93D';
      case 'low': return '#6BCF7F';
      default: return '#95A5A6';
    }
  }

  private calculateEstimatedReach(
    sentNotifications: SentNotification[],
    _stakeholders: Stakeholder[]
  ): number {
    // Estimate based on average team size and notification channels
    const avgTeamSize = 5;
    const uniqueTeams = new Set(sentNotifications.map(n => n.stakeholder_team_id)).size;
    return uniqueTeams * avgTeamSize;
  }

  private mapIssueType(type: string): string {
    switch (type) {
      case 'coordination': return 'Epic';
      case 'approval': return 'Story';
      case 'risk_mitigation': return 'Task';
      default: return 'Task';
    }
  }

  private mapPriority(priority: string): string {
    switch (priority) {
      case 'critical': return 'Highest';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'Medium';
    }
  }

  private buildEmailBody(message: any, notificationId: string): string {
    let body = `${message.body}\n\n`;
    body += `Details:\n`;
    message.fields.forEach((field: any) => {
      body += `${field.title}: ${field.value}\n`;
    });
    body += `\nNotification ID: ${notificationId}\n`;
    return body;
  }

  // Simulation methods (replace with real API calls in production)
  private async simulateSlackAPI(_message: any): Promise<{ ts: string }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return { ts: Date.now().toString() };
  }

  private async simulateTeamsAPI(_message: any): Promise<{ id: string }> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { id: `teams-${Date.now()}` };
  }

  private async simulateEmailAPI(_emailData: any): Promise<{ messageId: string }> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { messageId: `email-${Date.now()}` };
  }

  private async simulateJiraAPI(issueData: any): Promise<{ key: string }> {
    await new Promise(resolve => setTimeout(resolve, 200));
    const projectKey = issueData.project;
    const issueNumber = Math.floor(Math.random() * 9999) + 1;
    return { key: `${projectKey}-${issueNumber}` };
  }
}