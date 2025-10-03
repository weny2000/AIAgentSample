import { BaseEntity, DynamoDBItem, TimestampFields } from './index';

/**
 * Team member interface
 */
export interface TeamMember {
  user_id: string;
  role: string;
  contact: string;
  permissions: string[];
  joined_at?: string;
  status?: 'active' | 'inactive' | 'pending';
}

/**
 * Team roster interface
 */
export interface TeamRoster extends TimestampFields {
  team_id: string;
  members: TeamMember[];
  leader_persona_id: string;
  policies: string[];
  team_name?: string;
  department?: string;
  description?: string;
}

/**
 * DynamoDB item structure for team roster
 */
export interface TeamRosterItem extends TeamRoster, DynamoDBItem {
  pk: string; // team_id
  entity_type: 'team_roster';
}

/**
 * Input for creating team roster
 */
export interface CreateTeamRosterInput {
  team_id: string;
  members: TeamMember[];
  leader_persona_id: string;
  policies?: string[];
  team_name?: string;
  department?: string;
  description?: string;
}

/**
 * Input for updating team roster
 */
export interface UpdateTeamRosterInput {
  team_id: string;
  members?: TeamMember[];
  leader_persona_id?: string;
  policies?: string[];
  team_name?: string;
  department?: string;
  description?: string;
}

/**
 * Query parameters for team roster
 */
export interface QueryTeamRosterParams {
  team_id: string;
}