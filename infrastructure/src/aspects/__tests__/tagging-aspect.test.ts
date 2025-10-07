/**
 * Unit tests for TaggingAspect
 */

import { Stack, App, Aspects } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TaggingAspect } from '../tagging-aspect';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('TaggingAspect', () => {
  let app: App;
  let stack: Stack;
  let tagManager: TagManager;
  let aspect: TaggingAspect;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    
    const tagConfig = getTagConfig('dev');
    tagManager = new TagManager(tagConfig, 'dev');
    aspect = new TaggingAspect(tagManager);
  });

  describe('visit method', () => {
    it('should traverse construct tree and apply tags', () => {
      // Create a Lambda function
      new lambda.Function(stack, 'TestFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      // Apply aspect
      Aspects.of(stack).add(aspect);

      // Synthesize to trigger aspect
      const template = Template.fromStack(stack);

      // Verify Lambda function has tags
      const resources = template.findResources('AWS::Lambda::Function');
      const functionResource = Object.values(resources)[0];
      const tags = functionResource.Properties.Tags;
      
      expect(tags).toEqual(expect.arrayContaining([
        expect.objectContaining({ Key: 'Project', Value: 'AiAgentSystem' }),
        expect.objectContaining({ Key: 'ManagedBy', Value: 'CDK' }),
        expect.objectContaining({ Key: 'Component', Value: 'Compute-Lambda' }),
      ]));
    });

    it('should not tag the same resource twice', () => {
      const func = new lambda.Function(stack, 'TestFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      // Apply aspect
      Aspects.of(stack).add(aspect);

      // Visit the function twice
      aspect.visit(func);
      aspect.visit(func);

      // Check that resource was only tagged once
      const taggedResources = aspect.getTaggedResources();
      const funcPath = func.node.path;
      
      // Count occurrences (should be 1)
      let count = 0;
      taggedResources.forEach(path => {
        if (path === funcPath) count++;
      });
      
      expect(count).toBeLessThanOrEqual(1);
    });

    it('should skip unknown resource types', () => {
      // Create a construct that doesn't map to a known resource type
      const construct = new Stack(app, 'NestedStack');

      // Apply aspect
      aspect.visit(construct);

      // Should not throw and should not be in tagged resources
      const taggedResources = aspect.getTaggedResources();
      expect(taggedResources.has(construct.node.path)).toBe(false);
    });
  });

  describe('Lambda function tagging', () => {
    it('should apply Lambda-specific tags', () => {
      new lambda.Function(stack, 'ApiHandler', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Compute-Lambda' },
          { Key: 'FunctionPurpose', Value: 'API' },
          { Key: 'Runtime', Value: 'nodejs18.x' },
        ]),
      });
    });

    it('should derive function purpose from name', () => {
      new lambda.Function(stack, 'AuthenticationHandler', {
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: 'index.handler',
        code: lambda.Code.fromInline('def handler(event, context): pass'),
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'FunctionPurpose', Value: 'Authentication' },
        ]),
      });
    });
  });

  describe('DynamoDB table tagging', () => {
    it('should apply DynamoDB-specific tags', () => {
      new dynamodb.Table(stack, 'TeamRosterTable', {
        partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Database-DynamoDB' },
          { Key: 'TablePurpose', Value: 'TeamManagement' },
          { Key: 'DataClassification', Value: 'Internal' },
        ]),
      });
    });

    it('should derive table purpose from name', () => {
      new dynamodb.Table(stack, 'AuditLogTable', {
        partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          { Key: 'TablePurpose', Value: 'AuditLog' },
        ]),
      });
    });
  });

  describe('S3 bucket tagging', () => {
    it('should apply S3-specific tags', () => {
      new s3.Bucket(stack, 'DocumentBucket');

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Storage-S3' },
          { Key: 'BucketPurpose', Value: 'General' },
          { Key: 'DataClassification', Value: 'Internal' },
          { Key: 'BackupPolicy', Value: 'Daily' },
        ]),
      });
    });

    it('should derive bucket purpose from name', () => {
      new s3.Bucket(stack, 'ArtifactBucket');

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          { Key: 'BucketPurpose', Value: 'Artifacts' },
        ]),
      });
    });
  });

  describe('VPC and network resource tagging', () => {
    it('should apply VPC tags', () => {
      new ec2.Vpc(stack, 'TestVpc', {
        maxAzs: 2,
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-VPC' },
        ]),
      });
    });

    it('should apply NetworkTier tags to subnets', () => {
      const vpc = new ec2.Vpc(stack, 'TestVpc', {
        maxAzs: 2,
        subnetConfiguration: [
          {
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      // Check that subnets have NetworkTier tags
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          { Key: 'NetworkTier', Value: 'Public' },
        ]),
      });

      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          { Key: 'NetworkTier', Value: 'Private' },
        ]),
      });
    });

    it('should apply tags to security groups', () => {
      const vpc = new ec2.Vpc(stack, 'TestVpc');
      new ec2.SecurityGroup(stack, 'TestSecurityGroup', {
        vpc,
        description: 'Test security group',
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-SecurityGroup' },
        ]),
      });
    });
  });

  describe('API Gateway tagging', () => {
    it('should apply API Gateway tags', () => {
      const api = new apigateway.RestApi(stack, 'TestApi', {
        restApiName: 'Test API',
      });
      
      // Add a method to satisfy validation
      const resource = api.root.addResource('test');
      resource.addMethod('GET');

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'API-Gateway' },
          { Key: 'ApiPurpose', Value: 'API' },
        ]),
      });
    });
  });

  describe('Step Functions tagging', () => {
    it('should apply Step Functions tags', () => {
      new stepfunctions.StateMachine(stack, 'IngestionWorkflow', {
        definition: stepfunctions.Chain.start(
          new stepfunctions.Pass(stack, 'PassState')
        ),
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Orchestration-StepFunctions' },
          { Key: 'WorkflowPurpose', Value: 'DataIngestion' },
        ]),
      });
    });
  });

  describe('CloudWatch resource tagging', () => {
    it('should apply tags to log groups', () => {
      new logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/test/logs',
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });
    });

    it('should handle Lambda log groups specially', () => {
      new logs.LogGroup(stack, 'LambdaLogGroup', {
        logGroupName: '/aws/lambda/MyFunction',
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
          { Key: 'AssociatedResource', Value: 'MyFunction' },
        ]),
      });
    });
  });

  describe('KMS key tagging', () => {
    it('should apply KMS tags', () => {
      new kms.Key(stack, 'DatabaseEncryptionKey', {
        description: 'Key for database encryption',
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security-KMS' },
          { Key: 'KeyPurpose', Value: 'DatabaseEncryption' },
        ]),
      });
    });
  });

  describe('Cognito resource tagging', () => {
    it('should apply Cognito User Pool tags', () => {
      new cognito.UserPool(stack, 'TestUserPool', {
        userPoolName: 'test-user-pool',
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolTags: {
          Component: 'Security-Cognito',
          AuthPurpose: 'UserAuthentication',
        },
      });
    });
  });

  describe('IAM resource tagging', () => {
    it('should apply basic tags to IAM roles', () => {
      new iam.Role(stack, 'TestRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'ManagedBy', Value: 'CDK' },
          { Key: 'Component', Value: 'Security-IAM' },
        ]),
      });
    });
  });

  describe('special case handling', () => {
    it('should handle resources with non-standard tagging', () => {
      // Create IAM role (limited tag support)
      new iam.Role(stack, 'LimitedTagRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      // Should apply basic tags only
      template.hasResourceProperties('AWS::IAM::Role', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
        ]),
      });
    });

    it('should handle Lambda log groups with associated resource tag', () => {
      new logs.LogGroup(stack, 'LambdaLogs', {
        logGroupName: '/aws/lambda/TestFunction',
      });

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          { Key: 'AssociatedResource', Value: 'TestFunction' },
        ]),
      });
    });
  });

  describe('environment-specific tags', () => {
    it('should apply dev environment tags', () => {
      const devConfig = getTagConfig('dev');
      const devTagManager = new TagManager(devConfig, 'dev');
      const devAspect = new TaggingAspect(devTagManager);

      new lambda.Function(stack, 'DevFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      Aspects.of(stack).add(devAspect);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Stage', Value: 'dev' },
          { Key: 'Environment', Value: 'Development' },
          { Key: 'AutoShutdown', Value: 'true' },
        ]),
      });
    });

    it('should apply production environment tags', () => {
      const prodStack = new Stack(app, 'ProdStack');
      const prodConfig = getTagConfig('production');
      const prodTagManager = new TagManager(prodConfig, 'production');
      const prodAspect = new TaggingAspect(prodTagManager);

      new lambda.Function(prodStack, 'ProdFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      Aspects.of(prodStack).add(prodAspect);
      const template = Template.fromStack(prodStack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Stage', Value: 'production' },
          { Key: 'Environment', Value: 'Production' },
          { Key: 'AutoShutdown', Value: 'false' },
          { Key: 'ComplianceScope', Value: 'HIPAA,SOC2,GDPR' },
        ]),
      });
    });
  });

  describe('utility methods', () => {
    it('should track tagged resources', () => {
      const func = new lambda.Function(stack, 'TrackedFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      Aspects.of(stack).add(aspect);
      Template.fromStack(stack); // Trigger synthesis

      const taggedResources = aspect.getTaggedResources();
      expect(taggedResources.size).toBeGreaterThan(0);
    });

    it('should reset tagged resources', () => {
      const func = new lambda.Function(stack, 'ResetFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      aspect.visit(func);
      expect(aspect.getTaggedResources().size).toBeGreaterThan(0);

      aspect.resetTaggedResources();
      expect(aspect.getTaggedResources().size).toBe(0);
    });
  });

  describe('tag propagation', () => {
    it('should apply tags to all resources in a complex stack', () => {
      // Create multiple resources
      new lambda.Function(stack, 'Function1', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {};'),
      });

      new dynamodb.Table(stack, 'Table1', {
        partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      });

      new s3.Bucket(stack, 'Bucket1');

      Aspects.of(stack).add(aspect);
      const template = Template.fromStack(stack);

      // Verify all resources have mandatory tags
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
        ]),
      });

      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
        ]),
      });

      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
        ]),
      });
    });
  });
});
