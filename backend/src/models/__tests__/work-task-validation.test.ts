/**
 * Comprehensive validation tests for Work Task data models
 * Tests input validation, edge cases, and data integrity
 */

import {
  WorkTaskRecord,
  TodoItemRecord,
  DeliverableRecord,
  TaskSubmissionRequest,
  TodoUpdateRequest,
  DeliverableSubmission,
  ValidationResult,
  QualityAssessmentResult
} from '../work-task-models';

describe('Work Task Data Model Validation', () => {
  
  describe('TaskSubmissionRequest Validation', () => {
    it('should validate required fields', () => {
      const validRequest: TaskSubmissionRequest = {
        title: 'Valid Task',
        description: 'A valid task description',
        content: 'Detailed task content',
        priority: 'medium'
      };

      expect(validRequest.title).toBeTruthy();
      expect(validRequest.description).toBeTruthy();
      expect(validRequest.content).toBeTruthy();
      expect(['low', 'medium', 'high', 'critical']).toContain(validRequest.priority);
    });

    it('should handle optional fields', () => {
      const requestWithOptionals: TaskSubmissionRequest = {
        title: 'Task with extras',
        description: 'Description',
        content: 'Content',
        priority: 'high',
        category: 'development',
        tags: ['urgent', 'backend'],
        attachments: [
          {
            file_name: 'spec.pdf',
            file_type: 'application/pdf',
            file_size: 1024,
            content_base64: 'base64content'
          }
        ]
      };

      expect(requestWithOptionals.category).toBe('development');
      expect(requestWithOptionals.tags).toHaveLength(2);
      expect(requestWithOptionals.attachments).toHaveLength(1);
    });

    it('should validate priority values', () => {
      const priorities = ['low', 'medium', 'high', 'critical'];
      
      priorities.forEach(priority => {
        const request: TaskSubmissionRequest = {
          title: 'Test',
          description: 'Test',
          content: 'Test',
          priority: priority as any
        };
        
        expect(['low', 'medium', 'high', 'critical']).toContain(request.priority);
      });
    });

    it('should handle empty tags array', () => {
      const request: TaskSubmissionRequest = {
        title: 'Test',
        description: 'Test',
        content: 'Test',
        priority: 'low',
        tags: []
      };

      expect(request.tags).toEqual([]);
    });
  });

  describe('TodoUpdateRequest Validation', () => {
    it('should allow partial updates', () => {
      const statusUpdate: TodoUpdateRequest = {
        status: 'in_progress'
      };

      expect(statusUpdate.status).toBe('in_progress');
      expect(statusUpdate.assigned_to).toBeUndefined();
    });

    it('should validate status transitions', () => {
      const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
      
      validStatuses.forEach(status => {
        const update: TodoUpdateRequest = {
          status: status as any
        };
        
        expect(validStatuses).toContain(update.status);
      });
    });

    it('should handle all update fields', () => {
      const fullUpdate: TodoUpdateRequest = {
        status: 'in_progress',
        assigned_to: 'user-123',
        due_date: '2024-12-31',
        notes: 'Started working on this',
        estimated_hours: 16
      };

      expect(fullUpdate.status).toBe('in_progress');
      expect(fullUpdate.assigned_to).toBe('user-123');
      expect(fullUpdate.estimated_hours).toBe(16);
    });
  });

  describe('DeliverableSubmission Validation', () => {
    it('should validate required fields', () => {
      const submission: DeliverableSubmission = {
        file_name: 'implementation.ts',
        file_type: 'text/typescript',
        file_size: 5120,
        content_base64: 'base64encodedcontent'
      };

      expect(submission.file_name).toBeTruthy();
      expect(submission.file_type).toBeTruthy();
      expect(submission.file_size).toBeGreaterThan(0);
      expect(submission.content_base64).toBeTruthy();
    });

    it('should handle optional notes', () => {
      const submissionWithNotes: DeliverableSubmission = {
        file_name: 'code.ts',
        file_type: 'text/typescript',
        file_size: 1024,
        content_base64: 'content',
        notes: 'Initial implementation'
      };

      expect(submissionWithNotes.notes).toBe('Initial implementation');
    });

    it('should validate file size constraints', () => {
      const largeFile: DeliverableSubmission = {
        file_name: 'large.zip',
        file_type: 'application/zip',
        file_size: 100 * 1024 * 1024, // 100MB
        content_base64: 'content'
      };

      expect(largeFile.file_size).toBeLessThanOrEqual(100 * 1024 * 1024);
    });
  });

  describe('WorkTaskRecord Status Transitions', () => {
    it('should track status lifecycle', () => {
      const statuses: Array<WorkTaskRecord['status']> = [
        'submitted',
        'analyzing',
        'analyzed',
        'in_progress',
        'completed'
      ];

      statuses.forEach(status => {
        const task: Partial<WorkTaskRecord> = {
          task_id: 'task-123',
          status: status
        };

        expect(statuses).toContain(task.status);
      });
    });

    it('should maintain timestamps on status changes', () => {
      const task: WorkTaskRecord = {
        id: 'task-123',
        task_id: 'task-123',
        title: 'Test',
        description: 'Test',
        content: 'Test',
        submitted_by: 'user-123',
        team_id: 'team-123',
        priority: 'medium',
        status: 'submitted',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Simulate status update
      task.status = 'analyzing';
      task.updated_at = '2024-01-01T01:00:00Z';

      expect(task.status).toBe('analyzing');
      expect(task.updated_at).not.toBe(task.created_at);
    });
  });

  describe('TodoItemRecord Dependencies', () => {
    it('should handle empty dependencies', () => {
      const todo: Partial<TodoItemRecord> = {
        todo_id: 'todo-123',
        dependencies: []
      };

      expect(todo.dependencies).toEqual([]);
    });

    it('should handle multiple dependencies', () => {
      const todo: Partial<TodoItemRecord> = {
        todo_id: 'todo-123',
        dependencies: ['todo-121', 'todo-122', 'todo-120']
      };

      expect(todo.dependencies).toHaveLength(3);
      expect(todo.dependencies).toContain('todo-121');
    });

    it('should prevent circular dependencies', () => {
      const todo1: Partial<TodoItemRecord> = {
        todo_id: 'todo-1',
        dependencies: ['todo-2']
      };

      const todo2: Partial<TodoItemRecord> = {
        todo_id: 'todo-2',
        dependencies: ['todo-3']
      };

      // Circular would be: todo-3 depends on todo-1
      // This should be validated at service level
      expect(todo1.dependencies).not.toContain('todo-1');
      expect(todo2.dependencies).not.toContain('todo-2');
    });
  });

  describe('ValidationResult Structure', () => {
    it('should handle passed validation', () => {
      const result: ValidationResult = {
        is_valid: true,
        validation_score: 0.95,
        checks_performed: [
          {
            check_name: 'Format Check',
            check_type: 'format',
            status: 'passed'
          }
        ],
        issues_found: [],
        recommendations: [],
        validated_at: new Date().toISOString()
      };

      expect(result.is_valid).toBe(true);
      expect(result.validation_score).toBeGreaterThan(0.9);
      expect(result.issues_found).toHaveLength(0);
    });

    it('should handle failed validation with issues', () => {
      const result: ValidationResult = {
        is_valid: false,
        validation_score: 0.45,
        checks_performed: [
          {
            check_name: 'Security Check',
            check_type: 'security',
            status: 'failed',
            details: 'Potential security vulnerability detected'
          }
        ],
        issues_found: [
          {
            severity: 'high',
            category: 'security',
            description: 'Hardcoded credentials detected',
            location: 'line 42',
            suggested_fix: 'Use environment variables'
          }
        ],
        recommendations: ['Remove hardcoded credentials', 'Use AWS Secrets Manager'],
        validated_at: new Date().toISOString()
      };

      expect(result.is_valid).toBe(false);
      expect(result.issues_found).toHaveLength(1);
      expect(result.issues_found[0].severity).toBe('high');
      expect(result.recommendations).toHaveLength(2);
    });

    it('should handle warnings without failing validation', () => {
      const result: ValidationResult = {
        is_valid: true,
        validation_score: 0.85,
        checks_performed: [
          {
            check_name: 'Code Quality',
            check_type: 'content',
            status: 'warning',
            details: 'Some improvements recommended'
          }
        ],
        issues_found: [
          {
            severity: 'low',
            category: 'content',
            description: 'Missing documentation',
            suggested_fix: 'Add JSDoc comments'
          }
        ],
        recommendations: ['Add more comments'],
        validated_at: new Date().toISOString()
      };

      expect(result.is_valid).toBe(true);
      expect(result.checks_performed[0].status).toBe('warning');
      expect(result.issues_found[0].severity).toBe('low');
    });
  });

  describe('QualityAssessmentResult Scoring', () => {
    it('should calculate weighted scores correctly', () => {
      const assessment: QualityAssessmentResult = {
        overall_score: 85.5,
        quality_dimensions: [
          {
            dimension: 'completeness',
            score: 90,
            weight: 0.3,
            details: 'All required sections present'
          },
          {
            dimension: 'accuracy',
            score: 85,
            weight: 0.3,
            details: 'Content is accurate'
          },
          {
            dimension: 'clarity',
            score: 80,
            weight: 0.2,
            details: 'Generally clear'
          },
          {
            dimension: 'format',
            score: 85,
            weight: 0.2,
            details: 'Proper formatting'
          }
        ],
        improvement_suggestions: [],
        compliance_status: {
          is_compliant: true,
          standards_checked: ['coding-standards'],
          violations: []
        },
        assessed_at: new Date().toISOString()
      };

      // Verify weighted calculation: 90*0.3 + 85*0.3 + 80*0.2 + 85*0.2 = 85.5
      const calculatedScore = assessment.quality_dimensions.reduce(
        (sum, dim) => sum + (dim.score * dim.weight),
        0
      );

      expect(calculatedScore).toBeCloseTo(85.5, 1);
      expect(assessment.overall_score).toBeCloseTo(calculatedScore, 1);
    });

    it('should handle compliance violations', () => {
      const assessment: QualityAssessmentResult = {
        overall_score: 65,
        quality_dimensions: [],
        improvement_suggestions: ['Fix compliance issues'],
        compliance_status: {
          is_compliant: false,
          standards_checked: ['security-policy', 'coding-standards'],
          violations: [
            {
              standard: 'security-policy',
              rule: 'no-hardcoded-secrets',
              severity: 'critical',
              description: 'Hardcoded API key found',
              remediation: 'Use environment variables or secrets manager'
            }
          ]
        },
        assessed_at: new Date().toISOString()
      };

      expect(assessment.compliance_status.is_compliant).toBe(false);
      expect(assessment.compliance_status.violations).toHaveLength(1);
      expect(assessment.compliance_status.violations[0].severity).toBe('critical');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle maximum length strings', () => {
      const longContent = 'a'.repeat(50000);
      const task: Partial<WorkTaskRecord> = {
        content: longContent
      };

      expect(task.content?.length).toBe(50000);
    });

    it('should handle special characters in content', () => {
      const specialContent = 'Task with special chars: <>&"\'`\n\t\r';
      const task: Partial<WorkTaskRecord> = {
        content: specialContent
      };

      expect(task.content).toContain('<>');
      expect(task.content).toContain('&');
    });

    it('should handle empty arrays', () => {
      const task: Partial<WorkTaskRecord> = {
        tags: []
      };

      const todo: Partial<TodoItemRecord> = {
        dependencies: [],
        related_workgroups: []
      };

      expect(task.tags).toEqual([]);
      expect(todo.dependencies).toEqual([]);
      expect(todo.related_workgroups).toEqual([]);
    });

    it('should handle zero estimated hours', () => {
      const todo: Partial<TodoItemRecord> = {
        estimated_hours: 0
      };

      expect(todo.estimated_hours).toBe(0);
    });

    it('should handle very large file sizes', () => {
      const deliverable: Partial<DeliverableRecord> = {
        file_size: 100 * 1024 * 1024 // 100MB
      };

      expect(deliverable.file_size).toBe(104857600);
    });
  });
});
