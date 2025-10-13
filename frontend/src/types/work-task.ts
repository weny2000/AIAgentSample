// 工作任务相关类型定义

export interface WorkTaskContent {
  id: string;
  title: string;
  description: string;
  content: string;
  submittedBy: string;
  teamId: string;
  submittedAt: Date;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
}

export interface TaskAnalysisResult {
  taskId: string;
  keyPoints: string[];
  relatedWorkgroups: RelatedWorkgroup[];
  todoList: TodoItem[];
  knowledgeReferences: KnowledgeReference[];
  riskAssessment: RiskAssessment;
  recommendations: string[];
  estimatedEffort: EffortEstimate;
  dependencies: TaskDependency[];
  complianceChecks: ComplianceCheck[];
}

export interface RelatedWorkgroup {
  teamId: string;
  teamName: string;
  relevanceScore: number;
  reason: string;
  contactInfo?: string;
  expertise: string[];
  recommendedInvolvement: 'consultation' | 'collaboration' | 'approval' | 'notification';
}

export interface TodoItem {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedHours: number;
  assignedTo?: string;
  dueDate?: Date;
  dependencies: string[];
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  relatedWorkgroups: string[];
  deliverables?: DeliverableInfo[];
  qualityChecks?: QualityCheckInfo[];
  progressTracking?: ProgressTrackingInfo;
  completionCriteria?: CompletionCriteria[];
  deliverableRequirements?: DeliverableRequirement[];
}

export interface KnowledgeReference {
  sourceId: string;
  sourceType: 'policy' | 'documentation' | 'best_practice' | 'previous_project' | 'expertise';
  title: string;
  snippet: string;
  relevanceScore: number;
  url?: string;
  lastUpdated?: Date;
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  mitigationStrategies: string[];
  impactAnalysis: ImpactAnalysis;
}

export interface RiskFactor {
  type: 'technical' | 'resource' | 'timeline' | 'compliance' | 'security' | 'business';
  description: string;
  probability: number; // 0-1
  impact: number; // 0-1
  mitigation?: string;
}

export interface ImpactAnalysis {
  affectedSystems: string[];
  affectedTeams: string[];
  businessImpact: 'minimal' | 'moderate' | 'significant' | 'critical';
  technicalComplexity: 'low' | 'medium' | 'high' | 'very_high';
  resourceRequirements: ResourceRequirement[];
}

export interface ResourceRequirement {
  type: 'human' | 'technical' | 'financial' | 'time';
  description: string;
  quantity: number;
  unit: string;
  criticality: 'optional' | 'preferred' | 'required' | 'critical';
}

