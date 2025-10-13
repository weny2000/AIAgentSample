/**
 * Tests for S3 Bucket Tagging Implementation
 * 
 * Verifies that S3 buckets have proper resource-specific tags applied
 * including BucketPurpose, DataClassification, and BackupPolicy tags.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('S3 Bucket Tagging', () => {
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

    // Create KMS key for bucket encryption
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

  describe('Documents Bucket', () => {
    let documentsBucket: s3.Bucket;

    beforeEach(() => {
      documentsBucket = new s3.Bucket(stack, 'DocumentsBucket', {
        bucketName: `ai-agent-documents-test-123456789012`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: kmsKey,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
      });

      // Apply resource-specific tags
      tagManager.applyTags(documentsBucket, {
        BucketPurpose: 'Documents',
        DataClassification: 'Internal',
        BackupPolicy: 'Monthly',
      });

      template = Template.fromStack(stack);
    });

    it('should have BucketPurpose tag', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'BucketPurpose',
            Value: 'Documents',
          }),
        ]),
      });
    });

    it('should have DataClassification tag set to Internal', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'DataClassification',
            Value: 'Internal',
          }),
        ]),
      });
    });

    it('should have BackupPolicy tag', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'BackupPolicy',
            Value: 'Monthly',
          }),
        ]),
      });
    });

    it('should have mandatory tags from stack-level tagging', () => {
      const tags = template.toJSON().Resources.DocumentsBucket9EC9DEB9.Properties.Tags;
      const tagKeys = tags.map((t: any) => t.Key);
      
      expect(tagKeys).toContain('Project');
      expect(tagKeys).toContain('Stage');
      expect(tagKeys).toContain('ManagedBy');
    });
  });

  describe('Artifacts Bucket', () => {
    it('should apply correct tags to artifacts bucket', () => {
      const artifactsBucket = new s3.Bucket(stack, 'ArtifactsBucket', {
        bucketName: `ai-agent-artifacts-test-123456789012`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: kmsKey,
      });

      tagManager.applyTags(artifactsBucket, {
        BucketPurpose: 'Artifacts',
        DataClassification: 'Internal',
        BackupPolicy: 'Daily',
      });

      const testTemplate = Template.fromStack(stack);
      const resources = testTemplate.toJSON().Resources;
      const bucket = Object.values(resources).find((r: any) => 
        r.Type === 'AWS::S3::Bucket' && 
        r.Properties.BucketName === 'ai-agent-artifacts-test-123456789012'
      ) as any;
      
      const tags = bucket.Properties.Tags;
      const tagMap = Object.fromEntries(tags.map((t: any) => [t.Key, t.Value]));
      
      expect(tagMap.BucketPurpose).toBe('Artifacts');
      expect(tagMap.DataClassification).toBe('Internal');
      expect(tagMap.BackupPolicy).toBe('Daily');
    });
  });

  describe('Audit Logs Bucket', () => {
    it('should apply correct tags to audit logs bucket', () => {
      const auditLogsBucket = new s3.Bucket(stack, 'AuditLogsBucket', {
        bucketName: `ai-agent-audit-logs-test-123456789012`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: kmsKey,
      });

      tagManager.applyTags(auditLogsBucket, {
        BucketPurpose: 'AuditLogs',
        DataClassification: 'Confidential',
        BackupPolicy: 'Daily',
        ComplianceScope: 'SOC2',
      });

      const testTemplate = Template.fromStack(stack);
      const resources = testTemplate.toJSON().Resources;
      const bucket = Object.values(resources).find((r: any) => 
        r.Type === 'AWS::S3::Bucket' && 
        r.Properties.BucketName === 'ai-agent-audit-logs-test-123456789012'
      ) as any;
      
      const tags = bucket.Properties.Tags;
      const tagMap = Object.fromEntries(tags.map((t: any) => [t.Key, t.Value]));
      
      expect(tagMap.BucketPurpose).toBe('AuditLogs');
      expect(tagMap.DataClassification).toBe('Confidential');
      expect(tagMap.BackupPolicy).toBe('Daily');
      expect(tagMap.ComplianceScope).toBe('SOC2');
    });
  });

  describe('Mandatory Tags', () => {
    it('should have all mandatory tags on buckets', () => {
      const testBucket = new s3.Bucket(stack, 'TestBucket', {
        bucketName: `test-bucket-123456789012`,
      });

      tagManager.applyTags(testBucket, {
        BucketPurpose: 'Test',
        DataClassification: 'Internal',
      });

      const testTemplate = Template.fromStack(stack);
      const mandatoryTags = ['Project', 'Stage', 'ManagedBy', 'Owner', 'CostCenter', 'Environment'];
      
      mandatoryTags.forEach(tagKey => {
        testTemplate.hasResourceProperties('AWS::S3::Bucket', {
          Tags: Match.arrayWith([
            Match.objectLike({
              Key: tagKey,
              Value: Match.anyValue(),
            }),
          ]),
        });
      });
    });
  });

  describe('TagManager Integration', () => {
    it('should correctly derive bucket purpose from bucket name', () => {
      const tags = tagManager.getResourceTags('s3', 'DocumentsBucket');
      expect(tags.BucketPurpose).toBe('Documents');
    });

    it('should set default DataClassification for S3 buckets', () => {
      const tags = tagManager.getResourceTags('s3', 'TestBucket');
      expect(tags.DataClassification).toBe('Internal');
    });

    it('should set Component tag for S3 buckets', () => {
      const tags = tagManager.getResourceTags('s3', 'TestBucket');
      expect(tags.Component).toBe('Storage-S3');
    });
  });
});
