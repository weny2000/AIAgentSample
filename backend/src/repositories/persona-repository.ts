import { BaseRepository, RepositoryConfig } from './base-repository';
import { PersonaConfig, PersonaVersion, PolicyConflict } from '../models/persona';
import { PaginatedResponse } from '../models';
import { v4 as uuidv4 } from 'uuid';

export class PersonaRepository extends BaseRepository<PersonaConfig> {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  /**
   * Create a new persona configuration
   */
  async create(
    personaData: Omit<PersonaConfig, 'id' | 'version' | 'created_at' | 'updated_at' | 'is_active'>
  ): Promise<PersonaConfig> {
    const now = this.getCurrentTimestamp();
    const persona: PersonaConfig = {
      id: uuidv4(),
      ...personaData,
      version: 1,
      is_active: true,
      created_at: now,
      updated_at: now
    };

    await this.putItem(persona);
    return persona;
  }

  /**
   * Create a new persona configuration (legacy method)
   */
  async createPersona(
    leaderId: string,
    teamId: string,
    personaData: Omit<PersonaConfig, 'id' | 'leader_id' | 'team_id' | 'version' | 'created_at' | 'updated_at' | 'is_active'>
  ): Promise<PersonaConfig> {
    return this.create({
      leader_id: leaderId,
      team_id: teamId,
      ...personaData
    });
  }

  /**
   * Get persona by leader and team combination
   */
  async getByLeaderAndTeam(leaderId: string, teamId: string): Promise<PersonaConfig | null> {
    const result = await this.scanItems(
      'leader_id = :leader_id AND team_id = :team_id',
      { '#leader_id': 'leader_id', '#team_id': 'team_id' },
      { ':leader_id': leaderId, ':team_id': teamId },
      undefined,
      1
    );

    return result.items.length > 0 ? result.items[0] : null;
  }

  /**
   * Get persona by ID
   */
  async getPersonaById(personaId: string): Promise<PersonaConfig | null> {
    return this.getItem({ id: personaId });
  }

  /**
   * Get active persona for a leader
   */
  async getActivePersonaByLeader(leaderId: string): Promise<PersonaConfig | null> {
    const result = await this.queryItems(
      'leader_id = :leader_id',
      undefined,
      { ':leader_id': leaderId },
      'is_active = :is_active',
      'leader-index',
      1,
      undefined,
      false // Get latest version first
    );

    return result.items.length > 0 ? result.items[0] : null;
  }

  /**
   * Get active persona for a team
   */
  async getActivePersonaByTeam(teamId: string): Promise<PersonaConfig | null> {
    const result = await this.queryItems(
      'team_id = :team_id',
      undefined,
      { ':team_id': teamId },
      'is_active = :is_active',
      'team-index',
      1,
      undefined,
      false
    );

    return result.items.length > 0 ? result.items[0] : null;
  }

  /**
   * Update persona configuration (creates new version)
   */
  async updatePersona(
    personaId: string,
    updates: Partial<Omit<PersonaConfig, 'id' | 'leader_id' | 'team_id' | 'created_at'>> & { change_reason?: string },
    changedBy: string
  ): Promise<PersonaConfig> {
    const existingPersona = await this.getPersonaById(personaId);
    if (!existingPersona) {
      throw new Error(`Persona with ID ${personaId} not found`);
    }

    // Create version history entry
    await this.createPersonaVersion(existingPersona, changedBy, updates.change_reason);

    const now = this.getCurrentTimestamp();
    const updatedPersona: PersonaConfig = {
      ...existingPersona,
      ...updates,
      version: existingPersona.version + 1,
      updated_at: now
    };

    await this.putItem(updatedPersona);
    return updatedPersona;
  }

  /**
   * Deactivate a persona
   */
  async deactivatePersona(personaId: string, deactivatedBy: string): Promise<void> {
    const now = this.getCurrentTimestamp();
    await this.updateItem(
      { id: personaId },
      'SET is_active = :is_active, updated_at = :updated_at, deactivated_by = :deactivated_by',
      undefined,
      {
        ':is_active': false,
        ':updated_at': now,
        ':deactivated_by': deactivatedBy
      },
      'attribute_exists(id)'
    );
  }

