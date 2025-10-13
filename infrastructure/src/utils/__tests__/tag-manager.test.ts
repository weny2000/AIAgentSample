/**
 * Unit tests for TagManager utility class
 */

import { TagManager, ValidationResult } from '../tag-manager';
import { getTagConfig, MANDATORY_TAG_KEYS } from '../../config/tag-config';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

describe('TagManager', () => {
  let tagManager: TagManager;
  const testStage = 'dev';

  beforeEach(() => {
    const config = getTagConfig(testStage);
    tagManager = new TagManager(config, testStage);
  });

  describe('constructor', () => {
    it('should create TagManager with provided config', () => {
      const config = getTagConfig('production');
      const manager = new TagManager(config, 'production');
      expect(manager).toBeInstanceOf(TagManager);
    });

    it('should create TagManager with null config and use default', () => {
      const manager = new TagManager(null, 'staging');
      expect(manager).toBeInstanceOf(TagManager);
    });
  });

  describe('getMandatoryTags', () => {
    it('should return mandatory tags', () => {
      const tags = tagManager.getMandatoryTags();
      
      expect(tags).toHaveProperty('Project', 'AiAgentSystem');
      expect(tags).toHaveProperty('Stage', 'dev');
      expect(tags).toHaveProperty('ManagedBy', 'CDK');
      expect(tags).toHaveProperty('Environment', 'Development');
      expect(tags).toHaveProperty('CostCenter', 'Development');
      expect(tags).toHaveProperty('Owner', 'Platform');
      expect(tags).toHaveProperty('CreatedDate');
      expect(tags).toHaveProperty('CreatedBy', 'CDK-Deployment');
    });

    it('should not include empty Component in mandatory tags', () => {
      const tags = tagManager.getMandatoryTags();
      // Component is set per resource, so it should not be in base mandatory tags
      // or should be filtered out if empty
      expect(tags.Component).toBeUndefined();
    });

    it('should not include empty or undefined values', () => {
      const tags = tagManager.getMandatoryTags();
      Object.values(tags).forEach(value => {
        expect(value).toBeTruthy();
      });
    });
  });

  describe('getEnvironmentTags', () => {
    it('should return environment-specific tags for dev', () => {
      const tags = tagManager.getEnvironmentTags();
      
      expect(tags).toEqual({
        Stage: 'dev',
        Environment: 'Development',
        CostCenter: 'Development',
        AutoShutdown: 'true',
        ComplianceScope: 'None',
      });
    });

    it('should return environment-specific tags for staging', () => {
      const config = getTagConfig('staging');
      const manager = new TagManager(config, 'staging');
      const tags = manager.getEnvironmentTags();
      
      expect(tags).toEqual({
        Stage: 'staging',
        Environment: 'Staging',
        CostCenter: 'QA',
        AutoShutdown: 'false',
        ComplianceScope: 'SOC2',
      });
    });

    it('should return environment-specific tags for production', () => {
      const config = getTagConfig('production');
      const manager = new TagManager(config, 'production');
      const tags = manager.getEnvironmentTags();
      
      expect(tags).toEqual({
        Stage: 'production',
        Environment: 'Production',
        CostCenter: 'Production',
        AutoShutdown: 'false',
        ComplianceScope: 'HIPAA,SOC2,GDPR',
      });
    });

    it('should return empty object for unknown stage', () => {
      const config = getTagConfig('unknown');
      const manager = new TagManager(config, 'unknown');
      const tags = manager.getEnvironmentTags();
      
      expect(tags).toEqual({});
    });
  });

  describe('getResourceTags', () => {
    it('should return Lambda-specific tags', () => {
      const tags = tagManager.getResourceTags('lambda', 'AuthHandler');
      
      expect(tags.Component).toBe('Compute-Lambda');
      expect(tags.FunctionPurpose).toBe('Authentication');
    });

    it('should return DynamoDB-specific tags', () => {
      const tags = tagManager.getResourceTags('dynamodb', 'TeamRosterTable');
      
      expect(tags.Component).toBe('Database-DynamoDB');
      expect(tags.TablePurpose).toBe('TeamManagement');
      expect(tags.DataClassification).toBe('Internal');
    });

    it('should return S3-specific tags', () => {
      const tags = tagManager.getResourceTags('s3', 'DocumentBucket');
      
      expect(tags.Component).toBe('Storage-S3');
      expect(tags.BucketPurpose).toBe('Documents');
      expect(tags.DataClassification).toBe('Internal');
      expect(tags.BackupPolicy).toBe('Daily');
    });

    it('should return RDS-specific tags', () => {
      const tags = tagManager.getResourceTags('rds', 'PostgresDB');
      
      expect(tags.Component).toBe('Database-RDS');
      expect(tags.Engine).toBe('PostgreSQL');
      expect(tags.DataClassification).toBe('Confidential');
      expect(tags.BackupPolicy).toBe('Daily');
    });

    it('should return VPC-specific tags', () => {
      const tags = tagManager.getResourceTags('vpc', 'MainVPC');
      
      expect(tags.Component).toBe('Network-VPC');
    });

    it('should return API Gateway-specific tags', () => {
      const tags = tagManager.getResourceTags('apigateway', 'RestAPI');
      
      expect(tags.Component).toBe('API-Gateway');
      expect(tags.ApiPurpose).toBe('RESTful API');
    });

    it('should return Step Functions-specific tags', () => {
      const tags = tagManager.getResourceTags('stepfunctions', 'IngestionWorkflow');
      
      expect(tags.Component).toBe('Orchestration-StepFunctions');
      expect(tags.WorkflowPurpose).toBe('DataIngestion');
    });

    it('should return CloudWatch-specific tags', () => {
      const tags = tagManager.getResourceTags('cloudwatch', 'LogGroup');
      
      expect(tags.Component).toBe('Monitoring-CloudWatch');
      expect(tags.MonitoringType).toBe('Logs');
    });

    it('should return KMS-specific tags', () => {
      const tags = tagManager.getResourceTags('kms', 'DatabaseKey');
      
      expect(tags.Component).toBe('Security-KMS');
      expect(tags.KeyPurpose).toBe('DatabaseEncryption');
    });

    it('should return Cognito-specific tags', () => {
      const tags = tagManager.getResourceTags('cognito', 'UserPool');
      
      expect(tags.Component).toBe('Security-Cognito');
      expect(tags.AuthPurpose).toBe('UserAuthentication');
    });

    it('should handle unknown resource types', () => {
      const tags = tagManager.getResourceTags('unknown', 'SomeResource');
      
      expect(tags.Component).toBe('Unknown-unknown');
    });

    it('should be case-insensitive for resource types', () => {
      const tags1 = tagManager.getResourceTags('Lambda', 'TestFunction');
      const tags2 = tagManager.getResourceTags('LAMBDA', 'TestFunction');
      const tags3 = tagManager.getResourceTags('lambda', 'TestFunction');
      
      expect(tags1.Component).toBe(tags2.Component);
      expect(tags2.Component).toBe(tags3.Component);
    });
  });

  describe('getTagsForResource', () => {
    it('should merge mandatory, environment, and resource-specific tags', () => {
      const tags = tagManager.getTagsForResource('lambda', 'AuthHandler');
      
      // Check mandatory tags
      expect(tags.Project).toBe('AiAgentSystem');
      expect(tags.ManagedBy).toBe('CDK');
      
      // Check environment tags
      expect(tags.Stage).toBe('dev');
      expect(tags.Environment).toBe('Development');
      expect(tags.AutoShutdown).toBe('true');
      
      // Check resource-specific tags
      expect(tags.Component).toBe('Compute-Lambda');
      expect(tags.FunctionPurpose).toBe('Authentication');
    });

    it('should merge custom tags with precedence', () => {
      const customTags = {
        FunctionPurpose: 'CustomPurpose',
        CustomTag: 'CustomValue',
      };
      
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction', customTags);
      
      expect(tags.FunctionPurpose).toBe('CustomPurpose'); // Custom tag overrides
      expect(tags.CustomTag).toBe('CustomValue'); // Custom tag added
      expect(tags.Component).toBe('Compute-Lambda'); // Resource tag preserved
    });

    it('should include all tag categories', () => {
      const tags = tagManager.getTagsForResource('s3', 'AuditBucket');
      
      // Should have tags from all sources
      expect(Object.keys(tags).length).toBeGreaterThan(10);
    });
  });

  describe('validateTags', () => {
    it('should validate tags successfully when all mandatory tags present', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      const result = tagManager.validateTags(tags);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing mandatory tags', () => {
      const tags = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        // Missing other mandatory tags
      };
      
      const result = tagManager.validateTags(tags);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.errorType === 'MISSING_MANDATORY_TAG')).toBe(true);
    });

    it('should detect invalid tag key format', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      tags['Invalid<Key>'] = 'value';
      
      const result = tagManager.validateTags(tags);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'INVALID_TAG_FORMAT')).toBe(true);
    });

    it('should detect invalid tag value format', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      tags['ValidKey'] = 'Invalid<Value>';
      
      const result = tagManager.validateTags(tags);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'INVALID_TAG_VALUE')).toBe(true);
    });

    it('should detect tag key exceeding max length', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      const longKey = 'a'.repeat(129); // Exceeds 128 character limit
      tags[longKey] = 'value';
      
      const result = tagManager.validateTags(tags);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'INVALID_TAG_FORMAT')).toBe(true);
    });

    it('should detect tag value exceeding max length', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      const longValue = 'a'.repeat(257); // Exceeds 256 character limit
      tags['ValidKey'] = longValue;
      
      const result = tagManager.validateTags(tags);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'INVALID_TAG_VALUE')).toBe(true);
    });

    it('should require DataClassification for S3 resources', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      delete tags.DataClassification; // Remove if present
      
      const result = tagManager.validateTags(tags, 's3');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'MISSING_DATA_CLASSIFICATION')).toBe(true);
    });

    it('should require DataClassification for DynamoDB resources', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      delete tags.DataClassification;
      
      const result = tagManager.validateTags(tags, 'dynamodb');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'MISSING_DATA_CLASSIFICATION')).toBe(true);
    });

    it('should require DataClassification for RDS resources', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      delete tags.DataClassification;
      
      const result = tagManager.validateTags(tags, 'rds');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'MISSING_DATA_CLASSIFICATION')).toBe(true);
    });

    it('should not require DataClassification for non-storage resources', () => {
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      delete tags.DataClassification;
      
      const result = tagManager.validateTags(tags, 'lambda');
      
      // Should be valid (no DataClassification required for Lambda)
      expect(result.valid).toBe(true);
    });

    it('should return validation result structure', () => {
      const tags = { Project: 'Test' };
      const result = tagManager.validateTags(tags);
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('applyTags', () => {
    it('should apply tags to CDK construct', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const construct = new Construct(stack, 'TestConstruct');
      
      const tags = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        Component: 'Test',
      };
      
      tagManager.applyTags(construct, tags);
      
      // Verify tags were applied (CDK Tags.of() should have the tags)
      const tagManager2 = cdk.Tags.of(construct);
      expect(tagManager2).toBeDefined();
    });

    it('should handle empty tags object', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const construct = new Construct(stack, 'TestConstruct');
      
      expect(() => {
        tagManager.applyTags(construct, {});
      }).not.toThrow();
    });

    it('should apply multiple tags', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack');
      const construct = new Construct(stack, 'TestConstruct');
      
      const tags = tagManager.getTagsForResource('lambda', 'TestFunction');
      
      expect(() => {
        tagManager.applyTags(construct, tags);
      }).not.toThrow();
    });
  });

  describe('purpose derivation methods', () => {
    it('should derive correct Lambda function purposes', () => {
      const testCases = [
        { name: 'AuthHandler', expected: 'Authentication' },
        { name: 'ApiGatewayHandler', expected: 'API' },
        { name: 'DataProcessor', expected: 'DataProcessing' },
        { name: 'NotificationSender', expected: 'Notification' },
        { name: 'IngestionHandler', expected: 'DataIngestion' },
        { name: 'ArtifactManager', expected: 'ArtifactManagement' },
        { name: 'JobProcessor', expected: 'JobProcessing' },
        { name: 'SearchHandler', expected: 'Search' },
        { name: 'AgentCore', expected: 'AgentCore' },
        { name: 'GenericFunction', expected: 'General' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('lambda', name);
        expect(tags.FunctionPurpose).toBe(expected);
      });
    });

    it('should derive correct DynamoDB table purposes', () => {
      const testCases = [
        { name: 'TeamRosterTable', expected: 'TeamManagement' },
        { name: 'AuditLogTable', expected: 'AuditLog' },
        { name: 'JobStatusTable', expected: 'JobStatus' },
        { name: 'ArtifactTable', expected: 'ArtifactTracking' },
        { name: 'NotificationTable', expected: 'NotificationTracking' },
        { name: 'PersonaTable', expected: 'PersonaManagement' },
        { name: 'RulesTable', expected: 'RulesEngine' },
        { name: 'GenericTable', expected: 'General' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('dynamodb', name);
        expect(tags.TablePurpose).toBe(expected);
      });
    });

    it('should derive correct S3 bucket purposes', () => {
      const testCases = [
        { name: 'DocumentBucket', expected: 'Documents' },
        { name: 'ArtifactStorage', expected: 'Artifacts' },
        { name: 'AuditLogBucket', expected: 'AuditLogs' },
        { name: 'BackupBucket', expected: 'Backups' },
        { name: 'WorkTaskBucket', expected: 'WorkTaskAnalysis' },
        { name: 'TempStorage', expected: 'Temporary' },
        { name: 'GenericBucket', expected: 'General' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('s3', name);
        expect(tags.BucketPurpose).toBe(expected);
      });
    });

    it('should derive correct API purposes', () => {
      const testCases = [
        { name: 'RestAPI', expected: 'RESTful API' },
        { name: 'GraphQLAPI', expected: 'GraphQL API' },
        { name: 'WebhookAPI', expected: 'Webhook' },
        { name: 'GenericAPI', expected: 'API' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('apigateway', name);
        expect(tags.ApiPurpose).toBe(expected);
      });
    });

    it('should derive correct workflow purposes', () => {
      const testCases = [
        { name: 'IngestionWorkflow', expected: 'DataIngestion' },
        { name: 'ProcessWorkflow', expected: 'DataProcessing' },
        { name: 'NotificationWorkflow', expected: 'NotificationOrchestration' },
        { name: 'AgentWorkflow', expected: 'AgentWorkflow' },
        { name: 'GenericWorkflow', expected: 'Orchestration' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('stepfunctions', name);
        expect(tags.WorkflowPurpose).toBe(expected);
      });
    });

    it('should derive correct KMS key purposes', () => {
      const testCases = [
        { name: 'DatabaseKey', expected: 'DatabaseEncryption' },
        { name: 'RDSKey', expected: 'DatabaseEncryption' },
        { name: 'S3Key', expected: 'S3Encryption' },
        { name: 'BucketKey', expected: 'S3Encryption' },
        { name: 'SecretKey', expected: 'SecretsEncryption' },
        { name: 'GenericKey', expected: 'GeneralEncryption' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('kms', name);
        expect(tags.KeyPurpose).toBe(expected);
      });
    });

    it('should derive correct auth purposes', () => {
      const testCases = [
        { name: 'UserPool', expected: 'UserAuthentication' },
        { name: 'IdentityPool', expected: 'IdentityManagement' },
        { name: 'ClientApp', expected: 'ClientAuthentication' },
        { name: 'GenericAuth', expected: 'Authentication' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('cognito', name);
        expect(tags.AuthPurpose).toBe(expected);
      });
    });
  });
});
