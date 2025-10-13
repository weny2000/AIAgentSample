#!/usr/bin/env node
/**
 * Setup Work Task Monitoring Infrastructure
 * Creates CloudWatch dashboards and alarms for the Work Task Analysis system
 */

import { CloudWatchDashboardManager } from '../monitoring/cloudwatch-dashboard-manager';
import { Logger } from '../lambda/utils/logger';

interface SetupOptions {
  snsTopicArn?: string;
  teardown?: boolean;
  dashboardOnly?: boolean;
  alarmsOnly?: boolean;
}

async function setupMonitoring(options: SetupOptions = {}): Promise<void> {
  const logger = new Logger();
  const manager = new CloudWatchDashboardManager(logger);

  try {
    if (options.teardown) {
      logger.info('Tearing down monitoring infrastructure...');
      await manager.teardownMonitoring();
      logger.info('✓ Monitoring infrastructure removed successfully');
      return;
    }

    logger.info('Setting up Work Task monitoring infrastructure...');

    if (options.dashboardOnly) {
      logger.info('Creating dashboard only...');
      await manager.createWorkTaskDashboard();
      logger.info('✓ Dashboard created successfully');
    } else if (options.alarmsOnly) {
      logger.info('Creating alarms only...');
      await manager.createWorkTaskAlarms(options.snsTopicArn);
      logger.info('✓ Alarms created successfully');
    } else {
      await manager.setupMonitoring(options.snsTopicArn);
      logger.info('✓ Monitoring infrastructure setup complete');
    }

    logger.info('\nMonitoring Resources Created:');
    logger.info('- Dashboard: WorkTaskAnalysisMetrics');
    logger.info('- Alarms: 6 metric alarms configured');
    
    if (options.snsTopicArn) {
      logger.info(`- Notifications: Enabled via ${options.snsTopicArn}`);
    } else {
      logger.info('- Notifications: Disabled (no SNS topic provided)');
    }

    logger.info('\nNext Steps:');
    logger.info('1. View dashboard in CloudWatch console');
    logger.info('2. Configure SNS topic for alarm notifications (if not already done)');
    logger.info('3. Test alarms by triggering threshold conditions');

  } catch (error) {
    logger.error('Failed to setup monitoring infrastructure', error as Error);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): SetupOptions {
  const args = process.argv.slice(2);
  const options: SetupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--sns-topic':
      case '-s':
        options.snsTopicArn = args[++i];
        break;
      case '--teardown':
      case '-t':
        options.teardown = true;
        break;
      case '--dashboard-only':
      case '-d':
        options.dashboardOnly = true;
        break;
      case '--alarms-only':
      case '-a':
        options.alarmsOnly = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Work Task Monitoring Setup

Usage: ts-node setup-monitoring.ts [options]

Options:
  -s, --sns-topic <arn>    SNS topic ARN for alarm notifications
  -d, --dashboard-only     Create dashboard only
  -a, --alarms-only        Create alarms only
  -t, --teardown           Remove all monitoring infrastructure
  -h, --help               Show this help message

Examples:
  # Setup complete monitoring with SNS notifications
  ts-node setup-monitoring.ts --sns-topic arn:aws:sns:us-east-1:123456789012:alerts

  # Create dashboard only
  ts-node setup-monitoring.ts --dashboard-only

  # Create alarms only
  ts-node setup-monitoring.ts --alarms-only --sns-topic arn:aws:sns:...

  # Remove all monitoring infrastructure
  ts-node setup-monitoring.ts --teardown
  `);
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  setupMonitoring(options).catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

export { setupMonitoring };
