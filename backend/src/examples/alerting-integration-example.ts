/**
 * Alerting System Integration Example
 * Demonstrates how to use the Work Task alerting and notification system
 */

import { Logger } from '../lambda/utils/logger';
import { AlarmManager, SNSTopicMapping } from '../monitoring/alarm-manager';
import { AlarmNotificationService, AlarmEvent } from '../services/alarm-notification-service';
import { WorkTaskMetricsService } from '../services/work-task-metrics-service';

/**
 * Example 1: Setting up alarms programmatically
 */
async function setupAlarmsExample(): Promise<void> {
  const logger = new Logger({ context: 'setup-alarms-example' });

  // Configure SNS topics for different severity levels
  const snsTopics: Partial<SNSTopicMapping> = {
    critical: process.env.SNS_CRITICAL_TOPIC_ARN || 'arn:aws:sns:us-east-1:123456789012:critical-alerts',
    high: process.env.SNS_HIGH_TOPIC_ARN || 'arn:aws:sns:us-east-1:123456789012:high-alerts',
    medium: process.env.SNS_MEDIUM_TOPIC_ARN || 'arn:aws:sns:us-east-1:123456789012:medium-alerts',
    low: process.env.SNS_LOW_TOPIC_ARN || 'arn:aws:sns:us-east-1:123456789012:low-alerts',
  };

  // Create alarm manager
  const alarmManager = new AlarmManager(logger, {
    region: process.env.AWS_REGION || 'us-east-1',
    snsTopicMapping: snsTopics,
    enableCompositeAlarms: true,
    dryRun: false, // Set to true for testing
  });

  try {
    // Create all alarms
    logger.info('Creating all Work Task alarms...');
    await alarmManager.createAllAlarms();

    // Get statistics
    const stats = await alarmManager.getAlarmStatistics();
    logger.info('Alarm statistics:', stats);

    // Get configuration summary
    const summary = alarmManager.getAlarmConfigurationSummary();
    logger.info('Configuration summary:', summary);

    logger.info('Alarms setup complete!');
  } catch (error) {
    logger.error('Failed to setup alarms', error as Error);
    throw error;
  }
}

/**
 * Example 2: Creating alarms by category
 */
async function setupBusinessAlarmsExample(): Promise<void> {
  const logger = new Logger({ context: 'setup-business-alarms' });

  const alarmManager = new AlarmManager(logger, {
    snsTopicMapping: {
      critical: process.env.SNS_CRITICAL_TOPIC_ARN,
      high: process.env.SNS_HIGH_TOPIC_ARN,
    },
  });

  try {
    // Create only business metric alarms
    logger.info('Creating business metric alarms...');
    await alarmManager.createAlarmsByCategory('business');

    logger.info('Business alarms created successfully');
  } catch (error) {
    logger.error('Failed to create business alarms', error as Error);
    throw error;
  }
}

/**
 * Example 3: Sending alarm notifications
 */
async function sendNotificationExample(): Promise<void> {
  const logger = new Logger({ context: 'send-notification-example' });

  // Configure notification service with multiple channels
  const notificationService = new AlarmNotificationService({
    snsTopicArns: {
      critical: process.env.SNS_CRITICAL_TOPIC_ARN,
      high: process.env.SNS_HIGH_TOPIC_ARN,
      medium: process.env.SNS_MEDIUM_TOPIC_ARN,
      low: process.env.SNS_LOW_TOPIC_ARN,
    },
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
    emailConfig: process.env.ALERT_FROM_EMAIL ? {
      fromAddress: process.env.ALERT_FROM_EMAIL,
      toAddresses: (process.env.ALERT_TO_EMAILS || '').split(',').filter(Boolean),
    } : undefined,
    region: process.env.AWS_REGION || 'us-east-1',
  }, logger);

  // Create alarm event
  const alarmEvent: AlarmEvent = {
    alarmName: 'WorkTask-HighErrorRate',
    alarmDescription: 'System error rate has exceeded the acceptable threshold',
    newState: 'ALARM',
    oldState: 'OK',
    reason: 'Error rate is 7.5% over the last 10 minutes (threshold: 5%)',
    timestamp: new Date().toISOString(),
    severity: 'high',
    category: 'business',
    metricName: 'SystemErrorRate',
    threshold: 5,
    currentValue: 7.5,
  };

  try {
    logger.info('Sending alarm notification...');
    const result = await notificationService.sendAlarmNotification(alarmEvent);

    logger.info('Notification result:', {
      success: result.success,
      channels: result.channels,
      errors: result.errors,
    });

    if (result.success) {
      logger.info('Notification sent successfully to all channels');
    } else {
      logger.warn('Notification partially failed', {
        errors: result.errors,
      });
    }
  } catch (error) {
    logger.error('Failed to send notification', error as Error);
    throw error;
  }
}

