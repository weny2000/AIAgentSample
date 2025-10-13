/**
 * Tests for API Gateway Tagging
 * 
 * Verifies that API Gateway resources and their CloudWatch log groups
 * have the correct resource-specific tags applied.
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('ApiGateway Tagging', () => {
  let stack: cdk.Stack;
  let tagManager: TagManager;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Initialize TagManager
    tagManager = new TagManager(getTagConfig('dev'), 'dev');
  });

  describe('API Gateway Tags', () => {
    it('should create API Gateway with proper tags', () => {
      const restApi = new apigateway.RestApi(stack, 'TestApi', {
        restApiName: 'test-api-dev',
        description: 'Test API',
      });

      // Add a mock method to satisfy API Gateway validation
      const mockIntegration = new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      });
      restApi.root.addMethod('GET', mockIntegration, {
        methodResponses: [{ statusCode: '200' }],
      });

      // Apply tags using TagManager
      tagManager.applyTags(restApi, {
        ...tagManager.getResourceTags('apigateway', 'TestApi'),
        ApiPurpose: 'Test API',
      });

      const template = Template.fromStack(stack);

      // Verify API Gateway has the expected tags
      const apis = template.findResources('AWS::ApiGateway::RestApi');
      const apiKeys = Object.keys(apis);
      
      expect(apiKeys.length).toBeGreaterThan(0);
      
      const api = apis[apiKeys[0]];
      const tags = api.Properties.Tags || [];
      const tagMap = tags.reduce((acc: any, tag: any) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {});

      expect(tagMap['Component']).toBe('API-Gateway');
      expect(tagMap['ApiPurpose']).toBe('Test API');
    });

    it('should apply mandatory tags to API Gateway', () => {
      const restApi = new apigateway.RestApi(stack, 'TestApi2', {
        restApiName: 'test-api-2-dev',
        description: 'Test API 2',
      });

      // Add a mock method to satisfy API Gateway validation
      const mockIntegration = new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      });
      restApi.root.addMethod('GET', mockIntegration, {
        methodResponses: [{ statusCode: '200' }],
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('apigateway', 'TestApi2', {
        ApiPurpose: 'Test API 2',
      });
      tagManager.applyTags(restApi, allTags);

      const template = Template.fromStack(stack);
      const apis = template.findResources('AWS::ApiGateway::RestApi');
      const apiKeys = Object.keys(apis);

      // Check API has mandatory tags
      apiKeys.forEach((key) => {
        const api = apis[key];
        const tags = api.Properties.Tags || [];
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

    it('should include ApiPurpose tag', () => {
      const restApi = new apigateway.RestApi(stack, 'TestApi3', {
        restApiName: 'test-api-3-dev',
        description: 'Test API 3',
      });

      // Add a mock method to satisfy API Gateway validation
      const mockIntegration = new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      });
      restApi.root.addMethod('GET', mockIntegration, {
        methodResponses: [{ statusCode: '200' }],
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('apigateway', 'TestApi3', {
        ApiPurpose: 'AI Agent System API',
      });
      tagManager.applyTags(restApi, allTags);

      const template = Template.fromStack(stack);

      // Verify ApiPurpose tag is present
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Tags: Match.arrayWith([
          { Key: 'ApiPurpose', Value: 'AI Agent System API' },
        ]),
      });
    });
  });

  describe('CloudWatch Log Group Tags', () => {
    it('should create CloudWatch log group with proper tags', () => {
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/apigateway/test-api-dev',
        retention: logs.RetentionDays.ONE_MONTH,
      });

      // Apply tags using TagManager
      tagManager.applyTags(logGroup, {
        ...tagManager.getResourceTags('cloudwatch', 'ApiGatewayAccessLogs'),
        MonitoringType: 'Logs',
        AssociatedResource: 'API-Gateway',
      });

      const template = Template.fromStack(stack);

      // Verify log group has the expected tags
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/test-api-dev',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });
    });

    it('should apply mandatory tags to CloudWatch log groups', () => {
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup2', {
        logGroupName: '/aws/apigateway/test-api-2-dev',
        retention: logs.RetentionDays.ONE_MONTH,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('cloudwatch', 'ApiGatewayAccessLogs', {
        MonitoringType: 'Logs',
        AssociatedResource: 'API-Gateway',
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
  });

  describe('Tag Validation', () => {
    it('should validate API Gateway tags', () => {
      const tags = tagManager.getTagsForResource('apigateway', 'TestApi', {
        ApiPurpose: 'Test API',
      });

      const validationResult = tagManager.validateTags(tags, 'apigateway');

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should detect missing mandatory tags', () => {
      const incompleteTags = {
        Component: 'API-Gateway',
        ApiPurpose: 'Test API',
      };

      const validationResult = tagManager.validateTags(incompleteTags, 'apigateway');

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Resource Type Mapping', () => {
    it('should map API Gateway to correct component', () => {
      const tags = tagManager.getResourceTags('apigateway', 'TestApi');

      expect(tags.Component).toBe('API-Gateway');
      expect(tags.ApiPurpose).toBeDefined();
    });

    it('should derive API purpose from name', () => {
      const tags1 = tagManager.getResourceTags('apigateway', 'RestApi');
      expect(tags1.ApiPurpose).toContain('API');

      const tags2 = tagManager.getResourceTags('apigateway', 'GraphQLApi');
      expect(tags2.ApiPurpose).toBeDefined();
    });
  });
});
