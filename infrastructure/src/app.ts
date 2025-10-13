#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { AiAgentStack } from './stacks/ai-agent-stack';
import { TagValidator } from './utils/tag-validator';
import { TagManager } from './utils/tag-manager';
import { TagDocumentationGenerator } from './utils/tag-documentation-generator';
import { getTagConfig } from './config/tag-config';

const app = new cdk.App();

// Get stage from context or default to 'dev'
const stage = app.node.tryGetContext('stage') || 'dev';

// Create the stack
const stack = new AiAgentStack(app, `AiAgentStack-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: `AI Agent System infrastructure for ${stage} environment`,
  tags: {
    Project: 'AiAgentSystem',
    Stage: stage,
    ManagedBy: 'CDK',
  },
});

// Validate tags before synthesis
// Skip validation if SKIP_TAG_VALIDATION environment variable is set
if (!process.env.SKIP_TAG_VALIDATION) {
  const validator = new TagValidator();
  
  console.log('\n🔍 Validating resource tags...\n');
  
  const validationResult = validator.validateStack(stack);
  const report = validator.generateValidationReport(validationResult);
  
  console.log(report);
  
  // Exit with error if validation fails
  if (!validationResult.valid) {
    console.error('\n❌ Tag validation failed. Deployment aborted.');
    console.error('Fix the tagging issues above and try again.\n');
    console.error('To skip validation (not recommended), set SKIP_TAG_VALIDATION=true\n');
    process.exit(1);
  }
  
  console.log('✅ Tag validation passed. Proceeding with deployment.\n');
} else {
  console.log('\n⚠️  Tag validation skipped (SKIP_TAG_VALIDATION is set)\n');
}

// Generate tag documentation
// Skip documentation generation if SKIP_TAG_DOCS environment variable is set
if (!process.env.SKIP_TAG_DOCS) {
  console.log('\n📝 Generating tag documentation...\n');
  
  try {
    const config = getTagConfig(stage);
    const tagManager = new TagManager(config, stage);
    const docGenerator = new TagDocumentationGenerator(tagManager, stage);
    
    // Create docs directory if it doesn't exist
    const docsDir = path.join(__dirname, '../docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    // Generate TAG_REFERENCE.md
    const tagReference = docGenerator.generateTagDocumentation();
    fs.writeFileSync(path.join(docsDir, 'TAG_REFERENCE.md'), tagReference, 'utf-8');
    console.log('  ✓ Generated TAG_REFERENCE.md');
    
    // Generate RESOURCE_TAGGING_REPORT.md
    const resourceReport = generateResourceTaggingReport(docGenerator, stage);
    fs.writeFileSync(path.join(docsDir, 'RESOURCE_TAGGING_REPORT.md'), resourceReport, 'utf-8');
    console.log('  ✓ Generated RESOURCE_TAGGING_REPORT.md');
    
    // Generate COST_ALLOCATION_GUIDE.md
    const costGuide = generateCostAllocationGuide(docGenerator, stage);
    fs.writeFileSync(path.join(docsDir, 'COST_ALLOCATION_GUIDE.md'), costGuide, 'utf-8');
    console.log('  ✓ Generated COST_ALLOCATION_GUIDE.md');
    
    // Generate COMPLIANCE_TAGGING_REPORT.md
    const complianceReport = docGenerator.generateComplianceReport();
    fs.writeFileSync(path.join(docsDir, 'COMPLIANCE_TAGGING_REPORT.md'), complianceReport, 'utf-8');
    console.log('  ✓ Generated COMPLIANCE_TAGGING_REPORT.md');
    
    console.log('\n✅ Tag documentation generated successfully.\n');
  } catch (error) {
    console.error('\n⚠️  Failed to generate tag documentation:', error);
    console.error('Continuing with deployment...\n');
  }
} else {
  console.log('\n⚠️  Tag documentation generation skipped (SKIP_TAG_DOCS is set)\n');
}

// Helper function to generate resource tagging report
function generateResourceTaggingReport(docGenerator: TagDocumentationGenerator, stage: string): string {
  const sections: string[] = [];
  sections.push('# AWS Resource Tagging Report');
  sections.push('');
  sections.push('This document provides a comprehensive report of all tags used across AWS resources.');
  sections.push('');
  sections.push(`**Environment:** ${stage}`);
  sections.push(`**Generated:** ${new Date().toISOString()}`);
  sections.push('');
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
  sections.push('## Tag Summary');
  sections.push('');
  const allTags = docGenerator.listTagKeys();
  sections.push(`**Total Tag Keys:** ${allTags.length}`);
  sections.push('');
  sections.push('### All Tag Keys');
  sections.push('');
  allTags.forEach(tag => sections.push(`- ${tag}`));
  sections.push('');
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
  return sections.join('\n');
}

// Helper function to generate cost allocation guide
function generateCostAllocationGuide(docGenerator: TagDocumentationGenerator, stage: string): string {
  const sections: string[] = [];
  sections.push('# AWS Cost Allocation Tag Guide');
  sections.push('');
  sections.push('This guide provides instructions for activating and using cost allocation tags.');
  sections.push('');
  sections.push(`**Environment:** ${stage}`);
  sections.push(`**Generated:** ${new Date().toISOString()}`);
  sections.push('');
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
  costTags.forEach(tag => sections.push(`- \`${tag}\``));
  sections.push('');
  sections.push('**Note:** It may take up to 24 hours for tags to appear in the console after resources are created.');
  sections.push('');
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
  sections.push('### Cost by Environment');
  sections.push('');
  sections.push('Compare costs across dev, staging, and production:');
  sections.push('');
  sections.push('1. Open **AWS Cost Explorer**');
  sections.push('2. Select time range');
  sections.push('3. Group by: **Tag** → **Stage** or **Environment**');
  sections.push('4. Compare environment costs');
  sections.push('');
  return sections.join('\n');
}

// Synthesize the CloudFormation template
app.synth();
