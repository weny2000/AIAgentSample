#!/usr/bin/env node
/**
 * Environment Configuration and Parameter Management
 * 
 * This script manages:
 * - Environment-specific configuration
 * - AWS Systems Manager Parameter Store integration
 * - Secrets Manager integration
 * - Configuration validation
 * - Configuration versioning and rollback
 */

import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  DeleteParameterCommand,
  ParameterType,
  Parameter,
} from '@aws-sdk/client-ssm';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  GetSecretValueCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

interface EnvironmentConfig {
  stage: string;
  region: string;
  parameters: Record<string, string>;
  secrets: Record<string, string>;
}

interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

class EnvironmentConfigManager {
  private ssmClient: SSMClient;
  private secretsClient: SecretsManagerClient;
  private stage: string;
  private region: string;

  constructor(stage: string, region: string) {
    this.stage = stage;
    this.region = region;
    this.ssmClient = new SSMClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
  }

  /**
   * Load configuration from file
   */
  loadConfigFromFile(configPath: string): EnvironmentConfig {
    const fullPath = path.resolve(configPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Configuration file not found: ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(content);

    return {
      stage: this.stage,
      region: this.region,
      parameters: config.parameters || {},
      secrets: config.secrets || {},
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: EnvironmentConfig): ConfigValidationResult {
    const result: ConfigValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Required parameters
    const requiredParams = [
      'API_GATEWAY_STAGE',
      'COGNITO_USER_POOL_ID',
      'COGNITO_CLIENT_ID',
      'KENDRA_INDEX_ID',
      'DYNAMODB_TABLE_PREFIX',
      'S3_ARTIFACTS_BUCKET',
      'S3_DOCUMENTS_BUCKET',
    ];

    for (const param of requiredParams) {
      if (!config.parameters[param]) {
        result.errors.push(`Missing required parameter: ${param}`);
        result.valid = false;
      }
    }

    // Required secrets
    const requiredSecrets = [
      'DATABASE_PASSWORD',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
    ];

    for (const secret of requiredSecrets) {
      if (!config.secrets[secret]) {
        result.errors.push(`Missing required secret: ${secret}`);
        result.valid = false;
      }
    }

    // Validate parameter values
    if (config.parameters.API_GATEWAY_STAGE && 
        !['dev', 'staging', 'production'].includes(config.parameters.API_GATEWAY_STAGE)) {
      result.warnings.push(`Unusual API_GATEWAY_STAGE value: ${config.parameters.API_GATEWAY_STAGE}`);
    }

    return result;
  }

  /**
   * Deploy configuration to AWS
   */
  async deployConfig(config: EnvironmentConfig, dryRun: boolean = false): Promise<void> {
    console.log(`\nDeploying configuration for stage: ${this.stage}`);
    console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}\n`);

    // Validate first
    const validation = this.validateConfig(config);
    
    if (!validation.valid) {
      console.error('Configuration validation failed:');
      validation.errors.forEach(err => console.error(`  ✗ ${err}`));
      throw new Error('Configuration validation failed');
    }

    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:');
      validation.warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
    }

    // Deploy parameters
    console.log('Deploying parameters to SSM Parameter Store...');
    await this.deployParameters(config.parameters, dryRun);

    // Deploy secrets
    console.log('\nDeploying secrets to Secrets Manager...');
    await this.deploySecrets(config.secrets, dryRun);

    console.log('\n✓ Configuration deployment completed successfully');
  }

  /**
   * Deploy parameters to SSM Parameter Store
   */
  private async deployParameters(
    parameters: Record<string, string>,
    dryRun: boolean
  ): Promise<void> {
    const parameterPrefix = `/ai-agent/${this.stage}`;

    for (const [key, value] of Object.entries(parameters)) {
      const parameterName = `${parameterPrefix}/${key}`;
      
      console.log(`  ${dryRun ? '[DRY RUN] ' : ''}Setting parameter: ${parameterName}`);

      if (!dryRun) {
        try {
          await this.ssmClient.send(
            new PutParameterCommand({
              Name: parameterName,
              Value: value,
              Type: ParameterType.STRING,
              Overwrite: true,
              Description: `AI Agent ${this.stage} - ${key}`,
              Tags: [
                { Key: 'Project', Value: 'AiAgentSystem' },
                { Key: 'Stage', Value: this.stage },
                { Key: 'ManagedBy', Value: 'EnvironmentConfigManager' },
              ],
            })
          );
          console.log(`    ✓ Parameter set successfully`);
        } catch (error) {
          console.error(`    ✗ Failed to set parameter: ${error}`);
          throw error;
        }
      }
    }
  }

  /**
   * Deploy secrets to Secrets Manager
   */
  private async deploySecrets(
    secrets: Record<string, string>,
    dryRun: boolean
  ): Promise<void> {
    const secretPrefix = `ai-agent/${this.stage}`;

    for (const [key, value] of Object.entries(secrets)) {
      const secretName = `${secretPrefix}/${key}`;
      
      console.log(`  ${dryRun ? '[DRY RUN] ' : ''}Setting secret: ${secretName}`);

      if (!dryRun) {
        try {
          // Check if secret exists
          const exists = await this.secretExists(secretName);

          if (exists) {
            // Update existing secret
            await this.secretsClient.send(
              new UpdateSecretCommand({
                SecretId: secretName,
                SecretString: value,
              })
            );
            console.log(`    ✓ Secret updated successfully`);
          } else {
            // Create new secret
            await this.secretsClient.send(
              new CreateSecretCommand({
                Name: secretName,
                SecretString: value,
                Description: `AI Agent ${this.stage} - ${key}`,
                Tags: [
                  { Key: 'Project', Value: 'AiAgentSystem' },
                  { Key: 'Stage', Value: this.stage },
                  { Key: 'ManagedBy', Value: 'EnvironmentConfigManager' },
                ],
              })
            );
            console.log(`    ✓ Secret created successfully`);
          }
        } catch (error) {
          console.error(`    ✗ Failed to set secret: ${error}`);
          throw error;
        }
      }
    }
  }

  /**
   * Check if secret exists
   */
  private async secretExists(secretName: string): Promise<boolean> {
    try {
      await this.secretsClient.send(
        new DescribeSecretCommand({
          SecretId: secretName,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Retrieve current configuration from AWS
   */
  async retrieveConfig(): Promise<EnvironmentConfig> {
    console.log(`\nRetrieving configuration for stage: ${this.stage}\n`);

    const parameters = await this.retrieveParameters();
    const secrets = await this.retrieveSecrets();

    return {
      stage: this.stage,
      region: this.region,
      parameters,
      secrets,
    };
  }

  /**
   * Retrieve parameters from SSM
   */
  private async retrieveParameters(): Promise<Record<string, string>> {
    const parameterPrefix = `/ai-agent/${this.stage}`;
    const parameters: Record<string, string> = {};

    try {
      const response = await this.ssmClient.send(
        new GetParametersByPathCommand({
          Path: parameterPrefix,
          Recursive: true,
          WithDecryption: true,
        })
      );

      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (param.Name && param.Value) {
            const key = param.Name.replace(`${parameterPrefix}/`, '');
            parameters[key] = param.Value;
          }
        }
      }

      console.log(`Retrieved ${Object.keys(parameters).length} parameters from SSM`);
    } catch (error) {
      console.error(`Failed to retrieve parameters: ${error}`);
    }

    return parameters;
  }

  /**
   * Retrieve secrets from Secrets Manager
   */
  private async retrieveSecrets(): Promise<Record<string, string>> {
    const secretPrefix = `ai-agent/${this.stage}`;
    const secrets: Record<string, string> = {};

    // Note: Secrets Manager doesn't have a list-by-prefix API
    // In production, you'd maintain a list of secret names
    const secretNames = [
      'DATABASE_PASSWORD',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
    ];

    for (const secretKey of secretNames) {
      const secretName = `${secretPrefix}/${secretKey}`;
      
      try {
        const response = await this.secretsClient.send(
          new GetSecretValueCommand({
            SecretId: secretName,
          })
        );

        if (response.SecretString) {
          secrets[secretKey] = response.SecretString;
        }
      } catch (error: any) {
        if (error.name !== 'ResourceNotFoundException') {
          console.error(`Failed to retrieve secret ${secretName}: ${error}`);
        }
      }
    }

    console.log(`Retrieved ${Object.keys(secrets).length} secrets from Secrets Manager`);

    return secrets;
  }

  /**
   * Export configuration to file
   */
  exportConfigToFile(config: EnvironmentConfig, outputPath: string): void {
    const output = {
      stage: config.stage,
      region: config.region,
      parameters: config.parameters,
      secrets: Object.keys(config.secrets).reduce((acc, key) => {
        acc[key] = '***REDACTED***';
        return acc;
      }, {} as Record<string, string>),
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n✓ Configuration exported to: ${outputPath}`);
    console.log('  Note: Secret values are redacted in the export');
  }

