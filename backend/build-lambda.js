import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build TypeScript for Lambda functions only
console.log('Building Lambda TypeScript...');
execSync('npx tsc -p tsconfig.lambda.json', { stdio: 'inherit' });

// The Lambda functions are now built directly to dist/lambda
console.log('Lambda functions built to dist/lambda/');

console.log('Lambda build complete!');