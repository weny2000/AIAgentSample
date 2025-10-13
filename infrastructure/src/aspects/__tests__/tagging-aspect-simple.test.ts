/**
 * Simplified unit tests for TaggingAspect to verify core functionality
 */

import { Stack, App, Aspects } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template } from 'aws-cdk-lib/assertions';
import { TaggingAspect } from '../tagging-aspect';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('TaggingAspect - Core Functionality', () => {
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

  function getResourceTags(template: Template, resourceType: string): any[] {
    const resources = template.findResources(resourceType);
    const resource = Object.values(resources)[0];
    return resource?.Properties?.Tags || resource?.Properties?.UserPoolTags || [];
  }

  function hasTag(tags: any[], key: string, value?: string): boolean {
    if (Array.isArray(tags)) {
      return tags.some(tag => tag.Key === key && (value === undefined || tag.Value === value));
    } else if (typeof tags === 'object') {
      return tags[key] !== undefined && (value === undefined || tags[key] === value);
    }
    return false;
  }

  it('should apply mandatory tags to Lambda functions', () => {
    new lambda.Function(stack, 'TestFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {};'),
    });

    Aspects.of(stack).add(aspect);
    const template = Template.fromStack(stack);
    const tags = getResourceTags(template, 'AWS::Lambda::Function');

    expect(hasTag(tags, 'Project', 'AiAgentSystem')).toBe(true);
    expect(hasTag(tags, 'ManagedBy', 'CDK')).toBe(true);
    expect(hasTag(tags, 'Component', 'Compute-Lambda')).toBe(true);
    expect(hasTag(tags, 'Stage', 'dev')).toBe(true);
  });

  it('should apply resource-specific tags to DynamoDB tables', () => {
    new dynamodb.Table(stack, 'TeamRosterTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });

    Aspects.of(stack).add(aspect);
    const template = Template.fromStack(stack);
    const tags = getResourceTags(template, 'AWS::DynamoDB::Table');

    expect(hasTag(tags, 'Component', 'Database-DynamoDB')).toBe(true);
    expect(hasTag(tags, 'TablePurpose')).toBe(true);
    expect(hasTag(tags, 'DataClassification')).toBe(true);
  });

  it('should apply resource-specific tags to S3 buckets', () => {
    new s3.Bucket(stack, 'ArtifactBucket');

    Aspects.of(stack).add(aspect);
    const template = Template.fromStack(stack);
    const tags = getResourceTags(template, 'AWS::S3::Bucket');

    expect(hasTag(tags, 'Component', 'Storage-S3')).toBe(true);
    expect(hasTag(tags, 'BucketPurpose')).toBe(true);
    expect(hasTag(tags, 'DataClassification')).toBe(true);
    expect(hasTag(tags, 'BackupPolicy')).toBe(true);
  });

  it('should not tag the same resource twice', () => {
    const func = new lambda.Function(stack, 'TestFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {};'),
    });

    aspect.visit(func);
    aspect.visit(func);

    const taggedResources = aspect.getTaggedResources();
    const funcPath = func.node.path;
    
    let count = 0;
    taggedResources.forEach(path => {
      if (path === funcPath) count++;
    });
    
    expect(count).toBeLessThanOrEqual(1);
  });

  it('should track tagged resources', () => {
    new lambda.Function(stack, 'TrackedFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {};'),
    });

    Aspects.of(stack).add(aspect);
    Template.fromStack(stack);

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
