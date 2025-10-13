/**
 * Setup Alerting Infrastructure Script
 * Creates CloudWatch alarms with SNS topic integration
 */

import { Logger } from '../lambda/utils/logger';
import { AlarmManager, SNSTopicMapping } from '../monitoring/alarm-manager';
import { getAlarmSeverityConfig } from '../monitoring/work-task-alarm-config';

interface SetupOptions {
  snsTopics?: Partial<SNSTopicMapping>;
  region?: string;
  category?: 'business' | 'performance' | 'system' | 'data_quality';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  enableCompositeAlarms?: boolean;
  dryRun?: boolean;
  deleteExisting?: boolean;
  testAlarms?: boolean;
}

async function setupAlerting(options: SetupOptions = {}): Promise<void> {
  const logger = new Logger({ context: 'setup-alerting' });

  try {
    logger.info('Starting alerting infrastructure setup', {
      options,
    });

    // Create alarm manager
    const alarmManager = new AlarmManager(logger, {
      region: options.region,
      snsTopicMapping: options.snsTopics,
      enableCompositeAlarms: options.enableCompositeAlarms ?? true,
      dryRun: options.dryRun ?? false,
    });

    // Delete existing alarms if requested
    if (options.deleteExisting) {
      logger.info('Deleting existing Work Task alarms');
      await alarmManager.deleteAllAlarms();
    }

    // Create alarms based on filters
    if (options.category) {
      logger.info(`Creating alarms for category: ${options.category}`);
      await alarmManager.createAlarmsByCategory(options.category);
    } else if (options.severity) {
      logger.info(`Creating alarms for severity: ${options.severity}`);
      await alarmManager.createAlarmsBySeverity(options.severity);
    } else {
      logger.info('Creating all Work Task alarms');
      await alarmManager.createAllAlarms();
    }

    // Get and display statistics
    const stats = await alarmManager.getAlarmStatistics();
    logger.info('Alarm statistics', stats);

    // Get configuration summary
    const summary = alarmManager.getAlarmConfigurationSummary();
    logger.info('Alarm configuration summary', summary);

    // Test alarms if requested
    if (options.testAlarms && !options.dryRun) {
      logger.info('Testing alarm notifications');
      const alarms = await alarmManager.listAlarms();
      
      if (alarms.length > 0) {
        const testAlarm = alarms[0];
        logger.info(`Testing alarm: ${testAlarm.AlarmName}`);
        await alarmManager.testAlarm(testAlarm.AlarmName);
        
        // Wait a bit then reset
        await new Promise(resolve => setTimeout(resolve, 5000));
        await alarmManager.testAlarm(testAlarm.AlarmName, 'OK' as any);
        logger.info('Alarm test complete');
      }
    }

    logger.info('Alerting infrastructure setup complete');
  } catch (error) {
    logger.error('Failed to setup alerting infrastructure', error as Error);
    throw error;
  }
}

async function displaySeverityConfig(): Promise<void> {
  const logger = new Logger({ context: 'severity-config' });
  const config = getAlarmSeverityConfig();

  logger.info('Alarm Severity Configuration:');
  for (const [severity, details] of Object.entries(config)) {
    logger.info(`  ${severity.toUpperCase()}:`, {
      snsTopicSuffix: details.snsTopicSuffix,
      description: details.description,
    });
  }
}

async function listAlarms(): Promise<void> {
  const logger = new Logger({ context: 'list-alarms' });
  const alarmManager = new AlarmManager(logger);

  try {
    const alarms = await alarmManager.listAlarms();
    
    logger.info(`Found ${alarms.length} Work Task alarms:`);
    for (const alarm of alarms) {
      logger.info(`  - ${alarm.AlarmName}`, {
        state: alarm.StateValue,
        description: alarm.AlarmDescription,
      });
    }
  } catch (error) {
    logger.error('Failed to list alarms', error as Error);
    throw error;
  }
}

