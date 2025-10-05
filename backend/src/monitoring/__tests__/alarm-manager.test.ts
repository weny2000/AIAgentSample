/**
 * Tests for Alarm Manager
 */

import { AlarmManager, SNSTopicMapping } from '../alarm-manager';
import { Logger } from '../../lambda/utils/logger';
import {
  CloudWatchClient,
  PutMetricAlarmCommand,
  PutCompositeAlarmCommand,
  DescribeAlarmsCommand,
  DeleteAlarmsCommand,
  SetAlarmStateCommand,
} from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';

const cloudWatchMock = mockClient(CloudWatchClient);

describe('AlarmManager', () => {
  let alarmManager: AlarmManager;
  let logger: Logger;

  beforeEach(() => {
    cloudWatchMock.reset();
    logger = new Logger();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
  });

  describe('constructor', () => {
    it('should create alarm manager with default config', () => {
      alarmManager = new AlarmManager(logger);
      expect(alarmManager).toBeDefined();
    });

    it('should create alarm manager with custom config', () => {
      const snsTopics: Partial<SNSTopicMapping> = {
        critical: 'arn:aws:sns:us-east-1:123456789012:critical',
        high: 'arn:aws:sns:us-east-1:123456789012:high',
      };

      alarmManager = new AlarmManager(logger, {
        region: 'us-west-2',
        snsTopicMapping: snsTopics,
        enableCompositeAlarms: false,
        dryRun: true,
      });

      expect(alarmManager).toBeDefined();
    });
  });

  describe('createAlarm', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
      cloudWatchMock.on(PutMetricAlarmCommand).resolves({});
    });

    it('should create a metric alarm successfully', async () => {
      const alarmConfig = {
        alarmName: 'Test-Alarm',
        metricName: 'TestMetric',
        namespace: 'Test/Namespace',
        statistic: 'Average' as any,
        period: 300,
        evaluationPeriods: 2,
        threshold: 100,
        comparisonOperator: 'GreaterThanThreshold' as any,
        treatMissingData: 'notBreaching' as any,
        alarmDescription: 'Test alarm',
        severity: 'high' as const,
        category: 'business' as const,
      };

      await alarmManager.createAlarm(alarmConfig);

      expect(cloudWatchMock.calls()).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Alarm created successfully',
        expect.objectContaining({
          alarmName: 'Test-Alarm',
          severity: 'high',
          category: 'business',
        })
      );
    });

    it('should create alarm with dimensions', async () => {
      const alarmConfig = {
        alarmName: 'Test-Alarm-With-Dimensions',
        metricName: 'TestMetric',
        namespace: 'Test/Namespace',
        statistic: 'Sum' as any,
        period: 300,
        evaluationPeriods: 1,
        threshold: 50,
        comparisonOperator: 'GreaterThanThreshold' as any,
        treatMissingData: 'notBreaching' as any,
        alarmDescription: 'Test alarm with dimensions',
        dimensions: {
          TeamId: 'team-123',
          Priority: 'high',
        },
        severity: 'critical' as const,
        category: 'system' as const,
      };

      await alarmManager.createAlarm(alarmConfig);

      const calls = cloudWatchMock.commandCalls(PutMetricAlarmCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Dimensions).toEqual([
        { Name: 'TeamId', Value: 'team-123' },
        { Name: 'Priority', Value: 'high' },
      ]);
    });

    it('should create alarm with SNS topic when configured', async () => {
      const snsTopics: Partial<SNSTopicMapping> = {
        high: 'arn:aws:sns:us-east-1:123456789012:high-alerts',
      };

      alarmManager = new AlarmManager(logger, { snsTopicMapping: snsTopics });

      const alarmConfig = {
        alarmName: 'Test-Alarm-SNS',
        metricName: 'TestMetric',
        namespace: 'Test/Namespace',
        statistic: 'Average' as any,
        period: 300,
        evaluationPeriods: 2,
        threshold: 100,
        comparisonOperator: 'GreaterThanThreshold' as any,
        treatMissingData: 'notBreaching' as any,
        alarmDescription: 'Test alarm with SNS',
        severity: 'high' as const,
        category: 'business' as const,
      };

      await alarmManager.createAlarm(alarmConfig);

      const calls = cloudWatchMock.commandCalls(PutMetricAlarmCommand);
      expect(calls[0].args[0].input.AlarmActions).toEqual([
        'arn:aws:sns:us-east-1:123456789012:high-alerts',
      ]);
      expect(calls[0].args[0].input.ActionsEnabled).toBe(true);
    });

    it('should skip alarm creation in dry run mode', async () => {
      alarmManager = new AlarmManager(logger, { dryRun: true });

      const alarmConfig = {
        alarmName: 'Test-Alarm-DryRun',
        metricName: 'TestMetric',
        namespace: 'Test/Namespace',
        statistic: 'Average' as any,
        period: 300,
        evaluationPeriods: 2,
        threshold: 100,
        comparisonOperator: 'GreaterThanThreshold' as any,
        treatMissingData: 'notBreaching' as any,
        alarmDescription: 'Test alarm dry run',
        severity: 'medium' as const,
        category: 'performance' as const,
      };

      await alarmManager.createAlarm(alarmConfig);

      expect(cloudWatchMock.calls()).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'DRY RUN: Would create alarm',
        expect.any(Object)
      );
    });

    it('should handle alarm creation errors', async () => {
      cloudWatchMock.on(PutMetricAlarmCommand).rejects(new Error('CloudWatch error'));

      const alarmConfig = {
        alarmName: 'Test-Alarm-Error',
        metricName: 'TestMetric',
        namespace: 'Test/Namespace',
        statistic: 'Average' as any,
        period: 300,
        evaluationPeriods: 2,
        threshold: 100,
        comparisonOperator: 'GreaterThanThreshold' as any,
        treatMissingData: 'notBreaching' as any,
        alarmDescription: 'Test alarm error',
        severity: 'low' as const,
        category: 'data_quality' as const,
      };

      await expect(alarmManager.createAlarm(alarmConfig)).rejects.toThrow('CloudWatch error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('createCompositeAlarm', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
      cloudWatchMock.on(PutCompositeAlarmCommand).resolves({});
    });

    it('should create a composite alarm successfully', async () => {
      const compositeConfig = {
        alarmName: 'Test-Composite-Alarm',
        alarmDescription: 'Test composite alarm',
        alarmRule: 'ALARM(Alarm1) AND ALARM(Alarm2)',
        severity: 'critical' as const,
        actionsEnabled: true,
      };

      await alarmManager.createCompositeAlarm(compositeConfig);

      expect(cloudWatchMock.calls()).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Composite alarm created successfully',
        expect.objectContaining({
          alarmName: 'Test-Composite-Alarm',
          severity: 'critical',
        })
      );
    });

    it('should create composite alarm with SNS topic', async () => {
      const snsTopics: Partial<SNSTopicMapping> = {
        critical: 'arn:aws:sns:us-east-1:123456789012:critical-alerts',
      };

      alarmManager = new AlarmManager(logger, { snsTopicMapping: snsTopics });

      const compositeConfig = {
        alarmName: 'Test-Composite-SNS',
        alarmDescription: 'Test composite with SNS',
        alarmRule: 'ALARM(Alarm1) OR ALARM(Alarm2)',
        severity: 'critical' as const,
        actionsEnabled: true,
      };

      await alarmManager.createCompositeAlarm(compositeConfig);

      const calls = cloudWatchMock.commandCalls(PutCompositeAlarmCommand);
      expect(calls[0].args[0].input.AlarmActions).toEqual([
        'arn:aws:sns:us-east-1:123456789012:critical-alerts',
      ]);
    });

    it('should skip composite alarm creation in dry run mode', async () => {
      alarmManager = new AlarmManager(logger, { dryRun: true });

      const compositeConfig = {
        alarmName: 'Test-Composite-DryRun',
        alarmDescription: 'Test composite dry run',
        alarmRule: 'ALARM(Alarm1)',
        severity: 'high' as const,
        actionsEnabled: true,
      };

      await alarmManager.createCompositeAlarm(compositeConfig);

      expect(cloudWatchMock.calls()).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'DRY RUN: Would create composite alarm',
        expect.any(Object)
      );
    });
  });

  describe('createAllAlarms', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
      cloudWatchMock.on(PutMetricAlarmCommand).resolves({});
      cloudWatchMock.on(PutCompositeAlarmCommand).resolves({});
    });

    it('should create all alarms successfully', async () => {
      await alarmManager.createAllAlarms();

      expect(cloudWatchMock.calls().length).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Alarm creation complete',
        expect.objectContaining({
          created: expect.any(Number),
          failed: 0,
          skipped: 0,
        })
      );
    });

    it('should handle partial failures', async () => {
      let callCount = 0;
      cloudWatchMock.on(PutMetricAlarmCommand).callsFake(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated failure');
        }
        return {};
      });

      await alarmManager.createAllAlarms();

      expect(logger.info).toHaveBeenCalledWith(
        'Alarm creation complete',
        expect.objectContaining({
          failed: expect.any(Number),
        })
      );
    });
  });

  describe('listAlarms', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
    });

    it('should list all Work Task alarms', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          { AlarmName: 'WorkTask-Alarm1', StateValue: 'OK' },
          { AlarmName: 'WorkTask-Alarm2', StateValue: 'ALARM' },
        ],
        CompositeAlarms: [
          { AlarmName: 'WorkTask-Composite1', StateValue: 'OK' },
        ],
      });

      const alarms = await alarmManager.listAlarms();

      expect(alarms).toHaveLength(3);
      expect(logger.info).toHaveBeenCalledWith(
        'Listed Work Task alarms',
        expect.objectContaining({ count: 3 })
      );
    });

    it('should handle empty alarm list', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [],
        CompositeAlarms: [],
      });

      const alarms = await alarmManager.listAlarms();

      expect(alarms).toHaveLength(0);
    });
  });

  describe('deleteAllAlarms', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
      cloudWatchMock.on(DeleteAlarmsCommand).resolves({});
    });

    it('should delete all Work Task alarms', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          { AlarmName: 'WorkTask-Alarm1' },
          { AlarmName: 'WorkTask-Alarm2' },
        ],
        CompositeAlarms: [],
      });

      await alarmManager.deleteAllAlarms();

      expect(cloudWatchMock.commandCalls(DeleteAlarmsCommand)).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Work Task alarms deleted',
        expect.objectContaining({ count: 2 })
      );
    });

    it('should handle no alarms to delete', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [],
        CompositeAlarms: [],
      });

      await alarmManager.deleteAllAlarms();

      expect(cloudWatchMock.commandCalls(DeleteAlarmsCommand)).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith('No Work Task alarms to delete');
    });

    it('should skip deletion in dry run mode', async () => {
      alarmManager = new AlarmManager(logger, { dryRun: true });

      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [{ AlarmName: 'WorkTask-Alarm1' }],
        CompositeAlarms: [],
      });

      await alarmManager.deleteAllAlarms();

      expect(cloudWatchMock.commandCalls(DeleteAlarmsCommand)).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'DRY RUN: Would delete alarms',
        expect.any(Object)
      );
    });
  });

  describe('testAlarm', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
      cloudWatchMock.on(SetAlarmStateCommand).resolves({});
    });

    it('should test alarm by setting state', async () => {
      await alarmManager.testAlarm('WorkTask-TestAlarm', 'ALARM' as any);

      const calls = cloudWatchMock.commandCalls(SetAlarmStateCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toMatchObject({
        AlarmName: 'WorkTask-TestAlarm',
        StateValue: 'ALARM',
      });
    });

    it('should skip testing in dry run mode', async () => {
      alarmManager = new AlarmManager(logger, { dryRun: true });

      await alarmManager.testAlarm('WorkTask-TestAlarm');

      expect(cloudWatchMock.calls()).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'DRY RUN: Would test alarm',
        expect.any(Object)
      );
    });
  });

  describe('getAlarmStatistics', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
    });

    it('should calculate alarm statistics', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'WorkTask-Alarm1',
            StateValue: 'ALARM',
            Tags: [
              { Key: 'Category', Value: 'business' },
              { Key: 'Severity', Value: 'high' },
            ],
          },
          {
            AlarmName: 'WorkTask-Alarm2',
            StateValue: 'OK',
            Tags: [
              { Key: 'Category', Value: 'performance' },
              { Key: 'Severity', Value: 'medium' },
            ],
          },
        ],
        CompositeAlarms: [],
      });

      const stats = await alarmManager.getAlarmStatistics();

      expect(stats).toMatchObject({
        total: 2,
        inAlarm: 1,
        ok: 1,
        insufficientData: 0,
        byCategory: {
          business: 1,
          performance: 1,
        },
        bySeverity: {
          high: 1,
          medium: 1,
        },
      });
    });
  });

  describe('updateSNSTopicMapping', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
    });

    it('should update SNS topic mapping', () => {
      const newMapping: Partial<SNSTopicMapping> = {
        critical: 'arn:aws:sns:us-east-1:123456789012:new-critical',
      };

      alarmManager.updateSNSTopicMapping(newMapping);

      expect(logger.info).toHaveBeenCalledWith(
        'SNS topic mapping updated',
        expect.objectContaining({
          mapping: expect.objectContaining({
            critical: 'arn:aws:sns:us-east-1:123456789012:new-critical',
          }),
        })
      );
    });
  });

  describe('getAlarmConfigurationSummary', () => {
    beforeEach(() => {
      alarmManager = new AlarmManager(logger);
    });

    it('should return alarm configuration summary', () => {
      const summary = alarmManager.getAlarmConfigurationSummary();

      expect(summary).toMatchObject({
        totalAlarms: expect.any(Number),
        compositeAlarms: expect.any(Number),
        byCategory: expect.any(Object),
        bySeverity: expect.any(Object),
        snsTopicsConfigured: expect.any(Array),
      });

      expect(summary.totalAlarms).toBeGreaterThan(0);
      expect(summary.compositeAlarms).toBeGreaterThan(0);
    });
  });
});
