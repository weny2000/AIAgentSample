/**
 * Comprehensive Alarm Configuration for Work Task Analysis System
 * Implements alerting for business metrics, system anomalies, performance degradation, and data quality
 */

import { ComparisonOperator, Statistic } from '@aws-sdk/client-cloudwatch';

export interface AlarmConfig {
  alarmName: string;
  metricName: string;
  namespace: string;
  statistic: Statistic;
  period: number;
  evaluationPeriods: number;
  threshold: number;
  comparisonOperator: ComparisonOperator;
  treatMissingData: 'breaching' | 'notBreaching' | 'ignore' | 'missing';
  alarmDescription: string;
  dimensions?: Record<string, string>;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'business' | 'performance' | 'system' | 'data_quality';
}

export interface CompositeAlarmConfig {
  alarmName: string;
  alarmDescription: string;
  alarmRule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actionsEnabled: boolean;
}

/**
 * Create all alarm configurations for Work Task system
 */
export function createAllWorkTaskAlarms(): AlarmConfig[] {
  return [
    ...createBusinessMetricAlarms(),
    ...createPerformanceAlarms(),
    ...createSystemHealthAlarms(),
    ...createDataQualityAlarms(),
  ];
}

/**
 * Business Metric Alarms
 * Monitor key business KPIs and user satisfaction
 */
export function createBusinessMetricAlarms(): AlarmConfig[] {
  const namespace = 'AiAgent/WorkTask';

  return [
    {
      alarmName: 'WorkTask-HighErrorRate',
      metricName: 'SystemErrorRate',
      namespace,
      statistic: Statistic.Average,
      period: 300, // 5 minutes
      evaluationPeriods: 2,
      threshold: 5, // 5% error rate
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when system error rate exceeds 5% for 10 minutes',
      severity: 'high',
      category: 'business',
    },
    {
      alarmName: 'WorkTask-LowTaskCompletionRate',
      metricName: 'TaskCompletionRate',
      namespace,
      statistic: Statistic.Average,
      period: 3600, // 1 hour
      evaluationPeriods: 2,
      threshold: 50, // 50% completion rate
      comparisonOperator: ComparisonOperator.LessThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when task completion rate falls below 50% for 2 hours',
      severity: 'medium',
      category: 'business',
    },
    {
      alarmName: 'WorkTask-LowQualityPassRate',
      metricName: 'QualityCheckPassRate',
      namespace,
      statistic: Statistic.Average,
      period: 900, // 15 minutes
      evaluationPeriods: 2,
      threshold: 70, // 70% pass rate
      comparisonOperator: ComparisonOperator.LessThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when quality check pass rate falls below 70% for 30 minutes',
      severity: 'high',
      category: 'business',
    },
    {
      alarmName: 'WorkTask-HighCriticalIssues',
      metricName: 'CriticalIssuesFound',
      namespace,
      statistic: Statistic.Sum,
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 10,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when more than 10 critical issues are found in 5 minutes',
      severity: 'critical',
      category: 'business',
    },
    {
      alarmName: 'WorkTask-LowUserSatisfaction',
      metricName: 'AverageUserSatisfaction',
      namespace,
      statistic: Statistic.Average,
      period: 3600, // 1 hour
      evaluationPeriods: 2,
      threshold: 3.0, // Rating below 3.0
      comparisonOperator: ComparisonOperator.LessThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average user satisfaction falls below 3.0 for 2 hours',
      severity: 'medium',
      category: 'business',
    },
    {
      alarmName: 'WorkTask-LowQualityScore',
      metricName: 'QualityScore',
      namespace,
      statistic: Statistic.Average,
      period: 1800, // 30 minutes
      evaluationPeriods: 2,
      threshold: 60, // Quality score below 60
      comparisonOperator: ComparisonOperator.LessThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average quality score falls below 60 for 1 hour',
      severity: 'medium',
      category: 'business',
    },
    {
      alarmName: 'WorkTask-NoTaskSubmissions',
      metricName: 'TasksSubmitted',
      namespace,
      statistic: Statistic.Sum,
      period: 7200, // 2 hours
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: ComparisonOperator.LessThanThreshold,
      treatMissingData: 'breaching',
      alarmDescription: 'Alert when no tasks have been submitted in 2 hours during business hours',
      severity: 'low',
      category: 'business',
    },
  ];
}

/**
 * Performance Degradation Alarms
 * Monitor system performance and response times
 */
