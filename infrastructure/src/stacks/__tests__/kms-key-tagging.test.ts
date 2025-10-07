/**
 * Tests for KMS Key tagging implementation
 */

import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('KMS Key Tagging', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let tagManager: TagManager;

  // Helper function to create a simple stack with just a KMS key
  const createKmsKeyAndGetTemplate = (stage: string) => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Initialize TagManager
    const tagConfig = getTagConfig(stage);
    tagManager = new TagManager(tagConfig, stage);

    // Apply mandatory tags at stack level
    const mandatoryTags = tagManager.getMandatoryTags();
    Object.entries(mandatoryTags).forEach(([key, value]) => {
      cdk.Tags.of(stack).add(key, value);
    });

    // Apply environment-specific tags at stack level
    const environmentTags = tagManager.getEnvironmentTags();
    Object.entries(environmentTags).forEach(([key, value]) => {
      cdk.Tags.of(stack).add(key, value);
    });

    // Create KMS key
    const kmsKey = new kms.Key(stack, 'AiAgentKmsKey', {
      description: `AI Agent System encryption key for ${stage}`,
      enableKeyRotation: true,
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'Enable IAM User Permissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
        ],
      }),
    });

    // Apply resource-specific tags to KMS key
    tagManager.applyTags(kmsKey, {
      Component: 'Security-KMS',
      KeyPurpose: 'GeneralEncryption',
    });

    return Template.fromStack(stack);
  };

  describe('KMS Key Resource Tagging', () => {
    it('should apply tags to KMS key', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      // Check for key tags individually
      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
        ]),
      });
      
      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Stage', Value: 'dev' },
        ]),
      });
      
      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security-KMS' },
        ]),
      });
      
      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'KeyPurpose', Value: 'GeneralEncryption' },
        ]),
      });
    });

    it('should apply environment-specific tags to KMS key', () => {
      const template = createKmsKeyAndGetTemplate('production');

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Production' },
        ]),
      });
    });

    it('should have KeyPurpose tag describing encryption key purpose', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'KeyPurpose', Value: 'GeneralEncryption' },
        ]),
      });
    });
  });

  describe('Tag Consistency', () => {
    it('should apply mandatory tags to KMS key', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      // Check for Project and Stage tags
      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'dev' },
        ]),
      });
    });

    it('should apply Component tag with Security-KMS', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security-KMS' },
        ]),
      });
    });
  });

  describe('Environment-Specific Tagging', () => {
    it('should apply dev environment tags', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Development' },
        ]),
      });
    });

    it('should apply staging environment tags', () => {
      const template = createKmsKeyAndGetTemplate('staging');

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Staging' },
        ]),
      });
    });

    it('should apply production environment tags', () => {
      const template = createKmsKeyAndGetTemplate('production');

      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'Production' },
        ]),
      });
    });
  });

  describe('KMS Key Configuration', () => {
    it('should have key rotation enabled', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });

    it('should have appropriate key policy', () => {
      const template = createKmsKeyAndGetTemplate('dev');

      template.hasResourceProperties('AWS::KMS::Key', {
        KeyPolicy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'Enable IAM User Permissions',
              Effect: 'Allow',
            }),
          ]),
        }),
      });
    });
  });
});
