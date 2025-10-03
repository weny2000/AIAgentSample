import { PersonaRepository } from '../repositories/persona-repository';
import { 
  PersonaConfig, 
  PersonaRequest, 
  PersonaResponse, 
  PolicyConflict, 
  PersonaQuery,
  PersonaQueryResponse,
  LeadershipStyle,
  DecisionMakingApproach
} from '../models/persona';
import { PaginatedResponse } from '../models';
import { v4 as uuidv4 } from 'uuid';

export interface PersonaServiceConfig {
  personaRepository: PersonaRepository;
  policyServiceUrl?: string; // For external policy validation
}

export class PersonaService {
  private personaRepository: PersonaRepository;
  private policyServiceUrl?: string;

  constructor(config: PersonaServiceConfig) {
    this.personaRepository = config.personaRepository;
    this.policyServiceUrl = config.policyServiceUrl;
  }

  /**
   * Create a new persona configuration
   */
  async createPersona(
    leaderId: string,
    teamId: string,
    personaRequest: PersonaRequest,
    createdBy: string
  ): Promise<PersonaResponse> {
    // Validate the persona request
    this.validatePersonaRequest(personaRequest);

    // Check for policy conflicts
    const conflicts = await this.detectPolicyConflicts(personaRequest, teamId);

    // Create the persona
    const persona = await this.personaRepository.createPersona(leaderId, teamId, {
      ...personaRequest,
      policy_conflicts: conflicts.length > 0 ? conflicts : undefined
    });

    const requiresApproval = conflicts.some(c => c.requires_approval) || conflicts.length > 0;

    return {
      persona,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      requires_approval: requiresApproval
    };
  }

