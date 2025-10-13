#!/usr/bin/env node
/**
 * Blue-Green Deployment Manager
 * 
 * This script manages blue-green deployments for Lambda functions and API Gateway:
 * - Creates new Lambda versions (green)
 * - Gradually shifts traffic from blue to green
 * - Monitors health metrics during transition
 * - Automatic rollback on failure
 * - Manual rollback capability
 */

import {
  LambdaClient,
  PublishVersionCommand,
  CreateAliasCommand,
  UpdateAliasCommand,
  GetAliasCommand,
  ListVersionsByFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  MetricDataResult,
} from '@aws-sdk/client-cloudwatch';
import {
  APIGatewayClient,
  UpdateStageCommand,
  GetStageCommand,
} from '@aws-sdk/client-api-gateway';

interface DeploymentConfig {
  stage: string;
  region: string;
  functions: string[];
  trafficShiftStrategy: 'linear' | 'canary' | 'all-at-once';
  trafficShiftDuration: number; // minutes
  healthCheckInterval: number; // seconds
  rollbackOnError: boolean;
  errorThreshold: number; // percentage
}

interface DeploymentResult {
  success: boolean;
  functionsDeployed: string[];
  errors: string[];
  rollbackPerformed: boolean;
  timestamp: string;
}

interface HealthMetrics {
  errorRate: number;
  invocations: number;
  duration: number;
  throttles: number;
}

class BlueGreenDeploymentManager {
  private lambdaClient: LambdaClient;
  private cloudWatchClient: CloudWatchClient;
  private apiGatewayClient: APIGatewayClient;
  private config: DeploymentConfig;

  constructor(config: DeploymentConfig) {
    this.config = config;
    this.lambdaClient = new LambdaClient({ region: config.region });
    this.cloudWatchClient = new CloudWatchClient({ region: config.region });
    this.apiGatewayClient = new APIGatewayClient({ region: config.region });
  }

