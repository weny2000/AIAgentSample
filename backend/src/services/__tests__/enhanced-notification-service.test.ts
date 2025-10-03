import { EnhancedNotificationService, NotificationPreferences } from '../enhanced-notification-service';
import { NotificationRequest } from '../notification-service';
import { ImpactAnalysisResult, Stakeholder } from '../impact-analysis-service';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Items: [] })
  })),
  PutItemCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  GetItemCommand: jest.fn(),
  QueryCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  })),
  SendMessageCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        baseUrl: 'https://test.atlassian.net',
        username: 'test@example.com',
        apiToken: 'test-token',
        defaultProject: 'TEST'
      })
    })
  })),
  GetSecretValueCommand: jest.fn()
}));

describe('EnhancedNotificationService', () => {
  let service: EnhancedNotificationService;
  let mockStakeholder: Stakeholder;
  let mockImpactAnalysis: ImpactAnalysisResult;
  let mockNotificationRequest: NotificationRequest;

  beforeEach(() => {
    service = new EnhancedNotificationService({
      notificationTableName: 'test-notifications',
      preferencesTableName: 'test-preferences',
      retryQueueUrl: 'test-queue-url',
      region: 'us-east-1'
    });

    mockStakeholder = {
      team_id: 'test-team',
      team_name: 'Test Team',
      contact_info: ['test@example.com'],
      role: 'owner',
      priority: 'high',
      notification_preferences: ['slack']
    };

    mockImpactAnalysis = {
      service_id: 'test-service',
      service_name: 'Test Service',
      team_id: 'test-team',
      analysis_type: 'full',
      affected_services: [{
        service_id: 'test-service',
        service_name: 'Test Service',
        team_id: 'test-team',
        depth: 1,
        path: ['test-service'],
        criticality: 'high',
        impact_type: 'direct',
        dependency_types: ['api'],
        estimated_impact_score: 85
      }],
      risk_assessment: {
        overall_risk_level: 'high',
        risk_factors: [{
          type: 'critical_service',
          severity: 'high',
          description: 'Critical service dependency',
          affected_services: ['test-service']
        }],
        cross_team_impact_count: 2,
        critical_path_services: ['test-service'],
        business_impact_estimate: 'High - customer-facing service'
      },
      stakeholders: [mockStakeholder],
      mitigation_strategies: [{
        strategy_type: 'communication',
        priority: 'high',
        description: 'Coordinate with dependent teams',
        action_items: ['Send notifications', 'Schedule coordination meeting'],
        estimated_effort: '2 hours',
        responsible_teams: ['test-team']
      }],
      visualization_data: {
        nodes: [],
        edges: [],
        clusters: [],
        layout_hints: {}
      }
    };

    mockNotificationRequest = {
      impact_analysis: mockImpactAnalysis,
      change_description: 'Test change requiring coordination',
      change_timeline: '2024-01-15 10:00 AM',
      requester: {
        user_id: 'test-user',
        name: 'Test User',
        email: 'test-user@example.com',
        team_id: 'requester-team'
      },
      notification_type: 'impact_alert',
      urgency: 'high'
    };
  });

  describe('sendNotificationsWithRetry', () => {
    it('should send notifications successfully', async () => {
      const result = await service.sendNotificationsWithRetry(mockNotificationRequest);

      expect(result).toBeDefined();
      expect(result.notification_id).toBeDefined();
      expect(result.summary.total_stakeholders).toBe(1);
      expect(result.sent_notifications.length).toBeGreaterThan(0);
    });

    it('should handle failed notifications and schedule retries', async () => {
      // Mock a failure scenario
      const failingRequest = {
        ...mockNotificationRequest,
        impact_analysis: {
          ...mockImpactAnalysis,
          stakeholders: [{
            ...mockStakeholder,
            contact_info: ['invalid-email'] // This should cause a failure
          }]
        }
      };

      const result = await service.sendNotificationsWithRetry(failingRequest);

      expect(result).toBeDefined();
      expect(result.notification_id).toBeDefined();
      // Should handle failures gracefully
    });

    it('should respect user preferences for severity filtering', async () => {
      const preferences: NotificationPreferences = {
        user_id: 'test-user',
        team_id: 'test-team',
        channels: ['email'],
        severity_thresholds: {
          low: false,
          medium: false,
          high: true,
          critical: true
        },
        escalation_delay_minutes: 30
      };

      // Mock the preferences retrieval
      jest.spyOn(service as any, 'getStakeholderPreferences')
        .mockResolvedValue(new Map([['test-team', preferences]]));

      const result = await service.sendNotificationsWithRetry(mockNotificationRequest);

      expect(result).toBeDefined();
      expect(result.summary.total_stakeholders).toBe(1); // Should include high severity
    });

    it('should filter out stakeholders based on severity preferences', async () => {
      const preferences: NotificationPreferences = {
        user_id: 'test-user',
        team_id: 'test-team',
        channels: ['email'],
        severity_thresholds: {
          low: false,
          medium: false,
          high: false, // Should filter out high severity
          critical: true
        },
        escalation_delay_minutes: 30
      };

      // Mock the preferences retrieval
      jest.spyOn(service as any, 'getStakeholderPreferences')
        .mockResolvedValue(new Map([['test-team', preferences]]));

      const result = await service.sendNotificationsWithRetry(mockNotificationRequest);

      expect(result).toBeDefined();
      expect(result.summary.total_stakeholders).toBe(0); // Should filter out
    });
  });

  describe('createIssuesWithApproval', () => {
    it('should create issues without approval when not required', async () => {
      const issueRequest = {
        impact_analysis: mockImpactAnalysis,
        change_description: 'Test change requiring coordination',
        requester: {
          user_id: 'test-user',
          name: 'Test User',
          email: 'test-user@example.com',
          team_id: 'requester-team'
        },
        issue_type: 'coordination' as const,
        priority: 'high' as const,
        affected_teams: ['test-team']
      };

      const result = await service.createIssuesWithApproval(issueRequest, false);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].issue_key).toBeDefined();
      expect(result[0].issue_url).toBeDefined();
    });

    it('should handle approval workflow when required', async () => {
      const issueRequest = {
        impact_analysis: mockImpactAnalysis,
        change_description: 'Test change requiring coordination',
        requester: {
          user_id: 'test-user',
          name: 'Test User',
          email: 'test-user@example.com',
          team_id: 'requester-team'
        },
        issue_type: 'coordination' as const,
        priority: 'high' as const,
        affected_teams: ['test-team']
      };

      const result = await service.createIssuesWithApproval(issueRequest, true);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create team-specific issues for high-priority stakeholders', async () => {
      const issueRequest = {
        impact_analysis: {
          ...mockImpactAnalysis,
          stakeholders: [
            { ...mockStakeholder, priority: 'high' as const },
            { ...mockStakeholder, team_id: 'other-team', priority: 'medium' as const }
          ]
        },
        change_description: 'Test change requiring coordination',
        requester: {
          user_id: 'test-user',
          name: 'Test User',
          email: 'test-user@example.com',
          team_id: 'requester-team'
        },
        issue_type: 'coordination' as const,
        priority: 'high' as const,
        affected_teams: ['test-team', 'other-team']
      };

      const result = await service.createIssuesWithApproval(issueRequest, false);

      expect(result).toBeDefined();
      expect(result.length).toBe(2); // Main issue + 1 team-specific issue for high priority stakeholder
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update preferences successfully', async () => {
      const preferences: NotificationPreferences = {
        user_id: 'test-user',
        team_id: 'test-team',
        channels: ['slack', 'email'],
        severity_thresholds: {
          low: false,
          medium: true,
          high: true,
          critical: true
        },
        quiet_hours: {
          start: '22:00',
          end: '08:00',
          timezone: 'America/New_York'
        },
        escalation_delay_minutes: 45
      };

      await expect(service.updateNotificationPreferences(preferences))
        .resolves.not.toThrow();
    });
  });

  describe('getNotificationStatus', () => {
    it('should return notification status', async () => {
      const notificationId = 'test-notification-id';
      
      const status = await service.getNotificationStatus(notificationId);

      expect(status).toBeDefined();
      expect(Array.isArray(status)).toBe(true);
    });
  });

  describe('private helper methods', () => {
    it('should generate unique notification IDs', () => {
      const id1 = (service as any).generateNotificationId();
      const id2 = (service as any).generateNotificationId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^notif-\d+-[a-z0-9]+$/);
    });

    it('should determine channels with preferences', () => {
      const preferences: NotificationPreferences = {
        user_id: 'test-user',
        team_id: 'test-team',
        channels: ['teams', 'email'],
        severity_thresholds: {
          low: false,
          medium: true,
          high: true,
          critical: true
        },
        escalation_delay_minutes: 30
      };

      const channels = (service as any).determineChannelsWithPreferences(
        mockStakeholder,
        'high',
        preferences
      );

      expect(channels).toEqual(['teams', 'email']);
    });

    it('should fall back to default channels when no preferences', () => {
      const channels = (service as any).determineChannelsWithPreferences(
        mockStakeholder,
        'critical',
        undefined
      );

      expect(channels).toContain('slack');
      expect(channels).toContain('email');
    });

    it('should detect quiet hours correctly', () => {
      const preferences: NotificationPreferences = {
        user_id: 'test-user',
        team_id: 'test-team',
        channels: ['slack'],
        severity_thresholds: {
          low: false,
          medium: true,
          high: true,
          critical: true
        },
        quiet_hours: {
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        },
        escalation_delay_minutes: 30
      };

      // Mock current time to be in quiet hours
      const originalDate = Date;
      const mockDate = new Date('2024-01-15T23:30:00Z'); // 11:30 PM UTC
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const isQuietHours = (service as any).isInQuietHours(preferences);

      // Restore original Date
      global.Date = originalDate;

      expect(isQuietHours).toBe(true);
    });
  });
});