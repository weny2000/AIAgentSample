#!/usr/bin/env ts-node

import { RuleRepository } from '../repositories/rule-repository';
import { DEFAULT_RULES } from '../rules-engine/default-rules';
import { logger } from '../lambda/utils/logger';

async function seedDefaultRules() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const tableName = process.env.RULE_DEFINITIONS_TABLE_NAME || 'ai-agent-rule-definitions-dev';

  logger.info('Starting default rules seeding', { region, tableName });

  const ruleRepository = new RuleRepository({ region, tableName });

  try {
    // Check if rules already exist
    const existingRules = await ruleRepository.getAllRules();
    logger.info(`Found ${existingRules.length} existing rules`);

    // Filter out rules that already exist
    const existingRuleIds = new Set(existingRules.map(rule => rule.id));
    const newRules = DEFAULT_RULES.filter(rule => !existingRuleIds.has(rule.id));

    if (newRules.length === 0) {
      logger.info('All default rules already exist, skipping seeding');
      return;
    }

    logger.info(`Seeding ${newRules.length} new default rules`);

    // Create new rules
    const createdRules = await ruleRepository.bulkCreateRules(newRules);
    
    logger.info(`Successfully created ${createdRules.length} rules`);

    // Log summary by category
    const summary = createdRules.reduce((acc, rule) => {
      acc[rule.type] = (acc[rule.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info('Rules created by type:', summary);

    // Log any failed rules
    const failedCount = newRules.length - createdRules.length;
    if (failedCount > 0) {
      logger.warn(`${failedCount} rules failed to create`);
    }

  } catch (error) {
    logger.error('Failed to seed default rules', { error });
    process.exit(1);
  }
}

// Run the seeding if this script is executed directly
if (require.main === module) {
  seedDefaultRules()
    .then(() => {
      logger.info('Default rules seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Default rules seeding failed', { error });
      process.exit(1);
    });
}

export { seedDefaultRules };