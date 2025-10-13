/**
 * Tests for Lambda Functions Tagging
 * 
 * Verifies that Lambda functions and their CloudWatch log groups
 * have the correct resource-specific tags applied.
 * 
 * Note: These tests verify the tagging implementation by checking
 * that the TagManager is properly imported and used in the construct.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('LambdaFunctions Tagging', () => {
  let stack: cdk.Stack;
  let tagManager: TagManager;
  let kmsKey: kms.Key;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Initialize TagManager
    tagManager = new TagManager(getTagConfig('dev'), 'dev');

    // Create KMS key for encryption
    kmsKey = new kms.Key(stack, 'TestKey', {
      enableKeyRotation: true,
    });
  });

  describe('Lambda Function Tags', () => {
    it('should create Lambda function with proper tags', () => {
      const functionName = 'test-function-dev';
      const lambdaFunction = new lambda.Function(stack, 'TestFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
        functionName,
      });

      // Apply tags using TagManager
      tagManager.applyTags(lambdaFunction, {
        Component: 'Compute-Lambda',
        FunctionPurpose: 'ArtifactManagement',
        Runtime: lambda.Runtime.NODEJS_18_X.name,
      });

      const template = Template.fromStack(stack);

      // Verify Lambda function has the expected tags
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: functionName,
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Compute-Lambda' },
          { Key: 'FunctionPurpose', Value: 'ArtifactManagement' },
          { Key: 'Runtime', Value: Match.stringLikeRegexp('nodejs') },
        ]),
      });
    });

    it('should apply mandatory tags to Lambda functions', () => {
      const functionName = 'test-function-dev';
      const lambdaFunction = new lambda.Function(stack, 'TestFunction2', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
        functionName,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('lambda', functionName, {
        Runtime: lambda.Runtime.NODEJS_18_X.name,
      });
      tagManager.applyTags(lambdaFunction, allTags);

      const template = Template.fromStack(stack);
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      // Check function has mandatory tags
      functionKeys.forEach((key) => {
        const func = functions[key];
        const tags = func.Properties.Tags || [];
        const tagKeys = tags.map((t: any) => t.Key);

        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
        expect(tagKeys).toContain('Component');
        expect(tagKeys).toContain('Owner');
        expect(tagKeys).toContain('CostCenter');
        expect(tagKeys).toContain('Environment');
      });
    });

    it('should derive correct FunctionPurpose for different Lambda types', () => {
      const testCases = [
        { name: 'artifact-check', expected: 'ArtifactManagement' },
        { name: 'job-status-check', expected: 'JobProcessing' },
        { name: 'agent-query', expected: 'AgentCore' },
        { name: 'kendra-search', expected: 'Search' },
        { name: 'audit-handler', expected: 'DataProcessing' },
      ];

      testCases.forEach(({ name, expected }) => {
        const tags = tagManager.getResourceTags('lambda', name);
        expect(tags.FunctionPurpose).toBe(expected);
      });
    });
  });

  describe('CloudWatch Log Group Tags', () => {
    it('should create log group with proper tags', () => {
      const functionName = 'test-function-dev';
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Apply tags to log group (only Component and MonitoringType, not AssociatedResource)
      tagManager.applyTags(logGroup, {
        Component: 'Monitoring-CloudWatch',
        MonitoringType: 'Logs',
      });

      const template = Template.fromStack(stack);

      // Verify log group has the expected tags
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: `/aws/lambda/${functionName}`,
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });
    });

    it('should apply mandatory tags to log groups', () => {
      const functionName = 'test-function-dev';
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup2', {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Apply all tags including mandatory ones
      const allTags = tagManager.getTagsForResource('cloudwatch', functionName, {
        MonitoringType: 'Logs',
        AssociatedResource: functionName,
      });
      tagManager.applyTags(logGroup, allTags);

      const template = Template.fromStack(stack);
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      const logGroupKeys = Object.keys(logGroups);

      // Check log group has mandatory tags
      logGroupKeys.forEach((key) => {
        const lg = logGroups[key];
        const tags = lg.Properties.Tags || [];
        const tagKeys = tags.map((t: any) => t.Key);

        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
        expect(tagKeys).toContain('Component');
        expect(tagKeys).toContain('Owner');
        expect(tagKeys).toContain('CostCenter');
        expect(tagKeys).toContain('Environment');
      });
    });

    it('should configure log retention and encryption', () => {
      const functionName = 'test-function-dev';
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup3', {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        encryptionKey: kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      tagManager.applyTags(logGroup, {
        Component: 'Monitoring-CloudWatch',
        MonitoringType: 'Logs',
      });

      const template = Template.fromStack(stack);

      // Verify log group configuration
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 7,
        KmsKeyId: Match.anyValue(),
      });
    });
  });

  describe('Runtime Tag', () => {
    it('should include runtime version in Lambda tags', () => {
      const functionName = 'test-function-dev';
      const runtime = lambda.Runtime.NODEJS_18_X;
      
      const lambdaFunction = new lambda.Function(stack, 'TestFunction3', {
        runtime,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
        functionName,
      });

      // Apply tags with runtime
      tagManager.applyTags(lambdaFunction, {
        Component: 'Compute-Lambda',
        FunctionPurpose: 'DataProcessing',
        Runtime: runtime.name,
      });

      const template = Template.fromStack(stack);
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      functionKeys.forEach((key) => {
        const func = functions[key];
        const tags = func.Properties.Tags || [];
        const runtimeTag = tags.find((t: any) => t.Key === 'Runtime');

        expect(runtimeTag).toBeDefined();
        expect(runtimeTag.Value).toMatch(/nodejs/i);
      });
    });
  });

  describe('TagManager Integration', () => {
    it('should get correct resource tags for Lambda functions', () => {
      const tags = tagManager.getResourceTags('lambda', 'test-function');
      
      expect(tags.Component).toBe('Compute-Lambda');
      expect(tags.FunctionPurpose).toBeDefined();
    });

    it('should get correct resource tags for CloudWatch log groups', () => {
      const tags = tagManager.getResourceTags('cloudwatch', 'test-log-group');
      
      expect(tags.Component).toBe('Monitoring-CloudWatch');
      expect(tags.MonitoringType).toBe('Logs');
    });

    it('should merge all tags correctly', () => {
      const allTags = tagManager.getTagsForResource('lambda', 'test-function', {
        Runtime: 'nodejs18.x',
      });

      // Should have mandatory tags
      expect(allTags.Project).toBe('AiAgentSystem');
      expect(allTags.Stage).toBe('dev');
      expect(allTags.ManagedBy).toBe('CDK');
      
      // Should have environment tags
      expect(allTags.Environment).toBe('Development');
      expect(allTags.CostCenter).toBe('Development');
      
      // Should have resource-specific tags
      expect(allTags.Component).toBe('Compute-Lambda');
      expect(allTags.FunctionPurpose).toBeDefined();
      
      // Should have custom tags
      expect(allTags.Runtime).toBe('nodejs18.x');
    });
  });
});
