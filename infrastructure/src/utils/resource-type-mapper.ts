/**
 * ResourceTypeMapper Utility Class
 * 
 * Provides utilities for identifying CDK construct types and mapping them to:
 * - Resource types (AWS CloudFormation types)
 * - Component names (logical groupings)
 * - Resource purposes (derived from names)
 * - Data storage identification
 * - Production criticality assessment
 */

import { IConstruct } from 'constructs';
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
import {
  RESOURCE_TYPE_TO_COMPONENT,
  DATA_STORAGE_RESOURCE_TYPES,
  PRODUCTION_CRITICAL_RESOURCE_TYPES,
} from '../config/tag-config';

/**
 * Resource type identifier
 */
export type ResourceType = string;

/**
 * ResourceTypeMapper class for identifying and mapping CDK constructs
 */
export class ResourceTypeMapper {
  /**
   * Get the AWS CloudFormation resource type from a CDK construct
   * @param construct CDK construct to identify
   * @returns AWS CloudFormation resource type (e.g., 'AWS::Lambda::Function')
   */
  getResourceType(construct: IConstruct): ResourceType {
    // Check if construct is a CfnResource (L1 construct)
    if (construct instanceof CfnResource) {
      return construct.cfnResourceType;
    }

    // Check for L2 constructs and map to CloudFormation types
    if (construct instanceof lambda.Function) {
      return 'AWS::Lambda::Function';
    }
    
    if (construct instanceof dynamodb.Table) {
      return 'AWS::DynamoDB::Table';
    }
    
    if (construct instanceof s3.Bucket) {
      return 'AWS::S3::Bucket';
    }
    
    if (construct instanceof rds.DatabaseInstance) {
      return 'AWS::RDS::DBInstance';
    }
    
    if (construct instanceof rds.DatabaseCluster) {
      return 'AWS::RDS::DBCluster';
    }
    
    if (construct instanceof ec2.Vpc) {
      return 'AWS::EC2::VPC';
    }
    
    if (construct instanceof ec2.Subnet) {
      return 'AWS::EC2::Subnet';
    }
    
    if (construct instanceof ec2.SecurityGroup) {
      return 'AWS::EC2::SecurityGroup';
    }
    
    if (construct instanceof ec2.InterfaceVpcEndpoint || construct instanceof ec2.GatewayVpcEndpoint) {
      return 'AWS::EC2::VPCEndpoint';
    }
    
    if (construct instanceof apigateway.RestApi) {
      return 'AWS::ApiGateway::RestApi';
    }
    
    if (construct instanceof stepfunctions.StateMachine) {
      return 'AWS::StepFunctions::StateMachine';
    }
    
    if (construct instanceof logs.LogGroup) {
      return 'AWS::Logs::LogGroup';
    }
    
    if (construct instanceof cloudwatch.Alarm) {
      return 'AWS::CloudWatch::Alarm';
    }
    
    if (construct instanceof kms.Key) {
      return 'AWS::KMS::Key';
    }
    
    if (construct instanceof kms.Alias) {
      return 'AWS::KMS::Alias';
    }
    
    if (construct instanceof cognito.UserPool) {
      return 'AWS::Cognito::UserPool';
    }
    
    if (construct instanceof cognito.UserPoolClient) {
      return 'AWS::Cognito::UserPoolClient';
    }
    
    if (construct instanceof cognito.CfnIdentityPool) {
      return 'AWS::Cognito::IdentityPool';
    }
    
    if (construct instanceof sns.Topic) {
      return 'AWS::SNS::Topic';
    }
    
    if (construct instanceof sqs.Queue) {
      return 'AWS::SQS::Queue';
    }
    
    if (construct instanceof iam.Role) {
      return 'AWS::IAM::Role';
    }
    
    if (construct instanceof iam.Policy) {
      return 'AWS::IAM::Policy';
    }
    
    if (construct instanceof secretsmanager.Secret) {
      return 'AWS::SecretsManager::Secret';
    }

    // Default to unknown type
    return 'Unknown';
  }

