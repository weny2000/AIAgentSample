// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  team_id: string;
  clearance: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface JobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message?: string;
}

export interface CheckStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  results?: ComplianceReport;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ComplianceReport {
  score: number;
  issues: Issue[];
  recommendations: string[];
  sources: Source[];
}

export interface Issue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'static' | 'semantic' | 'security';
  description: string;
  location?: string;
  suggestion?: string;
}

export interface Source {
  id: string;
  type: string;
  confidence: number;
  snippet: string;
}

// Query and Search Types
export interface QueryRequest {
  query: string;
  context?: string;
  persona?: string;
}

export interface AgentResponse {
  response: string;
  sources: Source[];
  confidence: number;
  persona: string;
}

export interface SearchRequest {
  query: string;
  filters?: Record<string, any>;
  limit?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  source: string;
  confidence: number;
  metadata: Record<string, any>;
}

// Notification Types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  autoClose?: boolean;
}

// Admin Types
export interface Persona {
  id: string;
  name: string;
  description: string;
  style: string;
  rules: string[];
  team_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  leadership_style?: 'collaborative' | 'directive' | 'coaching' | 'supportive';
  escalation_criteria?: string[];
  decision_patterns?: Record<string, any>;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  version: number;
  status: 'draft' | 'active' | 'deprecated';
  created_at: string;
  updated_at: string;
  approved_by?: string;
  approved_at?: string;
}

export interface PolicyRule {
  id: string;
  type: 'static' | 'semantic' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  config: Record<string, any>;
  enabled: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

export interface SystemSettings {
  id: string;
  category: string;
  key: string;
  value: any;
  description: string;
  updated_by: string;
  updated_at: string;
}

export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  team_id: string;
  clearance: string;
  status: 'active' | 'inactive';
  created_at: string;
  last_login?: string;
}

export interface AuditLogFilter {
  user_id?: string;
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// Re-export agent types
export * from './agent';