/**
 * TaggingAspect - CDK Aspect for Automatic Tag Application
 * 
 * This aspect automatically applies standardized tags to all AWS resources
 * in the CDK construct tree. It traverses the tree, identifies resource types,
 * and applies appropriate mandatory, environment-specific, and resource-specific tags.
 * 
 * Usage:
 *   const tagManager = new TagManager(tagConfig, stage);
 *   const aspect = new TaggingAspect(tagManager);
 *   Aspects.of(stack).add(aspect);
 */

import { IConstruct } from 'constructs';
import { IAspect, CfnResource } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { TagManager } from '../utils/tag-manager';
import { ResourceTypeMapper } from '../utils/resource-type-mapper';

/**
 * TaggingAspect implements IAspect to automatically apply tags to all resources
 */
export class TaggingAspect implements IAspect {
  private tagManager: TagManager;
  private resourceTypeMapper: ResourceTypeMapper;
  private taggedResources: Set<string>;

  /**
   * Create a new TaggingAspect
   * @param tagManager TagManager instance for retrieving and applying tags
   */
  constructor(tagManager: TagManager) {
    this.tagManager = tagManager;
    this.resourceTypeMapper = new ResourceTypeMapper();
    this.taggedResources = new Set<string>();
  }

  /**
   * Visit method called for each construct in the tree
   * @param node CDK construct to visit
   */
  visit(node: IConstruct): void {
    // Skip if already tagged
    const nodeId = node.node.path;
    if (this.taggedResources.has(nodeId)) {
      return;
    }

    // Get resource type
    const resourceType = this.resourceTypeMapper.getResourceType(node);

    // Skip unknown or non-taggable resources
    if (resourceType === 'Unknown' || !this.isTaggableResource(node, resourceType)) {
      return;
    }

    // Get construct ID for tag derivation
    const constructId = node.node.id;

    // Handle special cases first
    if (this.handleSpecialCase(node, resourceType, constructId)) {
      this.taggedResources.add(nodeId);
      return;
    }

    // Get appropriate tags for this resource
    const tags = this.getTagsForNode(node, resourceType, constructId);

    // Apply tags to the resource
    this.tagManager.applyTags(node, tags);

    // Mark as tagged
    this.taggedResources.add(nodeId);
  }

  /**
   * Get appropriate tags for a node based on its type and characteristics
   * @param node CDK construct
   * @param resourceType AWS CloudFormation resource type
   * @param constructId Construct ID
   * @returns Tags to apply
   */
  private getTagsForNode(
    node: IConstruct,
    resourceType: string,
    constructId: string
  ): Record<string, string> {
    // Get component name from resource type
    const componentName = this.resourceTypeMapper.getComponentName(resourceType, constructId);

    // Get resource purpose
    const purpose = this.resourceTypeMapper.getResourcePurpose(resourceType, constructId);

    // Build custom tags based on resource type
    const customTags: Record<string, string> = {
      Component: componentName,
    };

    // Add purpose-specific tags
    this.addPurposeTags(customTags, resourceType, purpose, node);

    // Get simplified resource type for TagManager
    const simplifiedType = this.getSimplifiedResourceType(resourceType);

    // Get all tags from TagManager
    const allTags = this.tagManager.getTagsForResource(
      simplifiedType,
      constructId,
      customTags
    );

    return allTags;
  }

