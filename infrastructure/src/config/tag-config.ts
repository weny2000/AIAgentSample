/**
 * AWS Resource Tagging Configuration
 * 
 * This module defines the centralized tag configuration for all AWS resources
 * in the AI Agent System infrastructure. It includes tag schemas, validation
 * rules, and environment-specific values.
 */

// ============================================================================
// Tag Interfaces
// ============================================================================

/**
 * Mandatory tags that must be applied to all AWS resources
 */
export interface MandatoryTags {
  Project: string;
  Stage: string;
  ManagedBy: string;
  Component: string;
  Owner: string;
  CostCenter: string;
  Environment: string;
  CreatedDate: string;
  CreatedBy: string;
}

/**
 * Optional tags that may be applied based on resource type and requirements
 */
export interface OptionalTags {
  DataClassification?: 'Public' | 'Internal' | 'Confidential' | 'Restricted';
  BackupPolicy?: 'Daily' | 'Weekly' | 'Monthly' | 'None';
  ComplianceScope?: string;
  AutoShutdown?: 'true' | 'false';
  MaintenanceWindow?: string;
  LastModifiedDate?: string;
}

/**
 * Lambda function specific tags
 */
export interface LambdaTags {
  Component: 'Compute-Lambda';
  FunctionPurpose: string;
  Runtime: string;
}

/**
 * DynamoDB table specific tags
 */
export interface DynamoDBTags {
  Component: 'Database-DynamoDB';
  TablePurpose: string;
  DataClassification: 'Internal' | 'Confidential';
}

/**
 * S3 bucket specific tags
 */
export interface S3Tags {
  Component: 'Storage-S3';
  BucketPurpose: string;
  DataClassification: 'Internal' | 'Confidential' | 'Restricted';
  BackupPolicy: 'Daily' | 'Weekly' | 'Monthly' | 'None';
}

/**
 * RDS database specific tags
 */
export interface RDSTags {
  Component: 'Database-RDS';
  Engine: string;
  DataClassification: 'Confidential';
  BackupPolicy: 'Daily' | 'Weekly';
}

/**
 * VPC and network resource specific tags
 */
export interface VPCTags {
  Component: 'Network-VPC';
  NetworkTier?: 'Public' | 'Private' | 'Isolated';
}

/**
 * API Gateway specific tags
 */
export interface ApiGatewayTags {
  Component: 'API-Gateway';
  ApiPurpose: string;
}

/**
 * Step Functions specific tags
 */
export interface StepFunctionsTags {
  Component: 'Orchestration-StepFunctions';
  WorkflowPurpose: string;
}

/**
 * CloudWatch resource specific tags
 */
export interface CloudWatchTags {
  Component: 'Monitoring-CloudWatch';
  MonitoringType: 'Logs' | 'Metrics' | 'Alarms';
}

/**
 * KMS key specific tags
 */
export interface KMSTags {
  Component: 'Security-KMS';
  KeyPurpose: string;
}

/**
 * Cognito resource specific tags
 */
export interface CognitoTags {
  Component: 'Security-Cognito';
  AuthPurpose: string;
}

/**
 * Resource-specific tag templates
 */
export interface ResourceSpecificTags {
  lambda: LambdaTags;
  dynamodb: DynamoDBTags;
  s3: S3Tags;
  rds: RDSTags;
  vpc: VPCTags;
  apiGateway: ApiGatewayTags;
  stepFunctions: StepFunctionsTags;
  cloudwatch: CloudWatchTags;
  kms: KMSTags;
  cognito: CognitoTags;
}

/**
 * Environment-specific tag configuration
 */
export interface EnvironmentSpecificTags {
  Stage: string;
  Environment: string;
  CostCenter: string;
  AutoShutdown: 'true' | 'false';
  ComplianceScope: string;
}

/**
 * Complete tag configuration
 */
