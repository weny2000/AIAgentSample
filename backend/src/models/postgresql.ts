// PostgreSQL Data Models
// These interfaces represent the data structures for dependency graph and policy management

export interface Service {
  id: string;
  name: string;
  team_id: string;
  repository_url?: string;
  description?: string;
  service_type?: string;
  status: 'active' | 'deprecated' | 'retired';
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateServiceRequest {
  name: string;
  team_id: string;
  repository_url?: string;
  description?: string;
  service_type?: string;
  status?: 'active' | 'deprecated' | 'retired';
  metadata?: Record<string, any>;
}

export interface UpdateServiceRequest {
  name?: string;
  repository_url?: string;
  description?: string;
  service_type?: string;
  status?: 'active' | 'deprecated' | 'retired';
  metadata?: Record<string, any>;
}

export interface Dependency {
  id: string;
  source_service_id: string;
  target_service_id: string;
  dependency_type: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDependencyRequest {
  source_service_id: string;
  target_service_id: string;
  dependency_type: string;
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  metadata?: Record<string, any>;
}

export interface UpdateDependencyRequest {
  dependency_type?: string;
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  metadata?: Record<string, any>;
}

export interface ImpactAnalysisCache {
  id: string;
  service_id: string;
  analysis_type: 'downstream' | 'upstream' | 'full';
  affected_services: any[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  stakeholders: any[];
  computed_at: Date;
  expires_at: Date;
}

export interface ServiceVersion {
  id: string;
  service_id: string;
  version: string;
  release_notes?: string;
  breaking_changes: boolean;
  deployment_date?: Date;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface CreateServiceVersionRequest {
  service_id: string;
  version: string;
  release_notes?: string;
  breaking_changes?: boolean;
  deployment_date?: Date;
  metadata?: Record<string, any>;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  policy_json: Record<string, any>;
  version: number;
  status: 'draft' | 'pending_approval' | 'active' | 'deprecated' | 'archived';
  policy_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  applicable_artifacts: string[];
  team_scope: string[];
  created_by: string;
  approved_by?: string;
  approved_at?: Date;
  effective_from: Date;
  effective_until?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePolicyRequest {
  name: string;
  description?: string;
  policy_json: Record<string, any>;
  policy_type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  applicable_artifacts?: string[];
  team_scope?: string[];
  created_by: string;
  effective_from?: Date;
  effective_until?: Date;
}

export interface UpdatePolicyRequest {
  description?: string;
  policy_json?: Record<string, any>;
  policy_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  applicable_artifacts?: string[];
  team_scope?: string[];
  effective_from?: Date;
  effective_until?: Date;
}

export interface PolicyApproval {
  id: string;
  policy_id: string;
  approver_id: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  comments?: string;
  approval_level: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePolicyApprovalRequest {
  policy_id: string;
  approver_id: string;
  approval_level?: number;
  comments?: string;
}

export interface UpdatePolicyApprovalRequest {
  approval_status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  comments?: string;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description?: string;
  template_json: Record<string, any>;
  category: string;
  parameters: Record<string, any>;
  example_usage: Record<string, any>;
  created_by: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRuleTemplateRequest {
  name: string;
  description?: string;
  template_json: Record<string, any>;
  category: string;
  parameters?: Record<string, any>;
  example_usage?: Record<string, any>;
  created_by: string;
  is_active?: boolean;
}

export interface UpdateRuleTemplateRequest {
  description?: string;
  template_json?: Record<string, any>;
  category?: string;
  parameters?: Record<string, any>;
  example_usage?: Record<string, any>;
  is_active?: boolean;
}

export interface PolicyExecutionHistory {
  id: string;
  policy_id: string;
  artifact_id: string;
  artifact_type: string;
  execution_result: 'pass' | 'fail' | 'warning' | 'error';
  score?: number;
  findings: any[];
  execution_time_ms?: number;
  executed_by?: string;
  executed_at: Date;
}

export interface CreatePolicyExecutionRequest {
  policy_id: string;
  artifact_id: string;
  artifact_type: string;
  execution_result: 'pass' | 'fail' | 'warning' | 'error';
  score?: number;
  findings?: any[];
  execution_time_ms?: number;
  executed_by?: string;
}

export interface PolicyConflict {
  id: string;
  policy_a_id: string;
  policy_b_id: string;
  conflict_type: string;
  conflict_description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolution_status: 'unresolved' | 'resolved' | 'accepted';
  resolution_notes?: string;
  detected_at: Date;
  resolved_at?: Date;
  resolved_by?: string;
}

// View interfaces for complex queries
export interface ServiceDependencySummary {
  id: string;
  name: string;
  team_id: string;
  service_type?: string;
  status: string;
  outgoing_dependencies: number;
  incoming_dependencies: number;
  has_critical_outgoing: boolean;
  has_critical_incoming: boolean;
}

export interface CrossTeamDependency {
  id: string;
  dependency_type: string;
  criticality: string;
  source_service: string;
  source_team: string;
  target_service: string;
  target_team: string;
  created_at: Date;
}

export interface PolicyApprovalStatus {
  policy_id: string;
  name: string;
  status: string;
  total_approvals_required: number;
  approvals_received: number;
  rejections_received: number;
  pending_approvals: number;
  overall_approval_status: 'rejected' | 'fully_approved' | 'partially_approved' | 'not_approved';
}

export interface PolicyExecutionStats {
  policy_id: string;
  name: string;
  policy_type: string;
  severity: string;
  total_executions: number;
  passes: number;
  failures: number;
  warnings: number;
  errors: number;
  average_score?: number;
  average_execution_time_ms?: number;
}

// Query filter interfaces
export interface ServiceFilters {
  team_id?: string;
  service_type?: string;
  status?: 'active' | 'deprecated' | 'retired';
  search?: string;
}

export interface DependencyFilters {
  source_service_id?: string;
  target_service_id?: string;
  dependency_type?: string;
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  team_id?: string;
}

export interface PolicyFilters {
  status?: 'draft' | 'pending_approval' | 'active' | 'deprecated' | 'archived';
  policy_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  created_by?: string;
  team_scope?: string;
  applicable_artifact?: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}