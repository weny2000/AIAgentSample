/**
 * Unit tests for TagDocumentationGenerator
 */

import { Stack, App } from 'aws-cdk-lib';
import { TagDocumentationGenerator } from '../tag-documentation-generator';
import { TagManager } from '../tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('TagDocumentationGenerator', () => {
  let tagManager: TagManager;
  let generator: TagDocumentationGenerator;
  let stack: Stack;

  beforeEach(() => {
    const config = getTagConfig('dev');
    tagManager = new TagManager(config, 'dev');
    generator = new TagDocumentationGenerator(tagManager, 'dev');
    
    const app = new App();
    stack = new Stack(app, 'TestStack');
  });

  describe('constructor', () => {
    it('should create a TagDocumentationGenerator instance', () => {
      expect(generator).toBeInstanceOf(TagDocumentationGenerator);
    });

    it('should accept tagManager and stage parameters', () => {
      const customGenerator = new TagDocumentationGenerator(tagManager, 'production');
      expect(customGenerator).toBeInstanceOf(TagDocumentationGenerator);
    });
  });

  describe('listTagKeys', () => {
    it('should return an array of tag keys', () => {
      const tagKeys = generator.listTagKeys();
      
      expect(Array.isArray(tagKeys)).toBe(true);
      expect(tagKeys.length).toBeGreaterThan(0);
    });

    it('should include all mandatory tag keys', () => {
      const tagKeys = generator.listTagKeys();
      
      expect(tagKeys).toContain('Project');
      expect(tagKeys).toContain('Stage');
      expect(tagKeys).toContain('ManagedBy');
      expect(tagKeys).toContain('Component');
      expect(tagKeys).toContain('Owner');
      expect(tagKeys).toContain('CostCenter');
      expect(tagKeys).toContain('Environment');
      expect(tagKeys).toContain('CreatedDate');
      expect(tagKeys).toContain('CreatedBy');
    });

    it('should include optional tag keys', () => {
      const tagKeys = generator.listTagKeys();
      
      expect(tagKeys).toContain('DataClassification');
      expect(tagKeys).toContain('BackupPolicy');
      expect(tagKeys).toContain('ComplianceScope');
      expect(tagKeys).toContain('AutoShutdown');
      expect(tagKeys).toContain('MaintenanceWindow');
      expect(tagKeys).toContain('LastModifiedDate');
    });

    it('should include resource-specific tag keys', () => {
      const tagKeys = generator.listTagKeys();
      
      expect(tagKeys).toContain('FunctionPurpose');
      expect(tagKeys).toContain('Runtime');
      expect(tagKeys).toContain('TablePurpose');
      expect(tagKeys).toContain('BucketPurpose');
      expect(tagKeys).toContain('Engine');
      expect(tagKeys).toContain('NetworkTier');
      expect(tagKeys).toContain('ApiPurpose');
      expect(tagKeys).toContain('WorkflowPurpose');
      expect(tagKeys).toContain('MonitoringType');
      expect(tagKeys).toContain('KeyPurpose');
      expect(tagKeys).toContain('AuthPurpose');
    });

    it('should return sorted tag keys', () => {
      const tagKeys = generator.listTagKeys();
      const sortedKeys = [...tagKeys].sort();
      
      expect(tagKeys).toEqual(sortedKeys);
    });

    it('should not contain duplicate tag keys', () => {
      const tagKeys = generator.listTagKeys();
      const uniqueKeys = Array.from(new Set(tagKeys));
      
      expect(tagKeys.length).toBe(uniqueKeys.length);
    });
  });

  describe('generateCostAllocationTagList', () => {
    it('should return an array of cost allocation tag keys', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(Array.isArray(costTags)).toBe(true);
      expect(costTags.length).toBeGreaterThan(0);
    });

    it('should include Project tag', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags).toContain('Project');
    });

    it('should include Stage tag', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags).toContain('Stage');
    });

    it('should include Environment tag', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags).toContain('Environment');
    });

    it('should include Component tag', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags).toContain('Component');
    });

    it('should include Owner tag', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags).toContain('Owner');
    });

    it('should include CostCenter tag', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags).toContain('CostCenter');
    });

    it('should return exactly 6 cost allocation tags', () => {
      const costTags = generator.generateCostAllocationTagList();
      
      expect(costTags.length).toBe(6);
    });
  });

  describe('generateTagDocumentation', () => {
    it('should generate markdown documentation', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(typeof documentation).toBe('string');
      expect(documentation.length).toBeGreaterThan(0);
    });

    it('should include header with title', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('# AWS Resource Tagging Reference');
    });

    it('should include environment information', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('**Environment:** dev');
    });

    it('should include generation timestamp', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('**Generated:**');
    });

    it('should include table of contents', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Table of Contents');
      expect(documentation).toContain('[Mandatory Tags]');
      expect(documentation).toContain('[Optional Tags]');
      expect(documentation).toContain('[Resource-Specific Tags]');
      expect(documentation).toContain('[Environment-Specific Tags]');
      expect(documentation).toContain('[Tag Usage Guidelines]');
      expect(documentation).toContain('[Cost Allocation Tags]');
    });

    it('should include mandatory tags section', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Mandatory Tags');
      expect(documentation).toContain('| Tag Key | Description | Example Value | Purpose |');
    });

    it('should document all mandatory tags', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('| Project |');
      expect(documentation).toContain('| Stage |');
      expect(documentation).toContain('| ManagedBy |');
      expect(documentation).toContain('| Component |');
      expect(documentation).toContain('| Owner |');
      expect(documentation).toContain('| CostCenter |');
      expect(documentation).toContain('| Environment |');
      expect(documentation).toContain('| CreatedDate |');
      expect(documentation).toContain('| CreatedBy |');
    });

    it('should include optional tags section', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Optional Tags');
      expect(documentation).toContain('| Tag Key | Description | Valid Values | Applies To |');
    });

    it('should document optional tags', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('DataClassification');
      expect(documentation).toContain('BackupPolicy');
      expect(documentation).toContain('ComplianceScope');
      expect(documentation).toContain('AutoShutdown');
    });

    it('should include resource-specific tags section', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Resource-Specific Tags');
      expect(documentation).toContain('### Lambda Functions');
      expect(documentation).toContain('### DynamoDB Tables');
      expect(documentation).toContain('### S3 Buckets');
    });

    it('should include environment-specific tags section', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Environment-Specific Tags');
      expect(documentation).toContain('| Tag Key | Development | Staging | Production |');
    });

    it('should show environment-specific values', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('Development');
      expect(documentation).toContain('Staging');
      expect(documentation).toContain('Production');
    });

    it('should include tag usage guidelines', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Tag Usage Guidelines');
      expect(documentation).toContain('### Naming Conventions');
      expect(documentation).toContain('### Tag Application');
      expect(documentation).toContain('### Tag Maintenance');
    });

    it('should include cost allocation tags section', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('## Cost Allocation Tags');
      expect(documentation).toContain('AWS Billing Console');
    });

    it('should include cost tracking queries', () => {
      const documentation = generator.generateTagDocumentation();
      
      expect(documentation).toContain('### Cost Tracking Queries');
      expect(documentation).toContain('By Component');
      expect(documentation).toContain('By Environment');
      expect(documentation).toContain('By Team');
      expect(documentation).toContain('By Cost Center');
    });

    it('should generate valid markdown format', () => {
      const documentation = generator.generateTagDocumentation();
      
      // Check for proper markdown headers
      expect(documentation).toMatch(/^# /m);
      expect(documentation).toMatch(/^## /m);
      expect(documentation).toMatch(/^### /m);
      
      // Check for proper markdown tables
      expect(documentation).toMatch(/\|.*\|.*\|/);
      expect(documentation).toMatch(/\|-+\|-+\|/);
    });

    it('should handle production environment', () => {
      const prodConfig = getTagConfig('production');
      const prodTagManager = new TagManager(prodConfig, 'production');
      const prodGenerator = new TagDocumentationGenerator(prodTagManager, 'production');
      
      const documentation = prodGenerator.generateTagDocumentation();
      
      expect(documentation).toContain('**Environment:** production');
      expect(documentation).toContain('Production');
    });

    it('should handle staging environment', () => {
      const stagingConfig = getTagConfig('staging');
      const stagingTagManager = new TagManager(stagingConfig, 'staging');
      const stagingGenerator = new TagDocumentationGenerator(stagingTagManager, 'staging');
      
      const documentation = stagingGenerator.generateTagDocumentation();
      
      expect(documentation).toContain('**Environment:** staging');
      expect(documentation).toContain('Staging');
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report markdown', () => {
      const report = generator.generateComplianceReport();
      
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
    });

    it('should include report header', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('# AWS Resource Tagging Compliance Report');
    });

    it('should include environment information', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('**Environment:** dev');
    });

    it('should include generation timestamp', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('**Generated:**');
    });

    it('should include executive summary section', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('## Executive Summary');
    });

    it('should include compliance requirements section', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('## Compliance Requirements');
      expect(report).toContain('### Mandatory Tag Requirements');
    });

    it('should list mandatory tag requirements', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('- Project');
      expect(report).toContain('- Stage');
      expect(report).toContain('- ManagedBy');
      expect(report).toContain('- Component');
      expect(report).toContain('- Owner');
      expect(report).toContain('- CostCenter');
      expect(report).toContain('- Environment');
      expect(report).toContain('- CreatedDate');
      expect(report).toContain('- CreatedBy');
    });

    it('should include data storage requirements', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('### Data Storage Requirements');
      expect(report).toContain('DataClassification');
      expect(report).toContain('BackupPolicy');
    });

    it('should list data storage resource types', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('AWS::S3::Bucket');
      expect(report).toContain('AWS::DynamoDB::Table');
      expect(report).toContain('AWS::RDS::DBInstance');
    });

    it('should include production environment requirements', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('### Production Environment Requirements');
      expect(report).toContain('ComplianceScope');
      expect(report).toContain('AutoShutdown');
    });

    it('should include recommendations section', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('## Recommendations');
      expect(report).toContain('Regular Audits');
      expect(report).toContain('Automated Validation');
      expect(report).toContain('Cost Optimization');
      expect(report).toContain('Security Review');
      expect(report).toContain('Documentation');
    });

    it('should handle report without stack', () => {
      const report = generator.generateComplianceReport();
      
      expect(report).toContain('No stack provided for analysis');
    });

    it('should generate report with stack', () => {
      const report = generator.generateComplianceReport(stack);
      
      expect(report).toContain('## Executive Summary');
      expect(report).toContain('## Data Classification Summary');
      expect(report).toContain('## Compliance Scope Summary');
    });

    it('should include compliance metrics when stack provided', () => {
      const report = generator.generateComplianceReport(stack);
      
      expect(report).toContain('**Total Resources:**');
      expect(report).toContain('**Compliant Resources:**');
      expect(report).toContain('**Non-Compliant Resources:**');
      expect(report).toContain('**Compliance Rate:**');
    });

    it('should generate valid markdown format', () => {
      const report = generator.generateComplianceReport();
      
      // Check for proper markdown headers
      expect(report).toMatch(/^# /m);
      expect(report).toMatch(/^## /m);
      expect(report).toMatch(/^### /m);
      
      // Check for proper markdown lists
      expect(report).toMatch(/^- /m);
    });

    it('should handle production environment in report', () => {
      const prodConfig = getTagConfig('production');
      const prodTagManager = new TagManager(prodConfig, 'production');
      const prodGenerator = new TagDocumentationGenerator(prodTagManager, 'production');
      
      const report = prodGenerator.generateComplianceReport();
      
      expect(report).toContain('**Environment:** production');
    });
  });

  describe('integration tests', () => {
    it('should generate documentation and compliance report together', () => {
      const documentation = generator.generateTagDocumentation();
      const report = generator.generateComplianceReport();
      
      expect(documentation.length).toBeGreaterThan(0);
      expect(report.length).toBeGreaterThan(0);
      
      // Both should reference similar tag concepts
      expect(documentation).toContain('Mandatory Tags');
      expect(report).toContain('Mandatory Tag Requirements');
    });

    it('should list consistent tag keys across methods', () => {
      const tagKeys = generator.listTagKeys();
      const documentation = generator.generateTagDocumentation();
      
      // Mandatory and optional tag keys should appear in documentation
      const mandatoryAndOptionalKeys = [
        'Project', 'Stage', 'ManagedBy', 'Component', 'Owner', 'CostCenter',
        'Environment', 'CreatedDate', 'CreatedBy', 'DataClassification',
        'BackupPolicy', 'ComplianceScope', 'AutoShutdown', 'MaintenanceWindow',
        'LastModifiedDate'
      ];
      
      mandatoryAndOptionalKeys.forEach(key => {
        expect(documentation).toContain(key);
      });
      
      // Resource-specific keys should appear in their sections
      expect(documentation).toContain('FunctionPurpose');
      expect(documentation).toContain('TablePurpose');
      expect(documentation).toContain('BucketPurpose');
    });

    it('should list consistent cost allocation tags', () => {
      const costTags = generator.generateCostAllocationTagList();
      const documentation = generator.generateTagDocumentation();
      
      // All cost allocation tags should appear in documentation
      costTags.forEach(tag => {
        expect(documentation).toContain(tag);
      });
    });

    it('should work with different environments', () => {
      const environments = ['dev', 'staging', 'production'];
      
      environments.forEach(env => {
        const config = getTagConfig(env);
        const tm = new TagManager(config, env);
        const gen = new TagDocumentationGenerator(tm, env);
        
        const doc = gen.generateTagDocumentation();
        const report = gen.generateComplianceReport();
        
        expect(doc).toContain(`**Environment:** ${env}`);
        expect(report).toContain(`**Environment:** ${env}`);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty stack', () => {
      const emptyStack = new Stack(new App(), 'EmptyStack');
      const report = generator.generateComplianceReport(emptyStack);
      
      expect(report).toContain('## Executive Summary');
      expect(report.length).toBeGreaterThan(0);
    });

    it('should generate documentation without errors', () => {
      expect(() => {
        generator.generateTagDocumentation();
      }).not.toThrow();
    });

    it('should generate compliance report without errors', () => {
      expect(() => {
        generator.generateComplianceReport();
      }).not.toThrow();
    });

    it('should list tag keys without errors', () => {
      expect(() => {
        generator.listTagKeys();
      }).not.toThrow();
    });

    it('should generate cost allocation list without errors', () => {
      expect(() => {
        generator.generateCostAllocationTagList();
      }).not.toThrow();
    });
  });
});
