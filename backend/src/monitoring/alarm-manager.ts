/**
 * Alarm Manager
 * Manages CloudWatch alarms and composite alarms with SNS integration
 */

import {
  CloudWatchClient,
  PutMetricAlarmCommand,
  PutCompositeAlarmCommand,
  DescribeAlarmsCommand,
  DeleteAlarmsCommand,
  SetAlarmStateCommand,
  AlarmType,
  StateValue,
} from '@aws-sdk/client-cloudwatch';
import { Logger } from '../lambda/utils/logger';
import {
  AlarmConfig,
  CompositeAlarmConfig,
  createAllWorkTaskAlarms,
  createCompositeAlarms,
  getAlarmsByCategory,
  getAlarmsBySeverity,
} from './work-task-alarm-config';

export interface SNSTopicMapping {
  critical: string;
  high: string;
  medium: string;
  low: string;
}

export interface AlarmManagerConfig {
  region?: string;
  snsTopicMapping?: Partial<SNSTopicMapping>;
  enableCompositeAlarms?: boolean;
  dryRun?: boolean;
}

export class AlarmManager {
  private cloudWatchClient: CloudWatchClient;
  private snsTopicMapping: Partial<SNSTopicMapping>;
  private enableCompositeAlarms: boolean;
  private dryRun: boolean;

  constructor(
    private logger: Logger,
    config: AlarmManagerConfig = {}
  ) {
    this.cloudWatchClient = new CloudWatchClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.snsTopicMapping = config.snsTopicMapping || {};
    this.enableCompositeAlarms = config.enableCompositeAlarms ?? true;
    this.dryRun = config.dryRun ?? false;
  }

  /**
   * Create all Work Task alarms
   */
  async createAllAlarms(): Promise<void> {
    try {
      this.logger.info('Creating all Work Task alarms');

      const alarms = createAllWorkTaskAlarms();
      const results = {
        created: 0,
        failed: 0,
        skipped: 0,
      };

      for (const alarm of alarms) {
        try {
          await this.createAlarm(alarm);
          results.created++;
        } catch (error) {
          this.logger.error(`Failed to create alarm: ${alarm.alarmName}`, error as Error);
          results.failed++;
        }
      }

      // Create composite alarms if enabled
      if (this.enableCompositeAlarms) {
        const compositeAlarms = createCompositeAlarms();
        for (const compositeAlarm of compositeAlarms) {
          try {
            await this.createCompositeAlarm(compositeAlarm);
            results.created++;
          } catch (error) {
            this.logger.error(`Failed to create composite alarm: ${compositeAlarm.alarmName}`, error as Error);
            results.failed++;
          }
        }
      }

      this.logger.info('Alarm creation complete', results);
    } catch (error) {
      this.logger.error('Failed to create all alarms', error as Error);
      throw error;
    }
  }

  /**
   * Create a single metric alarm
   */
  async createAlarm(config: AlarmConfig): Promise<void> {
    try {
      const snsTopicArn = this.getSNSTopicForSeverity(config.severity);
      const dimensions = config.dimensions
        ? Object.entries(config.dimensions).map(([Name, Value]) => ({ Name, Value }))
        : undefined;

      if (this.dryRun) {
        this.logger.info('DRY RUN: Would create alarm', {
          alarmName: config.alarmName,
          severity: config.severity,
          category: config.category,
        });
        return;
      }

      await this.cloudWatchClient.send(
        new PutMetricAlarmCommand({
          AlarmName: config.alarmName,
          AlarmDescription: config.alarmDescription,
          MetricName: config.metricName,
          Namespace: config.namespace,
          Statistic: config.statistic,
          Period: config.period,
          EvaluationPeriods: config.evaluationPeriods,
          Threshold: config.threshold,
          ComparisonOperator: config.comparisonOperator,
          TreatMissingData: config.treatMissingData,
          Dimensions: dimensions,
          AlarmActions: snsTopicArn ? [snsTopicArn] : undefined,
          OKActions: snsTopicArn ? [snsTopicArn] : undefined,
          ActionsEnabled: !!snsTopicArn,
          Tags: [
            { Key: 'Severity', Value: config.severity },
            { Key: 'Category', Value: config.category },
            { Key: 'ManagedBy', Value: 'AlarmManager' },
          ],
        })
      );

      this.logger.info('Alarm created successfully', {
        alarmName: config.alarmName,
        severity: config.severity,
        category: config.category,
        snsTopicConfigured: !!snsTopicArn,
      });
    } catch (error) {
      this.logger.error('Failed to create alarm', error as Error);
      throw error;
    }
  }