  /**
   * Add purpose-specific tags based on resource type
   * @param tags Tags object to modify
   * @param resourceType AWS CloudFormation resource type
   * @param purpose Derived purpose
   * @param node CDK construct for additional context
   */
  private addPurposeTags(
    tags: Record<string, string>,
    resourceType: string,
    purpose: string,
    node: IConstruct
  ): void {
    // Lambda function tags
    if (resourceType === 'AWS::Lambda::Function' && node instanceof lambda.Function) {
      tags.FunctionPurpose = purpose;
      tags.Runtime = node.runtime?.name || 'Unknown';
    }

    // DynamoDB table tags
    if (resourceType === 'AWS::DynamoDB::Table') {
      tags.TablePurpose = purpose;
    }

    // S3 bucket tags
    if (resourceType === 'AWS::S3::Bucket') {
      tags.BucketPurpose = purpose;
    }

    // RDS tags
    if (resourceType.startsWith('AWS::RDS::')) {
      tags.Engine = 'PostgreSQL'; // Default, can be enhanced
    }

    // API Gateway tags
    if (resourceType.startsWith('AWS::ApiGateway')) {
      tags.ApiPurpose = purpose;
    }

    // Step Functions tags
    if (resourceType === 'AWS::StepFunctions::StateMachine') {
      tags.WorkflowPurpose = purpose;
    }

    // CloudWatch tags
    if (resourceType === 'AWS::Logs::LogGroup') {
      tags.MonitoringType = 'Logs';
    }

    if (resourceType === 'AWS::CloudWatch::Alarm') {
      tags.MonitoringType = 'Alarms';
    }

    // KMS tags
    if (resourceType.startsWith('AWS::KMS::')) {
      tags.KeyPurpose = purpose;
    }

    // Cognito tags
    if (resourceType.startsWith('AWS::Cognito::')) {
      tags.AuthPurpose = purpose;
    }

    // VPC subnet tags
    if (resourceType === 'AWS::EC2::Subnet' && node instanceof ec2.Subnet) {
      // NetworkTier will be added in special case handling
    }
  }

  /**
   * Handle special cases for resources with non-standard tagging
   * @param node CDK construct
   * @param resourceType AWS CloudFormation resource type
   * @param constructId Construct ID
   * @returns True if special case was handled
   */
  private handleSpecialCase(
    node: IConstruct,
    resourceType: string,
    constructId: string
  ): boolean {
    // CloudWatch Log Groups created by Lambda
    if (resourceType === 'AWS::Logs::LogGroup' && node instanceof logs.LogGroup) {
      const logGroupName = (node as any).logGroupName;
      if (logGroupName && logGroupName.includes('/aws/lambda/')) {
        // Extract Lambda function name
        const functionName = logGroupName.split('/').pop() || 'Unknown';
        
        const tags = this.tagManager.getTagsForResource('cloudwatch', constructId, {
          Component: 'Monitoring-CloudWatch',
          MonitoringType: 'Logs',
          AssociatedResource: functionName,
        });
        
        this.tagManager.applyTags(node, tags);
        return true;
      }
    }

    // VPC Subnets - add NetworkTier tag
    if (resourceType === 'AWS::EC2::Subnet' && node instanceof ec2.Subnet) {
      const tags = this.tagManager.getTagsForResource('vpc', constructId, {
        Component: 'Network-VPC',
      });
      
      this.tagManager.applyTags(node, tags);
      
      // Add NetworkTier based on subnet type (determined by construct ID)
      const subnetId = constructId.toLowerCase();
      if (subnetId.includes('public')) {
        this.tagManager.applyTags(node, { NetworkTier: 'Public' });
      } else if (subnetId.includes('private')) {
        this.tagManager.applyTags(node, { NetworkTier: 'Private' });
      } else if (subnetId.includes('isolated')) {
        this.tagManager.applyTags(node, { NetworkTier: 'Isolated' });
      }
      
      return true;
    }

    // IAM Roles and Policies - these may not support all tags
    if (resourceType === 'AWS::IAM::Role' || resourceType === 'AWS::IAM::Policy') {
      // IAM resources have limited tag support, apply only basic tags
      const basicTags = {
        Project: 'AiAgentSystem',
        ManagedBy: 'CDK',
        Component: this.resourceTypeMapper.getComponentName(resourceType, constructId),
      };
      
      this.tagManager.applyTags(node, basicTags);
      return true;
    }

    // Cognito UserPool - uses UserPoolTags instead of Tags
    if (resourceType === 'AWS::Cognito::UserPool' && node instanceof cognito.UserPool) {
      const tags = this.tagManager.getTagsForResource('cognito', constructId, {
        Component: 'Security-Cognito',
        AuthPurpose: this.resourceTypeMapper.getResourcePurpose(resourceType, constructId),
      });
      
      // Apply tags using the standard method (CDK handles UserPoolTags internally)
      this.tagManager.applyTags(node, tags);
      return true;
    }

    return false;
  }

