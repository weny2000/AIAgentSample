/**
 * Data models for Work Task Analysis System
 * These interfaces define the structure of data stored in DynamoDB tables
 */

export interface WorkTaskRecord {
  // Primary Key
  task_id: string;
  created_at: string; // ISO timestamp string
  
  // Basic task information
  title: string;
  description: string;
  content: string;
  submitted_by: string;
  team_id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
  
  // Status and lifecycle
  status: 'submitted' | 'analyzing' | 'analyzed' | 'in_progress' | 'completed';
  updated_at: string; // ISO timestamp string
  
  // Analysis results (stored as JSON)
  analysis_result?: TaskAnalysisResult;
  
  // Data retention
  ttl?: number; // Unix timestamp for TTL
}

export interface TodoItemRecord {
  // Primary Key
  todo_id: string;
  task_id: string;
  
  // Todo item details
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  assigned_to?: string;
  due_date?: string; // ISO date string
  dependencies: string[]; // Array of todo_ids
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  
  // Status and progress
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  related_workgroups: string[];
  
  // Deliverables and quality checks
  deliverables: DeliverableReference[];
  quality_checks: QualityCheckReference[];
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Data retention
  ttl?: number;
}

export interface DeliverableRecord {
  // Primary Key
  deliverable_id: string;
  todo_id: string;
  
  // File information
  file_name: string;
  file_type: string;
  file_size: number;
  s3_key: string;
  
  // Submission details
  submitted_by: string;
  submitted_at: string;
  
  // Validation and quality assessment
  validation_result?: ValidationResult;
  quality_assessment?: QualityAssessmentResult;
  status: 'submitted' | 'validating' | 'approved' | 'rejected' | 'needs_revision';
  
  // Data retention
  ttl?: number;
}

// Supporting interfaces for nested data structures

export interface TaskAnalysisResult {
  key_points: KeyPoint[];
  related_workgroups: RelatedWorkgroup[];
  todo_list: TodoItem[];
  knowledge_references: KnowledgeReference[];
  risk_assessment: RiskAssessment;
  recommendations: string[];
  analysis_metadata: AnalysisMetadata;
}

export interface KeyPoint {
  id: string;
  text: string;
  category: 'objective' | 'milestone' | 'constraint' | 'risk' | 'dependency';
  importance: 'low' | 'medium' | 'high' | 'critical';
  extracted_from: string; // Source section of the task content
}

export interface RelatedWorkgroup {
  team_id: string;
  team_name: string;
  relevance_score: number; // 0-1
  skills_matched: string[];
  contact_info: {
    lead_email?: string;
    slack_channel?: string;
    teams_channel?: string;
  };
  collaboration_history?: {
    previous_projects: number;
    success_rate: number;
  };
}

export interface TodoItem {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  dependencies: string[];
  required_skills: string[];
  deliverable_requirements: DeliverableRequirement[];
}

export interface KnowledgeReference {
  id: string;
  title: string;
  source: 'kendra' | 'confluence' | 'jira' | 'git' | 'slack';
  url: string;
  relevance_score: number;
  excerpt: string;
  document_type: 'documentation' | 'code' | 'discussion' | 'specification';
}

export interface RiskAssessment {
  overall_risk_level: 'low' | 'medium' | 'high' | 'critical';
  identified_risks: Risk[];
  mitigation_suggestions: string[];
}

export interface Risk {
  id: string;
  description: string;
  category: 'technical' | 'resource' | 'timeline' | 'dependency' | 'compliance';
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation_strategy?: string;
}

export interface AnalysisMetadata {
  analysis_version: string;
  processing_time_ms: number;
  confidence_score: number; // 0-1
  knowledge_sources_consulted: number;
  ai_model_used: string;
  analysis_timestamp: string;
}

export interface DeliverableReference {
  deliverable_id: string;
  file_name: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  submitted_at?: string;
}

export interface QualityCheckReference {
  check_id: string;
  check_type: string;
  status: 'pending' | 'passed' | 'failed';
  score?: number;
  executed_at?: string;
}

