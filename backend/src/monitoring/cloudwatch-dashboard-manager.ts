/**
 * CloudWatch Dashboard Manager
 * Creates and manages CloudWatch dashboards and alarms
 */

import {
  CloudWatchClient,
  PutDashboardCommand,
  GetDashboardCommand,
  DeleteDashboardCommand,
  PutMetricAlarmCommand,
  DescribeAlarmsCommand,
  DeleteAlarmsCommand,
} from '@aws-sdk/client-cloudwatch';
import { Logger } from '../lambda/utils/logger';
import {
  createWorkTaskDashboard,
  createWorkTaskAlarms,
  generateDashboardJson,
  type AlarmConfig,
} from './work-task-dashboard-config';

export class CloudWatchDashboardManager {
  private cloudWatchClient: CloudWatchClient;

  constructor(private logger: Logger) {
    this.cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Create or update the Work Task dashboard
   */
  async createWorkTaskDashboard(): Promise<void> {
    try {
      const region = process.env.AWS_REGION || 'us-east-1';
      const dashboardConfig = createWorkTaskDashboard(region);
      const dashboardBody = generateDashboardJson(dashboardConfig);

      await this.cloudWatchClient.send(
        new PutDashboardCommand({
          DashboardName: dashboardConfig.dashboardName,
          DashboardBody: dashboardBody,
        })
      );

      this.logger.info('Work Task dashboard created/updated', {
        dashboardName: dashboardConfig.dashboardName,
        widgetCount: dashboardConfig.widgets.length,
      });
    } catch (error) {
      this.logger.error('Failed to create Work Task dashboard', error as Error);
      throw error;
    }
  }

  /**
   * Get dashboard configuration
   */
  async getDashboard(dashboardName: string): Promise<any> {
    try {
      const result = await this.cloudWatchClient.send(
        new GetDashboardCommand({
          DashboardName: dashboardName,
        })
      );

      return {
        name: result.DashboardName,
        body: result.DashboardBody ? JSON.parse(result.DashboardBody) : null,
        arn: result.DashboardArn,
      };
    } catch (error) {
      this.logger.error('Failed to get dashboard', error as Error);
      throw error;
    }
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardName: string): Promise<void> {
    try {
      await this.cloudWatchClient.send(
        new DeleteDashboardCommand({
          DashboardName: dashboardName,
        })
      );

      this.logger.info('Dashboard deleted', { dashboardName });
    } catch (error) {
      this.logger.error('Failed to delete dashboard', error as Error);
      throw error;
    }
  }

  /**
   * Create all Work Task alarms
   */
  async createWorkTaskAlarms(snsTopicArn?: string): Promise<void> {
    try {
      const alarmConfigs = createWorkTaskAlarms();

      for (const config of alarmConfigs) {
        await this.createAlarm(config, snsTopicArn);
      }

      this.logger.info('Work Task alarms created', {
        alarmCount: alarmConfigs.length,
      });
    } catch (error) {
      this.logger.error('Failed to create Work Task alarms', error as Error);
      throw error;
    }
  }

  /**
   * Create a single alarm
   */
  async createAlarm(config: AlarmConfig, snsTopicArn?: string): Promise<void> {
    try {
      const dimensions = config.dimensions
        ? Object.entries(config.dimensions).map(([Name, Value]) => ({ Name, Value }))
        : undefined;

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
          ActionsEnabled: !!snsTopicArn,
        })
      );

      this.logger.debug('Alarm created', {
        alarmName: config.alarmName,
        metricName: config.metricName,
      });
    } catch (error) {
      this.logger.error('Failed to create alarm', error as Error);
      throw error;
    }
  }

  /**
   * List all alarms for Work Task metrics
   */
  async listWorkTaskAlarms(): Promise<any[]> {
    try {
      const result = await this.cloudWatchClient.send(
        new DescribeAlarmsCommand({
          AlarmNamePrefix: 'WorkTask-',
          MaxRecords: 100,
        })
      );

      return result.MetricAlarms || [];
    } catch (error) {
      this.logger.error('Failed to list alarms', error as Error);
      throw error;
    }
  }

  /**
   * Delete Work Task alarms
   */
  async deleteWorkTaskAlarms(): Promise<void> {
    try {
      const alarms = await this.listWorkTaskAlarms();
      const alarmNames = alarms.map((alarm) => alarm.AlarmName).filter(Boolean) as string[];

      if (alarmNames.length === 0) {
        this.logger.info('No Work Task alarms to delete');
        return;
      }

      await this.cloudWatchClient.send(
        new DeleteAlarmsCommand({
          AlarmNames: alarmNames,
        })
      );

      this.logger.info('Work Task alarms deleted', {
        alarmCount: alarmNames.length,
      });
    } catch (error) {
      this.logger.error('Failed to delete alarms', error as Error);
      throw error;
    }
  }

  /**
   * Setup complete monitoring infrastructure
   */
  async setupMonitoring(snsTopicArn?: string): Promise<void> {
    try {
      this.logger.info('Setting up Work Task monitoring infrastructure');

      // Create dashboard
      await this.createWorkTaskDashboard();

      // Create alarms
      await this.createWorkTaskAlarms(snsTopicArn);

      this.logger.info('Work Task monitoring infrastructure setup complete');
    } catch (error) {
      this.logger.error('Failed to setup monitoring infrastructure', error as Error);
      throw error;
    }
  }

  /**
   * Teardown monitoring infrastructure
   */
  async teardownMonitoring(): Promise<void> {
    try {
      this.logger.info('Tearing down Work Task monitoring infrastructure');

      // Delete alarms
      await this.deleteWorkTaskAlarms();

      // Delete dashboard
      await this.deleteDashboard('WorkTaskAnalysisMetrics');

      this.logger.info('Work Task monitoring infrastructure teardown complete');
    } catch (error) {
      this.logger.error('Failed to teardown monitoring infrastructure', error as Error);
      throw error;
    }
  }
}