export function createPerformanceAlarms(): AlarmConfig[] {
  const namespace = 'AiAgent/WorkTask';

  return [
    {
      alarmName: 'WorkTask-SlowAnalysisTime',
      metricName: 'TaskAnalysisTime',
      namespace,
      statistic: Statistic.Average,
      period: 300, // 5 minutes
      evaluationPeriods: 3,
      threshold: 180000, // 3 minutes in milliseconds
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average analysis time exceeds 3 minutes for 15 minutes',
      severity: 'high',
      category: 'performance',
    },
    {
      alarmName: 'WorkTask-HighResponseTime',
      metricName: 'AverageResponseTime',
      namespace,
      statistic: Statistic.Average,
      period: 300, // 5 minutes
      evaluationPeriods: 3,
      threshold: 5000, // 5 seconds
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average response time exceeds 5 seconds for 15 minutes',
      severity: 'high',
      category: 'performance',
    },
    {
      alarmName: 'WorkTask-SlowQualityCheck',
      metricName: 'QualityCheckDuration',
      namespace,
      statistic: Statistic.Average,
      period: 300, // 5 minutes
      evaluationPeriods: 2,
      threshold: 60000, // 1 minute
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when quality check duration exceeds 1 minute for 10 minutes',
      severity: 'medium',
      category: 'performance',
    },
    {
      alarmName: 'WorkTask-HighP99Duration',
      metricName: 'OperationDuration',
      namespace,
      statistic: 'p99' as any, // Extended statistic
      period: 600, // 10 minutes
      evaluationPeriods: 2,
      threshold: 10000, // 10 seconds
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when P99 operation duration exceeds 10 seconds for 20 minutes',
      severity: 'medium',
      category: 'performance',
    },
    {
      alarmName: 'WorkTask-SlowProcessingTime',
      metricName: 'TaskProcessingTime',
      namespace,
      statistic: Statistic.Average,
      period: 300, // 5 minutes
      evaluationPeriods: 3,
      threshold: 120000, // 2 minutes
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average processing time exceeds 2 minutes for 15 minutes',
      severity: 'medium',
      category: 'performance',
    },
  ];
}

/**
 * System Health and Anomaly Alarms
 * Monitor system errors, failures, and resource usage
 */
export function createSystemHealthAlarms(): AlarmConfig[] {
  const namespace = 'AiAgent/WorkTask';

  return [
    {
      alarmName: 'WorkTask-HighOperationFailureRate',
      metricName: 'OperationFailure',
      namespace,
      statistic: Statistic.Sum,
      period: 300, // 5 minutes
      evaluationPeriods: 2,
      threshold: 20,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when more than 20 operations fail in 10 minutes',
      severity: 'critical',
      category: 'system',
    },
    {
      alarmName: 'WorkTask-HighMemoryUsage',
      metricName: 'MemoryUsage',
      namespace,
      statistic: Statistic.Average,
      period: 300, // 5 minutes
      evaluationPeriods: 3,
      threshold: 2147483648, // 2GB in bytes
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when average memory usage exceeds 2GB for 15 minutes',
      severity: 'high',
      category: 'system',
    },
    {
      alarmName: 'WorkTask-SpikeInErrors',
      metricName: 'ErrorRate',
      namespace,
      statistic: Statistic.Sum,
      period: 60, // 1 minute
      evaluationPeriods: 2,
      threshold: 50,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when error count spikes above 50 per minute for 2 minutes',
      severity: 'critical',
      category: 'system',
    },
    {
      alarmName: 'WorkTask-LowSuccessRate',
      metricName: 'TaskSuccessRate',
      namespace,
      statistic: Statistic.Average,
      period: 900, // 15 minutes
      evaluationPeriods: 2,
      threshold: 90, // 90% success rate
      comparisonOperator: ComparisonOperator.LessThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when task success rate falls below 90% for 30 minutes',
      severity: 'high',
      category: 'system',
    },
    {
      alarmName: 'WorkTask-HighIssuesFound',
      metricName: 'IssuesFound',
      namespace,
      statistic: Statistic.Sum,
      period: 600, // 10 minutes
      evaluationPeriods: 2,
      threshold: 100,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when more than 100 issues are found in 20 minutes',
      severity: 'medium',
      category: 'system',
    },
  ];
}

/**
 * Data Quality Alarms
 * Monitor data integrity, validation failures, and anomalies
 */
