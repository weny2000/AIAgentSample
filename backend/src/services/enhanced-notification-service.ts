import { ImpactAnalysisResult, Stakeholder } from './impact-analysis-service.js';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { NotificationRequest, NotificationResult, SentNotification, FailedNotification, RetryStatus, IssueCreationRequest, CreatedIssue } from './notification-service.js';

export interface NotificationPreferences {
  user_id: string;
  team_id: string;
  channels: ('slack' | 'teams' | 'email')[];
  severity_thresholds: {
    low: boolean;
    medium: boolean;
    high: boolean;
    critical: boolean;
  };
  quiet_hours?: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
    timezone: string;
  };
  escalation_delay_minutes: number;
}

export interface NotificationDeliveryStatus {
  notification_id: string;
  stakeholder_team_id: string;
  channel: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  last_attempt_at?: Date;
  next_retry_at?: Date;
  error_message?: string;
  delivered_at?: Date;
}

export interface NotificationTemplate {
  template_id: string;
  name: string;
  channel: 'slack' | 'teams' | 'email' | 'jira';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subject_template: string;
  body_template: string;
  variables: string[];
}

/**
 * Enhanced notification service with retry logic, status tracking, and user preferences
 */
export class EnhancedNotificationService {
  private dynamoClient: DynamoDBClient;
  private sqsClient: SQSClient;
  private secretsClient: SecretsManagerClient;
  private notificationTableName: string;
  private preferencesTableName: string;
  private retryQueueUrl: string;

  constructor(config: {
    notificationTableName: string;
    preferencesTableName: string;
    retryQueueUrl: string;
    region?: string;
  }) {
    this.dynamoClient = new DynamoDBClient({ region: config.region || process.env.AWS_REGION });
    this.sqsClient = new SQSClient({ region: config.region || process.env.AWS_REGION });
    this.secretsClient = new SecretsManagerClient({ region: config.region || process.env.AWS_REGION });
    
    this.notificationTableName = config.notificationTableName;
    this.preferencesTableName = config.preferencesTableName;
    this.retryQueueUrl = config.retryQueueUrl;
  }

  /**
   * Send notifications with retry logic and status tracking
   */
  async sendNotificationsWithRetry(request: NotificationRequest): Promise<NotificationResult> {
    const notificationId = this.generateNotificationId();
    const sentNotifications: SentNotification[] = [];
    const failedNotifications: FailedNotification[] = [];

    // Get user preferences for each stakeholder
    const stakeholderPreferences = await this.getStakeholderPreferences(
      request.impact_analysis.stakeholders.map(s => s.team_id)
    );

    // Filter stakeholders based on severity preferences
    const filteredStakeholders = this.filterStakeholdersBySeverity(
      request.impact_analysis.stakeholders,
      request.urgency,
      stakeholderPreferences
    );

    // Send notifications with retry logic
    for (const stakeholder of filteredStakeholders) {
      const preferences = stakeholderPreferences.get(stakeholder.team_id);
      const channels = this.determineChannelsWithPreferences(stakeholder, request.urgency, preferences);

      for (const channel of channels) {
        try {
          // Check quiet hours
          if (preferences && this.isInQuietHours(preferences)) {
            // Schedule for later delivery
            await this.scheduleDelayedNotification(notificationId, stakeholder, channel, request);
            continue;
          }

          const result = await this.sendNotificationWithTracking(
            notificationId,
            stakeholder,
            channel,
            request
          );
          
          sentNotifications.push(result);
        } catch (error) {
          const failedNotification: FailedNotification = {
            stakeholder_team_id: stakeholder.team_id,
            channel,
            error_message: error instanceof Error ? error.message : 'Unknown error',
            retry_count: 0
          };
          
          failedNotifications.push(failedNotification);
          
          // Schedule retry
          await this.scheduleRetry(notificationId, stakeholder, channel, request, error);
        }
      }
    }

    // Store notification result
    await this.storeNotificationResult(notificationId, {
      notification_id: notificationId,
      sent_notifications: sentNotifications,
      failed_notifications: failedNotifications,
      summary: {
        total_stakeholders: filteredStakeholders.length,
        notifications_sent: sentNotifications.length,
        notifications_failed: failedNotifications.length,
        channels_used: [...new Set(sentNotifications.map(n => n.channel))],
        estimated_reach: this.calculateEstimatedReach(sentNotifications, filteredStakeholders)
      }
    });

    return {
      notification_id: notificationId,
      sent_notifications: sentNotifications,
      failed_notifications: failedNotifications,
      summary: {
        total_stakeholders: filteredStakeholders.length,
        notifications_sent: sentNotifications.length,
        notifications_failed: failedNotifications.length,
        channels_used: [...new Set(sentNotifications.map(n => n.channel))],
        estimated_reach: this.calculateEstimatedReach(sentNotifications, filteredStakeholders)
      }
    };
  }