export interface TagConfig {
  mandatory: Partial<MandatoryTags>;
  optional: OptionalTags;
  resourceSpecific: ResourceSpecificTags;
  environmentSpecific: Record<string, EnvironmentSpecificTags>;
}

// ============================================================================
// Tag Validation Constraints
// ============================================================================

/**
 * AWS tag key and value constraints
 */
export const TAG_CONSTRAINTS = {
  MAX_KEY_LENGTH: 128,
  MAX_VALUE_LENGTH: 256,
  // AWS allows alphanumeric characters, spaces, and special characters: + - = . _ : / @
  ALLOWED_KEY_PATTERN: /^[\w\s+\-=._:/@]+$/,
  ALLOWED_VALUE_PATTERN: /^[\w\s+\-=._:/@]*$/,
} as const;

/**
 * Validate tag key format
 */
export function validateTagKey(key: string): { valid: boolean; error?: string } {
  if (!key || key.length === 0) {
    return { valid: false, error: 'Tag key cannot be empty' };
  }
  
  if (key.length > TAG_CONSTRAINTS.MAX_KEY_LENGTH) {
    return { 
      valid: false, 
      error: `Tag key exceeds maximum length of ${TAG_CONSTRAINTS.MAX_KEY_LENGTH} characters` 
    };
  }
  
  if (!TAG_CONSTRAINTS.ALLOWED_KEY_PATTERN.test(key)) {
    return { 
      valid: false, 
      error: 'Tag key contains invalid characters. Allowed: alphanumeric, spaces, + - = . _ : / @' 
    };
  }
  
  return { valid: true };
}

/**
 * Validate tag value format
 */
export function validateTagValue(value: string): { valid: boolean; error?: string } {
  if (value.length > TAG_CONSTRAINTS.MAX_VALUE_LENGTH) {
    return { 
      valid: false, 
      error: `Tag value exceeds maximum length of ${TAG_CONSTRAINTS.MAX_VALUE_LENGTH} characters` 
    };
  }
  
  if (!TAG_CONSTRAINTS.ALLOWED_VALUE_PATTERN.test(value)) {
    return { 
      valid: false, 
      error: 'Tag value contains invalid characters. Allowed: alphanumeric, spaces, + - = . _ : / @' 
    };
  }
  
  return { valid: true };
}

// ============================================================================
// Resource Type to Component Mapping
// ============================================================================

/**
 * Mapping of AWS CloudFormation resource types to component names
 */
export const RESOURCE_TYPE_TO_COMPONENT: Record<string, string> = {
  'AWS::Lambda::Function': 'Compute-Lambda',
  'AWS::DynamoDB::Table': 'Database-DynamoDB',
  'AWS::S3::Bucket': 'Storage-S3',
  'AWS::RDS::DBInstance': 'Database-RDS',
  'AWS::RDS::DBCluster': 'Database-RDS',
  'AWS::EC2::VPC': 'Network-VPC',
  'AWS::EC2::Subnet': 'Network-VPC',
  'AWS::EC2::RouteTable': 'Network-VPC',
  'AWS::EC2::InternetGateway': 'Network-VPC',
  'AWS::EC2::NatGateway': 'Network-VPC',
  'AWS::EC2::SecurityGroup': 'Network-SecurityGroup',
  'AWS::EC2::VPCEndpoint': 'Network-VPCEndpoint',
  'AWS::ApiGateway::RestApi': 'API-Gateway',
  'AWS::ApiGatewayV2::Api': 'API-Gateway',
  'AWS::StepFunctions::StateMachine': 'Orchestration-StepFunctions',
  'AWS::Logs::LogGroup': 'Monitoring-CloudWatch',
  'AWS::CloudWatch::Alarm': 'Monitoring-CloudWatch',
  'AWS::SNS::Topic': 'Monitoring-SNS',
  'AWS::SQS::Queue': 'Messaging-SQS',
  'AWS::KMS::Key': 'Security-KMS',
  'AWS::KMS::Alias': 'Security-KMS',
  'AWS::Cognito::UserPool': 'Security-Cognito',
  'AWS::Cognito::UserPoolClient': 'Security-Cognito',
  'AWS::Cognito::IdentityPool': 'Security-Cognito',
  'AWS::IAM::Role': 'Security-IAM',
  'AWS::IAM::Policy': 'Security-IAM',
  'AWS::SecretsManager::Secret': 'Security-SecretsManager',
  'AWS::EventBridge::Rule': 'Events-EventBridge',
  'AWS::Kendra::Index': 'Search-Kendra',
} as const;

