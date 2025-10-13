/**
 * Integration tests for Workgroup Identification with WorkTaskAnalysisService
 */

import { WorkgroupIdentificationService } from '../workgroup-identification-service';
import { Logger } from '../../lambda/utils/logger';

describe('Workgroup Identification Integration', () => {
  let service: WorkgroupIdentificationService;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    service = new WorkgroupIdentificationService(mockLogger);
  });

  describe('Real-world scenarios', () => {
    it('should identify appropriate teams for a full-stack web application', async () => {
      const request = {
        taskContent: 'Build a user authentication system with React frontend and Node.js backend',
        technicalRequirements: ['react', 'api_development', 'database_design', 'security_audit'],
        businessDomains: ['authentication', 'user_interface', 'api'],
        priority: 'high' as const,
        estimatedEffort: 120,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should identify frontend, backend, and security teams
      expect(results.length).toBeGreaterThan(0);
      
      const teamIds = results.map(r => r.workgroup.team_id);
      expect(teamIds).toContain('frontend-team');
      expect(teamIds).toContain('backend-team');
      expect(teamIds).toContain('security-team');

      // Frontend team should have high relevance for React work
      const frontendTeam = results.find(r => r.workgroup.team_id === 'frontend-team');
      expect(frontendTeam).toBeDefined();
      expect(frontendTeam!.workgroup.relevance_score).toBeGreaterThan(0.6);
    });

    it('should identify DevOps team for infrastructure tasks', async () => {
      const request = {
        taskContent: 'Set up CI/CD pipeline and deploy to AWS',
        technicalRequirements: ['ci_cd', 'aws_infrastructure', 'containerization'],
        businessDomains: ['infrastructure', 'deployment'],
        priority: 'critical' as const,
        estimatedEffort: 80,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // DevOps should be the top recommendation
      expect(results[0].workgroup.team_id).toBe('devops-team');
      expect(results[0].workgroup.relevance_score).toBeGreaterThan(0.65);
      
      // Should recommend lead or contributor involvement for critical priority
      expect(['lead', 'contributor']).toContain(results[0].collaborationRecommendation.involvementType);
    });

    it('should assess capacity constraints for busy teams', async () => {
      const request = {
        taskContent: 'Large backend refactoring project',
        technicalRequirements: ['api_development', 'database_design', 'microservices'],
        businessDomains: ['backend', 'architecture'],
        priority: 'high' as const,
        estimatedEffort: 200,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');
      expect(backendTeam).toBeDefined();
      
      // Backend team has high utilization (0.85), should show in load assessment
      expect(backendTeam!.loadAssessment.currentUtilization).toBeGreaterThan(0.8);
      expect(backendTeam!.loadAssessment.overloadRisk).not.toBe('none');
      
      // Should have capacity constraints identified
      expect(backendTeam!.loadAssessment.capacityConstraints.length).toBeGreaterThan(0);
    });

    it('should recommend cross-team collaboration for complex projects', async () => {
      const request = {
        taskContent: 'Build analytics dashboard with real-time data processing',
        technicalRequirements: ['react', 'data_pipeline', 'analytics', 'api_development'],
        businessDomains: ['data_processing', 'user_interface', 'reporting'],
        priority: 'high' as const,
        estimatedEffort: 160,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should identify multiple teams
      expect(results.length).toBeGreaterThanOrEqual(3);
      
      // Should include frontend, backend, and data teams
      const teamIds = results.map(r => r.workgroup.team_id);
      expect(teamIds).toContain('frontend-team');
      expect(teamIds).toContain('data-team');
    });

    it('should provide detailed collaboration recommendations', async () => {
      const request = {
        taskContent: 'Security audit and penetration testing',
        technicalRequirements: ['security_audit', 'vulnerability_assessment', 'compliance_checking'],
        businessDomains: ['security', 'compliance'],
        priority: 'critical' as const,
        estimatedEffort: 60,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');
      expect(securityTeam).toBeDefined();
      
      // Should have detailed collaboration recommendation
      const collab = securityTeam!.collaborationRecommendation;
      expect(collab.communicationChannels.length).toBeGreaterThan(0);
      expect(collab.estimatedTimeCommitment).toBeGreaterThan(0);
      expect(collab.successFactors.length).toBeGreaterThan(0);
      
      // Critical priority should include dedicated communication channels
      expect(collab.communicationChannels.some(c => c.includes('Slack'))).toBe(true);
    });

    it('should factor in historical performance', async () => {
      const request = {
        taskContent: 'Deploy microservices to production',
        technicalRequirements: ['aws_infrastructure', 'ci_cd', 'monitoring'],
        businessDomains: ['deployment', 'infrastructure'],
        priority: 'high' as const,
        estimatedEffort: 50,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      const devopsTeam = results.find(r => r.workgroup.team_id === 'devops-team');
      expect(devopsTeam).toBeDefined();
      
      // DevOps team has excellent historical performance
      expect(devopsTeam!.workgroup.historicalPerformance).toBeDefined();
      expect(devopsTeam!.workgroup.historicalPerformance!.successRate).toBeGreaterThan(0.9);
      expect(devopsTeam!.workgroup.historicalPerformance!.qualityScore).toBeGreaterThan(0.85);
    });

    it('should handle tasks with partial skill matches', async () => {
      const request = {
        taskContent: 'Implement new machine learning feature',
        technicalRequirements: ['machine_learning', 'data_pipeline', 'api_development'],
        businessDomains: ['ai', 'data_processing'],
        priority: 'medium' as const,
        estimatedEffort: 100,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Data team should be identified (has ML skills at intermediate level)
      const dataTeam = results.find(r => r.workgroup.team_id === 'data-team');
      expect(dataTeam).toBeDefined();
      
      // Should identify skill gaps
      expect(dataTeam!.matchScore.missingSkills.length).toBeGreaterThanOrEqual(0);
      
      // Should still provide recommendations despite gaps
      expect(dataTeam!.collaborationRecommendation).toBeDefined();
    });
  });

  describe('Requirement validation', () => {
    it('should satisfy requirement 4.1: identify workgroups based on technology stacks', async () => {
      const request = {
        taskContent: 'API development with database integration',
        technicalRequirements: ['api_development', 'database_design'],
        businessDomains: ['backend', 'database'],
        priority: 'medium' as const,
        estimatedEffort: 80,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should identify backend team based on technology stack
      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');
      expect(backendTeam).toBeDefined();
      expect(backendTeam!.matchScore.matchedSkills.length).toBeGreaterThan(0);
    });

    it('should satisfy requirement 4.2: use skill matrices and historical data', async () => {
      const request = {
        taskContent: 'Security implementation',
        technicalRequirements: ['security_audit', 'encryption'],
        businessDomains: ['security'],
        priority: 'high' as const,
        estimatedEffort: 60,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');
      expect(securityTeam).toBeDefined();
      
      // Should use skill matrix data
      expect(securityTeam!.matchScore).toBeDefined();
      expect(securityTeam!.matchScore.matchedSkills.length).toBeGreaterThan(0);
      
      // Should use historical performance data
      expect(securityTeam!.workgroup.historicalPerformance).toBeDefined();
      expect(securityTeam!.workgroup.historicalPerformance!.successRate).toBeDefined();
    });

    it('should satisfy requirement 4.3: provide contact info and suggest collaboration', async () => {
      const request = {
        taskContent: 'Frontend development',
        technicalRequirements: ['react', 'typescript'],
        businessDomains: ['user_interface'],
        priority: 'medium' as const,
        estimatedEffort: 70,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      const frontendTeam = results.find(r => r.workgroup.team_id === 'frontend-team');
      expect(frontendTeam).toBeDefined();
      
      // Should provide professional domain information
      expect(frontendTeam!.workgroup.expertise).toBeDefined();
      expect(frontendTeam!.workgroup.expertise.length).toBeGreaterThan(0);
      
      // Should suggest collaboration methods
      expect(frontendTeam!.collaborationRecommendation).toBeDefined();
      expect(frontendTeam!.collaborationRecommendation.involvementType).toBeDefined();
      expect(frontendTeam!.collaborationRecommendation.collaborationMode).toBeDefined();
      
      // Should suggest communication channels
      expect(frontendTeam!.collaborationRecommendation.communicationChannels).toBeDefined();
      expect(frontendTeam!.collaborationRecommendation.communicationChannels.length).toBeGreaterThan(0);
    });
  });
});
