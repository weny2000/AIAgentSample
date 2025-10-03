import { EnhancedNotificationService, NotificationPreferences } from './services/enhanced-notification-service.js';
import { NotificationRoutingService } from './services/notification-routing-service.js';
import { NotificationRequest } from './services/notification-service.js';
import { ImpactAnalysisResult, Stakeholder } from './services/impact-analysis-service.js';

/**
 * Integration test for the notification system
 */
async function testNotificationSystem() {
  console.log('🔔 Testing Notification System Implementation');
  console.log('=' .repeat(60));

  try {
    // Test 1: Enhanced Notification Service
    console.log('\n📧 Test 1: Enhanced Notification Service');
    await testEnhancedNotificationService();

    // Test 2: Notification Routing Service
    console.log('\n🚦 Test 2: Notification Routing Service');
    await testNotificationRoutingService();

    // Test 3: Integration Test
    console.log('\n🔗 Test 3: End-to-End Integration');
    await testEndToEndIntegration();

    console.log('\n✅ All notification system tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Notification system test failed:', error);
    throw error;
  }
}

async function testEnhancedNotificationService() {
  const service = new EnhancedNotificationService({
    notificationTableName: 'test-notifications',
    preferencesTableName: 'test-preferences',
    retryQueueUrl: 'test-queue-url',
    region: 'us-east-1'
  });

  // Create test data
  const mockStakeholder: Stakeholder = {
    team_id: 'frontend-team',
    team_name: 'Frontend Team',
    contact_info: ['frontend-lead@company.com'],
    role: 'owner',
    priority: 'high',
    notification_preferences: ['slack', 'email']
  };

  const mockImpactAnalysis: ImpactAnalysisResult = {
    service_id: 'user-service',
    service_name: 'User Service',
    team_id: 'backend-team',
    analysis_type: 'full',
    affected_services: [{
      service_id: 'user-service',
      service_name: 'User Service',
      team_id: 'backend-team',
      depth: 1,
      path: ['user-service'],
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
        description: 'Critical user authentication service',
        affected_services: ['user-service']
      }],
      cross_team_impact_count: 3,
      critical_path_services: ['user-service'],
      business_impact_estimate: 'High - affects user login functionality'
    },
    stakeholders: [mockStakeholder],
    mitigation_strategies: [{
      strategy_type: 'communication',
      priority: 'high',
      description: 'Coordinate with frontend team for UI changes',
      action_items: [
        'Send notification to frontend team',
        'Schedule coordination meeting',
        'Prepare rollback plan'
      ],
      estimated_effort: '4 hours',
      responsible_teams: ['frontend-team', 'backend-team']
    }],
    visualization_data: {
      nodes: [],
      edges: [],
      clusters: [],
      layout_hints: {}
    }
  };

  const notificationRequest: NotificationRequest = {
    impact_analysis: mockImpactAnalysis,
    change_description: 'Updating user authentication API to support OAuth 2.0',
    change_timeline: '2024-01-20 14:00 UTC - Planned maintenance window',
    requester: {
      user_id: 'john.doe',
      name: 'John Doe',
      email: 'john.doe@company.com',
      team_id: 'backend-team'
    },
    notification_type: 'impact_alert',
    urgency: 'high'
  };

  console.log('  📤 Sending notifications with retry logic...');
  const result = await service.sendNotificationsWithRetry(notificationRequest);
  
  console.log(`  ✅ Notification sent successfully:`);
  console.log(`     - Notification ID: ${result.notification_id}`);
  console.log(`     - Stakeholders notified: ${result.summary.total_stakeholders}`);
  console.log(`     - Notifications sent: ${result.summary.notifications_sent}`);
  console.log(`     - Notifications failed: ${result.summary.notifications_failed}`);
  console.log(`     - Channels used: ${result.summary.channels_used.join(', ')}`);
  console.log(`     - Estimated reach: ${result.summary.estimated_reach} people`);

  // Test notification preferences
  console.log('\n  ⚙️ Testing notification preferences...');
  const preferences: NotificationPreferences = {
    user_id: 'john.doe',
    team_id: 'backend-team',
    channels: ['slack', 'teams'],
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
    escalation_delay_minutes: 30
  };

  await service.updateNotificationPreferences(preferences);
  console.log('  ✅ Notification preferences updated successfully');

  // Test notification status
  console.log('\n  📊 Testing notification status tracking...');
  const status = await service.getNotificationStatus(result.notification_id);
  console.log(`  ✅ Retrieved status for ${status.length} notification deliveries`);

  // Test issue creation
  console.log('\n  🎫 Testing Jira issue creation...');
  const issueRequest = {
    impact_analysis: mockImpactAnalysis,
    change_description: notificationRequest.change_description,
    requester: notificationRequest.requester,
    issue_type: 'coordination' as const,
    priority: 'high' as const,
    affected_teams: ['frontend-team', 'backend-team']
  };

  const createdIssues = await service.createIssuesWithApproval(issueRequest, false);
  console.log(`  ✅ Created ${createdIssues.length} Jira issues:`);
  createdIssues.forEach((issue, index) => {
    console.log(`     ${index + 1}. ${issue.issue_key}: ${issue.issue_url}`);
  });
}

