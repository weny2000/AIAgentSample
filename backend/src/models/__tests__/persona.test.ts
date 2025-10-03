import { 
  LeadershipStyle, 
  DecisionMakingApproach,
  PersonaConfig,
  PersonaRequest
} from '../persona';

describe('Persona Models', () => {
  describe('LeadershipStyle', () => {
    it('should have all expected leadership styles', () => {
      expect(LeadershipStyle.COLLABORATIVE).toBe('collaborative');
      expect(LeadershipStyle.DIRECTIVE).toBe('directive');
      expect(LeadershipStyle.COACHING).toBe('coaching');
      expect(LeadershipStyle.SUPPORTIVE).toBe('supportive');
      expect(LeadershipStyle.DELEGATING).toBe('delegating');
      expect(LeadershipStyle.TRANSFORMATIONAL).toBe('transformational');
      expect(LeadershipStyle.SERVANT).toBe('servant');
    });
  });

  describe('DecisionMakingApproach', () => {
    it('should have all expected decision making approaches', () => {
      expect(DecisionMakingApproach.CONSENSUS).toBe('consensus');
      expect(DecisionMakingApproach.CONSULTATIVE).toBe('consultative');
      expect(DecisionMakingApproach.AUTOCRATIC).toBe('autocratic');
      expect(DecisionMakingApproach.DEMOCRATIC).toBe('democratic');
      expect(DecisionMakingApproach.LAISSEZ_FAIRE).toBe('laissez_faire');
    });
  });

  describe('PersonaConfig', () => {
    it('should create a valid persona config', () => {
      const personaConfig: PersonaConfig = {
        id: 'persona-123',
        leader_id: 'leader-456',
        team_id: 'team-789',
        name: 'Test Persona',
        description: 'A test persona configuration',
        leadership_style: LeadershipStyle.COLLABORATIVE,
        decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
        escalation_criteria: {
          budget_threshold: 5000,
          team_size_threshold: 10,
          risk_level_threshold: 'high',
          decision_types: ['hiring', 'budget'],
          keywords: ['urgent', 'critical'],
          always_escalate_to_leader: false
        },
        common_decisions: [
          {
            scenario: 'code review approval',
            typical_response: 'Please ensure all tests pass and get peer review',
            conditions: ['tests_passing', 'peer_reviewed'],
            confidence_level: 0.9
          }
        ],
        team_rules: [
          {
            rule_id: 'rule-001',
            description: 'All code must be reviewed before merge',
            applies_to: ['developers'],
            priority: 8,
            active: true
          }
        ],
        communication_preferences: {
          tone: 'friendly',
          verbosity: 'detailed',
          preferred_channels: ['slack', 'email'],
          response_time_expectations: {
            urgent: 'within 1 hour',
            normal: 'within 4 hours',
            low_priority: 'within 24 hours'
          }
        },
        version: 1,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(personaConfig.id).toBe('persona-123');
      expect(personaConfig.leadership_style).toBe(LeadershipStyle.COLLABORATIVE);
      expect(personaConfig.decision_making_approach).toBe(DecisionMakingApproach.CONSULTATIVE);
      expect(personaConfig.escalation_criteria.budget_threshold).toBe(5000);
      expect(personaConfig.common_decisions).toHaveLength(1);
      expect(personaConfig.team_rules).toHaveLength(1);
      expect(personaConfig.version).toBe(1);
      expect(personaConfig.is_active).toBe(true);
    });
  });

  describe('PersonaRequest', () => {
    it('should create a valid persona request', () => {
      const personaRequest: PersonaRequest = {
        name: 'Test Persona',
        description: 'A test persona',
        leadership_style: LeadershipStyle.DIRECTIVE,
        decision_making_approach: DecisionMakingApproach.AUTOCRATIC,
        escalation_criteria: {
          budget_threshold: 10000,
          decision_types: ['hiring', 'termination'],
          keywords: ['emergency', 'critical'],
          always_escalate_to_leader: true
        },
        common_decisions: [],
        team_rules: [],
        communication_preferences: {
          tone: 'formal',
          verbosity: 'concise',
          preferred_channels: ['email'],
          response_time_expectations: {
            urgent: 'within 30 minutes',
            normal: 'within 2 hours',
            low_priority: 'within 8 hours'
          }
        },
        change_reason: 'Initial creation'
      };

      expect(personaRequest.name).toBe('Test Persona');
      expect(personaRequest.leadership_style).toBe(LeadershipStyle.DIRECTIVE);
      expect(personaRequest.decision_making_approach).toBe(DecisionMakingApproach.AUTOCRATIC);
      expect(personaRequest.escalation_criteria.always_escalate_to_leader).toBe(true);
      expect(personaRequest.communication_preferences.tone).toBe('formal');
      expect(personaRequest.change_reason).toBe('Initial creation');
    });
  });

  describe('Escalation Criteria', () => {
    it('should validate escalation criteria structure', () => {
      const escalationCriteria = {
        budget_threshold: 5000,
        team_size_threshold: 15,
        risk_level_threshold: 'medium' as const,
        decision_types: ['hiring', 'budget', 'architecture'],
        keywords: ['urgent', 'critical', 'emergency'],
        always_escalate_to_leader: false
      };

      expect(escalationCriteria.budget_threshold).toBe(5000);
      expect(escalationCriteria.team_size_threshold).toBe(15);
      expect(escalationCriteria.risk_level_threshold).toBe('medium');
      expect(escalationCriteria.decision_types).toContain('hiring');
      expect(escalationCriteria.keywords).toContain('urgent');
      expect(escalationCriteria.always_escalate_to_leader).toBe(false);
    });
  });

  describe('Communication Preferences', () => {
    it('should validate communication preferences structure', () => {
      const commPrefs = {
        tone: 'casual' as const,
        verbosity: 'comprehensive' as const,
        preferred_channels: ['slack', 'teams', 'email'],
        response_time_expectations: {
          urgent: 'within 15 minutes',
          normal: 'within 1 hour',
          low_priority: 'within 4 hours'
        }
      };

      expect(commPrefs.tone).toBe('casual');
      expect(commPrefs.verbosity).toBe('comprehensive');
      expect(commPrefs.preferred_channels).toHaveLength(3);
      expect(commPrefs.response_time_expectations.urgent).toBe('within 15 minutes');
    });
  });

  describe('Team Rules', () => {
    it('should validate team rule structure', () => {
      const teamRule = {
        rule_id: 'RULE_001',
        description: 'All pull requests must have at least 2 approvals',
        applies_to: ['developers', 'senior_developers'],
        priority: 9,
        active: true
      };

      expect(teamRule.rule_id).toBe('RULE_001');
      expect(teamRule.description).toContain('pull requests');
      expect(teamRule.applies_to).toContain('developers');
      expect(teamRule.priority).toBe(9);
      expect(teamRule.active).toBe(true);
    });
  });

  describe('Common Decisions', () => {
    it('should validate common decision structure', () => {
      const commonDecision = {
        scenario: 'deployment approval',
        typical_response: 'Ensure all tests pass, get security review, and deploy during maintenance window',
        conditions: ['tests_pass', 'security_approved', 'maintenance_window'],
        confidence_level: 0.95
      };

      expect(commonDecision.scenario).toBe('deployment approval');
      expect(commonDecision.typical_response).toContain('tests pass');
      expect(commonDecision.conditions).toHaveLength(3);
      expect(commonDecision.confidence_level).toBe(0.95);
      expect(commonDecision.confidence_level).toBeGreaterThan(0);
      expect(commonDecision.confidence_level).toBeLessThanOrEqual(1);
    });
  });
});