  /**
   * Create Jira issues with user approval workflow
   */
  async createIssuesWithApproval(request: IssueCreationRequest, requireApproval: boolean = true): Promise<CreatedIssue[]> {
    if (requireApproval) {
      // Send approval request to user
      await this.sendApprovalRequest(request);
      
      // In a real implementation, this would wait for user approval
      // For now, we'll simulate approval after a delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get Jira configuration from secrets
    const jiraConfig = await this.getJiraConfiguration();
    
    const createdIssues: CreatedIssue[] = [];
    
    try {
      // Create main coordination issue
      const mainIssue = await this.createJiraIssueWithRetry({
        project: jiraConfig.defaultProject,
        issueType: this.mapIssueType(request.issue_type),
        summary: `Cross-team Impact: ${request.change_description}`,
        description: this.buildDetailedIssueDescription(request),
        priority: this.mapPriority(request.priority),
        labels: ['cross-team-impact', `risk-${request.impact_analysis.risk_assessment.overall_risk_level}`, 'auto-generated'],
        assignee: request.requester.user_id,
        components: request.affected_teams.map(team => ({ name: team }))
      });

      createdIssues.push(mainIssue);

      // Create team-specific issues for high-priority stakeholders
      const highPriorityStakeholders = request.impact_analysis.stakeholders
        .filter(s => s.priority === 'high');

      for (const stakeholder of highPriorityStakeholders) {
        try {
          const teamIssue = await this.createJiraIssueWithRetry({
            project: jiraConfig.defaultProject,
            issueType: 'Task',
            summary: `Action Required: Impact on ${stakeholder.team_id} services`,
            description: this.buildTeamSpecificDescription(request, stakeholder),
            priority: this.mapPriority(request.priority),
            labels: ['team-action-required', `team-${stakeholder.team_id}`, 'auto-generated'],
            assignee: null,
            parent: mainIssue.issue_key
          });

          createdIssues.push(teamIssue);
        } catch (error) {
          console.warn(`Failed to create team issue for ${stakeholder.team_id}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      // Store issue creation record
      await this.storeIssueCreationRecord(request, createdIssues);

    } catch (error) {
      console.error('Failed to create issues:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }

    return createdIssues;
  }

  /**
   * Get notification delivery status
   */
  async getNotificationStatus(notificationId: string): Promise<NotificationDeliveryStatus[]> {
    try {
      const command = new QueryCommand({
        TableName: this.notificationTableName,
        KeyConditionExpression: 'notification_id = :notificationId',
        ExpressionAttributeValues: {
          ':notificationId': { S: notificationId }
        }
      });

      const result = await this.dynamoClient.send(command);
      
      return (result.Items || []).map(item => ({
        notification_id: item.notification_id?.S || '',
        stakeholder_team_id: item.stakeholder_team_id?.S || '',
        channel: item.channel?.S || '',
        status: (item.status?.S || 'pending') as 'pending' | 'sent' | 'delivered' | 'failed' | 'retrying',
        attempts: parseInt(item.attempts?.N || '0'),
        last_attempt_at: item.last_attempt_at?.S ? new Date(item.last_attempt_at.S) : undefined,
        next_retry_at: item.next_retry_at?.S ? new Date(item.next_retry_at.S) : undefined,
        error_message: item.error_message?.S,
        delivered_at: item.delivered_at?.S ? new Date(item.delivered_at.S) : undefined
      }));
    } catch (error) {
      console.error('Failed to get notification status:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Update notification preferences for a user/team
   */
  async updateNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
    try {
      const command = new PutItemCommand({
        TableName: this.preferencesTableName,
        Item: {
          user_id: { S: preferences.user_id },
          team_id: { S: preferences.team_id },
          channels: { SS: preferences.channels },
          severity_thresholds: { S: JSON.stringify(preferences.severity_thresholds) },
          quiet_hours: { S: JSON.stringify(preferences.quiet_hours) },
          escalation_delay_minutes: { N: preferences.escalation_delay_minutes.toString() },
          updated_at: { S: new Date().toISOString() }
        }
      });

      await this.dynamoClient.send(command);
    } catch (error) {
      console.error('Failed to update notification preferences:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Private helper methods

  private generateNotificationId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private async getStakeholderPreferences(teamIds: string[]): Promise<Map<string, NotificationPreferences>> {
    const preferences = new Map<string, NotificationPreferences>();
    
    for (const teamId of teamIds) {
      try {
        const command = new GetItemCommand({
          TableName: this.preferencesTableName,
          Key: {
            team_id: { S: teamId }
          }
        });

        const result = await this.dynamoClient.send(command);
        
        if (result.Item) {
          preferences.set(teamId, {
            user_id: result.Item.user_id?.S || '',
            team_id: teamId,
            channels: (result.Item.channels?.SS || ['slack']) as ('slack' | 'teams' | 'email')[],
            severity_thresholds: JSON.parse(result.Item.severity_thresholds?.S || '{"low":false,"medium":true,"high":true,"critical":true}'),
            quiet_hours: result.Item.quiet_hours?.S ? JSON.parse(result.Item.quiet_hours.S) : undefined,
            escalation_delay_minutes: parseInt(result.Item.escalation_delay_minutes?.N || '30')
          });
        }
      } catch (error) {
        console.warn(`Failed to get preferences for team ${teamId}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return preferences;
  }

  private filterStakeholdersBySeverity(
    stakeholders: Stakeholder[],
    urgency: string,
    preferences: Map<string, NotificationPreferences>
  ): Stakeholder[] {
    return stakeholders.filter(stakeholder => {
      const prefs = preferences.get(stakeholder.team_id);
      if (!prefs) return true; // Default to sending if no preferences

      return prefs.severity_thresholds[urgency as keyof typeof prefs.severity_thresholds];
    });
  }

  private determineChannelsWithPreferences(
    stakeholder: Stakeholder,
    urgency: string,
    preferences?: NotificationPreferences
  ): ('slack' | 'teams' | 'email')[] {
    if (preferences) {
      return preferences.channels;
    }

    // Fallback to default logic
    if (urgency === 'critical' || stakeholder.priority === 'high') {
      return ['slack', 'email'];
    } else if (urgency === 'high' || stakeholder.priority === 'medium') {
      return ['slack'];
    } else {
      return ['email'];
    }
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quiet_hours) return false;

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: preferences.quiet_hours.timezone 
    }).substring(0, 5);

    return currentTime >= preferences.quiet_hours.start && currentTime <= preferences.quiet_hours.end;
  }

  private async sendNotificationWithTracking(
    notificationId: string,
    stakeholder: Stakeholder,
    channel: 'slack' | 'teams' | 'email',
    request: NotificationRequest
  ): Promise<SentNotification> {
    // Store initial tracking record
    await this.storeNotificationStatus({
      notification_id: notificationId,
      stakeholder_team_id: stakeholder.team_id,
      channel,
      status: 'pending',
      attempts: 1,
      last_attempt_at: new Date()
    });

    try {
      // Send the actual notification (implementation would depend on channel)
      const messageId = await this.sendNotificationToChannel(stakeholder, channel, request);

      // Update status to sent
      await this.updateNotificationStatus(notificationId, stakeholder.team_id, channel, {
        status: 'sent',
        delivered_at: new Date()
      });

      return {
        stakeholder_team_id: stakeholder.team_id,
        channel,
        message_id: messageId,
        sent_at: new Date(),
        delivery_status: 'sent',
        retry_status: {
          total_retries: 0,
          successful_retries: 1,
          failed_retries: 0
        }
      };
    } catch (error) {
      // Update status to failed
      await this.updateNotificationStatus(notificationId, stakeholder.team_id, channel, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  private async sendNotificationToChannel(
    stakeholder: Stakeholder,
    channel: 'slack' | 'teams' | 'email',
    request: NotificationRequest
  ): Promise<string> {
    // This would contain the actual implementation for each channel
    // For now, we'll simulate the API calls
    
    switch (channel) {
      case 'slack':
        return await this.sendSlackNotification(stakeholder, request);
      case 'teams':
        return await this.sendTeamsNotification(stakeholder, request);
      case 'email':
        return await this.sendEmailNotification(stakeholder, request);
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  private async sendSlackNotification(stakeholder: Stakeholder, request: NotificationRequest): Promise<string> {
    // Simulate Slack API call
    await new Promise(resolve => setTimeout(resolve, 100));
    return `slack-${Date.now()}`;
  }

  private async sendTeamsNotification(stakeholder: Stakeholder, request: NotificationRequest): Promise<string> {
    // Simulate Teams API call
    await new Promise(resolve => setTimeout(resolve, 100));
    return `teams-${Date.now()}`;
  }

  private async sendEmailNotification(stakeholder: Stakeholder, request: NotificationRequest): Promise<string> {
    // Simulate email API call
    await new Promise(resolve => setTimeout(resolve, 100));
    return `email-${Date.now()}`;
  }

  private async scheduleDelayedNotification(
    notificationId: string,
    stakeholder: Stakeholder,
    channel: string,
    request: NotificationRequest
  ): Promise<void> {
    // Schedule notification for later delivery using SQS
    const delaySeconds = 3600; // 1 hour delay for quiet hours
    
    const command = new SendMessageCommand({
      QueueUrl: this.retryQueueUrl,
      MessageBody: JSON.stringify({
        notification_id: notificationId,
        stakeholder,
        channel,
        request,
        retry_count: 0,
        reason: 'quiet_hours'
      }),
      DelaySeconds: delaySeconds
    });

    await this.sqsClient.send(command);
  }

  private async scheduleRetry(
    notificationId: string,
    stakeholder: Stakeholder,
    channel: string,
    request: NotificationRequest,
    error: unknown
  ): Promise<void> {
    const retryCount = 1; // This would be tracked in the database
    const delaySeconds = Math.min(300, Math.pow(2, retryCount) * 30); // Exponential backoff, max 5 minutes

    const command = new SendMessageCommand({
      QueueUrl: this.retryQueueUrl,
      MessageBody: JSON.stringify({
        notification_id: notificationId,
        stakeholder,
        channel,
        request,
        retry_count: retryCount,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      }),
      DelaySeconds: delaySeconds
    });

    await this.sqsClient.send(command);
  }

  private async storeNotificationStatus(status: NotificationDeliveryStatus): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.notificationTableName,
      Item: {
        notification_id: { S: status.notification_id },
        stakeholder_team_id: { S: status.stakeholder_team_id },
        channel: { S: status.channel },
        status: { S: status.status },
        attempts: { N: status.attempts.toString() },
        last_attempt_at: { S: (status.last_attempt_at || new Date()).toISOString() },
        next_retry_at: status.next_retry_at ? { S: status.next_retry_at.toISOString() } : undefined,
        error_message: status.error_message ? { S: status.error_message } : undefined,
        delivered_at: status.delivered_at ? { S: status.delivered_at.toISOString() } : undefined,
        created_at: { S: new Date().toISOString() }
      }
    });

    await this.dynamoClient.send(command);
  }

  private async updateNotificationStatus(
    notificationId: string,
    stakeholderTeamId: string,
    channel: string,
    updates: Partial<NotificationDeliveryStatus>
  ): Promise<void> {
    const updateExpressions: string[] = [];
    const expressionAttributeValues: Record<string, any> = {};
    const expressionAttributeNames: Record<string, string> = {};

    if (updates.status) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = { S: updates.status };
    }

    if (updates.error_message) {
      updateExpressions.push('error_message = :error_message');
      expressionAttributeValues[':error_message'] = { S: updates.error_message };
    }

    if (updates.delivered_at) {
      updateExpressions.push('delivered_at = :delivered_at');
      expressionAttributeValues[':delivered_at'] = { S: updates.delivered_at.toISOString() };
    }

    updateExpressions.push('updated_at = :updated_at');
    expressionAttributeValues[':updated_at'] = { S: new Date().toISOString() };

    const command = new UpdateItemCommand({
      TableName: this.notificationTableName,
      Key: {
        notification_id: { S: notificationId },
        stakeholder_team_id: { S: `${stakeholderTeamId}#${channel}` }
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined
    });

    await this.dynamoClient.send(command);
  }

  private async storeNotificationResult(notificationId: string, result: NotificationResult): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.notificationTableName,
      Item: {
        notification_id: { S: notificationId },
        stakeholder_team_id: { S: 'SUMMARY' },
        result_data: { S: JSON.stringify(result) },
        created_at: { S: new Date().toISOString() }
      }
    });

    await this.dynamoClient.send(command);
  }

  private async sendApprovalRequest(request: IssueCreationRequest): Promise<void> {
    // Send approval request to the requester
    // This could be via Slack, Teams, or email
    console.log(`Sending approval request to ${request.requester.user_id} for issue creation`);
    
    // In a real implementation, this would send an interactive message
    // with approve/deny buttons
  }

  private async getJiraConfiguration(): Promise<any> {
    try {
      const command = new GetSecretValueCommand({
        SecretId: 'jira-configuration'
      });

      const result = await this.secretsClient.send(command);
      return JSON.parse(result.SecretString || '{}');
    } catch (error) {
      console.error('Failed to get Jira configuration:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Jira configuration not available');
    }
  }

  private async createJiraIssueWithRetry(issueData: any): Promise<CreatedIssue> {
    // Implement Jira issue creation with retry logic
    // This would use the Jira REST API
    
    // For now, simulate the API call
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const issueKey = `${issueData.project}-${Math.floor(Math.random() * 9999) + 1}`;
    
    return {
      issue_key: issueKey,
      issue_url: `https://company.atlassian.net/browse/${issueKey}`,
      project_key: issueData.project,
      created_at: new Date(),
      assignees: issueData.assignee ? [issueData.assignee] : [],
      watchers: []
    };
  }

  private buildDetailedIssueDescription(request: IssueCreationRequest): string {
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

  private async storeIssueCreationRecord(request: IssueCreationRequest, createdIssues: CreatedIssue[]): Promise<void> {
    // Store record of created issues for audit purposes
    const command = new PutItemCommand({
      TableName: this.notificationTableName,
      Item: {
        notification_id: { S: `issue-${Date.now()}` },
        stakeholder_team_id: { S: 'ISSUE_CREATION' },
        request_data: { S: JSON.stringify(request) },
        created_issues: { S: JSON.stringify(createdIssues) },
        created_at: { S: new Date().toISOString() }
      }
    });

    await this.dynamoClient.send(command);
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

  private calculateEstimatedReach(sentNotifications: SentNotification[], stakeholders: Stakeholder[]): number {
    const avgTeamSize = 5;
    const uniqueTeams = new Set(sentNotifications.map(n => n.stakeholder_team_id)).size;
    return uniqueTeams * avgTeamSize;
  }
}