/**
 * Example 4: Publishing metrics that trigger alarms
 */
async function publishMetricsExample(): Promise<void> {
  const logger = new Logger({ context: 'publish-metrics-example' });
  const metricsService = new WorkTaskMetricsService(logger);

  try {
    // Simulate high error rate that would trigger alarm
    logger.info('Publishing error metrics...');
    for (let i = 0; i < 10; i++) {
      await metricsService.recordOperationFailure('task-analysis', new Error('Simulated error'));
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between errors
    }

    // Simulate slow analysis time that would trigger alarm
    logger.info('Publishing slow analysis metrics...');
    await metricsService.recordAnalysisTime('task-123', 200000); // 200 seconds (>3 minutes threshold)

    // Simulate low quality pass rate
    logger.info('Publishing quality metrics...');
    for (let i = 0; i < 10; i++) {
      const passed = i < 6; // 60% pass rate (below 70% threshold)
      await metricsService.recordQualityCheck(`deliverable-${i}`, passed, passed ? 75 : 45);
    }

    logger.info('Metrics published - alarms should trigger if thresholds exceeded');
  } catch (error) {
    logger.error('Failed to publish metrics', error as Error);
    throw error;
  }
}

/**
 * Example 5: Testing alarm notifications
 */
async function testAlarmExample(): Promise<void> {
  const logger = new Logger({ context: 'test-alarm-example' });

  const alarmManager = new AlarmManager(logger, {
    region: process.env.AWS_REGION || 'us-east-1',
  });

  try {
    // List all alarms
    logger.info('Listing all Work Task alarms...');
    const alarms = await alarmManager.listAlarms();

    if (alarms.length === 0) {
      logger.warn('No alarms found. Create alarms first.');
      return;
    }

    // Test the first alarm
    const testAlarm = alarms[0];
    logger.info(`Testing alarm: ${testAlarm.AlarmName}`);

    // Set alarm to ALARM state
    await alarmManager.testAlarm(testAlarm.AlarmName, 'ALARM' as any);
    logger.info('Alarm set to ALARM state - notification should be sent');

    // Wait 10 seconds
    logger.info('Waiting 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Reset alarm to OK state
    await alarmManager.testAlarm(testAlarm.AlarmName, 'OK' as any);
    logger.info('Alarm reset to OK state');

    logger.info('Alarm test complete');
  } catch (error) {
    logger.error('Failed to test alarm', error as Error);
    throw error;
  }
}

/**
 * Example 6: Handling different severity levels
 */
async function severityRoutingExample(): Promise<void> {
  const logger = new Logger({ context: 'severity-routing-example' });

  const notificationService = new AlarmNotificationService({
    snsTopicArns: {
      critical: process.env.SNS_CRITICAL_TOPIC_ARN,
      high: process.env.SNS_HIGH_TOPIC_ARN,
      medium: process.env.SNS_MEDIUM_TOPIC_ARN,
      low: process.env.SNS_LOW_TOPIC_ARN,
    },
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  }, logger);

  // Critical alarm - immediate attention required
  const criticalEvent: AlarmEvent = {
    alarmName: 'WorkTask-CriticalSystemFailure',
    alarmDescription: 'Critical system failure detected',
    newState: 'ALARM',
    oldState: 'OK',
    reason: 'Multiple system components failing',
    timestamp: new Date().toISOString(),
    severity: 'critical',
    category: 'system',
  };

  // High priority alarm - prompt attention needed
  const highEvent: AlarmEvent = {
    alarmName: 'WorkTask-HighErrorRate',
    alarmDescription: 'Error rate exceeded threshold',
    newState: 'ALARM',
    oldState: 'OK',
    reason: 'Error rate is 7.5% (threshold: 5%)',
    timestamp: new Date().toISOString(),
    severity: 'high',
    category: 'business',
  };

  // Medium priority alarm - investigation required
  const mediumEvent: AlarmEvent = {
    alarmName: 'WorkTask-LowQualityScore',
    alarmDescription: 'Quality score below acceptable level',
    newState: 'ALARM',
    oldState: 'OK',
    reason: 'Average quality score is 55 (threshold: 60)',
    timestamp: new Date().toISOString(),
    severity: 'medium',
    category: 'business',
  };

  // Low priority alarm - monitoring and trends
  const lowEvent: AlarmEvent = {
    alarmName: 'WorkTask-NoTaskSubmissions',
    alarmDescription: 'No tasks submitted recently',
    newState: 'ALARM',
    oldState: 'OK',
    reason: 'No task submissions in the last 2 hours',
    timestamp: new Date().toISOString(),
    severity: 'low',
    category: 'business',
  };

  try {
    // Send notifications for different severity levels
    logger.info('Sending critical alarm...');
    await notificationService.sendAlarmNotification(criticalEvent);

    logger.info('Sending high priority alarm...');
    await notificationService.sendAlarmNotification(highEvent);

    logger.info('Sending medium priority alarm...');
    await notificationService.sendAlarmNotification(mediumEvent);

    logger.info('Sending low priority alarm...');
    await notificationService.sendAlarmNotification(lowEvent);

    logger.info('All severity level notifications sent');
  } catch (error) {
    logger.error('Failed to send severity-based notifications', error as Error);
    throw error;
  }
}

/**
 * Example 7: Monitoring alarm statistics
 */
async function monitorAlarmsExample(): Promise<void> {
  const logger = new Logger({ context: 'monitor-alarms-example' });

  const alarmManager = new AlarmManager(logger, {
    region: process.env.AWS_REGION || 'us-east-1',
  });

  try {
    // Get current alarm statistics
    const stats = await alarmManager.getAlarmStatistics();

    logger.info('Current Alarm Statistics:', {
      total: stats.total,
      inAlarm: stats.inAlarm,
      ok: stats.ok,
      insufficientData: stats.insufficientData,
    });

    logger.info('Alarms by Category:', stats.byCategory);
    logger.info('Alarms by Severity:', stats.bySeverity);

    // Check if any critical alarms are firing
    if (stats.inAlarm > 0) {
      logger.warn(`⚠️  ${stats.inAlarm} alarm(s) currently in ALARM state`);

      // List alarms to see which ones are firing
      const alarms = await alarmManager.listAlarms();
      const firingAlarms = alarms.filter((alarm: any) => alarm.StateValue === 'ALARM');

      logger.warn('Firing alarms:', firingAlarms.map((alarm: any) => ({
        name: alarm.AlarmName,
        description: alarm.AlarmDescription,
        reason: alarm.StateReason,
      })));
    } else {
      logger.info('✅ All alarms are in OK state');
    }

    // Get configuration summary
    const summary = alarmManager.getAlarmConfigurationSummary();
    logger.info('Alarm Configuration:', {
      totalAlarms: summary.totalAlarms,
      compositeAlarms: summary.compositeAlarms,
      snsTopicsConfigured: summary.snsTopicsConfigured,
    });
  } catch (error) {
    logger.error('Failed to monitor alarms', error as Error);
    throw error;
  }
}

/**
 * Example 8: Complete workflow - Setup, Publish, Monitor
 */
async function completeWorkflowExample(): Promise<void> {
  const logger = new Logger({ context: 'complete-workflow-example' });

  try {
    logger.info('=== Step 1: Setup Alarms ===');
    await setupBusinessAlarmsExample();

    logger.info('\n=== Step 2: Publish Metrics ===');
    await publishMetricsExample();

    logger.info('\n=== Step 3: Wait for Alarm Evaluation ===');
    logger.info('Waiting 5 minutes for CloudWatch to evaluate metrics...');
    await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes

    logger.info('\n=== Step 4: Monitor Alarms ===');
    await monitorAlarmsExample();

    logger.info('\n=== Step 5: Send Test Notification ===');
    await sendNotificationExample();

    logger.info('\n=== Complete Workflow Finished ===');
  } catch (error) {
    logger.error('Workflow failed', error as Error);
    throw error;
  }
}

// Export examples for use in other modules
export {
  setupAlarmsExample,
  setupBusinessAlarmsExample,
  sendNotificationExample,
  publishMetricsExample,
  testAlarmExample,
  severityRoutingExample,
  monitorAlarmsExample,
  completeWorkflowExample,
};

// CLI interface for running examples
async function main(): Promise<void> {
  const example = process.argv[2];

  const examples: Record<string, () => Promise<void>> = {
    'setup': setupAlarmsExample,
    'setup-business': setupBusinessAlarmsExample,
    'notify': sendNotificationExample,
    'metrics': publishMetricsExample,
    'test': testAlarmExample,
    'severity': severityRoutingExample,
    'monitor': monitorAlarmsExample,
    'workflow': completeWorkflowExample,
  };

  if (!example || !examples[example]) {
    console.log(`
Work Task Alerting System - Integration Examples

Usage:
  ts-node src/examples/alerting-integration-example.ts <example>

Available Examples:
  setup           - Setup all alarms with SNS integration
  setup-business  - Setup only business metric alarms
  notify          - Send a test alarm notification
  metrics         - Publish metrics that trigger alarms
  test            - Test an existing alarm
  severity        - Demonstrate severity-based routing
  monitor         - Monitor current alarm statistics
  workflow        - Complete workflow (setup, publish, monitor)

Examples:
  ts-node src/examples/alerting-integration-example.ts setup
  ts-node src/examples/alerting-integration-example.ts notify
  ts-node src/examples/alerting-integration-example.ts monitor
    `);
    process.exit(1);
  }

  try {
    await examples[example]();
    console.log('\n✅ Example completed successfully');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
