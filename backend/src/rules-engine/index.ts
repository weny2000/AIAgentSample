// Main exports for the rules engine module
export { RulesEngine } from './rules-engine';
export { RulesEngineService } from './rules-engine-service';
export { StaticAnalysisEngine } from './static-analysis';
export { SemanticAnalysisEngine } from './semantic-analysis';
export { ScoringAlgorithm } from './scoring-algorithm';

// Type exports
export type {
  RuleDefinition,
  ValidationResult,
  ValidationReport,
  ArtifactValidationRequest,
  StaticAnalysisConfig,
  SemanticAnalysisConfig,
  SeverityWeights
} from './types';

// Schema exports
export {
  RULE_DEFINITION_SCHEMA,
  STATIC_ANALYSIS_CONFIG_SCHEMA,
  SEMANTIC_ANALYSIS_CONFIG_SCHEMA,
  DEFAULT_RULE_TEMPLATES
} from './rule-schema';

// Default rules export
export { DEFAULT_RULES } from './default-rules';

// Constants
export {
  RULE_CATEGORIES,
  SEVERITY_LEVELS,
  ARTIFACT_TYPES
} from './default-rules';