import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

export interface AutoScalingProps {
  stage: string;
  lambdaFunctions: lambda.Function[];
  dynamoTables: dynamodb.Table[];
  ecsServices?: ecs.Service[];
}

export class AutoScaling extends Construct {
  public readonly lambdaConcurrencyTargets: applicationautoscaling.ScalableTarget[];
  public readonly dynamoReadTargets: applicationautoscaling.ScalableTarget[];
  public readonly dynamoWriteTargets: applicationautoscaling.ScalableTarget[];
  public readonly ecsTargets: applicationautoscaling.ScalableTarget[];

  constructor(scope: Construct, id: string, props: AutoScalingProps) {
    super(scope, id);

    this.lambdaConcurrencyTargets = [];
    this.dynamoReadTargets = [];
    this.dynamoWriteTargets = [];
    this.ecsTargets = [];

    // Configure Lambda provisioned concurrency and auto-scaling
    this.configureLambdaAutoScaling(props.lambdaFunctions, props.stage);

    // Configure DynamoDB auto-scaling
    this.configureDynamoAutoScaling(props.dynamoTables, props.stage);

    // Configure ECS auto-scaling if services are provided
    if (props.ecsServices) {
      this.configureEcsAutoScaling(props.ecsServices, props.stage);
    }
  }

  private configureLambdaAutoScaling(lambdaFunctions: lambda.Function[], stage: string): void {
    lambdaFunctions.forEach((func, index) => {
      // Create alias for versioned deployments
      const alias = new lambda.Alias(this, `Alias${index}`, {
        aliasName: 'live',
        version: func.currentVersion,
      });

      // Configure provisioned concurrency for production
      if (stage === 'prod') {
        const provisionedConcurrency = new lambda.ProvisionedConcurrencyConfiguration(
          this,
          `ProvisionedConcurrency${index}`,
          {
            function: func,
            qualifier: alias.aliasName,
            provisionedConcurrentExecutions: this.getProvisionedConcurrency(func.functionName),
          }
        );

        // Create scalable target for provisioned concurrency
        const target = new applicationautoscaling.ScalableTarget(
          this,
          `ConcurrencyTarget${index}`,
          {
            serviceNamespace: applicationautoscaling.ServiceNamespace.LAMBDA,
            resourceId: `function:${func.functionName}:${alias.aliasName}`,
            scalableDimension: 'lambda:function:ProvisionedConcurrencyUtilization',
            minCapacity: this.getMinConcurrency(func.functionName),
            maxCapacity: this.getMaxConcurrency(func.functionName),
          }
        );

        // Configure target tracking scaling policy
        target.scaleToTrackMetric(`ConcurrencyScaling${index}`, {
          targetValue: 70, // Target 70% utilization
          predefinedMetric: applicationautoscaling.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
          scaleInCooldown: cdk.Duration.minutes(5),
          scaleOutCooldown: cdk.Duration.minutes(1),
        });

        this.lambdaConcurrencyTargets.push(target);
      }

      // Configure reserved concurrency for all stages
      func.addEnvironment('RESERVED_CONCURRENCY', this.getReservedConcurrency(func.functionName, stage).toString());
    });
  }

