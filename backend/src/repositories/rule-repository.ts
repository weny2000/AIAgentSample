import { RuleDefinition } from '../rules-engine/types';
import { BaseRepository, RepositoryConfig } from './base-repository';
import { DynamoDBItem, PaginatedResponse } from '../models';

interface RuleDefinitionItem extends RuleDefinition, DynamoDBItem {
  pk: string; // rule id
  entity_type: 'rule_definition';
}

export class RuleRepository extends BaseRepository<RuleDefinitionItem> {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  /**
   * Create a new rule definition
   */
  async createRule(rule: Omit<RuleDefinition, 'created_at' | 'updated_at'>): Promise<RuleDefinition> {
    const now = this.getCurrentTimestamp();
    const ruleWithTimestamps: RuleDefinition = {
      ...rule,
      created_at: now,
      updated_at: now
    };

    const ruleItem: RuleDefinitionItem = {
      ...ruleWithTimestamps,
      pk: rule.id,
      entity_type: 'rule_definition'
    };

    try {
      await this.putItem(ruleItem, 'attribute_not_exists(pk)');
      return ruleWithTimestamps;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
        throw new Error(`Rule with id ${rule.id} already exists`);
      }
      throw error;
    }
  }

  /**
   * Get a rule by ID
   */
  async getRuleById(id: string): Promise<RuleDefinition | null> {
    const item = await this.getItem({ pk: id });
    if (!item) return null;
    
    // Convert back to RuleDefinition format
    const { pk, entity_type, ...rule } = item;
    return rule as RuleDefinition;
  }

  /**
   * Get all rules
   */
  async getAllRules(): Promise<RuleDefinition[]> {
    const result = await this.scanItems(
      'entity_type = :entity_type',
      undefined,
      { ':entity_type': 'rule_definition' }
    );
    
    return result.items.map(item => {
      const { pk, entity_type, ...rule } = item;
      return rule as RuleDefinition;
    });
  }

  /**
   * Get rules by type
   */
  async getRulesByType(type: 'static' | 'semantic' | 'security'): Promise<RuleDefinition[]> {
    const result = await this.scanItems(
      'entity_type = :entity_type AND #type = :type',
      { '#type': 'type' },
      { ':entity_type': 'rule_definition', ':type': type }
    );
    
    return result.items.map(item => {
      const { pk, entity_type, ...rule } = item;
      return rule as RuleDefinition;
    });
  }

  /**
   * Get enabled rules only
   */
  async getEnabledRules(): Promise<RuleDefinition[]> {
    const result = await this.scanItems(
      'entity_type = :entity_type AND enabled = :enabled',
      undefined,
      { ':entity_type': 'rule_definition', ':enabled': true }
    );
    
    return result.items.map(item => {
      const { pk, entity_type, ...rule } = item;
      return rule as RuleDefinition;
    });
  }

  /**
   * Update a rule definition
   */
  async updateRule(id: string, updates: Partial<Omit<RuleDefinition, 'id' | 'created_at'>>): Promise<RuleDefinition> {
    const now = this.getCurrentTimestamp();
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Build update expression dynamically
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        updateExpression.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    // Always update the updated_at timestamp
    updateExpression.push('#updated_at = :updated_at');
    expressionAttributeNames['#updated_at'] = 'updated_at';
    expressionAttributeValues[':updated_at'] = now;

    try {
      const result = await this.updateItem(
        { pk: id },
        `SET ${updateExpression.join(', ')}`,
        expressionAttributeNames,
        expressionAttributeValues,
        'attribute_exists(pk)'
      );
      
      if (!result) {
        throw new Error(`Rule with id ${id} does not exist`);
      }
      
      const { pk, entity_type, ...rule } = result;
      return rule as RuleDefinition;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
        throw new Error(`Rule with id ${id} does not exist`);
      }
      throw error;
    }
  }

  /**
   * Delete a rule definition
   */
  async deleteRule(id: string): Promise<void> {
    try {
      await this.deleteItem({ pk: id }, 'attribute_exists(pk)');
    } catch (error) {
      if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
        throw new Error(`Rule with id ${id} does not exist`);
      }
      throw error;
    }
  }

  /**
   * Get rules by severity
   */
  async getRulesBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): Promise<RuleDefinition[]> {
    const result = await this.scanItems(
      'entity_type = :entity_type AND severity = :severity',
      undefined,
      { ':entity_type': 'rule_definition', ':severity': severity }
    );
    
    return result.items.map(item => {
      const { pk, entity_type, ...rule } = item;
      return rule as RuleDefinition;
    });
  }

  /**
   * Search rules by name or description
   */
  async searchRules(searchTerm: string): Promise<RuleDefinition[]> {
    const result = await this.scanItems(
      'entity_type = :entity_type AND (contains(#name, :searchTerm) OR contains(description, :searchTerm))',
      { '#name': 'name' },
      { ':entity_type': 'rule_definition', ':searchTerm': searchTerm }
    );
    
    return result.items.map(item => {
      const { pk, entity_type, ...rule } = item;
      return rule as RuleDefinition;
    });
  }

  /**
   * Get rule versions (if versioning is implemented)
   */
  async getRuleVersions(ruleId: string): Promise<RuleDefinition[]> {
    // This would require a GSI on rule_id if we want to support multiple versions
    // For now, just return the current version
    const rule = await this.getRuleById(ruleId);
    return rule ? [rule] : [];
  }

  /**
   * Enable or disable a rule
   */
  async toggleRule(id: string, enabled: boolean): Promise<RuleDefinition> {
    return this.updateRule(id, { enabled });
  }

  /**
   * Bulk create rules (useful for initial setup)
   */
  async bulkCreateRules(rules: Omit<RuleDefinition, 'created_at' | 'updated_at'>[]): Promise<RuleDefinition[]> {
    const createdRules: RuleDefinition[] = [];
    
    for (const rule of rules) {
      try {
        const createdRule = await this.createRule(rule);
        createdRules.push(createdRule);
      } catch (error) {
        console.error(`Failed to create rule ${rule.id}:`, error);
        // Continue with other rules
      }
    }
    
    return createdRules;
  }

  /**
   * Get rule statistics
   */
  async getRuleStats(): Promise<{
    total_rules: number;
    enabled_rules: number;
    disabled_rules: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
  }> {
    const allRules = await this.getAllRules();
    
    const stats = {
      total_rules: allRules.length,
      enabled_rules: allRules.filter(r => r.enabled).length,
      disabled_rules: allRules.filter(r => !r.enabled).length,
      by_type: {} as Record<string, number>,
      by_severity: {} as Record<string, number>
    };

    // Count by type
    allRules.forEach(rule => {
      stats.by_type[rule.type] = (stats.by_type[rule.type] || 0) + 1;
      stats.by_severity[rule.severity] = (stats.by_severity[rule.severity] || 0) + 1;
    });

    return stats;
  }
}