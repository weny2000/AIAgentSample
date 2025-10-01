# Design Document

## Overview

The AI Agent system is designed as a cloud-native, serverless application that provides intelligent assistance through leader persona simulation, cross-team impact analysis, and automated artifact verification. The system operates entirely within a private VPC environment on AWS, ensuring enterprise-grade security while integrating with existing organizational tools.

The architecture follows a microservices pattern with clear separation between data ingestion, processing, storage, and presentation layers. The frontend is a React-based SPA that communicates with serverless backend services through API Gateway, while heavy processing tasks are handled by containerized workloads.

## Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   React SPA     │────│   API Gateway    │────│   Lambda Functions  │
│   (Frontend)    │    │   (Private)      │    │   (App Logic)       │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                │                          │
                                │                          │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   IAM Identity  │    │  Step Functions  │    │   ECS Tasks         │
│   Center/SAML   │    │  (Orchestrator)  │    │   (Heavy Processing)│
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                │                          │
                                │                          │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Amazon        │    │   Amazon Q /     │    │   Private LLM       │
│   Kendra        │    │   LLM Services   │    │   (EC2/ECS)         │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                │
                                │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   S3 Storage    │    │   DynamoDB       │    │   RDS PostgreSQL    │
│   (Documents)   │    │   (Metadata)     │    │   (Policies/Graph)  │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

### Network Architecture

- **VPC Design**: All components deployed in private subnets within a dedicated VPC
- **Interface Endpoints**: VPC endpoints for S3, KMS, Kendra, Secrets Manager, ECR, and STS
- **Security Groups**: Restrictive security groups allowing only necessary traffic between components
- **NAT Gateway**: Minimal external connectivity through controlled NAT gateway for required external API calls

### Security Architecture

- **Authentication**: OIDC via IAM Identity Center or SAML integration with Azure AD/Okta
- **Authorization**: Attribute-Based Access Control (ABAC) with user attributes (department, team_id, role, clearance)
- **Encryption**: KMS customer-managed keys for all data at rest, TLS 1.3 for data in transit
- **Secrets Management**: AWS Secrets Manager with automatic rotation for external service credentials
- **Audit**: Comprehensive logging via CloudTrail, custom audit logs, and Macie for data classification

## Components and Interfaces

### Frontend Components

#### React SPA Application

- **Technology Stack**: React 18 + Vite, Tailwind CSS, TanStack Query, Zustand
- **Authentication**: OIDC client with token management and automatic refresh
- **State Management**: React Query for server state, Zustand for client state
- **Routing**: React Router with protected routes based on user permissions

#### Key UI Components

- **Dashboard**: Real-time overview of recent checks, pending issues, and agent notifications
- **Task View**: Detailed task management with policy references and impact visualization
- **Artifact Upload**: Drag-and-drop interface with template selection and validation
- **Check Report**: Interactive results display with source attribution and action buttons
- **Admin Panel**: Policy management, persona configuration, and system settings

### Backend Components

#### API Gateway Layer

```typescript
interface APIEndpoints {
  // Agent Operations
  'POST /agent/check': ArtifactCheckRequest → JobResponse
  'GET /agent/status/{jobId}': void → CheckStatusResponse
  'POST /agent/query': QueryRequest → AgentResponse

  // Knowledge Base
  'GET /kendra/search': SearchRequest → SearchResponse
  'POST /kendra/feedback': FeedbackRequest → void

  // Administration
  'POST /admin/policy': PolicyRequest → PolicyResponse
  'GET /admin/personas': void → PersonaResponse[]
  'PUT /admin/persona/{id}': PersonaUpdate → PersonaResponse

  // Integration
  'POST /jira/create': IssueRequest → IssueResponse
  'POST /slack/notify': NotificationRequest → void
}
```

#### Orchestration Layer (Step Functions)

```json
{
  "StateMachine": "ArtifactCheckWorkflow",
  "States": {
    "ReceiveRequest": "Lambda",
    "KendraQuery": "Lambda",
    "FetchArtifact": "Lambda",
    "StaticChecks": "ECS",
    "SemanticCheck": "ECS/Lambda",
    "ComposeReport": "Lambda",
    "NotifyResults": "Lambda"
  }
}
```

#### Processing Components

**Connector Services**

- Slack/Teams connector using official APIs with OAuth 2.0
- Jira connector with webhook support for real-time updates
- Confluence connector with space-level access control
- Git connector supporting GitHub/GitLab/Bitbucket with SSH key management
- S3 connector with cross-account access patterns

**Ingestion Pipeline**

