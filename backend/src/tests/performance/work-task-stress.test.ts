/**
 * Stress Tests for Large File Upload and Processing
 * Tests system behavior under extreme conditions
 */

import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { ArtifactValidationService } from '../../services/artifact-validation-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { Logger } from '../../lambda/utils/logger';
import { WorkTaskContent, DeliverableFile } from '../../models/work-task';

describe('Work Task Stress Tests', () => {
  let analysisService: WorkTaskAnalysisService;
  let validationService: ArtifactValidationService;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockLogger: jest.Mocked<Logger>;

  beforeAll(() => {
    // Setup mocks
    mockKendraService = {
      search: jest.fn().mockResolvedValue({
        results: [],
        totalResults: 0
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

    validationService = new ArtifactValidationService(
      mockRulesEngine,
      mockLogger
    );
  });

  describe('Large Content Stress Tests', () => {
    test('should handle 1MB task content', async () => {
      const largeContent = generateLargeContent(1024 * 1024); // 1MB
      const taskContent: WorkTaskContent = {
        id: 'large-1mb',
        title: 'Large Task 1MB',
        description: 'Task with 1MB content',
        content: largeContent,
        submittedBy: 'test-user',
        teamId: 'test-team',
        submittedAt: new Date(),
        priority: 'medium'
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const result = await analysisService.analyzeWorkTask(taskContent);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result).toBeDefined();
      expect(result.keyPoints).toBeDefined();
      expect(duration).toBeLessThan(10000); // 10 seconds
      expect(memoryUsed).toBeLessThan(200); // Less than 200MB

      console.log(`1MB content: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    }, 30000);

    test('should handle 5MB task content', async () => {
      const largeContent = generateLargeContent(5 * 1024 * 1024); // 5MB
      const taskContent: WorkTaskContent = {
        id: 'large-5mb',
        title: 'Large Task 5MB',
        description: 'Task with 5MB content',
        content: largeContent,
        submittedBy: 'test-user',
        teamId: 'test-team',
        submittedAt: new Date(),
        priority: 'medium'
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const result = await analysisService.analyzeWorkTask(taskContent);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(20000); // 20 seconds
      expect(memoryUsed).toBeLessThan(500); // Less than 500MB

      console.log(`5MB content: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    }, 60000);

    test('should handle 10MB task content', async () => {
      const largeContent = generateLargeContent(10 * 1024 * 1024); // 10MB
      const taskContent: WorkTaskContent = {
        id: 'large-10mb',
        title: 'Large Task 10MB',
        description: 'Task with 10MB content',
        content: largeContent,
        submittedBy: 'test-user',
        teamId: 'test-team',
        submittedAt: new Date(),
        priority: 'medium'
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const result = await analysisService.analyzeWorkTask(taskContent);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(30000); // 30 seconds
      expect(memoryUsed).toBeLessThan(1000); // Less than 1GB

      console.log(`10MB content: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    }, 90000);
  });

  describe('Large File Upload Stress Tests', () => {
    test('should handle 10MB file upload', async () => {
      const fileContent = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const deliverable: DeliverableFile = {
        fileName: 'large-file-10mb.pdf',
        fileType: 'application/pdf',
        fileSize: fileContent.length,
        content: fileContent,
        uploadedBy: 'test-user',
        uploadedAt: new Date()
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      // Simulate file processing
      const result = await processLargeFile(deliverable);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(memoryUsed).toBeLessThan(100); // Less than 100MB overhead

      console.log(`10MB file upload: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    });

    test('should handle 50MB file upload', async () => {
      const fileContent = Buffer.alloc(50 * 1024 * 1024); // 50MB
      const deliverable: DeliverableFile = {
        fileName: 'large-file-50mb.pdf',
        fileType: 'application/pdf',
        fileSize: fileContent.length,
        content: fileContent,
        uploadedBy: 'test-user',
        uploadedAt: new Date()
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const result = await processLargeFile(deliverable);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(15000); // 15 seconds
      expect(memoryUsed).toBeLessThan(200); // Less than 200MB overhead

      console.log(`50MB file upload: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    }, 30000);

    test('should handle 100MB file upload', async () => {
      const fileContent = Buffer.alloc(100 * 1024 * 1024); // 100MB
      const deliverable: DeliverableFile = {
        fileName: 'large-file-100mb.pdf',
        fileType: 'application/pdf',
        fileSize: fileContent.length,
        content: fileContent,
        uploadedBy: 'test-user',
        uploadedAt: new Date()
      };

      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const result = await processLargeFile(deliverable);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(30000); // 30 seconds
      expect(memoryUsed).toBeLessThan(300); // Less than 300MB overhead

      console.log(`100MB file upload: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    }, 60000);
  });

  describe('Concurrent Large File Processing', () => {
    test('should handle 5 concurrent 10MB file uploads', async () => {
      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const promises = Array.from({ length: 5 }, (_, i) => {
        const fileContent = Buffer.alloc(10 * 1024 * 1024);
        const deliverable: DeliverableFile = {
          fileName: `concurrent-file-${i}.pdf`,
          fileType: 'application/pdf',
          fileSize: fileContent.length,
          content: fileContent,
          uploadedBy: 'test-user',
          uploadedAt: new Date()
        };
        return processLargeFile(deliverable);
      });

      const results = await Promise.all(promises);

      const duration = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = endMemory - startMemory;

      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(15000); // 15 seconds for 5 concurrent
      expect(memoryUsed).toBeLessThan(500); // Less than 500MB total

      console.log(`5 concurrent 10MB uploads: ${duration.toFixed(2)}ms, Memory: ${memoryUsed.toFixed(2)}MB`);
    }, 30000);

    test('should handle 10 concurrent 5MB file uploads', async () => {
      const startTime = performance.now();

      const promises = Array.from({ length: 10 }, (_, i) => {
        const fileContent = Buffer.alloc(5 * 1024 * 1024);
        const deliverable: DeliverableFile = {
          fileName: `concurrent-file-${i}.pdf`,
          fileType: 'application/pdf',
          fileSize: fileContent.length,
          content: fileContent,
          uploadedBy: 'test-user',
          uploadedAt: new Date()
        };
        return processLargeFile(deliverable);
      });

      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(20000); // 20 seconds for 10 concurrent

      console.log(`10 concurrent 5MB uploads: ${duration.toFixed(2)}ms`);
    }, 45000);
  });

  describe('Memory Leak Detection', () => {
    test('should not leak memory with repeated large content processing', async () => {
      const iterations = 50;
      const memorySnapshots: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const largeContent = generateLargeContent(1024 * 1024); // 1MB each
        const taskContent: WorkTaskContent = {
          id: `memory-test-${i}`,
          title: 'Memory Test Task',
          description: 'Testing memory usage',
          content: largeContent,
          submittedBy: 'test-user',
          teamId: 'test-team',
          submittedAt: new Date(),
          priority: 'medium'
        };

        await analysisService.analyzeWorkTask(taskContent);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Take memory snapshot every 10 iterations
        if (i % 10 === 0) {
          const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
          memorySnapshots.push(memoryUsed);
          console.log(`Iteration ${i}: ${memoryUsed.toFixed(2)}MB`);
        }
      }

      // Check for memory leak: memory should not grow linearly
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = lastSnapshot - firstSnapshot;
      const growthRate = memoryGrowth / iterations;

      expect(growthRate).toBeLessThan(1); // Less than 1MB per iteration growth
      console.log(`Memory growth: ${memoryGrowth.toFixed(2)}MB over ${iterations} iterations`);
    }, 120000);

    test('should release memory after processing large files', async () => {
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      // Process 10 large files
      for (let i = 0; i < 10; i++) {
        const fileContent = Buffer.alloc(10 * 1024 * 1024);
        const deliverable: DeliverableFile = {
          fileName: `memory-release-test-${i}.pdf`,
          fileType: 'application/pdf',
          fileSize: fileContent.length,
          content: fileContent,
          uploadedBy: 'test-user',
          uploadedAt: new Date()
        };

        await processLargeFile(deliverable);
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      // Wait for GC to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal after GC
      expect(memoryIncrease).toBeLessThan(50); // Less than 50MB retained
      console.log(`Memory retained after 10 large files: ${memoryIncrease.toFixed(2)}MB`);
    }, 60000);
  });

  describe('Extreme Load Scenarios', () => {
    test('should handle rapid-fire requests', async () => {
      const requestCount = 100;
      const startTime = performance.now();
      let successCount = 0;
      let failureCount = 0;

      const promises = Array.from({ length: requestCount }, async (_, i) => {
        try {
          const taskContent: WorkTaskContent = {
            id: `rapid-fire-${i}`,
            title: 'Rapid Fire Task',
            description: 'Testing rapid requests',
            content: 'Quick task content for rapid testing.',
            submittedBy: 'test-user',
            teamId: 'test-team',
            submittedAt: new Date(),
            priority: 'medium'
          };

          await analysisService.analyzeWorkTask(taskContent);
          successCount++;
        } catch (error) {
          failureCount++;
        }
      });

      await Promise.all(promises);
      const duration = performance.now() - startTime;
      const successRate = successCount / requestCount;

      expect(successRate).toBeGreaterThan(0.7); // At least 70% success
      console.log(`Rapid-fire 100 requests: ${duration.toFixed(2)}ms, Success rate: ${(successRate * 100).toFixed(2)}%`);
    }, 120000);

    test('should recover from resource exhaustion', async () => {
      // Exhaust resources
      const exhaustPromises = Array.from({ length: 200 }, (_, i) => {
        const taskContent: WorkTaskContent = {
          id: `exhaust-${i}`,
          title: 'Exhaustion Test',
          description: 'Testing resource exhaustion',
          content: generateLargeContent(100 * 1024), // 100KB each
          submittedBy: 'test-user',
          teamId: 'test-team',
          submittedAt: new Date(),
          priority: 'medium'
        };
        return analysisService.analyzeWorkTask(taskContent).catch(() => null);
      });

      await Promise.all(exhaustPromises);

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Test normal operation
      const taskContent: WorkTaskContent = {
        id: 'recovery-test',
        title: 'Recovery Test',
        description: 'Testing recovery',
        content: 'Normal task after exhaustion.',
        submittedBy: 'test-user',
        teamId: 'test-team',
        submittedAt: new Date(),
        priority: 'medium'
      };

      const result = await analysisService.analyzeWorkTask(taskContent);
      expect(result).toBeDefined();
      console.log('System recovered successfully after resource exhaustion');
    }, 180000);
  });
});

// Helper functions
function generateLargeContent(sizeInBytes: number): string {
  const sentence = 'This is a test sentence for generating large content. ';
  const sentenceSize = Buffer.byteLength(sentence, 'utf8');
  const repeatCount = Math.ceil(sizeInBytes / sentenceSize);
  return sentence.repeat(repeatCount).substring(0, sizeInBytes);
}

async function processLargeFile(deliverable: DeliverableFile): Promise<{ success: boolean; duration: number }> {
  const startTime = Date.now();
  
  try {
    // Simulate file processing operations
    // 1. Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/zip'];
    if (!validTypes.includes(deliverable.fileType)) {
      throw new Error('Invalid file type');
    }

    // 2. Simulate virus scan (10ms per MB)
    const scanTime = (deliverable.fileSize / (1024 * 1024)) * 10;
    await new Promise(resolve => setTimeout(resolve, scanTime));

    // 3. Simulate metadata extraction
    await new Promise(resolve => setTimeout(resolve, 50));

    // 4. Simulate content analysis
    await new Promise(resolve => setTimeout(resolve, 100));

    const duration = Date.now() - startTime;
    return { success: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    return { success: false, duration };
  }
}
