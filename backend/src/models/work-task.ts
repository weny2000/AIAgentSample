/**
 * Work Task Analysis System Data Models
 * Extended data models for deliverable checking and quality assessment
 */

import { BaseEntity, TimestampFields } from './index';

// ============================================================================
// Core Work Task Models
// ============================================================================

export interface WorkTaskRecord extends BaseEntity {
  task_id: string; // Partition Key
  title: string;
  description: string;
  content: string;
  submitted_by: string;
  team_id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
  status: 'submitted' | 'analyzing' | 'analyzed' | 'in_progress' | 'completed' | 'cancelled';
  analysis_result?: TaskAnalysisResult;
  attachments?: AttachmentRecord[];
  ttl?: number; // Data retention period
}

export interface AttachmentRecord {
  attachment_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  s3_key: string;
  uploaded_at: string;
}

// ============================================================================
// Todo Item Models with Deliverable Support
// ============================================================================

export interface TodoItemRecord extends BaseEntity {
  todo_id: string; // Partition Key
  task_id: string; // GSI Partition Key
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  assigned_to?: string;
  due_date?: string;
  dependencies: string[];
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  related_workgroups: string[];
  deliverables: DeliverableReference[];
  quality_checks: QualityCheckReference[];
  progress_tracking: ProgressTrackingData;
  completion_criteria: CompletionCriteria[];
}

export interface DeliverableReference {
  deliverable_id: string;
  file_name: string;
  status: 'submitted' | 'validating' | 'approved' | 'rejected' | 'needs_revision';
  submitted_at: string;
}

export interface QualityCheckReference {
  check_id: string;
  check_type: string;
  status: 'pending' | 'in_progress' | 'passed' | 'failed';
  score?: number;
  executed_at?: string;
}

export interface ProgressTrackingData {
  completion_percentage: number;
  time_spent_hours: number;
  last_activity_at: string;
  blocking_issues: BlockingIssue[];
  status_history: StatusHistoryEntry[];
}

export interface BlockingIssue {
  issue_id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reported_at: string;
  resolved_at?: string;
  resolution?: string;
}

export interface StatusHistoryEntry {
  status: string;
  changed_at: string;
  changed_by: string;
  notes?: string;
}

export interface CompletionCriteria {
  criteria_id: string;
  description: string;
  type: 'deliverable' | 'quality_check' | 'approval' | 'verification';
  required: boolean;
  status: 'pending' | 'met' | 'not_applicable';
  verified_at?: string;
  verified_by?: string;
}

// ============================================================================
// Deliverable Models
// ============================================================================

export interface DeliverableRecord extends BaseEntity {
  deliverable_id: string; // Partition Key
  todo_id: string; // GSI Partition Key
  task_id: string; // GSI Partition Key for task-level queries
  file_name: string;
  file_type: string;
  file_size: number;
  s3_key: string;
  submitted_by: string;
  submitted_at: string;
  validation_result?: ValidationResult;
  quality_assessment?: QualityAssessmentResult;
  status: 'submitted' | 'validating' | 'approved' | 'rejected' | 'needs_revision';
  version: number;
  previous_version_id?: string;
  metadata: DeliverableMetadata;
}

export interface DeliverableMetadata {
  content_type: string;
  encoding?: string;
  checksum: string;
  virus_scan_result?: VirusScanResult;
  content_analysis?: ContentAnalysisResult;
  compliance_tags?: string[];
}

export interface VirusScanResult {
  scanned_at: string;
  scanner_version: string;
  threats_found: number;
  threat_details?: ThreatDetail[];
  scan_status: 'clean' | 'infected' | 'suspicious' | 'error';
}