  /**
   * Create a composite alarm
   */
  async createCompositeAlarm(config: CompositeAlarmConfig): Promise<void> {
    try {
      const snsTopicArn = this.getSNSTopicForSeverity(config.severity);

      if (this.dryRun) {
        this.logger.info('DRY RUN: Would create composite alarm', {
          alarmName: config.alarmName,
          severity: config.severity,
        });
        return;
      }

      await this.cloudWatchClient.send(
        new PutCompositeAlarmCommand({
          AlarmName: config.alarmName,
          AlarmDescription: config.alarmDescription,
          AlarmRule: config.alarmRule,
          ActionsEnabled: config.actionsEnabled && !!snsTopicArn,
          AlarmActions: snsTopicArn ? [snsTopicArn] : undefined,
          OKActions: snsTopicArn ? [snsTopicArn] : undefined,
          Tags: [
            { Key: 'Severity', Value: config.severity },
            { Key: 'Type', Value: 'Composite' },
            { Key: 'ManagedBy', Value: 'AlarmManager' },
          ],
        })
      );

      this.logger.info('Composite alarm created successfully', {
        alarmName: config.alarmName,
        severity: config.severity,
      });
    } catch (error) {
      this.logger.error('Failed to create composite alarm', error as Error);
      throw error;
    }
  }

  /**
   * Create alarms by category
   */
  async createAlarmsByCategory(category: AlarmConfig['category']): Promise<void> {
    try {
      this.logger.info(`Creating alarms for category: ${category}`);
      const alarms = getAlarmsByCategory(category);

      for (const alarm of alarms) {
        await this.createAlarm(alarm);
      }

      this.logger.info(`Created ${alarms.length} alarms for category: ${category}`);
    } catch (error) {
      this.logger.error(`Failed to create alarms for category: ${category}`, error as Error);
      throw error;
    }
  }

  /**
   * Create alarms by severity
   */
  async createAlarmsBySeverity(severity: AlarmConfig['severity']): Promise<void> {
    try {
      this.logger.info(`Creating alarms for severity: ${severity}`);
      const alarms = getAlarmsBySeverity(severity);

      for (const alarm of alarms) {
        await this.createAlarm(alarm);
      }

      this.logger.info(`Created ${alarms.length} alarms for severity: ${severity}`);
    } catch (error) {
      this.logger.error(`Failed to create alarms for severity: ${severity}`, error as Error);
      throw error;
    }
  }

  /**
   * List all Work Task alarms
   */
  async listAlarms(): Promise<any[]> {
    try {
      const result = await this.cloudWatchClient.send(
        new DescribeAlarmsCommand({
          AlarmNamePrefix: 'WorkTask-',
          MaxRecords: 100,
          AlarmTypes: [AlarmType.MetricAlarm, AlarmType.CompositeAlarm],
        })
      );

      const alarms = [
        ...(result.MetricAlarms || []),
        ...(result.CompositeAlarms || []),
      ];

      this.logger.info('Listed Work Task alarms', {
        count: alarms.length,
      });

      return alarms;
    } catch (error) {
      this.logger.error('Failed to list alarms', error as Error);
      throw error;
    }
  }

