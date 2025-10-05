/**
 * Performance Test Runner
 * Runs all performance and load tests with proper configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(80));
console.log('Work Task Analysis System - Performance Test Suite');
console.log('='.repeat(80));
console.log('');

const testSuites = [
  {
    name: 'Performance Benchmarks',
    file: 'src/tests/performance/work-task-performance.test.ts',
    timeout: 60000,
    description: 'Tests response times, throughput, and resource utilization'
  },
  {
    name: 'Load Tests',
    file: 'src/tests/performance/work-task-load.test.ts',
    timeout: 180000,
    description: 'Tests concurrent user scenarios and sustained load'
  },
  {
    name: 'Stress Tests',
    file: 'src/tests/performance/work-task-stress.test.ts',
    timeout: 180000,
    description: 'Tests large file uploads and extreme conditions'
  },
  {
    name: 'Database Query Performance',
    file: 'src/tests/performance/database-query-performance.test.ts',
    timeout: 120000,
    description: 'Tests query optimization and database performance'
  }
];

const results = {
  passed: [],
  failed: [],
  skipped: []
};

const startTime = Date.now();

// Run each test suite
for (const suite of testSuites) {
  console.log('\n' + '-'.repeat(80));
  console.log(`Running: ${suite.name}`);
  console.log(`Description: ${suite.description}`);
  console.log(`Timeout: ${suite.timeout / 1000}s`);
  console.log('-'.repeat(80));
  console.log('');

  try {
    const suiteStartTime = Date.now();
    
    // Run the test with Jest
    execSync(
      `npx jest ${suite.file} --testTimeout=${suite.timeout} --verbose --detectOpenHandles --forceExit`,
      {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          NODE_OPTIONS: '--expose-gc' // Enable garbage collection for memory tests
        }
      }
    );

    const suiteDuration = Date.now() - suiteStartTime;
    results.passed.push({
      name: suite.name,
      duration: suiteDuration
    });

    console.log('');
    console.log(`✓ ${suite.name} completed in ${(suiteDuration / 1000).toFixed(2)}s`);
  } catch (error) {
    const suiteDuration = Date.now() - suiteStartTime;
    results.failed.push({
      name: suite.name,
      duration: suiteDuration,
      error: error.message
    });

    console.log('');
    console.log(`✗ ${suite.name} failed after ${(suiteDuration / 1000).toFixed(2)}s`);
  }
}

const totalDuration = Date.now() - startTime;

// Print summary
console.log('\n' + '='.repeat(80));
console.log('Performance Test Summary');
console.log('='.repeat(80));
console.log('');
console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
console.log(`Total Suites: ${testSuites.length}`);
console.log(`Passed: ${results.passed.length}`);
console.log(`Failed: ${results.failed.length}`);
console.log(`Skipped: ${results.skipped.length}`);
console.log('');

if (results.passed.length > 0) {
  console.log('Passed Suites:');
  results.passed.forEach(suite => {
    console.log(`  ✓ ${suite.name} (${(suite.duration / 1000).toFixed(2)}s)`);
  });
  console.log('');
}

if (results.failed.length > 0) {
  console.log('Failed Suites:');
  results.failed.forEach(suite => {
    console.log(`  ✗ ${suite.name} (${(suite.duration / 1000).toFixed(2)}s)`);
  });
  console.log('');
}

// Generate performance report
const report = {
  timestamp: new Date().toISOString(),
  totalDuration,
  suites: testSuites.length,
  passed: results.passed.length,
  failed: results.failed.length,
  results: {
    passed: results.passed,
    failed: results.failed,
    skipped: results.skipped
  }
};

const reportPath = path.join(__dirname, 'performance-test-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Performance report saved to: ${reportPath}`);
console.log('');

// Exit with appropriate code
if (results.failed.length > 0) {
  console.log('❌ Performance tests failed');
  process.exit(1);
} else {
  console.log('✅ All performance tests passed');
  process.exit(0);
}
