#!/usr/bin/env node

/**
 * Data Validation and Integrity Checking Tools
 * 
 * This script provides utilities for:
 * - Data validation and integrity checking
 * - Schema validation against expected structures
 * - Referential integrity checks
 * - Data consistency validation
 * - Performance and health checks
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../lambda/utils/logger';
import { RepositoryFactory } from '../repositories';
import { PersonaConfig } from '../models/persona';
import { TeamRoster } from '../models/team-roster';
import { ArtifactTemplate } from '../models/artifact-template';
import { RuleDefinition } from '../rules-engine/types';

interface ValidationConfig {
  region: string;
  dynamoTableName: string;
  postgresSecretArn: string;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  strictMode?: boolean;
  fixIssues?: boolean;
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'schema' | 'referential' | 'consistency' | 'performance' | 'security';
  table: string;
  record_id?: string;
  field?: string;
  message: string;
  suggestion?: string;
  fixable: boolean;
}

interface ValidationResult {
  success: boolean;
  totalRecords: number;
  validRecords: number;
  issues: ValidationIssue[];
  fixedIssues: number;
  duration: number;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    by_category: Record<string, number>;
    by_table: Record<string, number>;
  };
}

export class DataValidationService {
  private logger: Logger;
  private config: ValidationConfig;
  private dynamoClient: DynamoDBClient;
  private dbConnection: DatabaseConnection;
  private repositories: RepositoryFactory;

  constructor(config: ValidationConfig) {
    this.config = config;
    this.logger = new Logger('DataValidationService');
    
    this.dynamoClient = new DynamoDBClient({ region: config.region });
    
    this.dbConnection = new DatabaseConnection({
      secretArn: config.postgresSecretArn,
      host: config.postgresHost,
      port: config.postgresPort,
      database: config.postgresDatabase
    });

    this.repositories = this.createRepositoryFactory();
  }

  private createRepositoryFactory(): RepositoryFactory {
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
   * Run comprehensive data validation
   */
  async validateAll(): Promise<ValidationResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      this.logger.info('Starting comprehensive data validation...');

      // Validate DynamoDB data
      const dynamoResults = await Promise.allSettled([
        this.validatePersonas(),
        this.validateTeamRosters(),
        this.validateArtifactTemplates(),
        this.validateRules(),
        this.validateAuditLogs()
      ]);

      // Validate PostgreSQL data
      const postgresResults = await Promise.allSettled([
        this.validateServices(),
        this.validateDependencies(),
        this.validatePolicies()
      ]);

      // Collect results
      [...dynamoResults, ...postgresResults].forEach((result, index) => {
        const tables = ['personas', 'team_rosters', 'artifact_templates', 'rules', 'audit_logs', 'services', 'dependencies', 'policies'];
        if (result.status === 'fulfilled') {
          issues.push(...result.value.issues);
          totalRecords += result.value.totalRecords;
          validRecords += result.value.validRecords;
          fixedIssues += result.value.fixedIssues;
        } else {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: tables[index],
            message: `Validation failed: ${result.reason}`,
            fixable: false
          });
        }
      });

      // Run cross-table referential integrity checks
      const referentialResults = await this.validateReferentialIntegrity();
      issues.push(...referentialResults.issues);
      fixedIssues += referentialResults.fixedIssues;

      // Generate summary
      const summary = this.generateSummary(issues);

      this.logger.info(`Validation completed: ${validRecords}/${totalRecords} valid records, ${issues.length} issues found, ${fixedIssues} issues fixed`);

      return {
        success: issues.filter(i => i.severity === 'error').length === 0,
        totalRecords,
        validRecords,
        issues,
        fixedIssues,
        duration: Date.now() - startTime,
        summary
      };

    } catch (error) {
      this.logger.error('Validation failed:', error);
      
      return {
        success: false,
        totalRecords,
        validRecords,
        issues: [{
          severity: 'error',
          category: 'schema',
          table: 'system',
          message: `Validation system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          fixable: false
        }],
        fixedIssues,
        duration: Date.now() - startTime,
        summary: this.generateSummary([])
      };
    }
  }

  /**
   * Validate personas
   */
  private async validatePersonas(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      // Get all personas
      const personas = await this.getAllDynamoItems('persona');
      totalRecords = personas.length;

      for (const item of personas) {
        const persona = item as PersonaConfig;
        let isValid = true;

        // Required field validation
        const requiredFields = ['id', 'leader_id', 'team_id', 'name', 'leadership_style', 'decision_making_approach'];
        for (const field of requiredFields) {
          if (!persona[field as keyof PersonaConfig]) {
            issues.push({
              severity: 'error',
              category: 'schema',
              table: 'personas',
              record_id: persona.id,
              field,
              message: `Missing required field: ${field}`,
              fixable: false
            });
            isValid = false;
          }
        }

        // Enum validation
        const validLeadershipStyles = Object.values(require('../models/persona').LeadershipStyle);
        if (persona.leadership_style && !validLeadershipStyles.includes(persona.leadership_style)) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'personas',
            record_id: persona.id,
            field: 'leadership_style',
            message: `Invalid leadership style: ${persona.leadership_style}`,
            suggestion: `Valid values: ${validLeadershipStyles.join(', ')}`,
            fixable: false
          });
          isValid = false;
        }

        // Business logic validation
        if (persona.escalation_criteria?.budget_threshold && persona.escalation_criteria.budget_threshold < 0) {
          issues.push({
            severity: 'warning',
            category: 'consistency',
            table: 'personas',
            record_id: persona.id,
            field: 'escalation_criteria.budget_threshold',
            message: 'Budget threshold should not be negative',
            fixable: true
          });

          if (this.config.fixIssues) {
            persona.escalation_criteria.budget_threshold = 0;
            await this.repositories.personaRepository.update(persona.id, { escalation_criteria: persona.escalation_criteria });
            fixedIssues++;
          }
        }

        // Version validation
        if (persona.version && persona.version < 1) {
          issues.push({
            severity: 'warning',
            category: 'consistency',
            table: 'personas',
            record_id: persona.id,
            field: 'version',
            message: 'Version should be >= 1',
            fixable: true
          });

          if (this.config.fixIssues) {
            await this.repositories.personaRepository.update(persona.id, { version: 1 });
            fixedIssues++;
          }
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'personas',
        message: `Failed to validate personas: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate team rosters
   */
  private async validateTeamRosters(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const teams = await this.getAllDynamoItems('team_roster');
      totalRecords = teams.length;

      for (const item of teams) {
        const team = item as TeamRoster;
        let isValid = true;

        // Required field validation
        if (!team.team_id || !team.members || !team.leader_persona_id) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'team_rosters',
            record_id: team.team_id,
            message: 'Missing required fields: team_id, members, or leader_persona_id',
            fixable: false
          });
          isValid = false;
        }

        // Members validation
        if (team.members && Array.isArray(team.members)) {
          for (let i = 0; i < team.members.length; i++) {
            const member = team.members[i];
            if (!member.user_id || !member.role || !member.contact) {
              issues.push({
                severity: 'error',
                category: 'schema',
                table: 'team_rosters',
                record_id: team.team_id,
                field: `members[${i}]`,
                message: 'Member missing required fields: user_id, role, or contact',
                fixable: false
              });
              isValid = false;
            }

            // Email validation
            if (member.contact && !this.isValidEmail(member.contact)) {
              issues.push({
                severity: 'warning',
                category: 'consistency',
                table: 'team_rosters',
                record_id: team.team_id,
                field: `members[${i}].contact`,
                message: 'Invalid email format',
                fixable: false
              });
            }
          }

          // Duplicate member check
          const userIds = team.members.map(m => m.user_id);
          const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);
          if (duplicates.length > 0) {
            issues.push({
              severity: 'error',
              category: 'consistency',
              table: 'team_rosters',
              record_id: team.team_id,
              field: 'members',
              message: `Duplicate members found: ${duplicates.join(', ')}`,
              fixable: true
            });

            if (this.config.fixIssues) {
              // Remove duplicates
              const uniqueMembers = team.members.filter((member, index) => 
                userIds.indexOf(member.user_id) === index
              );
              await this.repositories.teamRosterRepository.update({
                team_id: team.team_id,
                members: uniqueMembers
              });
              fixedIssues++;
            }
          }
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'team_rosters',
        message: `Failed to validate team rosters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate artifact templates
   */
  private async validateArtifactTemplates(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const templates = await this.getAllDynamoItems('artifact_template');
      totalRecords = templates.length;

      for (const item of templates) {
        const template = item as ArtifactTemplate;
        let isValid = true;

        // Required field validation
        if (!template.artifact_type || !template.checks || !template.threshold) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'artifact_templates',
            record_id: template.artifact_type,
            message: 'Missing required fields: artifact_type, checks, or threshold',
            fixable: false
          });
          isValid = false;
        }

        // Threshold validation
        if (template.threshold && (template.threshold < 0 || template.threshold > 100)) {
          issues.push({
            severity: 'error',
            category: 'consistency',
            table: 'artifact_templates',
            record_id: template.artifact_type,
            field: 'threshold',
            message: 'Threshold must be between 0 and 100',
            fixable: true
          });

          if (this.config.fixIssues) {
            const fixedThreshold = Math.max(0, Math.min(100, template.threshold));
            await this.repositories.artifactTemplateRepository.update({
              artifact_type: template.artifact_type,
              threshold: fixedThreshold
            });
            fixedIssues++;
          }
        }

        // Checks validation
        if (template.checks && Array.isArray(template.checks)) {
          for (let i = 0; i < template.checks.length; i++) {
            const check = template.checks[i];
            if (!check.id || !check.type || !check.severity) {
              issues.push({
                severity: 'error',
                category: 'schema',
                table: 'artifact_templates',
                record_id: template.artifact_type,
                field: `checks[${i}]`,
                message: 'Check missing required fields: id, type, or severity',
                fixable: false
              });
              isValid = false;
            }

            // Validate check type and severity
            const validTypes = ['static', 'semantic', 'security'];
            const validSeverities = ['low', 'medium', 'high', 'critical'];

            if (check.type && !validTypes.includes(check.type)) {
              issues.push({
                severity: 'error',
                category: 'schema',
                table: 'artifact_templates',
                record_id: template.artifact_type,
                field: `checks[${i}].type`,
                message: `Invalid check type: ${check.type}`,
                suggestion: `Valid values: ${validTypes.join(', ')}`,
                fixable: false
              });
              isValid = false;
            }

            if (check.severity && !validSeverities.includes(check.severity)) {
              issues.push({
                severity: 'error',
                category: 'schema',
                table: 'artifact_templates',
                record_id: template.artifact_type,
                field: `checks[${i}].severity`,
                message: `Invalid severity: ${check.severity}`,
                suggestion: `Valid values: ${validSeverities.join(', ')}`,
                fixable: false
              });
              isValid = false;
            }
          }
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'artifact_templates',
        message: `Failed to validate artifact templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate rules
   */
  private async validateRules(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const rules = await this.getAllDynamoItems('rule_definition');
      totalRecords = rules.length;

      for (const item of rules) {
        const rule = item as RuleDefinition;
        let isValid = true;

        // Required field validation
        const requiredFields = ['id', 'name', 'type', 'severity', 'enabled'];
        for (const field of requiredFields) {
          if (rule[field as keyof RuleDefinition] === undefined || rule[field as keyof RuleDefinition] === null) {
            issues.push({
              severity: 'error',
              category: 'schema',
              table: 'rules',
              record_id: rule.id,
              field,
              message: `Missing required field: ${field}`,
              fixable: false
            });
            isValid = false;
          }
        }

        // Validate type and severity
        const validTypes = ['static', 'semantic', 'security'];
        const validSeverities = ['low', 'medium', 'high', 'critical'];

        if (rule.type && !validTypes.includes(rule.type)) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'rules',
            record_id: rule.id,
            field: 'type',
            message: `Invalid rule type: ${rule.type}`,
            suggestion: `Valid values: ${validTypes.join(', ')}`,
            fixable: false
          });
          isValid = false;
        }

        if (rule.severity && !validSeverities.includes(rule.severity)) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'rules',
            record_id: rule.id,
            field: 'severity',
            message: `Invalid severity: ${rule.severity}`,
            suggestion: `Valid values: ${validSeverities.join(', ')}`,
            fixable: false
          });
          isValid = false;
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'rules',
        message: `Failed to validate rules: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate audit logs
   */
  private async validateAuditLogs(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const logs = await this.getAllDynamoItems('audit_log');
      totalRecords = logs.length;

      for (const item of logs) {
        let isValid = true;

        // Basic structure validation
        if (!item.request_id || !item.timestamp || !item.user_id) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'audit_logs',
            record_id: item.request_id || 'unknown',
            message: 'Missing required fields: request_id, timestamp, or user_id',
            fixable: false
          });
          isValid = false;
        }

        // Timestamp validation
        if (item.timestamp && !this.isValidTimestamp(item.timestamp)) {
          issues.push({
            severity: 'warning',
            category: 'consistency',
            table: 'audit_logs',
            record_id: item.request_id,
            field: 'timestamp',
            message: 'Invalid timestamp format',
            fixable: false
          });
        }

        // Compliance score validation
        if (item.compliance_score !== undefined && (item.compliance_score < 0 || item.compliance_score > 100)) {
          issues.push({
            severity: 'warning',
            category: 'consistency',
            table: 'audit_logs',
            record_id: item.request_id,
            field: 'compliance_score',
            message: 'Compliance score should be between 0 and 100',
            fixable: false
          });
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'audit_logs',
        message: `Failed to validate audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate services (PostgreSQL)
   */
  private async validateServices(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const client = await this.dbConnection.getClient();
      const result = await client.query('SELECT * FROM services');
      const services = result.rows;
      totalRecords = services.length;

      for (const service of services) {
        let isValid = true;

        // Required field validation
        if (!service.id || !service.name || !service.team_id) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'services',
            record_id: service.id || 'unknown',
            message: 'Missing required fields: id, name, or team_id',
            fixable: false
          });
          isValid = false;
        }

        // Status validation
        const validStatuses = ['active', 'deprecated', 'retired'];
        if (service.status && !validStatuses.includes(service.status)) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'services',
            record_id: service.id,
            field: 'status',
            message: `Invalid status: ${service.status}`,
            suggestion: `Valid values: ${validStatuses.join(', ')}`,
            fixable: false
          });
          isValid = false;
        }

        // URL validation
        if (service.repository_url && !this.isValidUrl(service.repository_url)) {
          issues.push({
            severity: 'warning',
            category: 'consistency',
            table: 'services',
            record_id: service.id,
            field: 'repository_url',
            message: 'Invalid repository URL format',
            fixable: false
          });
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'services',
        message: `Failed to validate services: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate dependencies (PostgreSQL)
   */
  private async validateDependencies(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const client = await this.dbConnection.getClient();
      const result = await client.query('SELECT * FROM dependencies');
      const dependencies = result.rows;
      totalRecords = dependencies.length;

      for (const dependency of dependencies) {
        let isValid = true;

        // Required field validation
        if (!dependency.id || !dependency.source_service_id || !dependency.target_service_id) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'dependencies',
            record_id: dependency.id || 'unknown',
            message: 'Missing required fields: id, source_service_id, or target_service_id',
            fixable: false
          });
          isValid = false;
        }

        // Self-dependency check
        if (dependency.source_service_id === dependency.target_service_id) {
          issues.push({
            severity: 'error',
            category: 'consistency',
            table: 'dependencies',
            record_id: dependency.id,
            message: 'Service cannot depend on itself',
            fixable: false
          });
          isValid = false;
        }

        // Criticality validation
        const validCriticalities = ['low', 'medium', 'high', 'critical'];
        if (dependency.criticality && !validCriticalities.includes(dependency.criticality)) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'dependencies',
            record_id: dependency.id,
            field: 'criticality',
            message: `Invalid criticality: ${dependency.criticality}`,
            suggestion: `Valid values: ${validCriticalities.join(', ')}`,
            fixable: false
          });
          isValid = false;
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'dependencies',
        message: `Failed to validate dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate policies (PostgreSQL)
   */
  private async validatePolicies(): Promise<{
    totalRecords: number;
    validRecords: number;
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let fixedIssues = 0;

    try {
      const client = await this.dbConnection.getClient();
      const result = await client.query('SELECT * FROM policies');
      const policies = result.rows;
      totalRecords = policies.length;

      for (const policy of policies) {
        let isValid = true;

        // Required field validation
        if (!policy.id || !policy.name || !policy.policy_json) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'policies',
            record_id: policy.id || 'unknown',
            message: 'Missing required fields: id, name, or policy_json',
            fixable: false
          });
          isValid = false;
        }

        // JSON validation
        if (policy.policy_json) {
          try {
            if (typeof policy.policy_json === 'string') {
              JSON.parse(policy.policy_json);
            }
          } catch (error) {
            issues.push({
              severity: 'error',
              category: 'schema',
              table: 'policies',
              record_id: policy.id,
              field: 'policy_json',
              message: 'Invalid JSON in policy_json field',
              fixable: false
            });
            isValid = false;
          }
        }

        // Status validation
        const validStatuses = ['draft', 'pending_approval', 'active', 'deprecated', 'archived'];
        if (policy.status && !validStatuses.includes(policy.status)) {
          issues.push({
            severity: 'error',
            category: 'schema',
            table: 'policies',
            record_id: policy.id,
            field: 'status',
            message: `Invalid status: ${policy.status}`,
            suggestion: `Valid values: ${validStatuses.join(', ')}`,
            fixable: false
          });
          isValid = false;
        }

        if (isValid) {
          validRecords++;
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'schema',
        table: 'policies',
        message: `Failed to validate policies: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { totalRecords, validRecords, issues, fixedIssues };
  }

  /**
   * Validate referential integrity across tables
   */
  private async validateReferentialIntegrity(): Promise<{
    issues: ValidationIssue[];
    fixedIssues: number;
  }> {
    const issues: ValidationIssue[] = [];
    let fixedIssues = 0;

    try {
      // Check team roster -> persona references
      const teams = await this.getAllDynamoItems('team_roster');
      const personas = await this.getAllDynamoItems('persona');
      const personaIds = new Set(personas.map(p => p.id));

      for (const team of teams) {
        if (team.leader_persona_id && !personaIds.has(team.leader_persona_id)) {
          issues.push({
            severity: 'error',
            category: 'referential',
            table: 'team_rosters',
            record_id: team.team_id,
            field: 'leader_persona_id',
            message: `Referenced persona not found: ${team.leader_persona_id}`,
            fixable: false
          });
        }
      }

      // Check service dependencies
      const client = await this.dbConnection.getClient();
      const servicesResult = await client.query('SELECT id FROM services');
      const serviceIds = new Set(servicesResult.rows.map(s => s.id));

      const dependenciesResult = await client.query('SELECT * FROM dependencies');
      for (const dependency of dependenciesResult.rows) {
        if (!serviceIds.has(dependency.source_service_id)) {
          issues.push({
            severity: 'error',
            category: 'referential',
            table: 'dependencies',
            record_id: dependency.id,
            field: 'source_service_id',
            message: `Referenced source service not found: ${dependency.source_service_id}`,
            fixable: false
          });
        }

        if (!serviceIds.has(dependency.target_service_id)) {
          issues.push({
            severity: 'error',
            category: 'referential',
            table: 'dependencies',
            record_id: dependency.id,
            field: 'target_service_id',
            message: `Referenced target service not found: ${dependency.target_service_id}`,
            fixable: false
          });
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'referential',
        table: 'system',
        message: `Failed to validate referential integrity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fixable: false
      });
    }

    return { issues, fixedIssues };
  }

  /**
   * Get all items from DynamoDB table by entity type
   */
  private async getAllDynamoItems(entityType: string): Promise<any[]> {
    const items: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: this.config.dynamoTableName,
        FilterExpression: 'entity_type = :entity_type',
        ExpressionAttributeValues: {
          ':entity_type': { S: entityType }
        },
        ExclusiveStartKey: lastEvaluatedKey
      });

      const response = await this.dynamoClient.send(command);
      
      if (response.Items) {
        const unmarshalled = response.Items.map(item => unmarshall(item));
        items.push(...unmarshalled);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  }

  /**
   * Generate validation summary
   */
  private generateSummary(issues: ValidationIssue[]): ValidationResult['summary'] {
    const summary = {
      errors: 0,
      warnings: 0,
      info: 0,
      by_category: {} as Record<string, number>,
      by_table: {} as Record<string, number>
    };

    for (const issue of issues) {
      // Count by severity
      summary[issue.severity === 'error' ? 'errors' : issue.severity === 'warning' ? 'warnings' : 'info']++;

      // Count by category
      summary.by_category[issue.category] = (summary.by_category[issue.category] || 0) + 1;

      // Count by table
      summary.by_table[issue.table] = (summary.by_table[issue.table] || 0) + 1;
    }

    return summary;
  }

  /**
   * Utility functions
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidTimestamp(timestamp: string): boolean {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
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
  const config: ValidationConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMO_TABLE_NAME || 'ai-agent-system',
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN || '',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresDatabase: process.env.POSTGRES_DATABASE || 'ai_agent_system',
    strictMode: process.env.STRICT_MODE === 'true',
    fixIssues: process.env.FIX_ISSUES === 'true'
  };

  const validationService = new DataValidationService(config);

  validationService.validateAll()
    .then(result => {
      console.log('Validation completed:', result);
      
      // Print detailed results
      if (result.issues.length > 0) {
        console.log('\nIssues found:');
        result.issues.forEach((issue, index) => {
          console.log(`${index + 1}. [${issue.severity.toUpperCase()}] ${issue.table}${issue.record_id ? ` (${issue.record_id})` : ''}${issue.field ? `.${issue.field}` : ''}: ${issue.message}`);
          if (issue.suggestion) {
            console.log(`   Suggestion: ${issue.suggestion}`);
          }
        });
      }

      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    })
    .finally(() => {
      validationService.cleanup();
    });
}