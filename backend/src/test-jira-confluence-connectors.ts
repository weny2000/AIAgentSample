/**
 * Test script for Jira and Confluence connectors
 */

import { JiraConnector } from './ingestion/connectors/jira-connector.js';
import { ConfluenceConnector } from './ingestion/connectors/confluence-connector.js';
import { ConnectorConfig } from './ingestion/types.js';

async function testJiraConnector() {
  console.log('🔧 Testing Jira Connector...');

  // Mock configuration for testing
  const config: ConnectorConfig = {
    source_type: 'jira',
    credentials: {
      base_url: 'https://your-domain.atlassian.net',
      username: 'test@example.com',
      api_token: 'test-token',
      webhook_secret: 'test-secret',
    },
    sync_interval: 3600,
    team_boundaries: ['TEST', 'DEMO'],
    access_controls: [],
    enabled: true,
  };

  const connector = new JiraConnector(config);

  try {
    // Test connection (will fail with mock credentials, but tests the structure)
    console.log('Testing connection...');
    const isConnected = await connector.testConnection();
    console.log(`Connection test: ${isConnected ? '✅ Success' : '❌ Failed (expected with mock credentials)'}`);

    // Test webhook signature verification
    console.log('Testing webhook signature verification...');
    const testBody = JSON.stringify({ test: 'data' });
    const testSignature = 'test-signature';
    const isValidSignature = connector.verifyWebhookSignature(testBody, testSignature);
    console.log(`Signature verification: ${isValidSignature ? '✅ Valid' : '❌ Invalid (expected with test data)'}`);

    // Test webhook event handling with mock data
    console.log('Testing webhook event handling...');
    const mockJiraEvent = {
      webhookEvent: 'jira:issue_created',
      issue: {
        id: '12345',
        key: 'TEST-123',
        fields: {
          summary: 'Test Issue',
          description: 'This is a test issue',
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          issuetype: { name: 'Bug' },
          project: { key: 'TEST', name: 'Test Project' },
          reporter: { displayName: 'Test User', emailAddress: 'test@example.com' },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          labels: ['test', 'mock'],
          components: [{ name: 'Backend' }],
          fixVersions: [{ name: '1.0.0' }],
        },
      },
    };

    const documents = await connector.handleWebhookEvent(mockJiraEvent);
    console.log(`Webhook event handling: ${documents.length > 0 ? '✅ Success' : '❌ No documents generated'}`);
    if (documents.length > 0) {
      console.log(`Generated ${documents.length} document(s)`);
      console.log('Sample document:', {
        id: documents[0].id,
        title: documents[0].metadata.title,
        author: documents[0].metadata.author,
        team_id: documents[0].team_id,
      });
    }

    // Test metrics
    const metrics = await connector.getMetrics();
    console.log('Connector metrics:', metrics);

    console.log('✅ Jira Connector tests completed\n');

  } catch (error) {
    console.error('❌ Jira Connector test failed:', error);
  }
}

async function testConfluenceConnector() {
  console.log('🔧 Testing Confluence Connector...');

  // Mock configuration for testing
  const config: ConnectorConfig = {
    source_type: 'confluence',
    credentials: {
      base_url: 'https://your-domain.atlassian.net/wiki',
      username: 'test@example.com',
      api_token: 'test-token',
      webhook_secret: 'test-secret',
    },
    sync_interval: 3600,
    team_boundaries: ['TEST', 'DEMO'],
    access_controls: [],
    enabled: true,
  };

  const connector = new ConfluenceConnector(config);

  try {
    // Test connection (will fail with mock credentials, but tests the structure)
    console.log('Testing connection...');
    const isConnected = await connector.testConnection();
    console.log(`Connection test: ${isConnected ? '✅ Success' : '❌ Failed (expected with mock credentials)'}`);

    // Test webhook signature verification
    console.log('Testing webhook signature verification...');
    const testBody = JSON.stringify({ test: 'data' });
    const testSignature = 'test-signature';
    const isValidSignature = connector.verifyWebhookSignature(testBody, testSignature);
    console.log(`Signature verification: ${isValidSignature ? '✅ Valid' : '❌ Invalid (expected with test data)'}`);

    // Test webhook event handling with mock data
    console.log('Testing webhook event handling...');
    const mockConfluenceEvent = {
      eventType: 'page_created',
      page: {
        id: '67890',
        type: 'page',
        status: 'current',
        title: 'Test Page',
        space: {
          id: '123',
          key: 'TEST',
          name: 'Test Space',
        },
        body: {
          storage: {
            value: '<p>This is a test page content with <strong>formatting</strong>.</p>',
            representation: 'storage',
          },
        },
        version: {
          number: 1,
          when: new Date().toISOString(),
          by: {
            displayName: 'Test User',
            email: 'test@example.com',
          },
        },
        ancestors: [
          {
            id: '12345',
            title: 'Parent Page',
          },
        ],
      },
    };

    const documents = await connector.handleWebhookEvent(mockConfluenceEvent);
    console.log(`Webhook event handling: ${documents.length > 0 ? '✅ Success' : '❌ No documents generated'}`);
    if (documents.length > 0) {
      console.log(`Generated ${documents.length} document(s)`);
      console.log('Sample document:', {
        id: documents[0].id,
        title: documents[0].metadata.title,
        author: documents[0].metadata.author,
        team_id: documents[0].team_id,
        content_preview: documents[0].content.substring(0, 100) + '...',
      });
    }

    // Test metrics
    const metrics = await connector.getMetrics();
    console.log('Connector metrics:', metrics);

    console.log('✅ Confluence Connector tests completed\n');

  } catch (error) {
    console.error('❌ Confluence Connector test failed:', error);
  }
}

