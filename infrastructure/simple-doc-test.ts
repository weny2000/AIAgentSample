import { TagManager } from './src/utils/tag-manager';
import { TagDocumentationGenerator } from './src/utils/tag-documentation-generator';
import { getTagConfig } from './src/config/tag-config';

async function testDocGeneration() {
  try {
    console.log('Testing documentation generation...');
    
    const stage = 'dev';
    const config = getTagConfig(stage);
    const tagManager = new TagManager(config, stage);
    const docGenerator = new TagDocumentationGenerator(tagManager, stage);
    
    console.log('Generating tag reference...');
    const tagReference = docGenerator.generateTagDocumentation();
    console.log('Tag reference generated successfully!');
    console.log('Length:', tagReference.length);
    
    console.log('Generating compliance report...');
    const complianceReport = docGenerator.generateComplianceReport();
    console.log('Compliance report generated successfully!');
    console.log('Length:', complianceReport.length);
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

testDocGeneration();