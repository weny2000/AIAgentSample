/**
 * Example: Generate Tag Documentation
 * 
 * This example demonstrates how to use the TagDocumentationGenerator
 * to create comprehensive tag documentation and compliance reports.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TagDocumentationGenerator } from '../src/utils/tag-documentation-generator';
import { TagManager } from '../src/utils/tag-manager';
import { getTagConfig } from '../src/config/tag-config';

/**
 * Generate tag documentation for a specific environment
 */
function generateDocumentationForEnvironment(environment: string): void {
  console.log(`\n=== Generating Tag Documentation for ${environment} ===\n`);

  // Initialize TagManager and TagDocumentationGenerator
  const config = getTagConfig(environment);
  const tagManager = new TagManager(config, environment);
  const generator = new TagDocumentationGenerator(tagManager, environment);

  // 1. List all tag keys
  console.log('1. Listing all tag keys...');
  const tagKeys = generator.listTagKeys();
  console.log(`   Found ${tagKeys.length} unique tag keys:`);
  console.log(`   ${tagKeys.slice(0, 5).join(', ')}...`);

  // 2. Generate cost allocation tag list
  console.log('\n2. Generating cost allocation tag list...');
  const costTags = generator.generateCostAllocationTagList();
  console.log(`   Cost allocation tags (${costTags.length}):`);
  costTags.forEach(tag => console.log(`   - ${tag}`));

  // 3. Generate comprehensive tag documentation
  console.log('\n3. Generating comprehensive tag documentation...');
  const documentation = generator.generateTagDocumentation();
  const docPath = path.join(__dirname, `../../docs/TAG_REFERENCE_${environment.toUpperCase()}.md`);
  
  // Create docs directory if it doesn't exist
  const docsDir = path.dirname(docPath);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  fs.writeFileSync(docPath, documentation);
  console.log(`   ✓ Documentation saved to: ${docPath}`);
  console.log(`   ✓ Documentation size: ${documentation.length} characters`);

  // 4. Generate compliance report
  console.log('\n4. Generating compliance report...');
  const complianceReport = generator.generateComplianceReport();
  const reportPath = path.join(__dirname, `../../docs/COMPLIANCE_REPORT_${environment.toUpperCase()}.md`);
  fs.writeFileSync(reportPath, complianceReport);
  console.log(`   ✓ Compliance report saved to: ${reportPath}`);
  console.log(`   ✓ Report size: ${complianceReport.length} characters`);

  // 5. Display sample documentation excerpt
  console.log('\n5. Sample documentation excerpt:');
  const lines = documentation.split('\n');
  console.log('   ' + lines.slice(0, 10).join('\n   '));
  console.log('   ...');

  console.log(`\n✓ Documentation generation complete for ${environment}!\n`);
}

/**
 * Generate documentation for all environments
 */
function generateAllDocumentation(): void {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   AWS Resource Tagging Documentation Generator            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const environments = ['dev', 'staging', 'production'];

  environments.forEach(env => {
    generateDocumentationForEnvironment(env);
  });

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   All Documentation Generated Successfully!               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\nGenerated files:');
  console.log('  - docs/TAG_REFERENCE_DEV.md');
  console.log('  - docs/TAG_REFERENCE_STAGING.md');
  console.log('  - docs/TAG_REFERENCE_PRODUCTION.md');
  console.log('  - docs/COMPLIANCE_REPORT_DEV.md');
  console.log('  - docs/COMPLIANCE_REPORT_STAGING.md');
  console.log('  - docs/COMPLIANCE_REPORT_PRODUCTION.md');
  console.log('\nNext steps:');
  console.log('  1. Review the generated documentation');
  console.log('  2. Activate cost allocation tags in AWS Billing Console');
  console.log('  3. Share documentation with your team');
  console.log('  4. Set up automated documentation generation in CI/CD');
}

/**
 * Main execution
 */
if (require.main === module) {
  try {
    // Check for environment argument
    const args = process.argv.slice(2);
    
    if (args.length > 0 && args[0] !== 'all') {
      const environment = args[0];
      if (!['dev', 'staging', 'production'].includes(environment)) {
        console.error(`Error: Invalid environment "${environment}"`);
        console.error('Valid environments: dev, staging, production, all');
        process.exit(1);
      }
      generateDocumentationForEnvironment(environment);
    } else {
      generateAllDocumentation();
    }
  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

export { generateDocumentationForEnvironment, generateAllDocumentation };
