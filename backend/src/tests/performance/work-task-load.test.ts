/**
 * Load Tests for Concurrent User Scenarios
 * Simulates multiple concurrent users submitting and analyzing work tasks
 */

import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { Logger } from '../../lambda/utils/logger';
import { WorkTaskContent } from '../../models/work-task';

describe('Work Task Analysis Load Tests', () => {
  let analysisService: WorkTaskAnalysisService;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockLogger: jest.Mocked<Logger>;

  const loadTestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalDuration: 0,
    responseTimes: [] as number[],
    concurrentUsers: 0,
    throughput: 0,
    errorRate: 0
  };

  beforeAll(() => {
    // Setup mocks with realistic behavior
    mockKendraService = {
      search: jest.fn().mockImplementation(async () => {
        // Simulate variable search times (30-100ms)
        const delay = 30 + Math.random() * 70;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
          results: Array.from({ length: 5 }, (_, i) => ({
            id: `doc-${i}`,
            title: `Document ${i}`,
            excerpt: `Relevant content for document ${i}`,
            score: 0.7 + Math.random() * 0.3,
            uri: `https://docs.example.com/doc-${i}`
          })),
          totalResults: 5
        };
      })
    } as any;

    mockRulesEngine = {
      evaluateRules: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          passed: true,
          violations: [],
          score: 0.9 + Math.random() * 0.1
        };
      })
    } as any;

    mockAuditRepository = {
      create: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { id: `audit-${Date.now()}` };
      })
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    analysisService = new WorkTaskAnalysisService(
      mockKendraService,
      mockRulesEngine,
      mockAuditRepository,
      mockLogger
    );
  });

  afterAll(() => {
    // Print load test summary
    console.log('\n=== Load Test Summary ===');
    console.log(`Total Requests: ${loadTestMetrics.totalRequests}`);
    console.log(`Successful: ${loadTestMetrics.successfulRequests}`);
    console.log(`Failed: ${loadTestMetrics.failedRequests}`);
    console.log(`Success Rate: ${((loadTestMetrics.successfulRequests / loadTestMetrics.totalRequests) * 100).toFixed(2)}%`);
    console.log(`Average Response Time: ${calculateAverage(loadTestMetrics.responseTimes).toFixed(2)}ms`);
    console.log(`P95 Response Time: ${calculatePercentile(loadTestMetrics.responseTimes, 95).toFixed(2)}ms`);
    console.log(`P99 Response Time: ${calculatePercentile(loadTestMetrics.responseTimes, 99).toFixed(2)}ms`);
    console.log(`Throughput: ${loadTestMetrics.throughput.toFixed(2)} requests/second`);
    console.log(`Error Rate: ${(loadTestMetrics.errorRate * 100).toFixed(2)}%`);
    console.log('========================\n');
  });

  describe('Concurrent User Load Tests', () => {
    test('should handle 10 concurrent users', async () => {
      const concurrentUsers = 10;
      const result = await runConcurrentUserTest(concurrentUsers, analysisService);
      
      updateLoadMetrics(result);

      expect(result.successRate).toBeGreaterThan(0.95); // 95% success rate
      expect(result.avgResponseTime).toBeLessThan(3000); // 3 seconds average
      
      console.log(`10 concurrent users: ${result.successRate * 100}% success, ${result.avgResponseTime.toFixed(2)}ms avg`);
    });

    test('should handle 25 concurrent users', async () => {
      const concurrentUsers = 25;
      const result = await runConcurrentUserTest(concurrentUsers, analysisService);
      
      updateLoadMetrics(result);

      expect(result.successRate).toBeGreaterThan(0.90); // 90% success rate
      expect(result.avgResponseTime).toBeLessThan(5000); // 5 seconds average
      
      console.log(`25 concurrent users: ${result.successRate * 100}% success, ${result.avgResponseTime.toFixed(2)}ms avg`);
    });

    test('should handle 50 concurrent users', async () => {
      const concurrentUsers = 50;
      const result = await runConcurrentUserTest(concurrentUsers, analysisService);
      
      updateLoadMetrics(result);

      expect(result.successRate).toBeGreaterThan(0.85); // 85% success rate
      expect(result.avgResponseTime).toBeLessThan(8000); // 8 seconds average
      
      console.log(`50 concurrent users: ${result.successRate * 100}% success, ${result.avgResponseTime.toFixed(2)}ms avg`);
    }, 60000); // 60 second timeout

    test('should handle 100 concurrent users with acceptable degradation', async () => {
      const concurrentUsers = 100;
      const result = await runConcurrentUserTest(concurrentUsers, analysisService);
      
      updateLoadMetrics(result);

      expect(result.successRate).toBeGreaterThan(0.80); // 80% success rate
      expect(result.avgResponseTime).toBeLessThan(12000); // 12 seconds average
      
      console.log(`100 concurrent users: ${result.successRate * 100}% success, ${result.avgResponseTime.toFixed(2)}ms avg`);
    }, 120000); // 120 second timeout
  });

  describe('Sustained Load Tests', () => {
    test('should maintain performance under sustained load (5 minutes)', async () => {
      const durationMs = 5 * 60 * 1000; // 5 minutes
      const requestsPerSecond = 2;
      const result = await runSustainedLoadTest(durationMs, requestsPerSecond, analysisService);

      expect(result.successRate).toBeGreaterThan(0.90);
      expect(result.avgResponseTime).toBeLessThan(5000);
      expect(result.throughput).toBeGreaterThan(1.5); // At least 1.5 req/sec
      
      console.log(`Sustained load (5min): ${result.totalRequests} requests, ${result.successRate * 100}% success`);
    }, 360000); // 6 minute timeout

    test('should handle burst traffic patterns', async () => {
      const result = await runBurstTrafficTest(analysisService);

      expect(result.successRate).toBeGreaterThan(0.85);
      expect(result.peakResponseTime).toBeLessThan(10000);
      
      console.log(`Burst traffic: ${result.totalRequests} requests, ${result.successRate * 100}% success`);
    }, 120000);
  });

  describe('Stress Tests', () => {
    test('should identify breaking point with increasing load', async () => {
      const result = await runStressTest(analysisService);

      expect(result.breakingPoint).toBeGreaterThan(50); // Should handle at least 50 concurrent
      expect(result.maxThroughput).toBeGreaterThan(10); // At least 10 req/sec
      
      console.log(`Breaking point: ${result.breakingPoint} concurrent users, max throughput: ${result.maxThroughput.toFixed(2)} req/sec`);
    }, 180000); // 3 minute timeout

    test('should recover gracefully after overload', async () => {
      // First, overload the system
      await runConcurrentUserTest(150, analysisService);
      
      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Test normal load
      const result = await runConcurrentUserTest(10, analysisService);

      expect(result.successRate).toBeGreaterThan(0.90); // Should recover to 90%+
      expect(result.avgResponseTime).toBeLessThan(4000);
      
      console.log(`Recovery test: ${result.successRate * 100}% success after overload`);
    }, 180000);
  });

  describe('Mixed Workload Tests', () => {
    test('should handle mixed complexity workload', async () => {
      const result = await runMixedWorkloadTest(analysisService);

      expect(result.successRate).toBeGreaterThan(0.90);
      expect(result.simpleTaskAvgTime).toBeLessThan(2000);
      expect(result.complexTaskAvgTime).toBeLessThan(6000);
      
      console.log(`Mixed workload: Simple ${result.simpleTaskAvgTime.toFixed(2)}ms, Complex ${result.complexTaskAvgTime.toFixed(2)}ms`);
    }, 120000);

    test('should prioritize critical tasks under load', async () => {
      const result = await runPriorityTest(analysisService);

      expect(result.criticalTaskAvgTime).toBeLessThan(result.lowPriorityTaskAvgTime);
      expect(result.criticalTaskSuccessRate).toBeGreaterThan(0.95);
      
      console.log(`Priority test: Critical ${result.criticalTaskAvgTime.toFixed(2)}ms, Low ${result.lowPriorityTaskAvgTime.toFixed(2)}ms`);
    }, 120000);
  });
});