export interface ValidationResult {
  is_valid: boolean;
  validation_score: number; // 0-1
  checks_performed: ValidationCheck[];
  issues_found: ValidationIssue[];
  recommendations: string[];
  validated_at: string;
}

export interface ValidationCheck {
  check_name: string;
  check_type: 'format' | 'content' | 'security' | 'compliance';
  status: 'passed' | 'failed' | 'warning';
  details?: string;
}

export interface ValidationIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'format' | 'content' | 'security' | 'compliance';
  description: string;
  location?: string;
  suggested_fix?: string;
}

export interface QualityAssessmentResult {
  overall_score: number; // 0-100
  quality_dimensions: QualityDimension[];
  improvement_suggestions: string[];
  compliance_status: ComplianceStatus;
  assessed_at: string;
}

export interface QualityDimension {
  dimension: 'completeness' | 'accuracy' | 'clarity' | 'consistency' | 'format';
  score: number; // 0-100
  weight: number; // 0-1
  details: string;
}

export interface ComplianceStatus {
  is_compliant: boolean;
  standards_checked: string[];
  violations: ComplianceViolation[];
}

export interface ComplianceViolation {
  standard: string;
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation: string;
}

export interface DeliverableRequirement {
  type: 'document' | 'code' | 'test' | 'approval' | 'review';
  format: string[];
  mandatory: boolean;
  description: string;
  quality_standards?: string[];
  approval_required?: boolean;
  due_date?: string;
}

// Progress tracking interfaces

export interface ProgressSummary {
  task_id: string;
  total_todos: number;
  completed_todos: number;
  in_progress_todos: number;
  blocked_todos: number;
  completion_percentage: number;
  estimated_completion_date?: string;
  last_updated: string;
}

export interface StatusMetadata {
  updated_by: string;
  notes?: string;
  blocking_reason?: string;
  estimated_completion?: string;
}

export interface BlockerAnalysis {
  todo_id: string;
  blocker_type: 'dependency' | 'resource' | 'approval' | 'technical' | 'external';
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  suggested_resolution: string;
  blocking_since: string;
}

export interface ProgressReport {
  task_id: string;
  report_period: {
    start_date: string;
    end_date: string;
  };
  summary: ProgressSummary;
  completed_items: TodoItemRecord[];
  blocked_items: BlockerAnalysis[];
  quality_metrics: {
    deliverables_submitted: number;
    deliverables_approved: number;
    average_quality_score: number;
  };
  team_performance: {
    velocity: number; // todos completed per day
    quality_trend: 'improving' | 'stable' | 'declining';
  };
  generated_at: string;
}

// Request/Response interfaces for API

export interface TaskSubmissionRequest {
  title: string;
  description: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
  attachments?: FileAttachment[];
}

export interface FileAttachment {
  file_name: string;
  file_type: string;
  file_size: number;
  content_base64: string;
}

export interface TodoUpdateRequest {
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assigned_to?: string;
  due_date?: string;
  notes?: string;
  estimated_hours?: number;
}

export interface DeliverableSubmission {
  file_name: string;
  file_type: string;
  file_size: number;
  content_base64: string;
  notes?: string;
}

// Query interfaces for DynamoDB operations

export interface WorkTaskQuery {
  team_id?: string;
  status?: string;
  submitted_by?: string;
  priority?: string;
  limit?: number;
  last_evaluated_key?: any;
}

export interface TodoItemQuery {
  task_id?: string;
  status?: string;
  assigned_to?: string;
  priority?: string;
  limit?: number;
  last_evaluated_key?: any;
}

export interface DeliverableQuery {
  todo_id?: string;
  status?: string;
  submitted_by?: string;
  limit?: number;
  last_evaluated_key?: any;
}

export interface WorkTaskSummary {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  submitted_by: string;
  team_id: string;
  created_at: string;
  updated_at: string;
  progress_summary?: ProgressSummary;
}