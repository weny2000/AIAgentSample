const { execSync } = require('child_process');

try {
  const output = execSync('npm test -- tagging-aspect.test.ts --verbose', {
    encoding: 'utf-8',
    stdio: 'pipe',
    maxBuffer: 10 * 1024 * 1024
  });
  console.log(output);
} catch (error) {
  console.log(error.stdout);
  console.log(error.stderr);
}