// Helper functions for load testing
async function runConcurrentUserTest(
  concurrentUsers: number,
  service: WorkTaskAnalysisService
): Promise<LoadTestResult> {
  const startTime = Date.now();
  const results: { success: boolean; duration: number }[] = [];

  const promises = Array.from({ length: concurrentUsers }, async (_, i) => {
    const taskStartTime = Date.now();
    try {
      const taskContent = createRandomTaskContent(`concurrent-${concurrentUsers}-${i}`);
      await service.analyzeWorkTask(taskContent);
      const duration = Date.now() - taskStartTime;
      results.push({ success: true, duration });
    } catch (error) {
      const duration = Date.now() - taskStartTime;
      results.push({ success: false, duration });
    }
  });

  await Promise.all(promises);

  const totalDuration = Date.now() - startTime;
  const successfulResults = results.filter(r => r.success);
  const responseTimes = results.map(r => r.duration);

  return {
    totalRequests: concurrentUsers,
    successfulRequests: successfulResults.length,
    failedRequests: results.length - successfulResults.length,
    successRate: successfulResults.length / results.length,
    avgResponseTime: calculateAverage(responseTimes),
    p95ResponseTime: calculatePercentile(responseTimes, 95),
    p99ResponseTime: calculatePercentile(responseTimes, 99),
    totalDuration,
    throughput: (results.length / totalDuration) * 1000
  };
}