  /**
   * Execute blue-green deployment
   */
  async deploy(): Promise<DeploymentResult> {
    const result: DeploymentResult = {
      success: true,
      functionsDeployed: [],
      errors: [],
      rollbackPerformed: false,
      timestamp: new Date().toISOString(),
    };

    this.log('Starting blue-green deployment...');
    this.log(`Strategy: ${this.config.trafficShiftStrategy}`);
    this.log(`Duration: ${this.config.trafficShiftDuration} minutes`);

    try {
      // Deploy each function
      for (const functionName of this.config.functions) {
        this.log(`\nDeploying function: ${functionName}`);
        
        try {
          await this.deployFunction(functionName);
          result.functionsDeployed.push(functionName);
          this.log(`✓ Function ${functionName} deployed successfully`);
        } catch (error) {
          const errorMsg = `Failed to deploy ${functionName}: ${error}`;
          this.log(`✗ ${errorMsg}`);
          result.errors.push(errorMsg);
          result.success = false;

          // Rollback if configured
          if (this.config.rollbackOnError) {
            this.log('\nInitiating rollback...');
            await this.rollbackDeployment(result.functionsDeployed);
            result.rollbackPerformed = true;
          }

          break;
        }
      }

      if (result.success) {
        this.log('\n✓ All functions deployed successfully');
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Deployment failed: ${error}`);
      return result;
    }
  }

  /**
   * Deploy a single function with blue-green strategy
   */
  private async deployFunction(functionName: string): Promise<void> {
    const fullFunctionName = `ai-agent-${functionName}-${this.config.stage}`;

    // Step 1: Publish new version (green)
    this.log('  Publishing new version...');
    const newVersion = await this.publishNewVersion(fullFunctionName);
    this.log(`  New version: ${newVersion}`);

    // Step 2: Get current version (blue)
    const currentVersion = await this.getCurrentVersion(fullFunctionName);
    this.log(`  Current version: ${currentVersion}`);

    // Step 3: Create or update alias with traffic shifting
    this.log('  Configuring traffic shift...');
    await this.configureTrafficShift(fullFunctionName, currentVersion, newVersion);

    // Step 4: Monitor health and shift traffic
    this.log('  Monitoring health and shifting traffic...');
    const shiftSuccess = await this.monitorAndShiftTraffic(
      fullFunctionName,
      currentVersion,
      newVersion
    );

    if (!shiftSuccess) {
      throw new Error('Traffic shift failed health checks');
    }

    // Step 5: Complete transition
    this.log('  Completing transition...');
    await this.completeTransition(fullFunctionName, newVersion);
  }

  /**
   * Publish new Lambda version
   */
  private async publishNewVersion(functionName: string): Promise<string> {
    const response = await this.lambdaClient.send(
      new PublishVersionCommand({
        FunctionName: functionName,
        Description: `Deployed at ${new Date().toISOString()}`,
      })
    );

    return response.Version || '1';
  }

  /**
   * Get current version from alias
   */
  private async getCurrentVersion(functionName: string): Promise<string> {
    try {
      const response = await this.lambdaClient.send(
        new GetAliasCommand({
          FunctionName: functionName,
          Name: 'live',
        })
      );

      return response.FunctionVersion || '$LATEST';
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Alias doesn't exist yet, return $LATEST
        return '$LATEST';
      }
      throw error;
    }
  }

  /**
   * Configure traffic shift between versions
   */
  private async configureTrafficShift(
    functionName: string,
    oldVersion: string,
    newVersion: string
  ): Promise<void> {
    try {
      // Try to get existing alias
      await this.lambdaClient.send(
        new GetAliasCommand({
          FunctionName: functionName,
          Name: 'live',
        })
      );

      // Update existing alias
      await this.lambdaClient.send(
        new UpdateAliasCommand({
          FunctionName: functionName,
          Name: 'live',
          FunctionVersion: newVersion,
          RoutingConfig: {
            AdditionalVersionWeights: {
              [oldVersion]: 1.0, // Start with 100% on old version
            },
          },
        })
      );
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Create new alias
        await this.lambdaClient.send(
          new CreateAliasCommand({
            FunctionName: functionName,
            Name: 'live',
            FunctionVersion: newVersion,
            Description: 'Live traffic alias for blue-green deployment',
          })
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Monitor health and gradually shift traffic
   */
  private async monitorAndShiftTraffic(
    functionName: string,
    oldVersion: string,
    newVersion: string
  ): Promise<boolean> {
    const steps = this.calculateTrafficShiftSteps();
    
    for (let i = 0; i < steps.length; i++) {
      const targetWeight = steps[i];
      this.log(`  Shifting traffic: ${targetWeight * 100}% to new version`);

      // Update traffic weights
      await this.updateTrafficWeights(functionName, oldVersion, newVersion, targetWeight);

      // Wait for metrics to stabilize
      await this.sleep(this.config.healthCheckInterval * 1000);

      // Check health metrics
      const metrics = await this.getHealthMetrics(functionName, newVersion);
      this.log(`    Error rate: ${metrics.errorRate.toFixed(2)}%`);
      this.log(`    Invocations: ${metrics.invocations}`);
      this.log(`    Avg duration: ${metrics.duration.toFixed(0)}ms`);

      // Check if error rate exceeds threshold
      if (metrics.errorRate > this.config.errorThreshold) {
        this.log(`  ✗ Error rate ${metrics.errorRate.toFixed(2)}% exceeds threshold ${this.config.errorThreshold}%`);
        return false;
      }

      this.log(`  ✓ Health check passed`);
    }

    return true;
  }

  /**
   * Calculate traffic shift steps based on strategy
   */
  private calculateTrafficShiftSteps(): number[] {
    const duration = this.config.trafficShiftDuration;
    const interval = this.config.healthCheckInterval / 60; // convert to minutes

    switch (this.config.trafficShiftStrategy) {
      case 'linear': {
        const steps = Math.floor(duration / interval);
        return Array.from({ length: steps }, (_, i) => (i + 1) / steps);
      }

      case 'canary': {
        // 10% -> 25% -> 50% -> 100%
        return [0.1, 0.25, 0.5, 1.0];
      }

      case 'all-at-once': {
        return [1.0];
      }

      default:
        return [1.0];
    }
  }

  /**
   * Update traffic weights
   */
  private async updateTrafficWeights(
    functionName: string,
    oldVersion: string,
    newVersion: string,
    newVersionWeight: number
  ): Promise<void> {
    const oldVersionWeight = 1.0 - newVersionWeight;

    await this.lambdaClient.send(
      new UpdateAliasCommand({
        FunctionName: functionName,
        Name: 'live',
        FunctionVersion: newVersion,
        RoutingConfig: {
          AdditionalVersionWeights:
            oldVersionWeight > 0
              ? {
                  [oldVersion]: oldVersionWeight,
                }
              : undefined,
        },
      })
    );
  }

  /**
   * Get health metrics for a function version
   */
  private async getHealthMetrics(
    functionName: string,
    version: string
  ): Promise<HealthMetrics> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

    // Get error count
    const errors = await this.getMetric(
      functionName,
      'Errors',
      startTime,
      endTime,
      'Sum'
    );

    // Get invocation count
    const invocations = await this.getMetric(
      functionName,
      'Invocations',
      startTime,
      endTime,
      'Sum'
    );

    // Get duration
    const duration = await this.getMetric(
      functionName,
      'Duration',
      startTime,
      endTime,
      'Average'
    );

    // Get throttles
    const throttles = await this.getMetric(
      functionName,
      'Throttles',
      startTime,
      endTime,
      'Sum'
    );

    const errorRate = invocations > 0 ? (errors / invocations) * 100 : 0;

    return {
      errorRate,
      invocations,
      duration,
      throttles,
    };
  }

  /**
   * Get CloudWatch metric
   */
  private async getMetric(
    functionName: string,
    metricName: string,
    startTime: Date,
    endTime: Date,
    statistic: string
  ): Promise<number> {
    try {
      const response = await this.cloudWatchClient.send(
        new GetMetricStatisticsCommand({
          Namespace: 'AWS/Lambda',
          MetricName: metricName,
          Dimensions: [
            {
              Name: 'FunctionName',
              Value: functionName,
            },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300, // 5 minutes
          Statistics: [statistic],
        })
      );

      if (response.Datapoints && response.Datapoints.length > 0) {
        const datapoint = response.Datapoints[0];
        return (
          datapoint.Sum ||
          datapoint.Average ||
          datapoint.Maximum ||
          datapoint.Minimum ||
          0
        );
      }

      return 0;
    } catch (error) {
      this.log(`Warning: Could not retrieve metric ${metricName}: ${error}`);
      return 0;
    }
  }

  /**
   * Complete transition to new version
   */
  private async completeTransition(
    functionName: string,
    newVersion: string
  ): Promise<void> {
    await this.lambdaClient.send(
      new UpdateAliasCommand({
        FunctionName: functionName,
        Name: 'live',
        FunctionVersion: newVersion,
        RoutingConfig: {
          AdditionalVersionWeights: undefined, // Remove routing config
        },
      })
    );
  }

  /**
   * Rollback deployment
   */
  async rollbackDeployment(functions: string[]): Promise<void> {
    this.log('Rolling back deployment...');

    for (const functionName of functions) {
      const fullFunctionName = `ai-agent-${functionName}-${this.config.stage}`;
      
      try {
        this.log(`  Rolling back ${functionName}...`);

        // Get previous version
        const versions = await this.lambdaClient.send(
          new ListVersionsByFunctionCommand({
            FunctionName: fullFunctionName,
            MaxItems: 10,
          })
        );

        if (versions.Versions && versions.Versions.length >= 2) {
          // Get second-to-last version (previous stable)
          const previousVersion = versions.Versions[versions.Versions.length - 2];
          
          if (previousVersion.Version) {
            await this.lambdaClient.send(
              new UpdateAliasCommand({
                FunctionName: fullFunctionName,
                Name: 'live',
                FunctionVersion: previousVersion.Version,
                RoutingConfig: {
                  AdditionalVersionWeights: undefined,
                },
              })
            );

            this.log(`  ✓ Rolled back to version ${previousVersion.Version}`);
          }
        }
      } catch (error) {
        this.log(`  ✗ Failed to rollback ${functionName}: ${error}`);
      }
    }

    this.log('Rollback completed');
  }

  /**
   * Utility: Sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Utility: Log message
   */
  private log(message: string): void {
    console.log(`[BlueGreen] ${message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  const command = process.argv[2];
  const stage = process.env.STAGE || process.argv[3] || 'dev';
  const region = process.env.AWS_REGION || 'us-east-1';

  // Default functions to deploy
  const functions = [
    'artifact-check-handler',
    'status-check-handler',
    'agent-query-handler',
    'kendra-search-handler',
  ];

  const config: DeploymentConfig = {
    stage,
    region,
    functions,
    trafficShiftStrategy: 'canary',
    trafficShiftDuration: 10, // 10 minutes
    healthCheckInterval: 60, // 60 seconds
    rollbackOnError: true,
    errorThreshold: 5, // 5% error rate
  };

  console.log('='.repeat(60));
  console.log('Blue-Green Deployment Manager');
  console.log('='.repeat(60));
  console.log(`Stage: ${stage}`);
  console.log(`Region: ${region}`);
  console.log(`Strategy: ${config.trafficShiftStrategy}`);
  console.log('='.repeat(60));

  const manager = new BlueGreenDeploymentManager(config);

  try {
    switch (command) {
      case 'deploy': {
        const result = await manager.deploy();
        
        console.log('\n' + '='.repeat(60));
        console.log('Deployment Results');
        console.log('='.repeat(60));
        console.log(`Status: ${result.success ? '✓ SUCCESS' : '✗ FAILED'}`);
        console.log(`Functions Deployed: ${result.functionsDeployed.length}`);
        console.log(`Rollback Performed: ${result.rollbackPerformed ? 'Yes' : 'No'}`);
        
        if (result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach(e => console.log(`  - ${e}`));
        }
        
        console.log('='.repeat(60));
        
        process.exit(result.success ? 0 : 1);
        break;
      }

      case 'rollback': {
        await manager.rollbackDeployment(functions);
        break;
      }

      default:
        console.log('\nUsage:');
        console.log('  deploy <stage>');
        console.log('  rollback <stage>');
        console.log('\nExamples:');
        console.log('  npm run deploy:blue-green staging');
        console.log('  npm run rollback:blue-green production');
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

export { BlueGreenDeploymentManager, DeploymentConfig, DeploymentResult };
