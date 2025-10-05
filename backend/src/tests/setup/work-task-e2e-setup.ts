/**
 * Work Task Analysis System End-to-End Test Setup
 * Configuration and utilities for work task E2E tests
 */

import { jest } from '@jest/globals';

// Extended timeout for E2E tests
jest.setTimeout(180000); // 3 minutes

// Work Task E2E test configuration
const WORK_TASK_E2E_CONFIG = {
  DEFAULT_TIMEOUT: 30000,
  WORKFLOW_TIMEOUT: 120000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  REALISTIC_DELAYS: {
    USER_INPUT: 500,
    ANALYSIS_TIME: 2000,
    VALIDATION_TIME: 1000,
    QUALITY_CHECK_TIME: 1500,
    NETWORK_LATENCY: 100
  }
};

// Mock AWS services for E2E tests
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
      send: jest.fn().mockImplementation(async (command) => {
        // Simulate realistic database response times
        await new Promise(resolve => 
          setTimeout(resolve, WORK_TASK_E2E_CONFIG.REALISTIC_DELAYS.NETWORK_LATENCY)
        );
        return { Item: {}, Items: [] };
      })
    }))
  }
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-kendra', () => ({
  KendraClient: jest.fn(),
  QueryCommand: jest.fn(),
  SubmitFeedbackCommand: jest.fn()
}));