  /**
   * Get the component name for a resource based on its type
   * @param resourceType AWS CloudFormation resource type
   * @param constructId CDK construct ID (optional, for additional context)
   * @returns Component name (e.g., 'Compute-Lambda', 'Database-DynamoDB')
   */
  getComponentName(resourceType: ResourceType, constructId?: string): string {
    // Look up component name from mapping
    const componentName = RESOURCE_TYPE_TO_COMPONENT[resourceType];
    
    if (componentName) {
      return componentName;
    }

    // If not in mapping, try to derive from resource type
    if (resourceType.startsWith('AWS::Lambda::')) {
      return 'Compute-Lambda';
    }
    
    if (resourceType.startsWith('AWS::DynamoDB::')) {
      return 'Database-DynamoDB';
    }
    
    if (resourceType.startsWith('AWS::S3::')) {
      return 'Storage-S3';
    }
    
    if (resourceType.startsWith('AWS::RDS::')) {
      return 'Database-RDS';
    }
    
    if (resourceType.startsWith('AWS::EC2::')) {
      if (resourceType.includes('VPC')) {
        return 'Network-VPC';
      }
      if (resourceType.includes('SecurityGroup')) {
        return 'Network-SecurityGroup';
      }
      return 'Network-EC2';
    }
    
    if (resourceType.startsWith('AWS::ApiGateway')) {
      return 'API-Gateway';
    }
    
    if (resourceType.startsWith('AWS::StepFunctions::')) {
      return 'Orchestration-StepFunctions';
    }
    
    if (resourceType.startsWith('AWS::Logs::') || resourceType.startsWith('AWS::CloudWatch::')) {
      return 'Monitoring-CloudWatch';
    }
    
    if (resourceType.startsWith('AWS::KMS::')) {
      return 'Security-KMS';
    }
    
    if (resourceType.startsWith('AWS::Cognito::')) {
      return 'Security-Cognito';
    }
    
    if (resourceType.startsWith('AWS::IAM::')) {
      return 'Security-IAM';
    }
    
    if (resourceType.startsWith('AWS::SNS::')) {
      return 'Monitoring-SNS';
    }
    
    if (resourceType.startsWith('AWS::SQS::')) {
      return 'Messaging-SQS';
    }
    
    if (resourceType.startsWith('AWS::SecretsManager::')) {
      return 'Security-SecretsManager';
    }

    // Default to generic component name
    return `Unknown-${resourceType.split('::')[1] || 'Resource'}`;
  }

