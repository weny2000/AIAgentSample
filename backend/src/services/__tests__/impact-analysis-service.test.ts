import { ImpactAnalysisService } from '../impact-analysis-service.js';
import { ServiceRepository } from '../../repositories/service-repository.js';
import { DependencyRepository } from '../../repositories/dependency-repository.js';
import { TeamRosterRepository } from '../../repositories/team-roster-repository.js';
import { DatabaseConnection } from '../../database/connection.js';

// Mock the repositories
jest.mock('../../repositories/service-repository.js');
jest.mock('../../repositories/dependency-repository.js');
jest.mock('../../repositories/team-roster-repository.js');
jest.mock('../../database/connection.js');

describe('ImpactAnalysisService', () => {
  let service: ImpactAnalysisService;
  let mockDb: jest.Mocked<DatabaseConnection>;
  let mockServiceRepo: jest.Mocked<ServiceRepository>;
  let mockDependencyRepo: jest.Mocked<DependencyRepository>;
  let mockTeamRosterRepo: jest.Mocked<TeamRosterRepository>;

  beforeEach(() => {
    mockDb = new DatabaseConnection() as jest.Mocked<DatabaseConnection>;
    mockServiceRepo = new ServiceRepository(mockDb) as jest.Mocked<ServiceRepository>;
    mockDependencyRepo = new DependencyRepository(mockDb) as jest.Mocked<DependencyRepository>;
    mockTeamRosterRepo = new TeamRosterRepository(mockDb) as jest.Mocked<TeamRosterRepository>;

    service = new ImpactAnalysisService(mockDb);
    
    // Replace the repositories with mocks
    (service as any).serviceRepository = mockServiceRepo;
    (service as any).dependencyRepository = mockDependencyRepo;
    (service as any).teamRosterRepository = mockTeamRosterRepo;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeImpact', () => {
    const mockService = {
      id: 'service-1',
      name: 'User Service',
      team_id: 'team-alpha',
      description: 'Main user service',
      service_type: 'api',
      status: 'active' as const,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    const mockDependencyAnalysis = {
      downstream: [
        {
          service_id: 'service-2',
          service_name: 'Order Service',
          team_id: 'team-beta',
          depth: 1,
          path: ['service-1', 'service-2'],
          criticality: 'high'
        },
        {
          service_id: 'service-3',
          service_name: 'Notification Service',
          team_id: 'team-gamma',
          depth: 2,
          path: ['service-1', 'service-2', 'service-3'],
          criticality: 'medium'
        }
      ],
      upstream: [
        {
          service_id: 'service-4',
          service_name: 'Auth Service',
          team_id: 'team-delta',
          depth: 1,
          path: ['service-4', 'service-1'],
          criticality: 'critical'
        }
      ]
    };

    const mockTeamRoster = {
      team_id: 'team-beta',
      members: [
        { user_id: 'user-1', role: 'lead', contact: 'user1@example.com', permissions: [] },
        { user_id: 'user-2', role: 'developer', contact: 'user2@example.com', permissions: [] }
      ],
      leader_persona_id: 'persona-1',
      policies: [],
      created_at: new Date(),
      updated_at: new Date()
    };

    beforeEach(() => {
      mockServiceRepo.getById.mockResolvedValue(mockService);
      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockDependencyAnalysis);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue({ cycles: [] });
      mockDependencyRepo.list.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
        has_more: false
      });
      mockTeamRosterRepo.getByTeamId.mockResolvedValue(mockTeamRoster);
    });

    it('should perform full impact analysis successfully', async () => {
      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result).toBeDefined();
      expect(result.service_id).toBe('service-1');
      expect(result.service_name).toBe('User Service');
      expect(result.team_id).toBe('team-alpha');
      expect(result.analysis_type).toBe('full');
      expect(result.affected_services).toHaveLength(3);
      expect(result.risk_assessment).toBeDefined();
      expect(result.stakeholders).toBeDefined();
      expect(result.mitigation_strategies).toBeDefined();
      expect(result.visualization_data).toBeDefined();
    });

    it('should perform downstream-only analysis', async () => {
      const result = await service.analyzeImpact('service-1', 'downstream', 3);

      expect(result.analysis_type).toBe('downstream');
      expect(result.affected_services).toHaveLength(2); // Only downstream services
      expect(result.affected_services.every(s => s.dependency_types.includes('downstream'))).toBe(true);
    });

    it('should perform upstream-only analysis', async () => {
      const result = await service.analyzeImpact('service-1', 'upstream', 3);

      expect(result.analysis_type).toBe('upstream');
      expect(result.affected_services).toHaveLength(1); // Only upstream services
      expect(result.affected_services.every(s => s.dependency_types.includes('upstream'))).toBe(true);
    });

    it('should throw error for non-existent service', async () => {
      mockServiceRepo.getById.mockResolvedValue(null);

      await expect(service.analyzeImpact('non-existent', 'full', 3))
        .rejects.toThrow('Service not found: non-existent');
    });

    it('should calculate impact scores correctly', async () => {
      const result = await service.analyzeImpact('service-1', 'full', 3);

      const criticalService = result.affected_services.find(s => s.service_name === 'Auth Service');
      const highService = result.affected_services.find(s => s.service_name === 'Order Service');
      const mediumService = result.affected_services.find(s => s.service_name === 'Notification Service');

      expect(criticalService?.estimated_impact_score).toBeGreaterThan(highService?.estimated_impact_score || 0);
      expect(highService?.estimated_impact_score).toBeGreaterThan(mediumService?.estimated_impact_score || 0);
    });

    it('should identify direct vs indirect impacts', async () => {
      const result = await service.analyzeImpact('service-1', 'full', 3);

      const directImpacts = result.affected_services.filter(s => s.impact_type === 'direct');
      const indirectImpacts = result.affected_services.filter(s => s.impact_type === 'indirect');

      expect(directImpacts).toHaveLength(2); // Auth Service and Order Service (depth 1)
      expect(indirectImpacts).toHaveLength(1); // Notification Service (depth 2)
    });
  });

  describe('risk assessment', () => {
    const mockService = {
      id: 'service-1',
      name: 'Critical Service',
      team_id: 'team-alpha',
      description: 'Critical service',
      service_type: 'api',
      status: 'active' as const,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    beforeEach(() => {
      mockServiceRepo.getById.mockResolvedValue(mockService);
      mockDependencyRepo.list.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
        has_more: false
      });
    });

    it('should assess high risk for critical services', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Critical Service 2',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'critical'
          }
        ],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue({ cycles: [] });

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.risk_assessment.overall_risk_level).toBe('critical');
      expect(result.risk_assessment.risk_factors).toContainEqual(
        expect.objectContaining({
          type: 'critical_service',
          severity: 'critical'
        })
      );
    });

    it('should detect circular dependencies', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Service 2',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'medium'
          }
        ],
        upstream: []
      };

      const mockCircularDeps = {
        cycles: [
          {
            services: ['service-1', 'service-2', 'service-1'],
            dependencies: ['dep-1', 'dep-2', 'dep-3']
          }
        ]
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue(mockCircularDeps);

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.risk_assessment.risk_factors).toContainEqual(
        expect.objectContaining({
          type: 'circular_dependency',
          severity: 'high'
        })
      );
    });

    it('should assess cross-team impact risk', async () => {
      const mockAnalysis = {
        downstream: Array.from({ length: 8 }, (_, i) => ({
          service_id: `service-${i + 2}`,
          service_name: `Service ${i + 2}`,
          team_id: `team-${String.fromCharCode(98 + i)}`, // team-b, team-c, etc.
          depth: 1,
          path: ['service-1', `service-${i + 2}`],
          criticality: 'medium'
        })),
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue({ cycles: [] });

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.risk_assessment.risk_factors).toContainEqual(
        expect.objectContaining({
          type: 'cross_team',
          severity: 'high'
        })
      );
      expect(result.risk_assessment.cross_team_impact_count).toBe(8);
    });
  });

  describe('stakeholder identification', () => {
    const mockService = {
      id: 'service-1',
      name: 'Service 1',
      team_id: 'team-alpha',
      description: 'Service 1',
      service_type: 'api',
      status: 'active' as const,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    const mockTeamRoster = {
      team_id: 'team-beta',
      members: [
        { user_id: 'user-1', role: 'lead', contact: 'lead@example.com', permissions: [] },
        { user_id: 'user-2', role: 'developer', contact: 'dev@example.com', permissions: [] }
      ],
      leader_persona_id: 'persona-1',
      policies: [],
      created_at: new Date(),
      updated_at: new Date()
    };

    beforeEach(() => {
      mockServiceRepo.getById.mockResolvedValue(mockService);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue({ cycles: [] });
      mockDependencyRepo.list.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
        has_more: false
      });
      mockTeamRosterRepo.getByTeamId.mockResolvedValue(mockTeamRoster);
    });

    it('should identify stakeholders correctly', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Critical Service',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'critical'
          }
        ],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.stakeholders).toHaveLength(1);
      expect(result.stakeholders[0]).toMatchObject({
        team_id: 'team-beta',
        role: 'dependent',
        priority: 'high',
        contact_info: ['lead@example.com', 'dev@example.com']
      });
    });

    it('should prioritize stakeholders by impact', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Critical Service',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'critical'
          },
          {
            service_id: 'service-3',
            service_name: 'Low Impact Service',
            team_id: 'team-gamma',
            depth: 3,
            path: ['service-1', 'service-2', 'service-3'],
            criticality: 'low'
          }
        ],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);
      
      // Mock different team rosters
      mockTeamRosterRepo.getByTeamId.mockImplementation(async (teamId) => {
        if (teamId === 'team-beta') {
          return mockTeamRoster;
        } else if (teamId === 'team-gamma') {
          return {
            ...mockTeamRoster,
            team_id: 'team-gamma',
            members: [{ user_id: 'user-3', role: 'developer', contact: 'dev3@example.com', permissions: [] }]
          };
        }
        return null;
      });

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.stakeholders).toHaveLength(2);
      expect(result.stakeholders[0].priority).toBe('high'); // Critical service team
      expect(result.stakeholders[1].priority).toBe('low');  // Low impact service team
    });
  });

  describe('mitigation strategies', () => {
    const mockService = {
      id: 'service-1',
      name: 'Service 1',
      team_id: 'team-alpha',
      description: 'Service 1',
      service_type: 'api',
      status: 'active' as const,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    beforeEach(() => {
      mockServiceRepo.getById.mockResolvedValue(mockService);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue({ cycles: [] });
      mockDependencyRepo.list.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
        has_more: false
      });
      mockTeamRosterRepo.getByTeamId.mockResolvedValue(null);
    });

    it('should generate communication strategy for cross-team impacts', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Service 2',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'medium'
          }
        ],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);

      const result = await service.analyzeImpact('service-1', 'full', 3);

      const communicationStrategy = result.mitigation_strategies.find(s => s.strategy_type === 'communication');
      expect(communicationStrategy).toBeDefined();
      expect(communicationStrategy?.priority).toBe('high');
      expect(communicationStrategy?.action_items).toContain('Send impact analysis to all affected team leads');
    });

    it('should generate technical strategy for critical services', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Critical Service',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'critical'
          }
        ],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);

      const result = await service.analyzeImpact('service-1', 'full', 3);

      const technicalStrategy = result.mitigation_strategies.find(s => s.strategy_type === 'technical');
      expect(technicalStrategy).toBeDefined();
      expect(technicalStrategy?.priority).toBe('high');
      expect(technicalStrategy?.action_items).toContain('Implement circuit breakers and fallback mechanisms');
    });

    it('should generate process strategy for high-risk changes', async () => {
      const mockAnalysis = {
        downstream: Array.from({ length: 15 }, (_, i) => ({
          service_id: `service-${i + 2}`,
          service_name: `Service ${i + 2}`,
          team_id: `team-${String.fromCharCode(98 + i)}`,
          depth: 1,
          path: ['service-1', `service-${i + 2}`],
          criticality: 'medium'
        })),
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);

      const result = await service.analyzeImpact('service-1', 'full', 3);

      const processStrategy = result.mitigation_strategies.find(s => s.strategy_type === 'process');
      expect(processStrategy).toBeDefined();
      expect(processStrategy?.priority).toBe('high');
      expect(processStrategy?.action_items).toContain('Require additional approval from affected team leads');
    });

    it('should always generate rollback strategy', async () => {
      const mockAnalysis = {
        downstream: [],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);

      const result = await service.analyzeImpact('service-1', 'full', 3);

      const rollbackStrategy = result.mitigation_strategies.find(s => s.strategy_type === 'rollback');
      expect(rollbackStrategy).toBeDefined();
      expect(rollbackStrategy?.action_items).toContain('Document current state and dependencies');
    });
  });

  describe('visualization data', () => {
    const mockService = {
      id: 'service-1',
      name: 'Service 1',
      team_id: 'team-alpha',
      description: 'Service 1',
      service_type: 'api',
      status: 'active' as const,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    beforeEach(() => {
      mockServiceRepo.getById.mockResolvedValue(mockService);
      mockDependencyRepo.findCircularDependencies.mockResolvedValue({ cycles: [] });
      mockTeamRosterRepo.getByTeamId.mockResolvedValue(null);
    });

    it('should create visualization data with nodes and edges', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Service 2',
            team_id: 'team-beta',
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'medium'
          }
        ],
        upstream: []
      };

      const mockDependencies = [
        {
          id: 'dep-1',
          source_service_id: 'service-1',
          target_service_id: 'service-2',
          dependency_type: 'api',
          criticality: 'medium' as const,
          description: 'API dependency',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);
      mockDependencyRepo.list.mockResolvedValue({
        data: mockDependencies,
        total: 1,
        limit: 50,
        offset: 0,
        has_more: false
      });

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.visualization_data.nodes).toHaveLength(2); // Root service + affected service
      expect(result.visualization_data.edges).toHaveLength(1);
      expect(result.visualization_data.clusters).toHaveLength(2); // Two teams

      const rootNode = result.visualization_data.nodes.find(n => n.id === 'service-1');
      expect(rootNode?.metadata.isRoot).toBe(true);
    });

    it('should group services by team in clusters', async () => {
      const mockAnalysis = {
        downstream: [
          {
            service_id: 'service-2',
            service_name: 'Service 2',
            team_id: 'team-alpha', // Same team as root
            depth: 1,
            path: ['service-1', 'service-2'],
            criticality: 'medium'
          },
          {
            service_id: 'service-3',
            service_name: 'Service 3',
            team_id: 'team-beta', // Different team
            depth: 1,
            path: ['service-1', 'service-3'],
            criticality: 'medium'
          }
        ],
        upstream: []
      };

      mockDependencyRepo.getImpactAnalysis.mockResolvedValue(mockAnalysis);
      mockDependencyRepo.list.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
        has_more: false
      });

      const result = await service.analyzeImpact('service-1', 'full', 3);

      expect(result.visualization_data.clusters).toHaveLength(2);
      
      const alphaCluster = result.visualization_data.clusters.find(c => c.team_id === 'team-alpha');
      const betaCluster = result.visualization_data.clusters.find(c => c.team_id === 'team-beta');
      
      expect(alphaCluster?.services).toContain('service-1');
      expect(alphaCluster?.services).toContain('service-2');
      expect(betaCluster?.services).toContain('service-3');
    });
  });
});