  /**
   * Delete all Work Task alarms
   */
  async deleteAllAlarms(): Promise<void> {
    try {
      this.logger.info('Deleting all Work Task alarms');

      const alarms = await this.listAlarms();
      const alarmNames = alarms.map((alarm: any) => alarm.AlarmName).filter(Boolean) as string[];

      if (alarmNames.length === 0) {
        this.logger.info('No Work Task alarms to delete');
        return;
      }

      if (this.dryRun) {
        this.logger.info('DRY RUN: Would delete alarms', {
          count: alarmNames.length,
          alarms: alarmNames,
        });
        return;
      }

      // Delete in batches of 100 (CloudWatch limit)
      const batchSize = 100;
      for (let i = 0; i < alarmNames.length; i += batchSize) {
        const batch = alarmNames.slice(i, i + batchSize);
        await this.cloudWatchClient.send(
          new DeleteAlarmsCommand({
            AlarmNames: batch,
          })
        );
      }

      this.logger.info('Work Task alarms deleted', {
        count: alarmNames.length,
      });
    } catch (error) {
      this.logger.error('Failed to delete alarms', error as Error);
      throw error;
    }
  }

  /**
   * Test alarm by setting its state
   */
  async testAlarm(alarmName: string, stateValue: StateValue = StateValue.ALARM): Promise<void> {
    try {
      if (this.dryRun) {
        this.logger.info('DRY RUN: Would test alarm', {
          alarmName,
          stateValue,
        });
        return;
      }

      await this.cloudWatchClient.send(
        new SetAlarmStateCommand({
          AlarmName: alarmName,
          StateValue: stateValue,
          StateReason: 'Testing alarm notification',
        })
      );

      this.logger.info('Alarm state set for testing', {
        alarmName,
        stateValue,
      });
    } catch (error) {
      this.logger.error('Failed to test alarm', error as Error);
      throw error;
    }
  }

  /**
   * Get alarm statistics
   */
  async getAlarmStatistics(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    inAlarm: number;
    ok: number;
    insufficientData: number;
  }> {
    try {
      const alarms = await this.listAlarms();

      const stats = {
        total: alarms.length,
        byCategory: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        inAlarm: 0,
        ok: 0,
        insufficientData: 0,
      };

      for (const alarm of alarms) {
        // Count by state
        if (alarm.StateValue === 'ALARM') stats.inAlarm++;
        else if (alarm.StateValue === 'OK') stats.ok++;
        else if (alarm.StateValue === 'INSUFFICIENT_DATA') stats.insufficientData++;

        // Count by tags
        const tags = alarm.Tags || [];
        const categoryTag = tags.find((t: any) => t.Key === 'Category');
        const severityTag = tags.find((t: any) => t.Key === 'Severity');

        if (categoryTag) {
          stats.byCategory[categoryTag.Value] = (stats.byCategory[categoryTag.Value] || 0) + 1;
        }

        if (severityTag) {
          stats.bySeverity[severityTag.Value] = (stats.bySeverity[severityTag.Value] || 0) + 1;
        }
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get alarm statistics', error as Error);
      throw error;
    }
  }

  /**
   * Get SNS topic ARN for alarm severity
   */
  private getSNSTopicForSeverity(severity: AlarmConfig['severity']): string | undefined {
    return this.snsTopicMapping[severity];
  }

  /**
   * Update SNS topic mapping
   */
  updateSNSTopicMapping(mapping: Partial<SNSTopicMapping>): void {
    this.snsTopicMapping = {
      ...this.snsTopicMapping,
      ...mapping,
    };
    this.logger.info('SNS topic mapping updated', {
      mapping: this.snsTopicMapping,
    });
  }

  /**
   * Get alarm configuration summary
   */
  getAlarmConfigurationSummary(): {
    totalAlarms: number;
    compositeAlarms: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    snsTopicsConfigured: string[];
  } {
    const allAlarms = createAllWorkTaskAlarms();
    const compositeAlarms = createCompositeAlarms();

    const summary = {
      totalAlarms: allAlarms.length,
      compositeAlarms: compositeAlarms.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      snsTopicsConfigured: Object.keys(this.snsTopicMapping).filter(
        key => this.snsTopicMapping[key as keyof SNSTopicMapping]
      ),
    };

    for (const alarm of allAlarms) {
      summary.byCategory[alarm.category] = (summary.byCategory[alarm.category] || 0) + 1;
      summary.bySeverity[alarm.severity] = (summary.bySeverity[alarm.severity] || 0) + 1;
    }

    return summary;
  }
}
