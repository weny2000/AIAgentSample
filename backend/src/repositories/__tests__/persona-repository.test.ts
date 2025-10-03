import { PersonaRepository } from '../persona-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('PersonaRepository', () => {
  let repository: PersonaRepository;

  beforeEach(() => {
    ddbMock.reset();
    repository = new PersonaRepository();
  });

  describe('getPersonaById', () => {
    it('should retrieve a persona by ID successfully', async () => {
      const mockPersona = {
        persona_id: 'persona-123',
        name: 'Test Leader',
        leadership_style: 'collaborative',
        decision_patterns: ['data-driven', 'team-consensus'],
        escalation_criteria: ['critical-issues', 'budget-decisions'],
        team_preferences: {
          communication_style: 'direct',
          meeting_frequency: 'weekly',
        },
        version: 1,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockPersona,
      });

      const result = await repository.getPersonaById('persona-123');

      expect(result).toEqual(mockPersona);
      expect(ddbMock.commandCalls(GetCommand)).toHaveLength(1);
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: 'personas',
        Key: { persona_id: 'persona-123' },
      });
    });

    it('should return null when persona is not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.getPersonaById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle DynamoDB errors', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getPersonaById('persona-123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('createPersona', () => {
    it('should create a new persona successfully', async () => {
      const newPersona = {
        name: 'New Leader',
        leadership_style: 'directive',
        decision_patterns: ['quick-decisions'],
        escalation_criteria: ['all-issues'],
        team_preferences: {
          communication_style: 'formal',
          meeting_frequency: 'daily',
        },
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await repository.createPersona(newPersona);

      expect(result.persona_id).toBeDefined();
      expect(result.name).toBe(newPersona.name);
      expect(result.version).toBe(1);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();

      expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = ddbMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.TableName).toBe('personas');
      expect(putCall.args[0].input.Item.name).toBe(newPersona.name);
    });

    it('should handle creation errors', async () => {
      ddbMock.on(PutCommand).rejects(new Error('Creation failed'));

      const newPersona = {
        name: 'Test Leader',
        leadership_style: 'collaborative',
        decision_patterns: [],
        escalation_criteria: [],
        team_preferences: {},
      };

      await expect(repository.createPersona(newPersona)).rejects.toThrow('Creation failed');
    });
  });

  describe('updatePersona', () => {
    it('should update an existing persona successfully', async () => {
      const updates = {
        name: 'Updated Leader',
        leadership_style: 'transformational',
      };

      const mockUpdatedPersona = {
        persona_id: 'persona-123',
        name: 'Updated Leader',
        leadership_style: 'transformational',
        decision_patterns: ['data-driven'],
        escalation_criteria: ['critical-issues'],
        team_preferences: {},
        version: 2,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedPersona,
      });

      const result = await repository.updatePersona('persona-123', updates);

      expect(result).toEqual(mockUpdatedPersona);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    });

    it('should handle update errors', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('Update failed'));

      await expect(repository.updatePersona('persona-123', { name: 'New Name' }))
        .rejects.toThrow('Update failed');
    });
  });

  describe('deletePersona', () => {
    it('should delete a persona successfully', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.deletePersona('persona-123');

      expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
      expect(ddbMock.commandCalls(DeleteCommand)[0].args[0].input).toEqual({
        TableName: 'personas',
        Key: { persona_id: 'persona-123' },
      });
    });

    it('should handle deletion errors', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('Deletion failed'));

      await expect(repository.deletePersona('persona-123')).rejects.toThrow('Deletion failed');
    });
  });

  describe('listPersonas', () => {
    it('should list all personas successfully', async () => {
      const mockPersonas = [
        {
          persona_id: 'persona-1',
          name: 'Leader 1',
          leadership_style: 'collaborative',
          version: 1,
        },
        {
          persona_id: 'persona-2',
          name: 'Leader 2',
          leadership_style: 'directive',
          version: 1,
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockPersonas,
      });

      const result = await repository.listPersonas();

      expect(result).toEqual(mockPersonas);
      expect(ddbMock.commandCalls(ScanCommand)).toHaveLength(1);
      expect(ddbMock.commandCalls(ScanCommand)[0].args[0].input.TableName).toBe('personas');
    });

    it('should handle empty results', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });

      const result = await repository.listPersonas();

      expect(result).toEqual([]);
    });

    it('should handle scan errors', async () => {
      ddbMock.on(ScanCommand).rejects(new Error('Scan failed'));

      await expect(repository.listPersonas()).rejects.toThrow('Scan failed');
    });
  });
});