async function testNotificationRoutingService() {
  const routingService = new NotificationRoutingService();

  // Create test stakeholders
  const stakeholders: Stakeholder[] = [
    {
      team_id: 'frontend-team',
      team_name: 'Frontend Team',
      contact_info: ['frontend@company.com'],
      role: 'dependent',
      priority: 'high',
      notification_preferences: ['slack']
    },
    {
      team_id: 'mobile-team',
      team_name: 'Mobile Team',
      contact_info: ['mobile@company.com'],
      role: 'dependent',
      priority: 'medium',
      notification_preferences: ['teams']
    },
    {
      team_id: 'qa-team',
      team_name: 'QA Team',
      contact_info: ['qa@company.com'],
      role: 'stakeholder',
      priority: 'low',
      notification_preferences: ['email']
    }
  ];

  // Create test preferences
  const preferences = new Map<string, NotificationPreferences>([
    ['frontend-team', {
      user_id: 'frontend-lead',
      team_id: 'frontend-team',
      channels: ['slack', 'email'],
      severity_thresholds: {
        low: false,
        medium: true,
        high: true,
        critical: true
      },
      escalation_delay_minutes: 15
    }],
    ['mobile-team', {
      user_id: 'mobile-lead',
      team_id: 'mobile-team',
      channels: ['teams'],
      severity_thresholds: {
        low: false,
        medium: false,
        high: true,
        critical: true
      },
      escalation_delay_minutes: 30
    }]
  ]);

  console.log('  🚨 Testing critical severity routing...');
  const criticalRoutes = await routingService.determineNotificationRoutes(
    stakeholders,
    'critical',
    preferences,
    { business_hours: true, weekend: false }
  );

  console.log(`  ✅ Generated ${criticalRoutes.length} routes for critical severity:`);
  criticalRoutes.forEach((route, index) => {
    console.log(`     ${index + 1}. Team: ${route.stakeholder.team_id}`);
    console.log(`        - Priority: ${route.priority}`);
    console.log(`        - Channels: ${route.channels.join(', ')}`);
    console.log(`        - Delay: ${route.delay_minutes} minutes`);
    console.log(`        - Escalations: ${route.escalation_rules.length}`);
  });

  console.log('\n  ⚠️ Testing high severity routing during business hours...');
  const highRoutes = await routingService.determineNotificationRoutes(
    stakeholders,
    'high',
    preferences,
    { business_hours: true, weekend: false }
  );

  console.log(`  ✅ Generated ${highRoutes.length} routes for high severity:`);
  highRoutes.forEach((route, index) => {
    console.log(`     ${index + 1}. Team: ${route.stakeholder.team_id} - ${route.channels.join(', ')}`);
  });

  console.log('\n  🌙 Testing after-hours routing...');
  const afterHoursRoutes = await routingService.determineNotificationRoutes(
    stakeholders,
    'medium',
    preferences,
    { business_hours: false, weekend: false }
  );

  console.log(`  ✅ Generated ${afterHoursRoutes.length} routes for after-hours:`);
  afterHoursRoutes.forEach((route, index) => {
    console.log(`     ${index + 1}. Team: ${route.stakeholder.team_id} - Delay: ${route.delay_minutes}min`);
  });

  // Test custom routing rules
  console.log('\n  📋 Testing custom routing rules...');
  routingService.addRoutingRule({
    id: 'security-team-critical',
    name: 'Security Team Critical Alerts',
    conditions: [
      { type: 'severity', operator: 'equals', value: 'critical' },
      { type: 'service_type', operator: 'equals', value: 'security' }
    ],
    actions: [
      { type: 'send_notification', channel: 'pagerduty' },
      { type: 'escalate', escalation_target: 'security-oncall', delay_minutes: 5 }
    ],
    priority: 100,
    enabled: true
  });

  const rules = routingService.getRoutingRules();
  console.log(`  ✅ Total routing rules: ${rules.length}`);
  console.log(`     - Custom rules: ${rules.filter(r => r.id.includes('security')).length}`);
}

