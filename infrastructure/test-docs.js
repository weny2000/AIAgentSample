const { execSync } = require('child_process');

try {
  console.log('Testing documentation generation...');
  execSync('npx ts-node scripts/generate-tag-documentation.ts dev', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  console.log('Documentation generation completed successfully!');
} catch (error) {
  console.error('Error:', error.message);
}