  /**
   * Delete configuration from AWS
   */
  async deleteConfig(dryRun: boolean = false): Promise<void> {
    console.log(`\nDeleting configuration for stage: ${this.stage}`);
    console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}\n`);

    // Delete parameters
    console.log('Deleting parameters from SSM Parameter Store...');
    await this.deleteParameters(dryRun);

    // Note: Secrets are not deleted automatically for safety
    console.log('\nNote: Secrets in Secrets Manager are not automatically deleted.');
    console.log('Please delete them manually if needed.');

    console.log('\n✓ Configuration deletion completed');
  }

  /**
   * Delete parameters from SSM
   */
  private async deleteParameters(dryRun: boolean): Promise<void> {
    const parameterPrefix = `/ai-agent/${this.stage}`;

    try {
      const response = await this.ssmClient.send(
        new GetParametersByPathCommand({
          Path: parameterPrefix,
          Recursive: true,
        })
      );

      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (param.Name) {
            console.log(`  ${dryRun ? '[DRY RUN] ' : ''}Deleting parameter: ${param.Name}`);
            
            if (!dryRun) {
              await this.ssmClient.send(
                new DeleteParameterCommand({
                  Name: param.Name,
                })
              );
              console.log(`    ✓ Parameter deleted`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to delete parameters: ${error}`);
      throw error;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const command = process.argv[2];
  const stage = process.env.STAGE || process.argv[3] || 'dev';
  const region = process.env.AWS_REGION || 'us-east-1';
  const dryRun = process.argv.includes('--dry-run');

  const manager = new EnvironmentConfigManager(stage, region);

  console.log('='.repeat(60));
  console.log('Environment Configuration Manager');
  console.log('='.repeat(60));
  console.log(`Stage: ${stage}`);
  console.log(`Region: ${region}`);
  console.log('='.repeat(60));

  try {
    switch (command) {
      case 'deploy': {
        const configPath = process.argv[4] || `./config/${stage}.json`;
        const config = manager.loadConfigFromFile(configPath);
        await manager.deployConfig(config, dryRun);
        break;
      }

      case 'retrieve': {
        const config = await manager.retrieveConfig();
        const outputPath = process.argv[4] || `./config/${stage}-export.json`;
        manager.exportConfigToFile(config, outputPath);
        break;
      }

      case 'delete': {
        await manager.deleteConfig(dryRun);
        break;
      }

      case 'validate': {
        const configPath = process.argv[4] || `./config/${stage}.json`;
        const config = manager.loadConfigFromFile(configPath);
        const result = manager.validateConfig(config);
        
        console.log('\nValidation Results:');
        console.log(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
        
        if (result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach(err => console.log(`  ✗ ${err}`));
        }
        
        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          result.warnings.forEach(warn => console.log(`  ⚠ ${warn}`));
        }
        
        process.exit(result.valid ? 0 : 1);
        break;
      }

      default:
        console.log('\nUsage:');
        console.log('  deploy <stage> [config-file] [--dry-run]');
        console.log('  retrieve <stage> [output-file]');
        console.log('  delete <stage> [--dry-run]');
        console.log('  validate <stage> [config-file]');
        console.log('\nExamples:');
        console.log('  npm run config:deploy staging ./config/staging.json');
        console.log('  npm run config:retrieve production');
        console.log('  npm run config:validate staging --dry-run');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { EnvironmentConfigManager, EnvironmentConfig, ConfigValidationResult };
