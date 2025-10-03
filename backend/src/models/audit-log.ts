import { DynamoDBItem, PaginatedResponse } from './index';

/**
 * Reference to a source document or policy used in an action
 */
export interface Reference {
  source_id: string;
  source_type: 'confluence' | 'jira' | 'slack' | 'teams' | 'git' | 's3' | 'internal-policy' | 'external-api' | 'kendra' | 'llm-response';
  confidence_score: number; // 0-1 scale
  snippet: string;
  metadata?: Record<string, any>;
}

/**
 * Security event details for audit logging
 */
export interface SecurityEvent {
  event_type: 'authentication' | 'authorization' | 'data_access' | 'policy_violation' | 'suspicious_activity' | 'configuration_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_ip?: string;
  user_agent?: string;
  resource_accessed?: string;
  permission_requested?: string;
  violation_details?: string;
  risk_score?: number; // 0-100 scale
}

/**
 * Data source attribution for compliance reporting
 */
export interface DataSourceAttribution {
  source_system: string;
  source_id: string;
  data_classification: 'public' | 'internal' | 'confidential' | 'restricted';
  access_level_required: string;
  retention_period_days?: number;
  pii_detected: boolean;
  sensitive_data_types?: string[];
}

/**
 * Performance metrics for action tracking
 */
export interface PerformanceMetrics {
  execution_time_ms: number;
  memory_usage_mb?: number;
  api_calls_made: number;
  tokens_consumed?: number;
  cache_hit_ratio?: number;
  error_count: number;
}

/**
 * Core audit log entry
 */
export interface AuditLog {
  request_id: string;
  timestamp: string;
  user_id: string;
  persona: string;
  action: string;
  references: Reference[];
  result_summary: string;
  compliance_score: number;
  
  // Enhanced fields for comprehensive tracking
  session_id?: string;
  team_id?: string;
  department?: string;
  user_role?: string;
  action_category: 'query' | 'artifact_check' | 'policy_update' | 'configuration_change' | 'data_access' | 'system_operation';
  action_subcategory?: string;
  
  // Security and compliance
  security_event?: SecurityEvent;
  data_sources: DataSourceAttribution[];
  compliance_flags: string[];
  policy_violations: string[];
  
  // Performance and operational
  performance_metrics: PerformanceMetrics;
  error_details?: {
    error_code?: string;
    error_message?: string;
    stack_trace?: string;
    retry_count?: number;
  };
  
  // Context and metadata
  request_context: {
    source_ip?: string;
    user_agent?: string;
    api_version?: string;
    client_type?: string;
    correlation_id?: string;
    trace_id?: string;
  };
  
  business_context?: {
    project_id?: string;
    artifact_type?: string;
    workflow_stage?: string;
    approval_required?: boolean;
    stakeholders?: string[];
  };
  
  // Audit trail
  created_at: string;
  expires_at?: string; // For TTL
}

/**
 * DynamoDB item structure for audit logs
 */
export interface AuditLogItem extends DynamoDBItem {
  pk: string; // request_id
  sk: string; // timestamp
  entity_type: 'audit_log';
  gsi1pk: string; // user_id for user-based queries
  gsi1sk: string; // timestamp for sorting
  gsi2pk?: string; // action for action-based queries
  gsi2sk?: string; // timestamp for sorting
  gsi3pk?: string; // team_id for team-based queries
  gsi3sk?: string; // timestamp for sorting
  ttl?: number; // TTL for automatic deletion
  
  // All AuditLog fields
  request_id: string;
  timestamp: string;
  user_id: string;
  persona: string;
  action: string;
  references: Reference[];
  result_summary: string;
  compliance_score: number;
  session_id?: string;
  team_id?: string;
  department?: string;
  user_role?: string;
  action_category: string;
  action_subcategory?: string;
  security_event?: SecurityEvent;
  data_sources: DataSourceAttribution[];
  compliance_flags: string[];
  policy_violations: string[];
  performance_metrics: PerformanceMetrics;
  error_details?: any;
  request_context: any;
  business_context?: any;
  created_at: string;
  expires_at?: string;
}

/**
 * Input for creating audit log entries
 */
