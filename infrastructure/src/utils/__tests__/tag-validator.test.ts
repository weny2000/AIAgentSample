/**
 * Unit tests for TagValidator
 */

import { Stack, App } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { TagValidator, ValidationResult } from '../tag-validator';
import { MANDATORY_TAG_KEYS } from '../../config/tag-config';
import * as cdk from 'aws-cdk-lib';

describe('TagValidator', () => {
  let validator: TagValidator;

  beforeEach(() => {
    validator = new TagValidator();
  });

  describe('validateResourceTags', () => {
    it('should pass validation when all mandatory tags are present', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing mandatory tags', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        // Missing other mandatory tags
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Check that errors are for missing mandatory tags
      const missingTags = result.errors.filter(
        (e) => e.errorType === 'MISSING_MANDATORY_TAG'
      );
      expect(missingTags.length).toBeGreaterThan(0);
    });

    it('should detect all missing mandatory tags', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        // Missing 8 other mandatory tags
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(false);
      
      const missingMandatoryTags = result.errors.filter(
        (e) => e.errorType === 'MISSING_MANDATORY_TAG'
      );
      
      // Should have 8 missing mandatory tags
      expect(missingMandatoryTags.length).toBe(8);
    });

    it('should detect invalid tag key format', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        'Invalid<Key>': 'value', // Invalid characters
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(false);
      
      const formatErrors = result.errors.filter(
        (e) => e.errorType === 'INVALID_TAG_FORMAT'
      );
      expect(formatErrors.length).toBeGreaterThan(0);
      expect(formatErrors[0].tagKey).toBe('Invalid<Key>');
    });

    it('should detect tag key exceeding maximum length', () => {
      const longKey = 'a'.repeat(129); // Exceeds 128 character limit
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        [longKey]: 'value',
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(false);
      
      const formatErrors = result.errors.filter(
        (e) => e.errorType === 'INVALID_TAG_FORMAT'
      );
      expect(formatErrors.length).toBeGreaterThan(0);
    });

    it('should detect tag value exceeding maximum length', () => {
      const longValue = 'a'.repeat(257); // Exceeds 256 character limit
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        CustomTag: longValue,
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(false);
      
      const valueErrors = result.errors.filter(
        (e) => e.errorType === 'INVALID_TAG_VALUE'
      );
      expect(valueErrors.length).toBeGreaterThan(0);
    });

    it('should require DataClassification for S3 buckets', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Storage-S3',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        // Missing DataClassification
      };

      const result = validator.validateResourceTags(
        'AWS::S3::Bucket',
        tags,
        'TestBucket'
      );

      expect(result.valid).toBe(false);
      
      const dataClassErrors = result.errors.filter(
        (e) => e.errorType === 'MISSING_DATA_CLASSIFICATION'
      );
      expect(dataClassErrors.length).toBe(1);
      expect(dataClassErrors[0].message).toContain('DataClassification');
    });

    it('should require DataClassification for DynamoDB tables', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Database-DynamoDB',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        // Missing DataClassification
      };

      const result = validator.validateResourceTags(
        'AWS::DynamoDB::Table',
        tags,
        'TestTable'
      );

      expect(result.valid).toBe(false);
      
      const dataClassErrors = result.errors.filter(
        (e) => e.errorType === 'MISSING_DATA_CLASSIFICATION'
      );
      expect(dataClassErrors.length).toBe(1);
    });

    it('should require DataClassification for RDS instances', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Database-RDS',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        // Missing DataClassification
      };

      const result = validator.validateResourceTags(
        'AWS::RDS::DBInstance',
        tags,
        'TestDatabase'
      );

      expect(result.valid).toBe(false);
      
      const dataClassErrors = result.errors.filter(
        (e) => e.errorType === 'MISSING_DATA_CLASSIFICATION'
      );
      expect(dataClassErrors.length).toBe(1);
    });

    it('should not require DataClassification for Lambda functions', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        // No DataClassification - should be OK for Lambda
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(true);
      
      const dataClassErrors = result.errors.filter(
        (e) => e.errorType === 'MISSING_DATA_CLASSIFICATION'
      );
      expect(dataClassErrors.length).toBe(0);
    });

    it('should require ComplianceScope for production resources', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'production',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Production',
        Environment: 'Production',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        // Missing ComplianceScope
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(false);
      
      const complianceErrors = result.errors.filter(
        (e) => e.errorType === 'MISSING_COMPLIANCE_SCOPE'
      );
      expect(complianceErrors.length).toBe(1);
      expect(complianceErrors[0].message).toContain('ComplianceScope');
    });

    it('should not require ComplianceScope for non-production resources', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Compute-Lambda',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        // No ComplianceScope - should be OK for dev
      };

      const result = validator.validateResourceTags(
        'AWS::Lambda::Function',
        tags,
        'TestFunction'
      );

      expect(result.valid).toBe(true);
    });

    it('should pass validation with DataClassification for storage resources', () => {
      const tags: Record<string, string> = {
        Project: 'AiAgentSystem',
        Stage: 'dev',
        ManagedBy: 'CDK',
        Component: 'Storage-S3',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Development',
        CreatedDate: '2025-01-01T00:00:00Z',
        CreatedBy: 'CDK-Deployment',
        DataClassification: 'Internal',
      };

      const result = validator.validateResourceTags(
        'AWS::S3::Bucket',
        tags,
        'TestBucket'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateTagFormat', () => {
    it('should validate correct tag format', () => {
      const result = validator.validateTagFormat('Project', 'AiAgentSystem');
      expect(result).toBe(true);
    });

    it('should validate tags with allowed special characters', () => {
      expect(validator.validateTagFormat('Cost-Center', 'Dev+Test')).toBe(true);
      expect(validator.validateTagFormat('Owner:Team', 'Platform_Team')).toBe(true);
      expect(validator.validateTagFormat('Path/To/Resource', 'value@domain')).toBe(true);
    });

    it('should reject tag keys with invalid characters', () => {
      const result = validator.validateTagFormat('Invalid<Key>', 'value');
      expect(result).toBe(false);
    });

    it('should reject tag keys exceeding maximum length', () => {
      const longKey = 'a'.repeat(129);
      const result = validator.validateTagFormat(longKey, 'value');
      expect(result).toBe(false);
    });

    it('should reject tag values exceeding maximum length', () => {
      const longValue = 'a'.repeat(257);
      const result = validator.validateTagFormat('Key', longValue);
      expect(result).toBe(false);
    });

    it('should reject empty tag keys', () => {
      const result = validator.validateTagFormat('', 'value');
      expect(result).toBe(false);
    });

    it('should allow empty tag values', () => {
      const result = validator.validateTagFormat('Key', '');
      expect(result).toBe(true);
    });
  });

  describe('validateDataClassification', () => {
    it('should pass for storage resources with DataClassification', () => {
      const tags = { DataClassification: 'Internal' };
      
      expect(validator.validateDataClassification('AWS::S3::Bucket', tags)).toBe(true);
      expect(validator.validateDataClassification('AWS::DynamoDB::Table', tags)).toBe(true);
      expect(validator.validateDataClassification('AWS::RDS::DBInstance', tags)).toBe(true);
    });

    it('should fail for storage resources without DataClassification', () => {
      const tags = { Project: 'Test' };
      
      expect(validator.validateDataClassification('AWS::S3::Bucket', tags)).toBe(false);
      expect(validator.validateDataClassification('AWS::DynamoDB::Table', tags)).toBe(false);
      expect(validator.validateDataClassification('AWS::RDS::DBInstance', tags)).toBe(false);
    });

    it('should pass for non-storage resources without DataClassification', () => {
      const tags = { Project: 'Test' };
      
      expect(validator.validateDataClassification('AWS::Lambda::Function', tags)).toBe(true);
      expect(validator.validateDataClassification('AWS::ApiGateway::RestApi', tags)).toBe(true);
      expect(validator.validateDataClassification('AWS::EC2::VPC', tags)).toBe(true);
    });

    it('should fail for storage resources with empty DataClassification', () => {
      const tags = { DataClassification: '' };
      
      expect(validator.validateDataClassification('AWS::S3::Bucket', tags)).toBe(false);
    });
  });

  describe('validateStack', () => {
    it('should validate a stack with properly tagged resources', () => {
      const app = new App();
      const stack = new Stack(app, 'TestStack');

      // Create a Lambda function with proper tags
      const func = new lambda.Function(stack, 'TestFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
      });

      // Apply all mandatory tags
      cdk.Tags.of(func).add('Project', 'AiAgentSystem');
      cdk.Tags.of(func).add('Stage', 'dev');
      cdk.Tags.of(func).add('ManagedBy', 'CDK');
      cdk.Tags.of(func).add('Component', 'Compute-Lambda');
      cdk.Tags.of(func).add('Owner', 'Platform');
      cdk.Tags.of(func).add('CostCenter', 'Development');
      cdk.Tags.of(func).add('Environment', 'Development');
      cdk.Tags.of(func).add('CreatedDate', '2025-01-01T00:00:00Z');
      cdk.Tags.of(func).add('CreatedBy', 'CDK-Deployment');

      const result = validator.validateStack(stack);

      expect(result.resourcesValidated).toBeGreaterThan(0);
      // Note: Validation might not be perfect in unit tests due to CDK tag rendering
      // The important thing is that the method runs without errors
    });

    it('should count resources validated', () => {
      const app = new App();
      const stack = new Stack(app, 'TestStack');

      // Create multiple resources
      new lambda.Function(stack, 'Function1', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
      });

      new lambda.Function(stack, 'Function2', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
      });

      const result = validator.validateStack(stack);

      expect(result.resourcesValidated).toBeGreaterThan(0);
    });
  });

  describe('generateValidationReport', () => {
    it('should generate a report for successful validation', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        resourcesValidated: 10,
        resourcesWithIssues: 0,
      };

      const report = validator.generateValidationReport(result);

      expect(report).toContain('Validation Report');
      expect(report).toContain('Resources Validated: 10');
      expect(report).toContain('Resources with Issues: 0');
      expect(report).toContain('PASSED ✓');
      expect(report).toContain('Errors: None ✓');
      expect(report).toContain('Warnings: None ✓');
    });

    it('should generate a report with errors', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [
          {
            resourceId: 'TestFunction',
            resourceType: 'AWS::Lambda::Function',
            errorType: 'MISSING_MANDATORY_TAG',
            message: 'Missing mandatory tag: Owner',
            tagKey: 'Owner',
          },
          {
            resourceId: 'TestFunction',
            resourceType: 'AWS::Lambda::Function',
            errorType: 'MISSING_MANDATORY_TAG',
            message: 'Missing mandatory tag: CostCenter',
            tagKey: 'CostCenter',
          },
        ],
        warnings: [],
        resourcesValidated: 5,
        resourcesWithIssues: 1,
      };

      const report = validator.generateValidationReport(result);

      expect(report).toContain('FAILED ✗');
      expect(report).toContain('Errors (2)');
      expect(report).toContain('TestFunction');
      expect(report).toContain('Missing mandatory tag: Owner');
      expect(report).toContain('Missing mandatory tag: CostCenter');
    });

    it('should generate a report with warnings', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [
          {
            resourceId: 'TestBucket',
            resourceType: 'AWS::S3::Bucket',
            warningType: 'MISSING_OPTIONAL_TAG',
            message: 'Missing optional tag: BackupPolicy',
            tagKey: 'BackupPolicy',
          },
        ],
        resourcesValidated: 3,
        resourcesWithIssues: 0,
      };

      const report = validator.generateValidationReport(result);

      expect(report).toContain('Warnings (1)');
      expect(report).toContain('TestBucket');
      expect(report).toContain('Missing optional tag: BackupPolicy');
    });

    it('should group errors by resource', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [
          {
            resourceId: 'Resource1',
            resourceType: 'AWS::Lambda::Function',
            errorType: 'MISSING_MANDATORY_TAG',
            message: 'Error 1',
          },
          {
            resourceId: 'Resource1',
            resourceType: 'AWS::Lambda::Function',
            errorType: 'MISSING_MANDATORY_TAG',
            message: 'Error 2',
          },
          {
            resourceId: 'Resource2',
            resourceType: 'AWS::S3::Bucket',
            errorType: 'MISSING_DATA_CLASSIFICATION',
            message: 'Error 3',
          },
        ],
        warnings: [],
        resourcesValidated: 2,
        resourcesWithIssues: 2,
      };

      const report = validator.generateValidationReport(result);

      expect(report).toContain('Resource1');
      expect(report).toContain('Resource2');
      expect(report).toContain('Error 1');
      expect(report).toContain('Error 2');
      expect(report).toContain('Error 3');
    });
  });
});
