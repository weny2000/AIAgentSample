/**
 * CDK Integration Tests for AWS Resource Tagging
 * 
 * Tests that verify the tagging system works correctly by testing
 * individual components and their integration with the TagManager
 * and TaggingAspect.
 * 
 * This test suite covers:
 * - TagManager functionality
 * - TaggingAspect integration
 * - Resource-specific tag application
 * - Tag validation and compliance
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { TaggingAspect } from '../../aspects/tagging-aspect';
import { getTagConfig } from '../../config/tag-config';

describe('CDK Integration Tests - AWS Resource Tagging', () => {
  const testStages = ['dev', 'staging', 'production'];

  testStages.forEach((stage) => {
    describe(`${stage.toUpperCase()} Environment`, () => {
      let app: cdk.App;
      let stack: cdk.Stack;
      let template: Template;
      let tagManager: TagManager;

      beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, `TestStack-${stage}`, {
          env: { account: '123456789012', region: 'us-east-1' },
        });

        // Initialize TagManager
        const tagConfig = getTagConfig(stage);
        tagManager = new TagManager(tagConfig, stage);

        // Apply TaggingAspect to automatically tag all resources
        cdk.Aspects.of(stack).add(new TaggingAspect(tagManager));
      });

      describe('TagManager Functionality', () => {
        it('should provide correct mandatory tags for the environment', () => {
          const mandatoryTags = tagManager.getMandatoryTags();
          
          expect(mandatoryTags).toHaveProperty('Project', 'AiAgentSystem');
          expect(mandatoryTags).toHaveProperty('Stage', stage);
          expect(mandatoryTags).toHaveProperty('ManagedBy', 'CDK');
          expect(mandatoryTags).toHaveProperty('Owner', 'Platform');
          expect(mandatoryTags).toHaveProperty('CostCenter');
          expect(mandatoryTags).toHaveProperty('Environment');
          expect(mandatoryTags).toHaveProperty('CreatedDate');
          expect(mandatoryTags).toHaveProperty('CreatedBy', 'CDK-Deployment');
        });

        it('should provide correct environment-specific tags', () => {
          const environmentTags = tagManager.getEnvironmentTags();
          
          expect(environmentTags).toHaveProperty('Stage', stage);
          expect(environmentTags).toHaveProperty('Environment');
          expect(environmentTags).toHaveProperty('CostCenter');
          expect(environmentTags).toHaveProperty('AutoShutdown');
          expect(environmentTags).toHaveProperty('ComplianceScope');

          // Verify environment-specific values
          if (stage === 'dev') {
            expect(environmentTags.Environment).toBe('Development');
            expect(environmentTags.CostCenter).toBe('Development');
            expect(environmentTags.AutoShutdown).toBe('true');
            expect(environmentTags.ComplianceScope).toBe('None');
          } else if (stage === 'staging') {
            expect(environmentTags.Environment).toBe('Staging');
            expect(environmentTags.CostCenter).toBe('QA');
            expect(environmentTags.AutoShutdown).toBe('false');
            expect(environmentTags.ComplianceScope).toBe('SOC2');
          } else if (stage === 'production') {
            expect(environmentTags.Environment).toBe('Production');
            expect(environmentTags.CostCenter).toBe('Production');
            expect(environmentTags.AutoShutdown).toBe('false');
            expect(environmentTags.ComplianceScope).toBe('HIPAA,SOC2,GDPR');
          }
        });
      });

      describe('Resource-Specific Tags', () => {
        it('should provide correct Lambda function tags', () => {
          const testCases = [
            { name: 'artifact-check', expected: 'ArtifactManagement' },
            { name: 'agent-query', expected: 'AgentCore' },
            { name: 'kendra-search', expected: 'Search' },
            { name: 'audit-handler', expected: 'DataProcessing' },
          ];

          testCases.forEach(({ name, expected }) => {
            const tags = tagManager.getResourceTags('lambda', name);
            expect(tags.Component).toBe('Compute-Lambda');
            expect(tags.FunctionPurpose).toBe(expected);
          });
        });

        it('should provide correct DynamoDB table tags', () => {
          const testCases = [
            { name: 'team-roster', expected: 'TeamManagement' },
            { name: 'audit-log', expected: 'AuditLog' },
            { name: 'job-status', expected: 'JobProcessing' },
          ];

          testCases.forEach(({ name, expected }) => {
            const tags = tagManager.getResourceTags('dynamodb', name);
            expect(tags.Component).toBe('Database-DynamoDB');
            expect(tags.TablePurpose).toBe(expected);
          });
        });

        it('should provide correct S3 bucket tags', () => {
          const testCases = [
            { name: 'documents', expected: 'Documents' },
            { name: 'artifacts', expected: 'Artifacts' },
            { name: 'audit-logs', expected: 'AuditLogs' },
          ];

          testCases.forEach(({ name, expected }) => {
            const tags = tagManager.getResourceTags('s3', name);
            expect(tags.Component).toBe('Storage-S3');
            expect(tags.BucketPurpose).toBe(expected);
          });
        });
      });

      describe('Tag Application Integration', () => {
        it('should apply tags to Lambda functions via TaggingAspect', () => {
          // Create a Lambda function
          const testFunction = new lambda.Function(stack, 'TestFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline('exports.handler = async () => {}'),
            functionName: `test-function-${stage}`,
          });

          template = Template.fromStack(stack);

          // Verify the function has tags applied by TaggingAspect
          template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: `test-function-${stage}`,
            Tags: Match.arrayWith([
              { Key: 'Project', Value: 'AiAgentSystem' },
              { Key: 'Stage', Value: stage },
              { Key: 'ManagedBy', Value: 'CDK' },
            ]),
          });
        });

        it('should apply tags to DynamoDB tables via TaggingAspect', () => {
          // Create a DynamoDB table
          const testTable = new dynamodb.Table(stack, 'TestTable', {
            tableName: `test-table-${stage}`,
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });

          template = Template.fromStack(stack);

          // Verify the table has tags applied by TaggingAspect
          template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: `test-table-${stage}`,
            Tags: Match.arrayWith([
              { Key: 'Project', Value: 'AiAgentSystem' },
              { Key: 'Stage', Value: stage },
              { Key: 'ManagedBy', Value: 'CDK' },
            ]),
          });
        });

        it('should apply tags to S3 buckets via TaggingAspect', () => {
          // Create an S3 bucket
          const testBucket = new s3.Bucket(stack, 'TestBucket', {
            bucketName: `test-bucket-${stage}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
          });

          template = Template.fromStack(stack);

          // Verify the bucket has tags applied by TaggingAspect
          template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `test-bucket-${stage}`,
            Tags: Match.arrayWith([
              { Key: 'Project', Value: 'AiAgentSystem' },
              { Key: 'Stage', Value: stage },
              { Key: 'ManagedBy', Value: 'CDK' },
            ]),
          });
        });
      });

      describe('Manual Tag Application', () => {
        it('should apply custom tags to resources using TagManager', () => {
          // Create a Lambda function
          const testFunction = new lambda.Function(stack, 'CustomTaggedFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline('exports.handler = async () => {}'),
            functionName: `custom-function-${stage}`,
          });

          // Apply custom tags using TagManager
          tagManager.applyTags(testFunction, {
            Component: 'Compute-Lambda',
            FunctionPurpose: 'Testing',
            CustomTag: 'CustomValue',
          });

          template = Template.fromStack(stack);

          // Verify the function has both automatic and custom tags
          template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: `custom-function-${stage}`,
            Tags: Match.arrayWith([
              { Key: 'Project', Value: 'AiAgentSystem' },
              { Key: 'Stage', Value: stage },
              { Key: 'Component', Value: 'Compute-Lambda' },
              { Key: 'FunctionPurpose', Value: 'Testing' },
              { Key: 'CustomTag', Value: 'CustomValue' },
            ]),
          });
        });

        it('should apply tags to Cognito User Pool using TagManager', () => {
          // Create test Cognito User Pool
          const userPool = new cognito.UserPool(stack, 'CustomUserPool', {
            userPoolName: `custom-users-${stage}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });

          // Apply custom tags using TagManager
          tagManager.applyTags(userPool, {
            Component: 'Security-Cognito',
            AuthPurpose: 'Testing',
          });

          template = Template.fromStack(stack);

          // Verify user pool has the expected tags (Cognito uses UserPoolTags format)
          template.hasResourceProperties('AWS::Cognito::UserPool', {
            UserPoolName: `custom-users-${stage}`,
            UserPoolTags: Match.objectLike({
              Project: 'AiAgentSystem',
              Stage: stage,
              Component: 'Security-Cognito',
              AuthPurpose: 'Testing',
            }),
          });
        });
      });

      describe('Tag Validation', () => {
        it('should ensure tag values meet AWS constraints', () => {
          // Create a resource with tags to test
          const testFunction = new lambda.Function(stack, 'ValidationTestFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline('exports.handler = async () => {}'),
            functionName: `validation-test-${stage}`,
          });

          template = Template.fromStack(stack);
          const allResources = template.findResources('*');
          
          Object.keys(allResources).forEach((resourceKey) => {
            const resource = allResources[resourceKey];
            const tags = resource.Properties.Tags || resource.Properties.UserPoolTags || [];
            
            if (Array.isArray(tags)) {
              tags.forEach((tag: any) => {
                // Tag key should not exceed 128 characters
                expect(tag.Key.length).toBeLessThanOrEqual(128);
                
                // Tag value should not exceed 256 characters
                expect(tag.Value.length).toBeLessThanOrEqual(256);
                
                // Tag key and value should only contain allowed characters
                expect(tag.Key).toMatch(/^[a-zA-Z0-9\s\+\-=\._:/@]*$/);
                expect(tag.Value).toMatch(/^[a-zA-Z0-9\s\+\-=\._:/@]*$/);
              });
            } else if (typeof tags === 'object') {
              // Handle UserPoolTags format
              Object.entries(tags).forEach(([key, value]) => {
                expect(key.length).toBeLessThanOrEqual(128);
                expect((value as string).length).toBeLessThanOrEqual(256);
                expect(key).toMatch(/^[a-zA-Z0-9\s\+\-=\._:/@]*$/);
                expect(value as string).toMatch(/^[a-zA-Z0-9\s\+\-=\._:/@]*$/);
              });
            }
          });
        });

        it('should validate data classification requirements', () => {
          const dataStorageResources = ['dynamodb', 's3', 'rds'];
          
          dataStorageResources.forEach((resourceType) => {
            const tags = tagManager.getResourceTags(resourceType, 'test-resource');
            // Data storage resources should have component tags
            expect(tags.Component).toBeDefined();
            expect(tags.Component).toContain(resourceType === 'dynamodb' ? 'Database-DynamoDB' : 
                                           resourceType === 's3' ? 'Storage-S3' : 
                                           'Database-RDS');
          });
        });
      });

      describe('Complete Tag Integration', () => {
        it('should merge all tag types correctly', () => {
          const allTags = tagManager.getTagsForResource('lambda', 'test-function', {
            Runtime: 'nodejs18.x',
            CustomTag: 'CustomValue',
          });

          // Should have mandatory tags
          expect(allTags.Project).toBe('AiAgentSystem');
          expect(allTags.Stage).toBe(stage);
          expect(allTags.ManagedBy).toBe('CDK');
          expect(allTags.Owner).toBe('Platform');
          expect(allTags.CreatedBy).toBe('CDK-Deployment');
          
          // Should have environment tags
          expect(allTags.Environment).toBeDefined();
          expect(allTags.CostCenter).toBeDefined();
          expect(allTags.AutoShutdown).toBeDefined();
          expect(allTags.ComplianceScope).toBeDefined();
          
          // Should have resource-specific tags
          expect(allTags.Component).toBe('Compute-Lambda');
          expect(allTags.FunctionPurpose).toBeDefined();
          
          // Should have custom tags
          expect(allTags.Runtime).toBe('nodejs18.x');
          expect(allTags.CustomTag).toBe('CustomValue');
        });

        it('should validate cost allocation tag availability', () => {
          const costAllocationTags = [
            'Project',
            'Stage',
            'Environment',
            'Component',
            'Owner',
            'CostCenter',
          ];

          const mandatoryTags = tagManager.getMandatoryTags();
          const environmentTags = tagManager.getEnvironmentTags();
          const allTags = { ...mandatoryTags, ...environmentTags };

          costAllocationTags.forEach((tagKey) => {
            expect(allTags).toHaveProperty(tagKey);
            expect(allTags[tagKey]).toBeTruthy();
          });
        });

        it('should provide environment-specific compliance values', () => {
          const environmentTags = tagManager.getEnvironmentTags();
          
          if (stage === 'dev') {
            expect(environmentTags.ComplianceScope).toBe('None');
            expect(environmentTags.AutoShutdown).toBe('true');
          } else if (stage === 'staging') {
            expect(environmentTags.ComplianceScope).toBe('SOC2');
            expect(environmentTags.AutoShutdown).toBe('false');
          } else if (stage === 'production') {
            expect(environmentTags.ComplianceScope).toBe('HIPAA,SOC2,GDPR');
            expect(environmentTags.AutoShutdown).toBe('false');
          }
        });
      });
    });
  });

  describe('Cross-Environment Tag Consistency', () => {
    it('should maintain consistent mandatory tag schema across environments', () => {
      const environments = ['dev', 'staging', 'production'];
      const mandatoryTagKeys = ['Project', 'Stage', 'ManagedBy', 'Owner', 'CostCenter', 'Environment', 'CreatedDate', 'CreatedBy'];

      environments.forEach((env) => {
        const tagConfig = getTagConfig(env);
        const envTagManager = new TagManager(tagConfig, env);
        const mandatoryTags = envTagManager.getMandatoryTags();
        
        mandatoryTagKeys.forEach((tagKey) => {
          expect(mandatoryTags).toHaveProperty(tagKey);
          expect(mandatoryTags[tagKey]).toBeTruthy();
        });
      });
    });

    it('should provide different environment-specific values', () => {
      const environments = ['dev', 'staging', 'production'];
      const expectedValues = {
        dev: { Environment: 'Development', CostCenter: 'Development' },
        staging: { Environment: 'Staging', CostCenter: 'QA' },
        production: { Environment: 'Production', CostCenter: 'Production' },
      };

      environments.forEach((env) => {
        const tagConfig = getTagConfig(env);
        const envTagManager = new TagManager(tagConfig, env);
        const environmentTags = envTagManager.getEnvironmentTags();
        
        const expected = expectedValues[env as keyof typeof expectedValues];
        expect(environmentTags.Environment).toBe(expected.Environment);
        expect(environmentTags.CostCenter).toBe(expected.CostCenter);
      });
    });
  });
});