async function runSustainedLoadTest(
  durationMs: number,
  requestsPerSecond: number,
  service: WorkTaskAnalysisService
): Promise<SustainedLoadResult> {
  const startTime = Date.now();
  const results: { success: boolean; duration: number }[] = [];
  const intervalMs = 1000 / requestsPerSecond;
  let requestCount = 0;

  while (Date.now() - startTime < durationMs) {
    const taskStartTime = Date.now();
    
    try {
      const taskContent = createRandomTaskContent(`sustained-${requestCount++}`);
      await service.analyzeWorkTask(taskContent);
      const duration = Date.now() - taskStartTime;
      results.push({ success: true, duration });
    } catch (error) {
      const duration = Date.now() - taskStartTime;
      results.push({ success: false, duration });
    }

    // Wait for next interval
    const elapsed = Date.now() - taskStartTime;
    if (elapsed < intervalMs) {
      await new Promise(resolve => setTimeout(resolve, intervalMs - elapsed));
    }
  }

  const totalDuration = Date.now() - startTime;
  const successfulResults = results.filter(r => r.success);
  const responseTimes = results.map(r => r.duration);

  return {
    totalRequests: results.length,
    successfulRequests: successfulResults.length,
    successRate: successfulResults.length / results.length,
    avgResponseTime: calculateAverage(responseTimes),
    totalDuration,
    throughput: (results.length / totalDuration) * 1000
  };
}

