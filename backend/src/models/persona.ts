import { BaseEntity, TimestampFields } from './index';

/**
 * Leadership style enumeration
 */
export enum LeadershipStyle {
  COLLABORATIVE = 'collaborative',
  DIRECTIVE = 'directive',
  COACHING = 'coaching',
  SUPPORTIVE = 'supportive',
  DELEGATING = 'delegating',
  TRANSFORMATIONAL = 'transformational',
  SERVANT = 'servant'
}

/**
 * Decision making approach enumeration
 */
export enum DecisionMakingApproach {
  CONSENSUS = 'consensus',
  CONSULTATIVE = 'consultative',
  AUTOCRATIC = 'autocratic',
  DEMOCRATIC = 'democratic',
  LAISSEZ_FAIRE = 'laissez_faire'
}

/**
 * Escalation criteria for when to involve the actual leader
 */
export interface EscalationCriteria {
  budget_threshold?: number;
  team_size_threshold?: number;
  risk_level_threshold?: 'low' | 'medium' | 'high' | 'critical';
  decision_types: string[];
  keywords: string[];
  always_escalate_to_leader: boolean;
}

/**
 * Common decision patterns that the leader typically makes
 */
export interface CommonDecision {
  scenario: string;
  typical_response: string;
  conditions: string[];
  confidence_level: number; // 0-1 scale
}

/**
 * Team-specific rules and preferences
 */
export interface TeamRule {
  rule_id: string;
  description: string;
  applies_to: string[]; // team roles or specific members
  priority: number; // 1-10 scale
  active: boolean;
}

/**
 * Communication preferences for the persona
 */
export interface CommunicationPreferences {
  tone: 'formal' | 'casual' | 'friendly' | 'direct';
  verbosity: 'concise' | 'detailed' | 'comprehensive';
  preferred_channels: string[];
  response_time_expectations: {
    urgent: string; // e.g., "within 1 hour"
    normal: string; // e.g., "within 4 hours"
    low_priority: string; // e.g., "within 24 hours"
  };
}

/**
 * Policy conflict detection result
 */
export interface PolicyConflict {
  conflict_id: string;
  policy_id: string;
  policy_name: string;
  conflicting_rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggested_resolution: string;
  requires_approval: boolean;
}

/**
 * Persona configuration interface
 */
export interface PersonaConfig extends BaseEntity {
  leader_id: string;
  team_id: string;
  name: string;
  description?: string;
  leadership_style: LeadershipStyle;
  decision_making_approach: DecisionMakingApproach;
  escalation_criteria: EscalationCriteria;
  common_decisions: CommonDecision[];
  team_rules: TeamRule[];
  communication_preferences: CommunicationPreferences;
  version: number;
  is_active: boolean;
  approved_by?: string;
  approved_at?: string;
  policy_conflicts?: PolicyConflict[];
}

/**
 * Persona version history for tracking changes
 */
export interface PersonaVersion extends TimestampFields {
  persona_id: string;
  version: number;
  config: PersonaConfig;
  changed_by: string;
  change_reason?: string;
  approved_by?: string;
  approved_at?: string;
}

/**
 * Request interface for creating/updating personas
 */
export interface PersonaRequest {
  name: string;
  description?: string;
  leadership_style: LeadershipStyle;
  decision_making_approach: DecisionMakingApproach;
  escalation_criteria: EscalationCriteria;
  common_decisions: CommonDecision[];
  team_rules: TeamRule[];
  communication_preferences: CommunicationPreferences;
  change_reason?: string;
}

/**
 * Response interface for persona operations
 */
export interface PersonaResponse {
  persona: PersonaConfig;
  conflicts?: PolicyConflict[];
  requires_approval: boolean;
}

/**
 * Query interface for persona-based responses
 */
export interface PersonaQuery {
  query: string;
  context?: Record<string, any>;
  user_id: string;
  team_id: string;
}

/**
 * Response interface for persona-based queries
 */
export interface PersonaQueryResponse {
  response: string;
  confidence_score: number;
  sources: string[];
  escalation_required: boolean;
  escalation_reason?: string;
  persona_used: {
    id: string;
    name: string;
    version: number;
  };
}