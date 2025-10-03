import { NotificationRoutingService, RoutingRule } from '../notification-routing-service';
import { Stakeholder } from '../impact-analysis-service';
import { NotificationPreferences } from '../enhanced-notification-service';

describe('NotificationRoutingService', () => {
  let service: NotificationRoutingService;
  let mockStakeholder: Stakeholder;
  let mockPreferences: NotificationPreferences;

  beforeEach(() => {
    service = new NotificationRoutingService();

    mockStakeholder = {
      team_id: 'test-team',
      team_name: 'Test Team',
      contact_info: ['test@example.com'],
      role: 'owner',
      priority: 'medium',
      notification_preferences: ['slack']
    };

    mockPreferences = {
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
        timezone: 'UTC'
      },
      escalation_delay_minutes: 30
    };
  });

  describe('determineNotificationRoutes', () => {
    it('should determine routes for critical severity', async () => {
      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'critical',
        preferences,
        { business_hours: true }
      );

      expect(routes).toHaveLength(1);
      expect(routes[0].priority).toBe('immediate');
      expect(routes[0].channels).toContain('slack');
      expect(routes[0].channels).toContain('email');
      expect(routes[0].escalation_rules).toHaveLength(1);
      expect(routes[0].escalation_rules[0].escalation_target).toBe('on-call-engineer');
    });

    it('should determine routes for high severity during business hours', async () => {
      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      // Mock business hours
      const originalDate = Date;
      const mockDate = new Date('2024-01-15T14:00:00Z'); // 2 PM UTC on Monday
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'high',
        preferences,
        { business_hours: true, weekend: false }
      );

      // Restore original Date
      global.Date = originalDate;

      expect(routes).toHaveLength(1);
      expect(routes[0].priority).toBe('high');
      expect(routes[0].channels).toContain('slack');
      expect(routes[0].channels).toContain('email');
      expect(routes[0].delay_minutes).toBe(0);
    });

    it('should delay high severity notifications outside business hours', async () => {
      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      // Mock after hours
      const originalDate = Date;
      const mockDate = new Date('2024-01-15T02:00:00Z'); // 2 AM UTC
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'high',
        preferences,
        { business_hours: false }
      );

      // Restore original Date
      global.Date = originalDate;

      expect(routes).toHaveLength(1);
      expect(routes[0].channels).toEqual(['email']);
      expect(routes[0].delay_minutes).toBe(30);
    });

    it('should suppress low/medium notifications on weekends', async () => {
      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      // Mock weekend
      const originalDate = Date;
      const mockDate = new Date('2024-01-13T14:00:00Z'); // Saturday
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'medium',
        preferences,
        { weekend: true }
      );

      // Restore original Date
      global.Date = originalDate;

      expect(routes).toHaveLength(1);
      expect(routes[0].channels).toEqual(['email']);
      expect(routes[0].delay_minutes).toBe(480); // Delay until Monday
    });

    it('should handle multiple stakeholders with different priorities', async () => {
      const stakeholders = [
        { ...mockStakeholder, team_id: 'team-1', priority: 'high' as const },
        { ...mockStakeholder, team_id: 'team-2', priority: 'medium' as const },
        { ...mockStakeholder, team_id: 'team-3', priority: 'low' as const }
      ];
      const preferences = new Map([
        ['team-1', mockPreferences],
        ['team-2', mockPreferences],
        ['team-3', mockPreferences]
      ]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'medium',
        preferences,
        { business_hours: true }
      );

      expect(routes).toHaveLength(3);
      
      // Should be sorted by priority
      expect(routes[0].priority).toBe('high'); // team-1
      expect(routes[1].priority).toBe('normal'); // team-2
      expect(routes[2].priority).toBe('normal'); // team-3
    });

    it('should use stakeholder preferences when no user preferences available', async () => {
      const stakeholderWithPrefs = {
        ...mockStakeholder,
        notification_preferences: ['teams', 'email']
      };
      const stakeholders = [stakeholderWithPrefs];
      const preferences = new Map(); // No preferences

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'medium',
        preferences,
        { business_hours: true }
      );

      expect(routes).toHaveLength(1);
      expect(routes[0].channels).toEqual(['teams', 'email']);
    });

    it('should fall back to default channels when no preferences available', async () => {
      const stakeholderNoPrefs = {
        ...mockStakeholder,
        notification_preferences: undefined
      };
      const stakeholders = [stakeholderNoPrefs];
      const preferences = new Map(); // No preferences

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'high',
        preferences,
        { business_hours: true }
      );

      expect(routes).toHaveLength(1);
      expect(routes[0].channels).toContain('slack');
      expect(routes[0].channels).toContain('email');
    });
  });

  describe('routing rules management', () => {
    it('should add custom routing rules', () => {
      const customRule: RoutingRule = {
        id: 'custom-rule',
        name: 'Custom Rule',
        conditions: [
          { type: 'team', operator: 'equals', value: 'special-team' }
        ],
        actions: [
          { type: 'send_notification', channel: 'pagerduty' }
        ],
        priority: 90,
        enabled: true
      };

      service.addRoutingRule(customRule);
      const rules = service.getRoutingRules();

      expect(rules).toContainEqual(customRule);
      expect(rules.find(r => r.id === 'custom-rule')).toBeDefined();
    });

    it('should remove routing rules', () => {
      const customRule: RoutingRule = {
        id: 'rule-to-remove',
        name: 'Rule to Remove',
        conditions: [],
        actions: [],
        priority: 50,
        enabled: true
      };

      service.addRoutingRule(customRule);
      expect(service.getRoutingRules().find(r => r.id === 'rule-to-remove')).toBeDefined();

      service.removeRoutingRule('rule-to-remove');
      expect(service.getRoutingRules().find(r => r.id === 'rule-to-remove')).toBeUndefined();
    });

    it('should update routing rules', () => {
      const customRule: RoutingRule = {
        id: 'rule-to-update',
        name: 'Original Name',
        conditions: [],
        actions: [],
        priority: 50,
        enabled: true
      };

      service.addRoutingRule(customRule);
      service.updateRoutingRule('rule-to-update', { name: 'Updated Name', enabled: false });

      const updatedRule = service.getRoutingRules().find(r => r.id === 'rule-to-update');
      expect(updatedRule?.name).toBe('Updated Name');
      expect(updatedRule?.enabled).toBe(false);
    });

    it('should maintain rule priority order', () => {
      const rule1: RoutingRule = {
        id: 'rule-1',
        name: 'Rule 1',
        conditions: [],
        actions: [],
        priority: 30,
        enabled: true
      };

      const rule2: RoutingRule = {
        id: 'rule-2',
        name: 'Rule 2',
        conditions: [],
        actions: [],
        priority: 70,
        enabled: true
      };

      service.addRoutingRule(rule1);
      service.addRoutingRule(rule2);

      const rules = service.getRoutingRules();
      const rule1Index = rules.findIndex(r => r.id === 'rule-1');
      const rule2Index = rules.findIndex(r => r.id === 'rule-2');

      expect(rule2Index).toBeLessThan(rule1Index); // Higher priority should come first
    });
  });

  describe('condition evaluation', () => {
    it('should evaluate severity conditions correctly', async () => {
      const customRule: RoutingRule = {
        id: 'severity-test',
        name: 'Severity Test',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'critical' }
        ],
        actions: [
          { type: 'send_notification', channel: 'pagerduty' }
        ],
        priority: 95,
        enabled: true
      };

      service.addRoutingRule(customRule);

      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'critical',
        preferences
      );

      expect(routes[0].channels).toContain('pagerduty');
    });

    it('should evaluate team conditions correctly', async () => {
      const customRule: RoutingRule = {
        id: 'team-test',
        name: 'Team Test',
        conditions: [
          { type: 'team', operator: 'equals', value: 'test-team' }
        ],
        actions: [
          { type: 'send_notification', channel: 'teams' }
        ],
        priority: 95,
        enabled: true
      };

      service.addRoutingRule(customRule);

      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'medium',
        preferences
      );

      expect(routes[0].channels).toContain('teams');
    });

    it('should evaluate time-based conditions correctly', async () => {
      const customRule: RoutingRule = {
        id: 'time-test',
        name: 'Time Test',
        conditions: [
          { type: 'time_of_day', operator: 'greater_than', value: 9 },
          { type: 'time_of_day', operator: 'less_than', value: 17 }
        ],
        actions: [
          { type: 'send_notification', channel: 'slack' }
        ],
        priority: 95,
        enabled: true
      };

      service.addRoutingRule(customRule);

      // Mock business hours
      const originalDate = Date;
      const mockDate = new Date('2024-01-15T14:00:00Z'); // 2 PM UTC
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'medium',
        preferences
      );

      // Restore original Date
      global.Date = originalDate;

      expect(routes[0].channels).toContain('slack');
    });

    it('should handle suppression actions', async () => {
      const suppressRule: RoutingRule = {
        id: 'suppress-test',
        name: 'Suppress Test',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'low' },
          { type: 'day_of_week', operator: 'in', value: ['saturday', 'sunday'] }
        ],
        actions: [
          { type: 'suppress' }
        ],
        priority: 95,
        enabled: true
      };

      service.addRoutingRule(suppressRule);

      // Mock weekend
      const originalDate = Date;
      const mockDate = new Date('2024-01-13T14:00:00Z'); // Saturday
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'low',
        preferences
      );

      // Restore original Date
      global.Date = originalDate;

      expect(routes).toHaveLength(0); // Should be suppressed
    });
  });

  describe('escalation rules', () => {
    it('should create escalation rules for critical issues', async () => {
      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'critical',
        preferences
      );

      expect(routes[0].escalation_rules).toHaveLength(1);
      expect(routes[0].escalation_rules[0].escalation_target).toBe('on-call-engineer');
      expect(routes[0].escalation_rules[0].escalation_channel).toBe('pagerduty');
      expect(routes[0].escalation_rules[0].trigger_after_minutes).toBe(15);
    });

    it('should use custom escalation rules from routing rules', async () => {
      const escalationRule: RoutingRule = {
        id: 'custom-escalation',
        name: 'Custom Escalation',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'high' }
        ],
        actions: [
          { type: 'escalate', escalation_target: 'team-lead', delay_minutes: 20, channel: 'slack' }
        ],
        priority: 95,
        enabled: true
      };

      service.addRoutingRule(escalationRule);

      const stakeholders = [mockStakeholder];
      const preferences = new Map([['test-team', mockPreferences]]);

      const routes = await service.determineNotificationRoutes(
        stakeholders,
        'high',
        preferences
      );

      expect(routes[0].escalation_rules).toHaveLength(1);
      expect(routes[0].escalation_rules[0].escalation_target).toBe('team-lead');
      expect(routes[0].escalation_rules[0].escalation_channel).toBe('slack');
      expect(routes[0].escalation_rules[0].trigger_after_minutes).toBe(20);
    });
  });
});