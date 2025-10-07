/**
 * TagDocumentationGenerator Utility Class
 * 
 * Generates comprehensive documentation for AWS resource tagging strategy,
 * including:
 * - Tag reference documentation
 * - Cost allocation tag lists
 * - Compliance reports
 * - Resource tagging summaries
 */

import { Stack } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import {
  MANDATORY_TAG_KEYS,
  COST_ALLOCATION_TAG_KEYS,
  ENVIRONMENT_CONFIGS,
  DATA_STORAGE_RESOURCE_TYPES,
  OptionalTags,
} from '../config/tag-config';
import { TagManager } from './tag-manager';

/**
 * Tag documentation metadata
 */
export interface TagDocumentation {
  tagKey: string;
  description: string;
  required: boolean;
  validValues?: string[];
  appliesTo: string[];
  purpose: string;
}

/**
 * Resource tagging summary
 */
export interface ResourceTaggingSummary {
  resourceId: string;
  resourceType: string;
  tags: Record<string, string>;
  missingTags: string[];
  complianceStatus: 'compliant' | 'non-compliant' | 'warning';
}

/**
 * Compliance report data
 */
export interface ComplianceReport {
  totalResources: number;
  compliantResources: number;
  nonCompliantResources: number;
  compliancePercentage: number;
  resourcesByCompliance: Record<string, ResourceTaggingSummary[]>;
  dataClassificationSummary: Record<string, number>;
  complianceScopeSummary: Record<string, number>;
}

/**
 * TagDocumentationGenerator class
 */
export class TagDocumentationGenerator {
  private tagManager: TagManager;
  private stage: string;

  /**
   * Create a new TagDocumentationGenerator instance
   * @param tagManager TagManager instance for tag operations
   * @param stage Deployment stage
   */
  constructor(tagManager: TagManager, stage: string) {
    this.tagManager = tagManager;
    this.stage = stage;
  }

