/**
 * Work Task Analysis System End-to-End Test Runner
 * Executes comprehensive E2E tests for the work task analysis system
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  testMatch: 'src/tests/e2e/work-task-workflows.test.ts',
  setupFile: 'src/tests/setup/work-task-e2e-setup.ts',
  timeout: 180000, // 3 minutes
  verbose: process.env.VERBOSE_TESTS === 'true',
  coverage: process.env.COVERAGE !== 'false',
  bail: process.env.BAIL_ON_FAILURE === 'true'
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(80) + '\n');
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.blue);
}

// Create results directory
function ensureResultsDirectory() {
  const resultsDir = path.join(__dirname, 'test-results', 'work-task-e2e');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  return resultsDir;
}

// Run E2E tests
function runE2ETests() {
  logSection('Running Work Task Analysis System E2E Tests');

  const jestArgs = [
    '--testMatch="**/work-task-workflows.test.ts"',
    `--testTimeout=${TEST_CONFIG.timeout}`,
    '--runInBand', // Run tests sequentially for E2E
    '--detectOpenHandles',
    '--forceExit'
  ];

  if (TEST_CONFIG.verbose) {
    jestArgs.push('--verbose');
  }

  if (TEST_CONFIG.coverage) {
    jestArgs.push('--coverage');
    jestArgs.push('--coverageDirectory=coverage/work-task-e2e');
  }

  if (TEST_CONFIG.bail) {
    jestArgs.push('--bail');
  }

  const command = `npx jest ${jestArgs.join(' ')}`;

  try {
    logInfo('Executing E2E tests...');
    logInfo(`Command: ${command}`);
    console.log('');

    const output = execSync(command, {
      cwd: __dirname,
      encoding: 'utf-8',
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        JEST_JUNIT_OUTPUT_DIR: './test-results/work-task-e2e'
      }
    });

    logSuccess('E2E tests completed successfully');
    return { success: true, output };

  } catch (error) {
    logError('E2E tests failed');
    return { success: false, error: error.message };
  }
}

