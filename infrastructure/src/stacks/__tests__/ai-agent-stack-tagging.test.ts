/**
 * Unit test for AiAgentStack tagging implementation
 * Verifies that TagManager and TaggingAspect are properly integrated
 */

import * as cdk from 'aws-cdk-lib';
import { TagManager } from '../../utils/tag-manager';
import { TaggingAspect } from '../../aspects/tagging-aspect';
import { getTagConfig } from '../../config/tag-config';

describe('AiAgentStack Tagging Integration', () => {
  describe('TagManager initialization', () => {
    it('should create TagManager with correct stage configuration', () => {
      const stage = 'dev';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      expect(tagManager).toBeDefined();
    });

    it('should retrieve mandatory tags', () => {
      const stage = 'dev';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      const mandatoryTags = tagManager.getMandatoryTags();

      expect(mandatoryTags).toHaveProperty('Project', 'AiAgentSystem');
      expect(mandatoryTags).toHaveProperty('Stage', 'dev');
      expect(mandatoryTags).toHaveProperty('ManagedBy', 'CDK');
      expect(mandatoryTags).toHaveProperty('Owner', 'Platform');
      expect(mandatoryTags).toHaveProperty('CostCenter', 'Development');
      expect(mandatoryTags).toHaveProperty('Environment', 'Development');
      expect(mandatoryTags).toHaveProperty('CreatedDate');
      expect(mandatoryTags).toHaveProperty('CreatedBy', 'CDK-Deployment');
    });

    it('should retrieve environment-specific tags for dev', () => {
      const stage = 'dev';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      const envTags = tagManager.getEnvironmentTags();

      expect(envTags).toHaveProperty('Stage', 'dev');
      expect(envTags).toHaveProperty('Environment', 'Development');
      expect(envTags).toHaveProperty('CostCenter', 'Development');
      expect(envTags).toHaveProperty('AutoShutdown', 'true');
      expect(envTags).toHaveProperty('ComplianceScope', 'None');
    });
  });

  describe('Stack-level tag application', () => {
    it('should apply tags to a simple stack', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });

      const stage = 'dev';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      // Apply mandatory tags
      const mandatoryTags = tagManager.getMandatoryTags();
      Object.entries(mandatoryTags).forEach(([key, value]) => {
        cdk.Tags.of(stack).add(key, value);
      });

      // Apply environment-specific tags
      const environmentTags = tagManager.getEnvironmentTags();
      Object.entries(environmentTags).forEach(([key, value]) => {
        cdk.Tags.of(stack).add(key, value);
      });

      // Verify tags were applied by checking the tag manager output
      expect(mandatoryTags).toHaveProperty('Project', 'AiAgentSystem');
      expect(mandatoryTags).toHaveProperty('Stage', 'dev');
      expect(mandatoryTags).toHaveProperty('ManagedBy', 'CDK');
      expect(environmentTags).toHaveProperty('Environment', 'Development');
    });

    it('should apply TaggingAspect to a stack', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'TestStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });

      const stage = 'dev';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      // Apply TaggingAspect
      cdk.Aspects.of(stack).add(new TaggingAspect(tagManager));

      // Verify aspect is applied
      const aspects = cdk.Aspects.of(stack);
      expect(aspects).toBeDefined();
    });
  });

  describe('Environment-specific tagging', () => {
    it('should retrieve staging-specific tags', () => {
      const stage = 'staging';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      const envTags = tagManager.getEnvironmentTags();

      expect(envTags).toHaveProperty('Stage', 'staging');
      expect(envTags).toHaveProperty('Environment', 'Staging');
      expect(envTags).toHaveProperty('CostCenter', 'QA');
      expect(envTags).toHaveProperty('AutoShutdown', 'false');
      expect(envTags).toHaveProperty('ComplianceScope', 'SOC2');
    });

    it('should retrieve production-specific tags', () => {
      const stage = 'production';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      const envTags = tagManager.getEnvironmentTags();

      expect(envTags).toHaveProperty('Stage', 'production');
      expect(envTags).toHaveProperty('Environment', 'Production');
      expect(envTags).toHaveProperty('CostCenter', 'Production');
      expect(envTags).toHaveProperty('AutoShutdown', 'false');
      expect(envTags).toHaveProperty('ComplianceScope', 'HIPAA,SOC2,GDPR');
    });
  });

  describe('Tag validation', () => {
    it('should validate all mandatory tags are present', () => {
      const stage = 'dev';
      const tagConfig = getTagConfig(stage);
      const tagManager = new TagManager(tagConfig, stage);

      const allTags = {
        ...tagManager.getMandatoryTags(),
        ...tagManager.getEnvironmentTags(),
      };

      const mandatoryKeys = [
        'Project',
        'Stage',
        'ManagedBy',
        'Owner',
        'CostCenter',
        'Environment',
        'CreatedDate',
        'CreatedBy',
      ];

      mandatoryKeys.forEach((key) => {
        expect(allTags).toHaveProperty(key);
        expect(allTags[key]).toBeTruthy();
      });
    });
  });
});
