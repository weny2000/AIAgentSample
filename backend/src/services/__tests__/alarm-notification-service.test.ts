/**
 * Tests for Alarm Notification Service
 */

import { AlarmNotificationService, AlarmEvent } from '../alarm-notification-service';
import { Logger } from '../../lambda/utils/logger';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';

const snsMock = mockClient(SNSClient);
const sesMock = mockClient(SESClient);

// Mock fetch for Slack and Teams webhooks
global.fetch = jest.fn();

describe('AlarmNotificationService', () => {
  let service: AlarmNotificationService;
  let logger: Logger;

  const mockAlarmEvent: AlarmEvent = {
    alarmName: 'WorkTask-TestAlarm',
    alarmDescription: 'Test alarm description',
    newState: 'ALARM',
    oldState: 'OK',
    reason: 'Threshold exceeded',
    timestamp: '2025-01-10T12:00:00Z',
    severity: 'high',
    category: 'business',
    metricName: 'TestMetric',
    threshold: 100,
    currentValue: 150,
  };

  beforeEach(() => {
    snsMock.reset();
    sesMock.reset();
    (global.fetch as jest.Mock).mockReset();
    
    logger = new Logger();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
  });

  describe('constructor', () => {
    it('should create service with minimal config', () => {
      service = new AlarmNotificationService({}, logger);
      expect(service).toBeDefined();
    });

    it('should create service with full config', () => {
      service = new AlarmNotificationService({
        snsTopicArns: {
          critical: 'arn:aws:sns:us-east-1:123456789012:critical',
          high: 'arn:aws:sns:us-east-1:123456789012:high',
          medium: 'arn:aws:sns:us-east-1:123456789012:medium',
          low: 'arn:aws:sns:us-east-1:123456789012:low',
        },
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
        teamsWebhookUrl: 'https://outlook.office.com/webhook/test',
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com'],
        },
        region: 'us-west-2',
      }, logger);
      
      expect(service).toBeDefined();
    });
  });

  describe('sendAlarmNotification', () => {
    it('should send SNS notification when configured', async () => {
      snsMock.on(PublishCommand).resolves({});
      
      service = new AlarmNotificationService({
        snsTopicArns: {
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(true);
      expect(result.channels.sns).toBe(true);
      expect(snsMock.calls()).toHaveLength(1);
    });

    it('should send Slack notification when configured', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      service = new AlarmNotificationService({
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(true);
      expect(result.channels.slack).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should send Teams notification when configured', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      service = new AlarmNotificationService({
        teamsWebhookUrl: 'https://outlook.office.com/webhook/test',
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(true);
      expect(result.channels.teams).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://outlook.office.com/webhook/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should send Email notification when configured', async () => {
      sesMock.on(SendEmailCommand).resolves({});

      service = new AlarmNotificationService({
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com', 'oncall@example.com'],
        },
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(true);
      expect(result.channels.email).toBe(true);
      expect(sesMock.calls()).toHaveLength(1);
    });

    it('should send to all configured channels', async () => {
      snsMock.on(PublishCommand).resolves({});
      sesMock.on(SendEmailCommand).resolves({});
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      service = new AlarmNotificationService({
        snsTopicArns: {
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
        teamsWebhookUrl: 'https://outlook.office.com/webhook/test',
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com'],
        },
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(true);
      expect(result.channels.sns).toBe(true);
      expect(result.channels.slack).toBe(true);
      expect(result.channels.teams).toBe(true);
      expect(result.channels.email).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle SNS failures gracefully', async () => {
      snsMock.on(PublishCommand).rejects(new Error('SNS error'));

      service = new AlarmNotificationService({
        snsTopicArns: {
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('SNS: SNS error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle Slack failures gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
      });

      service = new AlarmNotificationService({
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle Teams failures gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      service = new AlarmNotificationService({
        teamsWebhookUrl: 'https://outlook.office.com/webhook/test',
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle Email failures gracefully', async () => {
      sesMock.on(SendEmailCommand).rejects(new Error('SES error'));

      service = new AlarmNotificationService({
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com'],
        },
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Email: SES error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should continue sending to other channels if one fails', async () => {
      snsMock.on(PublishCommand).rejects(new Error('SNS error'));
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      service = new AlarmNotificationService({
        snsTopicArns: {
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
      }, logger);

      const result = await service.sendAlarmNotification(mockAlarmEvent);

      expect(result.success).toBe(false);
      expect(result.channels.sns).toBeUndefined();
      expect(result.channels.slack).toBe(true);
      expect(result.errors).toContain('SNS: SNS error');
    });
  });

  describe('notification formatting', () => {
    it('should format critical alarm with correct color', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      service = new AlarmNotificationService({
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
      }, logger);

      const criticalEvent: AlarmEvent = {
        ...mockAlarmEvent,
        severity: 'critical',
      };

      await service.sendAlarmNotification(criticalEvent);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.attachments[0].color).toBe('#DC143C');
    });

    it('should format OK state with green color', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        statusText: 'OK',
      });

      service = new AlarmNotificationService({
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
      }, logger);

      const okEvent: AlarmEvent = {
        ...mockAlarmEvent,
        newState: 'OK',
        oldState: 'ALARM',
      };

      await service.sendAlarmNotification(okEvent);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.attachments[0].color).toBe('#6BCF7F');
    });

    it('should include all alarm details in SNS message', async () => {
      snsMock.on(PublishCommand).resolves({});

      service = new AlarmNotificationService({
        snsTopicArns: {
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
      }, logger);

      await service.sendAlarmNotification(mockAlarmEvent);

      const calls = snsMock.commandCalls(PublishCommand);
      const message = JSON.parse(calls[0].args[0].input.Message as string);
      
      expect(message).toMatchObject({
        AlarmName: 'WorkTask-TestAlarm',
        NewStateValue: 'ALARM',
        OldStateValue: 'OK',
        Severity: 'high',
        Category: 'business',
        MetricName: 'TestMetric',
        Threshold: 100,
        CurrentValue: 150,
      });
    });

    it('should include message attributes in SNS publish', async () => {
      snsMock.on(PublishCommand).resolves({});

      service = new AlarmNotificationService({
        snsTopicArns: {
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
      }, logger);

      await service.sendAlarmNotification(mockAlarmEvent);

      const calls = snsMock.commandCalls(PublishCommand);
      const attributes = calls[0].args[0].input.MessageAttributes;
      
      expect(attributes).toMatchObject({
        severity: {
          DataType: 'String',
          StringValue: 'high',
        },
        category: {
          DataType: 'String',
          StringValue: 'business',
        },
        alarmState: {
          DataType: 'String',
          StringValue: 'ALARM',
        },
      });
    });
  });

  describe('severity routing', () => {
    it('should route critical alarms to critical SNS topic', async () => {
      snsMock.on(PublishCommand).resolves({});

      service = new AlarmNotificationService({
        snsTopicArns: {
          critical: 'arn:aws:sns:us-east-1:123456789012:critical-alerts',
          high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
        },
      }, logger);

      const criticalEvent: AlarmEvent = {
        ...mockAlarmEvent,
        severity: 'critical',
      };

      await service.sendAlarmNotification(criticalEvent);

      const calls = snsMock.commandCalls(PublishCommand);
      expect(calls[0].args[0].input.TopicArn).toBe(
        'arn:aws:sns:us-east-1:123456789012:critical-alerts'
      );
    });

    it('should route medium alarms to medium SNS topic', async () => {
      snsMock.on(PublishCommand).resolves({});

      service = new AlarmNotificationService({
        snsTopicArns: {
          medium: 'arn:aws:sns:us-east-1:123456789012:medium-alerts',
        },
      }, logger);

      const mediumEvent: AlarmEvent = {
        ...mockAlarmEvent,
        severity: 'medium',
      };

      await service.sendAlarmNotification(mediumEvent);

      const calls = snsMock.commandCalls(PublishCommand);
      expect(calls[0].args[0].input.TopicArn).toBe(
        'arn:aws:sns:us-east-1:123456789012:medium-alerts'
      );
    });

    it('should skip SNS if no topic configured for severity', async () => {
      service = new AlarmNotificationService({
        snsTopicArns: {
          critical: 'arn:aws:sns:us-east-1:123456789012:critical-alerts',
        },
      }, logger);

      const lowEvent: AlarmEvent = {
        ...mockAlarmEvent,
        severity: 'low',
      };

      const result = await service.sendAlarmNotification(lowEvent);

      expect(snsMock.calls()).toHaveLength(0);
      expect(result.channels.sns).toBeUndefined();
    });
  });

  describe('email formatting', () => {
    it('should send both text and HTML email', async () => {
      sesMock.on(SendEmailCommand).resolves({});

      service = new AlarmNotificationService({
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com'],
        },
      }, logger);

      await service.sendAlarmNotification(mockAlarmEvent);

      const calls = sesMock.commandCalls(SendEmailCommand);
      const message = calls[0].args[0].input.Message;
      
      expect(message?.Body?.Text).toBeDefined();
      expect(message?.Body?.Html).toBeDefined();
    });

    it('should include alarm emoji in email subject', async () => {
      sesMock.on(SendEmailCommand).resolves({});

      service = new AlarmNotificationService({
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com'],
        },
      }, logger);

      await service.sendAlarmNotification(mockAlarmEvent);

      const calls = sesMock.commandCalls(SendEmailCommand);
      const subject = calls[0].args[0].input.Message?.Subject?.Data;
      
      expect(subject).toContain('🚨');
      expect(subject).toContain('[HIGH]');
      expect(subject).toContain('WorkTask-TestAlarm');
    });

    it('should send to multiple recipients', async () => {
      sesMock.on(SendEmailCommand).resolves({});

      service = new AlarmNotificationService({
        emailConfig: {
          fromAddress: 'alerts@example.com',
          toAddresses: ['team@example.com', 'oncall@example.com', 'manager@example.com'],
        },
      }, logger);

      await service.sendAlarmNotification(mockAlarmEvent);

      const calls = sesMock.commandCalls(SendEmailCommand);
      const toAddresses = calls[0].args[0].input.Destination?.ToAddresses;
      
      expect(toAddresses).toHaveLength(3);
      expect(toAddresses).toContain('team@example.com');
      expect(toAddresses).toContain('oncall@example.com');
      expect(toAddresses).toContain('manager@example.com');
    });
  });
});