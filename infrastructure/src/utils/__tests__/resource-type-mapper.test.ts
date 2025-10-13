/**
 * Unit tests for ResourceTypeMapper
 */

import { ResourceTypeMapper } from '../resource-type-mapper';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { CfnResource } from 'aws-cdk-lib';

describe('ResourceTypeMapper', () => {
  let mapper: ResourceTypeMapper;
  let stack: cdk.Stack;

  beforeEach(() => {
    mapper = new ResourceTypeMapper();
    stack = new cdk.Stack();
  });

  describe('getResourceType', () => {
    it('should identify Lambda Function', () => {
      const fn = new lambda.Function(stack, 'TestFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
      });

      expect(mapper.getResourceType(fn)).toBe('AWS::Lambda::Function');
    });

    it('should identify DynamoDB Table', () => {
      const table = new dynamodb.Table(stack, 'TestTable', {
        partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      });

      expect(mapper.getResourceType(table)).toBe('AWS::DynamoDB::Table');
    });

    it('should identify S3 Bucket', () => {
      const bucket = new s3.Bucket(stack, 'TestBucket');

      expect(mapper.getResourceType(bucket)).toBe('AWS::S3::Bucket');
    });

    it('should identify VPC', () => {
      const vpc = new ec2.Vpc(stack, 'TestVpc');

      expect(mapper.getResourceType(vpc)).toBe('AWS::EC2::VPC');
    });

    it('should identify Security Group', () => {
      const vpc = new ec2.Vpc(stack, 'TestVpc');
      const sg = new ec2.SecurityGroup(stack, 'TestSG', { vpc });

      expect(mapper.getResourceType(sg)).toBe('AWS::EC2::SecurityGroup');
    });

    it('should identify API Gateway RestApi', () => {
      const api = new apigateway.RestApi(stack, 'TestApi');

      expect(mapper.getResourceType(api)).toBe('AWS::ApiGateway::RestApi');
    });

    it('should identify Step Functions StateMachine', () => {
      const stateMachine = new stepfunctions.StateMachine(stack, 'TestStateMachine', {
        definition: new stepfunctions.Pass(stack, 'PassState'),
      });

      expect(mapper.getResourceType(stateMachine)).toBe('AWS::StepFunctions::StateMachine');
    });

    it('should identify CloudWatch LogGroup', () => {
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup');

      expect(mapper.getResourceType(logGroup)).toBe('AWS::Logs::LogGroup');
    });

    it('should identify CloudWatch Alarm', () => {
      const alarm = new cloudwatch.Alarm(stack, 'TestAlarm', {
        metric: new cloudwatch.Metric({ namespace: 'Test', metricName: 'Test' }),
        threshold: 1,
        evaluationPeriods: 1,
      });

      expect(mapper.getResourceType(alarm)).toBe('AWS::CloudWatch::Alarm');
    });

    it('should identify KMS Key', () => {
      const key = new kms.Key(stack, 'TestKey');

      expect(mapper.getResourceType(key)).toBe('AWS::KMS::Key');
    });

    it('should identify Cognito UserPool', () => {
      const userPool = new cognito.UserPool(stack, 'TestUserPool');

      expect(mapper.getResourceType(userPool)).toBe('AWS::Cognito::UserPool');
    });

    it('should identify SNS Topic', () => {
      const topic = new sns.Topic(stack, 'TestTopic');

      expect(mapper.getResourceType(topic)).toBe('AWS::SNS::Topic');
    });

    it('should identify SQS Queue', () => {
      const queue = new sqs.Queue(stack, 'TestQueue');

      expect(mapper.getResourceType(queue)).toBe('AWS::SQS::Queue');
    });

    it('should identify IAM Role', () => {
      const role = new iam.Role(stack, 'TestRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });

      expect(mapper.getResourceType(role)).toBe('AWS::IAM::Role');
    });

    it('should identify Secrets Manager Secret', () => {
      const secret = new secretsmanager.Secret(stack, 'TestSecret');

      expect(mapper.getResourceType(secret)).toBe('AWS::SecretsManager::Secret');
    });

    it('should identify CfnResource by cfnResourceType', () => {
      const cfnResource = new CfnResource(stack, 'TestCfnResource', {
        type: 'AWS::Custom::Resource',
      });

      expect(mapper.getResourceType(cfnResource)).toBe('AWS::Custom::Resource');
    });

    it('should return Unknown for unrecognized constructs', () => {
      const construct = new Construct(stack, 'TestConstruct');

      expect(mapper.getResourceType(construct)).toBe('Unknown');
    });
  });

  describe('getComponentName', () => {
    it('should map Lambda function to Compute-Lambda', () => {
      expect(mapper.getComponentName('AWS::Lambda::Function')).toBe('Compute-Lambda');
    });

    it('should map DynamoDB table to Database-DynamoDB', () => {
      expect(mapper.getComponentName('AWS::DynamoDB::Table')).toBe('Database-DynamoDB');
    });

    it('should map S3 bucket to Storage-S3', () => {
      expect(mapper.getComponentName('AWS::S3::Bucket')).toBe('Storage-S3');
    });

    it('should map RDS instance to Database-RDS', () => {
      expect(mapper.getComponentName('AWS::RDS::DBInstance')).toBe('Database-RDS');
    });

    it('should map VPC to Network-VPC', () => {
      expect(mapper.getComponentName('AWS::EC2::VPC')).toBe('Network-VPC');
    });

    it('should map Security Group to Network-SecurityGroup', () => {
      expect(mapper.getComponentName('AWS::EC2::SecurityGroup')).toBe('Network-SecurityGroup');
    });

    it('should map API Gateway to API-Gateway', () => {
      expect(mapper.getComponentName('AWS::ApiGateway::RestApi')).toBe('API-Gateway');
    });

    it('should map Step Functions to Orchestration-StepFunctions', () => {
      expect(mapper.getComponentName('AWS::StepFunctions::StateMachine')).toBe('Orchestration-StepFunctions');
    });

    it('should map CloudWatch LogGroup to Monitoring-CloudWatch', () => {
      expect(mapper.getComponentName('AWS::Logs::LogGroup')).toBe('Monitoring-CloudWatch');
    });

    it('should map KMS Key to Security-KMS', () => {
      expect(mapper.getComponentName('AWS::KMS::Key')).toBe('Security-KMS');
    });

    it('should map Cognito UserPool to Security-Cognito', () => {
      expect(mapper.getComponentName('AWS::Cognito::UserPool')).toBe('Security-Cognito');
    });

    it('should map SNS Topic to Monitoring-SNS', () => {
      expect(mapper.getComponentName('AWS::SNS::Topic')).toBe('Monitoring-SNS');
    });

    it('should map SQS Queue to Messaging-SQS', () => {
      expect(mapper.getComponentName('AWS::SQS::Queue')).toBe('Messaging-SQS');
    });

    it('should derive component name for unmapped Lambda resource', () => {
      expect(mapper.getComponentName('AWS::Lambda::LayerVersion')).toBe('Compute-Lambda');
    });

    it('should derive component name for unmapped EC2 resource', () => {
      expect(mapper.getComponentName('AWS::EC2::Instance')).toBe('Network-EC2');
    });

    it('should handle unknown resource types', () => {
      expect(mapper.getComponentName('AWS::Unknown::Resource')).toBe('Unknown-Unknown');
    });
  });

  describe('getResourcePurpose', () => {
    describe('Lambda functions', () => {
      it('should identify authentication function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'AuthHandler')).toBe('Authentication');
      });

      it('should identify API function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'ApiHandler')).toBe('API');
      });

      it('should identify ingestion function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'IngestionProcessor')).toBe('DataIngestion');
      });

      it('should identify notification function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'NotificationSender')).toBe('Notification');
      });

      it('should identify artifact management function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'ArtifactCheckHandler')).toBe('ArtifactManagement');
      });

      it('should identify job processing function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'JobProcessor')).toBe('JobProcessing');
      });

      it('should identify search function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'SearchHandler')).toBe('Search');
      });

      it('should identify agent core function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'AgentExecutor')).toBe('AgentCore');
      });

      it('should identify data processing function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'DataProcessor')).toBe('DataProcessing');
      });

      it('should identify authorizer function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'CustomAuthorizer')).toBe('Authorization');
      });

      it('should default to General for unknown Lambda function', () => {
        expect(mapper.getResourcePurpose('AWS::Lambda::Function', 'UnknownFunction')).toBe('General');
      });
    });

    describe('DynamoDB tables', () => {
      it('should identify team roster table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'TeamRosterTable')).toBe('TeamManagement');
      });

      it('should identify audit log table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'AuditLogTable')).toBe('AuditLog');
      });

      it('should identify job status table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'JobStatusTable')).toBe('JobStatus');
      });

      it('should identify artifact tracking table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'ArtifactTable')).toBe('ArtifactTracking');
      });

      it('should identify notification tracking table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'NotificationTable')).toBe('NotificationTracking');
      });

      it('should identify persona management table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'PersonaTable')).toBe('PersonaManagement');
      });

      it('should identify rules engine table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'RulesTable')).toBe('RulesEngine');
      });

      it('should identify configuration table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'ConfigTable')).toBe('Configuration');
      });

      it('should default to General for unknown table', () => {
        expect(mapper.getResourcePurpose('AWS::DynamoDB::Table', 'UnknownTable')).toBe('General');
      });
    });

    describe('S3 buckets', () => {
      it('should identify documents bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'DocumentsBucket')).toBe('Documents');
      });

      it('should identify artifacts bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'ArtifactsBucket')).toBe('Artifacts');
      });

      it('should identify audit logs bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'AuditLogsBucket')).toBe('AuditLogs');
      });

      it('should identify backups bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'BackupBucket')).toBe('Backups');
      });

      it('should identify work task bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'WorkTaskBucket')).toBe('WorkTaskAnalysis');
      });

      it('should identify temporary bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'TempBucket')).toBe('Temporary');
      });

      it('should identify logs bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'LogsBucket')).toBe('Logs');
      });

      it('should default to General for unknown bucket', () => {
        expect(mapper.getResourcePurpose('AWS::S3::Bucket', 'UnknownBucket')).toBe('General');
      });
    });

    describe('RDS databases', () => {
      it('should identify knowledge base database', () => {
        expect(mapper.getResourcePurpose('AWS::RDS::DBInstance', 'KnowledgeBaseDB')).toBe('KnowledgeBase');
      });

      it('should identify vector database', () => {
        expect(mapper.getResourcePurpose('AWS::RDS::DBInstance', 'VectorDB')).toBe('VectorDatabase');
      });

      it('should identify analytics database', () => {
        expect(mapper.getResourcePurpose('AWS::RDS::DBInstance', 'AnalyticsDB')).toBe('Analytics');
      });

      it('should default to PrimaryDatabase for unknown RDS', () => {
        expect(mapper.getResourcePurpose('AWS::RDS::DBInstance', 'MainDB')).toBe('PrimaryDatabase');
      });
    });

    describe('API Gateway', () => {
      it('should identify REST API', () => {
        expect(mapper.getResourcePurpose('AWS::ApiGateway::RestApi', 'RestApi')).toBe('RESTful API');
      });

      it('should identify GraphQL API', () => {
        expect(mapper.getResourcePurpose('AWS::ApiGateway::RestApi', 'GraphQLApi')).toBe('GraphQL API');
      });

      it('should identify Webhook', () => {
        expect(mapper.getResourcePurpose('AWS::ApiGateway::RestApi', 'WebhookApi')).toBe('Webhook');
      });

      it('should default to API for unknown API Gateway', () => {
        expect(mapper.getResourcePurpose('AWS::ApiGateway::RestApi', 'MainApi')).toBe('API');
      });
    });

    describe('Step Functions', () => {
      it('should identify ingestion workflow', () => {
        expect(mapper.getResourcePurpose('AWS::StepFunctions::StateMachine', 'IngestionWorkflow')).toBe('DataIngestion');
      });

      it('should identify processing workflow', () => {
        expect(mapper.getResourcePurpose('AWS::StepFunctions::StateMachine', 'ProcessWorkflow')).toBe('DataProcessing');
      });

      it('should identify notification workflow', () => {
        expect(mapper.getResourcePurpose('AWS::StepFunctions::StateMachine', 'NotificationWorkflow')).toBe('NotificationOrchestration');
      });

      it('should identify agent workflow', () => {
        expect(mapper.getResourcePurpose('AWS::StepFunctions::StateMachine', 'AgentWorkflow')).toBe('AgentWorkflow');
      });

      it('should identify general workflow', () => {
        expect(mapper.getResourcePurpose('AWS::StepFunctions::StateMachine', 'MainWorkflow')).toBe('Orchestration');
      });

      it('should default to Workflow for unknown state machine', () => {
        expect(mapper.getResourcePurpose('AWS::StepFunctions::StateMachine', 'UnknownStateMachine')).toBe('Workflow');
      });
    });

    describe('CloudWatch resources', () => {
      it('should identify log group', () => {
        expect(mapper.getResourcePurpose('AWS::Logs::LogGroup', 'TestLogGroup')).toBe('Logs');
      });

      it('should identify alarm', () => {
        expect(mapper.getResourcePurpose('AWS::CloudWatch::Alarm', 'TestAlarm')).toBe('Alarms');
      });
    });

    describe('KMS keys', () => {
      it('should identify database encryption key', () => {
        expect(mapper.getResourcePurpose('AWS::KMS::Key', 'DatabaseKey')).toBe('DatabaseEncryption');
      });

      it('should identify S3 encryption key', () => {
        expect(mapper.getResourcePurpose('AWS::KMS::Key', 'S3Key')).toBe('S3Encryption');
      });

      it('should identify secrets encryption key', () => {
        expect(mapper.getResourcePurpose('AWS::KMS::Key', 'SecretKey')).toBe('SecretsEncryption');
      });

      it('should default to GeneralEncryption for unknown key', () => {
        expect(mapper.getResourcePurpose('AWS::KMS::Key', 'MainKey')).toBe('GeneralEncryption');
      });
    });

    describe('Cognito resources', () => {
      it('should identify user pool', () => {
        expect(mapper.getResourcePurpose('AWS::Cognito::UserPool', 'UserPool')).toBe('UserAuthentication');
      });

      it('should identify identity pool', () => {
        expect(mapper.getResourcePurpose('AWS::Cognito::IdentityPool', 'IdentityPool')).toBe('IdentityManagement');
      });

      it('should identify user pool client', () => {
        expect(mapper.getResourcePurpose('AWS::Cognito::UserPoolClient', 'UserPoolClient')).toBe('ClientAuthentication');
      });
    });

    describe('VPC resources', () => {
      it('should identify VPC', () => {
        expect(mapper.getResourcePurpose('AWS::EC2::VPC', 'MainVpc')).toBe('NetworkIsolation');
      });

      it('should identify public subnet', () => {
        expect(mapper.getResourcePurpose('AWS::EC2::Subnet', 'PublicSubnet')).toBe('PublicSubnet');
      });

      it('should identify private subnet', () => {
        expect(mapper.getResourcePurpose('AWS::EC2::Subnet', 'PrivateSubnet')).toBe('PrivateSubnet');
      });

      it('should identify isolated subnet', () => {
        expect(mapper.getResourcePurpose('AWS::EC2::Subnet', 'IsolatedSubnet')).toBe('IsolatedSubnet');
      });

      it('should default to Subnet for unknown subnet', () => {
        expect(mapper.getResourcePurpose('AWS::EC2::Subnet', 'Subnet1')).toBe('Subnet');
      });

      it('should identify security group', () => {
        expect(mapper.getResourcePurpose('AWS::EC2::SecurityGroup', 'TestSG')).toBe('NetworkSecurity');
      });
    });

    describe('SNS topics', () => {
      it('should identify alerting topic', () => {
        expect(mapper.getResourcePurpose('AWS::SNS::Topic', 'AlertTopic')).toBe('Alerting');
      });

      it('should identify notification topic', () => {
        expect(mapper.getResourcePurpose('AWS::SNS::Topic', 'NotificationTopic')).toBe('Notifications');
      });

      it('should default to Messaging for unknown topic', () => {
        expect(mapper.getResourcePurpose('AWS::SNS::Topic', 'MainTopic')).toBe('Messaging');
      });
    });

    describe('SQS queues', () => {
      it('should identify dead letter queue', () => {
        expect(mapper.getResourcePurpose('AWS::SQS::Queue', 'DLQQueue')).toBe('DeadLetterQueue');
      });

      it('should identify job queue', () => {
        expect(mapper.getResourcePurpose('AWS::SQS::Queue', 'JobQueue')).toBe('JobQueue');
      });

      it('should default to MessageQueue for unknown queue', () => {
        expect(mapper.getResourcePurpose('AWS::SQS::Queue', 'MainQueue')).toBe('MessageQueue');
      });
    });

    it('should default to General for unknown resource types', () => {
      expect(mapper.getResourcePurpose('AWS::Unknown::Resource', 'TestResource')).toBe('General');
    });
  });

  describe('isDataStorageResource', () => {
    it('should identify S3 bucket as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::S3::Bucket')).toBe(true);
    });

    it('should identify DynamoDB table as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::DynamoDB::Table')).toBe(true);
    });

    it('should identify RDS instance as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::RDS::DBInstance')).toBe(true);
    });

    it('should identify RDS cluster as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::RDS::DBCluster')).toBe(true);
    });

    it('should not identify Lambda function as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::Lambda::Function')).toBe(false);
    });

    it('should not identify API Gateway as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::ApiGateway::RestApi')).toBe(false);
    });

    it('should not identify VPC as data storage', () => {
      expect(mapper.isDataStorageResource('AWS::EC2::VPC')).toBe(false);
    });
  });

  describe('isProductionCritical', () => {
    it('should identify RDS instance as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::RDS::DBInstance')).toBe(true);
    });

    it('should identify RDS cluster as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::RDS::DBCluster')).toBe(true);
    });

    it('should identify DynamoDB table as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::DynamoDB::Table')).toBe(true);
    });

    it('should identify Lambda function as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::Lambda::Function')).toBe(true);
    });

    it('should identify API Gateway as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::ApiGateway::RestApi')).toBe(true);
    });

    it('should identify Step Functions as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::StepFunctions::StateMachine')).toBe(true);
    });

    it('should not identify S3 bucket as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::S3::Bucket')).toBe(false);
    });

    it('should not identify VPC as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::EC2::VPC')).toBe(false);
    });

    it('should not identify CloudWatch log group as production-critical', () => {
      expect(mapper.isProductionCritical('AWS::Logs::LogGroup')).toBe(false);
    });
  });
});

