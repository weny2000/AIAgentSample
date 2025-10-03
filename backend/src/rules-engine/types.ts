export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'static' | 'semantic' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  schema: any; // JSON Schema for rule configuration
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  rule_id: string;
  rule_name: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, any>;
  source_location?: {
    file?: string;
    line?: number;
    column?: number;
  };
  suggested_fix?: string;
}

export interface ArtifactValidationRequest {
  artifact_id: string;
  artifact_type: string;
  content: string;
  file_path?: string;
  metadata?: Record<string, any>;
}

export interface ValidationReport {
  artifact_id: string;
  overall_score: number;
  max_score: number;
  passed: boolean;
  results: ValidationResult[];
  summary: {
    total_rules: number;
    passed_rules: number;
    failed_rules: number;
    critical_issues: number;
    high_issues: number;
    medium_issues: number;
    low_issues: number;
  };
  execution_time_ms: number;
  timestamp: string;
}

export interface StaticAnalysisConfig {
  eslint?: {
    enabled: boolean;
    config_path?: string;
    rules?: Record<string, any>;
  };
  cfn_lint?: {
    enabled: boolean;
    ignore_checks?: string[];
  };
  cfn_nag?: {
    enabled: boolean;
    rule_directory?: string;
  };
  snyk?: {
    enabled: boolean;
    severity_threshold?: string;
  };
}

export interface SemanticAnalysisConfig {
  llm_provider: 'bedrock' | 'openai' | 'custom';
  model_name: string;
  temperature: number;
  max_tokens: number;
  prompt_template: string;
  confidence_threshold: number;
}

export interface SeverityWeights {
  critical: number;
  high: number;
  medium: number;
  low: number;
}