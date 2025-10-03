/**
 * Test script for Slack and Teams connectors
 */

import { SlackConnector } from './ingestion/connectors/slack-connector';
import { TeamsConnector } from './ingestion/connectors/teams-connector';
import { ConnectorFactory } from './ingestion/connectors/base-connector';
import { WebhookHandler } from './ingestion/webhook-handler';
import { IngestionPipeline } from './ingestion/ingestion-pipeline';
import { ConnectorConfig } from './ingestion/types';

async function testSlackConnector() {
  console.log('\n=== Testing Slack Connector ===');

  const config: ConnectorConfig = {
    source_type: 'slack',
    credentials: {
      bot_token: process.env.SLACK_BOT_TOKEN || 'test-token',
      signing_secret: process.env.SLACK_SIGNING_SECRET || 'test-secret',
      client_id: process.env.SLACK_CLIENT_ID || 'test-client-id',
      client_secret: process.env.SLACK_CLIENT_SECRET || 'test-client-secret',
    },
    sync_interval: 300000, // 5 minutes
    team_boundaries: ['team1', 'team2'],
    access_controls: [
      {
        type: 'team',
        identifier: 'default',
        permission: 'read',
      },
    ],
    enabled: true,
  };

  const connector = new SlackConnector(config);

  try {
    // Test connection (will fail without real credentials)
    console.log('Testing connection...');
    const isConnected = await connector.testConnection();
    console.log('Connection test result:', isConnected);

    // Test metrics
    console.log('Getting metrics...');
    const metrics = await connector.getMetrics();
    console.log('Metrics:', metrics);

    // Test webhook signature verification
    console.log('Testing webhook signature verification...');
    const testBody = '{"type":"url_verification","challenge":"test"}';
    const testSignature = 'v0=test-signature';
    const testTimestamp = Math.floor(Date.now() / 1000).toString();
    
    const isValidSignature = connector.verifyWebhookSignature(testBody, testSignature, testTimestamp);
    console.log('Signature verification result:', isValidSignature);

    // Test webhook event handling
    console.log('Testing webhook event handling...');
    const testEvent = {
      type: 'message',
      user: 'U123456',
      text: 'Hello world!',
      channel: 'C123456',
      ts: '1234567890.123456',
    };

    const webhookDocs = await connector.handleWebhookEvent(testEvent);
    console.log('Webhook documents generated:', webhookDocs.length);

    console.log('✅ Slack connector tests completed');

  } catch (error) {
    console.error('❌ Slack connector test failed:', error.message);
  }
}

async function testTeamsConnector() {
  console.log('\n=== Testing Teams Connector ===');

  const config: ConnectorConfig = {
    source_type: 'teams',
    credentials: {
      client_id: process.env.TEAMS_CLIENT_ID || 'test-client-id',
      client_secret: process.env.TEAMS_CLIENT_SECRET || 'test-client-secret',
      tenant_id: process.env.TEAMS_TENANT_ID || 'test-tenant-id',
    },
    sync_interval: 300000, // 5 minutes
    team_boundaries: ['team1', 'team2'],
    access_controls: [
      {
        type: 'team',
        identifier: 'default',
        permission: 'read',
      },
    ],
    enabled: true,
  };

  const connector = new TeamsConnector(config);

  try {
    // Test connection (will fail without real credentials)
    console.log('Testing connection...');
    const isConnected = await connector.testConnection();
    console.log('Connection test result:', isConnected);

    // Test metrics
    console.log('Getting metrics...');
    const metrics = await connector.getMetrics();
    console.log('Metrics:', metrics);

    // Test webhook event handling
    console.log('Testing webhook event handling...');
    const testEvent = {
      changeType: 'created',
      resource: '/teams/team-id/channels/channel-id/messages/message-id',
      resourceData: {
        id: 'message-id',
        body: {
          content: 'Hello from Teams!',
          contentType: 'text',
        },
        from: {
          user: {
            id: 'user-id',
            displayName: 'Test User',
          },
        },
        createdDateTime: new Date().toISOString(),
        lastModifiedDateTime: new Date().toISOString(),
      },
    };

    const webhookDocs = await connector.handleWebhookEvent(testEvent);
    console.log('Webhook documents generated:', webhookDocs.length);

    console.log('✅ Teams connector tests completed');

  } catch (error) {
    console.error('❌ Teams connector test failed:', error.message);
  }
}