async function runBurstTrafficTest(service: WorkTaskAnalysisService): Promise<BurstTrafficResult> {
  const results: { success: boolean; duration: number }[] = [];
  
  // Simulate burst pattern: low -> high -> low
  const burstPattern = [
    { users: 5, duration: 10000 },   // 5 users for 10 seconds
    { users: 50, duration: 20000 },  // Burst to 50 users for 20 seconds
    { users: 10, duration: 10000 }   // Back to 10 users for 10 seconds
  ];

  for (const phase of burstPattern) {
    const phaseStartTime = Date.now();
    const requestsPerSecond = phase.users / 10; // Spread over 10 seconds
    const intervalMs = 1000 / requestsPerSecond;
    let requestCount = 0;

    while (Date.now() - phaseStartTime < phase.duration) {
      const taskStartTime = Date.now();
      
      try {
        const taskContent = createRandomTaskContent(`burst-${phase.users}-${requestCount++}`);
        await service.analyzeWorkTask(taskContent);
        const duration = Date.now() - taskStartTime;
        results.push({ success: true, duration });
      } catch (error) {
        const duration = Date.now() - taskStartTime;
        results.push({ success: false, duration });
      }

      const elapsed = Date.now() - taskStartTime;
      if (elapsed < intervalMs) {
        await new Promise(resolve => setTimeout(resolve, intervalMs - elapsed));
      }
    }
  }

  const successfulResults = results.filter(r => r.success);
  const responseTimes = results.map(r => r.duration);

  return {
    totalRequests: results.length,
    successfulRequests: successfulResults.length,
    successRate: successfulResults.length / results.length,
    peakResponseTime: Math.max(...responseTimes),
    avgResponseTime: calculateAverage(responseTimes)
  };
}

async function runStressTest(service: WorkTaskAnalysisService): Promise<StressTestResult> {
  let currentLoad = 10;
  let breakingPoint = 0;
  let maxThroughput = 0;
  const stepSize = 10;
  const maxLoad = 200;

  while (currentLoad <= maxLoad) {
    const result = await runConcurrentUserTest(currentLoad, service);
    
    if (result.throughput > maxThroughput) {
      maxThroughput = result.throughput;
    }

    // Consider breaking point when success rate drops below 70%
    if (result.successRate < 0.7) {
      breakingPoint = currentLoad;
      break;
    }

    currentLoad += stepSize;
  }

  return {
    breakingPoint: breakingPoint || maxLoad,
    maxThroughput
  };
}

async function runMixedWorkloadTest(service: WorkTaskAnalysisService): Promise<MixedWorkloadResult> {
  const simpleResults: number[] = [];
  const mediumResults: number[] = [];
  const complexResults: number[] = [];
  let successCount = 0;
  let totalCount = 0;

  // Run 30 tasks with mixed complexity (10 each)
  const tasks = [
    ...Array(10).fill('simple'),
    ...Array(10).fill('medium'),
    ...Array(10).fill('complex')
  ];

  const promises = tasks.map(async (complexity, i) => {
    const startTime = Date.now();
    totalCount++;
    
    try {
      const taskContent = createTaskByComplexity(complexity as any, `mixed-${i}`);
      await service.analyzeWorkTask(taskContent);
      const duration = Date.now() - startTime;
      
      if (complexity === 'simple') simpleResults.push(duration);
      else if (complexity === 'medium') mediumResults.push(duration);
      else complexResults.push(duration);
      
      successCount++;
    } catch (error) {
      // Task failed
    }
  });

  await Promise.all(promises);

  return {
    totalRequests: totalCount,
    successfulRequests: successCount,
    successRate: successCount / totalCount,
    simpleTaskAvgTime: calculateAverage(simpleResults),
    mediumTaskAvgTime: calculateAverage(mediumResults),
    complexTaskAvgTime: calculateAverage(complexResults)
  };
}

async function runPriorityTest(service: WorkTaskAnalysisService): Promise<PriorityTestResult> {
  const criticalResults: number[] = [];
  const highResults: number[] = [];
  const lowResults: number[] = [];
  let criticalSuccess = 0;
  let lowSuccess = 0;

  // Run 30 tasks with mixed priorities under load
  const tasks = [
    ...Array(10).fill('critical'),
    ...Array(10).fill('high'),
    ...Array(10).fill('low')
  ];

  const promises = tasks.map(async (priority, i) => {
    const startTime = Date.now();
    
    try {
      const taskContent = createTaskWithPriority(priority as any, `priority-${i}`);
      await service.analyzeWorkTask(taskContent);
      const duration = Date.now() - startTime;
      
      if (priority === 'critical') {
        criticalResults.push(duration);
        criticalSuccess++;
      } else if (priority === 'high') {
        highResults.push(duration);
      } else {
        lowResults.push(duration);
        lowSuccess++;
      }
    } catch (error) {
      // Task failed
    }
  });

  await Promise.all(promises);

  return {
    criticalTaskAvgTime: calculateAverage(criticalResults),
    highTaskAvgTime: calculateAverage(highResults),
    lowPriorityTaskAvgTime: calculateAverage(lowResults),
    criticalTaskSuccessRate: criticalSuccess / 10,
    lowPriorityTaskSuccessRate: lowSuccess / 10
  };
}

