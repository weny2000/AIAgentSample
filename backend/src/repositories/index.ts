// Repository exports for the AI Agent system

import { PolicyRepository } from './policy-repository.js';

import { DependencyRepository } from './dependency-repository.js';

import { ServiceRepository } from './service-repository.js';

import { AuditLogRepository } from './audit-log-repository.js';

import { ArtifactTemplateRepository } from './artifact-template-repository.js';

import { TeamRosterRepository } from './team-roster-repository.js';

import { DatabaseConnection } from '../database/connection.js';

import { PolicyRepository } from './policy-repository.js';

import { DependencyRepository } from './dependency-repository.js';

import { ServiceRepository } from './service-repository.js';

import { AuditLogRepository } from './audit-log-repository.js';

import { ArtifactTemplateRepository } from './artifact-template-repository.js';

import { TeamRosterRepository } from './team-roster-repository.js';

// DynamoDB repositories
export { BaseRepository, type RepositoryConfig } from './base-repository.js';
export { TeamRosterRepository } from './team-roster-repository.js';
export { ArtifactTemplateRepository } from './artifact-template-repository.js';
export { AuditLogRepository } from './audit-log-repository.js';

// PostgreSQL repositories
export { PostgreSqlBaseRepository } from './postgresql-base-repository.js';
export { ServiceRepository } from './service-repository.js';
export { DependencyRepository } from './dependency-repository.js';
export { PolicyRepository } from './policy-repository.js';

// Database connection
export { DatabaseConnection, getDatabase } from '../database/connection.js';

// Repository factory for dependency injection
export interface RepositoryFactory {
  // DynamoDB repositories
  teamRosterRepository: TeamRosterRepository;
  artifactTemplateRepository: ArtifactTemplateRepository;
  auditLogRepository: AuditLogRepository;
  
  // PostgreSQL repositories
  serviceRepository: ServiceRepository;
  dependencyRepository: DependencyRepository;
  policyRepository: PolicyRepository;
}

export function createRepositoryFactory(config: {
  // DynamoDB config
  region?: string;
  endpoint?: string;
  teamRosterTableName: string;
  artifactTemplatesTableName: string;
  auditLogTableName: string;
  
  // PostgreSQL config
  databaseConnection: DatabaseConnection;
}): RepositoryFactory {
  return {
    // DynamoDB repositories
    teamRosterRepository: new TeamRosterRepository({
      region: config.region,
      endpoint: config.endpoint,
      tableName: config.teamRosterTableName,
    }),
    artifactTemplateRepository: new ArtifactTemplateRepository({
      region: config.region,
      endpoint: config.endpoint,
      tableName: config.artifactTemplatesTableName,
    }),
    auditLogRepository: new AuditLogRepository({
      region: config.region,
      endpoint: config.endpoint,
      tableName: config.auditLogTableName,
    }),
    
    // PostgreSQL repositories
    serviceRepository: new ServiceRepository(config.databaseConnection),
    dependencyRepository: new DependencyRepository(config.databaseConnection),
    policyRepository: new PolicyRepository(config.databaseConnection),
  };
}