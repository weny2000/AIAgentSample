/**
 * Test script for Git and S3 connectors
 */

import { GitConnector } from './ingestion/connectors/git-connector.js';
import { S3Connector } from './ingestion/connectors/s3-connector.js';
import { ConnectorFactory } from './ingestion/connectors/base-connector.js';
import { ConnectorConfig } from './ingestion/types.js';

async function testGitConnector() {
  console.log('\n=== Testing Git Connector ===');

  // Test GitHub connector
  const githubConfig: ConnectorConfig = {
    source_type: 'git',
    credentials: {
      base_url: 'https://api.github.com',
      access_token: process.env.GITHUB_TOKEN || 'fake-token-for-testing',
    },
    sync_interval: 3600,
    team_boundaries: ['test-team'],
    access_controls: [],
    enabled: true,
  };

  try {
    const gitConnector = new GitConnector(githubConfig);
    
    console.log('Testing connection...');
    const isConnected = await gitConnector.testConnection();
    console.log('Connection test result:', isConnected);

    if (isConnected) {
      console.log('Testing authentication...');
      const isAuthenticated = await gitConnector.authenticate();
      console.log('Authentication result:', isAuthenticated);

      if (isAuthenticated) {
        console.log('Fetching documents (limited to 5)...');
        const documents = await gitConnector.fetchDocuments({ limit: 5 });
        console.log(`Fetched ${documents.length} documents`);
        
        if (documents.length > 0) {
          console.log('Sample document:', {
            id: documents[0].id,
            source_type: documents[0].source_type,
            team_id: documents[0].team_id,
            title: documents[0].metadata.title,
            repository: documents[0].metadata.repository,
            content_preview: documents[0].content.substring(0, 100) + '...',
          });
        }

        console.log('Getting metrics...');
        const metrics = await gitConnector.getMetrics();
        console.log('Metrics:', metrics);
      }
    }

  } catch (error) {
    console.error('Git connector test failed:', error instanceof Error ? error.message : String(error));
  }
}

async function testS3Connector() {
  console.log('\n=== Testing S3 Connector ===');

  // Test S3 connector
  const s3Config: ConnectorConfig = {
    source_type: 's3',
    credentials: {
      bucket_name: process.env.S3_BUCKET_NAME || 'test-bucket',
      region: process.env.AWS_REGION || 'us-east-1',
      prefix: 'documents/',
      include_patterns: ['*.txt', '*.md', '*.json'],
      exclude_patterns: ['*.tmp', '*.log'],
    },
    sync_interval: 3600,
    team_boundaries: ['test-team'],
    access_controls: [],
    enabled: true,
  };

  try {
    const s3Connector = new S3Connector(s3Config);
    
    console.log('Testing connection...');
    const isConnected = await s3Connector.testConnection();
    console.log('Connection test result:', isConnected);

    if (isConnected) {
      console.log('Testing authentication...');
      const isAuthenticated = await s3Connector.authenticate();
      console.log('Authentication result:', isAuthenticated);

      if (isAuthenticated) {
        console.log('Fetching documents (limited to 5)...');
        const documents = await s3Connector.fetchDocuments({ limit: 5 });
        console.log(`Fetched ${documents.length} documents`);
        
        if (documents.length > 0) {
          console.log('Sample document:', {
            id: documents[0].id,
            source_type: documents[0].source_type,
            team_id: documents[0].team_id,
            title: documents[0].metadata.title,
            file_path: documents[0].metadata.file_path,
            content_type: documents[0].metadata.content_type,
            size_bytes: documents[0].metadata.size_bytes,
            content_preview: documents[0].content.substring(0, 100) + '...',
          });
        }

        console.log('Getting metrics...');
        const metrics = await s3Connector.getMetrics();
        console.log('Metrics:', metrics);
      }
    }

  } catch (error) {
    console.error('S3 connector test failed:', error instanceof Error ? error.message : String(error));
  }
}

