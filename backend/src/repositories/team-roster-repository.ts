import { BaseRepository, RepositoryConfig } from './base-repository';
import { 
  TeamRoster, 
  TeamRosterItem, 
  CreateTeamRosterInput, 
  UpdateTeamRosterInput,
  QueryTeamRosterParams 
} from '../models';

export class TeamRosterRepository extends BaseRepository<TeamRosterItem> {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  /**
   * Create a new team roster
   */
  async create(input: CreateTeamRosterInput): Promise<TeamRoster> {
    this.validateRequiredFields(input, ['team_id', 'members', 'leader_persona_id']);

    const now = this.getCurrentTimestamp();
    const item: TeamRosterItem = {
      pk: input.team_id,
      entity_type: 'team_roster',
      team_id: input.team_id,
      members: input.members,
      leader_persona_id: input.leader_persona_id,
      policies: input.policies || [],
      created_at: now,
      updated_at: now,
    };

    // Ensure team doesn't already exist
    await this.putItem(item, 'attribute_not_exists(pk)');

    // Return the created item without DynamoDB metadata
    const { pk, entity_type, ...teamRoster } = item;
    return teamRoster as TeamRoster;
  }

  /**
   * Get a team roster by team_id
   */
  async getByTeamId(params: QueryTeamRosterParams): Promise<TeamRoster | null> {
    const item = await this.getItem({ pk: params.team_id });
    
    if (!item || item.entity_type !== 'team_roster') {
      return null;
    }

    // Return without DynamoDB metadata
    const { pk, entity_type, ...teamRoster } = item;
    return teamRoster as TeamRoster;
  }

  /**
   * Update a team roster
   */
  async update(input: UpdateTeamRosterInput): Promise<TeamRoster | null> {
    this.validateRequiredFields(input, ['team_id']);

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Build update expression dynamically
    if (input.members !== undefined) {
      updateExpressions.push('#members = :members');
      expressionAttributeNames['#members'] = 'members';
      expressionAttributeValues[':members'] = input.members;
    }

    if (input.leader_persona_id !== undefined) {
      updateExpressions.push('#leader_persona_id = :leader_persona_id');
      expressionAttributeNames['#leader_persona_id'] = 'leader_persona_id';
      expressionAttributeValues[':leader_persona_id'] = input.leader_persona_id;
    }

    if (input.policies !== undefined) {
      updateExpressions.push('#policies = :policies');
      expressionAttributeNames['#policies'] = 'policies';
      expressionAttributeValues[':policies'] = input.policies;
    }

    // Always update the updated_at timestamp
    updateExpressions.push('#updated_at = :updated_at');
    expressionAttributeNames['#updated_at'] = 'updated_at';
    expressionAttributeValues[':updated_at'] = this.getCurrentTimestamp();

    if (updateExpressions.length === 1) {
      // Only updated_at was set, nothing to update
      return this.getByTeamId({ team_id: input.team_id });
    }

    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    const updatedItem = await this.updateItem(
      { pk: input.team_id },
      updateExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      'attribute_exists(pk)' // Ensure team exists
    );

    if (!updatedItem) {
      return null;
    }

    // Return without DynamoDB metadata
    const { pk, entity_type, ...teamRoster } = updatedItem;
    return teamRoster as TeamRoster;
  }

  /**
   * Delete a team roster
   */
  async delete(teamId: string): Promise<void> {
    await this.deleteItem(
      { pk: teamId },
      'attribute_exists(pk)' // Ensure team exists
    );
  }

  /**
   * List all team rosters (use with caution - consider pagination)
   */
  async listAll(limit?: number, lastEvaluatedKey?: Record<string, any>): Promise<{
    teams: TeamRoster[];
    lastEvaluatedKey?: Record<string, any>;
    count: number;
  }> {
    const result = await this.scanItems(
      '#entity_type = :entity_type',
      { '#entity_type': 'entity_type' },
      { ':entity_type': 'team_roster' },
      undefined,
      limit,
      lastEvaluatedKey
    );

    const teams = result.items.map(item => {
      const { pk, entity_type, ...teamRoster } = item;
      return teamRoster as TeamRoster;
    });

    return {
      teams,
      lastEvaluatedKey: result.last_evaluated_key,
      count: result.count,
    };
  }

  /**
   * Get teams by leader persona ID
   */
  async getByLeaderPersonaId(leaderPersonaId: string, limit?: number): Promise<TeamRoster[]> {
    const result = await this.scanItems(
      '#entity_type = :entity_type AND #leader_persona_id = :leader_persona_id',
      { 
        '#entity_type': 'entity_type',
        '#leader_persona_id': 'leader_persona_id'
      },
      { 
        ':entity_type': 'team_roster',
        ':leader_persona_id': leaderPersonaId
      },
      undefined,
      limit
    );

    return result.items.map(item => {
      const { pk, entity_type, ...teamRoster } = item;
      return teamRoster as TeamRoster;
    });
  }

  /**
   * Check if a user is a member of a team
   */
  async isUserMemberOfTeam(teamId: string, userId: string): Promise<boolean> {
    const team = await this.getByTeamId({ team_id: teamId });
    
    if (!team) {
      return false;
    }

    return team.members.some(member => member.user_id === userId);
  }

  /**
   * Get user's teams
   */
  async getUserTeams(userId: string): Promise<TeamRoster[]> {
    const result = await this.scanItems(
      '#entity_type = :entity_type',
      { '#entity_type': 'entity_type' },
      { ':entity_type': 'team_roster' }
    );

    // Filter teams where user is a member
    return result.items
      .filter(item => item.members.some(member => member.user_id === userId))
      .map(item => {
        const { pk, entity_type, ...teamRoster } = item;
        return teamRoster as TeamRoster;
      });
  }
}