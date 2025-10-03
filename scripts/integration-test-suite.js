#!/usr/bin/env node

/**
 * Comprehensive Integration Test Suite
 * Tests all system components working together with realistic data volumes
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const CONFIG = {
  environments: {
    staging: {
      apiUrl: process.env.STAGING_API_URL || 'https://api-staging.ai-agent.com',
      frontendUrl: process.env.STAGING_FRONTEND_URL || 'https://staging.ai-agent.com',
      region: 'us-east-1'
    },
    production: {
      apiUrl: process.env.PRODUCTION_API_URL || 'https://api.ai-agent.com',
      frontendUrl: process.env.PRODUCTION_FRONTEND_URL || 'https://ai-agent.com',
      region: 'us-east-1'
    }
  },
  testData: {
    users: 50,
    artifacts: 100,
    concurrentRequests: 25,
    testDurationMinutes: 10
  },
  thresholds: {
    responseTime: {
      p95: 2000, // 2 seconds
      p99: 5000  // 5 seconds
    },
    errorRate: 0.01, // 1%
    availability: 0.999 // 99.9%
  }
};

class IntegrationTestSuite {
  constructor(environment = 'staging') {
    this.environment = environment;
    this.config = CONFIG.environments[environment];
    this.results = {
      startTime: new Date(),
      tests: [],
      metrics: {},
      errors: []
    };
  }

  async runAllTests() {
    console.log(`🚀 Starting integration tests for ${this.environment} environment`);
    console.log(`API URL: ${this.config.apiUrl}`);
    console.log(`Frontend URL: ${this.config.frontendUrl}`);

    try {
      // 1. Health checks
      await this.runHealthChecks();
      
      // 2. Authentication flow
      await this.testAuthenticationFlow();
      
      // 3. Core functionality tests
      await this.testArtifactCheckWorkflow();
      await this.testAgentQuerySystem();
      await this.testKendraSearch();
      
      // 4. Cross-team impact analysis
      await this.testImpactAnalysis();
      
      // 5. Data ingestion pipeline
      await this.testDataIngestion();
      
      // 6. Admin functionality
      await this.testAdminOperations();
      
      // 7. Load testing with realistic volumes
      await this.runLoadTests();
      
      // 8. Security validation
      await this.testSecurityControls();
      
      // 9. End-to-end user journeys
      await this.testUserJourneys();

      this.generateReport();
      
    } catch (error) {
      console.error('❌ Integration test suite failed:', error);
      this.results.errors.push({
        test: 'Integration Test Suite',
        error: error.message,
        timestamp: new Date()
      });
      process.exit(1);
    }
  }

  async runHealthChecks() {
    console.log('\n📊 Running health checks...');
    
    const healthEndpoints = [
      '/health',
      '/health/database',
      '/health/kendra',
      '/health/s3',
      '/health/dynamodb'
    ];

    for (const endpoint of healthEndpoints) {
      try {
        const response = await axios.get(`${this.config.apiUrl}${endpoint}`, {
          timeout: 10000
        });
        
        this.recordTest(`Health Check: ${endpoint}`, true, response.data);
        console.log(`✅ ${endpoint}: ${response.status}`);
      } catch (error) {
        this.recordTest(`Health Check: ${endpoint}`, false, error.message);
        console.log(`❌ ${endpoint}: ${error.message}`);
      }
    }
  }

  async testAuthenticationFlow() {
    console.log('\n🔐 Testing authentication flow...');
    
    try {
      // Test OIDC authentication
      const authResponse = await axios.post(`${this.config.apiUrl}/auth/login`, {
        username: process.env.TEST_USERNAME,
        password: process.env.TEST_PASSWORD
      });

      if (authResponse.data.token) {
        this.authToken = authResponse.data.token;
        this.recordTest('Authentication Flow', true, 'Token received');
        console.log('✅ Authentication successful');
      } else {
        throw new Error('No token received');
      }
    } catch (error) {
      this.recordTest('Authentication Flow', false, error.message);
      console.log(`❌ Authentication failed: ${error.message}`);
    }
  }

  async testArtifactCheckWorkflow() {
    console.log('\n📋 Testing artifact check workflow...');
    
    const testArtifacts = [
      {
        type: 'cloudformation',
        content: this.generateCloudFormationTemplate(),
        expectedScore: 85
      },
      {
        type: 'terraform',
        content: this.generateTerraformConfig(),
        expectedScore: 90
      },
      {
        type: 'dockerfile',
        content: this.generateDockerfile(),
        expectedScore: 80
      }
    ];

    for (const artifact of testArtifacts) {
      try {
        // Submit artifact for checking
        const submitResponse = await axios.post(
          `${this.config.apiUrl}/agent/check`,
          {
            artifactType: artifact.type,
            content: artifact.content,
            teamId: 'test-team'
          },
          {
            headers: { Authorization: `Bearer ${this.authToken}` }
          }
        );

        const jobId = submitResponse.data.jobId;
        console.log(`📤 Submitted ${artifact.type} artifact: ${jobId}`);

        // Poll for completion
        let status = 'RUNNING';
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max

        while (status === 'RUNNING' && attempts < maxAttempts) {
          await this.sleep(5000); // Wait 5 seconds
          
          const statusResponse = await axios.get(
            `${this.config.apiUrl}/agent/status/${jobId}`,
            {
              headers: { Authorization: `Bearer ${this.authToken}` }
            }
          );

          status = statusResponse.data.status;
          attempts++;
        }

        if (status === 'COMPLETED') {
          const result = await axios.get(
            `${this.config.apiUrl}/agent/result/${jobId}`,
            {
              headers: { Authorization: `Bearer ${this.authToken}` }
            }
          );

          const score = result.data.complianceScore;
          const success = score >= artifact.expectedScore * 0.8; // 20% tolerance
          
          this.recordTest(
            `Artifact Check: ${artifact.type}`,
            success,
            `Score: ${score}, Expected: ${artifact.expectedScore}`
          );
          
          console.log(`✅ ${artifact.type}: Score ${score}`);
        } else {
          throw new Error(`Workflow failed or timed out: ${status}`);
        }
      } catch (error) {
        this.recordTest(`Artifact Check: ${artifact.type}`, false, error.message);
        console.log(`❌ ${artifact.type}: ${error.message}`);
      }
    }
  }

  async testAgentQuerySystem() {
    console.log('\n🤖 Testing agent query system...');
    
    const testQueries = [
      {
        query: "What are the security best practices for Lambda functions?",
        expectedKeywords: ['encryption', 'IAM', 'VPC']
      },
      {
        query: "How should I structure a CloudFormation template for high availability?",
        expectedKeywords: ['multi-az', 'redundancy', 'failover']
      },
      {
        query: "What are the team policies for code review?",
        expectedKeywords: ['approval', 'review', 'standards']
      }
    ];

    for (const testQuery of testQueries) {
      try {
        const response = await axios.post(
          `${this.config.apiUrl}/agent/query`,
          {
            query: testQuery.query,
            teamId: 'test-team',
            userId: 'test-user'
          },
          {
            headers: { Authorization: `Bearer ${this.authToken}` }
          }
        );

        const answer = response.data.answer.toLowerCase();
        const hasKeywords = testQuery.expectedKeywords.some(keyword => 
          answer.includes(keyword.toLowerCase())
        );

        this.recordTest(
          `Agent Query: ${testQuery.query.substring(0, 50)}...`,
          hasKeywords,
          `Keywords found: ${hasKeywords}`
        );

        console.log(`✅ Query processed: ${hasKeywords ? 'Relevant' : 'Needs review'}`);
      } catch (error) {
        this.recordTest(`Agent Query`, false, error.message);
        console.log(`❌ Query failed: ${error.message}`);
      }
    }
  }

  async testKendraSearch() {
    console.log('\n🔍 Testing Kendra search functionality...');
    
    const searchQueries = [
      'security policies',
      'deployment procedures',
      'team guidelines',
      'infrastructure standards'
    ];

    for (const query of searchQueries) {
      try {
        const response = await axios.get(
          `${this.config.apiUrl}/kendra/search`,
          {
            params: { query, limit: 10 },
            headers: { Authorization: `Bearer ${this.authToken}` }
          }
        );

        const results = response.data.results;
        const hasResults = results && results.length > 0;
        
        this.recordTest(
          `Kendra Search: ${query}`,
          hasResults,
          `Results: ${results ? results.length : 0}`
        );

        console.log(`✅ Search "${query}": ${results ? results.length : 0} results`);
      } catch (error) {
        this.recordTest(`Kendra Search: ${query}`, false, error.message);
        console.log(`❌ Search "${query}": ${error.message}`);
      }
    }
  }

  async testImpactAnalysis() {
    console.log('\n🔗 Testing cross-team impact analysis...');
    
    try {
      const response = await axios.post(
        `${this.config.apiUrl}/analysis/impact`,
        {
          serviceId: 'test-service-1',
          changeType: 'api-modification',
          description: 'Adding new required field to API response'
        },
        {
          headers: { Authorization: `Bearer ${this.authToken}` }
        }
      );

      const analysis = response.data;
      const hasImpacts = analysis.impactedServices && analysis.impactedServices.length > 0;
      
      this.recordTest(
        'Impact Analysis',
        hasImpacts,
        `Impacted services: ${analysis.impactedServices ? analysis.impactedServices.length : 0}`
      );

      console.log(`✅ Impact analysis: ${analysis.impactedServices ? analysis.impactedServices.length : 0} services affected`);
    } catch (error) {
      this.recordTest('Impact Analysis', false, error.message);
      console.log(`❌ Impact analysis: ${error.message}`);
    }
  }

  async testDataIngestion() {
    console.log('\n📥 Testing data ingestion pipeline...');
    
    const connectors = ['slack', 'jira', 'confluence', 'git'];
    
    for (const connector of connectors) {
      try {
        const response = await axios.get(
          `${this.config.apiUrl}/admin/connectors/${connector}/status`,
          {
            headers: { Authorization: `Bearer ${this.authToken}` }
          }
        );

        const isHealthy = response.data.status === 'healthy';
        
        this.recordTest(
          `Data Ingestion: ${connector}`,
          isHealthy,
          `Status: ${response.data.status}`
        );

        console.log(`✅ ${connector} connector: ${response.data.status}`);
      } catch (error) {
        this.recordTest(`Data Ingestion: ${connector}`, false, error.message);
        console.log(`❌ ${connector} connector: ${error.message}`);
      }
    }
  }

  async testAdminOperations() {
    console.log('\n⚙️ Testing admin operations...');
    
    try {
      // Test persona management
      const personaResponse = await axios.get(
        `${this.config.apiUrl}/admin/personas`,
        {
          headers: { Authorization: `Bearer ${this.authToken}` }
        }
      );

      const hasPersonas = personaResponse.data.personas && personaResponse.data.personas.length > 0;
      
      this.recordTest(
        'Admin: Persona Management',
        hasPersonas,
        `Personas: ${personaResponse.data.personas ? personaResponse.data.personas.length : 0}`
      );

      // Test policy management
      const policyResponse = await axios.get(
        `${this.config.apiUrl}/admin/policies`,
        {
          headers: { Authorization: `Bearer ${this.authToken}` }
        }
      );

      const hasPolicies = policyResponse.data.policies && policyResponse.data.policies.length > 0;
      
      this.recordTest(
        'Admin: Policy Management',
        hasPolicies,
        `Policies: ${policyResponse.data.policies ? policyResponse.data.policies.length : 0}`
      );

      console.log('✅ Admin operations functional');
    } catch (error) {
      this.recordTest('Admin Operations', false, error.message);
      console.log(`❌ Admin operations: ${error.message}`);
    }
  }

  async runLoadTests() {
    console.log('\n🚀 Running load tests with realistic data volumes...');
    
    const concurrentUsers = CONFIG.testData.concurrentRequests;
    const testDuration = CONFIG.testData.testDurationMinutes * 60 * 1000; // Convert to ms
    
    console.log(`Testing with ${concurrentUsers} concurrent users for ${CONFIG.testData.testDurationMinutes} minutes`);

    const startTime = Date.now();
    const requests = [];
    const results = [];

    // Generate concurrent requests
    for (let i = 0; i < concurrentUsers; i++) {
      requests.push(this.simulateUserSession(i, testDuration, results));
    }

    await Promise.all(requests);

    // Analyze results
    const totalRequests = results.length;
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const errorRate = failedRequests / totalRequests;
    
    const responseTimes = results.filter(r => r.success).map(r => r.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const p95ResponseTime = this.percentile(responseTimes, 95);
    const p99ResponseTime = this.percentile(responseTimes, 99);

    const loadTestPassed = 
      errorRate <= CONFIG.thresholds.errorRate &&
      p95ResponseTime <= CONFIG.thresholds.responseTime.p95 &&
      p99ResponseTime <= CONFIG.thresholds.responseTime.p99;

    this.recordTest(
      'Load Test',
      loadTestPassed,
      `Requests: ${totalRequests}, Error Rate: ${(errorRate * 100).toFixed(2)}%, P95: ${p95ResponseTime}ms, P99: ${p99ResponseTime}ms`
    );

    console.log(`📊 Load test results:`);
    console.log(`   Total requests: ${totalRequests}`);
    console.log(`   Successful: ${successfulRequests}`);
    console.log(`   Failed: ${failedRequests}`);
    console.log(`   Error rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`   Avg response time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`   P95 response time: ${p95ResponseTime}ms`);
    console.log(`   P99 response time: ${p99ResponseTime}ms`);
    console.log(`   ${loadTestPassed ? '✅' : '❌'} Load test ${loadTestPassed ? 'passed' : 'failed'}`);
  }

  async simulateUserSession(userId, duration, results) {
    const endTime = Date.now() + duration;
    
    while (Date.now() < endTime) {
      // Simulate different user actions
      const actions = [
        () => this.makeRequest('GET', '/health'),
        () => this.makeRequest('POST', '/agent/query', { query: 'test query', teamId: 'test-team' }),
        () => this.makeRequest('GET', '/kendra/search', null, { query: 'test search' }),
        () => this.makeRequest('GET', '/admin/personas')
      ];

      const action = actions[Math.floor(Math.random() * actions.length)];
      
      try {
        const startTime = Date.now();
        await action();
        const responseTime = Date.now() - startTime;
        
        results.push({
          userId,
          success: true,
          responseTime,
          timestamp: new Date()
        });
      } catch (error) {
        results.push({
          userId,
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }

      // Wait between requests (simulate user think time)
      await this.sleep(Math.random() * 2000 + 1000); // 1-3 seconds
    }
  }

  async makeRequest(method, endpoint, data = null, params = null) {
    const config = {
      method,
      url: `${this.config.apiUrl}${endpoint}`,
      headers: { Authorization: `Bearer ${this.authToken}` },
      timeout: 30000
    };

    if (data) config.data = data;
    if (params) config.params = params;

    return await axios(config);
  }

  async testSecurityControls() {
    console.log('\n🔒 Testing security controls...');
    
    // Test unauthorized access
    try {
      await axios.get(`${this.config.apiUrl}/admin/personas`);
      this.recordTest('Security: Unauthorized Access', false, 'Should have been blocked');
    } catch (error) {
      const isBlocked = error.response && error.response.status === 401;
      this.recordTest('Security: Unauthorized Access', isBlocked, `Status: ${error.response?.status}`);
      console.log(`✅ Unauthorized access properly blocked`);
    }

    // Test input validation
    try {
      await axios.post(
        `${this.config.apiUrl}/agent/query`,
        { query: 'x'.repeat(10000) }, // Oversized input
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );
      this.recordTest('Security: Input Validation', false, 'Should have been rejected');
    } catch (error) {
      const isRejected = error.response && error.response.status === 400;
      this.recordTest('Security: Input Validation', isRejected, `Status: ${error.response?.status}`);
      console.log(`✅ Input validation working`);
    }
  }

  async testUserJourneys() {
    console.log('\n👤 Testing end-to-end user journeys...');
    
    // Journey 1: New user artifact submission
    try {
      console.log('   Testing: New user artifact submission journey');
      
      // 1. Login
      // 2. Upload artifact
      const submitResponse = await axios.post(
        `${this.config.apiUrl}/agent/check`,
        {
          artifactType: 'cloudformation',
          content: this.generateCloudFormationTemplate(),
          teamId: 'test-team'
        },
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );

      // 3. Check status
      const jobId = submitResponse.data.jobId;
      await this.sleep(2000);
      
      const statusResponse = await axios.get(
        `${this.config.apiUrl}/agent/status/${jobId}`,
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );

      const journeySuccess = statusResponse.data.status !== 'FAILED';
      
      this.recordTest(
        'User Journey: Artifact Submission',
        journeySuccess,
        `Status: ${statusResponse.data.status}`
      );

      console.log(`✅ Artifact submission journey: ${statusResponse.data.status}`);
    } catch (error) {
      this.recordTest('User Journey: Artifact Submission', false, error.message);
      console.log(`❌ Artifact submission journey: ${error.message}`);
    }

    // Journey 2: Knowledge search and query
    try {
      console.log('   Testing: Knowledge search and query journey');
      
      // 1. Search knowledge base
      const searchResponse = await axios.get(
        `${this.config.apiUrl}/kendra/search`,
        {
          params: { query: 'security best practices' },
          headers: { Authorization: `Bearer ${this.authToken}` }
        }
      );

      // 2. Ask follow-up question
      const queryResponse = await axios.post(
        `${this.config.apiUrl}/agent/query`,
        {
          query: 'Can you explain more about the security practices mentioned?',
          teamId: 'test-team'
        },
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );

      const journeySuccess = searchResponse.data.results && queryResponse.data.answer;
      
      this.recordTest(
        'User Journey: Knowledge Search',
        journeySuccess,
        `Search results: ${searchResponse.data.results?.length}, Answer: ${!!queryResponse.data.answer}`
      );

      console.log(`✅ Knowledge search journey completed`);
    } catch (error) {
      this.recordTest('User Journey: Knowledge Search', false, error.message);
      console.log(`❌ Knowledge search journey: ${error.message}`);
    }
  }

  recordTest(testName, success, details) {
    this.results.tests.push({
      name: testName,
      success,
      details,
      timestamp: new Date()
    });
  }

  generateReport() {
    const endTime = new Date();
    const duration = endTime - this.results.startTime;
    
    const totalTests = this.results.tests.length;
    const passedTests = this.results.tests.filter(t => t.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = (passedTests / totalTests) * 100;

    const report = {
      environment: this.environment,
      startTime: this.results.startTime,
      endTime,
      duration: `${Math.round(duration / 1000)}s`,
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate: `${successRate.toFixed(1)}%`
      },
      tests: this.results.tests,
      errors: this.results.errors
    };

    // Write report to file
    const reportPath = `test-results/integration-test-report-${this.environment}-${Date.now()}.json`;
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Integration Test Results:');
    console.log(`   Environment: ${this.environment}`);
    console.log(`   Duration: ${report.duration}`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Success Rate: ${report.summary.successRate}`);
    console.log(`   Report saved: ${reportPath}`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests.filter(t => !t.success).forEach(test => {
        console.log(`   - ${test.name}: ${test.details}`);
      });
    }

    return successRate >= 95; // 95% success rate required
  }

  // Utility methods
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  percentile(arr, p) {
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }

  generateCloudFormationTemplate() {
    return JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'Test CloudFormation template',
      Resources: {
        TestBucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [{
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256'
                }
              }]
            }
          }
        }
      }
    }, null, 2);
  }

  generateTerraformConfig() {
    return `
resource "aws_s3_bucket" "test_bucket" {
  bucket = "test-bucket-\${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_encryption" "test_bucket_encryption" {
  bucket = aws_s3_bucket.test_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 8
}
`;
  }

  generateDockerfile() {
    return `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

USER node

EXPOSE 3000

CMD ["npm", "start"]
`;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = process.argv[2] || 'staging';
  const testSuite = new IntegrationTestSuite(environment);
  
  testSuite.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

export default IntegrationTestSuite;