async function testConnectorFactory() {
  console.log('\n=== Testing Connector Factory ===');

  try {
    // Initialize the factory
    ConnectorFactory.initialize();
    
    // Wait a bit for dynamic imports to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Supported connector types:', ConnectorFactory.getSupportedTypes());

    // Test creating Git connector via factory
    const gitConfig: ConnectorConfig = {
      source_type: 'git',
      credentials: {
        base_url: 'https://api.github.com',
        access_token: 'fake-token',
      },
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    const gitConnector = ConnectorFactory.create(gitConfig);
    console.log('Created Git connector via factory:', gitConnector.constructor.name);

    // Test creating S3 connector via factory
    const s3Config: ConnectorConfig = {
      source_type: 's3',
      credentials: {
        bucket_name: 'test-bucket',
        region: 'us-east-1',
      },
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    const s3Connector = ConnectorFactory.create(s3Config);
    console.log('Created S3 connector via factory:', s3Connector.constructor.name);

  } catch (error) {
    console.error('Connector factory test failed:', error instanceof Error ? error.message : String(error));
  }
}

async function testGitProviders() {
  console.log('\n=== Testing Different Git Providers ===');

  const providers = [
    {
      name: 'GitHub',
      config: {
        base_url: 'https://api.github.com',
        access_token: process.env.GITHUB_TOKEN || 'fake-token',
      }
    },
    {
      name: 'GitLab',
      config: {
        base_url: 'https://gitlab.com/api/v4',
        access_token: process.env.GITLAB_TOKEN || 'fake-token',
      }
    },
    {
      name: 'Bitbucket',
      config: {
        base_url: 'https://api.bitbucket.org/2.0',
        username: process.env.BITBUCKET_USERNAME || 'fake-user',
        password: process.env.BITBUCKET_PASSWORD || 'fake-password',
      }
    }
  ];

  for (const provider of providers) {
    console.log(`\nTesting ${provider.name}...`);
    
    const config: ConnectorConfig = {
      source_type: 'git',
      credentials: provider.config,
      sync_interval: 3600,
      team_boundaries: [],
      access_controls: [],
      enabled: true,
    };

    try {
      const connector = new GitConnector(config);
      const isConnected = await connector.testConnection();
      console.log(`${provider.name} connection:`, isConnected);
    } catch (error) {
      console.log(`${provider.name} test failed:`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function testS3CrossAccount() {
  console.log('\n=== Testing S3 Cross-Account Access ===');

  const crossAccountConfig: ConnectorConfig = {
    source_type: 's3',
    credentials: {
      bucket_name: process.env.S3_CROSS_ACCOUNT_BUCKET || 'cross-account-bucket',
      region: process.env.AWS_REGION || 'us-east-1',
      cross_account_role_arn: process.env.CROSS_ACCOUNT_ROLE_ARN || 'arn:aws:iam::123456789012:role/CrossAccountRole',
      external_id: process.env.EXTERNAL_ID || 'unique-external-id',
    },
    sync_interval: 3600,
    team_boundaries: [],
    access_controls: [],
    enabled: true,
  };

  try {
    const s3Connector = new S3Connector(crossAccountConfig);
    
    console.log('Testing cross-account connection...');
    const isConnected = await s3Connector.testConnection();
    console.log('Cross-account connection result:', isConnected);

    if (isConnected) {
      console.log('Testing cross-account authentication...');
      const isAuthenticated = await s3Connector.authenticate();
      console.log('Cross-account authentication result:', isAuthenticated);
    }

  } catch (error) {
    console.error('S3 cross-account test failed:', error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  console.log('Starting Git and S3 connector tests...');
  
  await testConnectorFactory();
  await testGitProviders();
  await testGitConnector();
  await testS3Connector();
  await testS3CrossAccount();
  
  console.log('\nAll tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  testGitConnector,
  testS3Connector,
  testConnectorFactory,
  testGitProviders,
  testS3CrossAccount,
};