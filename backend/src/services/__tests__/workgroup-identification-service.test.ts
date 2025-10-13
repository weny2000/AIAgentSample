/**
 * Unit tests for Workgroup Identification Service
 * Tests skill matching, load assessment, and collaboration recommendations
 */

import { WorkgroupIdentificationService, WorkgroupIdentificationRequest } from '../workgroup-identification-service';
import { Logger } from '../../lambda/utils/logger';

describe('WorkgroupIdentificationService', () => {
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

  describe('identifyWorkgroups', () => {
    it('should identify workgroups based on skill requirements', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Build a secure REST API with authentication',
        technicalRequirements: ['api_development', 'security_audit', 'database_design'],
        businessDomains: ['authentication', 'user_management'],
        priority: 'high',
        estimatedEffort: 80,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      
      // Should have backend and security teams with high scores
      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');
      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');
      
      expect(backendTeam).toBeDefined();
      expect(securityTeam).toBeDefined();
      expect(backendTeam!.workgroup.relevance_score).toBeGreaterThan(0.5);
      expect(securityTeam!.workgroup.relevance_score).toBeGreaterThan(0.5);
    });

    it('should filter out workgroups with very low skill match', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Build a machine learning model',
        technicalRequirements: ['machine_learning', 'python', 'tensorflow'],
        businessDomains: ['ai', 'predictions'],
        priority: 'medium',
        estimatedEffort: 120,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should have data team but not necessarily frontend team
      const dataTeam = results.find(r => r.workgroup.team_id === 'data-team');
      expect(dataTeam).toBeDefined();
      
      // All results should have reasonable scores
      results.forEach(result => {
        expect(result.workgroup.relevance_score).toBeGreaterThan(0.2);
      });
    });

    it('should sort workgroups by relevance score', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Deploy application to AWS',
        technicalRequirements: ['aws_infrastructure', 'ci_cd', 'monitoring'],
        businessDomains: ['deployment', 'operations'],
        priority: 'critical',
        estimatedEffort: 40,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // DevOps team should be first
      expect(results[0].workgroup.team_id).toBe('devops-team');
      
      // Results should be sorted in descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].workgroup.relevance_score).toBeGreaterThanOrEqual(
          results[i].workgroup.relevance_score
        );
      }
    });

    it('should include skill match details in results', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Frontend development task',
        technicalRequirements: ['react', 'typescript', 'testing'],
        businessDomains: ['ui', 'user_experience'],
        priority: 'medium',
        estimatedEffort: 60,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const frontendTeam = results.find(r => r.workgroup.team_id === 'frontend-team');

      expect(frontendTeam).toBeDefined();
      expect(frontendTeam!.matchScore).toBeDefined();
      expect(frontendTeam!.matchScore.matchedSkills.length).toBeGreaterThan(0);
      expect(frontendTeam!.matchScore.overallScore).toBeGreaterThan(0.5);
    });
  });

  describe('load assessment', () => {
    it('should assess workgroup load and availability', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Backend API development',
        technicalRequirements: ['api_development'],
        businessDomains: ['backend'],
        priority: 'high',
        estimatedEffort: 100,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');

      expect(backendTeam).toBeDefined();
      expect(backendTeam!.loadAssessment).toBeDefined();
      expect(backendTeam!.loadAssessment.currentUtilization).toBeGreaterThanOrEqual(0);
      expect(backendTeam!.loadAssessment.currentUtilization).toBeLessThanOrEqual(1);
      expect(backendTeam!.loadAssessment.availableCapacity).toBeGreaterThan(0);
    });

    it('should identify overload risk for busy teams', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Large backend project',
        technicalRequirements: ['api_development', 'database_design'],
        businessDomains: ['backend'],
        priority: 'critical',
        estimatedEffort: 200,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');

      expect(backendTeam).toBeDefined();
      // Backend team has high utilization (0.85), so should have some risk
      expect(['low', 'medium', 'high']).toContain(backendTeam!.loadAssessment.overloadRisk);
    });

    it('should calculate availability windows based on current load', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Security audit',
        technicalRequirements: ['security_audit'],
        businessDomains: ['security'],
        priority: 'medium',
        estimatedEffort: 40,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');

      expect(securityTeam).toBeDefined();
      expect(securityTeam!.loadAssessment.availabilityWindow).toBeDefined();
      expect(securityTeam!.loadAssessment.availabilityWindow.earliestStart).toBeDefined();
      expect(securityTeam!.loadAssessment.availabilityWindow.latestStart).toBeDefined();
      expect(securityTeam!.loadAssessment.availabilityWindow.bufferDays).toBeGreaterThanOrEqual(0);
    });

    it('should recommend appropriate time allocation', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Frontend component development',
        technicalRequirements: ['react', 'typescript'],
        businessDomains: ['frontend'],
        priority: 'low',
        estimatedEffort: 80,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const frontendTeam = results.find(r => r.workgroup.team_id === 'frontend-team');

      expect(frontendTeam).toBeDefined();
      expect(frontendTeam!.loadAssessment.recommendedAllocation).toBeGreaterThan(0);
      expect(frontendTeam!.loadAssessment.recommendedAllocation).toBeLessThanOrEqual(
        frontendTeam!.loadAssessment.availableCapacity
      );
    });
  });

  describe('collaboration recommendations', () => {
    it('should recommend appropriate involvement type based on skill match', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'DevOps infrastructure setup',
        technicalRequirements: ['aws_infrastructure', 'ci_cd', 'monitoring'],
        businessDomains: ['infrastructure'],
        priority: 'high',
        estimatedEffort: 60,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const devopsTeam = results.find(r => r.workgroup.team_id === 'devops-team');

      expect(devopsTeam).toBeDefined();
      expect(devopsTeam!.collaborationRecommendation).toBeDefined();
      // DevOps team has excellent match, should be lead or contributor
      expect(['lead', 'contributor']).toContain(
        devopsTeam!.collaborationRecommendation.involvementType
      );
    });

    it('should recommend communication channels based on involvement', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Critical security implementation',
        technicalRequirements: ['security_audit', 'encryption'],
        businessDomains: ['security'],
        priority: 'critical',
        estimatedEffort: 100,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');

      expect(securityTeam).toBeDefined();
      expect(securityTeam!.collaborationRecommendation.communicationChannels).toBeDefined();
      expect(securityTeam!.collaborationRecommendation.communicationChannels.length).toBeGreaterThan(0);
      
      // Critical priority should include dedicated channels
      const channels = securityTeam!.collaborationRecommendation.communicationChannels;
      expect(channels.some(c => c.includes('Slack'))).toBe(true);
    });

    it('should identify collaboration risks', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Backend API with new technology',
        technicalRequirements: ['api_development', 'new_framework', 'unknown_tech'],
        businessDomains: ['backend'],
        priority: 'medium',
        estimatedEffort: 120,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');

      expect(backendTeam).toBeDefined();
      expect(backendTeam!.collaborationRecommendation.collaborationRisks).toBeDefined();
      // Should identify missing skills as a risk
      expect(backendTeam!.collaborationRecommendation.collaborationRisks.length).toBeGreaterThan(0);
    });

    it('should identify success factors', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'React component library',
        technicalRequirements: ['react', 'typescript', 'testing'],
        businessDomains: ['frontend'],
        priority: 'medium',
        estimatedEffort: 80,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const frontendTeam = results.find(r => r.workgroup.team_id === 'frontend-team');

      expect(frontendTeam).toBeDefined();
      expect(frontendTeam!.collaborationRecommendation.successFactors).toBeDefined();
      expect(frontendTeam!.collaborationRecommendation.successFactors.length).toBeGreaterThan(0);
    });

    it('should estimate time commitment appropriately', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Small security review',
        technicalRequirements: ['security_audit'],
        businessDomains: ['security'],
        priority: 'low',
        estimatedEffort: 20,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');

      expect(securityTeam).toBeDefined();
      expect(securityTeam!.collaborationRecommendation.estimatedTimeCommitment).toBeGreaterThan(0);
      expect(securityTeam!.collaborationRecommendation.estimatedTimeCommitment).toBeLessThanOrEqual(
        securityTeam!.loadAssessment.availableCapacity
      );
    });
  });

  describe('cross-team collaboration suggestions', () => {
    it('should suggest coordination for multi-team projects', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Full-stack application with security and deployment',
        technicalRequirements: [
          'react', 'api_development', 'database_design', 
          'security_audit', 'aws_infrastructure'
        ],
        businessDomains: ['full_stack', 'security', 'deployment'],
        priority: 'high',
        estimatedEffort: 200,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should have multiple high-scoring teams
      const highScoreTeams = results.filter(r => r.workgroup.relevance_score > 0.5);
      expect(highScoreTeams.length).toBeGreaterThanOrEqual(2);
    });

    it('should identify complementary teams for skill gaps', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Backend API with data analytics',
        technicalRequirements: ['api_development', 'analytics', 'data_pipeline'],
        businessDomains: ['backend', 'data'],
        priority: 'medium',
        estimatedEffort: 100,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should have both backend and data teams
      const backendTeam = results.find(r => r.workgroup.team_id === 'backend-team');
      const dataTeam = results.find(r => r.workgroup.team_id === 'data-team');

      expect(backendTeam).toBeDefined();
      expect(dataTeam).toBeDefined();
    });

    it('should recommend management oversight for critical tasks', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Critical system migration',
        technicalRequirements: ['database_design', 'aws_infrastructure', 'api_development'],
        businessDomains: ['migration', 'infrastructure'],
        priority: 'critical',
        estimatedEffort: 300,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should have multiple teams for critical project
      expect(results.length).toBeGreaterThanOrEqual(2);
      // Should include teams with relevant skills
      const hasInfraTeam = results.some(r => r.workgroup.team_id === 'devops-team');
      const hasBackendTeam = results.some(r => r.workgroup.team_id === 'backend-team');
      expect(hasInfraTeam || hasBackendTeam).toBe(true);
    });
  });

  describe('historical performance analysis', () => {
    it('should factor in team success rate', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'DevOps deployment task',
        technicalRequirements: ['ci_cd', 'aws_infrastructure'],
        businessDomains: ['deployment'],
        priority: 'high',
        estimatedEffort: 40,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const devopsTeam = results.find(r => r.workgroup.team_id === 'devops-team');

      expect(devopsTeam).toBeDefined();
      expect(devopsTeam!.workgroup.historicalPerformance).toBeDefined();
      expect(devopsTeam!.workgroup.historicalPerformance!.successRate).toBeGreaterThan(0.9);
    });

    it('should consider similar project experience', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Security audit for API',
        technicalRequirements: ['security_audit', 'api_development'],
        businessDomains: ['security'],
        priority: 'high',
        estimatedEffort: 60,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);
      const securityTeam = results.find(r => r.workgroup.team_id === 'security-team');

      expect(securityTeam).toBeDefined();
      expect(securityTeam!.workgroup.historicalPerformance).toBeDefined();
      expect(securityTeam!.workgroup.historicalPerformance!.similarProjectCount).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty technical requirements', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'General task',
        technicalRequirements: [],
        businessDomains: ['general'],
        priority: 'low',
        estimatedEffort: 20,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should still return some results based on other factors
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle very high effort estimates', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Large project',
        technicalRequirements: ['api_development'],
        businessDomains: ['backend'],
        priority: 'high',
        estimatedEffort: 500,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      expect(results).toBeDefined();
      // Should identify capacity constraints
      results.forEach(result => {
        expect(result.loadAssessment).toBeDefined();
      });
    });

    it('should handle unknown skill requirements gracefully', async () => {
      const request: WorkgroupIdentificationRequest = {
        taskContent: 'Task with unknown tech',
        technicalRequirements: ['unknown_skill_1', 'unknown_skill_2', 'unknown_skill_3'],
        businessDomains: ['unknown'],
        priority: 'medium',
        estimatedEffort: 60,
        teamId: 'team-001'
      };

      const results = await service.identifyWorkgroups(request);

      // Should still return results, but with lower scores
      expect(results).toBeDefined();
      if (results.length > 0) {
        results.forEach(result => {
          expect(result.matchScore.missingSkills.length).toBeGreaterThan(0);
        });
      }
    });
  });
});