- Document extraction and preprocessing (PDF, Office, images)
- PII detection and masking using Amazon Comprehend
- Metadata enrichment with team boundaries and access controls
- Content chunking and embedding generation for vector search

**Rules Engine**

- JSON Schema-based rule definitions with versioning
- Static analysis integration (ESLint, cfn-lint, cfn-nag, Snyk)
- Semantic validation using LLM-powered analysis
- Scoring algorithm with weighted severity levels

## Data Models

### DynamoDB Tables

#### team_roster

```typescript
interface TeamRoster {
  team_id: string; // Partition Key
  members: TeamMember[];
  leader_persona_id: string;
  policies: string[];
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  user_id: string;
  role: string;
  contact: string;
  permissions: string[];
}
```

#### artifact_templates

```typescript
interface ArtifactTemplate {
  artifact_type: string; // Partition Key
  required_sections: string[];
  optional_sections: string[];
  checks: CheckDefinition[];
  threshold: number;
  version: string;
}

interface CheckDefinition {
  id: string;
  type: 'static' | 'semantic' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  rule_config: Record<string, any>;
}
```

#### audit_log

```typescript
interface AuditLog {
  request_id: string; // Partition Key
  timestamp: string; // Sort Key
  user_id: string;
  persona: string;
  action: string;
  references: Reference[];
  result_summary: string;
  compliance_score: number;
}

interface Reference {
  source_id: string;
  source_type: string;
  confidence_score: number;
  snippet: string;
}
```

### RDS Schema (PostgreSQL)

#### dependency_graph

```sql
CREATE TABLE services (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  repository_url TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dependencies (
  id UUID PRIMARY KEY,
  source_service_id UUID REFERENCES services(id),
  target_service_id UUID REFERENCES services(id),
  dependency_type VARCHAR(50), -- 'api', 'database', 'queue', etc.
  criticality VARCHAR(20),     -- 'low', 'medium', 'high'
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### policy_management

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  policy_json JSONB NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### S3 Structure

```
bucket-name/
├── raw/
│   ├── slack/{team_id}/{channel_id}/{message_id}.json
│   ├── jira/{project_key}/{issue_key}.json
│   ├── confluence/{space_key}/{page_id}.json
│   └── git/{repo_id}/{commit_hash}/
├── processed/
│   ├── kendra-index/
│   └── embeddings/
└── artifacts/
    ├── uploads/{user_id}/{timestamp}/
    └── reports/{job_id}/
```

## Error Handling

### Error Classification

- **User Errors**: Invalid input, insufficient permissions, malformed requests
- **System Errors**: Service unavailability, timeout, resource exhaustion
- **Integration Errors**: External API failures, authentication issues, rate limiting
- **Data Errors**: Corruption, inconsistency, missing references

### Error Response Format

```typescript
interface ErrorResponse {
  error_code: string;
  message: string;
  details?: Record<string, any>;
  retry_after?: number;
  correlation_id: string;
}
```

### Retry Strategy

- **Exponential Backoff**: For transient failures with jitter
- **Circuit Breaker**: For external service protection
- **Dead Letter Queue**: For failed processing jobs
- **Graceful Degradation**: Fallback to cached results when possible

## Testing Strategy

### Unit Testing

- **Frontend**: Jest + React Testing Library for component testing
- **Backend**: Jest for Lambda functions, Testcontainers for integration tests
- **Coverage Target**: 80% code coverage minimum

### Integration Testing

- **API Testing**: Postman/Newman for API contract validation
- **End-to-End**: Playwright for critical user journeys
- **Performance**: Artillery for load testing API endpoints

### Security Testing

- **SAST**: SonarQube integration in CI/CD pipeline
- **DAST**: OWASP ZAP for runtime security scanning
- **Dependency Scanning**: Snyk for vulnerability detection
- **Infrastructure**: Checkov for IaC security validation

### Test Data Management

- **Synthetic Data**: Generated test datasets that mirror production patterns
- **Data Masking**: PII scrubbing for non-production environments
- **Test Isolation**: Separate test environments with clean state between runs

### Monitoring and Observability

- **Metrics**: CloudWatch custom metrics for business KPIs
- **Logging**: Structured JSON logging with correlation IDs
- **Tracing**: X-Ray for distributed request tracing
- **Alerting**: CloudWatch Alarms with SNS integration for critical issues

### Performance Requirements

- **Response Time**: Static checks ≤ 30s, LLM-powered checks ≤ 2 minutes
- **Throughput**: Support 100 concurrent users with sub-second API response
- **Availability**: 99.9% uptime SLA with automated failover
- **Scalability**: Auto-scaling based on queue depth and CPU utilization