async function testWebhookHandler() {
  console.log('🔧 Testing Webhook Handler with new connectors...');

  try {
    const { WebhookHandler } = await import('./ingestion/webhook-handler.js');
    // const { IngestionPipeline } = await import('./ingestion/ingestion-pipeline.js');

    // Create mock pipeline
    const mockPipeline = {
      processDocument: async (document: any) => {
        console.log(`Processing document: ${document.id}`);
        return document;
      },
    } as any;

    const webhookConfig = {
      jira: {
        webhook_secret: 'test-jira-secret',
      },
      confluence: {
        webhook_secret: 'test-confluence-secret',
      },
    };

    const handler = new WebhookHandler(mockPipeline, webhookConfig);

    // Create and register connectors
    const jiraConfig: ConnectorConfig = {
      source_type: 'jira',
      credentials: {
        base_url: 'https://test.atlassian.net',
        username: 'test@example.com',
        api_token: 'test-token',
        webhook_secret: 'test-jira-secret',
      },
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    const confluenceConfig: ConnectorConfig = {
      source_type: 'confluence',
      credentials: {
        base_url: 'https://test.atlassian.net/wiki',
        username: 'test@example.com',
        api_token: 'test-token',
        webhook_secret: 'test-confluence-secret',
      },
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    const jiraConnector = new JiraConnector(jiraConfig);
    const confluenceConnector = new ConfluenceConnector(confluenceConfig);

    handler.registerConnector('jira', jiraConnector);
    handler.registerConnector('confluence', confluenceConnector);

    // Test health check
    const health = await handler.healthCheck();
    console.log('Health check:', health);
    console.log(`Jira registered: ${health.jira ? '✅' : '❌'}`);
    console.log(`Confluence registered: ${health.confluence ? '✅' : '❌'}`);

    // Test Jira webhook handling
    console.log('Testing Jira webhook handling...');
    const jiraWebhookBody = JSON.stringify({
      webhookEvent: 'jira:issue_updated',
      issue: {
        id: '12345',
        key: 'TEST-456',
        fields: {
          summary: 'Updated Test Issue',
          description: 'This issue was updated',
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          issuetype: { name: 'Story' },
          project: { key: 'TEST', name: 'Test Project' },
          reporter: { displayName: 'Test User', emailAddress: 'test@example.com' },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          labels: ['updated', 'test'],
          components: [],
          fixVersions: [],
        },
      },
    });

    const jiraResult = await handler.handleJiraWebhook(jiraWebhookBody, {});
    console.log(`Jira webhook result: ${jiraResult.success ? '✅ Success' : '❌ Failed'}`);
    if (jiraResult.documents) {
      console.log(`Generated ${jiraResult.documents.length} document(s) from Jira webhook`);
    }

    // Test Confluence webhook handling
    console.log('Testing Confluence webhook handling...');
    const confluenceWebhookBody = JSON.stringify({
      eventType: 'page_updated',
      page: {
        id: '67890',
        type: 'page',
        status: 'current',
        title: 'Updated Test Page',
        space: {
          id: '123',
          key: 'TEST',
          name: 'Test Space',
        },
        body: {
          storage: {
            value: '<p>This page has been updated with new content.</p>',
            representation: 'storage',
          },
        },
        version: {
          number: 2,
          when: new Date().toISOString(),
          by: {
            displayName: 'Test User',
            email: 'test@example.com',
          },
        },
        ancestors: [],
      },
    });

    const confluenceResult = await handler.handleConfluenceWebhook(confluenceWebhookBody, {});
    console.log(`Confluence webhook result: ${confluenceResult.success ? '✅ Success' : '❌ Failed'}`);
    if (confluenceResult.documents) {
      console.log(`Generated ${confluenceResult.documents.length} document(s) from Confluence webhook`);
    }

    console.log('✅ Webhook Handler tests completed\n');

  } catch (error) {
    console.error('❌ Webhook Handler test failed:', error);
  }
}

async function main() {
  console.log('🚀 Starting Jira and Confluence Connector Tests\n');

  await testJiraConnector();
  await testConfluenceConnector();
  await testWebhookHandler();

  console.log('🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testJiraConnector, testConfluenceConnector, testWebhookHandler };