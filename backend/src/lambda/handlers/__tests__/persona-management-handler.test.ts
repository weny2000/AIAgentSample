import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  createPersonaHandler,
  updatePersonaHandler,
  getPersonaHandler,
  approvePersonaHandler,
  personaQueryHandler
} from '../persona-management-handler';
import { PersonaService } from '../../../services/persona-service';
import { LeadershipStyle, DecisionMakingApproach } from '../../../models/persona';

// Mock the PersonaService
jest.mock('../../../services/persona-service');
jest.mock('../../../repositories/persona-repository');

// Mock environment variables
process.env.PERSONA_CONFIG_TABLE_NAME = 'test-persona-table';
process.env.AWS_REGION = 'us-east-1';

describe('Persona Management Handlers', () => {
  let mockPersonaService: jest.Mocked<PersonaService>;
  let mockEvent: APIGatewayProxyEvent;
  let mockContext: Context;

  const mockUser = {
    user_id: 'user-123',
    team_id: 'team-456',
    role: 'leader',
    email: 'test@example.com'
  };

  const mockPersona = {
    id: 'persona-123',
    leader_id: 'user-123',
    team_id: 'team-456',
    name: 'Test Persona',
    description: 'A test persona',
    leadership_style: LeadershipStyle.COLLABORATIVE,
    decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
    escalation_criteria: {
      budget_threshold: 5000,
      team_size_threshold: 10,
      risk_level_threshold: 'high' as const,
      decision_types: ['hiring'],
      keywords: ['urgent'],
      always_escalate_to_leader: false
    },
    common_decisions: [],
    team_rules: [],
    communication_preferences: {
      tone: 'friendly' as const,
      verbosity: 'detailed' as const,
      preferred_channels: ['slack'],
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
    mockPersonaService = {
      createPersona: jest.fn(),
      updatePersona: jest.fn(),
      getPersonaById: jest.fn(),
      getActivePersonaByLeader: jest.fn(),
      getActivePersonaByTeam: jest.fn(),
      getPersonasByLeader: jest.fn(),
      approvePersona: jest.fn(),
      deactivatePersona: jest.fn(),
      generatePersonaResponse: jest.fn(),
      searchPersonas: jest.fn(),
      getPersonaVersionHistory: jest.fn()
    } as any;

    mockEvent = {
      httpMethod: 'POST',
      path: '/admin/persona',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/json'
      },
      requestContext: {
        requestId: 'test-request-id',
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:team_id': 'team-456',
            'custom:role': 'leader',
            email: 'test@example.com'
          }
        }
      } as any,
      body: null,
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      isBase64Encoded: false,
      stageVariables: null,
      resource: '',
      multiValueHeaders: {}
    };

    mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      memoryLimitInMB: '128',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test-function',
      logStreamName: '2024/01/01/[$LATEST]test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn()
    };

    jest.clearAllMocks();
  });

  describe('createPersonaHandler', () => {
    it('should create persona successfully', async () => {
      const personaRequest = {
        leader_id: 'user-123',
        team_id: 'team-456',
        name: 'Test Persona',
        leadership_style: LeadershipStyle.COLLABORATIVE,
        decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
        escalation_criteria: {
          budget_threshold: 5000,
          decision_types: ['hiring'],
          keywords: ['urgent'],
          always_escalate_to_leader: false
        },
        common_decisions: [],
        team_rules: [],
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

      mockEvent.body = JSON.stringify(personaRequest);

      const mockResponse = {
        persona: mockPersona,
        requires_approval: false
      };

      mockPersonaService.createPersona.mockResolvedValue(mockResponse);

      const result = await createPersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(JSON.parse(result.body).data).toEqual(mockResponse);
      expect(mockPersonaService.createPersona).toHaveBeenCalledWith(
        'user-123',
        'team-456',
        expect.objectContaining({ name: 'Test Persona' }),
        'user-123'
      );
    });

    it('should return 400 for missing required fields', async () => {
      mockEvent.body = JSON.stringify({
        name: 'Test Persona'
        // Missing leader_id and team_id
      });

      const result = await createPersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('leader_id and team_id are required');
    });

    it('should return 403 for unauthorized user', async () => {
      mockEvent.requestContext.authorizer!.claims.sub = 'different-user';
      mockEvent.body = JSON.stringify({
        leader_id: 'user-123',
        team_id: 'team-456',
        name: 'Test Persona'
      });

      const result = await createPersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('You can only create personas for yourself');
    });

    it('should allow admin to create persona for anyone', async () => {
      mockEvent.requestContext.authorizer!.claims['custom:role'] = 'admin';
      mockEvent.body = JSON.stringify({
        leader_id: 'different-user',
        team_id: 'team-456',
        name: 'Test Persona',
        leadership_style: LeadershipStyle.COLLABORATIVE,
        decision_making_approach: DecisionMakingApproach.CONSULTATIVE,
        escalation_criteria: {
          decision_types: [],
          keywords: [],
          always_escalate_to_leader: false
        },
        common_decisions: [],
        team_rules: [],
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
      });

      const mockResponse = {
        persona: { ...mockPersona, leader_id: 'different-user' },
        requires_approval: false
      };

      mockPersonaService.createPersona.mockResolvedValue(mockResponse);

      const result = await createPersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockPersonaService.createPersona).toHaveBeenCalledWith(
        'different-user',
        'team-456',
        expect.any(Object),
        'user-123'
      );
    });
  });

  describe('updatePersonaHandler', () => {
    it('should update persona successfully', async () => {
      mockEvent.httpMethod = 'PUT';
      mockEvent.pathParameters = { personaId: 'persona-123' };
      mockEvent.body = JSON.stringify({
        name: 'Updated Persona',
        leadership_style: LeadershipStyle.DIRECTIVE,
        decision_making_approach: DecisionMakingApproach.AUTOCRATIC,
        escalation_criteria: {
          decision_types: [],
          keywords: [],
          always_escalate_to_leader: false
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
            low_priority: 'within 12 hours'
          }
        }
      });

      const updatedPersona = {
        ...mockPersona,
        name: 'Updated Persona',
        version: 2
      };

      const mockResponse = {
        persona: updatedPersona,
        requires_approval: false
      };

      mockPersonaService.getPersonaById.mockResolvedValue(mockPersona);
      mockPersonaService.updatePersona.mockResolvedValue(mockResponse);

      const result = await updatePersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(JSON.parse(result.body).data.persona.name).toBe('Updated Persona');
      expect(mockPersonaService.updatePersona).toHaveBeenCalledWith(
        'persona-123',
        expect.objectContaining({ name: 'Updated Persona' }),
        'user-123'
      );
    });

    it('should return 404 for non-existent persona', async () => {
      mockEvent.pathParameters = { personaId: 'nonexistent-id' };
      mockEvent.body = JSON.stringify({ name: 'Updated Name' });

      mockPersonaService.getPersonaById.mockResolvedValue(null);

      const result = await updatePersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('Persona not found');
    });
  });

  describe('getPersonaHandler', () => {
    it('should get persona successfully', async () => {
      mockEvent.httpMethod = 'GET';
      mockEvent.pathParameters = { personaId: 'persona-123' };

      mockPersonaService.getPersonaById.mockResolvedValue(mockPersona);

      const result = await getPersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(JSON.parse(result.body).data).toEqual(mockPersona);
    });

    it('should return 403 for unauthorized access', async () => {
      mockEvent.pathParameters = { personaId: 'persona-123' };
      
      const differentPersona = {
        ...mockPersona,
        leader_id: 'different-user',
        team_id: 'different-team'
      };

      mockPersonaService.getPersonaById.mockResolvedValue(differentPersona);

      const result = await getPersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('You do not have access to this persona');
    });
  });

  describe('approvePersonaHandler', () => {
    it('should approve persona successfully as admin', async () => {
      mockEvent.httpMethod = 'POST';
      mockEvent.pathParameters = { personaId: 'persona-123' };
      mockEvent.requestContext.authorizer!.claims['custom:role'] = 'admin';

      const approvedPersona = {
        ...mockPersona,
        approved_by: 'user-123',
        approved_at: '2024-01-02T00:00:00Z'
      };

      mockPersonaService.approvePersona.mockResolvedValue(approvedPersona);

      const result = await approvePersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(JSON.parse(result.body).data.approved_by).toBe('user-123');
      expect(mockPersonaService.approvePersona).toHaveBeenCalledWith('persona-123', 'user-123');
    });

    it('should return 403 for non-admin user', async () => {
      mockEvent.pathParameters = { personaId: 'persona-123' };
      // User role is 'leader', not 'admin'

      const result = await approvePersonaHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('Only administrators can approve');
    });
  });

  describe('personaQueryHandler', () => {
    it('should process persona query successfully', async () => {
      mockEvent.body = JSON.stringify({
        query: 'How should I handle code reviews?',
        team_id: 'team-456',
        context: { priority: 'normal' }
      });

      const mockQueryResponse = {
        response: 'Please ensure all tests pass and get peer review before merging.',
        confidence_score: 0.9,
        sources: ['Persona: Test Persona - Common Decision Pattern'],
        escalation_required: false,
        persona_used: {
          id: 'persona-123',
          name: 'Test Persona',
          version: 1
        }
      };

      mockPersonaService.generatePersonaResponse.mockResolvedValue(mockQueryResponse);

      const result = await personaQueryHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
      expect(JSON.parse(result.body).data).toEqual(mockQueryResponse);
      expect(mockPersonaService.generatePersonaResponse).toHaveBeenCalledWith({
        query: 'How should I handle code reviews?',
        context: { priority: 'normal' },
        user_id: 'user-123',
        team_id: 'team-456'
      });
    });

    it('should return escalation response', async () => {
      mockEvent.body = JSON.stringify({
        query: 'Can we approve this $15000 expense?',
        team_id: 'team-456',
        context: { budget_amount: 15000 }
      });

      const mockQueryResponse = {
        response: 'This query requires escalation to your team leader. Reason: Budget amount exceeds threshold.',
        confidence_score: 1.0,
        sources: [],
        escalation_required: true,
        escalation_reason: 'Budget amount ($15000) exceeds threshold ($5000)',
        persona_used: {
          id: 'persona-123',
          name: 'Test Persona',
          version: 1
        }
      };

      mockPersonaService.generatePersonaResponse.mockResolvedValue(mockQueryResponse);

      const result = await personaQueryHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).data.escalation_required).toBe(true);
      expect(JSON.parse(result.body).data.escalation_reason).toContain('Budget amount');
    });

    it('should return 403 for unauthorized team access', async () => {
      mockEvent.body = JSON.stringify({
        query: 'test query',
        team_id: 'different-team'
      });

      const result = await personaQueryHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('You do not have access to this team');
    });

    it('should return 400 for missing required fields', async () => {
      mockEvent.body = JSON.stringify({
        query: 'test query'
        // Missing team_id
      });

      const result = await personaQueryHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).success).toBe(false);
      expect(JSON.parse(result.body).error.message).toContain('query and team_id are required');
    });
  });
});