/**
 * Simple test for Jira and Confluence connectors
 */

import { JiraConnector } from './ingestion/connectors/jira-connector.js';
import { ConfluenceConnector } from './ingestion/connectors/confluence-connector.js';
import { ConnectorConfig } from './ingestion/types.js';

async function testConnectorCreation() {
  console.log('🔧 Testing Jira and Confluence Connector Creation...');

  try {
    // Test Jira connector creation
    const jiraConfig: ConnectorConfig = {
      source_type: 'jira',
      credentials: {
        base_url: 'https://test.atlassian.net',
        username: 'test@example.com',
        api_token: 'test-token',
        webhook_secret: 'test-secret',
      },
      sync_interval: 3600,
      team_boundaries: ['TEST'],
      access_controls: [],
      enabled: true,
    };

    const jiraConnector = new JiraConnector(jiraConfig);
    console.log('✅ Jira connector created successfully');

    // Test Confluence connector creation
    const confluenceConfig: ConnectorConfig = {
      source_type: 'confluence',
      credentials: {
        base_url: 'https://test.atlassian.net/wiki',
        username: 'test@example.com',
        api_token: 'test-token',
        webhook_secret: 'test-secret',
      },
      sync_interval: 3600,
      team_boundaries: ['TEST'],
      access_controls: [],
      enabled: true,
    };

    const confluenceConnector = new ConfluenceConnector(confluenceConfig);
    console.log('✅ Confluence connector created successfully');

    // Test basic methods
    console.log('Testing basic methods...');
    
    const jiraMetrics = await jiraConnector.getMetrics();
    console.log('Jira metrics:', jiraMetrics);
    
    const confluenceMetrics = await confluenceConnector.getMetrics();
    console.log('Confluence metrics:', confluenceMetrics);

    // Test webhook signature verification
    const testBody = '{"test": "data"}';
    const testSignature = 'test-signature';
    
    const jiraSignatureValid = jiraConnector.verifyWebhookSignature(testBody, testSignature);
    console.log(`Jira signature verification: ${jiraSignatureValid ? 'Valid' : 'Invalid (expected)'}`);
    
    const confluenceSignatureValid = confluenceConnector.verifyWebhookSignature(testBody, testSignature);
    console.log(`Confluence signature verification: ${confluenceSignatureValid ? 'Valid' : 'Invalid (expected)'}`);

    console.log('🎉 All basic tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testConnectorCreation().catch(console.error);
}

export { testConnectorCreation };