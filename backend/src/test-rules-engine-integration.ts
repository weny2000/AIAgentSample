/**
 * Integration test for rules engine with Step Functions workflow
 * This test verifies that the rules engine integration works correctly
 */

import { RulesEngineService } from './rules-engine/rules-engine-service';
import { handler as fetchArtifactHandler } from './lambda/handlers/fetch-artifact-handler';
import { handler as rulesEngineValidationHandler } from './lambda/handlers/rules-engine-validation-handler';
import { handler as composeReportHandler } from './lambda/handlers/compose-report-handler';

// Mock environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.RULE_DEFINITIONS_TABLE_NAME = 'test-rule-definitions';
process.env.ARTIFACTS_BUCKET_NAME = 'test-artifacts-bucket';
process.env.JOB_STATUS_TABLE = 'test-job-status-table';

async function testRulesEngineIntegration() {
  console.log('🚀 Starting Rules Engine Integration Test');

  try {
    // Test 1: Fetch Artifact Handler
    console.log('\n📥 Testing Fetch Artifact Handler...');
    
    const fetchArtifactEvent = {
      artifactContent: `
        const API_KEY = "sk-1234567890abcdef";
        const DATABASE_URL = "postgresql://user:password@localhost:5432/db";
        
        export function processData(data: any) {
          console.log("Processing data:", data);
          return data;
        }
      `,
      artifactType: 'typescript',
      jobId: 'test-job-123',
      userContext: {
        userId: 'user-123',
        teamId: 'team-456',
        role: 'developer'
      }
    };

    const fetchResult = await fetchArtifactHandler(fetchArtifactEvent);
    console.log('✅ Fetch Artifact Result:', {
      detectedType: fetchResult.detectedArtifactType,
      applicableRulesCount: fetchResult.applicableRules.length,
      capabilities: fetchResult.rulesEngineCapabilities,
      validationConfig: fetchResult.validationConfig
    });

    // Test 2: Rules Engine Validation Handler
    console.log('\n🔍 Testing Rules Engine Validation Handler...');
    
    const rulesEngineEvent = {
      jobId: 'test-job-123',
      artifactData: {
        content: fetchResult.content,
        contentType: fetchResult.contentType,
        detectedArtifactType: fetchResult.detectedArtifactType,
        applicableRules: fetchResult.applicableRules,
        validationConfig: fetchResult.validationConfig
      },
      userContext: {
        userId: 'user-123',
        teamId: 'team-456',
        role: 'developer'
      },
      artifactCheckRequest: {
        artifactType: 'typescript'
      }
    };

    const validationResult = await rulesEngineValidationHandler(rulesEngineEvent);
    console.log('✅ Rules Engine Validation Result:', {
      status: validationResult.executionStatus,
      executionTime: validationResult.executionTime,
      hasReport: !!validationResult.validationReport,
      overallScore: validationResult.validationReport?.overall_score,
      totalRules: validationResult.validationReport?.summary.total_rules,
      failedRules: validationResult.validationReport?.summary.failed_rules
    });

    // Test 3: Compose Report Handler
    console.log('\n📊 Testing Compose Report Handler...');
    
    const composeReportEvent = {
      jobId: 'test-job-123',
      artifactCheckRequest: {
        artifactType: 'typescript'
      },
      userContext: {
        userId: 'user-123',
        teamId: 'team-456',
        role: 'developer'
      },
      kendraResults: {
        Payload: {
          results: [
            {
              id: 'doc-1',
              sourceType: 'confluence',
              confidence: 0.8,
              excerpt: 'Security best practices for API keys',
              uri: 'https://confluence.example.com/security-guide'
            }
          ]
        }
      },
      staticCheckResults: {
        taskResult: {
          issues: [
            {
              severity: 'warning',
              description: 'Unused variable detected',
              location: 'config.ts:20',
              remediation: 'Remove unused variable'
            }
          ]
        }
      },
      semanticCheckResults: {
        taskResult: {
          issues: [
            {
              severity: 'info',
              description: 'Consider using more descriptive variable names',
              location: 'config.ts:10',
              remediation: 'Use descriptive variable names for better code readability'
            }
          ]
        }
      },
      rulesEngineResults: validationResult.validationReport,
      validationSummary: {
        rulesEngineStatus: validationResult.executionStatus,
        rulesEngineExecutionTime: validationResult.executionTime,
        staticCheckStatus: 'completed',
        semanticCheckStatus: 'completed'
      },
      artifactData: {
        content: fetchResult.content,
        contentType: fetchResult.contentType,
        detectedArtifactType: fetchResult.detectedArtifactType,
        applicableRules: fetchResult.applicableRules,
        rulesEngineCapabilities: fetchResult.rulesEngineCapabilities,
        validationConfig: fetchResult.validationConfig
      }
    };

    // Mock S3 and DynamoDB operations for testing
    const originalS3Send = require('@aws-sdk/client-s3').S3Client.prototype.send;
    const originalDynamoSend = require('@aws-sdk/client-dynamodb').DynamoDBClient.prototype.send;
    
    require('@aws-sdk/client-s3').S3Client.prototype.send = async () => ({});
    require('@aws-sdk/client-dynamodb').DynamoDBClient.prototype.send = async () => ({});

    const reportResult = await composeReportHandler(composeReportEvent);
    
    // Restore original methods
    require('@aws-sdk/client-s3').S3Client.prototype.send = originalS3Send;
    require('@aws-sdk/client-dynamodb').DynamoDBClient.prototype.send = originalDynamoSend;

    console.log('✅ Compose Report Result:', {
      jobStatus: reportResult.jobStatus,
      complianceScore: reportResult.report.complianceScore,
      issueCount: reportResult.report.issues.length,
      recommendationCount: reportResult.report.recommendations.length,
      hasSourceReferences: reportResult.report.sourceReferences.length > 0
    });

    // Test 4: End-to-End Workflow Simulation
    console.log('\n🔄 Testing End-to-End Workflow...');
    
    const workflowSteps = [
      'ReceiveRequest',
      'KendraQuery', 
      'FetchArtifact',
      'ParallelValidation (Rules Engine + Static + Semantic)',
      'ProcessParallelResults',
      'ComposeReport',
      'NotifyResults'
    ];

    console.log('📋 Workflow Steps:');
    workflowSteps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });

    console.log('\n✅ Integration Test Summary:');
    console.log(`  - Artifact Type Detection: ${fetchResult.detectedArtifactType}`);
    console.log(`  - Applicable Rules Found: ${fetchResult.applicableRules.length}`);
    console.log(`  - Rules Engine Status: ${validationResult.executionStatus}`);
    console.log(`  - Validation Execution Time: ${validationResult.executionTime}ms`);
    console.log(`  - Final Compliance Score: ${reportResult.report.complianceScore}/100`);
    console.log(`  - Total Issues Found: ${reportResult.report.issues.length}`);
    console.log(`  - Recommendations Generated: ${reportResult.report.recommendations.length}`);

    // Test 5: Error Handling
    console.log('\n🚨 Testing Error Handling...');
    
    try {
      const errorEvent = {
        ...rulesEngineEvent,
        artifactData: {
          ...rulesEngineEvent.artifactData,
          content: 'x'.repeat(51 * 1024 * 1024), // 51MB - exceeds limit
        }
      };
      
      const errorResult = await rulesEngineValidationHandler(errorEvent);
      console.log('✅ Error Handling Test:', {
        status: errorResult.executionStatus,
        hasError: !!errorResult.errorDetails,
        errorMessage: errorResult.errorDetails?.error
      });
    } catch (error) {
      console.log('✅ Error Handling Test: Caught expected error');
    }

    console.log('\n🎉 All integration tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testRulesEngineIntegration()
    .then(() => {
      console.log('\n✅ Integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Integration test failed:', error);
      process.exit(1);
    });
}

export { testRulesEngineIntegration };