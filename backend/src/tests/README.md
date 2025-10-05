# AgentCore Comprehensive Testing Suite

This directory contains a comprehensive testing suite for the AgentCore service, covering all aspects of functionality, performance, security, and end-to-end workflows.

## Test Structure

```
src/tests/
├── README.md                           # This file
├── agent-core-test-suite.ts           # Main test suite orchestrator
├── setup/                             # Test setup and configuration files
│   ├── integration-setup.ts           # Integration test setup
│   ├── performance-setup.ts           # Performance test setup
│   ├── security-setup.ts              # Security test setup
│   └── e2e-setup.ts                   # End-to-end test setup
├── integration/                       # Integration tests
│   └── agent-conversation-flows.test.ts
├── performance/                       # Performance tests
│   └── agent-concurrent-sessions.test.ts
├── security/                          # Security tests
│   └── agent-security.test.ts
└── e2e/                              # End-to-end tests
    └── agent-workflows.test.ts
```

## Test Categories

### 1. Unit Tests
**Location**: `src/services/__tests__/agent-core-service-comprehensive.test.ts`

Comprehensive unit tests covering:
- Session management (start, end, expiration)
- Message processing and validation
- Conversation branching and summarization
- Proactive notifications
- Memory integration
- Error handling and edge cases
- Performance and resource management

**Coverage Requirements**: 80% minimum across all metrics

### 2. Integration Tests
**Location**: `src/tests/integration/agent-conversation-flows.test.ts`

Tests complete conversation workflows:
- Single-turn conversations
- Multi-turn conversations with context
- Conversation branching
- Context-aware responses
- Error recovery in conversations
- Session lifecycle management
- Conversation analytics and insights

### 3. Performance Tests
**Location**: `src/tests/performance/agent-concurrent-sessions.test.ts`

Performance validation under load:
- Concurrent session creation (50+ sessions)
- Concurrent message processing
- Memory and resource management
- Session expiration handling
- Burst traffic patterns
- Sustained load testing
- Response time SLA compliance
- Throughput benchmarks

**Performance Thresholds**:
- Max Response Time: 5000ms
- Min Throughput: 10 requests/second
- Max Memory Usage: 512MB
- Concurrent Sessions: 50+

### 4. Security Tests
**Location**: `src/tests/security/agent-security.test.ts`

Security and compliance validation:
- Access control and authorization
- Data protection and PII handling
- Audit logging and compliance
- Injection attack prevention
- Rate limiting and DoS protection
- Data encryption and integrity
- Security monitoring and threat detection

### 5. End-to-End Tests
**Location**: `src/tests/e2e/agent-workflows.test.ts`

Complete workflow testing:
- Technical consultation workflows
- Security review processes
- Product planning sessions
- Cross-team collaboration
- Long-running project workflows
- Error recovery and resilience
- Performance under realistic load

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
# Using the test runner script
node backend/run-agent-core-tests.js

# Using the test suite class
npm run test:agent-core
```

### Run Specific Test Suites
```bash
# Unit tests only
node backend/run-agent-core-tests.js --no-integration --no-performance --no-security --no-e2e

# Performance tests only
node backend/run-agent-core-tests.js --no-unit --no-integration --no-security --no-e2e

# Security tests only
node backend/run-agent-core-tests.js --no-unit --no-integration --no-performance --no-e2e
```

### Environment Variables
```bash
# Enable verbose output
VERBOSE_TESTS=true

# Disable coverage collection
COVERAGE=false

# Disable parallel test execution
PARALLEL_TESTS=false

# Performance test configuration
MAX_RESPONSE_TIME=5000
MIN_THROUGHPUT=10
MAX_MEMORY_USAGE=512
CONCURRENT_SESSIONS=50
```

## Test Configuration

### Jest Configuration
Each test suite has its own Jest configuration:
- `jest.unit.config.json` - Unit tests with coverage
- `jest.integration.config.json` - Integration tests
- `jest.performance.config.json` - Performance tests (sequential)
- `jest.security.config.json` - Security tests
- `jest.e2e.config.json` - End-to-end tests (sequential)

### Timeouts
- Unit Tests: 30 seconds
- Integration Tests: 60 seconds
- Performance Tests: 120 seconds
- Security Tests: 60 seconds
- End-to-End Tests: 180 seconds

## Test Utilities

### Global Utilities Available in Tests

#### Integration Tests (`global.testUtils`)
```typescript
// Create mock objects
const session = global.testUtils.createMockSession();
const message = global.testUtils.createMockMessage('user', 'Hello');
const persona = global.testUtils.createMockPersona({ name: 'Custom Persona' });
```

#### Performance Tests (`global.performanceUtils`)
```typescript
// Performance monitoring
global.performanceUtils.monitor.startTimer('operation');
// ... perform operation
const duration = global.performanceUtils.monitor.endTimer('operation');

