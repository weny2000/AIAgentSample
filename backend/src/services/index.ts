// Services exports
export { PersonaService } from './persona-service.js';
export { ImpactAnalysisService } from './impact-analysis-service.js';
export { NotificationService } from './notification-service.js';
export { AuditService } from './audit-service.js';
export { QualityAssessmentEngine } from './quality-assessment-engine.js';
export { ArtifactValidationService } from './artifact-validation-service.js';
export { WorkTaskAnalysisService } from './work-task-analysis-service.js';
export { WorkTaskAgentIntegration } from './work-task-agent-integration.js';
export { AgentCoreService } from './agent-core-service.js';
export { ConversationManagementService } from './conversation-management-service.js';

// Service types
export type {
  ImpactAnalysisResult,
  AffectedService,
  RiskAssessment,
  RiskFactor,
  Stakeholder,
  MitigationStrategy,
  VisualizationData,
  VisualizationNode,
  VisualizationEdge,
  VisualizationCluster
} from './impact-analysis-service.js';

export type {
  NotificationRequest,
  NotificationResult,
  SentNotification,
  FailedNotification,
  NotificationSummary,
  IssueCreationRequest,
  CreatedIssue
} from './notification-service.js';

export type {
  QualityStandardConfig,
  QualityDimensionConfig,
  QualityCheck,
  QualityScoringWeights,
  QualityThresholds,
  QualityAssessmentContext
} from './quality-assessment-engine.js';