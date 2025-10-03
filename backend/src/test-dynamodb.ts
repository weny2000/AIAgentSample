#!/usr/bin/env node

/**
 * Test script for DynamoDB repositories
 * This script demonstrates the usage of the repository pattern
 * and validates the data models and operations.
 */

import { 
  createRepositoryFactory,
  type RepositoryFactory 
} from './repositories';
import { 
  CreateTeamRosterInput,
  CreateArtifactTemplateInput,
  CreateAuditLogInput,
  CheckDefinition 
} from './models';

// Mock configuration for testing
const mockConfig = {
  region: 'us-east-1',
  endpoint: 'http://localhost:8000', // For local DynamoDB testing
  teamRosterTableName: 'ai-agent-team-roster-dev',
  artifactTemplatesTableName: 'ai-agent-artifact-templates-dev',
  auditLogTableName: 'ai-agent-audit-log-dev',
};

async function testRepositories() {
  console.log('🧪 Testing DynamoDB Repositories...\n');

  try {
    // Create repository factory
    const repositories: RepositoryFactory = createRepositoryFactory(mockConfig);

    // Test Team Roster Repository
    console.log('📋 Testing Team Roster Repository...');
    await testTeamRosterRepository(repositories);

    // Test Artifact Template Repository
    console.log('\n📄 Testing Artifact Template Repository...');
    await testArtifactTemplateRepository(repositories);

    // Test Audit Log Repository
    console.log('\n📊 Testing Audit Log Repository...');
    await testAuditLogRepository(repositories);

    console.log('\n✅ All repository tests completed successfully!');
  } catch (error) {
    console.error('❌ Repository test failed:', error);
    process.exit(1);
  }
}

async function testTeamRosterRepository(repositories: RepositoryFactory) {
  const { teamRosterRepository } = repositories;

  // Create a test team roster
  const createInput: CreateTeamRosterInput = {
    team_id: 'team-001',
    members: [
      {
        user_id: 'user-001',
        role: 'developer',
        contact: 'user001@example.com',
        permissions: ['read', 'write'],
      },
      {
        user_id: 'user-002',
        role: 'tech-lead',
        contact: 'user002@example.com',
        permissions: ['read', 'write', 'admin'],
      },
    ],
    leader_persona_id: 'persona-001',
    policies: ['security-policy-v1', 'code-review-policy-v2'],
  };

  console.log('  Creating team roster...');
  const createdTeam = await teamRosterRepository.create(createInput);
  console.log('  ✓ Team roster created:', createdTeam.team_id);

  console.log('  Retrieving team roster...');
  const retrievedTeam = await teamRosterRepository.getByTeamId({ team_id: 'team-001' });
  console.log('  ✓ Team roster retrieved:', retrievedTeam?.team_id);

  console.log('  Updating team roster...');
  const updatedTeam = await teamRosterRepository.update({
    team_id: 'team-001',
    policies: ['security-policy-v2', 'code-review-policy-v2'],
  });
  console.log('  ✓ Team roster updated, policies count:', updatedTeam?.policies.length);

  console.log('  Checking user membership...');
  const isMember = await teamRosterRepository.isUserMemberOfTeam('team-001', 'user-001');
  console.log('  ✓ User membership check:', isMember);
}

async function testArtifactTemplateRepository(repositories: RepositoryFactory) {
  const { artifactTemplateRepository } = repositories;

  // Create test check definitions
  const checks: CheckDefinition[] = [
    {
      id: 'eslint-check',
      type: 'static',
      severity: 'medium',
      description: 'ESLint static analysis check',
      rule_config: {
        rules: ['no-unused-vars', 'no-console'],
        threshold: 0,
      },
    },
    {
      id: 'security-scan',
      type: 'security',
      severity: 'high',
      description: 'Security vulnerability scan',
      rule_config: {
        scanner: 'snyk',
        severity_threshold: 'medium',
      },
    },
  ];

  // Create a test artifact template
  const createInput: CreateArtifactTemplateInput = {
    artifact_type: 'typescript-service',
    required_sections: ['README.md', 'package.json', 'src/'],
    optional_sections: ['docs/', 'tests/'],
    checks,
    threshold: 80,
    version: 'v1.0.0',
  };

  console.log('  Creating artifact template...');
  const createdTemplate = await artifactTemplateRepository.create(createInput);
  console.log('  ✓ Artifact template created:', createdTemplate.artifact_type);

  console.log('  Retrieving artifact template...');
  const retrievedTemplate = await artifactTemplateRepository.getByArtifactType({
    artifact_type: 'typescript-service',
  });
  console.log('  ✓ Artifact template retrieved:', retrievedTemplate?.artifact_type);

  console.log('  Updating artifact template...');
  const updatedTemplate = await artifactTemplateRepository.update({
    artifact_type: 'typescript-service',
    threshold: 85,
    version: 'v1.1.0',
  });
  console.log('  ✓ Artifact template updated, threshold:', updatedTemplate?.threshold);

  console.log('  Checking template existence...');
  const exists = await artifactTemplateRepository.exists('typescript-service');
  console.log('  ✓ Template existence check:', exists);
}

async function testAuditLogRepository(repositories: RepositoryFactory) {
  const { auditLogRepository } = repositories;

  // Create a test audit log entry
  const createInput: CreateAuditLogInput = {
    request_id: 'req-001',
    user_id: 'user-001',
    persona: 'tech-lead-persona',
    action: 'artifact-check',
    references: [
      {
        source_id: 'doc-001',
        source_type: 'confluence',
        confidence_score: 0.95,
        snippet: 'Code review guidelines for TypeScript services...',
      },
      {
        source_id: 'policy-001',
        source_type: 'internal-policy',
        confidence_score: 0.88,
        snippet: 'Security requirements for API endpoints...',
      },
    ],
    result_summary: 'Artifact passed all checks with minor recommendations',
    compliance_score: 87,
  };

  console.log('  Creating audit log entry...');
  const createdLog = await auditLogRepository.create(createInput);
  console.log('  ✓ Audit log entry created:', createdLog.request_id);

  console.log('  Retrieving audit log by request ID...');
  const retrievedLogs = await auditLogRepository.getByRequestId('req-001');
  console.log('  ✓ Audit logs retrieved:', retrievedLogs.length);

  console.log('  Retrieving audit logs by user ID...');
  const userLogs = await auditLogRepository.getByUserId({
    user_id: 'user-001',
    limit: 10,
  });
  console.log('  ✓ User audit logs retrieved:', userLogs.items.length);

  console.log('  Retrieving audit logs by action...');
  const actionLogs = await auditLogRepository.getByAction('artifact-check', undefined, undefined, 10);
  console.log('  ✓ Action audit logs retrieved:', actionLogs.items.length);

  console.log('  Getting audit statistics...');
  const stats = await auditLogRepository.getStatistics();
  console.log('  ✓ Audit statistics:', {
    totalEntries: stats.totalEntries,
    averageScore: Math.round(stats.averageComplianceScore),
  });
}

// Run the tests if this file is executed directly
if (require.main === module) {
  testRepositories().catch(console.error);
}

export { testRepositories };