// Memory monitoring
global.performanceUtils.memory.takeSnapshot();
const trend = global.performanceUtils.memory.getMemoryTrend();

// Throughput monitoring
global.performanceUtils.throughput.recordOperation('message_sent');
const throughput = global.performanceUtils.throughput.getThroughput();

// Assertions
global.performanceUtils.assertResponseTime(duration, 2000);
global.performanceUtils.assertThroughput(throughput, 10);
global.performanceUtils.assertMemoryUsage(usageMB, 256);
```

#### Security Tests (`global.securityUtils`)
```typescript
// PII detection
const piiCheck = global.securityUtils.testUtils.detectPII(text);
const maskedText = global.securityUtils.testUtils.maskPII(text);

// Injection detection
const injectionCheck = global.securityUtils.testUtils.detectInjectionAttempt(text);

// Access control simulation
global.securityUtils.accessControl.defineRole('admin', ['read:all', 'write:all']);
global.securityUtils.accessControl.assignRole('user1', 'admin');
const hasPermission = global.securityUtils.accessControl.hasPermission('user1', 'read:all');

// Security assertions
global.securityUtils.assertNoPII(text);
global.securityUtils.assertNoInjection(text);
global.securityUtils.assertAuditLogged(mockAudit, 'user_login');
```

#### E2E Tests (`global.e2eUtils`)
```typescript
// Workflow simulation
await global.e2eUtils.testUtils.simulateUserTyping(500);
await global.e2eUtils.testUtils.simulateNetworkDelay(100);

// Scenario execution
const scenario = global.e2eUtils.testUtils.getScenario('technical-consultation');
const results = await global.e2eUtils.testUtils.executeConversationScenario(agentService, scenario);

// E2E assertions
global.e2eUtils.assertWorkflowSuccess(results);
global.e2eUtils.assertConversationQuality(results, 0.8);
global.e2eUtils.assertKnowledgeUtilization(results);
```

## Test Reports

### Generated Reports
After running tests, the following reports are generated in `test-results/agent-core/`:

1. **comprehensive-report.json** - Complete test results in JSON format
2. **comprehensive-report.html** - Interactive HTML report
3. **coverage/** - Code coverage reports (if enabled)
4. **unit-results.json** - Detailed unit test results
5. **integration-results.json** - Integration test results
6. **performance-results.json** - Performance test results
7. **security-results.json** - Security test results
8. **e2e-results.json** - End-to-end test results

### Report Contents
- Test execution summary
- Individual suite results
- Performance metrics
- Security validation results
- Coverage information
- Environment details
- Failure analysis

## Continuous Integration

### GitHub Actions Integration
```yaml
- name: Run AgentCore Tests
  run: |
    cd backend
    node run-agent-core-tests.js
  env:
    NODE_ENV: test
    COVERAGE: true
    VERBOSE_TESTS: false
```

### Quality Gates
- All tests must pass
- Code coverage ≥ 80%
- Performance thresholds met
- Security tests pass
- No critical vulnerabilities

## Troubleshooting

### Common Issues

1. **Memory Issues**
   - Increase Node.js memory: `node --max-old-space-size=4096`
   - Enable garbage collection: `node --expose-gc`

2. **Timeout Issues**
   - Increase test timeouts in Jest config
   - Check for hanging promises or async operations

3. **Mock Issues**
   - Ensure all external dependencies are properly mocked
   - Clear mocks between tests with `jest.clearAllMocks()`

4. **Performance Test Failures**
   - Check system resources during test execution
   - Adjust performance thresholds if needed
   - Run tests on dedicated CI environment

### Debug Mode
```bash
# Enable debug logging
DEBUG=agent-core:* node backend/run-agent-core-tests.js

# Run with Node.js inspector
node --inspect-brk backend/run-agent-core-tests.js
```

## Contributing

### Adding New Tests
1. Follow the existing test structure and patterns
2. Use appropriate setup files for test type
3. Include comprehensive assertions
4. Add performance benchmarks where applicable
5. Document any new test utilities

### Test Standards
- Use descriptive test names
- Include both positive and negative test cases
- Test edge cases and error conditions
- Maintain high code coverage
- Follow security testing best practices

### Code Review Checklist
- [ ] Tests cover all new functionality
- [ ] Performance implications considered
- [ ] Security aspects validated
- [ ] Error handling tested
- [ ] Documentation updated
- [ ] CI/CD integration verified

## Metrics and KPIs

### Test Metrics
- Test execution time
- Code coverage percentage
- Test success rate
- Performance benchmark results
- Security vulnerability count

### Quality Metrics
- Mean time to detect issues
- Test maintenance overhead
- False positive rate
- Test reliability score

### Performance Metrics
- Average response time
- Throughput (requests/second)
- Memory usage patterns
- Concurrent session capacity
- Error rates under load

This comprehensive testing suite ensures the AgentCore service meets all functional, performance, security, and reliability requirements while providing detailed feedback for continuous improvement.