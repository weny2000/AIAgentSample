#!/usr/bin/env node

/**
 * AgentCore Test Runner Script
 * Executes comprehensive AgentCore test suite with proper configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  outputDir: 'test-results/agent-core',
  verbose: process.env.VERBOSE_TESTS === 'true',
  coverage: process.env.COVERAGE !== 'false',
  parallel: process.env.PARALLEL_TESTS !== 'false'
};

// Ensure output directory exists
if (!fs.existsSync(TEST_CONFIG.outputDir)) {
  fs.mkdirSync(TEST_CONFIG.outputDir, { recursive: true });
}

// Parse command line arguments
const args = process.argv.slice(2);
const suites = {
  unit: !args.includes('--no-unit'),
  integration: !args.includes('--no-integration'),
  performance: !args.includes('--no-performance'),
  security: !args.includes('--no-security'),
  e2e: !args.includes('--no-e2e')
};

console.log('🚀 Starting AgentCore Comprehensive Test Suite');
console.log('================================================');
console.log(`Output Directory: ${TEST_CONFIG.outputDir}`);
console.log(`Enabled Suites: ${Object.entries(suites).filter(([_, enabled]) => enabled).map(([name]) => name).join(', ')}`);
console.log('');

const startTime = Date.now();
const results = [];

try {
  // Run Unit Tests
  if (suites.unit) {
    console.log('📋 Running Unit Tests...');
    try {
      const unitConfig = {
        testMatch: [
          '<rootDir>/src/services/__tests__/agent-core-service-comprehensive.test.ts',
          '<rootDir>/src/services/__tests__/conversation-management-service.test.ts',
          '<rootDir>/src/lambda/handlers/__tests__/agent-core-handler.test.ts',
          '<rootDir>/src/lambda/handlers/__tests__/agent-websocket-handler.test.ts'
        ],
        testTimeout: 30000,
        collectCoverage: TEST_CONFIG.coverage,
        coverageDirectory: path.join(TEST_CONFIG.outputDir, 'coverage'),
        coverageReporters: ['text', 'html', 'lcov', 'json'],
        coverageThreshold: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
          }
        },
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/integration-setup.ts']
      };

      const configPath = path.join(TEST_CONFIG.outputDir, 'jest.unit.config.json');
      fs.writeFileSync(configPath, JSON.stringify(unitConfig, null, 2));

      const unitCommand = [
        'npx jest',
        `--config ${configPath}`,
        TEST_CONFIG.verbose ? '--verbose' : '',
        '--json',
        `--outputFile=${path.join(TEST_CONFIG.outputDir, 'unit-results.json')}`
      ].filter(Boolean).join(' ');

      execSync(unitCommand, { stdio: 'inherit', cwd: process.cwd() });
      
      const unitResults = JSON.parse(fs.readFileSync(path.join(TEST_CONFIG.outputDir, 'unit-results.json'), 'utf8'));
      results.push({ suite: 'unit', ...unitResults });
      
      console.log(`✅ Unit Tests: ${unitResults.numPassedTests}/${unitResults.numTotalTests} passed`);
    } catch (error) {
      console.error('❌ Unit Tests Failed:', error.message);
      results.push({ suite: 'unit', success: false, error: error.message });
    }
  }

  // Run Integration Tests
  if (suites.integration) {
    console.log('\n🔗 Running Integration Tests...');
    try {
      const integrationConfig = {
        testMatch: ['<rootDir>/src/tests/integration/agent-conversation-flows.test.ts'],
        testTimeout: 60000,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/integration-setup.ts'],
        maxWorkers: TEST_CONFIG.parallel ? undefined : 1
      };

      const configPath = path.join(TEST_CONFIG.outputDir, 'jest.integration.config.json');
      fs.writeFileSync(configPath, JSON.stringify(integrationConfig, null, 2));

      const integrationCommand = [
        'npx jest',
        `--config ${configPath}`,
        TEST_CONFIG.verbose ? '--verbose' : '',
        '--json',
        `--outputFile=${path.join(TEST_CONFIG.outputDir, 'integration-results.json')}`
      ].filter(Boolean).join(' ');

      execSync(integrationCommand, { stdio: 'inherit', cwd: process.cwd() });
      
      const integrationResults = JSON.parse(fs.readFileSync(path.join(TEST_CONFIG.outputDir, 'integration-results.json'), 'utf8'));
      results.push({ suite: 'integration', ...integrationResults });
      
      console.log(`✅ Integration Tests: ${integrationResults.numPassedTests}/${integrationResults.numTotalTests} passed`);
    } catch (error) {
      console.error('❌ Integration Tests Failed:', error.message);
      results.push({ suite: 'integration', success: false, error: error.message });
    }
  }

  // Run Performance Tests
  if (suites.performance) {
    console.log('\n⚡ Running Performance Tests...');
    try {
      // Set performance test environment
      process.env.PERFORMANCE_TEST = 'true';
      process.env.MAX_RESPONSE_TIME = '5000';
      process.env.MIN_THROUGHPUT = '10';
      process.env.MAX_MEMORY_USAGE = '512';

      const performanceConfig = {
        testMatch: ['<rootDir>/src/tests/performance/agent-concurrent-sessions.test.ts'],
        testTimeout: 120000,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/performance-setup.ts'],
        maxWorkers: 1 // Performance tests should run sequentially
      };

      const configPath = path.join(TEST_CONFIG.outputDir, 'jest.performance.config.json');
      fs.writeFileSync(configPath, JSON.stringify(performanceConfig, null, 2));

      const performanceCommand = [
        'npx jest',
        `--config ${configPath}`,
        TEST_CONFIG.verbose ? '--verbose' : '',
        '--json',
        `--outputFile=${path.join(TEST_CONFIG.outputDir, 'performance-results.json')}`
      ].filter(Boolean).join(' ');

      execSync(performanceCommand, { stdio: 'inherit', cwd: process.cwd() });
      
      const performanceResults = JSON.parse(fs.readFileSync(path.join(TEST_CONFIG.outputDir, 'performance-results.json'), 'utf8'));
      results.push({ suite: 'performance', ...performanceResults });
      
      console.log(`✅ Performance Tests: ${performanceResults.numPassedTests}/${performanceResults.numTotalTests} passed`);
    } catch (error) {
      console.error('❌ Performance Tests Failed:', error.message);
      results.push({ suite: 'performance', success: false, error: error.message });
    }
  }

  // Run Security Tests
  if (suites.security) {
    console.log('\n🔒 Running Security Tests...');
    try {
      const securityConfig = {
        testMatch: ['<rootDir>/src/tests/security/agent-security.test.ts'],
        testTimeout: 60000,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/security-setup.ts']
      };

      const configPath = path.join(TEST_CONFIG.outputDir, 'jest.security.config.json');
      fs.writeFileSync(configPath, JSON.stringify(securityConfig, null, 2));

      const securityCommand = [
        'npx jest',
        `--config ${configPath}`,
        TEST_CONFIG.verbose ? '--verbose' : '',
        '--json',
        `--outputFile=${path.join(TEST_CONFIG.outputDir, 'security-results.json')}`
      ].filter(Boolean).join(' ');

      execSync(securityCommand, { stdio: 'inherit', cwd: process.cwd() });
      
      const securityResults = JSON.parse(fs.readFileSync(path.join(TEST_CONFIG.outputDir, 'security-results.json'), 'utf8'));
      results.push({ suite: 'security', ...securityResults });
      
      console.log(`✅ Security Tests: ${securityResults.numPassedTests}/${securityResults.numTotalTests} passed`);
    } catch (error) {
      console.error('❌ Security Tests Failed:', error.message);
      results.push({ suite: 'security', success: false, error: error.message });
    }
  }

  // Run E2E Tests
  if (suites.e2e) {
    console.log('\n🎯 Running End-to-End Tests...');
    try {
      const e2eConfig = {
        testMatch: ['<rootDir>/src/tests/e2e/agent-workflows.test.ts'],
        testTimeout: 180000,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/e2e-setup.ts'],
        maxWorkers: 1 // E2E tests should run sequentially
      };

      const configPath = path.join(TEST_CONFIG.outputDir, 'jest.e2e.config.json');
      fs.writeFileSync(configPath, JSON.stringify(e2eConfig, null, 2));

      const e2eCommand = [
        'npx jest',
        `--config ${configPath}`,
        TEST_CONFIG.verbose ? '--verbose' : '',
        '--json',
        `--outputFile=${path.join(TEST_CONFIG.outputDir, 'e2e-results.json')}`
      ].filter(Boolean).join(' ');

      execSync(e2eCommand, { stdio: 'inherit', cwd: process.cwd() });
      
      const e2eResults = JSON.parse(fs.readFileSync(path.join(TEST_CONFIG.outputDir, 'e2e-results.json'), 'utf8'));
      results.push({ suite: 'e2e', ...e2eResults });
      
      console.log(`✅ E2E Tests: ${e2eResults.numPassedTests}/${e2eResults.numTotalTests} passed`);
    } catch (error) {
      console.error('❌ E2E Tests Failed:', error.message);
      results.push({ suite: 'e2e', success: false, error: error.message });
    }
  }

  // Generate comprehensive report
  const totalTime = Date.now() - startTime;
  const report = {
    timestamp: new Date().toISOString(),
    totalExecutionTime: totalTime,
    summary: {
      totalSuites: results.length,
      passedSuites: results.filter(r => r.success !== false).length,
      failedSuites: results.filter(r => r.success === false).length,
      totalTests: results.reduce((sum, r) => sum + (r.numTotalTests || 0), 0),
      passedTests: results.reduce((sum, r) => sum + (r.numPassedTests || 0), 0),
      failedTests: results.reduce((sum, r) => sum + (r.numFailedTests || 0), 0)
    },
    suiteResults: results,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage()
    }
  };

  // Save comprehensive report
  fs.writeFileSync(
    path.join(TEST_CONFIG.outputDir, 'comprehensive-report.json'),
    JSON.stringify(report, null, 2)
  );

  // Generate HTML report
  const htmlReport = generateHTMLReport(report);
  fs.writeFileSync(
    path.join(TEST_CONFIG.outputDir, 'comprehensive-report.html'),
    htmlReport
  );

  // Print final summary
  console.log('\n📊 Test Suite Summary');
  console.log('=====================');
  console.log(`Total Tests: ${report.summary.totalTests}`);
  console.log(`Passed: ${report.summary.passedTests}`);
  console.log(`Failed: ${report.summary.failedTests}`);
  console.log(`Success Rate: ${Math.round((report.summary.passedTests / report.summary.totalTests) * 100)}%`);
  console.log(`Total Time: ${totalTime}ms`);
  
  console.log('\n📋 Suite Breakdown:');
  results.forEach(suite => {
    const status = suite.success !== false ? '✅' : '❌';
    console.log(`${status} ${suite.suite.toUpperCase()}: ${suite.numPassedTests || 0}/${suite.numTotalTests || 0}`);
  });

  console.log(`\n📊 Reports generated in: ${TEST_CONFIG.outputDir}`);
  console.log('- comprehensive-report.json');
  console.log('- comprehensive-report.html');
  if (TEST_CONFIG.coverage) {
    console.log('- coverage/index.html');
  }

  if (report.summary.failedTests > 0) {
    console.log('\n❌ Some tests failed. Check the detailed reports for more information.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed successfully!');
  }

} catch (error) {
  console.error('\n💥 Test suite execution failed:', error.message);
  process.exit(1);
}

function generateHTMLReport(report) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>AgentCore Test Suite Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
        .metric { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .metric h3 { margin: 0; font-size: 2em; }
        .metric p { margin: 10px 0 0 0; opacity: 0.9; }
        .suite { margin: 20px 0; padding: 20px; border-radius: 8px; border-left: 5px solid #ddd; }
        .suite.passed { border-left-color: #4caf50; background: #f8fff8; }
        .suite.failed { border-left-color: #f44336; background: #fff8f8; }
        .suite h3 { margin: 0 0 10px 0; color: #333; }
        .suite-stats { display: flex; gap: 20px; margin: 10px 0; }
        .suite-stat { background: #f0f0f0; padding: 10px; border-radius: 4px; }
        .environment { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 30px; }
        .environment h2 { margin-top: 0; }
        .env-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .env-item { background: white; padding: 15px; border-radius: 4px; border: 1px solid #e0e0e0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 AgentCore Test Suite Report</h1>
            <p>Generated: ${report.timestamp}</p>
            <p>Total Execution Time: ${Math.round(report.totalExecutionTime / 1000)}s</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>${report.summary.totalTests}</h3>
                <p>Total Tests</p>
            </div>
            <div class="metric">
                <h3>${report.summary.passedTests}</h3>
                <p>Passed</p>
            </div>
            <div class="metric">
                <h3>${report.summary.failedTests}</h3>
                <p>Failed</p>
            </div>
            <div class="metric">
                <h3>${Math.round((report.summary.passedTests / report.summary.totalTests) * 100)}%</h3>
                <p>Success Rate</p>
            </div>
        </div>
        
        <h2>📋 Test Suite Results</h2>
        ${report.suiteResults.map(suite => `
            <div class="suite ${suite.success !== false ? 'passed' : 'failed'}">
                <h3>${suite.suite.toUpperCase()} Tests ${suite.success !== false ? '✅' : '❌'}</h3>
                <div class="suite-stats">
                    <div class="suite-stat">
                        <strong>Tests:</strong> ${suite.numPassedTests || 0}/${suite.numTotalTests || 0}
                    </div>
                    <div class="suite-stat">
                        <strong>Duration:</strong> ${suite.executionTime ? Math.round(suite.executionTime / 1000) + 's' : 'N/A'}
                    </div>
                    ${suite.success === false ? `<div class="suite-stat" style="background: #ffebee; color: #c62828;"><strong>Error:</strong> ${suite.error}</div>` : ''}
                </div>
            </div>
        `).join('')}
        
        <div class="environment">
            <h2>🖥️ Environment Information</h2>
            <div class="env-grid">
                <div class="env-item">
                    <strong>Node Version:</strong><br>
                    ${report.environment.nodeVersion}
                </div>
                <div class="env-item">
                    <strong>Platform:</strong><br>
                    ${report.environment.platform}
                </div>
                <div class="env-item">
                    <strong>Architecture:</strong><br>
                    ${report.environment.arch}
                </div>
                <div class="env-item">
                    <strong>Memory Usage:</strong><br>
                    ${Math.round(report.environment.memory.heapUsed / 1024 / 1024)}MB
                </div>
            </div>
        </div>
    </div>
</body>
</html>
  `;
}