  /**
   * Generate comprehensive tag documentation in markdown format
   * @param stack Optional CDK stack to analyze for actual tag usage
   * @returns Markdown documentation string
   */
  generateTagDocumentation(stack?: Stack): string {
    const sections: string[] = [];

    // Header
    sections.push('# AWS Resource Tagging Reference');
    sections.push('');
    sections.push('This document provides a comprehensive reference for all tags used in the AI Agent System infrastructure.');
    sections.push('');
    sections.push(`**Environment:** ${this.stage}`);
    sections.push(`**Generated:** ${new Date().toISOString()}`);
    sections.push('');

    // Table of Contents
    sections.push('## Table of Contents');
    sections.push('');
    sections.push('1. [Mandatory Tags](#mandatory-tags)');
    sections.push('2. [Optional Tags](#optional-tags)');
    sections.push('3. [Resource-Specific Tags](#resource-specific-tags)');
    sections.push('4. [Environment-Specific Tags](#environment-specific-tags)');
    sections.push('5. [Tag Usage Guidelines](#tag-usage-guidelines)');
    sections.push('6. [Cost Allocation Tags](#cost-allocation-tags)');
    sections.push('');

    // Mandatory Tags Section
    sections.push('## Mandatory Tags');
    sections.push('');
    sections.push('These tags MUST be applied to all AWS resources:');
    sections.push('');
    sections.push('| Tag Key | Description | Example Value | Purpose |');
    sections.push('|---------|-------------|---------------|---------|');
    
    const mandatoryTagDocs = this.getMandatoryTagDocumentation();
    mandatoryTagDocs.forEach(doc => {
      const exampleValue = this.getExampleValue(doc.tagKey);
      sections.push(`| ${doc.tagKey} | ${doc.description} | ${exampleValue} | ${doc.purpose} |`);
    });
    sections.push('');

    // Optional Tags Section
    sections.push('## Optional Tags');
    sections.push('');
    sections.push('These tags MAY be applied based on resource type and requirements:');
    sections.push('');
    sections.push('| Tag Key | Description | Valid Values | Applies To |');
    sections.push('|---------|-------------|--------------|------------|');
    
    const optionalTagDocs = this.getOptionalTagDocumentation();
    optionalTagDocs.forEach(doc => {
      const validValues = doc.validValues ? doc.validValues.join(', ') : 'Any';
      const appliesTo = doc.appliesTo.join(', ');
      sections.push(`| ${doc.tagKey} | ${doc.description} | ${validValues} | ${appliesTo} |`);
    });
    sections.push('');

    // Resource-Specific Tags Section
    sections.push('## Resource-Specific Tags');
    sections.push('');
    sections.push('Different resource types have specific tags based on their function:');
    sections.push('');

    const resourceSpecificDocs = this.getResourceSpecificTagDocumentation();
    Object.entries(resourceSpecificDocs).forEach(([resourceType, docs]) => {
      sections.push(`### ${resourceType}`);
      sections.push('');
      sections.push('| Tag Key | Description | Example Value |');
      sections.push('|---------|-------------|---------------|');
      docs.forEach(doc => {
        const exampleValue = this.getExampleValue(doc.tagKey, resourceType);
        sections.push(`| ${doc.tagKey} | ${doc.description} | ${exampleValue} |`);
      });
      sections.push('');
    });

    // Environment-Specific Tags Section
    sections.push('## Environment-Specific Tags');
    sections.push('');
    sections.push('Tag values vary by deployment environment:');
    sections.push('');
    sections.push('| Tag Key | Development | Staging | Production |');
    sections.push('|---------|-------------|---------|------------|');
    
    const envTags = ['Stage', 'Environment', 'CostCenter', 'AutoShutdown', 'ComplianceScope'];
    envTags.forEach(tagKey => {
      const devValue = (ENVIRONMENT_CONFIGS.dev as any)[tagKey] || 'N/A';
      const stagingValue = (ENVIRONMENT_CONFIGS.staging as any)[tagKey] || 'N/A';
      const prodValue = (ENVIRONMENT_CONFIGS.production as any)[tagKey] || 'N/A';
      sections.push(`| ${tagKey} | ${devValue} | ${stagingValue} | ${prodValue} |`);
    });
    sections.push('');

    // Tag Usage Guidelines
    sections.push('## Tag Usage Guidelines');
    sections.push('');
    sections.push('### Naming Conventions');
    sections.push('');
    sections.push('- Tag keys use PascalCase (e.g., `DataClassification`, `BackupPolicy`)');
    sections.push('- Tag values use appropriate casing for readability');
    sections.push('- Maximum key length: 128 characters');
    sections.push('- Maximum value length: 256 characters');
    sections.push('- Allowed characters: alphanumeric, spaces, and `+ - = . _ : / @`');
    sections.push('');
    sections.push('### Tag Application');
    sections.push('');
    sections.push('- Tags are applied automatically during CDK deployment');
    sections.push('- Stack-level tags propagate to all resources');
    sections.push('- Resource-specific tags override stack-level tags');
    sections.push('- Custom tags can be added for specific use cases');
    sections.push('');
    sections.push('### Tag Maintenance');
    sections.push('');
    sections.push('- All tag changes should be made in infrastructure code');
    sections.push('- Manual tag modifications are discouraged');
    sections.push('- Tag validation runs before every deployment');
    sections.push('- Missing mandatory tags will prevent deployment');
    sections.push('');

    // Cost Allocation Tags
    sections.push('## Cost Allocation Tags');
    sections.push('');
    sections.push('The following tags should be activated in AWS Billing Console for cost tracking:');
    sections.push('');
    const costTags = this.generateCostAllocationTagList();
    costTags.forEach(tag => {
      sections.push(`- ${tag}`);
    });
    sections.push('');
    sections.push('### Cost Tracking Queries');
    sections.push('');
    sections.push('Use these tags in AWS Cost Explorer to analyze spending:');
    sections.push('');
    sections.push('- **By Component**: Group costs by `Component` tag to see spending per service type');
    sections.push('- **By Environment**: Group costs by `Stage` or `Environment` tag to compare dev/staging/production');
    sections.push('- **By Team**: Group costs by `Owner` tag to allocate costs to teams');
    sections.push('- **By Cost Center**: Group costs by `CostCenter` tag for financial reporting');
    sections.push('');

    return sections.join('\n');
  }

