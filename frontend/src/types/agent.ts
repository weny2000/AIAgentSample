// Agent-specific types for AgentCore frontend integration

export interface AgentSession {
  sessionId: string;
  agentConfiguration: AgentConfiguration;
  capabilities: AgentCapability[];
  welcomeMessage?: string;
}

export interface AgentConfiguration {
  agentId: string;
  name: string;
  description: string;
  version?: string;
  personaId?: string;
  settings?: AgentSettings;
  constraints?: AgentConstraints;
}

export interface AgentSettings {
  responseStyle?: 'formal' | 'casual' | 'technical';
  verbosity?: 'concise' | 'detailed' | 'comprehensive';
  proactivity?: 'reactive' | 'moderate' | 'proactive';
  learningEnabled?: boolean;
  memoryRetention?: number; // days
  maxContextLength?: number;
}

export interface AgentConstraints {
  maxSessionDuration?: number; // minutes
  maxConcurrentSessions?: number;
  allowedActions?: string[];
  restrictedTopics?: string[];
  complianceRequired?: boolean;
  auditLevel?: 'basic' | 'detailed' | 'comprehensive';
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'analysis' | 'validation' | 'notification' | 'learning';
  enabled: boolean;
  configuration?: Record<string, any>;
  permissions?: string[];
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
  confidence?: number;
  references?: MessageReference[];
  actionItems?: ActionItem[];
  suggestions?: string[];
  processingTime?: number;
  persona?: string;
  metadata?: Record<string, any>;
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
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  dueDate?: Date;
  assignedTo?: string;
}

// WebSocket message types
export interface WebSocketMessage {
  action: 'message' | 'typing' | 'join_session' | 'leave_session' | 'ping';
  sessionId?: string;
  message?: string;
  messageType?: 'text' | 'command' | 'file_upload';
  data?: Record<string, any>;
}

export interface WebSocketResponse {
  type: 'message' | 'typing' | 'error' | 'status' | 'pong';
  sessionId?: string;
  messageId?: string;
  content?: string;
  confidence?: number;
  references?: MessageReference[];
  actionItems?: ActionItem[];
  suggestions?: string[];
  processingTime?: number;
  error?: string;
  timestamp: string;
}

// Agent analytics and insights
export interface ConversationInsights {
  sessionId: string;
  topicProgression: string[];
  userEngagement: number; // 0-1 score
  knowledgeGaps: string[];
  learningOpportunities: string[];
  satisfactionScore?: number;
  completionRate: number;
  averageResponseTime: number;
}

export interface AgentAnalytics {
  totalSessions: number;
  averageSessionDuration: number;
  userSatisfactionScore: number;
  topTopics: Array<{
    topic: string;
    frequency: number;
    averageConfidence: number;
    userSatisfaction: number;
  }>;
  performanceMetrics: {
    averageResponseTime: number;
    successRate: number;
    errorRate: number;
    complianceRate: number;
  };
  learningInsights: {
    patternsIdentified: number;
    improvementsImplemented: number;
    userFeedbackScore: number;
    adaptationRate: number;
  };
}

// Agent health and status
export interface AgentHealth {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: string;
  metrics: {
    averageResponseTime: number;
    successRate: number;
    errorRate: number;
    activeSessions: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: string;
  }>;
}

// Conversation management
export interface ConversationBranch {
  branchId: string;
  sessionId: string;
  parentMessageId: string;
  branchName: string;
  description?: string;
  createdAt: Date;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  summaryId: string;
  sessionId: string;
  summaryType: 'session' | 'periodic' | 'topic';
  summaryText: string;
  keyTopics: string[];
  actionItems: ActionItem[];
  insights: string[];
  createdAt: Date;
  messageCount: number;
  timespan: {
    start: Date;
    end: Date;
  };
}

// Agent decision making
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

// Agent learning and adaptation
export interface AgentLearning {
  learningId: string;
  sessionId: string;
  learningType: 'pattern_recognition' | 'user_preference' | 'knowledge_gap' | 'performance_improvement';
  description: string;
  confidence: number;
  evidence: string[];
  appliedAt?: Date;
  effectiveness?: number; // 0-1 score
}

// Proactive notifications
export interface ProactiveNotification {
  notificationId: string;
  sessionId: string;
  type: 'policy_update' | 'security_alert' | 'compliance_reminder' | 'knowledge_gap';
  message: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  actionRequired: boolean;
  suggestedActions?: string[];
  createdAt: Date;
  deliveredAt?: Date;
  acknowledgedAt?: Date;
}

// Agent configuration requests
export interface StartSessionRequest {
  userId: string;
  teamId: string;
  personaId?: string;
  initialMessage?: string;
  context?: Record<string, any>;
}

export interface SendMessageRequest {
  sessionId: string;
  message: string;
  messageType?: 'text' | 'command' | 'file_upload';
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
  messages: ChatMessage[];
  totalCount: number;
  hasMore: boolean;
  summary?: string;
}

// Error types
export class AgentCoreError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AgentCoreError';
  }
}

export class SessionNotFoundError extends AgentCoreError {
  constructor(sessionId: string) {
    super('SESSION_NOT_FOUND', `Session ${sessionId} not found`, 404, { sessionId });
  }
}

export class InvalidPersonaError extends AgentCoreError {
  constructor(personaId: string) {
    super('INVALID_PERSONA', `Persona ${personaId} not found or invalid`, 400, { personaId });
  }
}

export class SessionExpiredError extends AgentCoreError {
  constructor(sessionId: string) {
    super('SESSION_EXPIRED', `Session ${sessionId} has expired`, 410, { sessionId });
  }
}

export class ComplianceViolationError extends AgentCoreError {
  constructor(violation: string) {
    super('COMPLIANCE_VIOLATION', `Compliance violation: ${violation}`, 403, { violation });
  }
}