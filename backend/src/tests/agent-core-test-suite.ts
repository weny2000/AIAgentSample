/**
 * AgentCore Comprehensive Test Suite Runner
 * Orchestrates all AgentCore tests including unit, integration, performance, security, and E2E tests
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestSuiteConfig {
  suites: {
    unit: {
      enabled: boolean;
      timeout: number;
      coverage: boolean;
      patterns: string[];
    };
    integration: {
      enabled: boolean;
      timeout: number;
      patterns: string[];
    };
    performance: {
      enabled: boolean;
      timeout: number;
      patterns: string[];
      thresholds: {
        maxResponseTime: number;
        minThroughput: number;
        maxMemoryUsage: number;
      };
    };
    security: {
      enabled: boolean;
      timeout: number;
      patterns: string[];
    };
    e2e: {
      enabled: boolean;
      timeout: number;
      patterns: string[];
    };
  };
  reporting: {
    outputDir: string;
    formats: string[];
    includeMetrics: boolean;
  };
  environment: {
    nodeEnv: string;
    logLevel: string;
    mockServices: boolean;
  };
}

const DEFAULT_CONFIG: TestSuiteConfig = {
  suites: {
    unit: {
      enabled: true,
      timeout: 30000,
      coverage: true,
      patterns: [
        'src/services/__tests__/agent-core-service-comprehensive.test.ts',
        'src/services/__tests__/conversation-management-service.test.ts',
        'src/lambda/handlers/__tests__/agent-core-handler.test.ts',
        'src/lambda/handlers/__tests__/agent-websocket-handler.test.ts'
      ]
    },
    integration: {
      enabled: true,
      timeout: 60000,
      patterns: [
        'src/tests/integration/agent-conversation-flows.test.ts'
      ]
    },
    performance: {
      enabled: true,
      timeout: 120000,
      patterns: [
        'src/tests/performance/agent-concurrent-sessions.test.ts'
      ],
      thresholds: {
        maxResponseTime: 5000,
        minThroughput: 10,
        maxMemoryUsage: 512
      }
    },
    security: {
      enabled: true,
      timeout: 60000,
      patterns: [
        'src/tests/security/agent-security.test.ts'
      ]
    },
    e2e: {
      enabled: true,
      timeout: 180000,
      patterns: [
        'src/tests/e2e/agent-workflows.test.ts'
      ]
    }
  },
  reporting: {
    outputDir: 'test-results/agent-core',
    formats: ['json', 'html', 'junit'],
    includeMetrics: true
  },
  environment: {
    nodeEnv: 'test',
    logLevel: 'error',
    mockServices: true
  }
};

export class AgentCoreTestSuite {
  private config: TestSuiteConfig;
  private results: Map<string, any> = new Map();

  constructor(config?: Partial<TestSuiteConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEnvironment();
  }

  private setupEnvironment(): void {
    process.env.NODE_ENV = this.config.environment.nodeEnv;
    process.env.LOG_LEVEL = this.config.environment.logLevel;
    process.env.MOCK_SERVICES = this.config.environment.mockServices.toString();
    
    // Ensure output directory exists
    if (!fs.existsSync(this.config.reporting.outputDir)) {
      fs.mkdirSync(this.config.reporting.outputDir, { recursive: true });
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting AgentCore Comprehensive Test Suite');
    console.log('================================================');

    const startTime = Date.now();
    const suiteResults: any[] = [];

    try {
      if (this.config.suites.unit.enabled) {
        console.log('\n📋 Running Unit Tests...');
        const unitResults = await this.runUnitTests();
        suiteResults.push({ suite: 'unit', ...unitResults });
      }

      if (this.config.suites.integration.enabled) {
        console.log('\n🔗 Running Integration Tests...');
        const integrationResults = await this.runIntegrationTests();
        suiteResults.push({ suite: 'integration', ...integrationResults });
      }

      if (this.config.suites.performance.enabled) {
        console.log('\n⚡ Running Performance Tests...');
        const performanceResults = await this.runPerformanceTests();
        suiteResults.push({ suite: 'performance', ...performanceResults });
      }

      if (this.config.suites.security.enabled) {
        console.log('\n🔒 Running Security Tests...');
        const securityResults = await this.runSecurityTests();
        suiteResults.push({ suite: 'security', ...securityResults });
      }

      if (this.config.suites.e2e.enabled) {
        console.log('\n🎯 Running End-to-End Tests...');
        const e2eResults = await this.runE2ETests();
        suiteResults.push({ suite: 'e2e', ...e2eResults });
      }

      const totalTime = Date.now() - startTime;
      await this.generateReport(suiteResults, totalTime);

      console.log('\n✅ AgentCore Test Suite Completed Successfully');
      console.log(`Total execution time: ${totalTime}ms`);

    } catch (error) {
      console.error('\n❌ Test Suite Failed:', error);
      process.exit(1);
    }
  }

  private async runUnitTests(): Promise<any> {
    const startTime = Date.now();
    
    try {
      const jestConfig = {
        testMatch: this.config.suites.unit.patterns,
        testTimeout: this.config.suites.unit.timeout,
        collectCoverage: this.config.suites.unit.coverage,
        coverageDirectory: path.join(this.config.reporting.outputDir, 'coverage'),
        coverageReporters: ['text', 'html', 'lcov'],
        coverageThreshold: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
          }
        }
      };

      const configPath = path.join(this.config.reporting.outputDir, 'jest.unit.config.json');
      fs.writeFileSync(configPath, JSON.stringify(jestConfig, null, 2));

      const command = `npx jest --config ${configPath} --verbose --json --outputFile=${path.join(this.config.reporting.outputDir, 'unit-results.json')}`;
      
      const output = execSync(command, { 
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const results = JSON.parse(fs.readFileSync(path.join(this.config.reporting.outputDir, 'unit-results.json'), 'utf8'));
      
      return {
        success: results.success,
        numTotalTests: results.numTotalTests,
        numPassedTests: results.numPassedTests,
        numFailedTests: results.numFailedTests,
        testResults: results.testResults,
        coverageMap: results.coverageMap,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Unit tests failed:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async runIntegrationTests(): Promise<any> {
    const startTime = Date.now();
    
    try {
      const jestConfig = {
        testMatch: this.config.suites.integration.patterns,
        testTimeout: this.config.suites.integration.timeout,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/integration-setup.ts']
      };

      const configPath = path.join(this.config.reporting.outputDir, 'jest.integration.config.json');
      fs.writeFileSync(configPath, JSON.stringify(jestConfig, null, 2));

      const command = `npx jest --config ${configPath} --verbose --json --outputFile=${path.join(this.config.reporting.outputDir, 'integration-results.json')}`;
      
      execSync(command, { 
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const results = JSON.parse(fs.readFileSync(path.join(this.config.reporting.outputDir, 'integration-results.json'), 'utf8'));
      
      return {
        success: results.success,
        numTotalTests: results.numTotalTests,
        numPassedTests: results.numPassedTests,
        numFailedTests: results.numFailedTests,
        testResults: results.testResults,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Integration tests failed:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async runPerformanceTests(): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Set performance test environment variables
      process.env.PERFORMANCE_TEST = 'true';
      process.env.MAX_RESPONSE_TIME = this.config.suites.performance.thresholds.maxResponseTime.toString();
      process.env.MIN_THROUGHPUT = this.config.suites.performance.thresholds.minThroughput.toString();
      process.env.MAX_MEMORY_USAGE = this.config.suites.performance.thresholds.maxMemoryUsage.toString();

      const jestConfig = {
        testMatch: this.config.suites.performance.patterns,
        testTimeout: this.config.suites.performance.timeout,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/performance-setup.ts'],
        maxWorkers: 1 // Run performance tests sequentially
      };

      const configPath = path.join(this.config.reporting.outputDir, 'jest.performance.config.json');
      fs.writeFileSync(configPath, JSON.stringify(jestConfig, null, 2));

      const command = `npx jest --config ${configPath} --verbose --json --outputFile=${path.join(this.config.reporting.outputDir, 'performance-results.json')}`;
      
      execSync(command, { 
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const results = JSON.parse(fs.readFileSync(path.join(this.config.reporting.outputDir, 'performance-results.json'), 'utf8'));
      
      // Extract performance metrics from test results
      const performanceMetrics = this.extractPerformanceMetrics(results);
      
      return {
        success: results.success,
        numTotalTests: results.numTotalTests,
        numPassedTests: results.numPassedTests,
        numFailedTests: results.numFailedTests,
        testResults: results.testResults,
        performanceMetrics,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Performance tests failed:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async runSecurityTests(): Promise<any> {
    const startTime = Date.now();
    
    try {
      const jestConfig = {
        testMatch: this.config.suites.security.patterns,
        testTimeout: this.config.suites.security.timeout,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/security-setup.ts']
      };

      const configPath = path.join(this.config.reporting.outputDir, 'jest.security.config.json');
      fs.writeFileSync(configPath, JSON.stringify(jestConfig, null, 2));

      const command = `npx jest --config ${configPath} --verbose --json --outputFile=${path.join(this.config.reporting.outputDir, 'security-results.json')}`;
      
      execSync(command, { 
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const results = JSON.parse(fs.readFileSync(path.join(this.config.reporting.outputDir, 'security-results.json'), 'utf8'));
      
      // Extract security test metrics
      const securityMetrics = this.extractSecurityMetrics(results);
      
      return {
        success: results.success,
        numTotalTests: results.numTotalTests,
        numPassedTests: results.numPassedTests,
        numFailedTests: results.numFailedTests,
        testResults: results.testResults,
        securityMetrics,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Security tests failed:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async runE2ETests(): Promise<any> {
    const startTime = Date.now();
    
    try {
      const jestConfig = {
        testMatch: this.config.suites.e2e.patterns,
        testTimeout: this.config.suites.e2e.timeout,
        setupFilesAfterEnv: ['<rootDir>/src/tests/setup/e2e-setup.ts'],
        maxWorkers: 1 // Run E2E tests sequentially
      };

      const configPath = path.join(this.config.reporting.outputDir, 'jest.e2e.config.json');
      fs.writeFileSync(configPath, JSON.stringify(jestConfig, null, 2));

      const command = `npx jest --config ${configPath} --verbose --json --outputFile=${path.join(this.config.reporting.outputDir, 'e2e-results.json')}`;
      
      execSync(command, { 
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const results = JSON.parse(fs.readFileSync(path.join(this.config.reporting.outputDir, 'e2e-results.json'), 'utf8'));
      
      return {
        success: results.success,
        numTotalTests: results.numTotalTests,
        numPassedTests: results.numPassedTests,
        numFailedTests: results.numFailedTests,
        testResults: results.testResults,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('E2E tests failed:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private extractPerformanceMetrics(results: any): any {
    const metrics = {
      averageResponseTime: 0,
      maxResponseTime: 0,
      throughput: 0,
      memoryUsage: 0,
      concurrentSessions: 0
    };

    // Extract metrics from test output (would be implemented based on actual test structure)
    // This is a placeholder implementation
    if (results.testResults) {
      results.testResults.forEach((testFile: any) => {
        testFile.assertionResults.forEach((test: any) => {
          if (test.title.includes('performance') || test.title.includes('concurrent')) {
            // Extract performance data from test output
            // Implementation would depend on how metrics are captured in tests
          }
        });
      });
    }

    return metrics;
  }

  private extractSecurityMetrics(results: any): any {
    const metrics = {
      vulnerabilitiesFound: 0,
      securityTestsPassed: 0,
      accessControlTests: 0,
      dataProtectionTests: 0,
      complianceTests: 0
    };

    // Extract security metrics from test results
    if (results.testResults) {
      results.testResults.forEach((testFile: any) => {
        testFile.assertionResults.forEach((test: any) => {
          if (test.status === 'passed') {
            metrics.securityTestsPassed++;
            
            if (test.title.includes('access control') || test.title.includes('authorization')) {
              metrics.accessControlTests++;
            }
            if (test.title.includes('data protection') || test.title.includes('encryption')) {
              metrics.dataProtectionTests++;
            }
            if (test.title.includes('compliance') || test.title.includes('audit')) {
              metrics.complianceTests++;
            }
          }
        });
      });
    }

    return metrics;
  }

  private async generateReport(suiteResults: any[], totalTime: number): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      totalExecutionTime: totalTime,
      summary: {
        totalSuites: suiteResults.length,
        passedSuites: suiteResults.filter(s => s.success).length,
        failedSuites: suiteResults.filter(s => !s.success).length,
        totalTests: suiteResults.reduce((sum, s) => sum + (s.numTotalTests || 0), 0),
        passedTests: suiteResults.reduce((sum, s) => sum + (s.numPassedTests || 0), 0),
        failedTests: suiteResults.reduce((sum, s) => sum + (s.numFailedTests || 0), 0)
      },
      suiteResults,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage()
      }
    };

    // Generate JSON report
    if (this.config.reporting.formats.includes('json')) {
      const jsonPath = path.join(this.config.reporting.outputDir, 'comprehensive-report.json');
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
      console.log(`📊 JSON report generated: ${jsonPath}`);
    }

    // Generate HTML report
    if (this.config.reporting.formats.includes('html')) {
      const htmlReport = this.generateHTMLReport(report);
      const htmlPath = path.join(this.config.reporting.outputDir, 'comprehensive-report.html');
      fs.writeFileSync(htmlPath, htmlReport);
      console.log(`📊 HTML report generated: ${htmlPath}`);
    }

    // Generate JUnit XML report
    if (this.config.reporting.formats.includes('junit')) {
      const junitReport = this.generateJUnitReport(report);
      const junitPath = path.join(this.config.reporting.outputDir, 'junit-report.xml');
      fs.writeFileSync(junitPath, junitReport);
      console.log(`📊 JUnit report generated: ${junitPath}`);
    }

    // Print summary to console
    this.printSummary(report);
  }

  private generateHTMLReport(report: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>AgentCore Test Suite Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4f8; padding: 15px; border-radius: 5px; text-align: center; }
        .suite { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .passed { border-left: 5px solid #4caf50; }
        .failed { border-left: 5px solid #f44336; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AgentCore Comprehensive Test Suite Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Total Execution Time: ${report.totalExecutionTime}ms</p>
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
    
    <h2>Test Suite Results</h2>
    ${report.suiteResults.map((suite: any) => `
        <div class="suite ${suite.success ? 'passed' : 'failed'}">
            <h3>${suite.suite.toUpperCase()} Tests</h3>
            <p>Status: ${suite.success ? '✅ PASSED' : '❌ FAILED'}</p>
            <p>Tests: ${suite.numPassedTests || 0}/${suite.numTotalTests || 0}</p>
            <p>Execution Time: ${suite.executionTime}ms</p>
            ${suite.error ? `<p style="color: red;">Error: ${suite.error}</p>` : ''}
        </div>
    `).join('')}
    
    <h2>Environment Information</h2>
    <div class="metrics">
        <div>Node Version: ${report.environment.nodeVersion}</div>
        <div>Platform: ${report.environment.platform}</div>
        <div>Architecture: ${report.environment.arch}</div>
        <div>Memory Usage: ${Math.round(report.environment.memory.heapUsed / 1024 / 1024)}MB</div>
    </div>
</body>
</html>
    `;
  }

  private generateJUnitReport(report: any): string {
    const testsuites = report.suiteResults.map((suite: any) => {
      const testcases = suite.testResults?.map((test: any) => 
        test.assertionResults?.map((assertion: any) => `
          <testcase name="${assertion.title}" classname="${suite.suite}" time="${assertion.duration || 0}">
            ${assertion.status === 'failed' ? `<failure message="${assertion.failureMessages?.join('; ') || 'Test failed'}" />` : ''}
          </testcase>
        `).join('') || ''
      ).join('') || '';

      return `
        <testsuite name="${suite.suite}" tests="${suite.numTotalTests || 0}" failures="${suite.numFailedTests || 0}" time="${suite.executionTime || 0}">
          ${testcases}
        </testsuite>
      `;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="AgentCore Test Suite" tests="${report.summary.totalTests}" failures="${report.summary.failedTests}" time="${report.totalExecutionTime}">
  ${testsuites}
</testsuites>`;
  }

  private printSummary(report: any): void {
    console.log('\n📊 Test Suite Summary');
    console.log('=====================');
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Passed: ${report.summary.passedTests}`);
    console.log(`Failed: ${report.summary.failedTests}`);
    console.log(`Success Rate: ${Math.round((report.summary.passedTests / report.summary.totalTests) * 100)}%`);
    console.log(`Total Time: ${report.totalExecutionTime}ms`);
    
    console.log('\n📋 Suite Breakdown:');
    report.suiteResults.forEach((suite: any) => {
      const status = suite.success ? '✅' : '❌';
      console.log(`${status} ${suite.suite.toUpperCase()}: ${suite.numPassedTests || 0}/${suite.numTotalTests || 0} (${suite.executionTime}ms)`);
    });
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: Partial<TestSuiteConfig> = {};

  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--no-unit') config.suites = { ...config.suites, unit: { ...DEFAULT_CONFIG.suites.unit, enabled: false } };
    if (arg === '--no-integration') config.suites = { ...config.suites, integration: { ...DEFAULT_CONFIG.suites.integration, enabled: false } };
    if (arg === '--no-performance') config.suites = { ...config.suites, performance: { ...DEFAULT_CONFIG.suites.performance, enabled: false } };
    if (arg === '--no-security') config.suites = { ...config.suites, security: { ...DEFAULT_CONFIG.suites.security, enabled: false } };
    if (arg === '--no-e2e') config.suites = { ...config.suites, e2e: { ...DEFAULT_CONFIG.suites.e2e, enabled: false } };
  });

  const testSuite = new AgentCoreTestSuite(config);
  testSuite.runAllTests().catch(error => {
    console.error('Test suite execution failed:', error);
    process.exit(1);
  });
}

export { AgentCoreTestSuite, TestSuiteConfig };