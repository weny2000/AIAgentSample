/**
 * Simple test to verify Git and S3 connectors can be instantiated
 */

import { GitConnector } from './ingestion/connectors/git-connector.js';
import { S3Connector } from './ingestion/connectors/s3-connector.js';
import { ConnectorConfig } from './ingestion/types.js';

async function testConnectorInstantiation() {
  console.log('=== Testing Git and S3 Connector Instantiation ===\n');

  // Test Git connector instantiation
  console.log('1. Testing Git Connector...');
  try {
    const gitConfig: ConnectorConfig = {
      source_type: 'git',
      credentials: {
        base_url: 'https://api.github.com',
        access_token: 'fake-token-for-testing',
      },
      sync_interval: 3600,
      team_boundaries: ['test-team'],
      access_controls: [],
      enabled: true,
    };

    const gitConnector = new GitConnector(gitConfig);
    console.log('✅ Git connector instantiated successfully');
    console.log('   - Constructor name:', gitConnector.constructor.name);
    
    // Test basic methods exist
    console.log('   - testConnection method exists:', typeof gitConnector.testConnection === 'function');
    console.log('   - authenticate method exists:', typeof gitConnector.authenticate === 'function');
    console.log('   - fetchDocuments method exists:', typeof gitConnector.fetchDocuments === 'function');
    console.log('   - getMetrics method exists:', typeof gitConnector.getMetrics === 'function');

  } catch (error) {
    console.error('❌ Git connector instantiation failed:', error instanceof Error ? error.message : String(error));
  }

  console.log();

  // Test S3 connector instantiation
  console.log('2. Testing S3 Connector...');
  try {
    const s3Config: ConnectorConfig = {
      source_type: 's3',
      credentials: {
        bucket_name: 'test-bucket',
        region: 'us-east-1',
        prefix: 'documents/',
        include_patterns: ['*.txt', '*.md'],
        exclude_patterns: ['*.tmp'],
      },
      sync_interval: 3600,
      team_boundaries: ['test-team'],
      access_controls: [],
      enabled: true,
    };

    const s3Connector = new S3Connector(s3Config);
    console.log('✅ S3 connector instantiated successfully');
    console.log('   - Constructor name:', s3Connector.constructor.name);
    
    // Test basic methods exist
    console.log('   - testConnection method exists:', typeof s3Connector.testConnection === 'function');
    console.log('   - authenticate method exists:', typeof s3Connector.authenticate === 'function');
    console.log('   - fetchDocuments method exists:', typeof s3Connector.fetchDocuments === 'function');
    console.log('   - getMetrics method exists:', typeof s3Connector.getMetrics === 'function');

  } catch (error) {
    console.error('❌ S3 connector instantiation failed:', error instanceof Error ? error.message : String(error));
  }

  console.log();

  // Test metrics functionality
  console.log('3. Testing Metrics...');
  try {
    const gitConfig: ConnectorConfig = {
      source_type: 'git',
      credentials: { access_token: 'fake' },
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    const gitConnector = new GitConnector(gitConfig);
    const metrics = await gitConnector.getMetrics();
    
    console.log('✅ Git connector metrics retrieved:');
    console.log('   - Documents processed:', metrics.documentsProcessed);
    console.log('   - Documents skipped:', metrics.documentsSkipped);
    console.log('   - Errors:', metrics.errors);
    console.log('   - Last sync time:', metrics.lastSyncTime);
    console.log('   - Avg processing time:', metrics.avgProcessingTime);

  } catch (error) {
    console.error('❌ Metrics test failed:', error instanceof Error ? error.message : String(error));
  }

  console.log();

  // Test reset functionality
  console.log('4. Testing Reset...');
  try {
    const s3Config: ConnectorConfig = {
      source_type: 's3',
      credentials: { bucket_name: 'test' },
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    const s3Connector = new S3Connector(s3Config);
    await s3Connector.reset();
    
    const metrics = await s3Connector.getMetrics();
    console.log('✅ S3 connector reset successful');
    console.log('   - Metrics after reset:', {
      documentsProcessed: metrics.documentsProcessed,
      documentsSkipped: metrics.documentsSkipped,
      errors: metrics.errors,
    });

  } catch (error) {
    console.error('❌ Reset test failed:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n=== Test Complete ===');
}

// Run the test
testConnectorInstantiation().catch(console.error);