// Generate test report
function generateTestReport(results, resultsDir) {
  logSection('Generating Test Report');

  const report = {
    timestamp: new Date().toISOString(),
    testSuite: 'Work Task Analysis System E2E Tests',
    configuration: TEST_CONFIG,
    results: {
      e2eTests: results
    },
    summary: {
      totalSuites: 1,
      passedSuites: results.success ? 1 : 0,
      failedSuites: results.success ? 0 : 1,
      overallSuccess: results.success
    }
  };

  // Save JSON report
  const reportPath = path.join(resultsDir, 'e2e-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logSuccess(`Test report saved to: ${reportPath}`);

  // Generate HTML report
  const htmlReport = generateHTMLReport(report);
  const htmlPath = path.join(resultsDir, 'e2e-test-report.html');
  fs.writeFileSync(htmlPath, htmlReport);
  logSuccess(`HTML report saved to: ${htmlPath}`);

  return report;
}

// Generate HTML report
function generateHTMLReport(report) {
  const statusColor = report.summary.overallSuccess ? '#4CAF50' : '#f44336';
  const statusText = report.summary.overallSuccess ? 'PASSED' : 'FAILED';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Work Task E2E Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .status {
            background: ${statusColor};
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
        }
        .content { padding: 30px; }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        .section h2 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 20px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .info-item {
            background: white;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
        }
        .info-item label {
            display: block;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .info-item value {
            display: block;
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }
        .test-scenarios {
            list-style: none;
            margin-top: 15px;
        }
        .test-scenarios li {
            padding: 10px;
            margin-bottom: 8px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #4CAF50;
        }
        .footer {
            background: #f5f5f5;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 10px;
        }
        .badge-success { background: #4CAF50; color: white; }
        .badge-error { background: #f44336; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Work Task Analysis System</h1>
            <p>End-to-End Test Report</p>
        </div>
        
        <div class="status">
            ${statusText}
        </div>
        
        <div class="content">
            <div class="section">
                <h2>📊 Test Summary</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <label>Test Suite</label>
                        <value>${report.testSuite}</value>
                    </div>
                    <div class="info-item">
                        <label>Execution Time</label>
                        <value>${new Date(report.timestamp).toLocaleString()}</value>
                    </div>
                    <div class="info-item">
                        <label>Total Suites</label>
                        <value>${report.summary.totalSuites}</value>
                    </div>
                    <div class="info-item">
                        <label>Status</label>
                        <value>
                            ${report.summary.passedSuites} Passed
                            <span class="badge ${report.summary.failedSuites > 0 ? 'badge-error' : 'badge-success'}">
                                ${report.summary.failedSuites} Failed
                            </span>
                        </value>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h2>🎯 Test Scenarios Covered</h2>
                <ul class="test-scenarios">
                    <li>✓ Complete Task Submission to Completion Workflow</li>
                    <li>✓ Automated Deliverable Checking Process</li>
                    <li>✓ Deliverable Rejection and Resubmission</li>
                    <li>✓ Comprehensive Quality Assessment</li>
                    <li>✓ Multi-File Type Quality Assessment</li>
                    <li>✓ Concurrent Multi-User Collaboration</li>
                    <li>✓ Cross-Team Collaboration with Dependencies</li>
                    <li>✓ Progress Tracking and Reporting</li>
                    <li>✓ Error Handling and Edge Cases</li>
                    <li>✓ Service Failure Resilience</li>
                    <li>✓ Blocking Issue Identification</li>
                    <li>✓ Performance and Scalability</li>
                </ul>
            </div>
            
            <div class="section">
                <h2>⚙️ Test Configuration</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <label>Timeout</label>
                        <value>${TEST_CONFIG.timeout / 1000}s</value>
                    </div>
                    <div class="info-item">
                        <label>Verbose Mode</label>
                        <value>${TEST_CONFIG.verbose ? 'Enabled' : 'Disabled'}</value>
                    </div>
                    <div class="info-item">
                        <label>Coverage</label>
                        <value>${TEST_CONFIG.coverage ? 'Enabled' : 'Disabled'}</value>
                    </div>
                    <div class="info-item">
                        <label>Bail on Failure</label>
                        <value>${TEST_CONFIG.bail ? 'Enabled' : 'Disabled'}</value>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>Generated on ${new Date(report.timestamp).toLocaleString()}</p>
            <p>Work Task Analysis System - End-to-End Test Suite</p>
        </div>
    </div>
</body>
</html>
  `;
}

// Display summary
function displaySummary(report) {
  logSection('Test Execution Summary');

  console.log('');
  logInfo(`Test Suite: ${report.testSuite}`);
  logInfo(`Execution Time: ${new Date(report.timestamp).toLocaleString()}`);
  console.log('');

  if (report.summary.overallSuccess) {
    logSuccess(`All test suites passed! (${report.summary.passedSuites}/${report.summary.totalSuites})`);
  } else {
    logError(`Some test suites failed! (${report.summary.failedSuites}/${report.summary.totalSuites} failed)`);
  }

  console.log('');
  logInfo('Test Scenarios Covered:');
  console.log('  ✓ Complete Task Submission to Completion Workflow');
  console.log('  ✓ Automated Deliverable Checking Process');
  console.log('  ✓ Deliverable Rejection and Resubmission');
  console.log('  ✓ Comprehensive Quality Assessment');
  console.log('  ✓ Multi-User Collaboration Scenarios');
  console.log('  ✓ Error Handling and Edge Cases');
  console.log('  ✓ Performance and Scalability');
  console.log('');
}

// Main execution
async function main() {
  const startTime = Date.now();

  logSection('Work Task Analysis System - E2E Test Suite');
  logInfo('Starting end-to-end test execution...');
  console.log('');

  // Ensure results directory exists
  const resultsDir = ensureResultsDirectory();

  // Run E2E tests
  const e2eResults = runE2ETests();

  // Generate report
  const report = generateTestReport(e2eResults, resultsDir);

  // Display summary
  displaySummary(report);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logInfo(`Total execution time: ${duration}s`);

  // Exit with appropriate code
  process.exit(report.summary.overallSuccess ? 0 : 1);
}

// Run the test suite
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
