# Performance Testing Quick Start Guide

## Overview
This guide provides quick instructions for running performance and load tests for the Work Task Analysis System.

## Prerequisites
- Node.js installed
- Dependencies installed (`npm install`)
- Sufficient system resources (recommended: 8GB RAM minimum)

## Running Tests

### Run All Performance Tests
```bash
cd backend
npm run test:performance
```
This runs all test suites sequentially and generates a comprehensive report.

**Expected Duration**: ~10-15 minutes
**Output**: Console logs + `performance-test-report.json`

### Run Individual Test Suites

#### 1. Performance Benchmarks
```bash
npm run test:performance:benchmarks
```
- **Duration**: ~2-3 minutes
- **Tests**: Response times, throughput, memory usage
- **Timeout**: 60 seconds per test

#### 2. Load Tests
```bash
npm run test:performance:load
```
- **Duration**: ~5-8 minutes
- **Tests**: Concurrent users, sustained load, burst traffic
- **Timeout**: 180 seconds per test

#### 3. Stress Tests
```bash
npm run test:performance:stress
```
- **Duration**: ~5-8 minutes
- **Tests**: Large files, memory leaks, extreme conditions
- **Timeout**: 180 seconds per test

#### 4. Database Query Performance
```bash
npm run test:performance:database
```
- **Duration**: ~3-5 minutes
- **Tests**: Query optimization, indexing, batch operations
- **Timeout**: 120 seconds per test

## Understanding Test Output

### Console Output
Each test displays:
- Test name and description
- Execution time
- Performance metrics (response time, throughput, etc.)
- Pass/fail status

Example:
```
Simple task analysis: 1523.45ms, Memory: 45.23MB
✓ should complete simple task analysis within 2 seconds
```

### Performance Report
Generated at: `backend/performance-test-report.json`

Structure:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalDuration": 600000,
  "suites": 4,
  "passed": 4,
  "failed": 0,
  "results": {
    "passed": [...],
    "failed": [],
    "skipped": []
  }
}
```

## Performance Metrics

### Key Metrics to Monitor

#### Response Time
- **Simple tasks**: < 2 seconds
- **Medium tasks**: < 3 seconds
- **Complex tasks**: < 5 seconds
- **P95**: < 5 seconds
- **P99**: < 8 seconds

#### Throughput
- **Sequential**: ~0.5 req/sec
- **Parallel**: ~2-3 req/sec
- **Maximum**: > 10 req/sec

#### Concurrent Load
- **10 users**: > 95% success rate
- **25 users**: > 90% success rate
- **50 users**: > 85% success rate
- **100 users**: > 80% success rate

#### Memory Usage
- **Typical task**: < 100MB
- **Large content**: < 500MB
- **Leak rate**: < 1MB per iteration

#### Database Performance
- **Single query**: < 20ms
- **Batch query**: < 50ms
- **Index query**: < 40ms
- **Write operation**: < 30ms

## Troubleshooting

### Tests Timing Out
**Problem**: Tests exceed timeout limits
**Solutions**:
- Increase timeout in package.json scripts
- Check system resources (CPU, memory)
- Close other applications
- Run tests individually instead of all at once

### Memory Issues
**Problem**: Out of memory errors
**Solutions**:
- Increase Node.js memory limit: `NODE_OPTIONS=--max-old-space-size=4096`
- Run tests individually
- Enable garbage collection: `NODE_OPTIONS=--expose-gc`

### Slow Performance
**Problem**: Tests run slower than expected
**Solutions**:
- Check system load
- Ensure no other heavy processes running
- Run on a machine with better specs
- Consider running tests in isolation

### Test Failures
**Problem**: Tests fail unexpectedly
**Solutions**:
- Check error messages in console
- Review test logs
- Verify mock services are working
- Check TypeScript compilation errors

## Best Practices

### When to Run Tests
- ✅ Before major releases
- ✅ After performance optimizations
- ✅ When adding new features
- ✅ During code reviews
- ✅ In CI/CD pipelines

### What to Monitor
- Response time trends
- Throughput changes
- Memory usage patterns
- Error rates
- Success rates under load

### Performance Regression Detection
Compare metrics across runs:
- Response time increase > 20% → Investigate
- Throughput decrease > 15% → Investigate
- Memory usage increase > 30% → Investigate
- Error rate increase > 5% → Investigate

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Performance Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: |
          cd backend
          npm ci
          
      - name: Run performance tests
        run: |
          cd backend
          npm run test:performance
        env:
          NODE_OPTIONS: --expose-gc --max-old-space-size=4096
          
      - name: Upload performance report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: performance-report
          path: backend/performance-test-report.json
```