// Work Task E2E test utilities
class WorkTaskE2ETestUtils {
  // Workflow simulation utilities
  async simulateUserInput(delay: number = WORK_TASK_E2E_CONFIG.REALISTIC_DELAYS.USER_INPUT): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateAnalysisTime(delay: number = WORK_TASK_E2E_CONFIG.REALISTIC_DELAYS.ANALYSIS_TIME): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateValidationTime(delay: number = WORK_TASK_E2E_CONFIG.REALISTIC_DELAYS.VALIDATION_TIME): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async simulateQualityCheckTime(delay: number = WORK_TASK_E2E_CONFIG.REALISTIC_DELAYS.QUALITY_CHECK_TIME): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Retry mechanism for flaky operations
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = WORK_TASK_E2E_CONFIG.MAX_RETRIES,
    delay: number = WORK_TASK_E2E_CONFIG.RETRY_DELAY
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw new Error(
            `Operation failed after ${maxRetries} attempts. Last error: ${lastError.message}`
          );
        }
        
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    throw lastError!;
  }

  // Test data generators
  generateTaskContent(overrides?: Partial<any>): any {
    return {
      title: 'Test Work Task',
      description: 'Test task description',
      content: 'Detailed test task content',
      priority: 'medium',
      category: 'development',
      tags: ['test'],
      submittedBy: 'test-user',
      teamId: 'test-team',
      ...overrides
    };
  }

  generateTodoItem(overrides?: Partial<any>): any {
    return {
      todo_id: `todo-${Date.now()}`,
      task_id: 'test-task',
      title: 'Test Todo',
      description: 'Test todo description',
      priority: 'medium',
      estimated_hours: 4,
      category: 'development',
      status: 'pending',
      dependencies: [],
      related_workgroups: [],
      deliverables: [],
      quality_checks: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  generateDeliverable(overrides?: Partial<any>): any {
    return {
      deliverable_id: `del-${Date.now()}`,
      todo_id: 'test-todo',
      file_name: 'test-file.txt',
      file_type: 'text/plain',
      file_size: 1024,
      s3_key: 'test/test-file.txt',
      submitted_by: 'test-user',
      submitted_at: new Date().toISOString(),
      status: 'submitted',
      ...overrides
    };
  }

  generateQualityStandard(overrides?: Partial<any>): any {
    return {
      id: `standard-${Date.now()}`,
      name: 'Test Quality Standard',
      description: 'Test standard description',
      category: 'general',
      severity: 'medium',
      enabled: true,
      ...overrides
    };
  }

  // Validation utilities
  validateTaskAnalysisResult(result: any): void {
    if (!result.taskId) {
      throw new Error('Task analysis result missing taskId');
    }
    if (!Array.isArray(result.keyPoints)) {
      throw new Error('Task analysis result missing or invalid keyPoints');
    }
    if (!Array.isArray(result.todoList)) {
      throw new Error('Task analysis result missing or invalid todoList');
    }
    if (!Array.isArray(result.relatedWorkgroups)) {
      throw new Error('Task analysis result missing or invalid relatedWorkgroups');
    }
    if (!Array.isArray(result.knowledgeReferences)) {
      throw new Error('Task analysis result missing or invalid knowledgeReferences');
    }
  }

  validateDeliverableValidation(validation: any): void {
    if (typeof validation.isValid !== 'boolean') {
      throw new Error('Validation result missing or invalid isValid');
    }
    if (typeof validation.completenessScore !== 'number') {
      throw new Error('Validation result missing or invalid completenessScore');
    }
    if (!Array.isArray(validation.issues)) {
      throw new Error('Validation result missing or invalid issues');
    }
  }

  validateQualityAssessment(assessment: any): void {
    if (typeof assessment.overallScore !== 'number') {
      throw new Error('Quality assessment missing or invalid overallScore');
    }
    if (typeof assessment.passed !== 'boolean') {
      throw new Error('Quality assessment missing or invalid passed');
    }
    if (!Array.isArray(assessment.checkResults)) {
      throw new Error('Quality assessment missing or invalid checkResults');
    }
  }

  // Progress tracking utilities
  calculateProgressPercentage(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  // Workflow execution utilities
  async executeCompleteWorkflow(services: any, taskContent: any): Promise<any> {
    const results = {
      taskId: '',
      analysisResult: null as any,
      todos: [] as any[],
      deliverables: [] as any[],
      validations: [] as any[],
      qualityAssessments: [] as any[],
      progressSnapshots: [] as any[],
      success: true,
      errors: [] as any[]
    };

    try {
      // Step 1: Analyze task
      await this.simulateUserInput();
      results.analysisResult = await services.workTaskService.analyzeWorkTask(taskContent);
      results.taskId = results.analysisResult.taskId;
      results.todos = results.analysisResult.todoList;

      // Step 2: Process todos
      for (const todo of results.todos.slice(0, 3)) {
        try {
          // Start todo
          await services.todoProgressTracker.updateTodoStatus(
            todo.todo_id,
            'in_progress',
            { updatedBy: 'test-user' }
          );

          // Simulate work
          await this.simulateAnalysisTime(1000);

          // Submit deliverable
          const deliverable = this.generateDeliverable({
            todo_id: todo.todo_id
          });
          results.deliverables.push(deliverable);

          // Validate deliverable
          await this.simulateValidationTime();
          const validation = await services.artifactValidationService.validateDeliverable(
            todo.todo_id,
            deliverable
          );
          results.validations.push(validation);

          // Quality assessment
          await this.simulateQualityCheckTime();
          const qualityAssessment = await services.qualityAssessmentEngine.performQualityCheck(
            deliverable,
            [this.generateQualityStandard()]
          );
          results.qualityAssessments.push(qualityAssessment);

          // Complete todo
          await services.todoProgressTracker.updateTodoStatus(
            todo.todo_id,
            'completed',
            { updatedBy: 'test-user' }
          );

          // Track progress
          const progress = await services.todoProgressTracker.trackProgress(results.taskId);
          results.progressSnapshots.push(progress);

        } catch (error) {
          results.errors.push({
            todoId: todo.todo_id,
            error: (error as Error).message
          });
          results.success = false;
        }
      }

    } catch (error) {
      results.errors.push({
        step: 'workflow_execution',
        error: (error as Error).message
      });
      results.success = false;
    }

    return results;
  }

  // Performance monitoring
  async measureOperationTime<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    
    console.log(`[Performance] ${operationName} took ${duration}ms`);
    
    return { result, duration };
  }

  // Cleanup utilities
  async cleanupTestData(taskIds: string[]): Promise<void> {
    // In a real implementation, this would clean up DynamoDB and S3
    console.log(`Cleaning up test data for tasks: ${taskIds.join(', ')}`);
  }
}

// Global work task E2E utilities
(global as any).workTaskE2EUtils = {
  config: WORK_TASK_E2E_CONFIG,
  testUtils: new WorkTaskE2ETestUtils(),

  // Common assertions for work task E2E tests
  assertWorkflowSuccess: (results: any) => {
    if (!results.success) {
      throw new Error(`Workflow failed with errors: ${JSON.stringify(results.errors)}`);
    }
  },

  assertTaskAnalysisQuality: (analysisResult: any, minKeyPoints: number = 3) => {
    if (analysisResult.keyPoints.length < minKeyPoints) {
      throw new Error(
        `Analysis quality below threshold: expected at least ${minKeyPoints} key points, got ${analysisResult.keyPoints.length}`
      );
    }
  },

  assertDeliverableQuality: (qualityAssessment: any, minScore: number = 0.7) => {
    if (qualityAssessment.overallScore < minScore) {
      throw new Error(
        `Deliverable quality below threshold: expected at least ${minScore}, got ${qualityAssessment.overallScore}`
      );
    }
  },

  assertProgressTracking: (progressSnapshots: any[]) => {
    if (progressSnapshots.length === 0) {
      throw new Error('No progress snapshots recorded');
    }

    // Verify progress is monotonically increasing
    for (let i = 1; i < progressSnapshots.length; i++) {
      if (progressSnapshots[i].progressPercentage < progressSnapshots[i - 1].progressPercentage) {
        throw new Error('Progress tracking shows regression');
      }
    }
  },

  assertKnowledgeUtilization: (analysisResult: any) => {
    if (analysisResult.knowledgeReferences.length === 0) {
      console.warn('No knowledge base references utilized in analysis');
    }
  },

  assertWorkgroupIdentification: (analysisResult: any) => {
    if (analysisResult.relatedWorkgroups.length === 0) {
      console.warn('No related workgroups identified');
    }
  }
};

// Setup before all tests
beforeAll(() => {
  console.log('Setting up Work Task E2E test environment');
});

// Cleanup after each test
afterEach(async () => {
  jest.clearAllMocks();
});

// Cleanup after all tests
afterAll(() => {
  console.log('Cleaning up Work Task E2E test environment');
});

export {};
