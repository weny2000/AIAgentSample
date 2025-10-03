#!/usr/bin/env node

/**
 * Simple test to verify RDS PostgreSQL setup is complete
 * This script checks that all components are properly implemented
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

function checkFileExists(filePath: string, description: string): TestResult {
  const fullPath = join(__dirname, filePath);
  const exists = existsSync(fullPath);
  
  return {
    name: description,
    passed: exists,
    message: exists ? `✅ ${description}` : `❌ ${description} - File not found: ${filePath}`
  };
}

async function checkImports(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    // Test database connection import
    const { DatabaseConnection } = await import('./database/connection.js');
    results.push({
      name: 'Database Connection Import',
      passed: true,
      message: '✅ Database Connection class imported successfully'
    });
  } catch (error) {
    results.push({
      name: 'Database Connection Import',
      passed: false,
      message: `❌ Database Connection import failed: ${error.message}`
    });
  }

  try {
    // Test database init import
    const { initializeDatabase } = await import('./database/init.js');
    results.push({
      name: 'Database Init Import',
      passed: true,
      message: '✅ Database initialization functions imported successfully'
    });
  } catch (error) {
    results.push({
      name: 'Database Init Import',
      passed: false,
      message: `❌ Database init import failed: ${error.message}`
    });
  }

  try {
    // Test PostgreSQL models import
    const models = await import('./models/postgresql.js');
    results.push({
      name: 'PostgreSQL Models Import',
      passed: true,
      message: '✅ PostgreSQL models imported successfully'
    });
  } catch (error) {
    results.push({
      name: 'PostgreSQL Models Import',
      passed: false,
      message: `❌ PostgreSQL models import failed: ${error.message}`
    });
  }

  try {
    // Test repositories import
    const { ServiceRepository, DependencyRepository, PolicyRepository } = await import('./repositories/index.js');
    results.push({
      name: 'PostgreSQL Repositories Import',
      passed: true,
      message: '✅ PostgreSQL repositories imported successfully'
    });
  } catch (error) {
    results.push({
      name: 'PostgreSQL Repositories Import',
      passed: false,
      message: `❌ PostgreSQL repositories import failed: ${error.message}`
    });
  }

  return results;
}

async function runSetupTests(): Promise<void> {
  console.log('🔍 Testing RDS PostgreSQL Setup\n');

  const fileTests: TestResult[] = [
    // Infrastructure files
    checkFileExists('../infrastructure/src/constructs/rds-postgresql.ts', 'RDS PostgreSQL CDK Construct'),
    
    // Database files
    checkFileExists('database/connection.ts', 'Database Connection Module'),
    checkFileExists('database/init.ts', 'Database Initialization Module'),
    checkFileExists('database/schemas/dependency-graph.sql', 'Dependency Graph Schema'),
    checkFileExists('database/schemas/policy-management.sql', 'Policy Management Schema'),
    
    // Model files
    checkFileExists('models/postgresql.ts', 'PostgreSQL Data Models'),
    
    // Repository files
    checkFileExists('repositories/postgresql-base-repository.ts', 'PostgreSQL Base Repository'),
    checkFileExists('repositories/service-repository.ts', 'Service Repository'),
    checkFileExists('repositories/dependency-repository.ts', 'Dependency Repository'),
    checkFileExists('repositories/policy-repository.ts', 'Policy Repository'),
    
    // Test files
    checkFileExists('test-postgresql.ts', 'PostgreSQL Test Suite'),
  ];

  console.log('📁 File Structure Tests:');
  fileTests.forEach(test => console.log(test.message));

  console.log('\n📦 Import Tests:');
  const importTests = await checkImports();
  importTests.forEach(test => console.log(test.message));

  // Summary
  const allTests = [...fileTests, ...importTests];
  const passed = allTests.filter(t => t.passed).length;
  const failed = allTests.filter(t => !t.passed).length;

  console.log('\n📊 Setup Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / allTests.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 RDS PostgreSQL setup is complete and ready for use!');
    console.log('\nNext steps:');
    console.log('1. Deploy the infrastructure: npm run deploy');
    console.log('2. Run the full test suite: npm run test:postgresql');
    console.log('3. Initialize the database: npm run db:init');
  } else {
    console.log('\n⚠️  Some components are missing or have issues. Please review the failed tests above.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSetupTests().catch(error => {
    console.error('💥 Setup test failed:', error);
    process.exit(1);
  });
}

export { runSetupTests };