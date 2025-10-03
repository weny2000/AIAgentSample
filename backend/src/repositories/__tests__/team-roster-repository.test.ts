import { TeamRosterRepository } from '../team-roster-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('TeamRosterRepository', () => {
  let repository: TeamRosterRepository;

  beforeEach(() => {
    ddbMock.reset();
    repository = new TeamRosterRepository();
  });

  describe('getTeamRoster', () => {
    it('should retrieve a team roster successfully', async () => {
      const mockRoster = {
        team_id: 'team-123',
        members: [
          {
            user_id: 'user-1',
            role: 'developer',
            contact: 'user1@example.com',
            permissions: ['read', 'write'],
          },
          {
            user_id: 'user-2',
            role: 'lead',
            contact: 'user2@example.com',
            permissions: ['read', 'write', 'admin'],
          },
        ],
        leader_persona_id: 'persona-123',
        policies: ['policy-1', 'policy-2'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockRoster,
      });

      const result = await repository.getTeamRoster('team-123');

      expect(result).toEqual(mockRoster);
      expect(ddbMock.commandCalls(GetCommand)).toHaveLength(1);
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: 'team_roster',
        Key: { team_id: 'team-123' },
      });
    });

    it('should return null when team roster is not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.getTeamRoster('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle DynamoDB errors', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getTeamRoster('team-123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('createTeamRoster', () => {
    it('should create a new team roster successfully', async () => {
      const newRoster = {
        team_id: 'team-456',
        members: [
          {
            user_id: 'user-3',
            role: 'developer',
            contact: 'user3@example.com',
            permissions: ['read'],
          },
        ],
        leader_persona_id: 'persona-456',
        policies: ['policy-3'],
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.createTeamRoster(newRoster);

      expect(result.team_id).toBe(newRoster.team_id);
      expect(result.members).toEqual(newRoster.members);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = ddbMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.TableName).toBe('team_roster');
      expect(putCall.args[0].input.Item.team_id).toBe(newRoster.team_id);
    });

    it('should handle creation errors', async () => {
      ddbMock.on(PutCommand).rejects(new Error('Creation failed'));

      const newRoster = {
        team_id: 'team-456',
        members: [],
        leader_persona_id: 'persona-456',
        policies: [],
      };

      await expect(repository.createTeamRoster(newRoster)).rejects.toThrow('Creation failed');
    });
  });

  describe('updateTeamRoster', () => {
    it('should update an existing team roster successfully', async () => {
      const updates = {
        leader_persona_id: 'persona-789',
        policies: ['policy-1', 'policy-4'],
      };

      const mockUpdatedRoster = {
        team_id: 'team-123',
        members: [],
        leader_persona_id: 'persona-789',
        policies: ['policy-1', 'policy-4'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedRoster,
      });

      const result = await repository.updateTeamRoster('team-123', updates);

      expect(result).toEqual(mockUpdatedRoster);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    });

    it('should handle update errors', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('Update failed'));

      await expect(repository.updateTeamRoster('team-123', { policies: ['new-policy'] }))
        .rejects.toThrow('Update failed');
    });
  });

  describe('addTeamMember', () => {
    it('should add a member to the team successfully', async () => {
      const newMember = {
        user_id: 'user-4',
        role: 'tester',
        contact: 'user4@example.com',
        permissions: ['read'],
      };

      const mockUpdatedRoster = {
        team_id: 'team-123',
        members: [newMember],
        leader_persona_id: 'persona-123',
        policies: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedRoster,
      });

      const result = await repository.addTeamMember('team-123', newMember);

      expect(result).toEqual(mockUpdatedRoster);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    });

    it('should handle add member errors', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('Add member failed'));

      const newMember = {
        user_id: 'user-4',
        role: 'tester',
        contact: 'user4@example.com',
        permissions: ['read'],
      };

      await expect(repository.addTeamMember('team-123', newMember))
        .rejects.toThrow('Add member failed');
    });
  });

  describe('removeTeamMember', () => {
    it('should remove a member from the team successfully', async () => {
      const mockUpdatedRoster = {
        team_id: 'team-123',
        members: [],
        leader_persona_id: 'persona-123',
        policies: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedRoster,
      });

      const result = await repository.removeTeamMember('team-123', 'user-1');

      expect(result).toEqual(mockUpdatedRoster);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    });

    it('should handle remove member errors', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('Remove member failed'));

      await expect(repository.removeTeamMember('team-123', 'user-1'))
        .rejects.toThrow('Remove member failed');
    });
  });

  describe('listTeamRosters', () => {
    it('should list all team rosters successfully', async () => {
      const mockRosters = [
        {
          team_id: 'team-1',
          members: [],
          leader_persona_id: 'persona-1',
          policies: [],
        },
        {
          team_id: 'team-2',
          members: [],
          leader_persona_id: 'persona-2',
          policies: [],
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockRosters,
      });

      const result = await repository.listTeamRosters();

      expect(result).toEqual(mockRosters);
      expect(ddbMock.commandCalls(ScanCommand)).toHaveLength(1);
      expect(ddbMock.commandCalls(ScanCommand)[0].args[0].input.TableName).toBe('team_roster');
    });

    it('should handle empty results', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });

      const result = await repository.listTeamRosters();

      expect(result).toEqual([]);
    });

    it('should handle scan errors', async () => {
      ddbMock.on(ScanCommand).rejects(new Error('Scan failed'));

      await expect(repository.listTeamRosters()).rejects.toThrow('Scan failed');
    });
  });
});