  /**
   * Derive the purpose of a resource from its name and type
   * @param resourceType AWS CloudFormation resource type
   * @param constructId CDK construct ID or resource name
   * @returns Resource purpose description
   */
  getResourcePurpose(resourceType: ResourceType, constructId: string): string {
    const name = constructId.toLowerCase();

    // Lambda function purposes
    if (resourceType === 'AWS::Lambda::Function') {
      if (name.includes('authorizer')) return 'Authorization';
      if (name.includes('authentication')) return 'Authentication';
      if (name.includes('auth')) return 'Authentication';
      if (name.includes('api')) return 'API';
      if (name.includes('ingestion')) return 'DataIngestion';
      if (name.includes('notification')) return 'Notification';
      if (name.includes('artifact')) return 'ArtifactManagement';
      if (name.includes('job')) return 'JobProcessing';
      if (name.includes('search')) return 'Search';
      if (name.includes('agent')) return 'AgentCore';
      if (name.includes('process')) return 'DataProcessing';
      if (name.includes('handler')) return 'DataProcessing';
      return 'General';
    }

    // DynamoDB table purposes
    if (resourceType === 'AWS::DynamoDB::Table') {
      if (name.includes('roster') || name.includes('team')) return 'TeamManagement';
      if (name.includes('audit')) return 'AuditLog';
      if (name.includes('job')) return 'JobStatus';
      if (name.includes('artifact')) return 'ArtifactTracking';
      if (name.includes('notification')) return 'NotificationTracking';
      if (name.includes('persona')) return 'PersonaManagement';
      if (name.includes('rule')) return 'RulesEngine';
      if (name.includes('config')) return 'Configuration';
      return 'General';
    }

    // S3 bucket purposes
    if (resourceType === 'AWS::S3::Bucket') {
      if (name.includes('document')) return 'Documents';
      if (name.includes('artifact')) return 'Artifacts';
      if (name.includes('audit')) return 'AuditLogs';
      if (name.includes('backup')) return 'Backups';
      if (name.includes('work') || name.includes('task')) return 'WorkTaskAnalysis';
      if (name.includes('temp')) return 'Temporary';
      if (name.includes('log')) return 'Logs';
      return 'General';
    }

    // RDS purposes
    if (resourceType.startsWith('AWS::RDS::')) {
      if (name.includes('knowledge')) return 'KnowledgeBase';
      if (name.includes('vector')) return 'VectorDatabase';
      if (name.includes('analytics')) return 'Analytics';
      return 'PrimaryDatabase';
    }

    // API Gateway purposes
    if (resourceType.startsWith('AWS::ApiGateway')) {
      if (name.includes('rest')) return 'RESTful API';
      if (name.includes('graphql')) return 'GraphQL API';
      if (name.includes('webhook')) return 'Webhook';
      return 'API';
    }

    // Step Functions purposes
    if (resourceType === 'AWS::StepFunctions::StateMachine') {
      if (name.includes('ingestion')) return 'DataIngestion';
      if (name.includes('process')) return 'DataProcessing';
      if (name.includes('notification')) return 'NotificationOrchestration';
      if (name.includes('agent')) return 'AgentWorkflow';
      if (name.includes('workflow')) return 'Orchestration';
      return 'Workflow';
    }

    // CloudWatch purposes
    if (resourceType === 'AWS::Logs::LogGroup') {
      return 'Logs';
    }
    
    if (resourceType === 'AWS::CloudWatch::Alarm') {
      return 'Alarms';
    }

    // KMS purposes
    if (resourceType.startsWith('AWS::KMS::')) {
      if (name.includes('database') || name.includes('rds')) return 'DatabaseEncryption';
      if (name.includes('s3') || name.includes('bucket')) return 'S3Encryption';
      if (name.includes('secret')) return 'SecretsEncryption';
      return 'GeneralEncryption';
    }

    // Cognito purposes
    if (resourceType === 'AWS::Cognito::UserPool') {
      return 'UserAuthentication';
    }
    
    if (resourceType === 'AWS::Cognito::IdentityPool') {
      return 'IdentityManagement';
    }
    
    if (resourceType === 'AWS::Cognito::UserPoolClient') {
      return 'ClientAuthentication';
    }

    // VPC purposes
    if (resourceType === 'AWS::EC2::VPC') {
      return 'NetworkIsolation';
    }
    
    if (resourceType === 'AWS::EC2::Subnet') {
      if (name.includes('public')) return 'PublicSubnet';
      if (name.includes('private')) return 'PrivateSubnet';
      if (name.includes('isolated')) return 'IsolatedSubnet';
      return 'Subnet';
    }
    
    if (resourceType === 'AWS::EC2::SecurityGroup') {
      return 'NetworkSecurity';
    }

    // SNS purposes
    if (resourceType === 'AWS::SNS::Topic') {
      if (name.includes('alert')) return 'Alerting';
      if (name.includes('notification')) return 'Notifications';
      return 'Messaging';
    }

    // SQS purposes
    if (resourceType === 'AWS::SQS::Queue') {
      if (name.includes('dlq') || name.includes('deadletter')) return 'DeadLetterQueue';
      if (name.includes('job')) return 'JobQueue';
      return 'MessageQueue';
    }

    // Default purpose
    return 'General';
  }

  /**
   * Check if a resource type is a data storage resource
   * Data storage resources require DataClassification tags
   * @param resourceType AWS CloudFormation resource type
   * @returns True if resource stores data
   */
  isDataStorageResource(resourceType: ResourceType): boolean {
    return DATA_STORAGE_RESOURCE_TYPES.includes(resourceType as any);
  }

  /**
   * Check if a resource type is production-critical
   * Production-critical resources require additional compliance tags
   * @param resourceType AWS CloudFormation resource type
   * @returns True if resource is production-critical
   */
  isProductionCritical(resourceType: ResourceType): boolean {
    return PRODUCTION_CRITICAL_RESOURCE_TYPES.includes(resourceType as any);
  }
}

