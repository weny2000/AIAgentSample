/**
 * Performance Benchmark Tests for Work Task Analysis Services
 * Tests response times, throughput, and resource utilization
 */

import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { Logger } from '../../lambda/utils/logger';
import { WorkTaskContent } from '../../models/work-task';

describe('Work Task Analysis Performance Benchmarks', () => {
  let analysisService: WorkTaskAnalysisService;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockLogger: jest.Mocked<Logger>;

  const performanceMetrics = {
    analysisTime: [] as number[],
    keyPointExtractionTime: [] as number[],
    knowledgeSearchTime: [] as number[],
    workgroupIdentificationTime: [] as number[],
    todoGenerationTime: [] as number[],
    memoryUsage: [] as number[]
  };

  beforeAll(() => {
    // Setup mocks with realistic delays
    mockKendraService = {
      search: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate 50ms search
        return {
          results: [
            {
              id: 'doc-1',
              title: 'API Documentation',
              excerpt: 'REST API implementation guide',
              score: 0.85,
              uri: 'https://docs.example.com/api'
            }
          ],
          totalResults: 1
        };
      })
    } as any;

    mockRulesEngine = {
      evaluateRules: jest.fn().mockResolvedValue({
        passed: true,
        violations: [],
        score: 0.95
      })
    } as any;

    mockAuditRepository = {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' })
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
    // Print performance summary
    console.log('\n=== Performance Benchmark Summary ===');
    console.log(`Average Analysis Time: ${calculateAverage(performanceMetrics.analysisTime).toFixed(2)}ms`);
    console.log(`P95 Analysis Time: ${calculatePercentile(performanceMetrics.analysisTime, 95).toFixed(2)}ms`);
    console.log(`P99 Analysis Time: ${calculatePercentile(performanceMetrics.analysisTime, 99).toFixed(2)}ms`);
    console.log(`Max Analysis Time: ${Math.max(...performanceMetrics.analysisTime).toFixed(2)}ms`);
    console.log(`Min Analysis Time: ${Math.min(...performanceMetrics.analysisTime).toFixed(2)}ms`);
    console.log(`Average Memory Usage: ${calculateAverage(performanceMetrics.memoryUsage).toFixed(2)}MB`);
    console.log('=====================================\n');
  });

  describe('Task Analysis Response Time', () => {
    test('should complete simple task analysis within 2 seconds', async () => {
      const taskContent = createMockTaskContent('simple');
      
      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      const result = await analysisService.analyzeWorkTask(taskContent);
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const duration = endTime - startTime;
      const memoryUsed = endMemory - startMemory;

      performanceMetrics.analysisTime.push(duration);
      performanceMetrics.memoryUsage.push(memoryUsed);

      expect(result).toBeDefined();
      expect(result.keyPoints).toBeDefined();
      expect(duration).toBeLessThan(2000); // 2 seconds
      
      console.log(`Simple task analysis: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    });

    test('should complete medium complexity task analysis within 3 seconds', async () => {
      const taskContent = createMockTaskContent('medium');
      
      const startTime = performance.now();
      const result = await analysisService.analyzeWorkTask(taskContent);
      const duration = performance.now() - startTime;

      performanceMetrics.analysisTime.push(duration);

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(3000); // 3 seconds
      
      console.log(`Medium task analysis: ${duration.toFixed(2)}ms`);
    });

    test('should complete complex task analysis within 5 seconds', async () => {
      const taskContent = createMockTaskContent('complex');
      
      const startTime = performance.now();
      const result = await analysisService.analyzeWorkTask(taskContent);
      const duration = performance.now() - startTime;

      performanceMetrics.analysisTime.push(duration);

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // 5 seconds
      
      console.log(`Complex task analysis: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Component Performance Benchmarks', () => {
    test('should extract key points within 500ms', async () => {
      const taskContent = createMockTaskContent('medium');
      
      const startTime = performance.now();
      // Access private method through any cast for testing
      const keyPoints = await (analysisService as any).extractKeyPoints(taskContent);
      const duration = performance.now() - startTime;

      performanceMetrics.keyPointExtractionTime.push(duration);

      expect(keyPoints).toBeDefined();
      expect(Array.isArray(keyPoints)).toBe(true);
      expect(duration).toBeLessThan(500);
      
      console.log(`Key point extraction: ${duration.toFixed(2)}ms`);
    });

    test('should search knowledge base within 1 second', async () => {
      const taskContent = createMockTaskContent('medium');
      
      const startTime = performance.now();
      const knowledge = await (analysisService as any).searchRelevantKnowledge(taskContent);
      const duration = performance.now() - startTime;

      performanceMetrics.knowledgeSearchTime.push(duration);

      expect(knowledge).toBeDefined();
      expect(duration).toBeLessThan(1000);
      
      console.log(`Knowledge search: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Throughput Tests', () => {
    test('should handle 10 sequential analyses within 20 seconds', async () => {
      const startTime = performance.now();
      const results = [];

      for (let i = 0; i < 10; i++) {
        const taskContent = createMockTaskContent('simple', `task-${i}`);
        const result = await analysisService.analyzeWorkTask(taskContent);
        results.push(result);
      }

      const duration = performance.now() - startTime;
      const avgTime = duration / 10;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(20000); // 20 seconds total
      expect(avgTime).toBeLessThan(2000); // 2 seconds average
      
      console.log(`10 sequential analyses: ${duration.toFixed(2)}ms total, ${avgTime.toFixed(2)}ms average`);
    });

    test('should handle 5 parallel analyses within 6 seconds', async () => {
      const startTime = performance.now();
      
      const promises = Array.from({ length: 5 }, (_, i) => {
        const taskContent = createMockTaskContent('simple', `parallel-task-${i}`);
        return analysisService.analyzeWorkTask(taskContent);
      });

      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(6000); // 6 seconds for 5 parallel
      
      console.log(`5 parallel analyses: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage Tests', () => {
    test('should not leak memory during repeated analyses', async () => {
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Run 20 analyses
      for (let i = 0; i < 20; i++) {
        const taskContent = createMockTaskContent('simple', `memory-test-${i}`);
        await analysisService.analyzeWorkTask(taskContent);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB for 20 analyses)
      expect(memoryIncrease).toBeLessThan(50);
      
      console.log(`Memory increase after 20 analyses: ${memoryIncrease.toFixed(2)}MB`);
    });

    test('should handle large task content efficiently', async () => {
      const largeContent = 'This is a test sentence. '.repeat(1000); // ~25KB of text
      const taskContent: WorkTaskContent = {
        id: 'large-task-1',
        title: 'Large Task',
        description: 'A task with large content',
        content: largeContent,
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'medium'
      };

      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const startTime = performance.now();
      
      const result = await analysisService.analyzeWorkTask(taskContent);
      
      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should still complete in 5 seconds
      expect(memoryUsed).toBeLessThan(100); // Should use less than 100MB
      
      console.log(`Large content analysis: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    });
  });

  describe('Scalability Tests', () => {
    test('should maintain performance with increasing load', async () => {
      const batchSizes = [1, 5, 10, 20];
      const results: { batchSize: number; avgTime: number; totalTime: number }[] = [];

      for (const batchSize of batchSizes) {
        const startTime = performance.now();
        
        const promises = Array.from({ length: batchSize }, (_, i) => {
          const taskContent = createMockTaskContent('simple', `scale-test-${batchSize}-${i}`);
          return analysisService.analyzeWorkTask(taskContent);
        });

        await Promise.all(promises);
        
        const totalTime = performance.now() - startTime;
        const avgTime = totalTime / batchSize;

        results.push({ batchSize, avgTime, totalTime });
        
        console.log(`Batch size ${batchSize}: ${totalTime.toFixed(2)}ms total, ${avgTime.toFixed(2)}ms average`);
      }

      // Average time per task should not increase dramatically with batch size
      const firstAvg = results[0].avgTime;
      const lastAvg = results[results.length - 1].avgTime;
      const degradation = (lastAvg - firstAvg) / firstAvg;

      // Performance degradation should be less than 50%
      expect(degradation).toBeLessThan(0.5);
    });
  });
});

// Helper functions
function createMockTaskContent(complexity: 'simple' | 'medium' | 'complex', id: string = 'test-task-1'): WorkTaskContent {
  const complexityContent = {
    simple: {
      title: 'Simple Task',
      description: 'A simple task for testing',
      content: 'Implement a basic API endpoint for user authentication. Must support JWT tokens and return user profile data.'
    },
    medium: {
      title: 'Medium Complexity Task',
      description: 'A medium complexity task with multiple requirements',
      content: `Implement a comprehensive user management system with the following requirements:
        1. User registration with email verification
        2. Password reset functionality
        3. Role-based access control (RBAC)
        4. User profile management
        5. Activity logging and audit trails
        6. Integration with existing authentication service
        7. Performance requirement: Response time < 200ms
        8. Security requirement: All data must be encrypted at rest
        9. Compliance: Must meet GDPR requirements
        10. Testing: Unit tests with >80% coverage required`
    },
    complex: {
      title: 'Complex Enterprise Task',
      description: 'A complex task with extensive requirements and dependencies',
      content: `Design and implement a microservices-based order processing system with the following comprehensive requirements:
        
        Architecture Requirements:
        - Microservices architecture with API Gateway
        - Event-driven communication using message queues
        - CQRS pattern for read/write separation
        - Distributed transaction management with Saga pattern
        
        Functional Requirements:
        1. Order creation and validation service
        2. Inventory management integration
        3. Payment processing with multiple providers
        4. Shipping and logistics coordination
        5. Real-time order tracking
        6. Customer notification system
        7. Returns and refunds processing
        8. Analytics and reporting dashboard
        
        Non-Functional Requirements:
        - Performance: Handle 10,000 orders per minute
        - Availability: 99.99% uptime SLA
        - Scalability: Auto-scaling based on load
        - Security: PCI-DSS compliance for payment data
        - Monitoring: Real-time metrics and alerting
        - Disaster Recovery: RPO < 1 hour, RTO < 4 hours
        
        Technical Constraints:
        - Must integrate with legacy ERP system
        - Database: PostgreSQL for transactional data, MongoDB for analytics
        - Message Queue: RabbitMQ or AWS SQS
        - Caching: Redis for session and frequently accessed data
        - API: RESTful with OpenAPI 3.0 specification
        
        Quality Requirements:
        - Code coverage: >85%
        - Performance testing: Load tests for peak scenarios
        - Security testing: OWASP Top 10 compliance
        - Documentation: Complete API docs and architecture diagrams
        
        Timeline: 12 weeks with 3 major milestones
        Team: 5 developers, 2 QA engineers, 1 DevOps engineer
        Budget: $500,000`
    }
  };

  return {
    id,
    ...complexityContent[complexity],
    submittedBy: 'test-user',
    teamId: 'test-team',
    submittedAt: new Date(),
    priority: complexity === 'complex' ? 'critical' : complexity === 'medium' ? 'high' : 'medium',
    category: 'development',
    tags: ['api', 'backend', 'testing']
  };
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