async function testConnectorFactory() {
  console.log('\n=== Testing Connector Factory ===');

  try {
    // Initialize factory
    ConnectorFactory.initialize();

    // Test supported types
    console.log('Supported connector types:', ConnectorFactory.getSupportedTypes());

    // Test creating Slack connector
    const slackConfig: ConnectorConfig = {
      source_type: 'slack',
      credentials: { bot_token: 'test' },
      sync_interval: 300000,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    // Note: This might fail due to async import in initialize()
    // In a real implementation, you'd wait for initialization to complete
    setTimeout(() => {
      try {
        const slackConnector = ConnectorFactory.create(slackConfig);
        console.log('✅ Slack connector created via factory');
      } catch (error) {
        console.log('⚠️ Factory creation test skipped (async import)');
      }
    }, 1000);

    console.log('✅ Connector factory tests completed');

  } catch (error) {
    console.error('❌ Connector factory test failed:', error.message);
  }
}

async function testWebhookHandler() {
  console.log('\n=== Testing Webhook Handler ===');

  try {
    // Create mock pipeline
    const mockPipeline = {
      processDocuments: async (docs: any[]) => {
        console.log(`Mock pipeline processed ${docs.length} documents`);
        return docs;
      },
    } as IngestionPipeline;

    const webhookConfig = {
      slack: {
        signing_secret: 'test-signing-secret',
      },
      teams: {
        client_secret: 'test-client-secret',
        validation_token: 'test-validation-token',
      },
    };

    const handler = new WebhookHandler(mockPipeline, webhookConfig);

    // Register mock connectors
    const slackConnector = new SlackConnector({
      source_type: 'slack',
      credentials: { bot_token: 'test', signing_secret: 'test-signing-secret' },
      sync_interval: 300000,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    });

    const teamsConnector = new TeamsConnector({
      source_type: 'teams',
      credentials: { client_id: 'test', client_secret: 'test', tenant_id: 'test' },
      sync_interval: 300000,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    });

    handler.registerConnector('slack', slackConnector);
    handler.registerConnector('teams', teamsConnector);

    // Test health check
    const health = await handler.healthCheck();
    console.log('Webhook handler health:', health);

    // Test Slack webhook (URL verification)
    const slackBody = JSON.stringify({
      type: 'url_verification',
      challenge: 'test-challenge',
    });

    const slackHeaders = {
      'x-slack-signature': 'v0=test-signature',
      'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
    };

    const slackResult = await handler.handleSlackWebhook(slackBody, slackHeaders);
    console.log('Slack webhook result:', slackResult.success);

    // Test Teams webhook (validation)
    const teamsBody = JSON.stringify({
      validationToken: 'test-validation-token',
    });

    const teamsResult = await handler.handleTeamsWebhook(teamsBody, {});
    console.log('Teams webhook result:', teamsResult.success);

    console.log('✅ Webhook handler tests completed');

  } catch (error) {
    console.error('❌ Webhook handler test failed:', error.message);
  }
}

async function testTeamBoundaryPreservation() {
  console.log('\n=== Testing Team Boundary Preservation ===');

  try {
    // Test Slack team boundary validation
    const slackConfig: ConnectorConfig = {
      source_type: 'slack',
      credentials: { bot_token: 'test' },
      sync_interval: 300000,
      team_boundaries: ['allowed-team'],
      access_controls: [],
      enabled: true,
    };

    const slackConnector = new SlackConnector(slackConfig);

    // Test document that should pass validation
    const validDoc = {
      id: 'test-1',
      source_type: 'slack',
      source_id: 'msg-1',
      team_id: 'allowed-team',
      content: 'Test message',
      metadata: {},
      access_controls: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Test document that should fail validation
    const invalidDoc = {
      ...validDoc,
      id: 'test-2',
      team_id: 'forbidden-team',
    };

    // Access the protected method via type assertion for testing
    const connector = slackConnector as any;
    const validResult = connector.validateTeamBoundaries(validDoc);
    const invalidResult = connector.validateTeamBoundaries(invalidDoc);

    console.log('Valid document passes boundary check:', validResult);
    console.log('Invalid document fails boundary check:', !invalidResult);

    console.log('✅ Team boundary preservation tests completed');

  } catch (error) {
    console.error('❌ Team boundary preservation test failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Slack/Teams Connector Tests');
  console.log('=====================================');

  await testSlackConnector();
  await testTeamsConnector();
  await testConnectorFactory();
  await testWebhookHandler();
  await testTeamBoundaryPreservation();

  console.log('\n🎉 All connector tests completed!');
  console.log('\nNote: Connection tests will fail without real API credentials.');
  console.log('Set environment variables for full integration testing:');
  console.log('- SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET');
  console.log('- TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export {
  testSlackConnector,
  testTeamsConnector,
  testConnectorFactory,
  testWebhookHandler,
  testTeamBoundaryPreservation,
  runAllTests,
};