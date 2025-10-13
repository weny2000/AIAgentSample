/**
 * Tests for Monitoring construct tagging implementation
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Monitoring } from '../monitoring';

describe('Monitoring Tagging', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let kmsKey: kms.Key;
  let testLambdaFunctions: lambda.Function[];

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Create KMS key for testing
    kmsKey = new kms.Key(stack, 'TestKey', {
      enableKeyRotation: true,
    });

    // Create test Lambda functions
    testLambdaFunctions = [
      new lambda.Function(stack, 'TestFunction1', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
        functionName: 'test-function-1',
      }),
      new lambda.Function(stack, 'TestFunction2', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
        functionName: 'test-function-2',
      }),
    ];
  });

  describe('SNS Topic Tagging', () => {
    it('should apply tags to SNS alert topic', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::SNS::Topic', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'dev' },
          { Key: 'ManagedBy', Value: 'CDK' },
          { Key: 'Component', Value: 'Monitoring-SNS' },
          { Key: 'MonitoringType', Value: 'Alerts' },
          { Key: 'AlertPurpose', Value: 'SystemAlerts' },
        ]),
      });
    });

    it('should apply environment-specific tags to SNS topic', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'production',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::SNS::Topic', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Production' },
          { Key: 'CostCenter', Value: 'Production' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });
  });

  describe('CloudWatch Log Groups Tagging', () => {
    it('should apply tags to Lambda log groups', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      // Check that log groups have monitoring tags
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/test-function-1',
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
          { Key: 'LogType', Value: 'Lambda' },
        ]),
      });
    });

    it('should apply tags to application log group', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'staging',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/ai-agent/staging/application',
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'staging' },
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
          { Key: 'LogType', Value: 'Application' },
        ]),
      });
    });

    it('should include AssociatedResource tag for Lambda log groups', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/test-function-1',
        Tags: Match.arrayWith([
          { Key: 'AssociatedResource', Value: 'test-function-1' },
        ]),
      });
    });
  });

  describe('CloudWatch Alarms Tagging', () => {
    it('should apply tags to error alarms', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-dev-test-function-1-errors',
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Alarms' },
          { Key: 'AlarmType', Value: 'ErrorRate' },
          { Key: 'AssociatedResource', Value: 'test-function-1' },
          { Key: 'Severity', Value: 'High' },
        ]),
      });
    });

    it('should apply tags to duration alarms', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-dev-test-function-1-duration',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Alarms' },
          { Key: 'AlarmType', Value: 'Performance' },
          { Key: 'Severity', Value: 'Medium' },
        ]),
      });
    });

    it('should apply tags to throttle alarms', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-dev-test-function-1-throttles',
        Tags: Match.arrayWith([
          { Key: 'MonitoringType', Value: 'Alarms' },
          { Key: 'AlarmType', Value: 'Throttling' },
          { Key: 'Severity', Value: 'High' },
        ]),
      });
    });

    it('should apply tags to business metric alarms', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'production',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      // Critical issues alarm
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-production-critical-issues',
        Tags: Match.arrayWith([
          { Key: 'MonitoringType', Value: 'Alarms' },
          { Key: 'AlarmType', Value: 'BusinessMetric' },
          { Key: 'MetricCategory', Value: 'Quality' },
          { Key: 'Severity', Value: 'Critical' },
        ]),
      });

      // Compliance score alarm
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-production-low-compliance',
        Tags: Match.arrayWith([
          { Key: 'MonitoringType', Value: 'Alarms' },
          { Key: 'AlarmType', Value: 'BusinessMetric' },
          { Key: 'MetricCategory', Value: 'Compliance' },
          { Key: 'Severity', Value: 'High' },
        ]),
      });
    });
  });

  describe('Tag Consistency', () => {
    it('should apply mandatory tags to all monitoring resources', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      const mandatoryTags = [
        { Key: 'Project', Value: 'AiAgentSystem' },
        { Key: 'Stage', Value: 'dev' },
        { Key: 'ManagedBy', Value: 'CDK' },
      ];

      // Check SNS topic
      template.hasResourceProperties('AWS::SNS::Topic', {
        Tags: Match.arrayWith(mandatoryTags),
      });

      // Check log groups
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith(mandatoryTags),
      });

      // Check alarms
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        Tags: Match.arrayWith(mandatoryTags),
      });
    });

    it('should apply Component tag with Monitoring-CloudWatch to CloudWatch resources', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      // Log groups should have Monitoring-CloudWatch component
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
        ]),
      });

      // Alarms should have Monitoring-CloudWatch component
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
        ]),
      });
    });

    it('should apply MonitoringType tag to all monitoring resources', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      // SNS topic should have MonitoringType: Alerts
      template.hasResourceProperties('AWS::SNS::Topic', {
        Tags: Match.arrayWith([
          { Key: 'MonitoringType', Value: 'Alerts' },
        ]),
      });

      // Log groups should have MonitoringType: Logs
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });

      // Alarms should have MonitoringType: Alarms
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        Tags: Match.arrayWith([
          { Key: 'MonitoringType', Value: 'Alarms' },
        ]),
      });
    });
  });

  describe('Environment-Specific Tagging', () => {
    it('should apply dev environment tags', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::SNS::Topic', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Development' },
          { Key: 'CostCenter', Value: 'Development' },
          { Key: 'AutoShutdown', Value: 'true' },
        ]),
      });
    });

    it('should apply staging environment tags', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'staging',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Staging' },
          { Key: 'CostCenter', Value: 'QA' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });

    it('should apply production environment tags', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'production',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Production' },
          { Key: 'CostCenter', Value: 'Production' },
          { Key: 'AutoShutdown', Value: 'false' },
        ]),
      });
    });
  });

  describe('Multiple Lambda Functions', () => {
    it('should create and tag log groups for all Lambda functions', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      // Should have log groups for both functions
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/test-function-1',
        Tags: Match.arrayWith([
          { Key: 'AssociatedResource', Value: 'test-function-1' },
        ]),
      });

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/test-function-2',
        Tags: Match.arrayWith([
          { Key: 'AssociatedResource', Value: 'test-function-2' },
        ]),
      });
    });

    it('should create and tag alarms for all Lambda functions', () => {
      new Monitoring(stack, 'TestMonitoring', {
        stage: 'dev',
        kmsKey,
        lambdaFunctions: testLambdaFunctions,
      });

      const template = Template.fromStack(stack);

      // Should have error alarms for both functions
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-dev-test-function-1-errors',
      });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'ai-agent-dev-test-function-2-errors',
      });
    });
  });
});