  /**
   * Get all personas for a leader (including inactive)
   */
  async getPersonasByLeader(
    leaderId: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<PersonaConfig>> {
    return this.queryItems(
      'leader_id = :leader_id',
      undefined,
      { ':leader_id': leaderId },
      undefined,
      'leader-index',
      limit,
      exclusiveStartKey,
      false
    );
  }

  /**
   * Get all personas for a team
   */
  async getPersonasByTeam(
    teamId: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<PersonaConfig>> {
    return this.queryItems(
      'team_id = :team_id',
      undefined,
      { ':team_id': teamId },
      undefined,
      'team-index',
      limit,
      exclusiveStartKey,
      false
    );
  }

  /**
   * Search personas by name or description
   */
  async searchPersonas(
    searchTerm: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<PersonaConfig>> {
    return this.scanItems(
      'contains(#name, :search_term) OR contains(description, :search_term)',
      { '#name': 'name' },
      { ':search_term': searchTerm },
      limit,
      exclusiveStartKey
    );
  }

  /**
   * Add policy conflicts to a persona
   */
  async addPolicyConflicts(personaId: string, conflicts: PolicyConflict[]): Promise<PersonaConfig> {
    const now = this.getCurrentTimestamp();
    const result = await this.updateItem(
      { id: personaId },
      'SET policy_conflicts = :conflicts, updated_at = :updated_at',
      undefined,
      {
        ':conflicts': conflicts,
        ':updated_at': now
      },
      'attribute_exists(id)'
    );

    if (!result) {
      throw new Error(`Failed to update persona ${personaId} with policy conflicts`);
    }

    return result;
  }

  /**
   * Clear policy conflicts from a persona
   */
  async clearPolicyConflicts(personaId: string): Promise<PersonaConfig> {
    const now = this.getCurrentTimestamp();
    const result = await this.updateItem(
      { id: personaId },
      'REMOVE policy_conflicts SET updated_at = :updated_at',
      undefined,
      { ':updated_at': now },
      'attribute_exists(id)'
    );

    if (!result) {
      throw new Error(`Failed to clear policy conflicts for persona ${personaId}`);
    }

    return result;
  }

  /**
   * Approve a persona configuration
   */
  async approvePersona(personaId: string, approvedBy: string): Promise<PersonaConfig> {
    const now = this.getCurrentTimestamp();
    const result = await this.updateItem(
      { id: personaId },
      'SET approved_by = :approved_by, approved_at = :approved_at, updated_at = :updated_at',
      undefined,
      {
        ':approved_by': approvedBy,
        ':approved_at': now,
        ':updated_at': now
      },
      'attribute_exists(id)'
    );

    if (!result) {
      throw new Error(`Failed to approve persona ${personaId}`);
    }

    return result;
  }

  /**
   * Create persona version history entry
   */
  private async createPersonaVersion(
    persona: PersonaConfig,
    changedBy: string,
    changeReason?: string
  ): Promise<void> {
    const now = this.getCurrentTimestamp();
    const versionEntry: PersonaVersion = {
      persona_id: persona.id,
      version: persona.version,
      config: persona,
      changed_by: changedBy,
      change_reason: changeReason,
      created_at: now,
      updated_at: now
    };

    // Store in a separate table or as a separate item with composite key
    // For now, we'll use the same table with a different partition key pattern
    const versionKey = `VERSION#${persona.id}#${persona.version}`;
    await this.putItem({
      id: versionKey,
      ...versionEntry
    } as any);
  }

  /**
   * Get persona version history
   */
  async getPersonaVersionHistory(
    personaId: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<PersonaVersion>> {
    const result = await this.queryItems(
      'begins_with(id, :version_prefix)',
      undefined,
      { ':version_prefix': `VERSION#${personaId}#` },
      undefined,
      undefined,
      limit,
      exclusiveStartKey,
      false
    );

    return {
      items: result.items.map(item => ({
        persona_id: (item as any).persona_id,
        version: (item as any).version,
        config: (item as any).config,
        changed_by: (item as any).changed_by,
        change_reason: (item as any).change_reason,
        approved_by: (item as any).approved_by,
        approved_at: (item as any).approved_at,
        created_at: item.created_at,
        updated_at: item.updated_at
      })),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
      scannedCount: result.scannedCount
    };
  }
}