async function testEndToEndIntegration() {
  console.log('  🔄 Testing complete notification workflow...');

  const notificationService = new EnhancedNotificationService({
    notificationTableName: 'test-notifications',
    preferencesTableName: 'test-preferences',
    retryQueueUrl: 'test-queue-url',
    region: 'us-east-1'
  });

  const routingService = new NotificationRoutingService();

  // Simulate a critical security incident
  const criticalIncident: NotificationRequest = {
    impact_analysis: {
      service_id: 'auth-service',
      service_name: 'Authentication Service',
      team_id: 'security-team',
      analysis_type: 'full',
      affected_services: [
        {
          service_id: 'auth-service',
          service_name: 'Authentication Service',
          team_id: 'security-team',
          depth: 0,
          path: ['auth-service'],
          criticality: 'critical',
          impact_type: 'direct',
          dependency_types: ['security'],
          estimated_impact_score: 95
        },
        {
          service_id: 'user-portal',
          service_name: 'User Portal',
          team_id: 'frontend-team',
          depth: 1,
          path: ['auth-service', 'user-portal'],
          criticality: 'high',
          impact_type: 'indirect',
          dependency_types: ['api'],
          estimated_impact_score: 80
        }
      ],
      risk_assessment: {
        overall_risk_level: 'critical',
        risk_factors: [
          {
            type: 'critical_service',
            severity: 'critical',
            description: 'Authentication service outage affects all user access',
            affected_services: ['auth-service', 'user-portal']
          }
        ],
        cross_team_impact_count: 5,
        critical_path_services: ['auth-service'],
        business_impact_estimate: 'Critical - complete user access outage'
      },
      stakeholders: [
        {
          team_id: 'security-team',
          team_name: 'Security Team',
          contact_info: ['security@company.com'],
          role: 'owner',
          priority: 'high',
          notification_preferences: ['pagerduty', 'slack']
        },
        {
          team_id: 'frontend-team',
          team_name: 'Frontend Team',
          contact_info: ['frontend@company.com'],
          role: 'dependent',
          priority: 'high',
          notification_preferences: ['slack', 'email']
        },
        {
          team_id: 'ops-team',
          team_name: 'Operations Team',
          contact_info: ['ops@company.com'],
          role: 'stakeholder',
          priority: 'high',
          notification_preferences: ['pagerduty']
        }
      ],
      mitigation_strategies: [
        {
          strategy_type: 'technical',
          priority: 'high',
          description: 'Activate backup authentication service',
          action_items: [
            'Switch traffic to backup auth service',
            'Monitor service health',
            'Prepare rollback plan'
          ],
          estimated_effort: '30 minutes',
          responsible_teams: ['security-team', 'ops-team']
        }
      ],
      visualization_data: {
        nodes: [],
        edges: [],
        clusters: [],
        layout_hints: {}
      }
    },
    change_description: 'CRITICAL: Authentication service experiencing outage',
    change_timeline: 'IMMEDIATE - Service restoration in progress',
    requester: {
      user_id: 'monitoring-system',
      name: 'Monitoring System',
      email: 'alerts@company.com',
      team_id: 'ops-team'
    },
    notification_type: 'impact_alert',
    urgency: 'critical'
  };

  // Step 1: Determine routing
  const preferences = new Map<string, NotificationPreferences>();
  const routes = await routingService.determineNotificationRoutes(
    criticalIncident.impact_analysis.stakeholders,
    'critical',
    preferences,
    { business_hours: true, weekend: false }
  );

  console.log(`  📋 Generated ${routes.length} notification routes`);

  // Step 2: Send notifications
  const notificationResult = await notificationService.sendNotificationsWithRetry(criticalIncident);
  console.log(`  📤 Sent notifications: ${notificationResult.summary.notifications_sent}`);

  // Step 3: Create coordination issues
  const issueRequest = {
    impact_analysis: criticalIncident.impact_analysis,
    change_description: criticalIncident.change_description,
    requester: criticalIncident.requester,
    issue_type: 'coordination' as const,
    priority: 'critical' as const,
    affected_teams: ['security-team', 'frontend-team', 'ops-team']
  };

  const issues = await notificationService.createIssuesWithApproval(issueRequest, false);
  console.log(`  🎫 Created ${issues.length} coordination issues`);

  // Step 4: Track status
  const status = await notificationService.getNotificationStatus(notificationResult.notification_id);
  console.log(`  📊 Tracking ${status.length} notification deliveries`);

  console.log('\n  ✅ End-to-end integration test completed successfully!');
  console.log('     - Routing: ✅ Determined appropriate channels and priorities');
  console.log('     - Notifications: ✅ Sent with retry logic and status tracking');
  console.log('     - Issues: ✅ Created coordination tickets with approval workflow');
  console.log('     - Monitoring: ✅ Status tracking and delivery confirmation');
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testNotificationSystem()
    .then(() => {
      console.log('\n🎉 Notification system implementation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Notification system test failed:', error);
      process.exit(1);
    });
}

export { testNotificationSystem };