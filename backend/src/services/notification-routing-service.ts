import { Stakeholder } from './impact-analysis-service.js';
import { NotificationPreferences } from './enhanced-notification-service.js';

export interface RoutingRule {
  id: string;
  name: string;
  conditions: RoutingCondition[];
  actions: RoutingAction[];
  priority: number;
  enabled: boolean;
}

export interface RoutingCondition {
  type: 'severity' | 'team' | 'service_type' | 'time_of_day' | 'day_of_week' | 'user_role';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  value: string | string[] | number;
}

export interface RoutingAction {
  type: 'send_notification' | 'escalate' | 'create_issue' | 'suppress';
  channel?: 'slack' | 'teams' | 'email' | 'sms' | 'pagerduty';
  delay_minutes?: number;
  template_id?: string;
  escalation_target?: string;
  issue_type?: 'bug' | 'task' | 'story' | 'epic';
}

export interface NotificationRoute {
  stakeholder: Stakeholder;
  channels: string[];
  priority: 'immediate' | 'high' | 'normal' | 'low';
  delay_minutes: number;
  escalation_rules: EscalationRule[];
  template_overrides?: Record<string, string>;
}

export interface EscalationRule {
  trigger_after_minutes: number;
  escalation_target: string;
  escalation_channel: string;
  message_template?: string;
}

/**
 * Service for routing notifications based on severity, preferences, and business rules
 */
