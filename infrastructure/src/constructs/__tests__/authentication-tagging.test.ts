/**
 * Tests for Authentication construct tagging implementation
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Authentication } from '../authentication';

// Mock the LambdaLayer construct to avoid inline code validation issues
jest.mock('../lambda-layer', () => {
  return {
    LambdaLayer: jest.fn().mockImplementation((scope, id, props) => {
      const { Construct } = require('constructs');
      const construct = new Construct(scope, id);
      
      // Create a mock layer with asset code instead of inline
      const mockLayer = new (require('aws-cdk-lib').aws_lambda.LayerVersion)(construct, 'AuthLayer', {
        layerVersionName: `ai-agent-auth-layer-${props.stage}`,
        code: require('aws-cdk-lib').aws_lambda.Code.fromAsset('src/constructs/__tests__'),
        compatibleRuntimes: [require('aws-cdk-lib').aws_lambda.Runtime.NODEJS_18_X],
        description: 'Authentication dependencies for AI Agent system',
      });
      
      construct.authLayer = mockLayer;
      return construct;
    }),
  };
});

describe('Authentication Tagging', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let lambdaExecutionRole: iam.Role;
  let apiGatewayRole: iam.Role;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Create test IAM roles
    lambdaExecutionRole = new iam.Role(stack, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    apiGatewayRole = new iam.Role(stack, 'ApiGatewayRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
  });

  // Helper function to create Authentication construct and get template
  const createAuthConstructAndGetTemplate = (testStack: cdk.Stack, stage: string) => {
    new Authentication(testStack, 'TestAuthentication', {
      stage,
      lambdaExecutionRole,
      apiGatewayRole,
      skipAuthorizerCreation: true, // Skip authorizer creation in tests
    });

    return Template.fromStack(testStack);
  };

  describe('Cognito User Pool Tagging', () => {
    it('should apply tags to Cognito User Pool', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          Project: 'AiAgentSystem',
          Stage: 'dev',
          ManagedBy: 'CDK',
          Component: 'Security-Cognito',
          AuthPurpose: 'UserAuthentication',
        }),
      });
    });

    it('should apply environment-specific tags to User Pool', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'production');

      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          Environment: 'Production',
          CostCenter: 'Production',
          AutoShutdown: 'false',
        }),
      });
    });
  });

  describe('Cognito Identity Pool Tagging', () => {
    it('should apply tags to Cognito Identity Pool', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        IdentityPoolTags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'dev' },
          { Key: 'ManagedBy', Value: 'CDK' },
          { Key: 'Component', Value: 'Security-Cognito' },
          { Key: 'AuthPurpose', Value: 'IdentityManagement' },
        ]),
      });
    });

    it('should apply environment-specific tags to Identity Pool', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'staging');

      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        IdentityPoolTags: Match.arrayWith([
          { Key: 'Environment', Value: 'Staging' },
          { Key: 'CostCenter', Value: 'QA' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });
  });

  describe('Lambda Authorizer Function Tagging', () => {
    it('should apply tags to Lambda authorizer function', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ai-agent-authorizer-dev',
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'dev' },
          { Key: 'ManagedBy', Value: 'CDK' },
          { Key: 'Component', Value: 'Compute-Lambda' },
          { Key: 'FunctionPurpose', Value: 'Authentication' },
        ]),
      });
    });

    it('should apply environment-specific tags to Lambda authorizer', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'production');

      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ai-agent-authorizer-production',
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Production' },
          { Key: 'CostCenter', Value: 'Production' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });
  });

  describe('CloudWatch Log Group Tagging', () => {
    it('should apply tags to authorizer log group', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/ai-agent-authorizer-dev',
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'dev' },
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
          { Key: 'AssociatedResource', Value: 'AuthorizerFunction' },
        ]),
      });
    });

    it('should apply environment-specific tags to log group', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'staging');

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/ai-agent-authorizer-staging',
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Staging' },
          { Key: 'CostCenter', Value: 'QA' },
        ]),
      });
    });
  });

  describe('Tag Consistency', () => {
    it('should apply mandatory tags to all authentication resources', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      const mandatoryTags = [
        { Key: 'Project', Value: 'AiAgentSystem' },
        { Key: 'Stage', Value: 'dev' },
        { Key: 'ManagedBy', Value: 'CDK' },
      ];

      // Check User Pool
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          Project: 'AiAgentSystem',
          Stage: 'dev',
          ManagedBy: 'CDK',
        }),
      });

      // Check Identity Pool
      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        IdentityPoolTags: Match.arrayWith(mandatoryTags),
      });

      // Check Lambda function
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith(mandatoryTags),
      });

      // Check Log group
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith(mandatoryTags),
      });
    });

    it('should apply Component tag with Security-Cognito to Cognito resources', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      // User Pool should have Security-Cognito component
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          Component: 'Security-Cognito',
        }),
      });

      // Identity Pool should have Security-Cognito component
      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        IdentityPoolTags: Match.arrayWith([
          { Key: 'Component', Value: 'Security-Cognito' },
        ]),
      });
    });

    it('should apply AuthPurpose tag to all authentication resources', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      // User Pool should have AuthPurpose: UserAuthentication
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          AuthPurpose: 'UserAuthentication',
        }),
      });

      // Identity Pool should have AuthPurpose: IdentityManagement
      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        IdentityPoolTags: Match.arrayWith([
          { Key: 'AuthPurpose', Value: 'IdentityManagement' },
        ]),
      });
    });

    it('should apply FunctionPurpose: Authentication to Lambda authorizer', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ai-agent-authorizer-dev',
        Tags: Match.arrayWith([
          { Key: 'FunctionPurpose', Value: 'Authentication' },
        ]),
      });
    });
  });

  describe('Environment-Specific Tagging', () => {
    it('should apply dev environment tags', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'dev');

      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: Match.objectLike({
          Environment: 'Development',
          CostCenter: 'Development',
          AutoShutdown: 'true',
        }),
      });
    });

    it('should apply staging environment tags', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'staging');

      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Staging' },
          { Key: 'CostCenter', Value: 'QA' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });

    it('should apply production environment tags', () => {
      const template = createAuthConstructAndGetTemplate(stack, 'production');

      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        IdentityPoolTags: Match.arrayWith([
          { Key: 'Environment', Value: 'Production' },
          { Key: 'CostCenter', Value: 'Production' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });
  });
});