export interface ThreatDetail {
  threat_name: string;
  threat_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface ContentAnalysisResult {
  analyzed_at: string;
  content_summary: string;
  key_elements: string[];
  technical_indicators: TechnicalIndicator[];
  compliance_indicators: ComplianceIndicator[];
}

export interface TechnicalIndicator {
  indicator_type: string;
  value: string;
  confidence: number;
  description: string;
}

export interface ComplianceIndicator {
  policy_id: string;
  policy_name: string;
  compliance_status: 'compliant' | 'non_compliant' | 'needs_review';
  details: string;
}

// ============================================================================
// Validation and Quality Assessment Models
// ============================================================================

export interface ValidationResult {
  validation_id: string;
  deliverable_id: string;
  validated_at: string;
  validated_by: string; // system or user_id
  overall_status: 'passed' | 'failed' | 'warning';
  validation_checks: ValidationCheck[];
  recommendations: string[];
  next_steps: string[];
}

export interface ValidationCheck {
  check_id: string;
  check_name: string;
  check_type: 'format' | 'content' | 'security' | 'compliance' | 'technical';
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  score?: number; // 0-100
  details: string;
  evidence?: ValidationEvidence[];
  remediation_steps?: string[];
}

export interface ValidationEvidence {
  evidence_type: 'text' | 'image' | 'data' | 'reference';
  content: string;
  location?: string; // file path, line number, etc.
  severity: 'info' | 'warning' | 'error';
}

export interface QualityAssessmentResult {
  assessment_id: string;
  deliverable_id: string;
  assessed_at: string;
  assessed_by: string;
  overall_score: number; // 0-100
  quality_dimensions: QualityDimension[];
  improvement_suggestions: ImprovementSuggestion[];
  quality_gates: QualityGate[];
  benchmark_comparison?: BenchmarkComparison;
}

export interface QualityDimension {
  dimension_name: string;
  dimension_type: 'completeness' | 'accuracy' | 'consistency' | 'usability' | 'maintainability' | 'performance';
  score: number; // 0-100
  weight: number; // contribution to overall score
  criteria: QualityCriteria[];
  comments?: string;
}

export interface QualityCriteria {
  criteria_name: string;
  description: string;
  score: number;
  max_score: number;
  evidence?: string;
  automated: boolean;
}

export interface ImprovementSuggestion {
  suggestion_id: string;
  category: 'critical' | 'major' | 'minor' | 'enhancement';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  priority: number; // 1-10
  related_criteria: string[];
  example?: string;
}

export interface QualityGate {
  gate_name: string;
  gate_type: 'mandatory' | 'recommended' | 'optional';
  threshold: number;
  current_score: number;
  status: 'passed' | 'failed' | 'warning';
  blocking: boolean;
  description: string;
}

export interface BenchmarkComparison {
  benchmark_type: 'team_average' | 'project_average' | 'industry_standard';
  benchmark_score: number;
  percentile_rank: number;
  comparison_notes: string;
}

// ============================================================================
// Progress Tracking Models
// ============================================================================

export interface ProgressTrackingRecord extends BaseEntity {
  tracking_id: string; // Partition Key
  task_id: string; // GSI Partition Key
  todo_id?: string; // GSI Partition Key for todo-level tracking
  tracking_type: 'task' | 'todo' | 'deliverable';
  current_status: string;
  progress_percentage: number;
  milestones: ProgressMilestone[];
  metrics: ProgressMetrics;
  alerts: ProgressAlert[];
  forecasting: ProgressForecast;
}

export interface ProgressMilestone {
  milestone_id: string;
  name: string;
  description: string;
  target_date: string;
  actual_date?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'delayed' | 'cancelled';
  completion_criteria: string[];
  dependencies: string[];
}

export interface ProgressMetrics {
  velocity: number; // tasks/hours completed per time unit
  burn_rate: number; // hours consumed per time unit
  efficiency_score: number; // 0-100
  quality_trend: 'improving' | 'stable' | 'declining';
  risk_indicators: RiskIndicator[];
  performance_indicators: PerformanceIndicator[];
}

export interface RiskIndicator {
  indicator_name: string;
  current_value: number;
  threshold_value: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface PerformanceIndicator {
  indicator_name: string;
  current_value: number;
  target_value: number;
  unit: string;
  trend: 'improving' | 'stable' | 'declining';
  benchmark?: number;
}

export interface ProgressAlert {
  alert_id: string;
  alert_type: 'deadline_risk' | 'quality_issue' | 'resource_constraint' | 'dependency_block';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  triggered_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  action_required: boolean;
  suggested_actions: string[];
}

export interface ProgressForecast {
  completion_date_estimate: string;
  confidence_interval: {
    optimistic: string;
    realistic: string;
    pessimistic: string;
  };
  risk_factors: string[];
  assumptions: string[];
  last_updated: string;
}

// ============================================================================
// Quality Standards and Configuration Models
// ============================================================================

export interface QualityStandardRecord extends BaseEntity {
  standard_id: string; // Partition Key
  name: string;
  description: string;
  version: string;
  applicable_file_types: string[];
  applicable_categories: string[];
  team_id?: string; // team-specific standards
  quality_dimensions: QualityDimensionConfig[];
  validation_rules: ValidationRuleConfig[];
  quality_gates: QualityGateConfig[];
  is_active: boolean;
}

export interface QualityDimensionConfig {
  dimension_name: string;
  dimension_type: string;
  weight: number;
  criteria: QualityCriteriaConfig[];
  automated_checks: AutomatedCheckConfig[];
}

export interface QualityCriteriaConfig {
  criteria_name: string;
  description: string;
  max_score: number;
  evaluation_method: 'automated' | 'manual' | 'hybrid';
  evaluation_script?: string;
  evaluation_parameters?: Record<string, any>;
}

export interface AutomatedCheckConfig {
  check_name: string;
  check_type: string;
  tool_name: string;
  configuration: Record<string, any>;
  weight: number;
}

export interface ValidationRuleConfig {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  condition: string;
  action: 'pass' | 'fail' | 'warn';
  message: string;
  parameters: Record<string, any>;
}

export interface QualityGateConfig {
  gate_name: string;
  gate_type: string;
  threshold: number;
  blocking: boolean;
  description: string;
  applicable_stages: string[];
}

// ============================================================================
// Analysis and Reporting Models
// ============================================================================

export interface TaskAnalysisResult {
  task_id: string;
  analysis_version: string;
  analyzed_at: string;
  key_points: string[];
  related_workgroups: RelatedWorkgroup[];
  todo_list: TodoItem[];
  knowledge_references: KnowledgeReference[];
  risk_assessment: RiskAssessment;
  recommendations: string[];
  estimated_effort: EffortEstimate;
  dependencies: TaskDependency[];
  compliance_checks: ComplianceCheck[];
  quality_requirements: QualityRequirement[];
}

export interface QualityRequirement {
  requirement_id: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  acceptance_criteria: string[];
  measurement_method: string;
  target_value?: number;
  threshold_value?: number;
}

// Re-export existing interfaces that are still relevant
export interface RelatedWorkgroup {
  team_id: string;
  team_name: string;
  relevance_score: number;
  reason: string;
  contact_info?: string;
  expertise: string[];
  recommended_involvement: 'consultation' | 'collaboration' | 'approval' | 'notification';
  // Enhanced fields for skill-based matching
  skillMatchDetails?: {
    matchedSkills: string[];
    skillGaps: string[];
    confidenceLevel: number;
  };
  capacityInfo?: {
    currentWorkload: number;
    availableHours: number;
    efficiencyRating: number;
  };
  historicalPerformance?: {
    successRate: number;
    averageDeliveryTime: number;
    qualityScore: number;
    similarProjectCount: number;
  };
}

export interface TodoItem {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  assigned_to?: string;
  due_date?: string;
  dependencies: string[];
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  related_workgroups: string[];
  deliverable_requirements?: DeliverableRequirement[];
  quality_requirements?: QualityRequirement[];
  // Enhanced fields for improved todo generation
  parent_task_id?: string;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  blocking_factors?: string[];
  success_criteria?: string[];
  validation_status?: 'validated' | 'pending' | 'invalid';
  optimization_applied?: boolean;
}

export interface DeliverableRequirement {
  requirement_id: string;
  name: string;
  description: string;
  file_type_restrictions?: string[];
  size_limits?: {
    min_size?: number;
    max_size: number;
  };
  format_requirements?: string[];
  content_requirements?: string[];
  quality_standards: string[];
  mandatory: boolean;
}

export interface KnowledgeReference {
  source_id: string;
  source_type: 'policy' | 'documentation' | 'best_practice' | 'previous_project' | 'expertise';
  title: string;
  snippet: string;
  relevance_score: number;
  url?: string;
  last_updated?: string;
}

export interface RiskAssessment {
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: RiskFactor[];
  mitigation_strategies: string[];
  impact_analysis: ImpactAnalysis;
}

// Enhanced risk assessment interface
export interface EnhancedRiskAssessment extends RiskAssessment {
  risk_matrix: RiskMatrix;
  mitigation_timeline: MitigationTimeline[];
  contingency_plans: ContingencyPlan[];
  monitoring_indicators: MonitoringIndicator[];
}

export interface RiskMatrix {
  probability_impact_grid: RiskGridCell[][];
  risk_appetite: 'low' | 'medium' | 'high';
  acceptable_risk_threshold: number;
}

export interface RiskGridCell {
  probability_range: [number, number];
  impact_range: [number, number];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  action_required: 'monitor' | 'mitigate' | 'avoid' | 'transfer';
}

export interface MitigationTimeline {
  risk_id: string;
  mitigation_actions: MitigationAction[];
  timeline: string;
  responsible_party: string;
  success_criteria: string[];
}

export interface MitigationAction {
  action_id: string;
  description: string;
  effort_required: number;
  cost_estimate?: number;
  effectiveness: number;
}

export interface ContingencyPlan {
  plan_id: string;
  trigger_conditions: string[];
  actions: string[];
  resource_requirements: ResourceRequirement[];
  activation_criteria: string;
}

export interface MonitoringIndicator {
  indicator_name: string;
  current_value: number;
  threshold_value: number;
  trend: 'improving' | 'stable' | 'deteriorating';
  monitoring_frequency: 'daily' | 'weekly' | 'monthly';
}

export interface RiskFactor {
  type: 'technical' | 'resource' | 'timeline' | 'compliance' | 'security' | 'business';
  description: string;
  probability: number; // 0-1
  impact: number; // 0-1
  mitigation?: string;
}

export interface ImpactAnalysis {
  affected_systems: string[];
  affected_teams: string[];
  business_impact: 'minimal' | 'moderate' | 'significant' | 'critical';
  technical_complexity: 'low' | 'medium' | 'high' | 'very_high';
  resource_requirements: ResourceRequirement[];
}

export interface ResourceRequirement {
  type: 'human' | 'technical' | 'financial' | 'time';
  description: string;
  quantity: number;
  unit: string;
  criticality: 'optional' | 'preferred' | 'required' | 'critical';
}

export interface EffortEstimate {
  total_hours: number;
  breakdown: EffortBreakdown[];
  confidence: number; // 0-1
  assumptions: string[];
}

export interface EffortBreakdown {
  category: string;
  hours: number;
  description: string;
}

export interface TaskDependency {
  dependency_id: string;
  type: 'blocks' | 'enables' | 'influences' | 'requires';
  description: string;
  target_task?: string;
  external_system?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplianceCheck {
  policy_id: string;
  policy_name: string;
  status: 'compliant' | 'non_compliant' | 'needs_review' | 'not_applicable';
  details: string;
  required_actions: string[];
}

// ============================================================================
// API Request/Response Models
// ============================================================================

export interface TaskSubmissionRequest {
  title: string;
  description: string;
  content: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
  attachments?: File[];
}

export interface TodoUpdateRequest {
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assigned_to?: string;
  due_date?: string;
  progress_notes?: string;
  time_spent_hours?: number;
}

export interface DeliverableSubmissionRequest {
  todo_id: string;
  file: File;
  description?: string;
  version_notes?: string;
}

export interface QualityCheckRequest {
  deliverable_id: string;
  check_types?: string[];
  quality_standards?: string[];
  priority?: 'low' | 'medium' | 'high';
}

// ============================================================================
// DynamoDB Table Configurations
// ============================================================================

export interface WorkTaskTableConfig {
  tableName: 'work_tasks';
  partitionKey: 'task_id';
  sortKey: 'created_at';
  globalSecondaryIndexes: [
    {
      indexName: 'team-status-index';
      partitionKey: 'team_id';
      sortKey: 'status';
    },
    {
      indexName: 'submitted-by-index';
      partitionKey: 'submitted_by';
      sortKey: 'created_at';
    }
  ];
}

export interface TodoItemTableConfig {
  tableName: 'todo_items';
  partitionKey: 'todo_id';
  sortKey: 'created_at';
  globalSecondaryIndexes: [
    {
      indexName: 'task-status-index';
      partitionKey: 'task_id';
      sortKey: 'status';
    },
    {
      indexName: 'assigned-to-index';
      partitionKey: 'assigned_to';
      sortKey: 'due_date';
    }
  ];
}

export interface DeliverableTableConfig {
  tableName: 'deliverables';
  partitionKey: 'deliverable_id';
  sortKey: 'created_at';
  globalSecondaryIndexes: [
    {
      indexName: 'todo-status-index';
      partitionKey: 'todo_id';
      sortKey: 'status';
    },
    {
      indexName: 'task-status-index';
      partitionKey: 'task_id';
      sortKey: 'status';
    }
  ];
}

export interface ProgressTrackingTableConfig {
  tableName: 'progress_tracking';
  partitionKey: 'tracking_id';
  sortKey: 'created_at';
  globalSecondaryIndexes: [
    {
      indexName: 'task-type-index';
      partitionKey: 'task_id';
      sortKey: 'tracking_type';
    }
  ];
}

export interface QualityStandardTableConfig {
  tableName: 'quality_standards';
  partitionKey: 'standard_id';
  sortKey: 'version';
  globalSecondaryIndexes: [
    {
      indexName: 'team-active-index';
      partitionKey: 'team_id';
      sortKey: 'is_active';
    }
  ];
}

// ============================================================================
// Enhanced Todo Generation Models
// ============================================================================

export interface TodoGenerationContext {
  task_complexity: number;
  available_resources: ResourceAvailability[];
  time_constraints: TimeConstraint[];
  dependency_graph: DependencyNode[];
  risk_factors: RiskFactor[];
  quality_requirements: QualityRequirement[];
}

export interface ResourceAvailability {
  resource_type: 'human' | 'technical' | 'financial';
  resource_id: string;
  availability_percentage: number;
  skills?: string[];
  cost_per_hour?: number;
}

export interface TimeConstraint {
  constraint_type: 'hard_deadline' | 'soft_deadline' | 'milestone' | 'dependency';
  date: string;
  description: string;
  flexibility: number;
}

export interface DependencyNode {
  node_id: string;
  node_type: 'task' | 'resource' | 'approval' | 'external';
  dependencies: string[];
  estimated_duration: number;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// Enhanced Workgroup Skill Matrix Models
// ============================================================================

export interface WorkgroupSkillMatrix {
  teamId: string;
  teamName: string;
  skills: SkillEntry[];
  expertise_areas: string[];
  capacity_metrics: CapacityMetrics;
  historical_performance: HistoricalPerformance;
  availability_status: 'available' | 'busy' | 'overloaded' | 'unavailable';
}

export interface SkillEntry {
  skill_name: string;
  proficiency_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  years_experience: number;
  certification_level?: string;
  last_used: string;
  confidence_score: number;
}

export interface CapacityMetrics {
  current_workload: number;
  available_hours_per_week: number;
  committed_hours_per_week: number;
  efficiency_rating: number;
  collaboration_rating: number;
}

export interface HistoricalPerformance {
  completed_projects: number;
  success_rate: number;
  average_delivery_time: number;
  quality_score: number;
  collaboration_feedback: number;
  similar_project_experience: SimilarProjectExperience[];
}

export interface SimilarProjectExperience {
  project_id: string;
  project_name: string;
  similarity_score: number;
  role: string;
  outcome: 'success' | 'partial_success' | 'failure';
  lessons_learned: string[];
}