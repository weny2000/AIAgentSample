#!/usr/bin/env node

/**
 * Data Seeding and Migration Utilities
 * 
 * This script provides utilities for:
 * - Initial data population using existing repositories
 * - Data migration for schema updates
 * - Backup and restore procedures for critical data
 * - Data validation and integrity checking
 * - Seeding default rules and persona templates
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { S3Client } from '@aws-sdk/client-s3';
import { DatabaseConnection } from '../database/connection';
import { RepositoryFactory } from '../repositories';
import { Logger } from '../lambda/utils/logger';
import { PersonaConfig, LeadershipStyle, DecisionMakingApproach } from '../models/persona';
import { RuleDefinition } from '../rules-engine/types';
import { TeamRoster, TeamMember } from '../models/team-roster';
import { ArtifactTemplate, CheckDefinition } from '../models/artifact-template';
import { Policy } from '../models/postgresql';
import * as fs from 'fs';
import * as path from 'path';

interface SeedingConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  s3BucketName?: string;
  dryRun?: boolean;
  skipExisting?: boolean;
}

interface SeedingResult {
  success: boolean;
  itemsCreated: number;
  itemsSkipped: number;
  errors: string[];
  duration: number;
}

export class DataSeedingService {
  private logger: Logger;
  private repositories: RepositoryFactory;
  private config: SeedingConfig;
  private dbConnection: DatabaseConnection;

  constructor(config: SeedingConfig) {
    this.config = config;
    this.logger = new Logger('DataSeedingService');
    
    // Initialize database connection
    this.dbConnection = new DatabaseConnection({
      secretArn: config.postgresSecretArn,
      host: config.postgresHost,
      port: config.postgresPort,
      database: config.postgresDatabase
    });

    // Initialize repositories
    this.repositories = this.createRepositoryFactory();
  }

  private createRepositoryFactory(): RepositoryFactory {
    const dynamoClient = new DynamoDBClient({ region: this.config.region });
    const secretsClient = new SecretsManagerClient({ region: this.config.region });
    const s3Client = new S3Client({ region: this.config.region });

    return {
      teamRosterRepository: new (require('../repositories/team-roster-repository').TeamRosterRepository)({
        region: this.config.region,
        tableName: this.config.dynamoTableName
      }),
      artifactTemplateRepository: new (require('../repositories/artifact-template-repository').ArtifactTemplateRepository)({
        region: this.config.region,
        tableName: this.config.dynamoTableName
      }),
      personaRepository: new (require('../repositories/persona-repository').PersonaRepository)({
        region: this.config.region,
        tableName: this.config.dynamoTableName
      }),
      ruleRepository: new (require('../repositories/rule-repository').RuleRepository)({
        region: this.config.region,
        tableName: this.config.dynamoTableName
      }),
      auditLogRepository: new (require('../repositories/audit-log-repository').AuditLogRepository)({
        region: this.config.region,
        tableName: this.config.dynamoTableName
      }),
      serviceRepository: new (require('../repositories/service-repository').ServiceRepository)(this.dbConnection),
      dependencyRepository: new (require('../repositories/dependency-repository').DependencyRepository)(this.dbConnection),
      policyRepository: new (require('../repositories/policy-repository').PolicyRepository)(this.dbConnection)
    };
  }

  /**
   * Seed all default data
   */
  async seedAll(): Promise<SeedingResult> {
    const startTime = Date.now();
    let totalCreated = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    try {
      this.logger.info('Starting comprehensive data seeding...');

      // Seed in dependency order
      const results = await Promise.allSettled([
        this.seedDefaultRules(),
        this.seedArtifactTemplates(),
        this.seedDefaultPersonas(),
        this.seedSampleTeams(),
        this.seedDefaultPolicies(),
        this.seedSampleServices()
      ]);

      results.forEach((result, index) => {
        const operations = ['Rules', 'Artifact Templates', 'Personas', 'Teams', 'Policies', 'Services'];
        if (result.status === 'fulfilled') {
          totalCreated += result.value.itemsCreated;
          totalSkipped += result.value.itemsSkipped;
          this.logger.info(`${operations[index]} seeding completed: ${result.value.itemsCreated} created, ${result.value.itemsSkipped} skipped`);
        } else {
          const error = `${operations[index]} seeding failed: ${result.reason}`;
          errors.push(error);
          this.logger.error(error);
        }
      });

      const duration = Date.now() - startTime;
      this.logger.info(`Data seeding completed in ${duration}ms. Total: ${totalCreated} created, ${totalSkipped} skipped, ${errors.length} errors`);

      return {
        success: errors.length === 0,
        itemsCreated: totalCreated,
        itemsSkipped: totalSkipped,
        errors,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Data seeding failed:', errorMessage);
      
      return {
        success: false,
        itemsCreated: totalCreated,
        itemsSkipped: totalSkipped,
        errors: [errorMessage],
        duration
      };
    }
  }

  /**
   * Seed default rules for validation
   */
  async seedDefaultRules(): Promise<SeedingResult> {
    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const defaultRules: Omit<RuleDefinition, 'created_at' | 'updated_at'>[] = [
      {
        id: 'eslint-basic',
        name: 'ESLint Basic Rules',
        description: 'Basic ESLint rules for JavaScript/TypeScript code quality',
        version: '1.0.0',
        type: 'static',
        severity: 'medium',
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            rules: { type: 'object' },
            extends: { type: 'array' }
          }
        },
        config: {
          extends: ['@typescript-eslint/recommended'],
          rules: {
            'no-unused-vars': 'error',
            'no-console': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn'
          }
        }
      },
      {
        id: 'cfn-security',
        name: 'CloudFormation Security Rules',
        description: 'Security validation rules for CloudFormation templates',
        version: '1.0.0',
        type: 'security',
        severity: 'high',
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            checks: { type: 'array' }
          }
        },
        config: {
          checks: [
            'no-hardcoded-secrets',
            'encryption-at-rest',
            'secure-transport',
            'least-privilege-iam'
          ]
        }
      },
      {
        id: 'semantic-completeness',
        name: 'Semantic Completeness Check',
        description: 'LLM-powered check for document completeness and clarity',
        version: '1.0.0',
        type: 'semantic',
        severity: 'medium',
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            prompt_template: { type: 'string' },
            confidence_threshold: { type: 'number' }
          }
        },
        config: {
          model: 'claude-3-sonnet',
          prompt_template: 'Analyze this document for completeness, clarity, and adherence to best practices.',
          confidence_threshold: 0.7
        }
      },
      {
        id: 'dependency-security',
        name: 'Dependency Security Scan',
        description: 'Snyk-powered security scanning for dependencies',
        version: '1.0.0',
        type: 'security',
        severity: 'critical',
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            severity_threshold: { type: 'string' },
            ignore_dev_dependencies: { type: 'boolean' }
          }
        },
        config: {
          severity_threshold: 'medium',
          ignore_dev_dependencies: false
        }
      }
    ];

    for (const rule of defaultRules) {
      try {
        if (this.config.skipExisting) {
          const existing = await this.repositories.ruleRepository.getRuleById(rule.id);
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!this.config.dryRun) {
          await this.repositories.ruleRepository.createRule(rule);
        }
        created++;
        this.logger.info(`Created rule: ${rule.name}`);
      } catch (error) {
        const errorMessage = `Failed to create rule ${rule.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      itemsCreated: created,
      itemsSkipped: skipped,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Seed artifact templates
   */
  async seedArtifactTemplates(): Promise<SeedingResult> {
    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const defaultTemplates: ArtifactTemplate[] = [
      {
        artifact_type: 'cloudformation-template',
        name: 'CloudFormation Template',
        description: 'AWS CloudFormation infrastructure template',
        category: 'infrastructure',
        required_sections: ['AWSTemplateFormatVersion', 'Resources'],
        optional_sections: ['Parameters', 'Outputs', 'Mappings', 'Conditions'],
        checks: [
          {
            id: 'cfn-lint',
            type: 'static',
            severity: 'high',
            description: 'CloudFormation template linting',
            rule_config: { tool: 'cfn-lint' }
          },
          {
            id: 'cfn-security',
            type: 'security',
            severity: 'critical',
            description: 'CloudFormation security validation',
            rule_config: { tool: 'cfn-nag' }
          }
        ],
        threshold: 80,
        version: '1.0.0',
        tags: ['aws', 'infrastructure', 'cloudformation']
      },
      {
        artifact_type: 'typescript-code',
        name: 'TypeScript Code',
        description: 'TypeScript source code files',
        category: 'code',
        required_sections: [],
        optional_sections: ['imports', 'exports', 'types', 'functions', 'classes'],
        checks: [
          {
            id: 'eslint',
            type: 'static',
            severity: 'medium',
            description: 'TypeScript/JavaScript linting',
            rule_config: { tool: 'eslint' }
          },
          {
            id: 'type-safety',
            type: 'static',
            severity: 'high',
            description: 'TypeScript type checking',
            rule_config: { tool: 'tsc' }
          }
        ],
        threshold: 85,
        version: '1.0.0',
        tags: ['typescript', 'code', 'javascript']
      },
      {
        artifact_type: 'api-specification',
        name: 'API Specification',
        description: 'OpenAPI/Swagger API specification',
        category: 'documentation',
        required_sections: ['openapi', 'info', 'paths'],
        optional_sections: ['components', 'security', 'tags', 'servers'],
        checks: [
          {
            id: 'openapi-validation',
            type: 'static',
            severity: 'high',
            description: 'OpenAPI specification validation',
            rule_config: { tool: 'swagger-validator' }
          },
          {
            id: 'api-completeness',
            type: 'semantic',
            severity: 'medium',
            description: 'API documentation completeness check',
            rule_config: { model: 'claude-3-sonnet' }
          }
        ],
        threshold: 75,
        version: '1.0.0',
        tags: ['api', 'openapi', 'documentation']
      }
    ];

    for (const template of defaultTemplates) {
      try {
        if (this.config.skipExisting) {
          const existing = await this.repositories.artifactTemplateRepository.getByArtifactType({
            artifact_type: template.artifact_type
          });
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!this.config.dryRun) {
          await this.repositories.artifactTemplateRepository.create(template);
        }
        created++;
        this.logger.info(`Created artifact template: ${template.name}`);
      } catch (error) {
        const errorMessage = `Failed to create template ${template.artifact_type}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      itemsCreated: created,
      itemsSkipped: skipped,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Seed default personas
   */
  async seedDefaultPersonas(): Promise<SeedingResult> {
    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const defaultPersonas: Omit<PersonaConfig, 'id' | 'created_at' | 'updated_at'>[] = [
      {
        leader_id: 'tech-lead-001',
        team_id: 'engineering-team-1',
        name: 'Senior Technical Lead',
        description: 'Experienced technical leader focused on code quality and architecture',
        leadership_style: LeadershipStyle.COACHING,
        decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
        escalation_criteria: {
          budget_threshold: 10000,
          team_size_threshold: 5,
          risk_level_threshold: 'high',
          decision_types: ['architecture-changes', 'technology-adoption', 'team-restructuring'],
          keywords: ['production-outage', 'security-incident', 'compliance-violation'],
          always_escalate_to_leader: false
        },
        common_decisions: [
          {
            scenario: 'Code review approval',
            typical_response: 'Focus on maintainability, test coverage, and security. Ensure proper documentation.',
            conditions: ['tests-present', 'documentation-updated', 'security-reviewed'],
            confidence_level: 0.9
          },
          {
            scenario: 'Technology adoption',
            typical_response: 'Evaluate based on team expertise, long-term maintenance, and business value.',
            conditions: ['team-has-expertise', 'good-community-support', 'aligns-with-architecture'],
            confidence_level: 0.8
          }
        ],
        team_rules: [
          {
            rule_id: 'code-review-required',
            description: 'All code changes require peer review',
            applies_to: ['all-developers'],
            priority: 10,
            active: true
          },
          {
            rule_id: 'test-coverage-80',
            description: 'Maintain minimum 80% test coverage',
            applies_to: ['all-developers'],
            priority: 8,
            active: true
          }
        ],
        communication_preferences: {
          tone: 'friendly',
          verbosity: 'detailed',
          preferred_channels: ['slack', 'email'],
          response_time_expectations: {
            urgent: 'within 1 hour',
            normal: 'within 4 hours',
            low_priority: 'within 24 hours'
          }
        },
        version: 1,
        is_active: true
      }
    ];

    for (const persona of defaultPersonas) {
      try {
        if (this.config.skipExisting) {
          // Check if persona exists by leader_id and team_id combination
          const existing = await this.repositories.personaRepository.getByLeaderAndTeam(
            persona.leader_id,
            persona.team_id
          );
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!this.config.dryRun) {
          await this.repositories.personaRepository.create(persona);
        }
        created++;
        this.logger.info(`Created persona: ${persona.name}`);
      } catch (error) {
        const errorMessage = `Failed to create persona ${persona.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      itemsCreated: created,
      itemsSkipped: skipped,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Seed sample teams
   */
  async seedSampleTeams(): Promise<SeedingResult> {
    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const sampleTeams: TeamRoster[] = [
      {
        team_id: 'engineering-team-1',
        team_name: 'Core Engineering Team',
        department: 'Engineering',
        description: 'Core platform and infrastructure development team',
        members: [
          {
            user_id: 'user-001',
            role: 'Senior Developer',
            contact: 'dev1@company.com',
            permissions: ['code-review', 'deploy-staging', 'create-branches'],
            status: 'active'
          },
          {
            user_id: 'user-002',
            role: 'DevOps Engineer',
            contact: 'devops1@company.com',
            permissions: ['deploy-production', 'manage-infrastructure', 'access-logs'],
            status: 'active'
          }
        ],
        leader_persona_id: 'persona-001',
        policies: ['security-policy-1', 'code-quality-policy-1'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    for (const team of sampleTeams) {
      try {
        if (this.config.skipExisting) {
          const existing = await this.repositories.teamRosterRepository.getByTeamId({
            team_id: team.team_id
          });
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!this.config.dryRun) {
          await this.repositories.teamRosterRepository.create(team);
        }
        created++;
        this.logger.info(`Created team: ${team.team_name}`);
      } catch (error) {
        const errorMessage = `Failed to create team ${team.team_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      itemsCreated: created,
      itemsSkipped: skipped,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Seed default policies (PostgreSQL)
   */
  async seedDefaultPolicies(): Promise<SeedingResult> {
    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const defaultPolicies: Omit<Policy, 'id' | 'created_at' | 'updated_at'>[] = [
      {
        name: 'Security Policy v1.0',
        description: 'Baseline security requirements for all artifacts',
        policy_json: {
          rules: [
            { type: 'no-hardcoded-secrets', severity: 'critical' },
            { type: 'encryption-at-rest', severity: 'high' },
            { type: 'secure-transport', severity: 'high' }
          ]
        },
        version: 1,
        status: 'active',
        policy_type: 'security',
        severity: 'high',
        applicable_artifacts: ['cloudformation-template', 'typescript-code'],
        team_scope: ['all'],
        created_by: 'system',
        effective_from: new Date()
      }
    ];

    for (const policy of defaultPolicies) {
      try {
        if (this.config.skipExisting) {
          // Check if policy exists by name and version
          const existing = await this.repositories.policyRepository.getByNameAndVersion(
            policy.name,
            policy.version
          );
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!this.config.dryRun) {
          await this.repositories.policyRepository.create(policy);
        }
        created++;
        this.logger.info(`Created policy: ${policy.name}`);
      } catch (error) {
        const errorMessage = `Failed to create policy ${policy.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      itemsCreated: created,
      itemsSkipped: skipped,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Seed sample services (PostgreSQL)
   */
  async seedSampleServices(): Promise<SeedingResult> {
    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const sampleServices = [
      {
        name: 'api-gateway',
        team_id: 'engineering-team-1',
        repository_url: 'https://github.com/company/api-gateway',
        description: 'Main API Gateway service',
        service_type: 'api',
        status: 'active' as const,
        metadata: { language: 'typescript', framework: 'express' }
      },
      {
        name: 'user-service',
        team_id: 'engineering-team-1',
        repository_url: 'https://github.com/company/user-service',
        description: 'User management microservice',
        service_type: 'microservice',
        status: 'active' as const,
        metadata: { language: 'typescript', database: 'postgresql' }
      }
    ];

    for (const service of sampleServices) {
      try {
        if (this.config.skipExisting) {
          const existing = await this.repositories.serviceRepository.getByName(service.name);
          if (existing) {
            skipped++;
            continue;
          }
        }

        if (!this.config.dryRun) {
          await this.repositories.serviceRepository.create(service);
        }
        created++;
        this.logger.info(`Created service: ${service.name}`);
      } catch (error) {
        const errorMessage = `Failed to create service ${service.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      itemsCreated: created,
      itemsSkipped: skipped,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.dbConnection.close();
      this.logger.info('Database connection closed');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }
}

// CLI interface
if (require.main === module) {
  const config: SeedingConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    s3BucketName: process.env.S3_BUCKET_NAME,
    dryRun: process.env.DRY_RUN === 'true',
    skipExisting: process.env.SKIP_EXISTING !== 'false'
  };

  const seedingService = new DataSeedingService(config);

  seedingService.seedAll()
    .then(result => {
      console.log('Seeding completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    })
    .finally(() => {
      seedingService.cleanup();
    });
}