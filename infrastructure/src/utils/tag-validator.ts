/**
 * TagValidator Utility Class
 * 
 * Provides pre-deployment validation of AWS resource tags to ensure:
 * - All resources have mandatory tags
 * - Tag keys and values meet AWS constraints
 * - Data storage resources have DataClassification tags
 * - Production resources have ComplianceScope tags
 * - Validation reports for audit and compliance
 */

import { Stack } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import {
  MANDATORY_TAG_KEYS,
  validateTagKey,
  validateTagValue,
} from '../config/tag-config';
import { ResourceTypeMapper } from './resource-type-mapper';

/**
 * Validation error types
 */
export type ValidationErrorType =
  | 'MISSING_MANDATORY_TAG'
  | 'INVALID_TAG_FORMAT'
  | 'MISSING_DATA_CLASSIFICATION'
  | 'INVALID_TAG_VALUE'
  | 'MISSING_COMPLIANCE_SCOPE';

/**
 * Validation warning types
 */
export type ValidationWarningType =
  | 'MISSING_OPTIONAL_TAG'
  | 'UNUSUAL_TAG_VALUE'
  | 'DEPRECATED_TAG';

/**
 * Validation error details
 */
export interface ValidationError {
  resourceId: string;
  resourceType: string;
  errorType: ValidationErrorType;
  message: string;
  tagKey?: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  resourceId: string;
  resourceType: string;
  warningType: ValidationWarningType;
  message: string;
  tagKey?: string;
}

/**
 * Validation result for tag validation operations
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  resourcesValidated: number;
  resourcesWithIssues: number;
}

/**
 * TagValidator class for validating AWS resource tags
 */
export class TagValidator {
  private resourceTypeMapper: ResourceTypeMapper;

  constructor() {
    this.resourceTypeMapper = new ResourceTypeMapper();
  }

  /**
   * Validate all resources in a CDK stack
   * @param stack CDK stack to validate
   * @returns Validation result with errors and warnings
   */
  validateStack(stack: Stack): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let resourcesValidated = 0;
    const resourcesWithIssues = new Set<string>();

    // Find all constructs in the stack
    const allConstructs = stack.node.findAll();

    // Filter to only taggable resources
    const taggableResources = allConstructs.filter((construct) => {
      const resourceType = this.resourceTypeMapper.getResourceType(construct);
      return resourceType !== 'Unknown' && this.isTaggableResource(construct);
    });