### Jenkins Example
```groovy
stage('Performance Tests') {
    steps {
        dir('backend') {
            sh 'npm ci'
            sh 'npm run test:performance'
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'backend/performance-test-report.json'
        }
    }
}
```

## Advanced Usage

### Running with Custom Timeouts
```bash
# Increase timeout for load tests
npx jest src/tests/performance/work-task-load.test.ts --testTimeout=300000
```

### Running Specific Tests
```bash
# Run only concurrent user tests
npx jest src/tests/performance/work-task-load.test.ts -t "concurrent users"
```

### Running with Coverage
```bash
npm run test:performance -- --coverage
```

### Running in Watch Mode
```bash
npm run test:performance:benchmarks -- --watch
```

### Debugging Tests
```bash
# Run with verbose output
npm run test:performance:benchmarks -- --verbose

# Run with Node debugger
node --inspect-brk node_modules/.bin/jest src/tests/performance/work-task-performance.test.ts
```

## Performance Optimization Tips

### If Response Times Are High
1. Check database query optimization
2. Review algorithm complexity
3. Consider caching frequently accessed data
4. Optimize data serialization
5. Use batch operations where possible

### If Memory Usage Is High
1. Check for memory leaks
2. Review object lifecycle
3. Implement proper cleanup
4. Use streaming for large files
5. Optimize data structures

### If Throughput Is Low
1. Implement parallel processing
2. Use connection pooling
3. Optimize database queries
4. Consider async operations
5. Review bottlenecks

### If Concurrent Load Fails
1. Implement rate limiting
2. Add request queuing
3. Optimize resource allocation
4. Consider horizontal scaling
5. Review error handling

## Support and Resources

### Documentation
- [Task 21 Implementation](./TASK_21_PERFORMANCE_TESTING_IMPLEMENTATION.md)
- [Task 21 Completion Summary](./TASK_21_COMPLETION_SUMMARY.md)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

### Test Files
- Performance Benchmarks: `src/tests/performance/work-task-performance.test.ts`
- Load Tests: `src/tests/performance/work-task-load.test.ts`
- Stress Tests: `src/tests/performance/work-task-stress.test.ts`
- Database Tests: `src/tests/performance/database-query-performance.test.ts`

### Getting Help
1. Check test output and error messages
2. Review documentation
3. Check system resources
4. Verify test configuration
5. Contact development team

## Quick Reference

### Common Commands
```bash
# All tests
npm run test:performance

# Individual suites
npm run test:performance:benchmarks
npm run test:performance:load
npm run test:performance:stress
npm run test:performance:database

# With custom options
npm run test:performance -- --verbose
npm run test:performance -- --coverage
npm run test:performance -- --maxWorkers=2
```

### Expected Results
- ✅ All tests should pass
- ✅ Response times within limits
- ✅ No memory leaks detected
- ✅ Success rates above thresholds
- ✅ Report generated successfully

### Red Flags
- ❌ Response time > 2 minutes
- ❌ Success rate < 70%
- ❌ Memory growth > 1MB/iteration
- ❌ Throughput < 0.5 req/sec
- ❌ Frequent timeouts

## Conclusion

This guide provides everything needed to run and understand performance tests for the Work Task Analysis System. Regular performance testing helps maintain system quality and identify issues early.

For detailed implementation information, see [TASK_21_PERFORMANCE_TESTING_IMPLEMENTATION.md](./TASK_21_PERFORMANCE_TESTING_IMPLEMENTATION.md).
