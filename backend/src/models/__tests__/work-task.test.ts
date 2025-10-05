/**
 * Unit tests for Work Task Analysis System data models
 * Tests the extended data models for deliverable checking and quality assessment
 */

import { 
  WorkTaskRecord,
  TodoItemRecord,
  DeliverableRecord,
  ValidationResult,
  QualityAssessmentResult,
  ProgressTrackingRecord,
  QualityStandardRecord
} from '../work-task';

describe('Work Task Analysis Data Models', () => {
  
  describe('WorkTaskRecord', () => {
    it('should create a valid work task record', () => {
      const workTask: WorkTaskRecord = {
        id: 'task-123',
        task_id: 'task-123',
        title: 'Test Task',
        description: 'A test task for validation',
        content: 'Detailed task content',
        submitted_by: 'user-123',
        team_id: 'team-456',
        priority: 'high',
        category: 'development',
        tags: ['testing', 'validation'],
        status: 'submitted',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [
          {
            attachment_id: 'att-123',
            file_name: 'requirements.pdf',
            file_type: 'application/pdf',
            file_size: 1024000,
            s3_key: 'attachments/att-123.pdf',
            uploaded_at: new Date().toISOString()
          }
        ]
      };

      expect(workTask.task_id).toBe('task-123');
      expect(workTask.priority).toBe('high');
      expect(workTask.status).toBe('submitted');
      expect(workTask.attachments).toHaveLength(1);
    });
  });

  describe('TodoItemRecord', () => {
    it('should create a valid todo item with deliverable and quality requirements', () => {
      const todoItem: TodoItemRecord = {
        id: 'todo-123',
        todo_id: 'todo-123',
        task_id: 'task-123',
        title: 'Implement feature X',
        description: 'Detailed implementation of feature X',
        priority: 'high',
        estimated_hours: 8,
        assigned_to: 'dev-123',
        due_date: '2024-12-31',
        dependencies: ['todo-122'],
        category: 'development',
        status: 'pending',
        related_workgroups: ['backend-team', 'security-team'],
        deliverables: [
          {
            deliverable_id: 'del-123',
            file_name: 'feature-x.ts',
            status: 'submitted',
            submitted_at: new Date().toISOString()
          }
        ],
        quality_checks: [
          {
            check_id: 'qc-123',
            check_type: 'code_quality',
            status: 'pending',
            score: 85,
            executed_at: new Date().toISOString()
          }
        ],
        progress_tracking: {
          completion_percentage: 25,
          time_spent_hours: 2,
          last_activity_at: new Date().toISOString(),
          blocking_issues: [],
          status_history: [
            {
              status: 'pending',
              changed_at: new Date().toISOString(),
              changed_by: 'system',
              notes: 'Initial creation'
            }
          ]
        },
        completion_criteria: [
          {
            criteria_id: 'cc-123',
            description: 'Code review completed',
            type: 'approval',
            required: true,
            status: 'pending'
          }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expect(todoItem.todo_id).toBe('todo-123');
      expect(todoItem.deliverables).toHaveLength(1);
      expect(todoItem.quality_checks).toHaveLength(1);
      expect(todoItem.progress_tracking.completion_percentage).toBe(25);
      expect(todoItem.completion_criteria).toHaveLength(1);
    });
  });

  describe('DeliverableRecord', () => {
    it('should create a valid deliverable record with validation and quality assessment', () => {
      const deliverable: DeliverableRecord = {
        id: 'del-123',
        deliverable_id: 'del-123',
        todo_id: 'todo-123',
        task_id: 'task-123',
        file_name: 'implementation.ts',
        file_type: 'text/typescript',
        file_size: 5120,
        s3_key: 'deliverables/del-123/implementation.ts',
        submitted_by: 'dev-123',
        submitted_at: new Date().toISOString(),
        status: 'validating',
        version: 1,
        metadata: {
          content_type: 'text/typescript',
          encoding: 'utf-8',
          checksum: 'sha256:abc123...',
          virus_scan_result: {
            scanned_at: new Date().toISOString(),
            scanner_version: '1.0.0',
            threats_found: 0,
            scan_status: 'clean'
          },
          content_analysis: {
            analyzed_at: new Date().toISOString(),
            content_summary: 'TypeScript implementation file',
            key_elements: ['functions', 'classes', 'interfaces'],
            technical_indicators: [
              {
                indicator_type: 'complexity',
                value: 'medium',
                confidence: 0.85,
                description: 'Code complexity is within acceptable range'
              }
            ],
            compliance_indicators: [
              {
                policy_id: 'coding-standards',
                policy_name: 'Coding Standards Policy',
                compliance_status: 'compliant',
                details: 'Follows TypeScript coding standards'
              }
            ]
          }
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expect(deliverable.deliverable_id).toBe('del-123');
      expect(deliverable.status).toBe('validating');
      expect(deliverable.metadata.virus_scan_result?.scan_status).toBe('clean');
      expect(deliverable.metadata.content_analysis?.key_elements).toContain('functions');
    });
  });

  describe('ValidationResult', () => {
    it('should create a valid validation result', () => {
      const validationResult: ValidationResult = {
        validation_id: 'val-123',
        deliverable_id: 'del-123',
        validated_at: new Date().toISOString(),
        validated_by: 'system',
        overall_status: 'passed',
        validation_checks: [
          {
            check_id: 'check-1',
            check_name: 'Format Validation',
            check_type: 'format',
            status: 'passed',
            score: 95,
            details: 'File format is valid TypeScript',
            evidence: [
              {
                evidence_type: 'text',
                content: 'Valid TypeScript syntax detected',
                location: 'line 1-50',
                severity: 'info'
              }
            ]
          }
        ],
        recommendations: ['Consider adding more inline comments'],
        next_steps: ['Proceed to quality assessment']
      };

      expect(validationResult.overall_status).toBe('passed');
      expect(validationResult.validation_checks).toHaveLength(1);
      expect(validationResult.validation_checks[0].status).toBe('passed');
    });
  });

  describe('QualityAssessmentResult', () => {
    it('should create a valid quality assessment result', () => {
      const qualityAssessment: QualityAssessmentResult = {
        assessment_id: 'qa-123',
        deliverable_id: 'del-123',
        assessed_at: new Date().toISOString(),
        assessed_by: 'quality-engine',
        overall_score: 85,
        quality_dimensions: [
          {
            dimension_name: 'Code Quality',
            dimension_type: 'maintainability',
            score: 88,
            weight: 0.4,
            criteria: [
              {
                criteria_name: 'Complexity',
                description: 'Code complexity metrics',
                score: 85,
                max_score: 100,
                evidence: 'Cyclomatic complexity: 5',
                automated: true
              }
            ]
          }
        ],
        improvement_suggestions: [
          {
            suggestion_id: 'sug-123',
            category: 'minor',
            title: 'Add more comments',
            description: 'Consider adding more inline documentation',
            impact: 'low',
            effort: 'low',
            priority: 3,
            related_criteria: ['documentation']
          }
        ],
        quality_gates: [
          {
            gate_name: 'Minimum Quality Score',
            gate_type: 'mandatory',
            threshold: 70,
            current_score: 85,
            status: 'passed',
            blocking: false,
            description: 'Must meet minimum quality threshold'
          }
        ]
      };

      expect(qualityAssessment.overall_score).toBe(85);
      expect(qualityAssessment.quality_dimensions).toHaveLength(1);
      expect(qualityAssessment.quality_gates[0].status).toBe('passed');
    });
  });

  describe('ProgressTrackingRecord', () => {
    it('should create a valid progress tracking record', () => {
      const progressTracking: ProgressTrackingRecord = {
        id: 'pt-123',
        tracking_id: 'pt-123',
        task_id: 'task-123',
        todo_id: 'todo-123',
        tracking_type: 'todo',
        current_status: 'in_progress',
        progress_percentage: 60,
        milestones: [
          {
            milestone_id: 'ms-123',
            name: 'Implementation Complete',
            description: 'Core implementation finished',
            target_date: '2024-12-15',
            status: 'in_progress',
            completion_criteria: ['Code written', 'Tests passing'],
            dependencies: []
          }
        ],
        metrics: {
          velocity: 2.5,
          burn_rate: 8,
          efficiency_score: 85,
          quality_trend: 'improving',
          risk_indicators: [
            {
              indicator_name: 'Schedule Risk',
              current_value: 0.3,
              threshold_value: 0.5,
              trend: 'stable',
              severity: 'low',
              description: 'Project is on schedule'
            }
          ],
          performance_indicators: [
            {
              indicator_name: 'Completion Rate',
              current_value: 60,
              target_value: 100,
              unit: 'percentage',
              trend: 'improving',
              benchmark: 70
            }
          ]
        },
        alerts: [],
        forecasting: {
          completion_date_estimate: '2024-12-20',
          confidence_interval: {
            optimistic: '2024-12-18',
            realistic: '2024-12-20',
            pessimistic: '2024-12-25'
          },
          risk_factors: ['Holiday schedule'],
          assumptions: ['Team availability maintained'],
          last_updated: new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expect(progressTracking.progress_percentage).toBe(60);
      expect(progressTracking.metrics.efficiency_score).toBe(85);
      expect(progressTracking.forecasting.completion_date_estimate).toBe('2024-12-20');
    });
  });

  describe('QualityStandardRecord', () => {
    it('should create a valid quality standard record', () => {
      const qualityStandard: QualityStandardRecord = {
        id: 'qs-123',
        standard_id: 'qs-123',
        name: 'TypeScript Code Quality Standard',
        description: 'Quality standards for TypeScript development',
        version: '1.0.0',
        applicable_file_types: ['.ts', '.tsx'],
        applicable_categories: ['development'],
        team_id: 'backend-team',
        quality_dimensions: [
          {
            dimension_name: 'Code Quality',
            dimension_type: 'maintainability',
            weight: 0.4,
            criteria: [
              {
                criteria_name: 'Complexity',
                description: 'Cyclomatic complexity should be reasonable',
                max_score: 100,
                evaluation_method: 'automated',
                evaluation_script: 'complexity-analyzer'
              }
            ],
            automated_checks: [
              {
                check_name: 'ESLint',
                check_type: 'static_analysis',
                tool_name: 'eslint',
                configuration: { rules: 'strict' },
                weight: 0.6
              }
            ]
          }
        ],
        validation_rules: [
          {
            rule_id: 'rule-1',
            rule_name: 'No console.log',
            rule_type: 'static_analysis',
            condition: 'not contains console.log',
            action: 'warn',
            message: 'Remove console.log statements',
            parameters: {}
          }
        ],
        quality_gates: [
          {
            gate_name: 'Minimum Score',
            gate_type: 'mandatory',
            threshold: 70,
            blocking: true,
            description: 'Must achieve minimum quality score',
            applicable_stages: ['validation', 'review']
          }
        ],
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expect(qualityStandard.name).toBe('TypeScript Code Quality Standard');
      expect(qualityStandard.is_active).toBe(true);
      expect(qualityStandard.quality_dimensions).toHaveLength(1);
      expect(qualityStandard.validation_rules).toHaveLength(1);
    });
  });
});