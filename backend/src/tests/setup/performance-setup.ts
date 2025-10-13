/**
 * Performance Test Setup
 * Configuration and utilities for performance tests
 */

import { jest } from '@jest/globals';

// Extended timeout for performance tests
jest.setTimeout(120000);

// Performance test configuration
const PERFORMANCE_CONFIG = {
  MAX_RESPONSE_TIME: parseInt(process.env.MAX_RESPONSE_TIME || '5000'),
  MIN_THROUGHPUT: parseInt(process.env.MIN_THROUGHPUT || '10'),
  MAX_MEMORY_USAGE: parseInt(process.env.MAX_MEMORY_USAGE || '512'),
  CONCURRENT_SESSIONS: parseInt(process.env.CONCURRENT_SESSIONS || '50'),
  MESSAGES_PER_SESSION: parseInt(process.env.MESSAGES_PER_SESSION || '10')
};

// Mock AWS services with optimized responses for performance testing
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
  GetItemCommand: jest.fn(),
  PutItemCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn()
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({}) // Fast mock responses
    }))
  }
}));

// Performance monitoring utilities
class PerformanceMonitor {
  private metrics: Map<string, any> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTimer(name: string): void {
    this.startTimes.set(name, Date.now());
  }

  endTimer(name: string): number {
    const startTime = this.startTimes.get(name);
    if (!startTime) {
      throw new Error(`Timer ${name} was not started`);
    }
    
    const duration = Date.now() - startTime;
    this.startTimes.delete(name);
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name).push(duration);
    
    return duration;
  }

  getMetrics(name: string): { avg: number; min: number; max: number; count: number } {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 };
    }

    return {
      avg: values.reduce((sum: number, val: number) => sum + val, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length
    };
  }

  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name] of this.metrics) {
      result[name] = this.getMetrics(name);
    }
    return result;
  }

  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

// Memory monitoring utilities
class MemoryMonitor {
  private snapshots: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];

  takeSnapshot(): NodeJS.MemoryUsage {
    const usage = process.memoryUsage();
    this.snapshots.push({ timestamp: Date.now(), usage });
    return usage;
  }

  getMemoryTrend(): { initial: NodeJS.MemoryUsage; peak: NodeJS.MemoryUsage; final: NodeJS.MemoryUsage } {
    if (this.snapshots.length === 0) {
      const current = process.memoryUsage();
      return { initial: current, peak: current, final: current };
    }

    const initial = this.snapshots[0].usage;
    const final = this.snapshots[this.snapshots.length - 1].usage;
    const peak = this.snapshots.reduce((max, snapshot) => 
      snapshot.usage.heapUsed > max.heapUsed ? snapshot.usage : max, initial);

    return { initial, peak, final };
  }

  getMemoryLeakIndicator(): number {
    if (this.snapshots.length < 2) return 0;
    
    const initial = this.snapshots[0].usage.heapUsed;
    const final = this.snapshots[this.snapshots.length - 1].usage.heapUsed;
    
    return ((final - initial) / initial) * 100; // Percentage increase
  }

  reset(): void {
    this.snapshots = [];
  }
}

// Throughput monitoring utilities
class ThroughputMonitor {
  private operations: Array<{ timestamp: number; operation: string }> = [];

  recordOperation(operation: string): void {
    this.operations.push({ timestamp: Date.now(), operation });
  }

  getThroughput(windowMs: number = 1000): number {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recentOps = this.operations.filter(op => op.timestamp >= windowStart);
    return (recentOps.length / windowMs) * 1000; // Operations per second
  }

  getAverageThroughput(): number {
    if (this.operations.length === 0) return 0;
    
    const timeSpan = this.operations[this.operations.length - 1].timestamp - this.operations[0].timestamp;
    if (timeSpan === 0) return 0;
    
    return (this.operations.length / timeSpan) * 1000; // Operations per second
  }

  reset(): void {
    this.operations = [];
  }
}

// Global performance utilities
(global as any).performanceUtils = {
  config: PERFORMANCE_CONFIG,
  monitor: new PerformanceMonitor(),
  memory: new MemoryMonitor(),
  throughput: new ThroughputMonitor(),

  // Assertion helpers
  assertResponseTime: (duration: number, maxTime: number = PERFORMANCE_CONFIG.MAX_RESPONSE_TIME) => {
    if (duration > maxTime) {
      throw new Error(`Response time ${duration}ms exceeds maximum ${maxTime}ms`);
    }
  },

  assertThroughput: (throughput: number, minThroughput: number = PERFORMANCE_CONFIG.MIN_THROUGHPUT) => {
    if (throughput < minThroughput) {
      throw new Error(`Throughput ${throughput} ops/sec is below minimum ${minThroughput} ops/sec`);
    }
  },

  assertMemoryUsage: (usageMB: number, maxUsageMB: number = PERFORMANCE_CONFIG.MAX_MEMORY_USAGE) => {
    if (usageMB > maxUsageMB) {
      throw new Error(`Memory usage ${usageMB}MB exceeds maximum ${maxUsageMB}MB`);
    }
  },

  // Test data generators
  generateConcurrentRequests: (count: number, generator: () => any) => {
    return Array.from({ length: count }, generator);
  },

  // Stress test utilities
  runStressTest: async (testFn: () => Promise<any>, iterations: number, concurrency: number = 1) => {
    const results: any[] = [];
    const errors: any[] = [];
    
    for (let batch = 0; batch < Math.ceil(iterations / concurrency); batch++) {
      const batchSize = Math.min(concurrency, iterations - batch * concurrency);
      const batchPromises = Array.from({ length: batchSize }, async () => {
        try {
          const result = await testFn();
          results.push(result);
          return result;
        } catch (error) {
          errors.push(error);
          throw error;
        }
      });

      await Promise.allSettled(batchPromises);
    }

    return { results, errors, successRate: results.length / iterations };
  }
};

// Setup performance monitoring hooks
beforeEach(() => {
  (global as any).performanceUtils.monitor.reset();
  (global as any).performanceUtils.memory.reset();
  (global as any).performanceUtils.throughput.reset();
  (global as any).performanceUtils.memory.takeSnapshot(); // Initial snapshot
});

afterEach(() => {
  (global as any).performanceUtils.memory.takeSnapshot(); // Final snapshot
  
  // Log performance metrics if verbose mode is enabled
  if (process.env.VERBOSE_TESTS === 'true') {
    const metrics = (global as any).performanceUtils.monitor.getAllMetrics();
    const memoryTrend = (global as any).performanceUtils.memory.getMemoryTrend();
    const throughput = (global as any).performanceUtils.throughput.getAverageThroughput();
    
    console.log('Performance Metrics:', {
      timing: metrics,
      memory: {
        initial: Math.round(memoryTrend.initial.heapUsed / 1024 / 1024),
        peak: Math.round(memoryTrend.peak.heapUsed / 1024 / 1024),
        final: Math.round(memoryTrend.final.heapUsed / 1024 / 1024)
      },
      throughput: Math.round(throughput * 100) / 100
    });
  }
});

// Force garbage collection if available
if (global.gc) {
  beforeEach(() => {
    global.gc();
  });
  
  afterEach(() => {
    global.gc();
  });
}

export {};