export interface EffortEstimate {
  totalHours: number;
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
  dependencyId: string;
  type: 'blocks' | 'enables' | 'influences' | 'requires';
  description: string;
  targetTask?: string;
  externalSystem?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplianceCheck {
  policyId: string;
  policyName: string;
  status: 'compliant' | 'non_compliant' | 'needs_review' | 'not_applicable';
  details: string;
  requiredActions: string[];
}

export interface WorkgroupSuggestion {
  teamId: string;
  teamName: string;
  expertise: string[];
  contactInfo?: string;
  relevantKeywords: string[];
}

export interface TaskSubmissionRequest {
  title: string;
  description: string;
  content: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
}

export interface TaskAnalysisResponse {
  success: boolean;
  data: {
    taskContent: WorkTaskContent;
    analysisResult: TaskAnalysisResult;
  };
}

export interface TaskHistoryItem {
  taskId: string;
  submittedBy: string;
  submittedAt: string;
  summary: string;
  complianceScore: number;
}

export interface TodoUpdateRequest {
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assignedTo?: string;
  dueDate?: string;
  progressNotes?: string;
  timeSpentHours?: number;
}

// ============================================================================
// Deliverable and Quality Assessment Types
// ============================================================================

export interface DeliverableInfo {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'submitted' | 'validating' | 'approved' | 'rejected' | 'needs_revision';
  submittedAt: Date;
  submittedBy: string;
  version: number;
  validationResult?: ValidationResult;
  qualityAssessment?: QualityAssessmentResult;
}

export interface QualityCheckInfo {
  id: string;
  checkType: string;
  status: 'pending' | 'in_progress' | 'passed' | 'failed';
  score?: number;
  executedAt?: Date;
  details?: string;
}

export interface ProgressTrackingInfo {
  completionPercentage: number;
  timeSpentHours: number;
  lastActivityAt: Date;
  blockingIssues: BlockingIssue[];
  statusHistory: StatusHistoryEntry[];
}

export interface BlockingIssue {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reportedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface StatusHistoryEntry {
  status: string;
  changedAt: Date;
  changedBy: string;
  notes?: string;
}

export interface CompletionCriteria {
  id: string;
  description: string;
  type: 'deliverable' | 'quality_check' | 'approval' | 'verification';
  required: boolean;
  status: 'pending' | 'met' | 'not_applicable';
  verifiedAt?: Date;
  verifiedBy?: string;
}

export interface DeliverableRequirement {
  id: string;
  name: string;
  description: string;
  fileTypeRestrictions?: string[];
  sizeLimits?: {
    minSize?: number;
    maxSize: number;
  };
  formatRequirements?: string[];
  contentRequirements?: string[];
  qualityStandards: string[];
  mandatory: boolean;
}

export interface ValidationResult {
  id: string;
  deliverableId: string;
  validatedAt: Date;
  validatedBy: string;
  overallStatus: 'passed' | 'failed' | 'warning';
  validationChecks: ValidationCheck[];
  recommendations: string[];
  nextSteps: string[];
}

export interface ValidationCheck {
  id: string;
  name: string;
  type: 'format' | 'content' | 'security' | 'compliance' | 'technical';
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  score?: number;
  details: string;
  evidence?: ValidationEvidence[];
  remediationSteps?: string[];
}

export interface ValidationEvidence {
  type: 'text' | 'image' | 'data' | 'reference';
  content: string;
  location?: string;
  severity: 'info' | 'warning' | 'error';
}

export interface QualityAssessmentResult {
  id: string;
  deliverableId: string;
  assessedAt: Date;
  assessedBy: string;
  overallScore: number; // 0-100
  qualityDimensions: QualityDimension[];
  improvementSuggestions: ImprovementSuggestion[];
  qualityGates: QualityGate[];
  benchmarkComparison?: BenchmarkComparison;
}

export interface QualityDimension {
  name: string;
  type: 'completeness' | 'accuracy' | 'consistency' | 'usability' | 'maintainability' | 'performance';
  score: number; // 0-100
  weight: number;
  criteria: QualityCriteria[];
  comments?: string;
}

export interface QualityCriteria {
  name: string;
  description: string;
  score: number;
  maxScore: number;
  evidence?: string;
  automated: boolean;
}

export interface ImprovementSuggestion {
  id: string;
  category: 'critical' | 'major' | 'minor' | 'enhancement';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  priority: number; // 1-10
  relatedCriteria: string[];
  example?: string;
}

export interface QualityGate {
  name: string;
  type: 'mandatory' | 'recommended' | 'optional';
  threshold: number;
  currentScore: number;
  status: 'passed' | 'failed' | 'warning';
  blocking: boolean;
  description: string;
}

export interface BenchmarkComparison {
  benchmarkType: 'team_average' | 'project_average' | 'industry_standard';
  benchmarkScore: number;
  percentileRank: number;
  comparisonNotes: string;
}

// ============================================================================
// Progress Tracking Types
// ============================================================================

export interface ProgressSummary {
  taskId: string;
  overallProgress: number; // 0-100
  completedTodos: number;
  totalTodos: number;
  averageQualityScore?: number;
  riskIndicators: RiskIndicator[];
  upcomingDeadlines: UpcomingDeadline[];
  recentActivity: ActivitySummary[];
}

export interface RiskIndicator {
  name: string;
  currentValue: number;
  thresholdValue: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface UpcomingDeadline {
  todoId: string;
  todoTitle: string;
  dueDate: Date;
  daysRemaining: number;
  status: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ActivitySummary {
  type: 'status_change' | 'deliverable_submitted' | 'quality_check' | 'comment_added';
  description: string;
  timestamp: Date;
  userId: string;
  relatedItemId: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface DeliverableSubmissionRequest {
  todoId: string;
  file: File;
  description?: string;
  versionNotes?: string;
}

export interface DeliverableSubmissionResponse {
  success: boolean;
  deliverableId?: string;
  validationStatus?: string;
  message?: string;
}

export interface QualityCheckRequest {
  deliverableId: string;
  checkTypes?: string[];
  qualityStandards?: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface QualityCheckResponse {
  success: boolean;
  checkId?: string;
  estimatedCompletionTime?: number;
  message?: string;
}

export interface ProgressReportRequest {
  taskId: string;
  timeRange?: {
    startDate: Date;
    endDate: Date;
  };
  includeDetails?: boolean;
}

export interface ProgressReportResponse {
  success: boolean;
  data?: {
    summary: ProgressSummary;
    detailedMetrics?: DetailedProgressMetrics;
    recommendations?: string[];
  };
}

export interface DetailedProgressMetrics {
  velocity: number;
  burnRate: number;
  efficiencyScore: number;
  qualityTrend: 'improving' | 'stable' | 'declining';
  teamPerformance: TeamPerformanceMetrics[];
}

export interface TeamPerformanceMetrics {
  teamId: string;
  teamName: string;
  completionRate: number;
  averageQualityScore: number;
  averageDeliveryTime: number;
  workload: number;
}