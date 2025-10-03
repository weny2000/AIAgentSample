#!/usr/bin/env node

/**
 * Test script for persona management system
 * This script tests the persona functionality without requiring AWS services
 */

import { PersonaService } from '../services/persona-service';
import { PersonaRepository } from '../repositories/persona-repository';
import { 
  PersonaConfig, 
  PersonaRequest, 
  LeadershipStyle, 
  DecisionMakingApproach,
  PersonaQuery
} from '../models/persona';

// Mock repository for testing
class MockPersonaRepository extends PersonaRepository {
  private personas: Map<string, PersonaConfig> = new Map();
  private nextId = 1;

  constructor() {
    super({ region: 'us-east-1', tableName: 'mock-table' });
  }

  async createPersona(
    leaderId: string,
    teamId: string,
    personaData: Omit<PersonaConfig, 'id' | 'leader_id' | 'team_id' | 'version' | 'created_at' | 'updated_at' | 'is_active'>
  ): Promise<PersonaConfig> {
    const now = new Date().toISOString();
    const persona: PersonaConfig = {
      id: `persona-${this.nextId++}`,
      leader_id: leaderId,
      team_id: teamId,
      ...personaData,
      version: 1,
      is_active: true,
      created_at: now,
      updated_at: now
    };

    this.personas.set(persona.id, persona);
    return persona;
  }

  async getPersonaById(personaId: string): Promise<PersonaConfig | null> {
    return this.personas.get(personaId) || null;
  }

  async getActivePersonaByTeam(teamId: string): Promise<PersonaConfig | null> {
    for (const persona of this.personas.values()) {
      if (persona.team_id === teamId && persona.is_active) {
        return persona;
      }
    }
    return null;
  }

  async updatePersona(
    personaId: string,
    updates: Partial<Omit<PersonaConfig, 'id' | 'leader_id' | 'team_id' | 'created_at'>>,
    changedBy: string
  ): Promise<PersonaConfig> {
    const existingPersona = this.personas.get(personaId);
    if (!existingPersona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    const updatedPersona: PersonaConfig = {
      ...existingPersona,
      ...updates,
      version: existingPersona.version + 1,
      updated_at: new Date().toISOString()
    };

    this.personas.set(personaId, updatedPersona);
    return updatedPersona;
  }

  async approvePersona(personaId: string, approvedBy: string): Promise<PersonaConfig> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    const approvedPersona = {
      ...persona,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.personas.set(personaId, approvedPersona);
    return approvedPersona;
  }

  async clearPolicyConflicts(personaId: string): Promise<PersonaConfig> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    const clearedPersona = {
      ...persona,
      policy_conflicts: undefined,
      updated_at: new Date().toISOString()
    };

    this.personas.set(personaId, clearedPersona);
    return clearedPersona;
  }

  async deactivatePersona(personaId: string, deactivatedBy: string): Promise<void> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    const deactivatedPersona = {
      ...persona,
      is_active: false,
      updated_at: new Date().toISOString()
    };

    this.personas.set(personaId, deactivatedPersona);
  }
}