  /**
   * Check if a resource is taggable
   * Some CDK constructs don't support tagging or are not actual resources
   * @param node CDK construct
   * @param resourceType AWS CloudFormation resource type
   * @returns True if resource can be tagged
   */
  private isTaggableResource(node: IConstruct, resourceType: string): boolean {
    // CfnResource types are taggable if they have a tags property
    if (node instanceof CfnResource) {
      // Most CfnResources support tags, but some don't
      // We'll attempt to tag and let CDK handle unsupported cases
      return true;
    }

    // L2 constructs that support tagging
    const taggableConstructs = [
      lambda.Function,
      logs.LogGroup,
      ec2.Vpc,
      ec2.Subnet,
      ec2.SecurityGroup,
    ];

    // Check if node is an instance of any taggable construct
    for (const ConstructClass of taggableConstructs) {
      if (node instanceof ConstructClass) {
        return true;
      }
    }

    // Check resource type patterns
    const taggableResourcePatterns = [
      'AWS::Lambda::',
      'AWS::DynamoDB::',
      'AWS::S3::',
      'AWS::RDS::',
      'AWS::EC2::',
      'AWS::ApiGateway::',
      'AWS::StepFunctions::',
      'AWS::Logs::',
      'AWS::CloudWatch::',
      'AWS::KMS::',
      'AWS::Cognito::',
      'AWS::SNS::',
      'AWS::SQS::',
      'AWS::SecretsManager::',
      'AWS::EventBridge::',
      'AWS::Kendra::',
    ];

    return taggableResourcePatterns.some(pattern => resourceType.startsWith(pattern));
  }

  /**
   * Get simplified resource type for TagManager
   * Converts CloudFormation types to simplified types used by TagManager
   * @param resourceType AWS CloudFormation resource type
   * @returns Simplified resource type
   */
  private getSimplifiedResourceType(resourceType: string): string {
    if (resourceType === 'AWS::Lambda::Function') return 'lambda';
    if (resourceType === 'AWS::DynamoDB::Table') return 'dynamodb';
    if (resourceType === 'AWS::S3::Bucket') return 's3';
    if (resourceType.startsWith('AWS::RDS::')) return 'rds';
    if (resourceType.startsWith('AWS::EC2::VPC') || resourceType === 'AWS::EC2::Subnet') return 'vpc';
    if (resourceType.startsWith('AWS::ApiGateway')) return 'apigateway';
    if (resourceType === 'AWS::StepFunctions::StateMachine') return 'stepfunctions';
    if (resourceType.startsWith('AWS::Logs::') || resourceType.startsWith('AWS::CloudWatch::')) return 'cloudwatch';
    if (resourceType.startsWith('AWS::KMS::')) return 'kms';
    if (resourceType.startsWith('AWS::Cognito::')) return 'cognito';
    
    // Default to lowercase first part after AWS::
    const parts = resourceType.split('::');
    return parts.length > 1 ? parts[1].toLowerCase() : 'unknown';
  }

  /**
   * Get the set of tagged resource paths (for testing/debugging)
   * @returns Set of resource paths that have been tagged
   */
  getTaggedResources(): Set<string> {
    return new Set(this.taggedResources);
  }

  /**
   * Reset the tagged resources set (useful for testing)
   */
  resetTaggedResources(): void {
    this.taggedResources.clear();
  }
}
