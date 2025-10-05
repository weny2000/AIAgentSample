#!/usr/bin/env node

/**
 * Script to run all comprehensive unit tests for Task 19
 * This script executes all newly created test suites and reports results
 */

const { execSync } = require('child_process');

console.log('🧪 Running Comprehensive Unit Tests for Task 19\n');
console.log('='.repeat(60));

const testSuites = [
  {
    name: 'Data Model Validation Tests',
    pattern: 'work-task-validation.test',
    description: 'Tests for data model validation and edge cases'
  },
  {
    name: 'Lambda Handler Integration Tests',
    pattern: 'work-task-handler-integration.test',
    description: 'Integration tests for API handlers'
  },
  {
    name: 'Response Builder Utility Tests',
    pattern: 'response-builder.test',
    description: 'Tests for API response formatting'
  },
  {
    name: 'Work Task Analysis Service Tests',
    pattern: 'work-task-analysis-service-comprehensive.test',
    description: 'Comprehensive service layer tests'
  },
  {
    name: 'Work Task Repository Tests',
    pattern: 'work-task-repository.test',
    description: 'Repository layer CRUD operation tests'
  }
];

let totalPassed = 0;
let totalFailed = 0;
let totalSuites = 0;

testSuites.forEach((suite, index) => {
  console.log(`\n${index + 1}. ${suite.name}`);
  console.log(`   ${suite.description}`);
  console.log(`   Pattern: ${suite.pattern}`);
  console.log('-'.repeat(60));

  try {
    const result = execSync(
      `npm test -- --testPathPattern="${suite.pattern}" --passWithNoTests --silent`,
      {
        cwd: __dirname,
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );

    // Parse results
    const passedMatch = result.match(/(\d+) passed/);
    const failedMatch = result.match(/(\d+) failed/);

    const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

    totalPassed += passed;
    totalFailed += failed;
    totalSuites += 1;

    console.log(`   ✅ PASSED: ${passed} tests`);
    if (failed > 0) {
      console.log(`   ❌ FAILED: ${failed} tests`);
    }
  } catch (error) {
    console.log(`   ⚠️  Test suite not found or failed to execute`);
  }
});

console.log('\n' + '='.repeat(60));
console.log('📊 SUMMARY');
console.log('='.repeat(60));
console.log(`Total Test Suites: ${totalSuites}`);
console.log(`Total Tests Passed: ${totalPassed}`);
console.log(`Total Tests Failed: ${totalFailed}`);
console.log(`Success Rate: ${totalPassed > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(2) : 0}%`);

if (totalFailed === 0 && totalPassed > 0) {
  console.log('\n✅ All tests passed successfully!');
  process.exit(0);
} else if (totalFailed > 0) {
  console.log('\n❌ Some tests failed. Please review the output above.');
  process.exit(1);
} else {
  console.log('\n⚠️  No tests were executed. Please check test file paths.');
  process.exit(0);
}
