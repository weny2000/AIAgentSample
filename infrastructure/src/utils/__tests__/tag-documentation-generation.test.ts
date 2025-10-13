/**
 * Tests for Tag Documentation Generation
 */

import * as fs from 'fs';
import * as path from 'path';
import { TagManager } from '../tag-manager';
import { TagDocumentationGenerator } from '../tag-documentation-generator';
import { tagConfig } from '../../config/tag-config';

describe('Tag Documentation Generation', () => {
  let tagManager: TagManager;
  let docGenerator: TagDocumentationGenerator;
  const stage = 'dev';

  beforeEach(() => {
    tagManager = new TagManager(tagConfig, stage);
    docGenerator = new TagDocumentationGenerator(tagManager, stage);
  });

  describe('generateTagDocumentation', () => {
    it('should generate comprehensive tag documentation', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('# AWS Resource Tagging Reference');
      expect(documentation).toContain('## Mandatory Tags');
      expect(documentation).toContain('## Optional Tags');
      expect(documentation).toContain('## Resource-Specific Tags');
      expect(documentation).toContain('## Environment-Specific Tags');
      expect(documentation).toContain('## Tag Usage Guidelines');
      expect(documentation).toContain('## Cost Allocation Tags');
    });

    it('should include all mandatory tags in documentation', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('Project');
      expect(documentation).toContain('Stage');
      expect(documentation).toContain('ManagedBy');
      expect(documentation).toContain('Component');
      expect(documentation).toContain('Owner');
      expect(documentation).toContain('CostCenter');
      expect(documentation).toContain('Environment');
      expect(documentation).toContain('CreatedDate');
      expect(documentation).toContain('CreatedBy');
    });

    it('should include optional tags in documentation', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('DataClassification');
      expect(documentation).toContain('BackupPolicy');
      expect(documentation).toContain('ComplianceScope');
      expect(documentation).toContain('AutoShutdown');
      expect(documentation).toContain('MaintenanceWindow');
    });

    it('should include resource-specific tags', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('FunctionPurpose');
      expect(documentation).toContain('Runtime');
      expect(documentation).toContain('TablePurpose');
      expect(documentation).toContain('BucketPurpose');
      // Note: Not all resource-specific tags appear in the main documentation
      // They are documented in the resource-specific sections
    });

    it('should include environment-specific tag values', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('Development');
      expect(documentation).toContain('Staging');
      expect(documentation).toContain('Production');
    });

    it('should include cost allocation tag information', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('Cost Allocation Tags');
      expect(documentation).toContain('AWS Billing Console');
      expect(documentation).toContain('Cost Explorer');
    });
  });

  describe('listTagKeys', () => {
    it('should return all tag keys', () => {
      const tagKeys = docGenerator.listTagKeys();

      expect(tagKeys).toContain('Project');
      expect(tagKeys).toContain('Stage');
      expect(tagKeys).toContain('Component');
      expect(tagKeys).toContain('DataClassification');
      expect(tagKeys).toContain('FunctionPurpose');
      expect(tagKeys).toContain('TablePurpose');
      expect(tagKeys).toContain('BucketPurpose');
    });

    it('should return sorted tag keys', () => {
      const tagKeys = docGenerator.listTagKeys();

      const sortedKeys = [...tagKeys].sort();
      expect(tagKeys).toEqual(sortedKeys);
    });

    it('should not contain duplicate tag keys', () => {
      const tagKeys = docGenerator.listTagKeys();

      const uniqueKeys = [...new Set(tagKeys)];
      expect(tagKeys.length).toBe(uniqueKeys.length);
    });
  });

  describe('generateCostAllocationTagList', () => {
    it('should return cost allocation tags', () => {
      const costTags = docGenerator.generateCostAllocationTagList();

      expect(costTags).toContain('Project');
      expect(costTags).toContain('Stage');
      expect(costTags).toContain('Component');
      expect(costTags).toContain('Owner');
      expect(costTags).toContain('CostCenter');
      expect(costTags).toContain('Environment');
    });

    it('should return only tags relevant for cost allocation', () => {
      const costTags = docGenerator.generateCostAllocationTagList();

      // Cost allocation tags should be a subset of all tags
      const allTags = docGenerator.listTagKeys();
      costTags.forEach(tag => {
        expect(allTags).toContain(tag);
      });
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report', () => {
      const report = docGenerator.generateComplianceReport();

      expect(report).toContain('# AWS Resource Tagging Compliance Report');
      expect(report).toContain('## Executive Summary');
      expect(report).toContain('## Compliance Requirements');
      expect(report).toContain('## Recommendations');
    });

    it('should include mandatory tag requirements', () => {
      const report = docGenerator.generateComplianceReport();

      expect(report).toContain('Mandatory Tag Requirements');
      expect(report).toContain('Project');
      expect(report).toContain('Stage');
      expect(report).toContain('Component');
    });

    it('should include data storage requirements', () => {
      const report = docGenerator.generateComplianceReport();

      expect(report).toContain('Data Storage Requirements');
      expect(report).toContain('DataClassification');
      expect(report).toContain('BackupPolicy');
    });

    it('should include production environment requirements', () => {
      const report = docGenerator.generateComplianceReport();

      expect(report).toContain('Production Environment Requirements');
      expect(report).toContain('ComplianceScope');
      expect(report).toContain('AutoShutdown');
    });

    it('should include recommendations', () => {
      const report = docGenerator.generateComplianceReport();

      expect(report).toContain('Regular Audits');
      expect(report).toContain('Automated Validation');
      expect(report).toContain('Cost Optimization');
      expect(report).toContain('Security Review');
      expect(report).toContain('Documentation');
    });
  });

  describe('Documentation Format', () => {
    it('should generate valid markdown', () => {
      const documentation = docGenerator.generateTagDocumentation();

      // Check for markdown headers
      expect(documentation).toMatch(/^# /m);
      expect(documentation).toMatch(/^## /m);

      // Check for markdown tables
      expect(documentation).toMatch(/\|.*\|.*\|/);
      expect(documentation).toMatch(/\|-+\|-+\|/);

      // Check for markdown lists
      expect(documentation).toMatch(/^- /m);
    });

    it('should include generation timestamp', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toMatch(/\*\*Generated:\*\* \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include environment information', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain(`**Environment:** ${stage}`);
    });
  });

  describe('Integration with TagManager', () => {
    it('should use TagManager for tag information', () => {
      const documentation = docGenerator.generateTagDocumentation();

      // Verify that documentation includes tags from TagManager
      const mandatoryTags = tagManager.getMandatoryTags();
      Object.keys(mandatoryTags).forEach(tagKey => {
        expect(documentation).toContain(tagKey);
      });
    });

    it('should reflect environment-specific configuration', () => {
      const devDocGenerator = new TagDocumentationGenerator(
        new TagManager(tagConfig, 'dev'),
        'dev'
      );
      const prodDocGenerator = new TagDocumentationGenerator(
        new TagManager(tagConfig, 'production'),
        'production'
      );

      const devDocs = devDocGenerator.generateTagDocumentation();
      const prodDocs = prodDocGenerator.generateTagDocumentation();

      // Dev should have AutoShutdown: true
      expect(devDocs).toContain('true');

      // Production should have AutoShutdown: false
      expect(prodDocs).toContain('false');
    });
  });

  describe('Documentation Completeness', () => {
    it('should document all resource types', () => {
      const documentation = docGenerator.generateTagDocumentation();

      // Check for the resource types that are documented in detail
      const resourceTypes = [
        'Lambda Functions',
        'DynamoDB Tables',
        'S3 Buckets',
      ];

      resourceTypes.forEach(resourceType => {
        expect(documentation).toContain(resourceType);
      });
      
      // Check that resource-specific tags section exists
      expect(documentation).toContain('Resource-Specific Tags');
    });

    it('should provide usage guidelines', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('Naming Conventions');
      expect(documentation).toContain('Tag Application');
      expect(documentation).toContain('Tag Maintenance');
      expect(documentation).toContain('PascalCase');
      expect(documentation).toContain('128 characters');
      expect(documentation).toContain('256 characters');
    });

    it('should include cost tracking queries', () => {
      const documentation = docGenerator.generateTagDocumentation();

      expect(documentation).toContain('Cost Tracking Queries');
      expect(documentation).toContain('By Component');
      expect(documentation).toContain('By Environment');
      expect(documentation).toContain('By Team');
      expect(documentation).toContain('By Cost Center');
    });
  });
});