  private configureDynamoAutoScaling(tables: dynamodb.Table[], stage: string): void {
    tables.forEach((table, index) => {
      // Skip if table is using on-demand billing
      if (table.billingMode === dynamodb.BillingMode.PAY_PER_REQUEST) {
        return;
      }

      // Configure read capacity auto-scaling
      const readTarget = new applicationautoscaling.ScalableTarget(
        this,
        `ReadTarget${index}`,
        {
          serviceNamespace: applicationautoscaling.ServiceNamespace.DYNAMODB,
          resourceId: `table/${table.tableName}`,
          scalableDimension: 'dynamodb:table:ReadCapacityUnits',
          minCapacity: this.getMinReadCapacity(table.tableName, stage),
          maxCapacity: this.getMaxReadCapacity(table.tableName, stage),
        }
      );

      readTarget.scaleToTrackMetric(`ReadScaling${index}`, {
        targetValue: 70, // Target 70% utilization
        predefinedMetric: applicationautoscaling.PredefinedMetric.DYNAMODB_READ_CAPACITY_UTILIZATION,
        scaleInCooldown: cdk.Duration.minutes(5),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

      this.dynamoReadTargets.push(readTarget);

      // Configure write capacity auto-scaling
      const writeTarget = new applicationautoscaling.ScalableTarget(
        this,
        `WriteTarget${index}`,
        {
          serviceNamespace: applicationautoscaling.ServiceNamespace.DYNAMODB,
          resourceId: `table/${table.tableName}`,
          scalableDimension: 'dynamodb:table:WriteCapacityUnits',
          minCapacity: this.getMinWriteCapacity(table.tableName, stage),
          maxCapacity: this.getMaxWriteCapacity(table.tableName, stage),
        }
      );

      writeTarget.scaleToTrackMetric(`WriteScaling${index}`, {
        targetValue: 70, // Target 70% utilization
        predefinedMetric: applicationautoscaling.PredefinedMetric.DYNAMODB_WRITE_CAPACITY_UTILIZATION,
        scaleInCooldown: cdk.Duration.minutes(5),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

      this.dynamoWriteTargets.push(writeTarget);

      // Configure GSI auto-scaling if present
      // Note: This would need to be expanded based on actual GSI configurations
    });
  }

  private configureEcsAutoScaling(services: ecs.Service[], stage: string): void {
    services.forEach((service, index) => {
      const target = new applicationautoscaling.ScalableTarget(
        this,
        `EcsTarget${index}`,
        {
          serviceNamespace: applicationautoscaling.ServiceNamespace.ECS,
          resourceId: `service/${service.cluster.clusterName}/${service.serviceName}`,
          scalableDimension: 'ecs:service:DesiredCount',
          minCapacity: this.getMinEcsCapacity(stage),
          maxCapacity: this.getMaxEcsCapacity(stage),
        }
      );

      // CPU-based scaling
      target.scaleToTrackMetric(`EcsCpuScaling${index}`, {
        targetValue: 60, // Target 60% CPU utilization
        predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_CPU_UTILIZATION,
        scaleInCooldown: cdk.Duration.minutes(10),
        scaleOutCooldown: cdk.Duration.minutes(3),
      });

      // Memory-based scaling
      target.scaleToTrackMetric(`EcsMemoryScaling${index}`, {
        targetValue: 70, // Target 70% memory utilization
        predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_MEMORY_UTILIZATION,
        scaleInCooldown: cdk.Duration.minutes(10),
        scaleOutCooldown: cdk.Duration.minutes(3),
      });

      // Custom metric scaling based on queue depth
      const queueDepthMetric = new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfVisibleMessages',
        dimensionsMap: {
          QueueName: `ai-agent-artifact-check-${stage}`,
        },
        statistic: 'Average',
      });

      target.scaleToTrackMetric(`EcsQueueScaling${index}`, {
        targetValue: 10, // Target 10 messages per task
        customMetric: queueDepthMetric,
        scaleInCooldown: cdk.Duration.minutes(15),
        scaleOutCooldown: cdk.Duration.minutes(2),
      });

      this.ecsTargets.push(target);
    });
  }

  // Helper methods to determine capacity based on function/table characteristics
  private getProvisionedConcurrency(functionName: string): number {
    const concurrencyMap: Record<string, number> = {
      'artifact-check': 10,
      'status-check': 5,
      'agent-query': 15,
      'kendra-search': 8,
      'audit': 3,
    };

    const key = Object.keys(concurrencyMap).find(k => functionName.includes(k));
    return key ? concurrencyMap[key] : 5;
  }

  private getMinConcurrency(functionName: string): number {
    return Math.max(1, Math.floor(this.getProvisionedConcurrency(functionName) * 0.2));
  }

  private getMaxConcurrency(functionName: string): number {
    return this.getProvisionedConcurrency(functionName) * 5;
  }

  private getReservedConcurrency(functionName: string, stage: string): number {
    const baseReserved = this.getProvisionedConcurrency(functionName) * 2;
    return stage === 'prod' ? baseReserved * 2 : baseReserved;
  }

  private getMinReadCapacity(tableName: string, stage: string): number {
    const capacityMap: Record<string, number> = {
      'team-roster': 5,
      'audit-log': 10,
      'job-status': 15,
      'artifact-templates': 3,
    };

    const key = Object.keys(capacityMap).find(k => tableName.includes(k));
    const baseCapacity = key ? capacityMap[key] : 5;
    return stage === 'prod' ? baseCapacity * 2 : baseCapacity;
  }

  private getMaxReadCapacity(tableName: string, stage: string): number {
    return this.getMinReadCapacity(tableName, stage) * 10;
  }

  private getMinWriteCapacity(tableName: string, stage: string): number {
    return Math.max(1, Math.floor(this.getMinReadCapacity(tableName, stage) * 0.3));
  }

  private getMaxWriteCapacity(tableName: string, stage: string): number {
    return this.getMinWriteCapacity(tableName, stage) * 15;
  }

  private getMinEcsCapacity(stage: string): number {
    return stage === 'prod' ? 2 : 1;
  }

  private getMaxEcsCapacity(stage: string): number {
    return stage === 'prod' ? 20 : 5;
  }
}