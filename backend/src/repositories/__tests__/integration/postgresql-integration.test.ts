import { Pool } from 'pg';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DependencyRepository } from '../../dependency-repository';
import { ServiceRepository } from '../../service-repository';
import { PolicyRepository } from '../../policy-repository';

describe('PostgreSQL Integration Tests', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let dependencyRepo: DependencyRepository;
  let serviceRepo: ServiceRepository;
  let policyRepo: PolicyRepository;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new GenericContainer('postgres:15')
      .withEnvironment({
        POSTGRES_DB: 'testdb',
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
      })
      .withExposedPorts(5432)
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);

    // Create connection pool
    pool = new Pool({
      host,
      port,
      database: 'testdb',
      user: 'testuser',
      password: 'testpass',
    });

    // Initialize repositories
    dependencyRepo = new DependencyRepository(pool);
    serviceRepo = new ServiceRepository(pool);
    policyRepo = new PolicyRepository(pool);

    // Create tables
    await createTables(pool);
  }, 60000);

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  beforeEach(async () => {
    // Clean up tables before each test
    await pool.query('TRUNCATE TABLE dependencies, services, policies RESTART IDENTITY CASCADE');
  });

  describe('Service Repository Integration', () => {
    it('should create and retrieve services', async () => {
      const serviceData = {
        name: 'user-service',
        team_id: 'backend-team',
        repository_url: 'https://github.com/company/user-service',
        description: 'User management service',
      };

      const createdService = await serviceRepo.createService(serviceData);

      expect(createdService.id).toBeDefined();
      expect(createdService.name).toBe(serviceData.name);
      expect(createdService.team_id).toBe(serviceData.team_id);

      const retrievedService = await serviceRepo.getServiceById(createdService.id);
      expect(retrievedService).toEqual(createdService);
    });

    it('should list services by team', async () => {
      const service1 = await serviceRepo.createService({
        name: 'service-1',
        team_id: 'team-a',
        repository_url: 'https://github.com/company/service-1',
        description: 'Service 1',
      });

      const service2 = await serviceRepo.createService({
        name: 'service-2',
        team_id: 'team-a',
        repository_url: 'https://github.com/company/service-2',
        description: 'Service 2',
      });

      const service3 = await serviceRepo.createService({
        name: 'service-3',
        team_id: 'team-b',
        repository_url: 'https://github.com/company/service-3',
        description: 'Service 3',
      });

      const teamAServices = await serviceRepo.getServicesByTeam('team-a');
      expect(teamAServices).toHaveLength(2);
      expect(teamAServices.map(s => s.name)).toContain('service-1');
      expect(teamAServices.map(s => s.name)).toContain('service-2');

      const teamBServices = await serviceRepo.getServicesByTeam('team-b');
      expect(teamBServices).toHaveLength(1);
      expect(teamBServices[0].name).toBe('service-3');
    });

    it('should update service information', async () => {
      const service = await serviceRepo.createService({
        name: 'test-service',
        team_id: 'test-team',
        repository_url: 'https://github.com/company/test-service',
        description: 'Original description',
      });

      const updates = {
        description: 'Updated description',
        repository_url: 'https://github.com/company/updated-test-service',
      };

      const updatedService = await serviceRepo.updateService(service.id, updates);

      expect(updatedService.description).toBe(updates.description);
      expect(updatedService.repository_url).toBe(updates.repository_url);
      expect(updatedService.name).toBe(service.name); // Unchanged
      expect(updatedService.team_id).toBe(service.team_id); // Unchanged
    });
  });

  describe('Dependency Repository Integration', () => {
    it('should create and retrieve dependencies', async () => {
      // Create services first
      const sourceService = await serviceRepo.createService({
        name: 'api-service',
        team_id: 'backend-team',
        repository_url: 'https://github.com/company/api-service',
        description: 'API service',
      });

      const targetService = await serviceRepo.createService({
        name: 'database-service',
        team_id: 'data-team',
        repository_url: 'https://github.com/company/database-service',
        description: 'Database service',
      });

      const dependencyData = {
        source_service_id: sourceService.id,
        target_service_id: targetService.id,
        dependency_type: 'database',
        criticality: 'high',
      };

      const createdDependency = await dependencyRepo.createDependency(dependencyData);

      expect(createdDependency.id).toBeDefined();
      expect(createdDependency.source_service_id).toBe(sourceService.id);
      expect(createdDependency.target_service_id).toBe(targetService.id);
      expect(createdDependency.dependency_type).toBe('database');
      expect(createdDependency.criticality).toBe('high');

      const retrievedDependency = await dependencyRepo.getDependencyById(createdDependency.id);
      expect(retrievedDependency).toEqual(createdDependency);
    });

    it('should get dependencies for a service', async () => {
      const service1 = await serviceRepo.createService({
        name: 'service-1',
        team_id: 'team-1',
        repository_url: 'https://github.com/company/service-1',
        description: 'Service 1',
      });

      const service2 = await serviceRepo.createService({
        name: 'service-2',
        team_id: 'team-2',
        repository_url: 'https://github.com/company/service-2',
        description: 'Service 2',
      });

      const service3 = await serviceRepo.createService({
        name: 'service-3',
        team_id: 'team-3',
        repository_url: 'https://github.com/company/service-3',
        description: 'Service 3',
      });

      // Create dependencies: service1 -> service2, service1 -> service3
      await dependencyRepo.createDependency({
        source_service_id: service1.id,
        target_service_id: service2.id,
        dependency_type: 'api',
        criticality: 'medium',
      });

      await dependencyRepo.createDependency({
        source_service_id: service1.id,
        target_service_id: service3.id,
        dependency_type: 'queue',
        criticality: 'low',
      });

      const dependencies = await dependencyRepo.getDependenciesForService(service1.id);
      expect(dependencies).toHaveLength(2);
      expect(dependencies.map(d => d.target_service_id)).toContain(service2.id);
      expect(dependencies.map(d => d.target_service_id)).toContain(service3.id);
    });

    it('should analyze impact of service changes', async () => {
      // Create a dependency chain: A -> B -> C
      const serviceA = await serviceRepo.createService({
        name: 'service-a',
        team_id: 'team-a',
        repository_url: 'https://github.com/company/service-a',
        description: 'Service A',
      });

      const serviceB = await serviceRepo.createService({
        name: 'service-b',
        team_id: 'team-b',
        repository_url: 'https://github.com/company/service-b',
        description: 'Service B',
      });

      const serviceC = await serviceRepo.createService({
        name: 'service-c',
        team_id: 'team-c',
        repository_url: 'https://github.com/company/service-c',
        description: 'Service C',
      });

      await dependencyRepo.createDependency({
        source_service_id: serviceA.id,
        target_service_id: serviceB.id,
        dependency_type: 'api',
        criticality: 'high',
      });

      await dependencyRepo.createDependency({
        source_service_id: serviceB.id,
        target_service_id: serviceC.id,
        dependency_type: 'database',
        criticality: 'critical',
      });

      const impactAnalysis = await dependencyRepo.analyzeImpact(serviceC.id, 2);

      expect(impactAnalysis.affected_services).toHaveLength(2);
      expect(impactAnalysis.affected_services.map(s => s.service_id)).toContain(serviceA.id);
      expect(impactAnalysis.affected_services.map(s => s.service_id)).toContain(serviceB.id);

      const serviceAImpact = impactAnalysis.affected_services.find(s => s.service_id === serviceA.id);
      expect(serviceAImpact?.depth).toBe(2);

      const serviceBImpact = impactAnalysis.affected_services.find(s => s.service_id === serviceB.id);
      expect(serviceBImpact?.depth).toBe(1);
    });
  });

  describe('Policy Repository Integration', () => {
    it('should create and retrieve policies', async () => {
      const policyData = {
        name: 'Security Policy',
        policy_json: {
          rules: [
            {
              id: 'sec-001',
              type: 'security',
              severity: 'high',
              description: 'No hardcoded secrets',
            },
          ],
        },
        version: 1,
        status: 'draft' as const,
      };

      const createdPolicy = await policyRepo.createPolicy(policyData);

      expect(createdPolicy.id).toBeDefined();
      expect(createdPolicy.name).toBe(policyData.name);
      expect(createdPolicy.policy_json).toEqual(policyData.policy_json);
      expect(createdPolicy.version).toBe(1);
      expect(createdPolicy.status).toBe('draft');

      const retrievedPolicy = await policyRepo.getPolicyById(createdPolicy.id);
      expect(retrievedPolicy).toEqual(createdPolicy);
    });

    it('should approve policies', async () => {
      const policy = await policyRepo.createPolicy({
        name: 'Test Policy',
        policy_json: { rules: [] },
        version: 1,
        status: 'draft',
      });

      const approvedPolicy = await policyRepo.approvePolicy(policy.id, 'admin@example.com');

      expect(approvedPolicy.status).toBe('approved');
      expect(approvedPolicy.approved_by).toBe('admin@example.com');
      expect(approvedPolicy.approved_at).toBeDefined();
    });

    it('should get active policies only', async () => {
      await policyRepo.createPolicy({
        name: 'Draft Policy',
        policy_json: { rules: [] },
        version: 1,
        status: 'draft',
      });

      const approvedPolicy = await policyRepo.createPolicy({
        name: 'Approved Policy',
        policy_json: { rules: [] },
        version: 1,
        status: 'draft',
      });

      await policyRepo.approvePolicy(approvedPolicy.id, 'admin@example.com');

      const activePolicies = await policyRepo.getActivePolicies();
      expect(activePolicies).toHaveLength(1);
      expect(activePolicies[0].name).toBe('Approved Policy');
      expect(activePolicies[0].status).toBe('approved');
    });
  });

  describe('Cross-Repository Integration', () => {
    it('should handle complex dependency analysis with policies', async () => {
      // Create services
      const frontendService = await serviceRepo.createService({
        name: 'frontend-app',
        team_id: 'frontend-team',
        repository_url: 'https://github.com/company/frontend-app',
        description: 'Frontend application',
      });

      const apiService = await serviceRepo.createService({
        name: 'api-gateway',
        team_id: 'backend-team',
        repository_url: 'https://github.com/company/api-gateway',
        description: 'API Gateway',
      });

      const userService = await serviceRepo.createService({
        name: 'user-service',
        team_id: 'backend-team',
        repository_url: 'https://github.com/company/user-service',
        description: 'User service',
      });

      // Create dependencies
      await dependencyRepo.createDependency({
        source_service_id: frontendService.id,
        target_service_id: apiService.id,
        dependency_type: 'api',
        criticality: 'critical',
      });

      await dependencyRepo.createDependency({
        source_service_id: apiService.id,
        target_service_id: userService.id,
        dependency_type: 'api',
        criticality: 'high',
      });

      // Create policy
      const policy = await policyRepo.createPolicy({
        name: 'API Change Policy',
        policy_json: {
          rules: [
            {
              id: 'api-001',
              type: 'api',
              severity: 'high',
              description: 'Breaking API changes require approval',
            },
          ],
        },
        version: 1,
        status: 'draft',
      });

      await policyRepo.approvePolicy(policy.id, 'admin@example.com');

      // Analyze impact of changing user service
      const impact = await dependencyRepo.analyzeImpact(userService.id, 3);
      const activePolicies = await policyRepo.getActivePolicies();

      expect(impact.affected_services).toHaveLength(2);
      expect(activePolicies).toHaveLength(1);

      // Verify the complete dependency chain is captured
      const affectedServiceIds = impact.affected_services.map(s => s.service_id);
      expect(affectedServiceIds).toContain(apiService.id);
      expect(affectedServiceIds).toContain(frontendService.id);
    });
  });
});

async function createTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      team_id VARCHAR(100) NOT NULL,
      repository_url TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dependencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_service_id UUID REFERENCES services(id) ON DELETE CASCADE,
      target_service_id UUID REFERENCES services(id) ON DELETE CASCADE,
      dependency_type VARCHAR(50),
      criticality VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      policy_json JSONB NOT NULL,
      version INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      approved_by VARCHAR(100),
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}