export class NotificationRoutingService {
  private routingRules: RoutingRule[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Determine notification routes for stakeholders based on severity and preferences
   */
  async determineNotificationRoutes(
    stakeholders: Stakeholder[],
    severity: 'low' | 'medium' | 'high' | 'critical',
    preferences: Map<string, NotificationPreferences>,
    context: {
      service_type?: string;
      change_type?: string;
      business_hours?: boolean;
      weekend?: boolean;
    } = {}
  ): Promise<NotificationRoute[]> {
    const routes: NotificationRoute[] = [];

    for (const stakeholder of stakeholders) {
      const route = await this.determineRouteForStakeholder(
        stakeholder,
        severity,
        preferences.get(stakeholder.team_id),
        context
      );
      
      if (route) {
        routes.push(route);
      }
    }

    // Sort routes by priority
    return routes.sort((a, b) => {
      const priorityOrder = { immediate: 4, high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Determine route for a single stakeholder
   */
  private async determineRouteForStakeholder(
    stakeholder: Stakeholder,
    severity: 'low' | 'medium' | 'high' | 'critical',
    preferences?: NotificationPreferences,
    context: any = {}
  ): Promise<NotificationRoute | null> {
    // Apply routing rules
    const applicableRules = this.getApplicableRules(stakeholder, severity, context);
    
    // Check if notification should be suppressed
    if (this.shouldSuppressNotification(applicableRules)) {
      return null;
    }

    // Determine channels based on preferences and rules
    const channels = this.determineChannels(stakeholder, severity, preferences, applicableRules);
    
    // Determine priority and delay
    const priority = this.determinePriority(severity, stakeholder.priority, applicableRules);
    const delayMinutes = this.determineDelay(severity, preferences, context, applicableRules);
    
    // Build escalation rules
    const escalationRules = this.buildEscalationRules(stakeholder, severity, preferences, applicableRules);

    return {
      stakeholder,
      channels,
      priority,
      delay_minutes: delayMinutes,
      escalation_rules: escalationRules,
      template_overrides: this.getTemplateOverrides(applicableRules)
    };
  }

  /**
   * Get routing rules that apply to the current context
   */
  private getApplicableRules(
    stakeholder: Stakeholder,
    severity: string,
    context: any
  ): RoutingRule[] {
    return this.routingRules
      .filter(rule => rule.enabled)
      .filter(rule => this.evaluateRuleConditions(rule, stakeholder, severity, context))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate if a routing rule's conditions are met
   */
  private evaluateRuleConditions(
    rule: RoutingRule,
    stakeholder: Stakeholder,
    severity: string,
    context: any
  ): boolean {
    return rule.conditions.every(condition => {
      switch (condition.type) {
        case 'severity':
          return this.evaluateCondition(condition, severity);
        case 'team':
          return this.evaluateCondition(condition, stakeholder.team_id);
        case 'service_type':
          return this.evaluateCondition(condition, context.service_type);
        case 'time_of_day':
          return this.evaluateTimeCondition(condition);
        case 'day_of_week':
          return this.evaluateDayCondition(condition);
        case 'user_role':
          return this.evaluateCondition(condition, stakeholder.role);
        default:
          return true;
      }
    });
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: RoutingCondition, value: string | undefined): boolean {
    if (value === undefined) return false;

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      default:
        return false;
    }
  }

  /**
   * Evaluate time-based condition
   */
  private evaluateTimeCondition(condition: RoutingCondition): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (condition.operator === 'greater_than') {
      return currentHour > (condition.value as number);
    } else if (condition.operator === 'less_than') {
      return currentHour < (condition.value as number);
    }
    
    return false;
  }

  /**
   * Evaluate day-based condition
   */
  private evaluateDayCondition(condition: RoutingCondition): boolean {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = dayNames[currentDay];
    
    return this.evaluateCondition(condition, currentDayName);
  }

  /**
   * Check if notification should be suppressed
   */
  private shouldSuppressNotification(rules: RoutingRule[]): boolean {
    return rules.some(rule => 
      rule.actions.some(action => action.type === 'suppress')
    );
  }

  /**
   * Determine notification channels
   */
  private determineChannels(
    stakeholder: Stakeholder,
    severity: string,
    preferences?: NotificationPreferences,
    rules: RoutingRule[] = []
  ): string[] {
    // Start with rule-based channels
    const ruleChannels = rules
      .flatMap(rule => rule.actions)
      .filter(action => action.type === 'send_notification' && action.channel)
      .map(action => action.channel!);

    if (ruleChannels.length > 0) {
      return [...new Set(ruleChannels)];
    }

    // Fall back to preferences
    if (preferences && preferences.channels.length > 0) {
      return preferences.channels;
    }

    // Fall back to stakeholder preferences
    if (stakeholder.notification_preferences && stakeholder.notification_preferences.length > 0) {
      return stakeholder.notification_preferences;
    }

    // Default channels based on severity
    return this.getDefaultChannelsForSeverity(severity, stakeholder.priority);
  }

  /**
   * Get default channels based on severity
   */
  private getDefaultChannelsForSeverity(severity: string, stakeholderPriority: string): string[] {
    if (severity === 'critical') {
      return ['slack', 'email', 'sms'];
    } else if (severity === 'high' || stakeholderPriority === 'high') {
      return ['slack', 'email'];
    } else if (severity === 'medium') {
      return ['slack'];
    } else {
      return ['email'];
    }
  }

  /**
   * Determine notification priority
   */
  private determinePriority(
    severity: string,
    stakeholderPriority: string,
    rules: RoutingRule[]
  ): 'immediate' | 'high' | 'normal' | 'low' {
    // Check for escalation actions in rules
    const hasEscalation = rules.some(rule =>
      rule.actions.some(action => action.type === 'escalate')
    );

    if (severity === 'critical' || hasEscalation) {
      return 'immediate';
    } else if (severity === 'high' || stakeholderPriority === 'high') {
      return 'high';
    } else if (severity === 'medium') {
      return 'normal';
    } else {
      return 'low';
    }
  }

  /**
   * Determine notification delay
   */
  private determineDelay(
    severity: string,
    preferences?: NotificationPreferences,
    context: any = {},
    rules: RoutingRule[] = []
  ): number {
    // Check for delay in rules
    const ruleDelay = rules
      .flatMap(rule => rule.actions)
      .find(action => action.delay_minutes !== undefined)?.delay_minutes;

    if (ruleDelay !== undefined) {
      return ruleDelay;
    }

    // Check quiet hours
    if (preferences?.quiet_hours && this.isInQuietHours(preferences)) {
      return this.calculateQuietHoursDelay(preferences);
    }

    // No delay for critical issues
    if (severity === 'critical') {
      return 0;
    }

    // Small delay for non-business hours
    if (!context.business_hours) {
      return severity === 'high' ? 5 : 15;
    }

    return 0;
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quiet_hours) return false;

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: preferences.quiet_hours.timezone 
    }).substring(0, 5);

    return currentTime >= preferences.quiet_hours.start && currentTime <= preferences.quiet_hours.end;
  }

  /**
   * Calculate delay for quiet hours
   */
  private calculateQuietHoursDelay(preferences: NotificationPreferences): number {
    if (!preferences.quiet_hours) return 0;

    const now = new Date();
    const endTime = new Date();
    const [endHour, endMinute] = preferences.quiet_hours.end.split(':').map(Number);
    
    endTime.setHours(endHour, endMinute, 0, 0);
    
    // If end time is tomorrow
    if (endTime <= now) {
      endTime.setDate(endTime.getDate() + 1);
    }

    return Math.ceil((endTime.getTime() - now.getTime()) / (1000 * 60));
  }

  /**
   * Build escalation rules
   */
  private buildEscalationRules(
    stakeholder: Stakeholder,
    severity: string,
    preferences?: NotificationPreferences,
    rules: RoutingRule[] = []
  ): EscalationRule[] {
    const escalationRules: EscalationRule[] = [];

    // Add rule-based escalations
    rules.forEach(rule => {
      rule.actions
        .filter(action => action.type === 'escalate')
        .forEach(action => {
          if (action.escalation_target) {
            escalationRules.push({
              trigger_after_minutes: action.delay_minutes || this.getDefaultEscalationDelay(severity),
              escalation_target: action.escalation_target,
              escalation_channel: action.channel || 'slack'
            });
          }
        });
    });

    // Add default escalation for critical issues
    if (severity === 'critical' && escalationRules.length === 0) {
      escalationRules.push({
        trigger_after_minutes: preferences?.escalation_delay_minutes || 15,
        escalation_target: 'on-call-engineer',
        escalation_channel: 'pagerduty'
      });
    }

    return escalationRules;
  }

  /**
   * Get default escalation delay based on severity
   */
  private getDefaultEscalationDelay(severity: string): number {
    switch (severity) {
      case 'critical': return 15;
      case 'high': return 30;
      case 'medium': return 60;
      default: return 120;
    }
  }

  /**
   * Get template overrides from rules
   */
  private getTemplateOverrides(rules: RoutingRule[]): Record<string, string> {
    const overrides: Record<string, string> = {};

    rules.forEach(rule => {
      rule.actions
        .filter(action => action.template_id)
        .forEach(action => {
          if (action.channel && action.template_id) {
            overrides[action.channel] = action.template_id;
          }
        });
    });

    return overrides;
  }

  /**
   * Initialize default routing rules
   */
  private initializeDefaultRules(): void {
    this.routingRules = [
      // Critical issues - immediate notification with escalation
      {
        id: 'critical-immediate',
        name: 'Critical Issues - Immediate Notification',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'critical' }
        ],
        actions: [
          { type: 'send_notification', channel: 'slack' },
          { type: 'send_notification', channel: 'email' },
          { type: 'escalate', escalation_target: 'on-call-engineer', delay_minutes: 15, channel: 'pagerduty' }
        ],
        priority: 100,
        enabled: true
      },

      // High priority during business hours
      {
        id: 'high-business-hours',
        name: 'High Priority - Business Hours',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'high' },
          { type: 'time_of_day', operator: 'greater_than', value: 8 },
          { type: 'time_of_day', operator: 'less_than', value: 18 },
          { type: 'day_of_week', operator: 'not_in', value: ['saturday', 'sunday'] }
        ],
        actions: [
          { type: 'send_notification', channel: 'slack' },
          { type: 'send_notification', channel: 'email' }
        ],
        priority: 80,
        enabled: true
      },

      // High priority outside business hours - delayed
      {
        id: 'high-after-hours',
        name: 'High Priority - After Hours',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'high' },
          { type: 'time_of_day', operator: 'in', value: [0, 1, 2, 3, 4, 5, 6, 7, 19, 20, 21, 22, 23] }
        ],
        actions: [
          { type: 'send_notification', channel: 'email', delay_minutes: 30 }
        ],
        priority: 70,
        enabled: true
      },

      // Weekend suppression for low/medium issues
      {
        id: 'weekend-suppression',
        name: 'Weekend Suppression - Low/Medium',
        conditions: [
          { type: 'severity', operator: 'in', value: ['low', 'medium'] },
          { type: 'day_of_week', operator: 'in', value: ['saturday', 'sunday'] }
        ],
        actions: [
          { type: 'send_notification', channel: 'email', delay_minutes: 480 } // Delay until Monday
        ],
        priority: 60,
        enabled: true
      },

      // Default medium priority
      {
        id: 'medium-default',
        name: 'Medium Priority - Default',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'medium' }
        ],
        actions: [
          { type: 'send_notification', channel: 'slack' }
        ],
        priority: 50,
        enabled: true
      },

      // Low priority - email only
      {
        id: 'low-email-only',
        name: 'Low Priority - Email Only',
        conditions: [
          { type: 'severity', operator: 'equals', value: 'low' }
        ],
        actions: [
          { type: 'send_notification', channel: 'email' }
        ],
        priority: 40,
        enabled: true
      }
    ];
  }

  /**
   * Add custom routing rule
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule);
    this.routingRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove routing rule
   */
  removeRoutingRule(ruleId: string): void {
    this.routingRules = this.routingRules.filter(rule => rule.id !== ruleId);
  }

  /**
   * Update routing rule
   */
  updateRoutingRule(ruleId: string, updates: Partial<RoutingRule>): void {
    const index = this.routingRules.findIndex(rule => rule.id === ruleId);
    if (index !== -1) {
      this.routingRules[index] = { ...this.routingRules[index], ...updates };
      this.routingRules.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Get all routing rules
   */
  getRoutingRules(): RoutingRule[] {
    return [...this.routingRules];
  }
}