    // Validate each resource
    taggableResources.forEach((construct) => {
      resourcesValidated++;
      const resourceId = construct.node.id || construct.node.path;
      const resourceType = this.resourceTypeMapper.getResourceType(construct);

      // Get tags for this resource
      const tags = this.getResourceTags(construct);

      // Validate the resource tags
      const result = this.validateResourceTags(resourceType, tags, resourceId);

      // Collect errors and warnings
      if (result.errors.length > 0) {
        errors.push(...result.errors);
        resourcesWithIssues.add(resourceId);
      }

      if (result.warnings.length > 0) {
        warnings.push(...result.warnings);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      resourcesValidated,
      resourcesWithIssues: resourcesWithIssues.size,
    };
  }

  /**
   * Validate tags for an individual resource
   * @param resourceType AWS CloudFormation resource type
   * @param tags Tags applied to the resource
   * @param resourceId Resource identifier for error reporting
   * @returns Validation result with errors and warnings
   */
  validateResourceTags(
    resourceType: string,
    tags: Record<string, string>,
    resourceId: string = 'unknown'
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for mandatory tags
    MANDATORY_TAG_KEYS.forEach((key) => {
      if (!tags[key] || tags[key] === '') {
        errors.push({
          resourceId,
          resourceType,
          errorType: 'MISSING_MANDATORY_TAG',
          message: `Missing mandatory tag: ${key}`,
          tagKey: key,
        });
      }
    });

    // Validate tag key and value formats
    Object.entries(tags).forEach(([key, value]) => {
      const keyValidation = validateTagKey(key);
      if (!keyValidation.valid) {
        errors.push({
          resourceId,
          resourceType,
          errorType: 'INVALID_TAG_FORMAT',
          message: keyValidation.error || 'Invalid tag key format',
          tagKey: key,
        });
      }

      const valueValidation = validateTagValue(value);
      if (!valueValidation.valid) {
        errors.push({
          resourceId,
          resourceType,
          errorType: 'INVALID_TAG_VALUE',
          message: valueValidation.error || 'Invalid tag value format',
          tagKey: key,
        });
      }
    });

    // Validate DataClassification for data storage resources
    if (!this.validateDataClassification(resourceType, tags)) {
      errors.push({
        resourceId,
        resourceType,
        errorType: 'MISSING_DATA_CLASSIFICATION',
        message: 'Data storage resource missing DataClassification tag',
        tagKey: 'DataClassification',
      });
    }

    // Validate ComplianceScope for production resources
    if (tags.Stage === 'production' && !tags.ComplianceScope) {
      errors.push({
        resourceId,
        resourceType,
        errorType: 'MISSING_COMPLIANCE_SCOPE',
        message: 'Production resource missing ComplianceScope tag',
        tagKey: 'ComplianceScope',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      resourcesValidated: 1,
      resourcesWithIssues: errors.length > 0 ? 1 : 0,
    };
  }

  /**
   * Validate tag key and value format constraints
   * @param key Tag key to validate
   * @param value Tag value to validate
   * @returns True if both key and value are valid
   */
  validateTagFormat(key: string, value: string): boolean {
    const keyValidation = validateTagKey(key);
    const valueValidation = validateTagValue(value);
    return keyValidation.valid && valueValidation.valid;
  }

  /**
   * Validate that data storage resources have DataClassification tag
   * @param resourceType AWS CloudFormation resource type
   * @param tags Tags applied to the resource
   * @returns True if validation passes (either not a storage resource or has DataClassification)
   */
  validateDataClassification(
    resourceType: string,
    tags: Record<string, string>
  ): boolean {
    // Check if this is a data storage resource
    const isDataStorage = this.resourceTypeMapper.isDataStorageResource(resourceType);

    // If not a data storage resource, validation passes
    if (!isDataStorage) {
      return true;
    }

    // Data storage resources must have DataClassification tag
    return !!tags.DataClassification && tags.DataClassification !== '';
  }

  /**
   * Generate a human-readable validation report
   * @param result Validation result to format
   * @returns Formatted validation report as string
   */
  generateValidationReport(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('AWS Resource Tagging Validation Report');
    lines.push('='.repeat(80));
    lines.push('');

    // Summary
    lines.push('Summary:');
    lines.push(`  Resources Validated: ${result.resourcesValidated}`);
    lines.push(`  Resources with Issues: ${result.resourcesWithIssues}`);
    lines.push(`  Validation Status: ${result.valid ? 'PASSED ✓' : 'FAILED ✗'}`);
    lines.push('');

    // Errors
    if (result.errors.length > 0) {
      lines.push(`Errors (${result.errors.length}):`);
      lines.push('-'.repeat(80));

      // Group errors by resource
      const errorsByResource = this.groupByResource(result.errors);

      Object.entries(errorsByResource).forEach(([resourceId, errors]) => {
        lines.push(`  Resource: ${resourceId}`);
        lines.push(`  Type: ${errors[0].resourceType}`);
        errors.forEach((error) => {
          lines.push(`    ✗ [${error.errorType}] ${error.message}`);
        });
        lines.push('');
      });
    } else {
      lines.push('Errors: None ✓');
      lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push(`Warnings (${result.warnings.length}):`);
      lines.push('-'.repeat(80));

      // Group warnings by resource
      const warningsByResource = this.groupByResource(result.warnings);

      Object.entries(warningsByResource).forEach(([resourceId, warnings]) => {
        lines.push(`  Resource: ${resourceId}`);
        lines.push(`  Type: ${warnings[0].resourceType}`);
        warnings.forEach((warning) => {
          lines.push(`    ⚠ [${warning.warningType}] ${warning.message}`);
        });
        lines.push('');
      });
    } else {
      lines.push('Warnings: None ✓');
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Check if a construct is a taggable AWS resource
   */
  private isTaggableResource(construct: IConstruct): boolean {
    // Check if construct has a cfnResourceType (L1 construct)
    if ('cfnResourceType' in construct) {
      return true;
    }

    // Check for common L2 constructs that support tagging
    const resourceType = this.resourceTypeMapper.getResourceType(construct);
    return resourceType !== 'Unknown';
  }

  /**
   * Get tags applied to a CDK construct
   */
  private getResourceTags(construct: IConstruct): Record<string, string> {
    const tags: Record<string, string> = {};

    try {
      // Try to get tags from the construct
      // CDK stores tags in the construct's metadata
      const tagManager = (construct as any).tags;
      
      if (tagManager && typeof tagManager.renderTags === 'function') {
        const renderedTags = tagManager.renderTags();
        if (Array.isArray(renderedTags)) {
          renderedTags.forEach((tag: any) => {
            if (tag.key && tag.value !== undefined) {
              tags[tag.key] = tag.value;
            }
          });
        }
      }

      // Also check for tags in the node metadata
      const node = construct.node;
      if (node && node.metadata) {
        node.metadata.forEach((entry) => {
          if (entry.type === 'aws:cdk:tags') {
            const tagData = entry.data as any;
            if (tagData && typeof tagData === 'object') {
              Object.assign(tags, tagData);
            }
          }
        });
      }
    } catch (error) {
      // If we can't get tags, return empty object
      // This might happen for constructs that don't support tagging
    }

    return tags;
  }

  /**
   * Group errors or warnings by resource ID
   */
  private groupByResource<T extends { resourceId: string }>(
    items: T[]
  ): Record<string, T[]> {
    const grouped: Record<string, T[]> = {};

    items.forEach((item) => {
      if (!grouped[item.resourceId]) {
        grouped[item.resourceId] = [];
      }
      grouped[item.resourceId].push(item);
    });

    return grouped;
  }
}
