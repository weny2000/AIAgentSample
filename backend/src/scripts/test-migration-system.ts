#!/usr/bin/env node

/**
 * Test Script for Migration and Initialization System
 * 
 * This script tests the data migration and initialization system
 * to ensure all components are working correctly.
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

class MigrationSystemTester {
  private results: TestResult[] = [];

  constructor() {
    // Initialize tester
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('========================================');
    console.log('Migration System Test Suite');
    console.log('========================================\n');

    await this.testMigrationFiles();
    await this.testSeedingScripts();
    await this.testBackupScripts();
    await this.testInitializationScript();
    await this.testValidationScript();

    this.printResults();
  }

  /**
   * Test migration files exist and are valid
   */
  private async testMigrationFiles(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Migration Files';

    try {
      const fs = await import('fs');
      const path = await import('path');

      // Check if migrations directory exists
      const migrationsDir = path.resolve(__dirname, '../../../migrations');
      if (!fs.existsSync(migrationsDir)) {
        throw new Error('Migrations directory not found');
      }

      // Check for migration files
      const files = fs.readdirSync(migrationsDir);
      const migrationFiles = files.filter((f: string) => f.endsWith('.ts'));

      if (migrationFiles.length === 0) {
        throw new Error('No migration files found');
      }

      // Validate migration file structure
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for required exports
        if (!content.includes('export const version')) {
          throw new Error(`${file}: Missing version export`);
        }
        if (!content.includes('export const name')) {
          throw new Error(`${file}: Missing name export`);
        }
        if (!content.includes('export async function up()')) {
          throw new Error(`${file}: Missing up() function`);
        }
        if (!content.includes('export async function down()')) {
          throw new Error(`${file}: Missing down() function`);
        }
      }

      this.results.push({
        name: testName,
        passed: true,
        message: `Found ${migrationFiles.length} valid migration files`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Test seeding scripts exist
   */
  private async testSeedingScripts(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Seeding Scripts';

    try {
      const fs = await import('fs');
      const path = await import('path');

      const scriptsToCheck = [
        'data-seeding.ts',
        'work-task-data-seeding.ts'
      ];

      for (const script of scriptsToCheck) {
        const scriptPath = path.resolve(__dirname, script);
        if (!fs.existsSync(scriptPath)) {
          throw new Error(`Script not found: ${script}`);
        }

        const content = fs.readFileSync(scriptPath, 'utf8');
        
        // Check for required classes/functions
        if (!content.includes('class') && !content.includes('async function')) {
          throw new Error(`${script}: No class or function definitions found`);
        }
      }

      this.results.push({
        name: testName,
        passed: true,
        message: `All ${scriptsToCheck.length} seeding scripts found and valid`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Test backup scripts exist
   */
  private async testBackupScripts(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Backup Scripts';

    try {
      const fs = await import('fs');
      const path = await import('path');

      const scriptPath = path.resolve(__dirname, 'backup-restore.ts');
      if (!fs.existsSync(scriptPath)) {
        throw new Error('Backup script not found');
      }

      const content = fs.readFileSync(scriptPath, 'utf8');
      
      // Check for required methods
      const requiredMethods = [
        'createFullBackup',
        'restoreFromBackup',
        'listBackups',
        'validateBackup',
        'cleanupOldBackups'
      ];

      for (const method of requiredMethods) {
        if (!content.includes(method)) {
          throw new Error(`Missing method: ${method}`);
        }
      }

      this.results.push({
        name: testName,
        passed: true,
        message: 'Backup script found with all required methods',
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Test initialization script exists
   */
  private async testInitializationScript(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Initialization Script';

    try {
      const fs = await import('fs');
      const path = await import('path');

      const scriptPath = path.resolve(__dirname, 'work-task-initialization.ts');
      if (!fs.existsSync(scriptPath)) {
        throw new Error('Initialization script not found');
      }

      const content = fs.readFileSync(scriptPath, 'utf8');
      
      // Check for required methods
      const requiredMethods = [
        'initialize',
        'runMigrations',
        'seedConfigurations',
        'generateTestData',
        'validateSystem',
        'createBackup'
      ];

      for (const method of requiredMethods) {
        if (!content.includes(method)) {
          throw new Error(`Missing method: ${method}`);
        }
      }

      this.results.push({
        name: testName,
        passed: true,
        message: 'Initialization script found with all required methods',
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Test validation script exists
   */
  private async testValidationScript(): Promise<void> {
    const startTime = Date.now();
    const testName = 'Validation Script';

    try {
      const fs = await import('fs');
      const path = await import('path');

      const scriptPath = path.resolve(__dirname, 'data-validation.ts');
      if (!fs.existsSync(scriptPath)) {
        throw new Error('Validation script not found');
      }

      const content = fs.readFileSync(scriptPath, 'utf8');
      
      // Check for required methods
      const requiredMethods = [
        'validateAll',
        'validatePersonas',
        'validateTeamRosters',
        'validateArtifactTemplates',
        'validateRules'
      ];

      for (const method of requiredMethods) {
        if (!content.includes(method)) {
          throw new Error(`Missing method: ${method}`);
        }
      }

      this.results.push({
        name: testName,
        passed: true,
        message: 'Validation script found with all required methods',
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Print test results
   */
  private printResults(): void {
    console.log('\n========================================');
    console.log('Test Results');
    console.log('========================================\n');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} - ${result.name}`);
      console.log(`  Message: ${result.message}`);
      console.log(`  Duration: ${result.duration}ms\n`);
    });

    console.log('========================================');
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log('========================================\n');

    if (failed > 0) {
      console.log('❌ Some tests failed. Please review the errors above.');
      process.exit(1);
    } else {
      console.log('✅ All tests passed successfully!');
      process.exit(0);
    }
  }
}

// Run tests
const tester = new MigrationSystemTester();
tester.runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