export interface CreateAuditLogInput {
  request_id: string;
  user_id: string;
  persona: string;
  action: string;
  references: Reference[];
  result_summary: string;
  compliance_score: number;
  
  // Optional enhanced fields
  session_id?: string;
  team_id?: string;
  department?: string;
  user_role?: string;
  action_category?: 'query' | 'artifact_check' | 'policy_update' | 'configuration_change' | 'data_access' | 'system_operation';
  action_subcategory?: string;
  security_event?: SecurityEvent;
  data_sources?: DataSourceAttribution[];
  compliance_flags?: string[];
  policy_violations?: string[];
  performance_metrics?: Partial<PerformanceMetrics>;
  error_details?: any;
  request_context?: any;
  business_context?: any;
  retention_days?: number; // Override default TTL
}

/**
 * Query parameters for audit log searches
 */
export interface QueryAuditLogParams {
  user_id?: string;
  team_id?: string;
  action?: string;
  action_category?: string;
  start_timestamp?: string;
  end_timestamp?: string;
  compliance_score_min?: number;
  compliance_score_max?: number;
  security_event_severity?: 'low' | 'medium' | 'high' | 'critical';
  has_policy_violations?: boolean;
  data_classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  limit?: number;
  last_evaluated_key?: Record<string, any>;
}

/**
 * Response for audit log queries
 */
export interface QueryAuditLogResponse extends PaginatedResponse<AuditLog> {
  aggregations?: {
    total_entries: number;
    unique_users: number;
    unique_teams: number;
    average_compliance_score: number;
    policy_violation_count: number;
    security_event_count: number;
    action_distribution: Record<string, number>;
    compliance_score_distribution: {
      excellent: number; // 90-100
      good: number; // 70-89
      fair: number; // 50-69
      poor: number; // 0-49
    };
  };
}

/**
 * Compliance report structure
 */
export interface ComplianceReport {
  report_id: string;
  generated_at: string;
  generated_by: string;
  report_period: {
    start_date: string;
    end_date: string;
  };
  
  summary: {
    total_actions: number;
    total_users: number;
    total_teams: number;
    average_compliance_score: number;
    policy_violations: number;
    security_events: number;
  };
  
  compliance_metrics: {
    score_distribution: Record<string, number>;
    trend_analysis: {
      period: string;
      score_change: number;
      violation_change: number;
    }[];
    top_violations: {
      policy_id: string;
      policy_name: string;
      violation_count: number;
      affected_teams: string[];
    }[];
  };
  
  security_analysis: {
    event_distribution: Record<string, number>;
    high_risk_events: SecurityEvent[];
    user_risk_scores: {
      user_id: string;
      risk_score: number;
      event_count: number;
    }[];
  };
  
  data_governance: {
    data_source_usage: Record<string, number>;
    pii_access_events: number;
    retention_compliance: {
      compliant_records: number;
      expired_records: number;
      pending_deletion: number;
    };
  };
  
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: string;
    description: string;
    affected_teams?: string[];
    estimated_impact: string;
  }[];
}

/**
 * Security alert configuration
 */
export interface SecurityAlertConfig {
  alert_id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  triggers: {
    event_types: string[];
    severity_threshold: 'low' | 'medium' | 'high' | 'critical';
    frequency_threshold?: {
      count: number;
      time_window_minutes: number;
    };
    compliance_score_threshold?: number;
    policy_violations?: string[];
  };
  
  actions: {
    notify_users: string[];
    notify_teams: string[];
    create_incident?: boolean;
    block_user?: boolean;
    escalate_to?: string;
  };
  
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Audit log statistics for dashboards
 */
export interface AuditLogStatistics {
  totalEntries: number;
  averageComplianceScore: number;
  actionCounts: Record<string, number>;
  personaCounts: Record<string, number>;
  
  // Enhanced statistics
  teamCounts: Record<string, number>;
  securityEventCounts: Record<string, number>;
  policyViolationCounts: Record<string, number>;
  dataSourceUsage: Record<string, number>;
  complianceScoreDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  
  trends: {
    daily_activity: { date: string; count: number; avg_score: number }[];
    weekly_violations: { week: string; count: number }[];
    monthly_compliance: { month: string; avg_score: number }[];
  };
}