  /**
   * Update an existing persona configuration
   */
  async updatePersona(
    personaId: string,
    personaRequest: PersonaRequest,
    changedBy: string
  ): Promise<PersonaResponse> {
    // Get existing persona
    const existingPersona = await this.personaRepository.getPersonaById(personaId);
    if (!existingPersona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    // Validate the persona request
    this.validatePersonaRequest(personaRequest);

    // Check for policy conflicts
    const conflicts = await this.detectPolicyConflicts(personaRequest, existingPersona.team_id);

    // Update the persona
    const updatedPersona = await this.personaRepository.updatePersona(
      personaId,
      {
        ...personaRequest,
        policy_conflicts: conflicts.length > 0 ? conflicts : undefined
      },
      changedBy
    );

    const requiresApproval = conflicts.some(c => c.requires_approval) || conflicts.length > 0;

    return {
      persona: updatedPersona,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      requires_approval: requiresApproval
    };
  }

  /**
   * Get persona by ID
   */
  async getPersonaById(personaId: string): Promise<PersonaConfig | null> {
    return this.personaRepository.getPersonaById(personaId);
  }

  /**
   * Get active persona for a leader
   */
  async getActivePersonaByLeader(leaderId: string): Promise<PersonaConfig | null> {
    return this.personaRepository.getActivePersonaByLeader(leaderId);
  }

  /**
   * Get active persona for a team
   */
  async getActivePersonaByTeam(teamId: string): Promise<PersonaConfig | null> {
    return this.personaRepository.getActivePersonaByTeam(teamId);
  }

  /**
   * Get all personas for a leader
   */
  async getPersonasByLeader(
    leaderId: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<PersonaConfig>> {
    return this.personaRepository.getPersonasByLeader(leaderId, limit, exclusiveStartKey);
  }

  /**
   * Approve a persona configuration
   */
  async approvePersona(personaId: string, approvedBy: string): Promise<PersonaConfig> {
    const persona = await this.personaRepository.getPersonaById(personaId);
    if (!persona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    // Clear policy conflicts if they exist
    if (persona.policy_conflicts && persona.policy_conflicts.length > 0) {
      await this.personaRepository.clearPolicyConflicts(personaId);
    }

    return this.personaRepository.approvePersona(personaId, approvedBy);
  }

  /**
   * Deactivate a persona
   */
  async deactivatePersona(personaId: string, deactivatedBy: string): Promise<void> {
    return this.personaRepository.deactivatePersona(personaId, deactivatedBy);
  }

  /**
   * Generate persona-based response to a query
   */
  async generatePersonaResponse(query: PersonaQuery): Promise<PersonaQueryResponse> {
    // Get the active persona for the team
    const persona = await this.personaRepository.getActivePersonaByTeam(query.team_id);
    if (!persona) {
      throw new Error(`No active persona found for team ${query.team_id}`);
    }

    // Check if escalation is required based on escalation criteria
    const escalationRequired = this.shouldEscalate(query, persona);

    if (escalationRequired.required) {
      return {
        response: `This query requires escalation to your team leader. Reason: ${escalationRequired.reason}`,
        confidence_score: 1.0,
        sources: [],
        escalation_required: true,
        escalation_reason: escalationRequired.reason,
        persona_used: {
          id: persona.id,
          name: persona.name,
          version: persona.version
        }
      };
    }

    // Generate response based on persona configuration
    const response = await this.generateResponseFromPersona(query, persona);

    return {
      response: response.text,
      confidence_score: response.confidence,
      sources: response.sources,
      escalation_required: false,
      persona_used: {
        id: persona.id,
        name: persona.name,
        version: persona.version
      }
    };
  }

  /**
   * Search personas
   */
  async searchPersonas(
    searchTerm: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<PersonaConfig>> {
    return this.personaRepository.searchPersonas(searchTerm, limit, exclusiveStartKey);
  }

  /**
   * Get persona version history
   */
  async getPersonaVersionHistory(
    personaId: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ) {
    return this.personaRepository.getPersonaVersionHistory(personaId, limit, exclusiveStartKey);
  }

  /**
   * Validate persona request
   */
  private validatePersonaRequest(request: PersonaRequest): void {
    if (!request.name || request.name.trim().length === 0) {
      throw new Error('Persona name is required');
    }

    if (!Object.values(LeadershipStyle).includes(request.leadership_style)) {
      throw new Error('Invalid leadership style');
    }

    if (!Object.values(DecisionMakingApproach).includes(request.decision_making_approach)) {
      throw new Error('Invalid decision making approach');
    }

    if (!request.escalation_criteria) {
      throw new Error('Escalation criteria is required');
    }

    if (!Array.isArray(request.escalation_criteria.decision_types)) {
      throw new Error('Escalation criteria decision_types must be an array');
    }

    if (!Array.isArray(request.common_decisions)) {
      throw new Error('Common decisions must be an array');
    }

    if (!Array.isArray(request.team_rules)) {
      throw new Error('Team rules must be an array');
    }

    // Validate common decisions
    request.common_decisions.forEach((decision, index) => {
      if (!decision.scenario || !decision.typical_response) {
        throw new Error(`Common decision at index ${index} must have scenario and typical_response`);
      }
      if (decision.confidence_level < 0 || decision.confidence_level > 1) {
        throw new Error(`Common decision at index ${index} confidence_level must be between 0 and 1`);
      }
    });

    // Validate team rules
    request.team_rules.forEach((rule, index) => {
      if (!rule.rule_id || !rule.description) {
        throw new Error(`Team rule at index ${index} must have rule_id and description`);
      }
      if (rule.priority < 1 || rule.priority > 10) {
        throw new Error(`Team rule at index ${index} priority must be between 1 and 10`);
      }
    });
  }

  /**
   * Detect policy conflicts in persona configuration
   */
  private async detectPolicyConflicts(
    personaRequest: PersonaRequest,
    teamId: string
  ): Promise<PolicyConflict[]> {
    const conflicts: PolicyConflict[] = [];

    // Check team rules against company policies
    for (const teamRule of personaRequest.team_rules) {
      const conflict = await this.checkRuleAgainstPolicies(teamRule, teamId);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    // Check escalation criteria against company policies
    const escalationConflict = await this.checkEscalationCriteriaAgainstPolicies(
      personaRequest.escalation_criteria,
      teamId
    );
    if (escalationConflict) {
      conflicts.push(escalationConflict);
    }

    // Check common decisions against company policies
    for (const decision of personaRequest.common_decisions) {
      const conflict = await this.checkDecisionAgainstPolicies(decision, teamId);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * Check if a team rule conflicts with company policies
   */
  private async checkRuleAgainstPolicies(
    teamRule: any,
    teamId: string
  ): Promise<PolicyConflict | null> {
    // This would integrate with a policy service or rules engine
    // For now, implement basic conflict detection logic

    // Example: Check if rule conflicts with security policies
    if (teamRule.description.toLowerCase().includes('bypass security') ||
        teamRule.description.toLowerCase().includes('skip approval')) {
      return {
        conflict_id: uuidv4(),
        policy_id: 'SECURITY_001',
        policy_name: 'Security Approval Policy',
        conflicting_rule: teamRule.rule_id,
        severity: 'high',
        description: 'Team rule conflicts with mandatory security approval requirements',
        suggested_resolution: 'Remove or modify the rule to comply with security policies',
        requires_approval: true
      };
    }

    // Example: Check budget-related conflicts
    if (teamRule.description.toLowerCase().includes('unlimited budget') ||
        teamRule.description.toLowerCase().includes('no budget limit')) {
      return {
        conflict_id: uuidv4(),
        policy_id: 'FINANCE_001',
        policy_name: 'Budget Control Policy',
        conflicting_rule: teamRule.rule_id,
        severity: 'critical',
        description: 'Team rule conflicts with budget control requirements',
        suggested_resolution: 'Set appropriate budget limits in the rule',
        requires_approval: true
      };
    }

    return null;
  }

  /**
   * Check escalation criteria against policies
   */
  private async checkEscalationCriteriaAgainstPolicies(
    escalationCriteria: any,
    teamId: string
  ): Promise<PolicyConflict | null> {
    // Check if budget threshold is too high
    if (escalationCriteria.budget_threshold && escalationCriteria.budget_threshold > 10000) {
      return {
        conflict_id: uuidv4(),
        policy_id: 'FINANCE_002',
        policy_name: 'Budget Escalation Policy',
        conflicting_rule: 'escalation_criteria.budget_threshold',
        severity: 'medium',
        description: 'Budget threshold exceeds company policy maximum of $10,000',
        suggested_resolution: 'Reduce budget threshold to $10,000 or below',
        requires_approval: true
      };
    }

    return null;
  }

  /**
   * Check common decisions against policies
   */
  private async checkDecisionAgainstPolicies(
    decision: any,
    teamId: string
  ): Promise<PolicyConflict | null> {
    // Check for decisions that might conflict with HR policies
    if (decision.scenario.toLowerCase().includes('termination') ||
        decision.scenario.toLowerCase().includes('firing')) {
      return {
        conflict_id: uuidv4(),
        policy_id: 'HR_001',
        policy_name: 'Employee Termination Policy',
        conflicting_rule: 'common_decision',
        severity: 'critical',
        description: 'Decision scenario involves employee termination which requires HR involvement',
        suggested_resolution: 'Remove termination decisions or add HR escalation requirement',
        requires_approval: true
      };
    }

    return null;
  }

  /**
   * Check if query should be escalated to actual leader
   */
  private shouldEscalate(query: PersonaQuery, persona: PersonaConfig): { required: boolean; reason?: string } {
    const criteria = persona.escalation_criteria;

    // Always escalate if configured
    if (criteria.always_escalate_to_leader) {
      return { required: true, reason: 'Configured to always escalate to leader' };
    }

    // Check for escalation keywords
    const queryLower = query.query.toLowerCase();
    for (const keyword of criteria.keywords) {
      if (queryLower.includes(keyword.toLowerCase())) {
        return { required: true, reason: `Query contains escalation keyword: ${keyword}` };
      }
    }

    // Check for decision types that require escalation
    for (const decisionType of criteria.decision_types) {
      if (queryLower.includes(decisionType.toLowerCase())) {
        return { required: true, reason: `Query involves decision type that requires escalation: ${decisionType}` };
      }
    }

    // Check budget threshold if mentioned in query
    if (query.context?.budget_amount && criteria.budget_threshold) {
      if (query.context.budget_amount > criteria.budget_threshold) {
        return { 
          required: true, 
          reason: `Budget amount ($${query.context.budget_amount}) exceeds threshold ($${criteria.budget_threshold})` 
        };
      }
    }

    // Check team size threshold if mentioned in query
    if (query.context?.team_size && criteria.team_size_threshold) {
      if (query.context.team_size > criteria.team_size_threshold) {
        return { 
          required: true, 
          reason: `Team size (${query.context.team_size}) exceeds threshold (${criteria.team_size_threshold})` 
        };
      }
    }

    // Check risk level threshold if mentioned in query
    if (query.context?.risk_level && criteria.risk_level_threshold) {
      const riskLevels = ['low', 'medium', 'high', 'critical'];
      const queryRiskIndex = riskLevels.indexOf(query.context.risk_level);
      const thresholdIndex = riskLevels.indexOf(criteria.risk_level_threshold);
      
      if (queryRiskIndex >= thresholdIndex) {
        return { 
          required: true, 
          reason: `Risk level (${query.context.risk_level}) meets or exceeds threshold (${criteria.risk_level_threshold})` 
        };
      }
    }

    return { required: false };
  }

  /**
   * Generate response based on persona configuration
   */
  private async generateResponseFromPersona(
    query: PersonaQuery,
    persona: PersonaConfig
  ): Promise<{ text: string; confidence: number; sources: string[] }> {
    // Check if query matches any common decisions
    const matchingDecision = persona.common_decisions.find(decision =>
      query.query.toLowerCase().includes(decision.scenario.toLowerCase()) ||
      decision.scenario.toLowerCase().includes(query.query.toLowerCase())
    );

    if (matchingDecision) {
      return {
        text: this.formatResponseWithPersonaStyle(matchingDecision.typical_response, persona),
        confidence: matchingDecision.confidence_level,
        sources: [`Persona: ${persona.name} - Common Decision Pattern`]
      };
    }

    // Check if query relates to team rules
    const relevantRules = persona.team_rules.filter(rule =>
      rule.active && (
        query.query.toLowerCase().includes(rule.description.toLowerCase()) ||
        rule.description.toLowerCase().includes(query.query.toLowerCase())
      )
    );

    if (relevantRules.length > 0) {
      const highestPriorityRule = relevantRules.reduce((prev, current) =>
        current.priority > prev.priority ? current : prev
      );

      return {
        text: this.formatResponseWithPersonaStyle(
          `Based on our team rule: ${highestPriorityRule.description}`,
          persona
        ),
        confidence: 0.8,
        sources: [`Persona: ${persona.name} - Team Rule: ${highestPriorityRule.rule_id}`]
      };
    }

    // Generate generic response based on leadership style
    const genericResponse = this.generateGenericResponseByStyle(query.query, persona);
    
    return {
      text: genericResponse,
      confidence: 0.6,
      sources: [`Persona: ${persona.name} - Leadership Style: ${persona.leadership_style}`]
    };
  }

  /**
   * Format response according to persona's communication preferences
   */
  private formatResponseWithPersonaStyle(response: string, persona: PersonaConfig): string {
    const prefs = persona.communication_preferences;
    
    let formattedResponse = response;

    // Adjust tone
    switch (prefs.tone) {
      case 'formal':
        formattedResponse = `I would recommend that ${formattedResponse.toLowerCase()}`;
        break;
      case 'casual':
        formattedResponse = `Hey, I think ${formattedResponse.toLowerCase()}`;
        break;
      case 'friendly':
        formattedResponse = `I'd suggest ${formattedResponse.toLowerCase()}`;
        break;
      case 'direct':
        formattedResponse = formattedResponse;
        break;
    }

    // Adjust verbosity
    switch (prefs.verbosity) {
      case 'concise':
        // Keep response as is
        break;
      case 'detailed':
        formattedResponse += '. Let me know if you need more context or have questions about this approach.';
        break;
      case 'comprehensive':
        formattedResponse += '. This aligns with our team\'s approach and company policies. I\'m happy to discuss the reasoning behind this recommendation or explore alternative approaches if needed.';
        break;
    }

    return formattedResponse;
  }

  /**
   * Generate generic response based on leadership style
   */
  private generateGenericResponseByStyle(query: string, persona: PersonaConfig): string {
    const style = persona.leadership_style;
    const approach = persona.decision_making_approach;

    let baseResponse = '';

    switch (style) {
      case LeadershipStyle.COLLABORATIVE:
        baseResponse = 'Let\'s work together on this. I\'d suggest gathering input from the team before making a decision.';
        break;
      case LeadershipStyle.DIRECTIVE:
        baseResponse = 'Here\'s what we need to do: follow the established process and escalate if needed.';
        break;
      case LeadershipStyle.COACHING:
        baseResponse = 'This is a great learning opportunity. What do you think would be the best approach based on our previous discussions?';
        break;
      case LeadershipStyle.SUPPORTIVE:
        baseResponse = 'I\'m here to support you through this. What resources or guidance do you need to move forward?';
        break;
      case LeadershipStyle.DELEGATING:
        baseResponse = 'You have the skills and knowledge to handle this. I trust your judgment on the best path forward.';
        break;
      case LeadershipStyle.TRANSFORMATIONAL:
        baseResponse = 'This aligns with our vision for the team. Let\'s think about how this contributes to our larger goals.';
        break;
      case LeadershipStyle.SERVANT:
        baseResponse = 'How can I help you succeed with this? What obstacles can I remove to make this easier for you?';
        break;
      default:
        baseResponse = 'Let me help you think through this situation.';
    }

    // Modify based on decision-making approach
    switch (approach) {
      case DecisionMakingApproach.CONSENSUS:
        baseResponse += ' We should make sure everyone on the team is aligned before proceeding.';
        break;
      case DecisionMakingApproach.CONSULTATIVE:
        baseResponse += ' I\'ll gather input from relevant stakeholders to inform our decision.';
        break;
      case DecisionMakingApproach.DEMOCRATIC:
        baseResponse += ' Let\'s put this to a team vote after discussing the options.';
        break;
      case DecisionMakingApproach.AUTOCRATIC:
        baseResponse += ' I\'ll make the final decision based on the information available.';
        break;
      case DecisionMakingApproach.LAISSEZ_FAIRE:
        baseResponse += ' I\'ll let you and the team decide what works best for this situation.';
        break;
    }

    return this.formatResponseWithPersonaStyle(baseResponse, persona);
  }
}