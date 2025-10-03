#!/usr/bin/env node

/**
 * Test script for Impact Analysis functionality
 * This script tests the cross-team impact analysis engine
 */

import { DatabaseConnection } from '../database/connection.js';
import { ServiceRepository } from '../repositories/service-repository.js';
import { DependencyRepository } from '../repositories/dependency-repository.js';
import { TeamRosterRepository } from '../repositories/team-roster-repository.js';
import { ImpactAnalysisService } from '../services/impact-analysis-service.js';
import { NotificationService } from '../services/notification-service.js';

async function testImpactAnalysis() {
  console.log('🚀 Testing Impact Analysis Engine...\n');

  const db = new DatabaseConnection();
  
  try {
    await db.connect();
    console.log('✅ Database connected');

    const serviceRepo = new ServiceRepository(db);
    const dependencyRepo = new DependencyRepository(db);
    const teamRosterRepo = new TeamRosterRepository(db);
    const impactAnalysisService = new ImpactAnalysisService(db);
    const notificationService = new NotificationService();

    // Test 1: Create test services and dependencies
    console.log('\n📝 Creating test data...');
    
    const testServices = [
      {
        name: 'User Authentication Service',
        team_id: 'team-auth',
        description: 'Core authentication service',
        service_type: 'api',
        status: 'active' as const
      },
      {
        name: 'Order Management Service',
        team_id: 'team-commerce',
        description: 'Handles order processing',
        service_type: 'api',
        status: 'active' as const
      },
      {
        name: 'Payment Processing Service',
        team_id: 'team-payments',
        description: 'Processes payments',
        service_type: 'api',
        status: 'active' as const
      },
      {
        name: 'Notification Service',
        team_id: 'team-notifications',
        description: 'Sends notifications',
        service_type: 'api',
        status: 'active' as const
      },
      {
        name: 'Analytics Service',
        team_id: 'team-analytics',
        description: 'Collects analytics data',
        service_type: 'api',
        status: 'active' as const
      }
    ];

    const createdServices = [];
    for (const serviceData of testServices) {
      try {
        const existing = await serviceRepo.getByNameAndTeam(serviceData.name, serviceData.team_id);
        if (existing) {
          console.log(`  ⚠️  Service ${serviceData.name} already exists, using existing`);
          createdServices.push(existing);
        } else {
          const service = await serviceRepo.create(serviceData);
          console.log(`  ✅ Created service: ${service.name} (${service.id})`);
          createdServices.push(service);
        }
      } catch (error) {
        console.error(`  ❌ Failed to create service ${serviceData.name}:`, error.message);
      }
    }

    if (createdServices.length < 2) {
      console.error('❌ Not enough services created for testing');
      return;
    }

    // Test 2: Create dependencies
    console.log('\n🔗 Creating test dependencies...');
    
    const testDependencies = [
      {
        source_service_id: createdServices[1].id, // Order Service depends on Auth Service
        target_service_id: createdServices[0].id,
        dependency_type: 'api',
        criticality: 'critical' as const,
        description: 'Order service requires user authentication'
      },
      {
        source_service_id: createdServices[1].id, // Order Service depends on Payment Service
        target_service_id: createdServices[2].id,
        dependency_type: 'api',
        criticality: 'critical' as const,
        description: 'Order service requires payment processing'
      },
      {
        source_service_id: createdServices[3].id, // Notification Service depends on Order Service
        target_service_id: createdServices[1].id,
        dependency_type: 'event',
        criticality: 'high' as const,
        description: 'Notifications triggered by order events'
      },
      {
        source_service_id: createdServices[4].id, // Analytics Service depends on Order Service
        target_service_id: createdServices[1].id,
        dependency_type: 'data',
        criticality: 'medium' as const,
        description: 'Analytics collects order data'
      }
    ];

    for (const depData of testDependencies) {
      try {
        const dependency = await dependencyRepo.create(depData);
        console.log(`  ✅ Created dependency: ${dependency.dependency_type} (${dependency.criticality})`);
      } catch (error) {
        if (error.message.includes('duplicate key')) {
          console.log(`  ⚠️  Dependency already exists, skipping`);
        } else {
          console.error(`  ❌ Failed to create dependency:`, error.message);
        }
      }
    }

    // Test 3: Create test team rosters
    console.log('\n👥 Creating test team rosters...');
    
    const testTeams = [
      {
        team_id: 'team-auth',
        members: [
          { user_id: 'auth-lead', role: 'lead', contact: 'auth-lead@company.com', permissions: [] },
          { user_id: 'auth-dev1', role: 'developer', contact: 'auth-dev1@company.com', permissions: [] }
        ],
        leader_persona_id: 'persona-auth-lead',
        policies: []
      },
      {
        team_id: 'team-commerce',
        members: [
          { user_id: 'commerce-lead', role: 'lead', contact: 'commerce-lead@company.com', permissions: [] },
          { user_id: 'commerce-dev1', role: 'developer', contact: 'commerce-dev1@company.com', permissions: [] }
        ],
        leader_persona_id: 'persona-commerce-lead',
        policies: []
      }
    ];

    for (const teamData of testTeams) {
      try {
        const existing = await teamRosterRepo.getByTeamId(teamData.team_id);
        if (existing) {
          console.log(`  ⚠️  Team ${teamData.team_id} already exists, using existing`);
        } else {
          const team = await teamRosterRepo.create(teamData);
          console.log(`  ✅ Created team roster: ${team.team_id}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to create team ${teamData.team_id}:`, error.message);
      }
    }

    // Test 4: Perform impact analysis
    console.log('\n🔍 Performing impact analysis...');
    
    const authServiceId = createdServices[0].id; // Auth Service
    console.log(`Analyzing impact for Auth Service (${authServiceId})`);

    try {
      const impactAnalysis = await impactAnalysisService.analyzeImpact(authServiceId, 'full', 3);
      
      console.log('\n📊 Impact Analysis Results:');
      console.log(`  Service: ${impactAnalysis.service_name} (${impactAnalysis.service_id})`);
      console.log(`  Team: ${impactAnalysis.team_id}`);
      console.log(`  Analysis Type: ${impactAnalysis.analysis_type}`);
      console.log(`  Risk Level: ${impactAnalysis.risk_assessment.overall_risk_level}`);
      console.log(`  Affected Services: ${impactAnalysis.affected_services.length}`);
      console.log(`  Stakeholders: ${impactAnalysis.stakeholders.length}`);
      console.log(`  Mitigation Strategies: ${impactAnalysis.mitigation_strategies.length}`);

      console.log('\n🎯 Affected Services:');
      impactAnalysis.affected_services.forEach((service, index) => {
        console.log(`  ${index + 1}. ${service.service_name} (${service.team_id})`);
        console.log(`     - Impact: ${service.criticality} (${service.impact_type})`);
        console.log(`     - Score: ${service.estimated_impact_score}`);
        console.log(`     - Depth: ${service.depth}`);
      });

      console.log('\n⚠️  Risk Factors:');
      impactAnalysis.risk_assessment.risk_factors.forEach((factor, index) => {
        console.log(`  ${index + 1}. ${factor.type} (${factor.severity})`);
        console.log(`     - ${factor.description}`);
      });

      console.log('\n👥 Stakeholders:');
      impactAnalysis.stakeholders.forEach((stakeholder, index) => {
        console.log(`  ${index + 1}. Team ${stakeholder.team_id} (${stakeholder.priority} priority)`);
        console.log(`     - Role: ${stakeholder.role}`);
        console.log(`     - Contacts: ${stakeholder.contact_info.join(', ')}`);
      });

      console.log('\n🛡️  Mitigation Strategies:');
      impactAnalysis.mitigation_strategies.forEach((strategy, index) => {
        console.log(`  ${index + 1}. ${strategy.strategy_type.toUpperCase()} (${strategy.priority} priority)`);
        console.log(`     - ${strategy.description}`);
        console.log(`     - Effort: ${strategy.estimated_effort}`);
        console.log(`     - Actions: ${strategy.action_items.length} items`);
      });

      console.log('\n🎨 Visualization Data:');
      console.log(`  Nodes: ${impactAnalysis.visualization_data.nodes.length}`);
      console.log(`  Edges: ${impactAnalysis.visualization_data.edges.length}`);
      console.log(`  Clusters: ${impactAnalysis.visualization_data.clusters.length}`);

      // Test 5: Test notification functionality
      console.log('\n📧 Testing notification functionality...');
      
      const notificationRequest = {
        impact_analysis: impactAnalysis,
        change_description: 'Upgrading authentication service to v2.0',
        change_timeline: 'Planned for next Tuesday, 2:00 PM EST',
        requester: {
          user_id: 'test-user',
          name: 'Test User',
          email: 'test@company.com',
          team_id: 'team-auth'
        },
        notification_type: 'impact_alert' as const,
        urgency: 'high' as const
      };

      try {
        const notificationResult = await notificationService.sendStakeholderNotifications(notificationRequest);
        
        console.log('📬 Notification Results:');
        console.log(`  Notification ID: ${notificationResult.notification_id}`);
        console.log(`  Total Stakeholders: ${notificationResult.summary.total_stakeholders}`);
        console.log(`  Notifications Sent: ${notificationResult.summary.notifications_sent}`);
        console.log(`  Notifications Failed: ${notificationResult.summary.notifications_failed}`);
        console.log(`  Estimated Reach: ${notificationResult.summary.estimated_reach} people`);
        console.log(`  Channels Used: ${notificationResult.summary.channels_used.join(', ')}`);

        if (notificationResult.sent_notifications.length > 0) {
          console.log('\n✅ Sent Notifications:');
          notificationResult.sent_notifications.forEach((notification, index) => {
            console.log(`  ${index + 1}. Team ${notification.stakeholder_team_id} via ${notification.channel}`);
            console.log(`     - Status: ${notification.delivery_status}`);
            console.log(`     - Sent at: ${notification.sent_at.toISOString()}`);
          });
        }

        if (notificationResult.failed_notifications.length > 0) {
          console.log('\n❌ Failed Notifications:');
          notificationResult.failed_notifications.forEach((notification, index) => {
            console.log(`  ${index + 1}. Team ${notification.stakeholder_team_id} via ${notification.channel}`);
            console.log(`     - Error: ${notification.error_message}`);
          });
        }

      } catch (error) {
        console.error('❌ Notification test failed:', error.message);
      }

      // Test 6: Test issue creation
      console.log('\n🎫 Testing issue creation...');
      
      const issueRequest = {
        impact_analysis: impactAnalysis,
        change_description: 'Upgrading authentication service to v2.0',
        requester: {
          user_id: 'test-user',
          name: 'Test User',
          email: 'test@company.com',
          team_id: 'team-auth'
        },
        issue_type: 'coordination' as const,
        priority: 'high' as const,
        affected_teams: impactAnalysis.stakeholders.map(s => s.team_id)
      };

      try {
        const createdIssues = await notificationService.createCoordinationIssues(issueRequest);
        
        console.log('🎫 Created Issues:');
        createdIssues.forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue.issue_key}`);
          console.log(`     - URL: ${issue.issue_url}`);
          console.log(`     - Project: ${issue.project_key}`);
          console.log(`     - Created: ${issue.created_at.toISOString()}`);
        });

      } catch (error) {
        console.error('❌ Issue creation test failed:', error.message);
      }

      console.log('\n✅ Impact Analysis Engine test completed successfully!');

    } catch (error) {
      console.error('❌ Impact analysis failed:', error.message);
      console.error(error.stack);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.disconnect();
    console.log('🔌 Database disconnected');
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testImpactAnalysis().catch(console.error);
}

export { testImpactAnalysis };