async function deleteAlarms(): Promise<void> {
  const logger = new Logger({ context: 'delete-alarms' });
  const alarmManager = new AlarmManager(logger);

  try {
    await alarmManager.deleteAllAlarms();
    logger.info('All Work Task alarms deleted');
  } catch (error) {
    logger.error('Failed to delete alarms', error as Error);
    throw error;
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  const options: SetupOptions = {
    region: process.env.AWS_REGION || 'us-east-1',
    dryRun: args.includes('--dry-run'),
    deleteExisting: args.includes('--delete-existing'),
    testAlarms: args.includes('--test'),
    enableCompositeAlarms: !args.includes('--no-composite'),
  };

  // Parse SNS topic arguments
  const snsTopics: Partial<SNSTopicMapping> = {};
  const criticalTopicIndex = args.indexOf('--critical-topic');
  if (criticalTopicIndex !== -1 && args[criticalTopicIndex + 1]) {
    snsTopics.critical = args[criticalTopicIndex + 1];
  }
  const highTopicIndex = args.indexOf('--high-topic');
  if (highTopicIndex !== -1 && args[highTopicIndex + 1]) {
    snsTopics.high = args[highTopicIndex + 1];
  }
  const mediumTopicIndex = args.indexOf('--medium-topic');
  if (mediumTopicIndex !== -1 && args[mediumTopicIndex + 1]) {
    snsTopics.medium = args[mediumTopicIndex + 1];
  }
  const lowTopicIndex = args.indexOf('--low-topic');
  if (lowTopicIndex !== -1 && args[lowTopicIndex + 1]) {
    snsTopics.low = args[lowTopicIndex + 1];
  }

  if (Object.keys(snsTopics).length > 0) {
    options.snsTopics = snsTopics;
  }

  // Parse category filter
  const categoryIndex = args.indexOf('--category');
  if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    options.category = args[categoryIndex + 1] as any;
  }

  // Parse severity filter
  const severityIndex = args.indexOf('--severity');
  if (severityIndex !== -1 && args[severityIndex + 1]) {
    options.severity = args[severityIndex + 1] as any;
  }

  switch (command) {
    case 'setup':
      await setupAlerting(options);
      break;
    case 'list':
      await listAlarms();
      break;
    case 'delete':
      await deleteAlarms();
      break;
    case 'config':
      await displaySeverityConfig();
      break;
    case 'help':
    default:
      console.log(`
Work Task Alerting Setup Script

Usage:
  ts-node src/scripts/setup-alerting.ts <command> [options]

Commands:
  setup     Create CloudWatch alarms
  list      List existing alarms
  delete    Delete all Work Task alarms
  config    Display severity configuration
  help      Show this help message

Options:
  --critical-topic <arn>    SNS topic ARN for critical alerts
  --high-topic <arn>        SNS topic ARN for high priority alerts
  --medium-topic <arn>      SNS topic ARN for medium priority alerts
  --low-topic <arn>         SNS topic ARN for low priority alerts
  --category <category>     Create alarms for specific category (business|performance|system|data_quality)
  --severity <severity>     Create alarms for specific severity (critical|high|medium|low)
  --delete-existing         Delete existing alarms before creating new ones
  --no-composite            Skip creating composite alarms
  --test                    Test alarm notifications after creation
  --dry-run                 Show what would be created without actually creating

Examples:
  # Create all alarms with SNS topics
  ts-node src/scripts/setup-alerting.ts setup \\
    --critical-topic arn:aws:sns:us-east-1:123456789012:critical-alerts \\
    --high-topic arn:aws:sns:us-east-1:123456789012:high-alerts

  # Create only business metric alarms
  ts-node src/scripts/setup-alerting.ts setup --category business

  # Create only critical severity alarms
  ts-node src/scripts/setup-alerting.ts setup --severity critical

  # Dry run to see what would be created
  ts-node src/scripts/setup-alerting.ts setup --dry-run

  # Delete and recreate all alarms
  ts-node src/scripts/setup-alerting.ts setup --delete-existing

  # List existing alarms
  ts-node src/scripts/setup-alerting.ts list

  # Delete all alarms
  ts-node src/scripts/setup-alerting.ts delete

  # Show severity configuration
  ts-node src/scripts/setup-alerting.ts config
      `);
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

export { setupAlerting, listAlarms, deleteAlarms, displaySeverityConfig };