  /**
   * List all tag keys used in the tagging strategy
   * @returns Array of tag key strings
   */
  listTagKeys(): string[] {
    const tagKeys = new Set<string>();

    // Add mandatory tags
    MANDATORY_TAG_KEYS.forEach(key => tagKeys.add(key));

    // Add optional tags
    const optionalTags: (keyof OptionalTags)[] = [
      'DataClassification',
      'BackupPolicy',
      'ComplianceScope',
      'AutoShutdown',
      'MaintenanceWindow',
      'LastModifiedDate',
    ];
    optionalTags.forEach(key => tagKeys.add(key));

    // Add resource-specific tags
    const resourceSpecificTags = [
      'FunctionPurpose',
      'Runtime',
      'TablePurpose',
      'BucketPurpose',
      'Engine',
      'NetworkTier',
      'ApiPurpose',
      'WorkflowPurpose',
      'MonitoringType',
      'KeyPurpose',
      'AuthPurpose',
    ];
    resourceSpecificTags.forEach(key => tagKeys.add(key));

    return Array.from(tagKeys).sort();
  }

  /**
   * Generate list of tags that should be activated for cost allocation
   * @returns Array of cost allocation tag keys
   */
  generateCostAllocationTagList(): string[] {
    return Array.from(COST_ALLOCATION_TAG_KEYS);
  }