function createRandomTaskContent(id: string): WorkTaskContent {
  const complexities = ['simple', 'medium', 'complex'] as const;
  const complexity = complexities[Math.floor(Math.random() * complexities.length)];
  return createTaskByComplexity(complexity, id);
}

function createTaskByComplexity(
  complexity: 'simple' | 'medium' | 'complex',
  id: string
): WorkTaskContent {
  const templates = {
    simple: {
      title: 'Simple API Task',
      description: 'Create a basic REST endpoint',
      content: 'Implement GET /api/users endpoint with pagination support.'
    },
    medium: {
      title: 'User Management Feature',
      description: 'Implement user CRUD operations',
      content: 'Create user management system with authentication, authorization, and profile management.'
    },
    complex: {
      title: 'Microservices Architecture',
      description: 'Design and implement microservices',
      content: 'Design microservices architecture with API gateway, service discovery, load balancing, and monitoring.'
    }
  };

  return {
    id,
    ...templates[complexity],
    submittedBy: `user-${Math.floor(Math.random() * 100)}`,
    teamId: `team-${Math.floor(Math.random() * 10)}`,
    submittedAt: new Date(),
    priority: 'medium',
    category: 'development'
  };
}

function createTaskWithPriority(
  priority: 'critical' | 'high' | 'medium' | 'low',
  id: string
): WorkTaskContent {
  return {
    id,
    title: `${priority} Priority Task`,
    description: `A task with ${priority} priority`,
    content: 'Implement required functionality according to specifications.',
    submittedBy: 'test-user',
    teamId: 'test-team',
    submittedAt: new Date(),
    priority,
    category: 'development'
  };
}

function updateLoadMetrics(result: LoadTestResult): void {
  loadTestMetrics.totalRequests += result.totalRequests;
  loadTestMetrics.successfulRequests += result.successfulRequests;
  loadTestMetrics.failedRequests += result.failedRequests;
  loadTestMetrics.responseTimes.push(...Array(result.totalRequests).fill(result.avgResponseTime));
  loadTestMetrics.throughput = result.throughput;
  loadTestMetrics.errorRate = 1 - result.successRate;
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function calculatePercentile(numbers: number[], percentile: number): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

// Type definitions
interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalDuration: number;
  throughput: number;
}

interface SustainedLoadResult {
  totalRequests: number;
  successfulRequests: number;
  successRate: number;
  avgResponseTime: number;
  totalDuration: number;
  throughput: number;
}

interface BurstTrafficResult {
  totalRequests: number;
  successfulRequests: number;
  successRate: number;
  peakResponseTime: number;
  avgResponseTime: number;
}

interface StressTestResult {
  breakingPoint: number;
  maxThroughput: number;
}

interface MixedWorkloadResult {
  totalRequests: number;
  successfulRequests: number;
  successRate: number;
  simpleTaskAvgTime: number;
  mediumTaskAvgTime: number;
  complexTaskAvgTime: number;
}

interface PriorityTestResult {
  criticalTaskAvgTime: number;
  highTaskAvgTime: number;
  lowPriorityTaskAvgTime: number;
  criticalTaskSuccessRate: number;
  lowPriorityTaskSuccessRate: number;
}

// Make loadTestMetrics accessible for afterAll
const loadTestMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalDuration: 0,
  responseTimes: [] as number[],
  concurrentUsers: 0,
  throughput: 0,
  errorRate: 0
};
