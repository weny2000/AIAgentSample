#!/usr/bin/env node

/**
 * Generate Tag Documentation Script
 * 
 * This script generates comprehensive documentation for AWS resource tagging:
 * - TAG_REFERENCE.md: Complete tag reference guide
 * - RESOURCE_TAGGING_REPORT.md: Resource tagging summary
 * - COST_ALLOCATION_GUIDE.md: Cost allocation instructions
 * - COMPLIANCE_TAGGING_REPORT.md: Compliance report
 */

import * as fs from 'fs';
import * as path from 'path';
import { TagManager } from '../src/utils/tag-manager';
import { TagDocumentationGenerator } from '../src/utils/tag-documentation-generator';
import { getTagConfig } from '../src/config/tag-config';

/**
 * Main function to generate all documentation
 */
async function main() {
  // Get stage from command line or default to 'dev'
  const stage = process.argv[2] || 'dev';
  
  console.log('='.repeat(80));
  console.log('AWS Resource Tagging Documentation Generator');
  console.log('='.repeat(80));
  console.log(`Environment: ${stage}`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');

  // Initialize TagManager and TagDocumentationGenerator
  const config = getTagConfig(stage);
  const tagManager = new TagManager(config, stage);
  const docGenerator = new TagDocumentationGenerator(tagManager, stage);

  // Create docs directory if it doesn't exist
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Generate TAG_REFERENCE.md
  console.log('Generating TAG_REFERENCE.md...');
  const tagReference = docGenerator.generateTagDocumentation();
  const tagReferencePath = path.join(docsDir, 'TAG_REFERENCE.md');
  fs.writeFileSync(tagReferencePath, tagReference, 'utf-8');
  console.log(`✓ Generated: ${tagReferencePath}`);
  console.log('');

  // Generate RESOURCE_TAGGING_REPORT.md
  console.log('Generating RESOURCE_TAGGING_REPORT.md...');
  const resourceReport = generateResourceTaggingReport(docGenerator, stage);
  const resourceReportPath = path.join(docsDir, 'RESOURCE_TAGGING_REPORT.md');
  fs.writeFileSync(resourceReportPath, resourceReport, 'utf-8');
  console.log(`✓ Generated: ${resourceReportPath}`);
  console.log('');

  // Generate COST_ALLOCATION_GUIDE.md
  console.log('Generating COST_ALLOCATION_GUIDE.md...');
  const costGuide = generateCostAllocationGuide(docGenerator, stage);
  const costGuidePath = path.join(docsDir, 'COST_ALLOCATION_GUIDE.md');
  fs.writeFileSync(costGuidePath, costGuide, 'utf-8');
  console.log(`✓ Generated: ${costGuidePath}`);
  console.log('');

  // Generate COMPLIANCE_TAGGING_REPORT.md
  console.log('Generating COMPLIANCE_TAGGING_REPORT.md...');
  const complianceReport = docGenerator.generateComplianceReport();
  const complianceReportPath = path.join(docsDir, 'COMPLIANCE_TAGGING_REPORT.md');
  fs.writeFileSync(complianceReportPath, complianceReport, 'utf-8');
  console.log(`✓ Generated: ${complianceReportPath}`);
  console.log('');

  console.log('='.repeat(80));
  console.log('Documentation Generation Complete!');
  console.log('='.repeat(80));
  console.log('');
  console.log('Generated files:');
  console.log(`  - ${tagReferencePath}`);
  console.log(`  - ${resourceReportPath}`);
  console.log(`  - ${costGuidePath}`);
  console.log(`  - ${complianceReportPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the generated documentation');
  console.log('  2. Activate cost allocation tags in AWS Billing Console');
  console.log('  3. Share documentation with your team');
  console.log('  4. Include in deployment process for automated updates');
  console.log('');
}

/**
 * Generate Resource Tagging Report
 */
function generateResourceTaggingReport(
  docGenerator: TagDocumentationGenerator,
  stage: string
): string {
  const sections: string[] = [];

  // Header
  sections.push('# AWS Resource Tagging Report');
  sections.push('');
  sections.push('This document provides a comprehensive report of all tags used across AWS resources.');
  sections.push('');
  sections.push(`**Environment:** ${stage}`);
  sections.push(`**Generated:** ${new Date().toISOString()}`);
  sections.push('');

  // Overview
  sections.push('## Overview');
  sections.push('');
  sections.push('This report summarizes the tagging strategy implemented for the AI Agent System infrastructure.');
  sections.push('All resources are tagged according to organizational standards to enable:');
  sections.push('');
  sections.push('- Cost allocation and tracking');
  sections.push('- Resource management and organization');
  sections.push('- Compliance and security auditing');
  sections.push('- Automated lifecycle management');
  sections.push('');

  // Tag Summary
  sections.push('## Tag Summary');
  sections.push('');
  const allTags = docGenerator.listTagKeys();
  sections.push(`**Total Tag Keys:** ${allTags.length}`);
  sections.push('');
  sections.push('### All Tag Keys');
  sections.push('');
  allTags.forEach(tag => {
    sections.push(`- ${tag}`);
  });
  sections.push('');

  // Resource Type Coverage
  sections.push('## Resource Type Coverage');
  sections.push('');
  sections.push('The following resource types have specific tagging configurations:');
  sections.push('');
  sections.push('| Resource Type | Component Tag | Specific Tags |');
  sections.push('|---------------|---------------|---------------|');
  sections.push('| Lambda Functions | Compute-Lambda | FunctionPurpose, Runtime |');
  sections.push('| DynamoDB Tables | Database-DynamoDB | TablePurpose, DataClassification |');
  sections.push('| S3 Buckets | Storage-S3 | BucketPurpose, DataClassification, BackupPolicy |');
  sections.push('| RDS Instances | Database-RDS | Engine, DataClassification, BackupPolicy |');
  sections.push('| VPC Resources | Network-VPC | NetworkTier |');
  sections.push('| API Gateway | API-Gateway | ApiPurpose |');
  sections.push('| Step Functions | Orchestration-StepFunctions | WorkflowPurpose |');
  sections.push('| CloudWatch | Monitoring-CloudWatch | MonitoringType |');
  sections.push('| KMS Keys | Security-KMS | KeyPurpose |');
  sections.push('| Cognito | Security-Cognito | AuthPurpose |');
  sections.push('');

  // Tag Application Strategy
  sections.push('## Tag Application Strategy');
  sections.push('');
  sections.push('### Automatic Tag Application');
  sections.push('');
  sections.push('Tags are applied automatically during CDK deployment using:');
  sections.push('');
  sections.push('1. **Stack-Level Tags**: Applied to all resources in the stack');
  sections.push('2. **Aspect-Based Tags**: Applied via CDK Aspects for cross-cutting concerns');
  sections.push('3. **Construct-Level Tags**: Applied to specific constructs');
  sections.push('4. **Resource-Level Tags**: Applied directly to individual resources');
  sections.push('');

  sections.push('### Tag Precedence');
  sections.push('');
  sections.push('When multiple tag sources exist, the following precedence applies (highest to lowest):');
  sections.push('');
  sections.push('1. Resource-level explicit tags');
  sections.push('2. Construct-level tags');
  sections.push('3. Aspect-applied tags');
  sections.push('4. Stack-level tags');
  sections.push('');

  // Validation and Compliance
  sections.push('## Validation and Compliance');
  sections.push('');
  sections.push('### Pre-Deployment Validation');
  sections.push('');
  sections.push('All resources are validated before deployment to ensure:');
  sections.push('');
  sections.push('- All mandatory tags are present');
  sections.push('- Tag keys and values meet AWS constraints');
  sections.push('- Data storage resources have DataClassification tags');
  sections.push('- Production resources have ComplianceScope tags');
  sections.push('');

  sections.push('### Validation Enforcement');
  sections.push('');
  sections.push('- Validation runs automatically during `cdk synth`');
  sections.push('- Deployment fails if validation errors are detected');
  sections.push('- Validation reports are generated for audit purposes');
  sections.push('');

  // Maintenance
  sections.push('## Maintenance and Updates');
  sections.push('');
  sections.push('### Tag Updates');
  sections.push('');
  sections.push('To update tags:');
  sections.push('');
  sections.push('1. Modify tag configuration in `infrastructure/src/config/tag-config.ts`');
  sections.push('2. Update resource-specific tags in construct files');
  sections.push('3. Run validation: `npm run validate-tags`');
  sections.push('4. Deploy changes: `npm run deploy`');
  sections.push('');

  sections.push('### Documentation Updates');
  sections.push('');
  sections.push('Regenerate documentation after tag changes:');
  sections.push('');
  sections.push('```bash');
  sections.push('npm run generate-tag-docs');
  sections.push('```');
  sections.push('');

  // References
  sections.push('## References');
  sections.push('');
  sections.push('- [TAG_REFERENCE.md](./TAG_REFERENCE.md) - Complete tag reference');
  sections.push('- [COST_ALLOCATION_GUIDE.md](./COST_ALLOCATION_GUIDE.md) - Cost allocation setup');
  sections.push('- [COMPLIANCE_TAGGING_REPORT.md](./COMPLIANCE_TAGGING_REPORT.md) - Compliance report');
  sections.push('');

  return sections.join('\n');
}

/**
 * Generate Cost Allocation Guide
 */
function generateCostAllocationGuide(
  docGenerator: TagDocumentationGenerator,
  stage: string
): string {
  const sections: string[] = [];

  // Header
  sections.push('# AWS Cost Allocation Tag Guide');
  sections.push('');
  sections.push('This guide provides instructions for activating and using cost allocation tags.');
  sections.push('');
  sections.push(`**Environment:** ${stage}`);
  sections.push(`**Generated:** ${new Date().toISOString()}`);
  sections.push('');

  // Introduction
  sections.push('## Introduction');
  sections.push('');
  sections.push('Cost allocation tags enable detailed cost tracking and analysis in AWS Cost Explorer and AWS Cost and Usage Reports.');
  sections.push('By activating these tags, you can:');
  sections.push('');
  sections.push('- Track costs by project, environment, and component');
  sections.push('- Allocate costs to teams and cost centers');
  sections.push('- Identify cost optimization opportunities');
  sections.push('- Generate detailed financial reports');
  sections.push('');

  // Tag Activation
  sections.push('## Activating Cost Allocation Tags');
  sections.push('');
  sections.push('### Step 1: Access AWS Billing Console');
  sections.push('');
  sections.push('1. Sign in to the AWS Management Console');
  sections.push('2. Navigate to **Billing and Cost Management**');
  sections.push('3. In the left navigation pane, choose **Cost Allocation Tags**');
  sections.push('');

  sections.push('### Step 2: Activate User-Defined Tags');
  sections.push('');
  sections.push('Activate the following tags for cost allocation:');
  sections.push('');
  const costTags = docGenerator.generateCostAllocationTagList();
  costTags.forEach(tag => {
    sections.push(`- \`${tag}\``);
  });
  sections.push('');
  sections.push('**Note:** It may take up to 24 hours for tags to appear in the console after resources are created.');
  sections.push('');

  sections.push('### Step 3: Verify Tag Activation');
  sections.push('');
  sections.push('1. Check the **Status** column for each tag');
  sections.push('2. Ensure all tags show as **Active**');
  sections.push('3. Wait 24 hours for cost data to populate');
  sections.push('');

  // Cost Explorer Queries
  sections.push('## Using Cost Allocation Tags in Cost Explorer');
  sections.push('');
  sections.push('### Cost by Component');
  sections.push('');
  sections.push('Track spending by infrastructure component:');
  sections.push('');
  sections.push('1. Open **AWS Cost Explorer**');
  sections.push('2. Select time range (e.g., Last 30 days)');
  sections.push('3. Group by: **Tag** → **Component**');
  sections.push('4. Apply filters as needed');
  sections.push('');
  sections.push('**Use Cases:**');
  sections.push('- Identify most expensive components');
  sections.push('- Compare compute vs. storage costs');
  sections.push('- Track component cost trends over time');
  sections.push('');

  sections.push('### Cost by Environment');
  sections.push('');
  sections.push('Compare costs across dev, staging, and production:');
  sections.push('');
  sections.push('1. Open **AWS Cost Explorer**');
  sections.push('2. Select time range');
  sections.push('3. Group by: **Tag** → **Stage** or **Environment**');
  sections.push('4. Compare environment costs');
  sections.push('');
  sections.push('**Use Cases:**');
  sections.push('- Ensure non-production costs are reasonable');
  sections.push('- Identify opportunities to reduce dev/staging costs');
  sections.push('- Budget production vs. non-production spending');
  sections.push('');

  sections.push('### Cost by Team/Owner');
  sections.push('');
  sections.push('Allocate costs to teams:');
  sections.push('');
  sections.push('1. Open **AWS Cost Explorer**');
  sections.push('2. Select time range');
  sections.push('3. Group by: **Tag** → **Owner**');
  sections.push('4. Generate team cost reports');
  sections.push('');
  sections.push('**Use Cases:**');
  sections.push('- Chargeback to teams or departments');
  sections.push('- Track team resource usage');
  sections.push('- Identify team-specific optimization opportunities');
  sections.push('');

  sections.push('### Cost by Cost Center');
  sections.push('');
  sections.push('Financial reporting by cost center:');
  sections.push('');
  sections.push('1. Open **AWS Cost Explorer**');
  sections.push('2. Select time range');
  sections.push('3. Group by: **Tag** → **CostCenter**');
  sections.push('4. Export for financial reporting');
  sections.push('');
  sections.push('**Use Cases:**');
  sections.push('- Financial reporting and budgeting');
  sections.push('- Cost center accountability');
  sections.push('- Budget variance analysis');
  sections.push('');

  // Advanced Queries
  sections.push('## Advanced Cost Analysis');
  sections.push('');
  sections.push('### Multi-Dimensional Analysis');
  sections.push('');
  sections.push('Combine multiple tags for detailed analysis:');
  sections.push('');
  sections.push('**Example: Component costs by environment**');
  sections.push('');
  sections.push('1. Group by: **Tag** → **Component**');
  sections.push('2. Filter by: **Tag** → **Stage** = "production"');
  sections.push('3. Analyze production component costs');
  sections.push('');

  sections.push('### Cost Anomaly Detection');
  sections.push('');
  sections.push('Set up cost anomaly detection with tag filters:');
  sections.push('');
  sections.push('1. Navigate to **AWS Cost Anomaly Detection**');
  sections.push('2. Create a new monitor');
  sections.push('3. Add tag filters (e.g., Stage=production)');
  sections.push('4. Configure alert thresholds');
  sections.push('5. Set up SNS notifications');
  sections.push('');

  sections.push('### Budget Alerts');
  sections.push('');
  sections.push('Create budgets with tag filters:');
  sections.push('');
  sections.push('1. Navigate to **AWS Budgets**');
  sections.push('2. Create a new budget');
  sections.push('3. Add tag filters (e.g., Component=Compute-Lambda)');
  sections.push('4. Set budget amount and alert thresholds');
  sections.push('5. Configure notifications');
  sections.push('');

  // Cost Optimization
  sections.push('## Cost Optimization Strategies');
  sections.push('');
  sections.push('### Identify Unused Resources');
  sections.push('');
  sections.push('Use tags to find resources that can be shut down:');
  sections.push('');
  sections.push('- Filter by `AutoShutdown=true` in non-production');
  sections.push('- Review resources with low utilization');
  sections.push('- Identify orphaned resources');
  sections.push('');

  sections.push('### Right-Sizing Opportunities');
  sections.push('');
  sections.push('Analyze costs by component to identify right-sizing opportunities:');
  sections.push('');
  sections.push('- Compare component costs to usage metrics');
  sections.push('- Identify over-provisioned resources');
  sections.push('- Review Lambda memory and timeout settings');
  sections.push('- Optimize RDS instance sizes');
  sections.push('');

  sections.push('### Reserved Instance Planning');
  sections.push('');
  sections.push('Use production tags to plan reserved instances:');
  sections.push('');
  sections.push('- Filter by `Stage=production` and `AutoShutdown=false`');
  sections.push('- Analyze steady-state usage patterns');
  sections.push('- Calculate potential RI savings');
  sections.push('');

  // Reporting
  sections.push('## Cost Reporting');
  sections.push('');
  sections.push('### Monthly Cost Reports');
  sections.push('');
  sections.push('Generate monthly reports using Cost Explorer:');
  sections.push('');
  sections.push('1. Set time range to previous month');
  sections.push('2. Group by relevant tags (Component, Owner, CostCenter)');
  sections.push('3. Export to CSV');
  sections.push('4. Share with stakeholders');
  sections.push('');

  sections.push('### Cost and Usage Reports (CUR)');
  sections.push('');
  sections.push('For detailed analysis, enable AWS Cost and Usage Reports:');
  sections.push('');
  sections.push('1. Navigate to **Cost and Usage Reports**');
  sections.push('2. Create a new report');
  sections.push('3. Include resource IDs and tags');
  sections.push('4. Configure S3 delivery');
  sections.push('5. Use with Amazon Athena or QuickSight for analysis');
  sections.push('');

  // Best Practices
  sections.push('## Best Practices');
  sections.push('');
  sections.push('### Regular Review');
  sections.push('');
  sections.push('- Review cost allocation tags monthly');
  sections.push('- Verify all resources are properly tagged');
  sections.push('- Update tags as infrastructure evolves');
  sections.push('');

  sections.push('### Tag Consistency');
  sections.push('');
  sections.push('- Use automated tagging via CDK');
  sections.push('- Avoid manual tag modifications');
  sections.push('- Validate tags before deployment');
  sections.push('');

  sections.push('### Cost Awareness');
  sections.push('');
  sections.push('- Share cost reports with development teams');
  sections.push('- Set up budget alerts for key components');
  sections.push('- Review cost trends regularly');
  sections.push('- Celebrate cost optimization wins');
  sections.push('');

  // Troubleshooting
  sections.push('## Troubleshooting');
  sections.push('');
  sections.push('### Tags Not Appearing in Cost Explorer');
  sections.push('');
  sections.push('**Issue:** Tags are not visible in Cost Explorer');
  sections.push('');
  sections.push('**Solutions:**');
  sections.push('- Wait 24 hours after tag activation');
  sections.push('- Verify tags are applied to resources in AWS Console');
  sections.push('- Check that resources have incurred costs');
  sections.push('- Ensure tags are activated in Billing Console');
  sections.push('');

  sections.push('### Inconsistent Tag Values');
  sections.push('');
  sections.push('**Issue:** Tag values are inconsistent across resources');
  sections.push('');
  sections.push('**Solutions:**');
  sections.push('- Use automated tagging via CDK');
  sections.push('- Run tag validation before deployment');
  sections.push('- Review tag configuration in code');
  sections.push('- Redeploy resources with correct tags');
  sections.push('');

  // References
  sections.push('## References');
  sections.push('');
  sections.push('- [AWS Cost Allocation Tags Documentation](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html)');
  sections.push('- [AWS Cost Explorer User Guide](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html)');
  sections.push('- [TAG_REFERENCE.md](./TAG_REFERENCE.md) - Complete tag reference');
  sections.push('- [RESOURCE_TAGGING_REPORT.md](./RESOURCE_TAGGING_REPORT.md) - Resource tagging summary');
  sections.push('');

  return sections.join('\n');
}

// Run the script
main().catch(error => {
  console.error('Error generating documentation:', error);
  process.exit(1);
});
