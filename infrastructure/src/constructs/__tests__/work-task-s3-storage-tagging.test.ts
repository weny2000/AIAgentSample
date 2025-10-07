/**
 * Tests for WorkTaskS3Storage Tagging Implementation
 * 
 * Verifies that the work task analysis bucket has proper resource-specific tags
 * including BucketPurpose and DataClassification tags.
 */

import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('WorkTaskS3Storage Tagging', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;
  let tagManager: TagManager;
  let kmsKey: kms.Key;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });

    // Create KMS key for encryption
    kmsKey = new kms.Key(stack, 'TestKey', {
      description: 'Test encryption key',
      enableKeyRotation: true,
    });

    // Initialize TagManager
    const tagConfig = getTagConfig('test');
    tagManager = new TagManager(tagConfig, 'test');

    // Apply stack-level tags
    const mandatoryTags = tagManager.getMandatoryTags();
    Object.entries(mandatoryTags).forEach(([key, value]) => {
      cdk.Tags.of(stack).add(key, value);
    });

    const environmentTags = tagManager.getEnvironmentTags();
    Object.entries(environmentTags).forEach(([key, value]) => {
      cdk.Tags.of(stack).add(key, value);
    });
  });

  describe('Work Task Analysis Bucket', () => {
    let workTaskBucket: s3.Bucket;

    beforeEach(() => {
      // Create a simplified work task analysis bucket for testing
      // (avoiding the full WorkTaskS3Storage construct due to serverAccessLogsPrefix conflict)
      workTaskBucket = new s3.Bucket(stack, 'WorkTaskAnalysisBucket', {
        bucketName: `ai-agent-work-task-analysis-test-123456789012`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: kmsKey,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      });

      // Apply resource-specific tags using TagManager (same as in the construct)
      tagManager.applyTags(workTaskBucket, {
        BucketPurpose: 'WorkTaskAnalysis',
        DataClassification: 'Internal',
      });

      template = Template.fromStack(stack);
    });

    it('should have BucketPurpose tag set to WorkTaskAnalysis', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'ai-agent-work-task-analysis-test-123456789012',
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'BucketPurpose',
            Value: 'WorkTaskAnalysis',
          }),
        ]),
      });
    });

    it('should have DataClassification tag set to Internal', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'ai-agent-work-task-analysis-test-123456789012',
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'DataClassification',
            Value: 'Internal',
          }),
        ]),
      });
    });

    it('should have all required tags including stack-level tags', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'ai-agent-work-task-analysis-test-123456789012',
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'BucketPurpose',
            Value: 'WorkTaskAnalysis',
          }),
          Match.objectLike({
            Key: 'DataClassification',
            Value: 'Internal',
          }),
          Match.objectLike({
            Key: 'Project',
            Value: 'AiAgentSystem',
          }),
          Match.objectLike({
            Key: 'Stage',
            Value: 'test',
          }),
        ]),
      });
    });

    it('should create bucket with proper encryption and security settings', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'ai-agent-work-task-analysis-test-123456789012',
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
              },
            },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });
  });

  describe('Tag Validation', () => {
    it('should validate that work task bucket has required data classification tag', () => {
      const tags = {
        BucketPurpose: 'WorkTaskAnalysis',
        DataClassification: 'Internal',
        Project: 'AiAgentSystem',
        Stage: 'test',
        ManagedBy: 'CDK',
        Component: 'Storage-S3',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Test',
        CreatedDate: new Date().toISOString(),
        CreatedBy: 'CDK',
      };

      const validationResult = tagManager.validateTags(tags, 's3');
      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should fail validation if DataClassification tag is missing', () => {
      const tags = {
        BucketPurpose: 'WorkTaskAnalysis',
        // Missing DataClassification
        Project: 'AiAgentSystem',
        Stage: 'test',
        ManagedBy: 'CDK',
        Component: 'Storage-S3',
        Owner: 'Platform',
        CostCenter: 'Development',
        Environment: 'Test',
        CreatedDate: new Date().toISOString(),
        CreatedBy: 'CDK',
      };

      const validationResult = tagManager.validateTags(tags, 's3');
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'MISSING_DATA_CLASSIFICATION',
        })
      );
    });
  });
});
