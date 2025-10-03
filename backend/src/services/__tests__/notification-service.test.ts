import { NotificationService } from '../notification-service';
import { logger } from '../../utils/logger';
import axios from 'axios';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('axios');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService();
  });

  describe('sendSlackNotification', () => {
    it('should send Slack notification successfully', async () => {
      const mockResponse = {
        data: { ok: true, ts: '1234567890.123456' },
        status: 200,
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const notification = {
        channel: '#general',
        message: 'Test notification',
        severity: 'medium' as const,
        metadata: {
          service_id: 'test-service',
          change_type: 'deployment',
        },
      };

      const result = await service.sendSlackNotification(notification);

      expect(result.success).toBe(true);
      expect(result.message_id).toBe('1234567890.123456');
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('slack.com/api/chat.postMessage'),
        expect.objectContaining({
          channel: '#general',
          text: 'Test notification',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer'),
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle Slack API errors', async () => {
      mockAxios.post.mockRejectedValue(new Error('Slack API error'));

      const notification = {
        channel: '#general',
        message: 'Test notification',
        severity: 'high' as const,
        metadata: {},
      };

      const result = await service.sendSlackNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Slack API error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should format high severity messages correctly', async () => {
      const mockResponse = {
        data: { ok: true, ts: '1234567890.123456' },
        status: 200,
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const notification = {
        channel: '#alerts',
        message: 'Critical issue detected',
        severity: 'critical' as const,
        metadata: {
          service_id: 'critical-service',
          affected_users: 1000,
        },
      };

      await service.sendSlackNotification(notification);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining('🚨'),
        }),
        expect.any(Object)
      );
    });
  });

  describe('sendTeamsNotification', () => {
    it('should send Teams notification successfully', async () => {
      const mockResponse = {
        data: { id: 'teams-message-123' },
        status: 200,
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const notification = {
        channel: 'team-channel',
        message: 'Teams test notification',
        severity: 'low' as const,
        metadata: {
          service_id: 'test-service',
        },
      };

      const result = await service.sendTeamsNotification(notification);

      expect(result.success).toBe(true);
      expect(result.message_id).toBe('teams-message-123');
      expect(mockAxios.post).toHaveBeenCalled();
    });

    it('should handle Teams API errors', async () => {
      mockAxios.post.mockRejectedValue(new Error('Teams API error'));

      const notification = {
        channel: 'team-channel',
        message: 'Test notification',
        severity: 'medium' as const,
        metadata: {},
      };

      const result = await service.sendTeamsNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Teams API error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('sendEmailNotification', () => {
    it('should send email notification successfully', async () => {
      const mockResponse = {
        data: { MessageId: 'email-123' },
        status: 200,
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const notification = {
        to: ['user@example.com'],
        subject: 'Test Email',
        message: 'Email test notification',
        severity: 'medium' as const,
        metadata: {
          service_id: 'test-service',
        },
      };

      const result = await service.sendEmailNotification(notification);

      expect(result.success).toBe(true);
      expect(result.message_id).toBe('email-123');
    });

    it('should handle email service errors', async () => {
      mockAxios.post.mockRejectedValue(new Error('Email service error'));

      const notification = {
        to: ['user@example.com'],
        subject: 'Test Email',
        message: 'Test notification',
        severity: 'high' as const,
        metadata: {},
      };

      const result = await service.sendEmailNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email service error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createJiraTicket', () => {
    it('should create Jira ticket successfully', async () => {
      const mockResponse = {
        data: { key: 'PROJ-123', id: '10001' },
        status: 201,
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const ticketData = {
        project: 'PROJ',
        summary: 'Test Issue',
        description: 'Test issue description',
        priority: 'Medium',
        assignee: 'user@example.com',
        metadata: {
          service_id: 'test-service',
          severity: 'medium',
        },
      };

      const result = await service.createJiraTicket(ticketData);

      expect(result.success).toBe(true);
      expect(result.ticket_id).toBe('PROJ-123');
      expect(result.ticket_url).toContain('PROJ-123');
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/2/issue'),
        expect.objectContaining({
          fields: expect.objectContaining({
            project: { key: 'PROJ' },
            summary: 'Test Issue',
            description: 'Test issue description',
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle Jira API errors', async () => {
      mockAxios.post.mockRejectedValue(new Error('Jira API error'));

      const ticketData = {
        project: 'PROJ',
        summary: 'Test Issue',
        description: 'Test description',
        priority: 'High',
        assignee: 'user@example.com',
        metadata: {},
      };

      const result = await service.createJiraTicket(ticketData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Jira API error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('formatMessage', () => {
    it('should format messages with metadata correctly', () => {
      const message = 'Service deployment detected';
      const metadata = {
        service_id: 'user-service',
        team_id: 'backend-team',
        change_type: 'deployment',
      };

      const formatted = service.formatMessage(message, metadata);

      expect(formatted).toContain('Service deployment detected');
      expect(formatted).toContain('Service: user-service');
      expect(formatted).toContain('Team: backend-team');
      expect(formatted).toContain('Change Type: deployment');
    });

    it('should handle empty metadata', () => {
      const message = 'Simple notification';
      const metadata = {};

      const formatted = service.formatMessage(message, metadata);

      expect(formatted).toBe('Simple notification');
    });

    it('should format severity indicators correctly', () => {
      const message = 'Critical alert';
      const metadata = { severity: 'critical' };

      const formatted = service.formatMessage(message, metadata, 'critical');

      expect(formatted).toContain('🚨');
      expect(formatted).toContain('CRITICAL');
    });
  });
});