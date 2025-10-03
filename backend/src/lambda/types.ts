import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Common response interface
export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// Request/Response types for artifact check
export interface ArtifactCheckRequest {
  artifactType: string;
  artifactContent?: string;
  artifactUrl?: string;
  templateId?: string;
  userId: string;
  teamId: string;
}

export interface JobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedCompletionTime?: string;
  message: string;
}

// Request/Response types for status checking
export interface CheckStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  result?: ArtifactCheckResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactCheckResult {
  complianceScore: number;
  issues: Issue[];
  recommendations: string[];
  sourceReferences: SourceReference[];
  summary: string;
}

export interface Issue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'static' | 'semantic' | 'security' | 'rules-engine';
  description: string;
  location?: string;
  remediation: string;
  ruleId?: string;
  ruleName?: string;
}

export interface SourceReference {
  sourceId: string;
  sourceType: string;
  confidenceScore: number;
  snippet: string;
  url?: string;
}

// Request/Response types for agent query
export interface QueryRequest {
  query: string;
  userId: string;
  teamId: string;
  personaId?: string;
  context?: Record<string, any>;
}

export interface AgentResponse {
  response: string;
  confidence: number;
  sources: SourceReference[];
  personaUsed: string;
  followUpQuestions?: string[];
  escalationRequired?: boolean;
  escalationReason?: string;
}

// Error response type
export interface ErrorResponse {
  errorCode: string;
  message: string;
  details?: Record<string, any>;
  retryAfter?: number;
  correlationId: string;
}

// Lambda handler types
export type LambdaHandler = (
  event: APIGatewayProxyEvent
) => Promise<APIGatewayProxyResult>;

// User context from JWT token
export interface UserContext {
  userId: string;
  teamId: string;
  role: string;
  department: string;
  clearance: string;
  permissions: string[];
}

// SQS message types
export interface ArtifactCheckMessage {
  jobId: string;
  artifactCheckRequest: ArtifactCheckRequest;
  userContext: UserContext;
  timestamp: string;
}

// Kendra search types
export interface SearchRequest {
  query: string;
  pageSize?: number;
  pageNumber?: number;
  filters?: Record<string, string[]>;
}

export interface SearchResponse {
  query: string;
  totalResults: number;
  results: SearchResult[];
  facets: SearchFacet[];
  queryId?: string;
  correlationId: string;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  excerpt: string;
  uri?: string;
  confidence: number;
  sourceType?: string;
  teamId?: string;
  department?: string;
  createdDate?: string;
  highlights: SearchHighlight[];
}

export interface SearchHighlight {
  BeginOffset: number;
  EndOffset: number;
  TopAnswer?: boolean;
}

export interface SearchFacet {
  attribute: string;
  values: SearchFacetValue[];
}

export interface SearchFacetValue {
  value: string;
  count: number;
}

export interface FeedbackRequest {
  queryId: string;
  resultId: string;
  relevance: 'RELEVANT' | 'NOT_RELEVANT';
}