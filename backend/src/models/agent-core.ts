/**
 * AgentCore Service Types and Interfaces
 * Centralized agent functionality with conversation management and persona integration
 */

export interface AgentSession {
  sessionId: string;
  userId: string;
  teamId: string;
  personaId: string;
  startTime: Date;
  lastActivity: Date;
  context: ConversationContext;
  metadata: SessionMetadata;
}

export interface ConversationContext {
  conversationId: string;
  messages: ConversationMessage[];
  currentTopic?: string;
  relatedArtifacts: string[];
  referencedPolicies: string[];
  actionItems: ActionItem[];
  summary?: string;
}

export interface ConversationBranch {
  branchId: string;
  sessionId: string;
  parentMessageId: string;
  branchName: string;
  description?: string;
  createdAt: Date;
  messages: ConversationMessage[];
}

export interface ConversationSummary {
  summaryId: string;
  sessionId: string;
  summaryType: 'session' | 'periodic' | 'topic';
  summaryText: string;
  keyTopics: string[];
  actionItems: ActionItem[];
  insights: ConversationInsights;
  createdAt: Date;
  timeRange?: {
    startTime: Date;
    endTime: Date;
  };
}

export interface ConversationInsights {
  totalMessages: number;
  userEngagement: number; // 0-1 score
  topicProgression: string[];
  sentimentTrend: ('positive' | 'neutral' | 'negative')[];
  knowledgeGaps: string[];
  recommendedActions: string[];
  learningOpportunities: string[];
}

export interface ConversationMessage {
  messageId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata: MessageMetadata;
  references?: MessageReference[];
}

export interface MessageMetadata {
  confidence?: number;
  processingTime?: number;
  sources?: string[];
  personaUsed?: string;
  complianceChecked?: boolean;
}

export interface MessageReference {
  sourceId: string;
  sourceType: 'policy' | 'artifact' | 'knowledge' | 'conversation';
  snippet: string;
  confidence: number;
  url?: string;
}

export interface ActionItem {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  dueDate?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
  location?: string;
  deviceType?: string;
  sessionQuality?: number;
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category: 'analysis' | 'generation' | 'validation' | 'search' | 'notification';
  enabled: boolean;
  configuration: Record<string, any>;
  permissions: string[];
}

export interface AgentDecision {
  decisionId: string;
  context: string;
  options: DecisionOption[];
  selectedOption: string;
  reasoning: string;
  confidence: number;
  timestamp: Date;
  complianceChecked: boolean;
}

export interface DecisionOption {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  complianceScore: number;
}

export interface AgentLearning {
  sessionId: string;
  userId: string;
  interactions: LearningInteraction[];
  patterns: LearningPattern[];
  improvements: string[];
  feedback: UserFeedback[];
}

export interface LearningInteraction {
  timestamp: Date;
  userInput: string;
  agentResponse: string;
  userSatisfaction?: number;
  correctionProvided?: string;
}

export interface LearningPattern {
  pattern: string;
  frequency: number;
  context: string;
  effectiveness: number;
  lastSeen: Date;
}

export interface UserFeedback {
  messageId: string;
  rating: number; // 1-5
  comment?: string;
  timestamp: Date;
  feedbackType: 'helpful' | 'unhelpful' | 'incorrect' | 'incomplete';
}

export interface AgentConfiguration {
  agentId: string;
  name: string;
  description: string;
  personaId: string;
  capabilities: string[];
  settings: AgentSettings;
  constraints: AgentConstraints;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSettings {
  responseStyle: 'formal' | 'casual' | 'technical' | 'adaptive';
  verbosity: 'concise' | 'detailed' | 'comprehensive';
  proactivity: 'reactive' | 'moderate' | 'proactive';
  learningEnabled: boolean;
  memoryRetention: number; // days
  maxContextLength: number;
}

export interface AgentConstraints {
  maxSessionDuration: number; // minutes
  maxConcurrentSessions: number;
  allowedActions: string[];
  restrictedTopics: string[];
  complianceRequired: boolean;
  auditLevel: 'basic' | 'detailed' | 'comprehensive';
}

export interface AgentHealth {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  lastHealthCheck: Date;
  metrics: HealthMetrics;
  issues: HealthIssue[];
}

export interface HealthMetrics {
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  activeSessions: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  resolved: boolean;
}

// Request/Response Types

export interface StartSessionRequest {
  userId: string;
  teamId: string;
  personaId?: string;
  initialMessage?: string;
  context?: Partial<ConversationContext>;
}

export interface StartSessionResponse {
  sessionId: string;
  agentConfiguration: AgentConfiguration;
  capabilities: AgentCapability[];
  welcomeMessage?: string;
}

export interface SendMessageRequest {
  sessionId: string;
  message: string;
  messageType?: 'text' | 'command' | 'file_upload';
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface SendMessageResponse {
  messageId: string;
  response: string;
  references: MessageReference[];
  actionItems: ActionItem[];
  suggestions: string[];
  confidence: number;
  processingTime: number;
}

export interface GetSessionHistoryRequest {
  sessionId: string;
  limit?: number;
  offset?: number;
  includeReferences?: boolean;
}

export interface GetSessionHistoryResponse {
  messages: ConversationMessage[];
  totalCount: number;
  hasMore: boolean;
  summary?: string;
}

export interface UpdateAgentConfigRequest {
  agentId: string;
  settings?: Partial<AgentSettings>;
  constraints?: Partial<AgentConstraints>;
  capabilities?: string[];
}

export interface UpdateAgentConfigResponse {
  agentId: string;
  configuration: AgentConfiguration;
  message: string;
}

export interface AgentAnalyticsRequest {
  agentId?: string;
  userId?: string;
  teamId?: string;
  startDate: Date;
  endDate: Date;
  metrics: string[];
}

export interface AgentAnalyticsResponse {
  totalSessions: number;
  averageSessionDuration: number;
  userSatisfactionScore: number;
  topTopics: TopicAnalytics[];
  performanceMetrics: PerformanceMetrics;
  learningInsights: LearningInsights;
}

export interface TopicAnalytics {
  topic: string;
  frequency: number;
  averageConfidence: number;
  userSatisfaction: number;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  complianceRate: number;
}

export interface LearningInsights {
  patternsIdentified: number;
  improvementsImplemented: number;
  userFeedbackScore: number;
  adaptationRate: number;
}

// Error Types

export class AgentCoreError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AgentCoreError';
  }
}

export class SessionNotFoundError extends AgentCoreError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND', 404);
  }
}

export class InvalidPersonaError extends AgentCoreError {
  constructor(personaId: string) {
    super(`Invalid persona: ${personaId}`, 'INVALID_PERSONA', 400);
  }
}

export class SessionExpiredError extends AgentCoreError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}`, 'SESSION_EXPIRED', 401);
  }
}

export class ComplianceViolationError extends AgentCoreError {
  constructor(violation: string) {
    super(`Compliance violation: ${violation}`, 'COMPLIANCE_VIOLATION', 403);
  }
}

export class RateLimitExceededError extends AgentCoreError {
  constructor(limit: number) {
    super(`Rate limit exceeded: ${limit} requests`, 'RATE_LIMIT_EXCEEDED', 429);
  }
}