  /**
   * Generate compliance report for tagged resources
   * @param stack CDK stack to analyze
   * @returns Markdown compliance report
   */
  generateComplianceReport(stack?: Stack): string {
    const sections: string[] = [];

    // Header
    sections.push('# AWS Resource Tagging Compliance Report');
    sections.push('');
    sections.push(`**Environment:** ${this.stage}`);
    sections.push(`**Generated:** ${new Date().toISOString()}`);
    sections.push('');

    // Executive Summary
    sections.push('## Executive Summary');
    sections.push('');

    if (stack) {
      const report = this.analyzeStackCompliance(stack);
      
      sections.push(`- **Total Resources:** ${report.totalResources}`);
      sections.push(`- **Compliant Resources:** ${report.compliantResources}`);
      sections.push(`- **Non-Compliant Resources:** ${report.nonCompliantResources}`);
      sections.push(`- **Compliance Rate:** ${report.compliancePercentage.toFixed(2)}%`);
      sections.push('');

      // Data Classification Summary
      sections.push('## Data Classification Summary');
      sections.push('');
      sections.push('Distribution of data classification levels:');
      sections.push('');
      sections.push('| Classification | Resource Count |');
      sections.push('|----------------|----------------|');
      Object.entries(report.dataClassificationSummary).forEach(([classification, count]) => {
        sections.push(`| ${classification} | ${count} |`);
      });
      sections.push('');

      // Compliance Scope Summary
      sections.push('## Compliance Scope Summary');
      sections.push('');
      sections.push('Resources by compliance framework:');
      sections.push('');
      sections.push('| Compliance Framework | Resource Count |');
      sections.push('|---------------------|----------------|');
      Object.entries(report.complianceScopeSummary).forEach(([scope, count]) => {
        sections.push(`| ${scope} | ${count} |`);
      });
      sections.push('');

      // Non-Compliant Resources
      if (report.nonCompliantResources > 0) {
        sections.push('## Non-Compliant Resources');
        sections.push('');
        sections.push('The following resources are missing required tags:');
        sections.push('');
        sections.push('| Resource ID | Resource Type | Missing Tags | Status |');
        sections.push('|-------------|---------------|--------------|--------|');
        
        report.resourcesByCompliance['non-compliant']?.forEach(resource => {
          const missingTags = resource.missingTags.join(', ');
          sections.push(`| ${resource.resourceId} | ${resource.resourceType} | ${missingTags} | ${resource.complianceStatus} |`);
        });
        sections.push('');
      }
    } else {
      sections.push('*No stack provided for analysis. Deploy infrastructure to generate detailed compliance report.*');
      sections.push('');
    }

    // Compliance Requirements
    sections.push('## Compliance Requirements');
    sections.push('');
    sections.push('### Mandatory Tag Requirements');
    sections.push('');
    sections.push('All resources MUST have the following tags:');
    sections.push('');
    MANDATORY_TAG_KEYS.forEach(key => {
      sections.push(`- ${key}`);
    });
    sections.push('');

    sections.push('### Data Storage Requirements');
    sections.push('');
    sections.push('Data storage resources MUST have:');
    sections.push('');
    sections.push('- `DataClassification` tag (Public/Internal/Confidential/Restricted)');
    sections.push('- `BackupPolicy` tag (Daily/Weekly/Monthly/None)');
    sections.push('');
    sections.push('Data storage resource types:');
    sections.push('');
    DATA_STORAGE_RESOURCE_TYPES.forEach(type => {
      sections.push(`- ${type}`);
    });
    sections.push('');

    sections.push('### Production Environment Requirements');
    sections.push('');
    sections.push('Production resources MUST have:');
    sections.push('');
    sections.push('- `ComplianceScope` tag indicating applicable frameworks');
    sections.push('- `AutoShutdown` set to "false"');
    sections.push('');

    // Recommendations
    sections.push('## Recommendations');
    sections.push('');
    sections.push('1. **Regular Audits**: Run compliance reports monthly to ensure ongoing compliance');
    sections.push('2. **Automated Validation**: Tag validation is enforced during deployment');
    sections.push('3. **Cost Optimization**: Use cost allocation tags to identify optimization opportunities');
    sections.push('4. **Security Review**: Regularly review DataClassification tags for accuracy');
    sections.push('5. **Documentation**: Keep tag documentation updated as infrastructure evolves');
    sections.push('');

    return sections.join('\n');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get documentation for mandatory tags
   */
  private getMandatoryTagDocumentation(): TagDocumentation[] {
    return [
      {
        tagKey: 'Project',
        description: 'Project name identifier',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Identify resources belonging to this project',
      },
      {
        tagKey: 'Stage',
        description: 'Deployment stage',
        required: true,
        validValues: ['dev', 'staging', 'production'],
        appliesTo: ['All resources'],
        purpose: 'Distinguish resources by environment',
      },
      {
        tagKey: 'ManagedBy',
        description: 'Management tool',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Indicate infrastructure as code management',
      },
      {
        tagKey: 'Component',
        description: 'Logical component classification',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Group resources by functional component',
      },
      {
        tagKey: 'Owner',
        description: 'Team or individual responsible',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Assign ownership and accountability',
      },
      {
        tagKey: 'CostCenter',
        description: 'Cost allocation identifier',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Enable cost tracking and allocation',
      },
      {
        tagKey: 'Environment',
        description: 'Environment type',
        required: true,
        validValues: ['Development', 'Staging', 'Production'],
        appliesTo: ['All resources'],
        purpose: 'Classify resources by environment type',
      },
      {
        tagKey: 'CreatedDate',
        description: 'Resource creation timestamp',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Track resource age and lifecycle',
      },
      {
        tagKey: 'CreatedBy',
        description: 'Creation mechanism',
        required: true,
        appliesTo: ['All resources'],
        purpose: 'Audit resource creation source',
      },
    ];
  }

  /**
   * Get documentation for optional tags
   */
  private getOptionalTagDocumentation(): TagDocumentation[] {
    return [
      {
        tagKey: 'DataClassification',
        description: 'Data sensitivity level',
        required: false,
        validValues: ['Public', 'Internal', 'Confidential', 'Restricted'],
        appliesTo: ['S3', 'DynamoDB', 'RDS', 'Kendra'],
        purpose: 'Classify data sensitivity for security and compliance',
      },
      {
        tagKey: 'BackupPolicy',
        description: 'Backup retention policy',
        required: false,
        validValues: ['Daily', 'Weekly', 'Monthly', 'None'],
        appliesTo: ['S3', 'DynamoDB', 'RDS'],
        purpose: 'Define backup requirements',
      },
      {
        tagKey: 'ComplianceScope',
        description: 'Applicable compliance frameworks',
        required: false,
        validValues: ['HIPAA', 'SOC2', 'GDPR', 'None'],
        appliesTo: ['All resources'],
        purpose: 'Track compliance requirements',
      },
      {
        tagKey: 'AutoShutdown',
        description: 'Automatic shutdown eligibility',
        required: false,
        validValues: ['true', 'false'],
        appliesTo: ['Lambda', 'RDS', 'EC2'],
        purpose: 'Enable cost optimization through automated shutdown',
      },
      {
        tagKey: 'MaintenanceWindow',
        description: 'Preferred maintenance window',
        required: false,
        appliesTo: ['RDS', 'EC2'],
        purpose: 'Schedule maintenance activities',
      },
      {
        tagKey: 'LastModifiedDate',
        description: 'Last modification timestamp',
        required: false,
        appliesTo: ['All resources'],
        purpose: 'Track resource updates',
      },
    ];
  }

  /**
   * Get documentation for resource-specific tags
   */
  private getResourceSpecificTagDocumentation(): Record<string, TagDocumentation[]> {
    return {
      'Lambda Functions': [
        {
          tagKey: 'Component',
          description: 'Always set to "Compute-Lambda"',
          required: true,
          appliesTo: ['Lambda'],
          purpose: 'Classify as compute resource',
        },
        {
          tagKey: 'FunctionPurpose',
          description: 'Specific function role',
          required: true,
          validValues: ['Authentication', 'API', 'DataProcessing', 'Notification'],
          appliesTo: ['Lambda'],
          purpose: 'Identify function responsibility',
        },
        {
          tagKey: 'Runtime',
          description: 'Lambda runtime version',
          required: true,
          appliesTo: ['Lambda'],
          purpose: 'Track runtime for updates',
        },
      ],
      'DynamoDB Tables': [
        {
          tagKey: 'Component',
          description: 'Always set to "Database-DynamoDB"',
          required: true,
          appliesTo: ['DynamoDB'],
          purpose: 'Classify as database resource',
        },
        {
          tagKey: 'TablePurpose',
          description: 'Table function',
          required: true,
          validValues: ['TeamManagement', 'AuditLog', 'JobStatus'],
          appliesTo: ['DynamoDB'],
          purpose: 'Identify table purpose',
        },
        {
          tagKey: 'DataClassification',
          description: 'Data sensitivity level',
          required: true,
          validValues: ['Internal', 'Confidential'],
          appliesTo: ['DynamoDB'],
          purpose: 'Classify data sensitivity',
        },
      ],
      'S3 Buckets': [
        {
          tagKey: 'Component',
          description: 'Always set to "Storage-S3"',
          required: true,
          appliesTo: ['S3'],
          purpose: 'Classify as storage resource',
        },
        {
          tagKey: 'BucketPurpose',
          description: 'Bucket function',
          required: true,
          validValues: ['Documents', 'Artifacts', 'AuditLogs', 'Backups'],
          appliesTo: ['S3'],
          purpose: 'Identify bucket purpose',
        },
        {
          tagKey: 'DataClassification',
          description: 'Data sensitivity level',
          required: true,
          validValues: ['Internal', 'Confidential', 'Restricted'],
          appliesTo: ['S3'],
          purpose: 'Classify data sensitivity',
        },
        {
          tagKey: 'BackupPolicy',
          description: 'Backup retention policy',
          required: true,
          validValues: ['Daily', 'Weekly', 'Monthly'],
          appliesTo: ['S3'],
          purpose: 'Define backup requirements',
        },
      ],
    };
  }

  /**
   * Get example value for a tag key
   */
  private getExampleValue(tagKey: string, resourceType?: string): string {
    const envConfig = ENVIRONMENT_CONFIGS[this.stage];
    
    switch (tagKey) {
      case 'Project':
        return 'AiAgentSystem';
      case 'Stage':
        return envConfig.Stage;
      case 'ManagedBy':
        return 'CDK';
      case 'Component':
        return resourceType ? `${resourceType}-Component` : 'Compute-Lambda';
      case 'Owner':
        return 'Platform';
      case 'CostCenter':
        return envConfig.CostCenter;
      case 'Environment':
        return envConfig.Environment;
      case 'CreatedDate':
        return '2025-10-06T12:00:00Z';
      case 'CreatedBy':
        return 'CDK-Deployment';
      case 'DataClassification':
        return 'Internal';
      case 'BackupPolicy':
        return 'Daily';
      case 'ComplianceScope':
        return envConfig.ComplianceScope;
      case 'AutoShutdown':
        return envConfig.AutoShutdown;
      case 'FunctionPurpose':
        return 'API';
      case 'Runtime':
        return 'nodejs20.x';
      case 'TablePurpose':
        return 'TeamManagement';
      case 'BucketPurpose':
        return 'Documents';
      case 'Engine':
        return 'PostgreSQL';
      case 'NetworkTier':
        return 'Private';
      case 'ApiPurpose':
        return 'RESTful API';
      case 'WorkflowPurpose':
        return 'DataIngestion';
      case 'MonitoringType':
        return 'Logs';
      case 'KeyPurpose':
        return 'DatabaseEncryption';
      case 'AuthPurpose':
        return 'UserAuthentication';
      default:
        return 'Example';
    }
  }

  /**
   * Analyze stack compliance
   */
  private analyzeStackCompliance(stack: Stack): ComplianceReport {
    const resources: ResourceTaggingSummary[] = [];
    const dataClassificationSummary: Record<string, number> = {};
    const complianceScopeSummary: Record<string, number> = {};

    // Traverse all constructs in the stack
    const allConstructs = stack.node.findAll();
    
    allConstructs.forEach(construct => {
      // Skip non-resource constructs
      if (!this.isTaggableResource(construct)) {
        return;
      }

      const resourceId = construct.node.id;
      const resourceType = construct.constructor.name;
      const tags = this.extractTags(construct);
      const missingTags = this.findMissingMandatoryTags(tags);
      
      const complianceStatus = missingTags.length === 0 ? 'compliant' : 'non-compliant';

      resources.push({
        resourceId,
        resourceType,
        tags,
        missingTags,
        complianceStatus,
      });

      // Track data classification
      if (tags.DataClassification) {
        dataClassificationSummary[tags.DataClassification] = 
          (dataClassificationSummary[tags.DataClassification] || 0) + 1;
      }

      // Track compliance scope
      if (tags.ComplianceScope) {
        const scopes = tags.ComplianceScope.split(',');
        scopes.forEach(scope => {
          complianceScopeSummary[scope.trim()] = 
            (complianceScopeSummary[scope.trim()] || 0) + 1;
        });
      }
    });

    const compliantResources = resources.filter(r => r.complianceStatus === 'compliant').length;
    const nonCompliantResources = resources.filter(r => r.complianceStatus === 'non-compliant').length;

    return {
      totalResources: resources.length,
      compliantResources,
      nonCompliantResources,
      compliancePercentage: resources.length > 0 ? (compliantResources / resources.length) * 100 : 0,
      resourcesByCompliance: {
        'compliant': resources.filter(r => r.complianceStatus === 'compliant'),
        'non-compliant': resources.filter(r => r.complianceStatus === 'non-compliant'),
      },
      dataClassificationSummary,
      complianceScopeSummary,
    };
  }

  /**
   * Check if construct is a taggable resource
   */
  private isTaggableResource(construct: IConstruct): boolean {
    // Check if construct has a cfnResourceType property (L2 constructs)
    const cfnResourceType = (construct as any).cfnResourceType;
    if (cfnResourceType) {
      return true;
    }

    // Check if construct is an L1 construct (CfnResource)
    const constructName = construct.constructor.name;
    return constructName.startsWith('Cfn') && constructName !== 'CfnResource';
  }

  /**
   * Extract tags from a construct
   */
  private extractTags(construct: IConstruct): Record<string, string> {
    // This is a simplified implementation
    // In a real scenario, you would need to access the actual tags applied to the construct
    // For now, return empty object as we can't easily extract tags from constructs
    return {};
  }

  /**
   * Find missing mandatory tags
   */
  private findMissingMandatoryTags(tags: Record<string, string>): string[] {
    const missing: string[] = [];
    
    MANDATORY_TAG_KEYS.forEach(key => {
      if (!tags[key] || tags[key] === '') {
        missing.push(key);
      }
    });

    return missing;
  }
}
