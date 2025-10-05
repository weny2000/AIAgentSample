/**
 * Work Task Analysis System End-to-End Tests
 * Complete workflow testing from task submission to completion
 */

import { WorkTaskAnalysisService } from '../../services/work-task-analysis-service';
import { ArtifactValidationService } from '../../services/artifact-validation-service';
import { QualityAssessmentEngine } from '../../services/quality-assessment-engine';
import { TodoProgressTracker } from '../../services/todo-progress-tracker';
import { WorkgroupIdentificationService } from '../../services/workgroup-identification-service';
import { IntelligentTodoGenerationService } from '../../services/intelligent-todo-generation-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { Logger } from '../../lambda/utils/logger';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { WorkTaskContent } from '../../../../frontend/src/types/work-task';
import { TodoItem } from '../../models';
// Import types - these will be inferred from service method signatures
// The test uses the actual service implementations which have proper types

describe('Work Task Analysis System - End-to-End Workflows', () => {
  let workTaskService: WorkTaskAnalysisService;
  let artifactValidationService: ArtifactValidationService;
  let qualityAssessmentEngine: QualityAssessmentEngine;
  let todoProgressTracker: TodoProgressTracker;
  let workgroupService: WorkgroupIdentificationService;
  let todoGenerationService: IntelligentTodoGenerationService;
  let mockKendraService: jest.Mocked<KendraSearchService>;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;
  let logger: Logger;

  // Test data storage
  let taskStore: Map<string, any> = new Map();
  let todoStore: Map<string, TodoItem[]> = new Map();
  let deliverableStore: Map<string, any[]> = new Map();

  beforeAll(async () => {
    jest.setTimeout(180000); // 3 minutes for E2E tests

    logger = new Logger({ correlationId: 'work-task-e2e-test' });

    // Setup mocks
    mockKendraService = {
      search: jest.fn(),
      submitFeedback: jest.fn()
    } as any;

    mockRulesEngine = {
      validateContent: jest.fn(),
      validateArtifact: jest.fn(),
      getValidationRules: jest.fn()
    } as any;

    // Initialize services
    workgroupService = new WorkgroupIdentificationService(mockKendraService, logger);
    todoGenerationService = new IntelligentTodoGenerationService(logger);
    
    workTaskService = new WorkTaskAnalysisService(
      mockKendraService,
      workgroupService,
      todoGenerationService,
      logger
    );

    artifactValidationService = new ArtifactValidationService(
      mockRulesEngine,
      logger
    );

    qualityAssessmentEngine = new QualityAssessmentEngine(
      mockRulesEngine,
      logger
    );

    todoProgressTracker = new TodoProgressTracker(logger);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    taskStore.clear();
    todoStore.clear();
    deliverableStore.clear();

    // Setup default mocks
    mockRulesEngine.validateContent.mockResolvedValue({
      compliant: true,
      score: 1.0,
      violations: []
    });

    mockRulesEngine.validateArtifact.mockResolvedValue({
      compliant: true,
      score: 0.95,
      violations: []
    });
  });

  describe('Complete Task Submission to Completion Workflow', () => {
    it('should complete full workflow from task submission to all todos completed', async () => {
      // Step 1: Submit work task
      const taskContent: any = {
        title: 'Implement User Authentication System',
        description: 'Build a secure authentication system with OAuth2 and JWT',
        content: `
          We need to implement a comprehensive user authentication system for our application.
          
          Requirements:
          - OAuth2 integration with Google and GitHub
          - JWT token-based authentication
          - Multi-factor authentication support
          - Password reset functionality
          - Session management
          - Role-based access control
          
          The system should be secure, scalable, and follow industry best practices.
          We need to integrate with our existing user database and ensure backward compatibility.
        `,
        priority: 'high',
        category: 'security',
        tags: ['authentication', 'security', 'oauth2', 'jwt'],
        submittedBy: 'product-manager',
        teamId: 'engineering-team'
      };

      // Mock knowledge base search results
      mockKendraService.search.mockImplementation(async ({ query }) => {
        if (query.includes('authentication') || query.includes('OAuth')) {
          return {
            results: [
              {
                id: 'auth-guide',
                title: 'Authentication Best Practices',
                excerpt: 'OAuth2 and JWT implementation guidelines with security considerations',
                uri: '/docs/security/authentication.md',
                type: 'DOCUMENT',
                confidence: 0.95,
                sourceAttributes: { source_type: 'documentation' }
              },
              {
                id: 'security-policy',
                title: 'Security Policy',
                excerpt: 'All authentication systems must implement MFA and follow OWASP guidelines',
                uri: '/policies/security-policy.pdf',
                type: 'DOCUMENT',
                confidence: 0.9,
                sourceAttributes: { source_type: 'policy' }
              }
            ],
            totalCount: 2,
            queryId: 'auth-query'
          };
        }
        return { results: [], totalCount: 0, queryId: 'empty-query' };
      });

      // Analyze the task
      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);

      expect(analysisResult.taskId).toBeDefined();
      expect(analysisResult.keyPoints).toHaveLength(6);
      expect(analysisResult.relatedWorkgroups).toContain('security-team');
      expect(analysisResult.todoList.length).toBeGreaterThan(0);
      expect(analysisResult.knowledgeReferences.length).toBeGreaterThan(0);
      expect(analysisResult.riskAssessment).toBeDefined();

      // Store task
      taskStore.set(analysisResult.taskId, {
        ...taskContent,
        analysisResult,
        status: 'analyzed'
      });
      todoStore.set(analysisResult.taskId, analysisResult.todoList);

      // Step 2: Start working on todos
      const todos = analysisResult.todoList;
      expect(todos.length).toBeGreaterThan(3);

      // Step 3: Complete first todo - Setup project structure
      const firstTodo = todos[0];
      await todoProgressTracker.updateTodoStatus(
        firstTodo.todo_id,
        'in_progress',
        {
          updatedBy: 'senior-developer',
          notes: 'Starting project setup'
        }
      );

      // Simulate work completion
      await (global as any).e2eUtils.testUtils.simulateProcessingTime(2000);

      await todoProgressTracker.updateTodoStatus(
        firstTodo.todo_id,
        'completed',
        {
          updatedBy: 'senior-developer',
          notes: 'Project structure created'
        }
      );

      // Step 4: Submit deliverable for first todo
      const deliverable: any = {
        deliverable_id: `del-${Date.now()}`,
        todo_id: firstTodo.todo_id,
        file_name: 'project-structure.zip',
        file_type: 'application/zip',
        file_size: 1024 * 500, // 500KB
        s3_key: `deliverables/${firstTodo.todo_id}/project-structure.zip`,
        submitted_by: 'senior-developer',
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      // Step 5: Validate deliverable
      const validationResult = await artifactValidationService.validateDeliverable(
        firstTodo.todo_id,
        deliverable
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.completenessScore).toBeGreaterThan(0.8);

      // Step 6: Perform quality assessment
      const qualityResult = await qualityAssessmentEngine.performQualityCheck(
        deliverable,
        [
          {
            id: 'structure-check',
            name: 'Project Structure Check',
            description: 'Verify project follows standard structure',
            category: 'structure',
            severity: 'high',
            enabled: true
          }
        ]
      );

      expect(qualityResult.overallScore).toBeGreaterThan(0.7);
      expect(qualityResult.passed).toBe(true);

      // Store deliverable
      if (!deliverableStore.has(firstTodo.todo_id)) {
        deliverableStore.set(firstTodo.todo_id, []);
      }
      deliverableStore.get(firstTodo.todo_id)!.push({
        ...deliverable,
        validationResult,
        qualityResult
      });

      // Step 7: Complete remaining todos
      for (let i = 1; i < Math.min(todos.length, 3); i++) {
        const todo = todos[i];
        
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'in_progress',
          { updatedBy: 'senior-developer' }
        );

        await (global as any).e2eUtils.testUtils.simulateProcessingTime(1000);

        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'completed',
          { updatedBy: 'senior-developer' }
        );
      }

      // Step 8: Track overall progress
      const progressSummary = await todoProgressTracker.trackProgress(analysisResult.taskId);

      expect(progressSummary.totalTodos).toBe(todos.length);
      expect(progressSummary.completedTodos).toBeGreaterThan(0);
      expect(progressSummary.progressPercentage).toBeGreaterThan(0);

      // Step 9: Generate progress report
      const progressReport = await todoProgressTracker.generateProgressReport(
        analysisResult.taskId,
        {
          startDate: new Date(Date.now() - 86400000).toISOString(), // 24 hours ago
          endDate: new Date().toISOString()
        }
      );

      expect(progressReport.taskId).toBe(analysisResult.taskId);
      expect(progressReport.summary).toBeDefined();
      expect(progressReport.completedTodos.length).toBeGreaterThan(0);

      // Verify complete workflow
      expect(taskStore.has(analysisResult.taskId)).toBe(true);
      expect(todoStore.has(analysisResult.taskId)).toBe(true);
      expect(deliverableStore.size).toBeGreaterThan(0);
    });
  });

  describe('Deliverable Checking Process Workflow', () => {

    it('should complete automated deliverable checking workflow', async () => {
      // Setup task with specific deliverable requirements
      const taskContent: WorkTaskContent = {
        title: 'API Documentation Update',
        description: 'Update API documentation with new endpoints',
        content: 'Update the API documentation to include all new REST endpoints added in v2.0',
        priority: 'medium',
        category: 'documentation',
        tags: ['api', 'documentation'],
        submittedBy: 'tech-writer',
        teamId: 'documentation-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'doc-standards',
            title: 'Documentation Standards',
            excerpt: 'API documentation must include examples, error codes, and authentication details',
            uri: '/docs/standards/documentation.md',
            type: 'DOCUMENT',
            confidence: 0.9,
            sourceAttributes: { source_type: 'standards' }
          }
        ],
        totalCount: 1,
        queryId: 'doc-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const todos = analysisResult.todoList;
      const documentationTodo = todos[0];

      // Submit multiple deliverables with different quality levels
      const deliverables = [
        {
          deliverable_id: 'del-1',
          todo_id: documentationTodo.todo_id,
          file_name: 'api-docs-draft.md',
          file_type: 'text/markdown',
          file_size: 1024 * 50,
          s3_key: 'deliverables/api-docs-draft.md',
          submitted_by: 'tech-writer',
          submitted_at: new Date().toISOString(),
          status: 'submitted' as const
        },
        {
          deliverable_id: 'del-2',
          todo_id: documentationTodo.todo_id,
          file_name: 'api-examples.json',
          file_type: 'application/json',
          file_size: 1024 * 20,
          s3_key: 'deliverables/api-examples.json',
          submitted_by: 'tech-writer',
          submitted_at: new Date().toISOString(),
          status: 'submitted' as const
        }
      ];

      // Validate each deliverable
      const validationResults = [];
      for (const deliverable of deliverables) {
        const validation = await artifactValidationService.validateDeliverable(
          documentationTodo.todo_id,
          deliverable
        );
        validationResults.push(validation);

        // Perform quality check
        const qualityCheck = await qualityAssessmentEngine.performQualityCheck(
          deliverable,
          [
            {
              id: 'doc-completeness',
              name: 'Documentation Completeness',
              description: 'Check if documentation includes all required sections',
              category: 'completeness',
              severity: 'high',
              enabled: true
            },
            {
              id: 'doc-format',
              name: 'Documentation Format',
              description: 'Verify documentation follows standard format',
              category: 'format',
              severity: 'medium',
              enabled: true
            }
          ]
        );

        expect(qualityCheck.overallScore).toBeDefined();
        expect(qualityCheck.checkResults.length).toBeGreaterThan(0);
      }

      // Verify all deliverables were validated
      expect(validationResults).toHaveLength(2);
      validationResults.forEach(result => {
        expect(result.isValid).toBeDefined();
        expect(result.completenessScore).toBeGreaterThan(0);
      });

      // Generate improvement suggestions for low-quality deliverables
      const improvementSuggestions = await artifactValidationService.generateImprovementSuggestions(
        validationResults[0]
      );

      expect(improvementSuggestions).toBeDefined();
      expect(Array.isArray(improvementSuggestions)).toBe(true);
    });

    it('should handle deliverable rejection and resubmission workflow', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Security Audit Report',
        description: 'Complete security audit and submit report',
        content: 'Conduct comprehensive security audit and provide detailed report',
        priority: 'critical',
        category: 'security',
        tags: ['security', 'audit'],
        submittedBy: 'security-lead',
        teamId: 'security-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [],
        totalCount: 0,
        queryId: 'empty-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const auditTodo = analysisResult.todoList[0];

      // Submit initial deliverable with issues
      const initialDeliverable: DeliverableFile = {
        deliverable_id: 'del-initial',
        todo_id: auditTodo.todo_id,
        file_name: 'security-audit-incomplete.pdf',
        file_type: 'application/pdf',
        file_size: 1024 * 100,
        s3_key: 'deliverables/security-audit-incomplete.pdf',
        submitted_by: 'security-analyst',
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      // Mock validation to fail
      mockRulesEngine.validateArtifact.mockResolvedValueOnce({
        compliant: false,
        score: 0.4,
        violations: [
          {
            ruleId: 'audit-completeness',
            severity: 'high',
            message: 'Missing critical sections: vulnerability assessment, remediation plan'
          }
        ]
      });

      const initialValidation = await artifactValidationService.validateDeliverable(
        auditTodo.todo_id,
        initialDeliverable
      );

      expect(initialValidation.isValid).toBe(false);
      expect(initialValidation.issues.length).toBeGreaterThan(0);

      // Get improvement suggestions
      const suggestions = await artifactValidationService.generateImprovementSuggestions(
        initialValidation
      );

      expect(suggestions.length).toBeGreaterThan(0);

      // Update todo status to needs_revision
      await todoProgressTracker.updateTodoStatus(
        auditTodo.todo_id,
        'blocked',
        {
          updatedBy: 'security-analyst',
          notes: 'Deliverable rejected, needs revision'
        }
      );

      // Resubmit improved deliverable
      mockRulesEngine.validateArtifact.mockResolvedValueOnce({
        compliant: true,
        score: 0.95,
        violations: []
      });

      const revisedDeliverable: DeliverableFile = {
        deliverable_id: 'del-revised',
        todo_id: auditTodo.todo_id,
        file_name: 'security-audit-complete.pdf',
        file_type: 'application/pdf',
        file_size: 1024 * 250,
        s3_key: 'deliverables/security-audit-complete.pdf',
        submitted_by: 'security-analyst',
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      const revisedValidation = await artifactValidationService.validateDeliverable(
        auditTodo.todo_id,
        revisedDeliverable
      );

      expect(revisedValidation.isValid).toBe(true);
      expect(revisedValidation.completenessScore).toBeGreaterThan(0.9);

      // Update todo status to completed
      await todoProgressTracker.updateTodoStatus(
        auditTodo.todo_id,
        'completed',
        {
          updatedBy: 'security-analyst',
          notes: 'Revised deliverable approved'
        }
      );
    });
  });

  describe('Quality Assessment Functionality Workflow', () => {
    it('should perform comprehensive quality assessment on code deliverables', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Implement Payment Processing Module',
        description: 'Build secure payment processing with Stripe integration',
        content: 'Implement payment processing module with Stripe API integration',
        priority: 'high',
        category: 'development',
        tags: ['payment', 'stripe', 'backend'],
        submittedBy: 'backend-lead',
        teamId: 'backend-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'payment-guide',
            title: 'Payment Processing Guidelines',
            excerpt: 'Secure payment processing implementation with PCI compliance',
            uri: '/docs/payment-processing.md',
            type: 'DOCUMENT',
            confidence: 0.9,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'payment-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const codeTodo = analysisResult.todoList.find(t => t.category === 'development');

      expect(codeTodo).toBeDefined();

      // Submit code deliverable
      const codeDeliverable: DeliverableFile = {
        deliverable_id: 'del-code',
        todo_id: codeTodo!.todo_id,
        file_name: 'payment-processor.ts',
        file_type: 'text/typescript',
        file_size: 1024 * 15,
        s3_key: 'deliverables/payment-processor.ts',
        submitted_by: 'backend-developer',
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      // Define comprehensive quality standards
      const qualityStandards = [
        {
          id: 'code-security',
          name: 'Security Standards',
          description: 'Code must follow security best practices',
          category: 'security',
          severity: 'critical',
          enabled: true
        },
        {
          id: 'code-style',
          name: 'Code Style',
          description: 'Code must follow team style guidelines',
          category: 'style',
          severity: 'medium',
          enabled: true
        },
        {
          id: 'code-testing',
          name: 'Test Coverage',
          description: 'Code must have adequate test coverage',
          category: 'testing',
          severity: 'high',
          enabled: true
        },
        {
          id: 'code-documentation',
          name: 'Documentation',
          description: 'Code must be properly documented',
          category: 'documentation',
          severity: 'medium',
          enabled: true
        }
      ];

      // Perform quality assessment
      const qualityResult = await qualityAssessmentEngine.performQualityCheck(
        codeDeliverable,
        qualityStandards
      );

      expect(qualityResult.overallScore).toBeDefined();
      expect(qualityResult.overallScore).toBeGreaterThan(0);
      expect(qualityResult.overallScore).toBeLessThanOrEqual(1);
      expect(qualityResult.checkResults.length).toBe(qualityStandards.length);
      expect(qualityResult.passed).toBeDefined();

      // Verify each quality check was performed
      qualityResult.checkResults.forEach(result => {
        expect(result.checkId).toBeDefined();
        expect(result.passed).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });

      // Generate improvement suggestions if quality is below threshold
      if (qualityResult.overallScore < 0.8) {
        expect(qualityResult.improvementSuggestions.length).toBeGreaterThan(0);
      }
    });

    it('should assess quality of different file types appropriately', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Complete Project Documentation',
        description: 'Create comprehensive project documentation',
        content: 'Documentation for architecture, API, and deployment',
        priority: 'medium',
        category: 'documentation',
        tags: ['documentation'],
        submittedBy: 'tech-lead',
        teamId: 'engineering-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [],
        totalCount: 0,
        queryId: 'empty-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const docTodo = analysisResult.todoList[0];

      // Test different file types
      const deliverables = [
        {
          deliverable_id: 'del-md',
          file_name: 'architecture.md',
          file_type: 'text/markdown',
          expectedStandards: ['doc-completeness', 'doc-format', 'doc-clarity']
        },
        {
          deliverable_id: 'del-pdf',
          file_name: 'api-spec.pdf',
          file_type: 'application/pdf',
          expectedStandards: ['doc-completeness', 'doc-format']
        },
        {
          deliverable_id: 'del-json',
          file_name: 'openapi-spec.json',
          file_type: 'application/json',
          expectedStandards: ['schema-validation', 'format-compliance']
        }
      ];

      for (const deliv of deliverables) {
        const deliverable: DeliverableFile = {
          deliverable_id: deliv.deliverable_id,
          todo_id: docTodo.todo_id,
          file_name: deliv.file_name,
          file_type: deliv.file_type,
          file_size: 1024 * 50,
          s3_key: `deliverables/${deliv.file_name}`,
          submitted_by: 'tech-writer',
          submitted_at: new Date().toISOString(),
          status: 'submitted'
        };

        const standards = deliv.expectedStandards.map(id => ({
          id,
          name: id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: `Quality standard for ${id}`,
          category: id.split('-')[0],
          severity: 'medium' as const,
          enabled: true
        }));

        const qualityResult = await qualityAssessmentEngine.performQualityCheck(
          deliverable,
          standards
        );

        expect(qualityResult.overallScore).toBeDefined();
        expect(qualityResult.checkResults.length).toBe(standards.length);
      }
    });
  });

  describe('Multi-User Collaboration Scenarios', () => {

    it('should handle concurrent work by multiple team members', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Build E-commerce Platform',
        description: 'Complete e-commerce platform with multiple components',
        content: `
          Build a complete e-commerce platform with:
          - Frontend shopping interface
          - Backend API services
          - Payment processing
          - Inventory management
          - Order tracking system
          - Admin dashboard
        `,
        priority: 'critical',
        category: 'development',
        tags: ['ecommerce', 'fullstack'],
        submittedBy: 'project-manager',
        teamId: 'fullstack-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'ecommerce-guide',
            title: 'E-commerce Development Guide',
            excerpt: 'Best practices for building scalable e-commerce platforms',
            uri: '/docs/ecommerce-guide.md',
            type: 'DOCUMENT',
            confidence: 0.85,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'ecommerce-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const todos = analysisResult.todoList;

      expect(todos.length).toBeGreaterThan(3);

      // Simulate multiple developers working on different todos concurrently
      const developers = [
        { id: 'frontend-dev', name: 'Frontend Developer' },
        { id: 'backend-dev', name: 'Backend Developer' },
        { id: 'devops-engineer', name: 'DevOps Engineer' }
      ];

      // Assign todos to different developers
      const assignments = todos.slice(0, 3).map((todo, index) => ({
        todo,
        developer: developers[index]
      }));

      // Concurrent work simulation
      const workPromises = assignments.map(async ({ todo, developer }) => {
        // Start work
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'in_progress',
          {
            updatedBy: developer.id,
            notes: `${developer.name} started working on this task`
          }
        );

        // Simulate work time
        await (global as any).e2eUtils.testUtils.simulateProcessingTime(
          Math.random() * 2000 + 1000
        );

        // Submit deliverable
        const deliverable: DeliverableFile = {
          deliverable_id: `del-${developer.id}-${Date.now()}`,
          todo_id: todo.todo_id,
          file_name: `${developer.id}-work.zip`,
          file_type: 'application/zip',
          file_size: 1024 * 200,
          s3_key: `deliverables/${developer.id}-work.zip`,
          submitted_by: developer.id,
          submitted_at: new Date().toISOString(),
          status: 'submitted'
        };

        // Validate deliverable
        const validation = await artifactValidationService.validateDeliverable(
          todo.todo_id,
          deliverable
        );

        // Complete todo
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'completed',
          {
            updatedBy: developer.id,
            notes: `${developer.name} completed the task`
          }
        );

        return { developer, todo, validation };
      });

      // Wait for all concurrent work to complete
      const results = await Promise.all(workPromises);

      // Verify all work was completed successfully
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.validation.isValid).toBe(true);
      });

      // Check overall progress
      const progressSummary = await todoProgressTracker.trackProgress(analysisResult.taskId);
      expect(progressSummary.completedTodos).toBe(3);
      expect(progressSummary.inProgressTodos).toBe(0);
    });

    it('should handle cross-team collaboration with dependencies', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Implement Microservices Architecture',
        description: 'Migrate monolith to microservices with multiple team involvement',
        content: `
          Migrate existing monolithic application to microservices architecture.
          Requires coordination between:
          - Backend team (API services)
          - Frontend team (UI updates)
          - DevOps team (infrastructure)
          - Security team (authentication/authorization)
          - QA team (testing strategy)
        `,
        priority: 'critical',
        category: 'architecture',
        tags: ['microservices', 'migration', 'cross-team'],
        submittedBy: 'cto',
        teamId: 'engineering'
      };

      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'microservices-guide',
            title: 'Microservices Migration Guide',
            excerpt: 'Step-by-step guide for migrating to microservices architecture',
            uri: '/docs/microservices-migration.md',
            type: 'DOCUMENT',
            confidence: 0.9,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'microservices-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const todos = analysisResult.todoList;

      // Identify todos with dependencies
      const todosWithDeps = todos.filter(t => t.dependencies && t.dependencies.length > 0);
      expect(todosWithDeps.length).toBeGreaterThan(0);

      // Simulate sequential execution respecting dependencies
      const completedTodos = new Set<string>();

      for (const todo of todos.slice(0, 4)) {
        // Check if dependencies are met
        const depsNotMet = todo.dependencies?.filter(dep => !completedTodos.has(dep)) || [];
        
        if (depsNotMet.length > 0) {
          // Mark as blocked
          await todoProgressTracker.updateTodoStatus(
            todo.todo_id,
            'blocked',
            {
              updatedBy: 'system',
              notes: `Blocked by dependencies: ${depsNotMet.join(', ')}`
            }
          );
          continue;
        }

        // Start work
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'in_progress',
          {
            updatedBy: `team-${todo.category}`,
            notes: 'Dependencies met, starting work'
          }
        );

        await (global as any).e2eUtils.testUtils.simulateProcessingTime(1000);

        // Complete work
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'completed',
          {
            updatedBy: `team-${todo.category}`,
            notes: 'Work completed'
          }
        );

        completedTodos.add(todo.todo_id);
      }

      // Verify dependency handling
      expect(completedTodos.size).toBeGreaterThan(0);

      // Check for blocked todos
      const progressSummary = await todoProgressTracker.trackProgress(analysisResult.taskId);
      expect(progressSummary.blockedTodos).toBeDefined();
    });

    it('should track progress across multiple team members and generate reports', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Q4 Product Launch',
        description: 'Complete all tasks for Q4 product launch',
        content: 'Coordinate product launch across all teams',
        priority: 'critical',
        category: 'product',
        tags: ['launch', 'product'],
        submittedBy: 'product-director',
        teamId: 'product-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [],
        totalCount: 0,
        queryId: 'empty-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const todos = analysisResult.todoList;

      // Simulate work by multiple team members over time
      const teamMembers = [
        'product-manager',
        'ux-designer',
        'frontend-dev',
        'backend-dev',
        'qa-engineer',
        'marketing-lead'
      ];

      // Track progress at different stages
      const progressSnapshots = [];

      for (let i = 0; i < Math.min(todos.length, 6); i++) {
        const todo = todos[i];
        const assignee = teamMembers[i % teamMembers.length];

        // Start work
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'in_progress',
          {
            updatedBy: assignee,
            notes: `${assignee} working on ${todo.title}`
          }
        );

        // Take progress snapshot
        const snapshot = await todoProgressTracker.trackProgress(analysisResult.taskId);
        progressSnapshots.push({
          timestamp: new Date().toISOString(),
          ...snapshot
        });

        await (global as any).e2eUtils.testUtils.simulateProcessingTime(500);

        // Complete work
        await todoProgressTracker.updateTodoStatus(
          todo.todo_id,
          'completed',
          {
            updatedBy: assignee,
            notes: `${assignee} completed ${todo.title}`
          }
        );

        // Take another snapshot
        const completedSnapshot = await todoProgressTracker.trackProgress(analysisResult.taskId);
        progressSnapshots.push({
          timestamp: new Date().toISOString(),
          ...completedSnapshot
        });
      }

      // Generate comprehensive progress report
      const finalReport = await todoProgressTracker.generateProgressReport(
        analysisResult.taskId,
        {
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date().toISOString()
        }
      );

      expect(finalReport.taskId).toBe(analysisResult.taskId);
      expect(finalReport.summary.totalTodos).toBe(todos.length);
      expect(finalReport.completedTodos.length).toBeGreaterThan(0);
      expect(progressSnapshots.length).toBeGreaterThan(0);

      // Verify progress trend
      const progressPercentages = progressSnapshots.map(s => s.progressPercentage);
      for (let i = 1; i < progressPercentages.length; i++) {
        expect(progressPercentages[i]).toBeGreaterThanOrEqual(progressPercentages[i - 1]);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid deliverable submissions gracefully', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Test Task',
        description: 'Task for testing error handling',
        content: 'Simple test task',
        priority: 'low',
        category: 'testing',
        tags: ['test'],
        submittedBy: 'tester',
        teamId: 'qa-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [],
        totalCount: 0,
        queryId: 'empty-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const todo = analysisResult.todoList[0];

      // Test invalid file type
      const invalidDeliverable: DeliverableFile = {
        deliverable_id: 'del-invalid',
        todo_id: todo.todo_id,
        file_name: 'malicious.exe',
        file_type: 'application/x-msdownload',
        file_size: 1024 * 1024 * 100, // 100MB
        s3_key: 'deliverables/malicious.exe',
        submitted_by: 'tester',
        submitted_at: new Date().toISOString(),
        status: 'submitted'
      };

      // Mock validation to reject
      mockRulesEngine.validateArtifact.mockResolvedValueOnce({
        compliant: false,
        score: 0,
        violations: [
          {
            ruleId: 'file-type-restriction',
            severity: 'critical',
            message: 'Executable files are not allowed'
          },
          {
            ruleId: 'file-size-limit',
            severity: 'high',
            message: 'File size exceeds maximum allowed size'
          }
        ]
      });

      const validation = await artifactValidationService.validateDeliverable(
        todo.todo_id,
        invalidDeliverable
      );

      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues.some(i => i.severity === 'critical')).toBe(true);
    });

    it('should handle service failures during workflow', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Resilience Test Task',
        description: 'Test service failure handling',
        content: 'Task to test resilience',
        priority: 'medium',
        category: 'testing',
        tags: ['resilience'],
        submittedBy: 'tester',
        teamId: 'qa-team'
      };

      // Simulate Kendra service failure
      mockKendraService.search.mockRejectedValueOnce(
        new Error('Kendra service temporarily unavailable')
      );

      // Should still complete analysis with degraded functionality
      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);

      expect(analysisResult.taskId).toBeDefined();
      expect(analysisResult.keyPoints).toBeDefined();
      expect(analysisResult.todoList).toBeDefined();
      // Knowledge references may be empty due to service failure
      expect(analysisResult.knowledgeReferences).toBeDefined();
    });

    it('should identify and report blocking issues', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Complex Integration Task',
        description: 'Task with potential blocking issues',
        content: 'Complex integration requiring multiple dependencies',
        priority: 'high',
        category: 'integration',
        tags: ['complex', 'integration'],
        submittedBy: 'integration-lead',
        teamId: 'integration-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [],
        totalCount: 0,
        queryId: 'empty-query'
      });

      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const todos = analysisResult.todoList;

      // Mark some todos as blocked
      for (let i = 0; i < Math.min(todos.length, 2); i++) {
        await todoProgressTracker.updateTodoStatus(
          todos[i].todo_id,
          'blocked',
          {
            updatedBy: 'developer',
            notes: 'Blocked by external dependency'
          }
        );
      }

      // Identify blockers
      const blockerAnalysis = await todoProgressTracker.identifyBlockers(analysisResult.taskId);

      expect(blockerAnalysis).toBeDefined();
      expect(Array.isArray(blockerAnalysis)).toBe(true);
      expect(blockerAnalysis.length).toBeGreaterThan(0);

      blockerAnalysis.forEach(blocker => {
        expect(blocker.todoId).toBeDefined();
        expect(blocker.reason).toBeDefined();
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large task with many todos efficiently', async () => {
      const taskContent: WorkTaskContent = {
        title: 'Enterprise System Migration',
        description: 'Large-scale enterprise system migration',
        content: `
          Migrate entire enterprise system including:
          - 50+ microservices
          - 20+ databases
          - Multiple frontend applications
          - Legacy system integrations
          - Data migration
          - User training
          - Documentation updates
        `,
        priority: 'critical',
        category: 'migration',
        tags: ['enterprise', 'migration', 'large-scale'],
        submittedBy: 'enterprise-architect',
        teamId: 'architecture-team'
      };

      mockKendraService.search.mockResolvedValue({
        results: [
          {
            id: 'migration-guide',
            title: 'Enterprise Migration Guide',
            excerpt: 'Comprehensive guide for large-scale migrations',
            uri: '/docs/enterprise-migration.md',
            type: 'DOCUMENT',
            confidence: 0.9,
            sourceAttributes: { source_type: 'documentation' }
          }
        ],
        totalCount: 1,
        queryId: 'migration-query'
      });

      const startTime = Date.now();
      const analysisResult = await workTaskService.analyzeWorkTask(taskContent);
      const analysisTime = Date.now() - startTime;

      // Verify analysis completed in reasonable time
      expect(analysisTime).toBeLessThan(30000); // 30 seconds
      expect(analysisResult.todoList.length).toBeGreaterThan(5);

      // Test progress tracking performance with many todos
      const progressStart = Date.now();
      const progressSummary = await todoProgressTracker.trackProgress(analysisResult.taskId);
      const progressTime = Date.now() - progressStart;

      expect(progressTime).toBeLessThan(5000); // 5 seconds
      expect(progressSummary.totalTodos).toBe(analysisResult.todoList.length);
    });
  });

  afterAll(async () => {
    // Cleanup
    taskStore.clear();
    todoStore.clear();
    deliverableStore.clear();
  });
});
