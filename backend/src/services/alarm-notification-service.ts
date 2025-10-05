/**
 * Alarm Notification Service
 * Handles notifications for CloudWatch alarms via SNS, Slack, Teams, and Email
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Logger } from '../lambda/utils/logger';

export interface AlarmNotificationConfig {
  snsTopicArns?: {
    critical?: string;
    high?: string;
    medium?: string;
    low?: string;
  };
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  emailConfig?: {
    fromAddress: string;
    toAddresses: string[];
  };
  region?: string;
}

export interface AlarmEvent {
  alarmName: string;
  alarmDescription: string;
  newState: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  oldState: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  reason: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'business' | 'performance' | 'system' | 'data_quality';
  metricName?: string;
  threshold?: number;
  currentValue?: number;
}

export interface NotificationResult {
  success: boolean;
  channels: {
    sns?: boolean;
    slack?: boolean;
    teams?: boolean;
    email?: boolean;
  };
  errors: string[];
}

export class AlarmNotificationService {
  private snsClient: SNSClient;
  private sesClient: SESClient;
  private config: AlarmNotificationConfig;
  private logger: Logger;

  constructor(config: AlarmNotificationConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger({ context: 'AlarmNotificationService' });
    
    this.snsClient = new SNSClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    
    this.sesClient = new SESClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Send alarm notification via all configured channels
   */
  async sendAlarmNotification(event: AlarmEvent): Promise<NotificationResult> {
    const result: NotificationResult = {
      success: true,
      channels: {},
      errors: [],
    };

    this.logger.info('Sending alarm notification', {
      alarmName: event.alarmName,
      severity: event.severity,
      newState: event.newState,
    });

    // Send SNS notification
    if (this.config.snsTopicArns) {
      try {
        await this.sendSNSNotification(event);
        result.channels.sns = true;
      } catch (error) {
        result.success = false;
        result.errors.push(`SNS: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.logger.error('Failed to send SNS notification', error as Error);
      }
    }

    // Send Slack notification
    if (this.config.slackWebhookUrl) {
      try {
        await this.sendSlackNotification(event);
        result.channels.slack = true;
      } catch (error) {
        result.success = false;
        result.errors.push(`Slack: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.logger.error('Failed to send Slack notification', error as Error);
      }
    }

    // Send Teams notification
    if (this.config.teamsWebhookUrl) {
      try {
        await this.sendTeamsNotification(event);
        result.channels.teams = true;
      } catch (error) {
        result.success = false;
        result.errors.push(`Teams: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.logger.error('Failed to send Teams notification', error as Error);
      }
    }

    // Send Email notification
    if (this.config.emailConfig) {
      try {
        await this.sendEmailNotification(event);
        result.channels.email = true;
      } catch (error) {
        result.success = false;
        result.errors.push(`Email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.logger.error('Failed to send Email notification', error as Error);
      }
    }

    this.logger.info('Alarm notification sent', {
      alarmName: event.alarmName,
      success: result.success,
      channels: result.channels,
    });

    return result;
  }

  /**
   * Send notification via SNS
   */
  private async sendSNSNotification(event: AlarmEvent): Promise<void> {
    const topicArn = this.getSNSTopicForSeverity(event.severity);
    
    if (!topicArn) {
      this.logger.debug('No SNS topic configured for severity', { severity: event.severity });
      return;
    }

    const message = this.buildSNSMessage(event);
    const subject = this.buildSubject(event);

    await this.snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: subject,
        Message: JSON.stringify(message),
        MessageAttributes: {
          severity: {
            DataType: 'String',
            StringValue: event.severity,
          },
          category: {
            DataType: 'String',
            StringValue: event.category,
          },
          alarmState: {
            DataType: 'String',
            StringValue: event.newState,
          },
        },
      })
    );

    this.logger.info('SNS notification sent', {
      topicArn,
      alarmName: event.alarmName,
    });
  }

  /**
   * Send notification via Slack
   */
  private async sendSlackNotification(event: AlarmEvent): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      return;
    }

    const color = this.getColorForState(event.newState, event.severity);
    const emoji = this.getEmojiForState(event.newState);

    const payload = {
      username: 'Work Task Monitoring',
      icon_emoji: emoji,
      attachments: [
        {
          color,
          title: `${event.alarmName}`,
          text: event.alarmDescription,
          fields: [
            {
              title: 'State',
              value: `${event.oldState} → ${event.newState}`,
              short: true,
            },
            {
              title: 'Severity',
              value: event.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Category',
              value: event.category,
              short: true,
            },
            {
              title: 'Timestamp',
              value: event.timestamp,
              short: true,
            },
            {
              title: 'Reason',
              value: event.reason,
              short: false,
            },
          ],
          footer: 'Work Task Monitoring System',
          ts: Math.floor(new Date(event.timestamp).getTime() / 1000),
        },
      ],
    };

    const response = await fetch(this.config.slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }

    this.logger.info('Slack notification sent', {
      alarmName: event.alarmName,
    });
  }

  /**
   * Send notification via Microsoft Teams
   */
  private async sendTeamsNotification(event: AlarmEvent): Promise<void> {
    if (!this.config.teamsWebhookUrl) {
      return;
    }

    const color = this.getColorForState(event.newState, event.severity);

    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `${event.alarmName}: ${event.newState}`,
      themeColor: color.replace('#', ''),
      sections: [
        {
          activityTitle: event.alarmName,
          activitySubtitle: event.alarmDescription,
          facts: [
            {
              name: 'State Change',
              value: `${event.oldState} → ${event.newState}`,
            },
            {
              name: 'Severity',
              value: event.severity.toUpperCase(),
            },
            {
              name: 'Category',
              value: event.category,
            },
            {
              name: 'Timestamp',
              value: event.timestamp,
            },
            {
              name: 'Reason',
              value: event.reason,
            },
          ],
        },
      ],
    };

    const response = await fetch(this.config.teamsWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Teams webhook failed: ${response.statusText}`);
    }

    this.logger.info('Teams notification sent', {
      alarmName: event.alarmName,
    });
  }

  /**
   * Send notification via Email (SES)
   */
  private async sendEmailNotification(event: AlarmEvent): Promise<void> {
    if (!this.config.emailConfig) {
      return;
    }

    const subject = this.buildSubject(event);
    const body = this.buildEmailBody(event);

    await this.sesClient.send(
      new SendEmailCommand({
        Source: this.config.emailConfig.fromAddress,
        Destination: {
          ToAddresses: this.config.emailConfig.toAddresses,
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: body,
              Charset: 'UTF-8',
            },
            Html: {
              Data: this.buildEmailBodyHTML(event),
              Charset: 'UTF-8',
            },
          },
        },
      })
    );

    this.logger.info('Email notification sent', {
      alarmName: event.alarmName,
      recipients: this.config.emailConfig.toAddresses.length,
    });
  }

  /**
   * Get SNS topic ARN for severity level
   */
  private getSNSTopicForSeverity(severity: string): string | undefined {
    if (!this.config.snsTopicArns) {
      return undefined;
    }

    return this.config.snsTopicArns[severity as keyof typeof this.config.snsTopicArns];
  }

  /**
   * Build SNS message
   */
  private buildSNSMessage(event: AlarmEvent): any {
    return {
      AlarmName: event.alarmName,
      AlarmDescription: event.alarmDescription,
      NewStateValue: event.newState,
      OldStateValue: event.oldState,
      NewStateReason: event.reason,
      StateChangeTime: event.timestamp,
      Severity: event.severity,
      Category: event.category,
      MetricName: event.metricName,
      Threshold: event.threshold,
      CurrentValue: event.currentValue,
    };
  }

  /**
   * Build email subject
   */
  private buildSubject(event: AlarmEvent): string {
    const emoji = event.newState === 'ALARM' ? '🚨' : event.newState === 'OK' ? '✅' : '⚠️';
    return `${emoji} [${event.severity.toUpperCase()}] ${event.alarmName}: ${event.newState}`;
  }

  /**
   * Build email body (plain text)
   */
  private buildEmailBody(event: AlarmEvent): string {
    let body = `Work Task Monitoring Alert\n\n`;
    body += `Alarm: ${event.alarmName}\n`;
    body += `Description: ${event.alarmDescription}\n\n`;
    body += `State Change: ${event.oldState} → ${event.newState}\n`;
    body += `Severity: ${event.severity.toUpperCase()}\n`;
    body += `Category: ${event.category}\n`;
    body += `Timestamp: ${event.timestamp}\n\n`;
    body += `Reason: ${event.reason}\n\n`;

    if (event.metricName) {
      body += `Metric: ${event.metricName}\n`;
    }
    if (event.threshold !== undefined) {
      body += `Threshold: ${event.threshold}\n`;
    }
    if (event.currentValue !== undefined) {
      body += `Current Value: ${event.currentValue}\n`;
    }

    body += `\n---\n`;
    body += `This is an automated notification from the Work Task Monitoring System.\n`;

    return body;
  }

  /**
   * Build email body (HTML)
   */
  private buildEmailBodyHTML(event: AlarmEvent): string {
    const color = this.getColorForState(event.newState, event.severity);
    
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${color}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #555; }
    .value { color: #333; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${event.alarmName}</h2>
      <p>${event.alarmDescription}</p>
    </div>
    <div class="content">
      <div class="field">
        <span class="label">State Change:</span>
        <span class="value">${event.oldState} → ${event.newState}</span>
      </div>
      <div class="field">
        <span class="label">Severity:</span>
        <span class="value">${event.severity.toUpperCase()}</span>
      </div>
      <div class="field">
        <span class="label">Category:</span>
        <span class="value">${event.category}</span>
      </div>
      <div class="field">
        <span class="label">Timestamp:</span>
        <span class="value">${event.timestamp}</span>
      </div>
      <div class="field">
        <span class="label">Reason:</span>
        <span class="value">${event.reason}</span>
      </div>
      ${event.metricName ? `
      <div class="field">
        <span class="label">Metric:</span>
        <span class="value">${event.metricName}</span>
      </div>
      ` : ''}
      ${event.threshold !== undefined ? `
      <div class="field">
        <span class="label">Threshold:</span>
        <span class="value">${event.threshold}</span>
      </div>
      ` : ''}
      ${event.currentValue !== undefined ? `
      <div class="field">
        <span class="label">Current Value:</span>
        <span class="value">${event.currentValue}</span>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>This is an automated notification from the Work Task Monitoring System.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Get color for alarm state and severity
   */
  private getColorForState(state: string, severity: string): string {
    if (state === 'ALARM') {
      switch (severity) {
        case 'critical':
          return '#DC143C'; // Crimson
        case 'high':
          return '#FF6B6B'; // Red
        case 'medium':
          return '#FFD93D'; // Yellow
        case 'low':
          return '#FFA500'; // Orange
        default:
          return '#FF6B6B';
      }
    } else if (state === 'OK') {
      return '#6BCF7F'; // Green
    } else {
      return '#95A5A6'; // Gray
    }
  }

  /**
   * Get emoji for alarm state
   */
  private getEmojiForState(state: string): string {
    switch (state) {
      case 'ALARM':
        return ':rotating_light:';
      case 'OK':
        return ':white_check_mark:';
      case 'INSUFFICIENT_DATA':
        return ':warning:';
      default:
        return ':question:';
    }
  }
}
