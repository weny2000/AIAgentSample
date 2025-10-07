/**
 * TagManager Utility Class
 * 
 * Provides centralized tag management for AWS resources, including:
 * - Retrieving mandatory, environment-specific, and resource-specific tags
 * - Merging tags for specific resources
 * - Validating tag compliance
 * - Applying tags to CDK constructs
 */

import { IConstruct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import {
  TagConfig,
  getTagConfig,
  validateTagKey,
  validateTagValue,
  MANDATORY_TAG_KEYS,
} from '../config/tag-config';

/**
 * Validation result for tag validation operations
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  tagKey?: string;
  message: string;
  errorType: 'MISSING_MANDATORY_TAG' | 'INVALID_TAG_FORMAT' | 'MISSING_DATA_CLASSIFICATION' | 'INVALID_TAG_VALUE';
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  tagKey?: string;
  message: string;
  warningType: 'MISSING_OPTIONAL_TAG' | 'UNUSUAL_TAG_VALUE';
}

/**
 * TagManager class for managing AWS resource tags
 */
export class TagManager {
  private config: TagConfig;
  private stage: string;

  /**
   * Create a new TagManager instance
   * @param config Tag configuration (optional, will use default if not provided)
   * @param stage Deployment stage (dev, staging, production)
   */
  constructor(config: TagConfig | null, stage: string) {
    this.stage = stage;
    this.config = config || getTagConfig(stage);
  }

  /**
   * Get base mandatory tags that apply to all resources
   * @returns Record of mandatory tag key-value pairs
   */
  getMandatoryTags(): Record<string, string> {
    const tags: Record<string, string> = {};
    
    // Add all mandatory tags from config
    if (this.config.mandatory) {
      Object.entries(this.config.mandatory).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          tags[key] = value;
        }
      });
    }

    return tags;
  }

  /**
   * Get environment-specific tags for the current stage
   * @returns Record of environment-specific tag key-value pairs
   */
  getEnvironmentTags(): Record<string, string> {
    const envConfig = this.config.environmentSpecific[this.stage];
    
    if (!envConfig) {
      return {};
    }

    return {
      Stage: envConfig.Stage,
      Environment: envConfig.Environment,
      CostCenter: envConfig.CostCenter,
      AutoShutdown: envConfig.AutoShutdown,
      ComplianceScope: envConfig.ComplianceScope,
    };
  }

  /**
   * Get resource-specific tags based on resource type and name
   * @param resourceType Type of AWS resource (e.g., 'lambda', 's3', 'dynamodb')
   * @param resourceName Name or identifier of the resource
   * @returns Record of resource-specific tag key-value pairs
   */
  getResourceTags(resourceType: string, resourceName: string): Record<string, string> {
    const tags: Record<string, string> = {};

    // Normalize resource type to lowercase
    const normalizedType = resourceType.toLowerCase();

    // Add resource-specific tags based on type
    switch (normalizedType) {
      case 'lambda':
        tags.Component = 'Compute-Lambda';
        tags.FunctionPurpose = this.deriveFunctionPurpose(resourceName);
        break;

      case 'dynamodb':
        tags.Component = 'Database-DynamoDB';
        tags.TablePurpose = this.deriveTablePurpose(resourceName);
        tags.DataClassification = 'Internal';
        break;

      case 's3':
        tags.Component = 'Storage-S3';
        tags.BucketPurpose = this.deriveBucketPurpose(resourceName);
        tags.DataClassification = 'Internal';
        tags.BackupPolicy = 'Daily';
        break;

      case 'rds':
        tags.Component = 'Database-RDS';
        tags.Engine = 'PostgreSQL';
        tags.DataClassification = 'Confidential';
        tags.BackupPolicy = 'Daily';
        break;

      case 'vpc':
        tags.Component = 'Network-VPC';
        break;

      case 'apigateway':
        tags.Component = 'API-Gateway';
        tags.ApiPurpose = this.deriveApiPurpose(resourceName);
        break;

      case 'stepfunctions':
        tags.Component = 'Orchestration-StepFunctions';
        tags.WorkflowPurpose = this.deriveWorkflowPurpose(resourceName);
        break;

      case 'cloudwatch':
        tags.Component = 'Monitoring-CloudWatch';
        tags.MonitoringType = 'Logs';
        break;

      case 'kms':
        tags.Component = 'Security-KMS';
        tags.KeyPurpose = this.deriveKeyPurpose(resourceName);
        break;

      case 'cognito':
        tags.Component = 'Security-Cognito';
        tags.AuthPurpose = this.deriveAuthPurpose(resourceName);
        break;

      default:
        // For unknown resource types, set a generic component
        tags.Component = `Unknown-${resourceType}`;
        break;
    }

    return tags;
  }

  /**
   * Get all applicable tags for a specific resource
   * Merges mandatory, environment-specific, and resource-specific tags
   * @param resourceType Type of AWS resource
   * @param resourceName Name or identifier of the resource
   * @param customTags Optional custom tags to merge
   * @returns Complete set of tags for the resource
   */
  getTagsForResource(
    resourceType: string,
    resourceName: string,
    customTags?: Record<string, string>
  ): Record<string, string> {
    // Start with mandatory tags
    const tags = { ...this.getMandatoryTags() };

    // Merge environment-specific tags
    const envTags = this.getEnvironmentTags();
    Object.assign(tags, envTags);

    // Merge resource-specific tags
    const resourceTags = this.getResourceTags(resourceType, resourceName);
    Object.assign(tags, resourceTags);

    // Merge custom tags (these take precedence)
    if (customTags) {
      Object.assign(tags, customTags);
    }

    return tags;
  }

  /**
   * Validate tags for compliance with requirements
   * @param tags Tags to validate
   * @param resourceType Optional resource type for additional validation
   * @returns Validation result with errors and warnings
   */
  validateTags(tags: Record<string, string>, resourceType?: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for mandatory tags
    MANDATORY_TAG_KEYS.forEach((key) => {
      if (!tags[key] || tags[key] === '') {
        errors.push({
          tagKey: key,
          message: `Missing mandatory tag: ${key}`,
          errorType: 'MISSING_MANDATORY_TAG',
        });
      }
    });

    // Validate tag key and value formats
    Object.entries(tags).forEach(([key, value]) => {
      const keyValidation = validateTagKey(key);
      if (!keyValidation.valid) {
        errors.push({
          tagKey: key,
          message: keyValidation.error || 'Invalid tag key format',
          errorType: 'INVALID_TAG_FORMAT',
        });
      }

      const valueValidation = validateTagValue(value);
      if (!valueValidation.valid) {
        errors.push({
          tagKey: key,
          message: valueValidation.error || 'Invalid tag value format',
          errorType: 'INVALID_TAG_VALUE',
        });
      }
    });

    // Check for DataClassification on data storage resources
    if (resourceType && this.isDataStorageResource(resourceType)) {
      if (!tags.DataClassification) {
        errors.push({
          tagKey: 'DataClassification',
          message: 'Data storage resource missing DataClassification tag',
          errorType: 'MISSING_DATA_CLASSIFICATION',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Apply tags to a CDK construct
   * @param construct CDK construct to tag
   * @param tags Tags to apply
   */
  applyTags(construct: IConstruct, tags: Record<string, string>): void {
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(construct).add(key, value);
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Derive function purpose from Lambda function name
   */
  private deriveFunctionPurpose(functionName: string): string {
    const name = functionName.toLowerCase();
    
    if (name.includes('auth')) return 'Authentication';
    if (name.includes('api')) return 'API';
    if (name.includes('ingestion')) return 'DataIngestion';
    if (name.includes('notification')) return 'Notification';
    if (name.includes('artifact')) return 'ArtifactManagement';
    if (name.includes('job')) return 'JobProcessing';
    if (name.includes('search')) return 'Search';
    if (name.includes('agent')) return 'AgentCore';
    if (name.includes('process') || name.includes('handler')) return 'DataProcessing';
    
    return 'General';
  }

  /**
   * Derive table purpose from DynamoDB table name
   */
  private deriveTablePurpose(tableName: string): string {
    const name = tableName.toLowerCase();
    
    if (name.includes('roster') || name.includes('team')) return 'TeamManagement';
    if (name.includes('audit')) return 'AuditLog';
    if (name.includes('job')) return 'JobStatus';
    if (name.includes('artifact')) return 'ArtifactTracking';
    if (name.includes('notification')) return 'NotificationTracking';
    if (name.includes('persona')) return 'PersonaManagement';
    if (name.includes('rule')) return 'RulesEngine';
    
    return 'General';
  }

  /**
   * Derive bucket purpose from S3 bucket name
   */
  private deriveBucketPurpose(bucketName: string): string {
    const name = bucketName.toLowerCase();
    
    if (name.includes('document')) return 'Documents';
    if (name.includes('artifact')) return 'Artifacts';
    if (name.includes('audit')) return 'AuditLogs';
    if (name.includes('backup')) return 'Backups';
    if (name.includes('work') || name.includes('task')) return 'WorkTaskAnalysis';
    if (name.includes('temp')) return 'Temporary';
    
    return 'General';
  }

  /**
   * Derive API purpose from API Gateway name
   */
  private deriveApiPurpose(apiName: string): string {
    const name = apiName.toLowerCase();
    
    if (name.includes('rest')) return 'RESTful API';
    if (name.includes('graphql')) return 'GraphQL API';
    if (name.includes('webhook')) return 'Webhook';
    
    return 'API';
  }

  /**
   * Derive workflow purpose from Step Functions name
   */
  private deriveWorkflowPurpose(workflowName: string): string {
    const name = workflowName.toLowerCase();
    
    if (name.includes('ingestion')) return 'DataIngestion';
    if (name.includes('process')) return 'DataProcessing';
    if (name.includes('notification')) return 'NotificationOrchestration';
    if (name.includes('agent')) return 'AgentWorkflow';
    
    return 'Orchestration';
  }

  /**
   * Derive key purpose from KMS key name
   */
  private deriveKeyPurpose(keyName: string): string {
    const name = keyName.toLowerCase();
    
    if (name.includes('database') || name.includes('rds')) return 'DatabaseEncryption';
    if (name.includes('s3') || name.includes('bucket')) return 'S3Encryption';
    if (name.includes('secret')) return 'SecretsEncryption';
    
    return 'GeneralEncryption';
  }

  /**
   * Derive auth purpose from Cognito resource name
   */
  private deriveAuthPurpose(authName: string): string {
    const name = authName.toLowerCase();
    
    if (name.includes('user') && name.includes('pool')) return 'UserAuthentication';
    if (name.includes('identity')) return 'IdentityManagement';
    if (name.includes('client')) return 'ClientAuthentication';
    
    return 'Authentication';
  }

  /**
   * Check if resource type is a data storage resource
   */
  private isDataStorageResource(resourceType: string): boolean {
    const normalizedType = resourceType.toLowerCase();
    return (
      normalizedType === 's3' ||
      normalizedType === 'dynamodb' ||
      normalizedType === 'rds' ||
      normalizedType.includes('database') ||
      normalizedType.includes('storage')
    );
  }
}