export function createDataQualityAlarms(): AlarmConfig[] {
  const namespace = 'AiAgent/WorkTask';

  return [
    {
      alarmName: 'WorkTask-HighValidationFailures',
      metricName: 'ValidationFailures',
      namespace,
      statistic: Statistic.Sum,
      period: 600, // 10 minutes
      evaluationPeriods: 2,
      threshold: 30,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when more than 30 validation failures occur in 20 minutes',
      severity: 'high',
      category: 'data_quality',
    },
    {
      alarmName: 'WorkTask-DataIntegrityIssues',
      metricName: 'DataIntegrityErrors',
      namespace,
      statistic: Statistic.Sum,
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 5,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when data integrity errors are detected',
      severity: 'critical',
      category: 'data_quality',
    },
    {
      alarmName: 'WorkTask-MissingRequiredData',
      metricName: 'MissingDataErrors',
      namespace,
      statistic: Statistic.Sum,
      period: 600, // 10 minutes
      evaluationPeriods: 2,
      threshold: 20,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when more than 20 missing data errors occur in 20 minutes',
      severity: 'medium',
      category: 'data_quality',
    },
    {
      alarmName: 'WorkTask-AnomalousDataPatterns',
      metricName: 'DataAnomalies',
      namespace,
      statistic: Statistic.Sum,
      period: 900, // 15 minutes
      evaluationPeriods: 1,
      threshold: 10,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when anomalous data patterns are detected',
      severity: 'medium',
      category: 'data_quality',
    },
    {
      alarmName: 'WorkTask-InconsistentMetrics',
      metricName: 'MetricInconsistencies',
      namespace,
      statistic: Statistic.Sum,
      period: 1800, // 30 minutes
      evaluationPeriods: 1,
      threshold: 15,
      comparisonOperator: ComparisonOperator.GreaterThanThreshold,
      treatMissingData: 'notBreaching',
      alarmDescription: 'Alert when metric inconsistencies are detected',
      severity: 'low',
      category: 'data_quality',
    },
  ];
}

/**
 * Create composite alarm configurations
 * Combine multiple alarms for complex alerting scenarios
 */
export function createCompositeAlarms(): CompositeAlarmConfig[] {
  return [
    {
      alarmName: 'WorkTask-SystemDegraded',
      alarmDescription: 'System is experiencing degraded performance across multiple metrics',
      alarmRule: 'ALARM(WorkTask-HighResponseTime) AND (ALARM(WorkTask-SlowAnalysisTime) OR ALARM(WorkTask-HighMemoryUsage))',
      severity: 'critical',
      actionsEnabled: true,
    },
    {
      alarmName: 'WorkTask-QualityIssues',
      alarmDescription: 'Multiple quality-related issues detected',
      alarmRule: 'ALARM(WorkTask-LowQualityPassRate) AND (ALARM(WorkTask-HighCriticalIssues) OR ALARM(WorkTask-LowQualityScore))',
      severity: 'high',
      actionsEnabled: true,
    },
    {
      alarmName: 'WorkTask-DataQualityDegraded',
      alarmDescription: 'Data quality issues affecting system reliability',
      alarmRule: '(ALARM(WorkTask-HighValidationFailures) OR ALARM(WorkTask-DataIntegrityIssues)) AND ALARM(WorkTask-MissingRequiredData)',
      severity: 'high',
      actionsEnabled: true,
    },
    {
      alarmName: 'WorkTask-CriticalSystemFailure',
      alarmDescription: 'Critical system failure requiring immediate attention',
      alarmRule: 'ALARM(WorkTask-HighOperationFailureRate) AND (ALARM(WorkTask-SpikeInErrors) OR ALARM(WorkTask-LowSuccessRate))',
      severity: 'critical',
      actionsEnabled: true,
    },
    {
      alarmName: 'WorkTask-UserExperienceDegraded',
      alarmDescription: 'User experience is degraded across multiple dimensions',
      alarmRule: 'ALARM(WorkTask-LowUserSatisfaction) AND (ALARM(WorkTask-HighResponseTime) OR ALARM(WorkTask-LowTaskCompletionRate))',
      severity: 'high',
      actionsEnabled: true,
    },
  ];
}

/**
 * Get alarm severity configuration for SNS topic routing
 */
export function getAlarmSeverityConfig(): Record<string, { snsTopicSuffix: string; description: string }> {
  return {
    critical: {
      snsTopicSuffix: 'critical-alerts',
      description: 'Critical alerts requiring immediate attention (24/7 on-call)',
    },
    high: {
      snsTopicSuffix: 'high-priority-alerts',
      description: 'High priority alerts requiring prompt attention (business hours)',
    },
    medium: {
      snsTopicSuffix: 'medium-priority-alerts',
      description: 'Medium priority alerts for investigation',
    },
    low: {
      snsTopicSuffix: 'low-priority-alerts',
      description: 'Low priority alerts for monitoring and trends',
    },
  };
}

/**
 * Get alarm configuration by category
 */
export function getAlarmsByCategory(category: AlarmConfig['category']): AlarmConfig[] {
  return createAllWorkTaskAlarms().filter(alarm => alarm.category === category);
}

/**
 * Get alarm configuration by severity
 */
export function getAlarmsBySeverity(severity: AlarmConfig['severity']): AlarmConfig[] {
  return createAllWorkTaskAlarms().filter(alarm => alarm.severity === severity);
}