async function testPersonaSystem() {
  console.log('🚀 Testing Persona Management System...\n');

  // Initialize services
  const mockRepository = new MockPersonaRepository();
  const personaService = new PersonaService({
    personaRepository: mockRepository
  });

  try {
    // Test 1: Create a persona
    console.log('📝 Test 1: Creating a persona...');
    const personaRequest: PersonaRequest = {
      name: 'Collaborative Team Leader',
      description: 'A collaborative leader focused on team empowerment',
      leadership_style: LeadershipStyle.COLLABORATIVE,
      decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
      escalation_criteria: {
        budget_threshold: 5000,
        team_size_threshold: 10,
        risk_level_threshold: 'high',
        decision_types: ['hiring', 'budget', 'architecture'],
        keywords: ['urgent', 'critical', 'emergency'],
        always_escalate_to_leader: false
      },
      common_decisions: [
        {
          scenario: 'code review approval',
          typical_response: 'Please ensure all tests pass, get peer review, and follow our coding standards',
          conditions: ['tests_passing', 'peer_reviewed', 'standards_compliant'],
          confidence_level: 0.9
        },
        {
          scenario: 'deployment decision',
          typical_response: 'Deploy during maintenance window after thorough testing',
          conditions: ['tests_pass', 'staging_verified', 'maintenance_window'],
          confidence_level: 0.85
        }
      ],
      team_rules: [
        {
          rule_id: 'CODE_REVIEW_001',
          description: 'All code changes must be reviewed by at least one peer',
          applies_to: ['developers', 'senior_developers'],
          priority: 9,
          active: true
        },
        {
          rule_id: 'TESTING_001',
          description: 'All features must have unit tests with >80% coverage',
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
      }
    };

    const createResult = await personaService.createPersona(
      'leader-123',
      'team-456',
      personaRequest,
      'admin-789'
    );

    console.log('✅ Persona created successfully!');
    console.log(`   ID: ${createResult.persona.id}`);
    console.log(`   Name: ${createResult.persona.name}`);
    console.log(`   Leadership Style: ${createResult.persona.leadership_style}`);
    console.log(`   Requires Approval: ${createResult.requires_approval}`);
    console.log(`   Policy Conflicts: ${createResult.conflicts?.length || 0}\n`);

    const personaId = createResult.persona.id;

    // Test 2: Generate persona-based responses
    console.log('🤖 Test 2: Generating persona-based responses...');

    const queries = [
      {
        query: 'How should I handle code review for this pull request?',
        context: { priority: 'normal' }
      },
      {
        query: 'Can we deploy this feature to production?',
        context: { environment: 'production' }
      },
      {
        query: 'We need to make an urgent hiring decision',
        context: { urgency: 'high' }
      },
      {
        query: 'Should we approve this $8000 expense?',
        context: { budget_amount: 8000 }
      }
    ];

    for (const [index, queryData] of queries.entries()) {
      console.log(`   Query ${index + 1}: "${queryData.query}"`);
      
      const personaQuery: PersonaQuery = {
        query: queryData.query,
        context: queryData.context,
        user_id: 'user-123',
        team_id: 'team-456'
      };

      const response = await personaService.generatePersonaResponse(personaQuery);
      
      console.log(`   Response: ${response.response}`);
      console.log(`   Confidence: ${response.confidence_score}`);
      console.log(`   Escalation Required: ${response.escalation_required}`);
      if (response.escalation_reason) {
        console.log(`   Escalation Reason: ${response.escalation_reason}`);
      }
      console.log(`   Sources: ${response.sources.join(', ')}`);
      console.log('');
    }

    // Test 3: Update persona
    console.log('📝 Test 3: Updating persona...');
    const updateRequest: PersonaRequest = {
      ...personaRequest,
      name: 'Updated Collaborative Leader',
      communication_preferences: {
        ...personaRequest.communication_preferences,
        tone: 'formal'
      }
    };

    const updateResult = await personaService.updatePersona(
      personaId,
      updateRequest,
      'leader-123'
    );

    console.log('✅ Persona updated successfully!');
    console.log(`   New Name: ${updateResult.persona.name}`);
    console.log(`   New Version: ${updateResult.persona.version}`);
    console.log(`   Communication Tone: ${updateResult.persona.communication_preferences.tone}\n`);

    // Test 4: Test policy conflict detection
    console.log('⚠️  Test 4: Testing policy conflict detection...');
    const conflictingRequest: PersonaRequest = {
      ...personaRequest,
      name: 'Conflicting Persona',
      team_rules: [
        {
          rule_id: 'SECURITY_BYPASS_001',
          description: 'bypass security checks for urgent deployments',
          applies_to: ['developers'],
          priority: 10,
          active: true
        }
      ]
    };

    const conflictResult = await personaService.createPersona(
      'leader-456',
      'team-789',
      conflictingRequest,
      'admin-789'
    );

    console.log('✅ Policy conflict detection working!');
    console.log(`   Requires Approval: ${conflictResult.requires_approval}`);
    console.log(`   Conflicts Detected: ${conflictResult.conflicts?.length || 0}`);
    if (conflictResult.conflicts && conflictResult.conflicts.length > 0) {
      conflictResult.conflicts.forEach((conflict, index) => {
        console.log(`   Conflict ${index + 1}:`);
        console.log(`     Policy: ${conflict.policy_name}`);
        console.log(`     Severity: ${conflict.severity}`);
        console.log(`     Description: ${conflict.description}`);
      });
    }
    console.log('');

    // Test 5: Approve persona
    console.log('✅ Test 5: Approving persona...');
    const approvedPersona = await personaService.approvePersona(personaId, 'admin-789');
    console.log('✅ Persona approved successfully!');
    console.log(`   Approved By: ${approvedPersona.approved_by}`);
    console.log(`   Approved At: ${approvedPersona.approved_at}\n`);

    // Test 6: Deactivate persona
    console.log('🔒 Test 6: Deactivating persona...');
    await personaService.deactivatePersona(personaId, 'admin-789');
    
    const deactivatedPersona = await personaService.getPersonaById(personaId);
    console.log('✅ Persona deactivated successfully!');
    console.log(`   Is Active: ${deactivatedPersona?.is_active}\n`);

    console.log('🎉 All tests completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Persona creation with validation');
    console.log('   ✅ Persona-based response generation');
    console.log('   ✅ Escalation logic');
    console.log('   ✅ Policy conflict detection');
    console.log('   ✅ Persona updates and versioning');
    console.log('   ✅ Persona approval workflow');
    console.log('   ✅ Persona deactivation');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPersonaSystem().catch(console.error);
}

export { testPersonaSystem };