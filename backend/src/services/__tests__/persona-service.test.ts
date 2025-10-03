import { PersonaService } from '../persona-service';
import { PersonaRepository } from '../../repositories/persona-repository';
import { 
  PersonaConfig, 
  PersonaRequest, 
  LeadershipStyle, 
  DecisionMakingApproach,
  PersonaQuery
} from '../../models/persona';

// Mock the repository
jest.mock('../../repositories/persona-repository');

describe('PersonaService', () => {
  let personaService: PersonaService;
  let mockPersonaRepository: jest.Mocked<PersonaRepository>;

  const mockPersonaConfig: PersonaConfig = {
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

  beforeEach(() => {
    mockPersonaRepository = new PersonaRepository({
      region: 'us-east-1',
      tableName: 'test-table'
    }) as jest.Mocked<PersonaRepository>;

    personaService = new PersonaService({
      personaRepository: mockPersonaRepository
    });

    jest.clearAllMocks();
  });

  describe('createPersona', () => {
    const validPersonaRequest: PersonaRequest = {
      name: 'Test Persona',
      description: 'A test persona',
      leadership_style: LeadershipStyle.COLLABORATIVE,
      decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
      escalation_criteria: {
        budget_threshold: 5000,
        team_size_threshold: 10,
        risk_level_threshold: 'high',
        decision_types: ['hiring'],
        keywords: ['urgent'],
        always_escalate_to_leader: false
      },
      common_decisions: [
        {
          scenario: 'test scenario',
          typical_response: 'test response',
          conditions: ['condition1'],
          confidence_level: 0.8
        }
      ],
      team_rules: [
        {
          rule_id: 'rule-001',
          description: 'test rule',
          applies_to: ['developers'],
          priority: 5,
          active: true
        }
      ],
      communication_preferences: {
        tone: 'friendly',
        verbosity: 'detailed',
        preferred_channels: ['slack'],
        response_time_expectations: {
          urgent: 'within 1 hour',
          normal: 'within 4 hours',
          low_priority: 'within 24 hours'
        }
      }
    };

    it('should create a persona successfully', async () => {
      mockPersonaRepository.createPersona.mockResolvedValue(mockPersonaConfig);

      const result = await personaService.createPersona(
        'leader-456',
        'team-789',
        validPersonaRequest,
        'creator-123'
      );

      expect(result.persona).toEqual(mockPersonaConfig);
      expect(result.requires_approval).toBe(false);
      expect(result.conflicts).toBeUndefined();
      expect(mockPersonaRepository.createPersona).toHaveBeenCalledWith(
        'leader-456',
        'team-789',
        expect.objectContaining(validPersonaRequest)
      );
    });

    it('should detect policy conflicts', async () => {
      const conflictingRequest: PersonaRequest = {
        ...validPersonaRequest,
        team_rules: [
          {
            rule_id: 'rule-002',
            description: 'bypass security checks for urgent deployments',
            applies_to: ['developers'],
            priority: 9,
            active: true
          }
        ]
      };

      const personaWithConflicts = {
        ...mockPersonaConfig,
        policy_conflicts: [
          {
            conflict_id: 'conflict-123',
            policy_id: 'SECURITY_001',
            policy_name: 'Security Approval Policy',
            conflicting_rule: 'rule-002',
            severity: 'high' as const,
            description: 'Team rule conflicts with mandatory security approval requirements',
            suggested_resolution: 'Remove or modify the rule to comply with security policies',
            requires_approval: true
          }
        ]
      };

      mockPersonaRepository.createPersona.mockResolvedValue(personaWithConflicts);

      const result = await personaService.createPersona(
        'leader-456',
        'team-789',
        conflictingRequest,
        'creator-123'
      );

      expect(result.requires_approval).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts![0].severity).toBe('high');
    });

    it('should validate persona request', async () => {
      const invalidRequest = {
        ...validPersonaRequest,
        name: '' // Invalid empty name
      };

      await expect(
        personaService.createPersona('leader-456', 'team-789', invalidRequest, 'creator-123')
      ).rejects.toThrow('Persona name is required');
    });

    it('should validate leadership style', async () => {
      const invalidRequest = {
        ...validPersonaRequest,
        leadership_style: 'invalid_style' as LeadershipStyle
      };

      await expect(
        personaService.createPersona('leader-456', 'team-789', invalidRequest, 'creator-123')
      ).rejects.toThrow('Invalid leadership style');
    });

    it('should validate common decisions confidence level', async () => {
      const invalidRequest = {
        ...validPersonaRequest,
        common_decisions: [
          {
            scenario: 'test',
            typical_response: 'test',
            conditions: [],
            confidence_level: 1.5 // Invalid confidence level > 1
          }
        ]
      };

      await expect(
        personaService.createPersona('leader-456', 'team-789', invalidRequest, 'creator-123')
      ).rejects.toThrow('confidence_level must be between 0 and 1');
    });
  });

  describe('updatePersona', () => {
    it('should update persona successfully', async () => {
      const updateRequest: PersonaRequest = {
        ...mockPersonaConfig,
        name: 'Updated Persona Name'
      };

      const updatedPersona = {
        ...mockPersonaConfig,
        name: 'Updated Persona Name',
        version: 2
      };

      mockPersonaRepository.getPersonaById.mockResolvedValue(mockPersonaConfig);
      mockPersonaRepository.updatePersona.mockResolvedValue(updatedPersona);

      const result = await personaService.updatePersona(
        'persona-123',
        updateRequest,
        'updater-456'
      );

      expect(result.persona.name).toBe('Updated Persona Name');
      expect(result.persona.version).toBe(2);
      expect(mockPersonaRepository.updatePersona).toHaveBeenCalledWith(
        'persona-123',
        expect.objectContaining({ name: 'Updated Persona Name' }),
        'updater-456'
      );
    });

    it('should throw error if persona not found', async () => {
      mockPersonaRepository.getPersonaById.mockResolvedValue(null);

      await expect(
        personaService.updatePersona('nonexistent-id', {} as PersonaRequest, 'updater-456')
      ).rejects.toThrow('Persona with ID nonexistent-id not found');
    });
  });

  describe('generatePersonaResponse', () => {
    beforeEach(() => {
      mockPersonaRepository.getActivePersonaByTeam.mockResolvedValue(mockPersonaConfig);
    });

    it('should generate response from common decisions', async () => {
      const query: PersonaQuery = {
        query: 'How should I handle code review approval?',
        user_id: 'user-123',
        team_id: 'team-789'
      };

      const result = await personaService.generatePersonaResponse(query);

      expect(result.escalation_required).toBe(false);
      expect(result.confidence_score).toBe(0.9);
      expect(result.response).toContain('Please ensure all tests pass and get peer review');
      expect(result.sources).toContain('Persona: Test Persona - Common Decision Pattern');
    });

    it('should generate response from team rules', async () => {
      const query: PersonaQuery = {
        query: 'What are the rules about code review?',
        user_id: 'user-123',
        team_id: 'team-789'
      };

      const result = await personaService.generatePersonaResponse(query);

      expect(result.escalation_required).toBe(false);
      expect(result.confidence_score).toBe(0.8);
      expect(result.response).toContain('All code must be reviewed before merge');
      expect(result.sources).toContain('Persona: Test Persona - Team Rule: rule-001');
    });

    it('should escalate when budget threshold exceeded', async () => {
      const query: PersonaQuery = {
        query: 'Can we approve this expense?',
        context: { budget_amount: 10000 },
        user_id: 'user-123',
        team_id: 'team-789'
      };

      const result = await personaService.generatePersonaResponse(query);

      expect(result.escalation_required).toBe(true);
      expect(result.escalation_reason).toContain('Budget amount ($10000) exceeds threshold ($5000)');
    });

    it('should escalate when escalation keyword found', async () => {
      const query: PersonaQuery = {
        query: 'This is an urgent issue that needs immediate attention',
        user_id: 'user-123',
        team_id: 'team-789'
      };

      const result = await personaService.generatePersonaResponse(query);

      expect(result.escalation_required).toBe(true);
      expect(result.escalation_reason).toContain('Query contains escalation keyword: urgent');
    });

    it('should escalate when decision type requires escalation', async () => {
      const query: PersonaQuery = {
        query: 'We need to make a hiring decision for the new developer position',
        user_id: 'user-123',
        team_id: 'team-789'
      };

      const result = await personaService.generatePersonaResponse(query);

      expect(result.escalation_required).toBe(true);
      expect(result.escalation_reason).toContain('Query involves decision type that requires escalation: hiring');
    });

    it('should generate generic response based on leadership style', async () => {
      const query: PersonaQuery = {
        query: 'How should we approach this new project?',
        user_id: 'user-123',
        team_id: 'team-789'
      };

      const result = await personaService.generatePersonaResponse(query);

      expect(result.escalation_required).toBe(false);
      expect(result.confidence_score).toBe(0.6);
      expect(result.response).toContain('work together');
      expect(result.sources).toContain('Persona: Test Persona - Leadership Style: collaborative');
    });

    it('should throw error if no active persona found', async () => {
      mockPersonaRepository.getActivePersonaByTeam.mockResolvedValue(null);

      const query: PersonaQuery = {
        query: 'test query',
        user_id: 'user-123',
        team_id: 'team-789'
      };

      await expect(
        personaService.generatePersonaResponse(query)
      ).rejects.toThrow('No active persona found for team team-789');
    });
  });

  describe('approvePersona', () => {
    it('should approve persona and clear conflicts', async () => {
      const personaWithConflicts = {
        ...mockPersonaConfig,
        policy_conflicts: [
          {
            conflict_id: 'conflict-123',
            policy_id: 'POLICY_001',
            policy_name: 'Test Policy',
            conflicting_rule: 'rule-001',
            severity: 'medium' as const,
            description: 'Test conflict',
            suggested_resolution: 'Fix the rule',
            requires_approval: true
          }
        ]
      };

      const approvedPersona = {
        ...personaWithConflicts,
        approved_by: 'admin-123',
        approved_at: '2024-01-02T00:00:00Z'
      };

      mockPersonaRepository.getPersonaById.mockResolvedValue(personaWithConflicts);
      mockPersonaRepository.clearPolicyConflicts.mockResolvedValue(approvedPersona);
      mockPersonaRepository.approvePersona.mockResolvedValue(approvedPersona);

      const result = await personaService.approvePersona('persona-123', 'admin-123');

      expect(result.approved_by).toBe('admin-123');
      expect(mockPersonaRepository.clearPolicyConflicts).toHaveBeenCalledWith('persona-123');
      expect(mockPersonaRepository.approvePersona).toHaveBeenCalledWith('persona-123', 'admin-123');
    });

    it('should approve persona without conflicts', async () => {
      const approvedPersona = {
        ...mockPersonaConfig,
        approved_by: 'admin-123',
        approved_at: '2024-01-02T00:00:00Z'
      };

      mockPersonaRepository.getPersonaById.mockResolvedValue(mockPersonaConfig);
      mockPersonaRepository.approvePersona.mockResolvedValue(approvedPersona);

      const result = await personaService.approvePersona('persona-123', 'admin-123');

      expect(result.approved_by).toBe('admin-123');
      expect(mockPersonaRepository.clearPolicyConflicts).not.toHaveBeenCalled();
      expect(mockPersonaRepository.approvePersona).toHaveBeenCalledWith('persona-123', 'admin-123');
    });
  });

  describe('getActivePersonaByTeam', () => {
    it('should return active persona for team', async () => {
      mockPersonaRepository.getActivePersonaByTeam.mockResolvedValue(mockPersonaConfig);

      const result = await personaService.getActivePersonaByTeam('team-789');

      expect(result).toEqual(mockPersonaConfig);
      expect(mockPersonaRepository.getActivePersonaByTeam).toHaveBeenCalledWith('team-789');
    });

    it('should return null if no active persona found', async () => {
      mockPersonaRepository.getActivePersonaByTeam.mockResolvedValue(null);

      const result = await personaService.getActivePersonaByTeam('team-789');

      expect(result).toBeNull();
    });
  });

  describe('deactivatePersona', () => {
    it('should deactivate persona successfully', async () => {
      mockPersonaRepository.deactivatePersona.mockResolvedValue();

      await personaService.deactivatePersona('persona-123', 'deactivator-456');

      expect(mockPersonaRepository.deactivatePersona).toHaveBeenCalledWith('persona-123', 'deactivator-456');
    });
  });
});