/**
 * Data storage resource types that require DataClassification tag
 */
export const DATA_STORAGE_RESOURCE_TYPES = [
  'AWS::S3::Bucket',
  'AWS::DynamoDB::Table',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::Kendra::Index',
] as const;

/**
 * Production-critical resource types
 */
export const PRODUCTION_CRITICAL_RESOURCE_TYPES = [
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::DynamoDB::Table',
  'AWS::Lambda::Function',
  'AWS::ApiGateway::RestApi',
  'AWS::StepFunctions::StateMachine',
] as const;

// ============================================================================
// Environment-Specific Configuration
// ============================================================================

/**
 * Environment-specific tag values
 */
export const ENVIRONMENT_CONFIGS: Record<string, EnvironmentSpecificTags> = {
  dev: {
    Stage: 'dev',
    Environment: 'Development',
    CostCenter: 'Development',
    AutoShutdown: 'true',
    ComplianceScope: 'None',
  },
  test: {
    Stage: 'test',
    Environment: 'Test',
    CostCenter: 'Development',
    AutoShutdown: 'true',
    ComplianceScope: 'None',
  },
  staging: {
    Stage: 'staging',
    Environment: 'Staging',
    CostCenter: 'QA',
    AutoShutdown: 'false',
    ComplianceScope: 'SOC2',
  },
  production: {
    Stage: 'production',
    Environment: 'Production',
    CostCenter: 'Production',
    AutoShutdown: 'false',
    ComplianceScope: 'HIPAA,SOC2,GDPR',
  },
} as const;

// ============================================================================
// Base Tag Configuration
// ============================================================================

/**
 * Get base mandatory tags (without environment-specific values)
 */
export function getBaseMandatoryTags(): Partial<MandatoryTags> {
  return {
    Project: 'AiAgentSystem',
    ManagedBy: 'CDK',
    CreatedDate: new Date().toISOString(),
    CreatedBy: 'CDK-Deployment',
  };
}

/**
 * Get complete tag configuration for a specific environment
 */
export function getTagConfig(stage: string): TagConfig {
  const envConfig = ENVIRONMENT_CONFIGS[stage] || ENVIRONMENT_CONFIGS.dev;
  
  return {
    mandatory: {
      ...getBaseMandatoryTags(),
      Stage: envConfig.Stage,
      Environment: envConfig.Environment,
      CostCenter: envConfig.CostCenter,
      Owner: 'Platform',
      Component: '', // Will be set per resource
    },
    optional: {
      AutoShutdown: envConfig.AutoShutdown,
      ComplianceScope: envConfig.ComplianceScope,
    },
    resourceSpecific: {} as ResourceSpecificTags,
    environmentSpecific: ENVIRONMENT_CONFIGS,
  };
}

/**
 * List of mandatory tag keys
 */
export const MANDATORY_TAG_KEYS: (keyof MandatoryTags)[] = [
  'Project',
  'Stage',
  'ManagedBy',
  'Component',
  'Owner',
  'CostCenter',
  'Environment',
  'CreatedDate',
  'CreatedBy',
];

/**
 * List of cost allocation tag keys
 */
export const COST_ALLOCATION_TAG_KEYS = [
  'Project',
  'Stage',
  'Environment',
  'Component',
  'Owner',
  'CostCenter',
] as const;
