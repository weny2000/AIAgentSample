#!/usr/bin/env ts-node

/**
 * Simple test script to demonstrate the rules engine functionality
 */

import { RulesEngine } from '../rules-engine/rules-engine';
import { RuleRepository } from '../repositories/rule-repository';
import { ArtifactValidationRequest, RuleDefinition } from '../rules-engine/types';
import { DEFAULT_RULES } from '../rules-engine/default-rules';

// Mock repository for testing
class MockRuleRepository extends RuleRepository {
  private rules: RuleDefinition[] = [];

  constructor() {
    super({ region: 'us-east-1', tableName: 'mock-table' });
    
    // Add some default rules with timestamps
    this.rules = DEFAULT_RULES.map(rule => ({
      ...rule,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
  }

  async getEnabledRules(): Promise<RuleDefinition[]> {
    return this.rules.filter(rule => rule.enabled);
  }

  async getAllRules(): Promise<RuleDefinition[]> {
    return this.rules;
  }
}

async function testRulesEngine() {
  console.log('🚀 Testing Rules Engine Implementation');
  console.log('=====================================\n');

  // Create mock repository and rules engine
  const mockRepository = new MockRuleRepository();
  const rulesEngine = new RulesEngine(mockRepository);

  // Test 1: TypeScript code with potential issues
  console.log('📝 Test 1: TypeScript Code Validation');
  console.log('--------------------------------------');
  
  const typescriptRequest: ArtifactValidationRequest = {
    artifact_id: 'test-typescript-001',
    artifact_type: 'typescript',
    content: `
// TypeScript code with various issues
const apiKey = "sk-1234567890abcdef"; // Hardcoded secret
let unusedVariable = "test"; // Unused variable
var oldStyleVar = "avoid var"; // Should use const/let

function testFunction() {
  console.log("Debug message"); // Console.log in production code
  return apiKey;
}

// Missing error handling
function riskyFunction() {
  JSON.parse('invalid json');
}
    `,
    file_path: 'src/test.ts',
    metadata: {
      author: 'test-user',
      project: 'ai-agent-system'
    }
  };

  try {
    const report = await rulesEngine.validateArtifact(typescriptRequest);
    
    console.log(`✅ Validation completed for ${report.artifact_id}`);
    console.log(`📊 Overall Score: ${report.overall_score}%`);
    console.log(`${report.passed ? '✅' : '❌'} Passed: ${report.passed}`);
    console.log(`⏱️  Execution Time: ${report.execution_time_ms}ms`);
    console.log(`📋 Total Rules: ${report.summary.total_rules}`);
    console.log(`🔍 Issues Found: ${report.summary.failed_rules}`);
    
    if (report.summary.critical_issues > 0) {
      console.log(`🚨 Critical Issues: ${report.summary.critical_issues}`);
    }
    if (report.summary.high_issues > 0) {
      console.log(`⚠️  High Issues: ${report.summary.high_issues}`);
    }
    if (report.summary.medium_issues > 0) {
      console.log(`📝 Medium Issues: ${report.summary.medium_issues}`);
    }
    if (report.summary.low_issues > 0) {
      console.log(`💡 Low Issues: ${report.summary.low_issues}`);
    }

    console.log('\n🔍 Detailed Results:');
    report.results.forEach((result, index) => {
      const icon = result.passed ? '✅' : '❌';
      const severity = result.severity.toUpperCase();
      console.log(`  ${index + 1}. ${icon} [${severity}] ${result.rule_name}`);
      console.log(`     ${result.message}`);
      if (result.suggested_fix) {
        console.log(`     💡 Fix: ${result.suggested_fix}`);
      }
      if (result.source_location) {
        console.log(`     📍 Location: Line ${result.source_location.line}`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Validation failed:', error);
  }

  // Test 2: Get validation capabilities
  console.log('\n🔧 Test 2: Validation Capabilities');
  console.log('----------------------------------');
  
  try {
    const capabilities = await rulesEngine.getValidationCapabilities('typescript');
    console.log(`📊 Available Rules: ${capabilities.available_rules}`);
    console.log(`🏷️  Rule Types: ${capabilities.rule_types.join(', ')}`);
    console.log(`⚖️  Severity Distribution:`, capabilities.severity_distribution);
    console.log(`⏱️  Estimated Execution Time: ${capabilities.estimated_execution_time}`);
  } catch (error) {
    console.error('❌ Failed to get capabilities:', error);
  }

  // Test 3: Test with clean code
  console.log('\n✨ Test 3: Clean Code Validation');
  console.log('--------------------------------');
  
  const cleanRequest: ArtifactValidationRequest = {
    artifact_id: 'test-clean-001',
    artifact_type: 'typescript',
    content: `
// Clean TypeScript code
import { Logger } from './logger';

const logger = new Logger();

export interface UserData {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: UserData[] = [];

  constructor() {
    logger.info('UserService initialized');
  }

  public addUser(userData: UserData): void {
    this.users.push(userData);
    logger.info(\`User added: \${userData.name}\`);
  }

  public getUser(id: string): UserData | undefined {
    return this.users.find(user => user.id === id);
  }
}
    `,
    file_path: 'src/user-service.ts',
    metadata: {
      author: 'test-user',
      project: 'ai-agent-system'
    }
  };

  try {
    const cleanReport = await rulesEngine.validateArtifact(cleanRequest);
    
    console.log(`✅ Validation completed for ${cleanReport.artifact_id}`);
    console.log(`📊 Overall Score: ${cleanReport.overall_score}%`);
    console.log(`${cleanReport.passed ? '✅' : '❌'} Passed: ${cleanReport.passed}`);
    console.log(`📋 Total Rules: ${cleanReport.summary.total_rules}`);
    console.log(`🔍 Issues Found: ${cleanReport.summary.failed_rules}`);
    
    if (cleanReport.summary.failed_rules === 0) {
      console.log('🎉 Perfect! No issues found in clean code.');
    }

  } catch (error) {
    console.error('❌ Clean code validation failed:', error);
  }

  console.log('\n🎯 Rules Engine Test Complete!');
  console.log('===============================');
}

// Run the test if this script is executed directly
if (require.main === module) {
  testRulesEngine()
    .then(() => {
      console.log('\n✅ All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test execution failed:', error);
      process.exit(1);
    });
}

export { testRulesEngine };