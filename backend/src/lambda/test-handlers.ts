import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as artifactCheckHandler } from './handlers/artifact-check-handler';
import { handler as statusCheckHandler } from './handlers/status-check-handler';
import { handler as agentQueryHandler } from './handlers/agent-query-handler';

// Mock environment variables
process.env.ARTIFACT_CHECK_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
process.env.JOB_STATUS_TABLE = 'test-job-status-table';
process.env.TEAM_ROSTER_TABLE = 'test-team-roster-table';
process.env.AUDIT_LOG_TABLE = 'test-audit-log-table';
process.env.KENDRA_INDEX_ID = 'test-kendra-index';
process.env.AWS_REGION = 'us-east-1';

// Mock event with proper authorization context
const mockEvent: APIGatewayProxyEvent = {
  httpMethod: 'POST',
  path: '/test',
  headers: {
    'Content-Type': 'application/json',
    'X-Correlation-ID': 'test-correlation-id',
  },
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    authorizer: {
      claims: {
        sub: 'test-user-id',
        team_id: 'test-team-id',
        role: 'developer',
        department: 'engineering',
        clearance: 'standard',
        permissions: 'artifact-check,agent-query,read',
      },
    },
    httpMethod: 'POST',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'test-agent',
      userArn: null,
    },
    path: '/test',
    protocol: 'HTTP/1.1',
    requestId: 'test-request-id',
    requestTime: '01/Jan/2023:00:00:00 +0000',
    requestTimeEpoch: 1672531200,
    resourceId: 'test-resource',
    resourcePath: '/test',
    stage: 'test',
  },
  resource: '/test',
  body: null,
  isBase64Encoded: false,
};

async function testHandlers() {
  console.log('Testing Lambda handlers...\n');

  // Test artifact check handler with missing body
  console.log('1. Testing artifact check handler (missing body):');
  try {
    const result = await artifactCheckHandler(mockEvent);
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Body: ${result.body}\n`);
  } catch (error) {
    console.log(`   Error: ${error}\n`);
  }

  // Test status check handler with missing job ID
  console.log('2. Testing status check handler (missing job ID):');
  try {
    const statusEvent = { ...mockEvent, httpMethod: 'GET', path: '/agent/status' };
    const result = await statusCheckHandler(statusEvent);
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Body: ${result.body}\n`);
  } catch (error) {
    console.log(`   Error: ${error}\n`);
  }

  // Test agent query handler with missing body
  console.log('3. Testing agent query handler (missing body):');
  try {
    const result = await agentQueryHandler(mockEvent);
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Body: ${result.body}\n`);
  } catch (error) {
    console.log(`   Error: ${error}\n`);
  }

  console.log('Handler tests completed!');
}

testHandlers().catch(console.error);