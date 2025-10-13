/**
 * Enhanced Work Task Analysis Service Tests
 * Tests for the enhanced functionality in task 4
 */

// Mock all external dependencies to avoid import issues
jest.mock('../kendra-search-service', () => ({
  KendraSearchService: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        {
          id: 'doc-1',
          title: 'API Development Guide',
          excerpt: 'Best practices for API development',
          confidence: 0.85,
          type: 'documentation',
          uri: 'https://example.com/api-guide'
        }
      ]
    })
  }))
}));

jest.mock('../../rules-engine/rules-engine-service', () => ({
  RulesEngineService: jest.fn().mockImplementation(() => ({
    validateContent: jest.fn().mockResolvedValue({
      violations: []
    })
  }))
}));

jest.mock('../../lambda/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }))
}));

jest.mock('../../repositories/audit-log-repository', () => ({
  AuditLogRepository: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({})
  }))
}));

// Import after mocking
import { WorkTaskAnalysisService } from '../work-task-analysis-service';

describe('WorkTaskAnalysisService - Enhanced Functionality', () => {
  let service: WorkTaskAnalysisService;

  beforeEach(() => {
    // Create mocked instances
    const mockKendraService = {
      search: jest.fn().mockResolvedValue({
        results: [
          {
            id: 'doc-1',
            title: 'API Development Guide',
            excerpt: 'Best practices for API development',
            confidence: 0.85,
            type: 'documentation',
            uri: 'https://example.com/api-guide'
          }
        ]
      })
    };

    const mockRulesEngine = {
      validateContent: jest.fn().mockResolvedValue({
        violations: []
      })
    };

    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    const mockAuditRepository = {
      create: jest.fn().mockResolvedValue({})
    };

    service = new WorkTaskAnalysisService(
      mockKendraService as any,
      mockRulesEngine as any,
      mockAuditRepository as any,
      mockLogger as any
    );
  });

  describe('Enhanced Key Point Extraction', () => {
    it('should extract key points using multiple algorithms', async () => {
      const taskContent = {
        id: 'task-1',
        title: 'Implement User Authentication API',
        description: 'Create secure authentication system with JWT tokens',
        content: 'The system must implement OAuth 2.0 authentication with JWT tokens. Security requirements include encryption of sensitive data and compliance with GDPR. Performance requirement: response time < 200ms.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'high' as const,
        category: 'security',
        tags: ['authentication', 'security', 'api']
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.keyPoints).toBeDefined();
      expect(result.keyPoints.length).toBeGreaterThan(0);
      
      // Should extract security-related key points
      const securityPoints = result.keyPoints.filter(point => 
        point.toLowerCase().includes('security') || 
        point.toLowerCase().includes('authentication')
      );
      expect(securityPoints.length).toBeGreaterThan(0);

      // Should extract performance requirements
      const performancePoints = result.keyPoints.filter(point => 
        point.toLowerCase().includes('performance') || 
        point.toLowerCase().includes('response time')
      );
      expect(performancePoints.length).toBeGreaterThan(0);
    });

    it('should categorize and prioritize key points correctly', async () => {
      const taskContent = {
        id: 'task-2',
        title: 'Critical Security Patch',
        description: 'Urgent security vulnerability fix required',
        content: 'Critical security vulnerability discovered in authentication module. Must be fixed immediately. Risk: High impact on user data security.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'critical' as const
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.keyPoints).toBeDefined();
      
      // Should identify critical/urgent indicators
      const criticalPoints = result.keyPoints.filter(point => 
        point.toLowerCase().includes('critical') || 
        point.toLowerCase().includes('urgent') ||
        point.includes('⚠️') // Risk indicator emoji
      );
      expect(criticalPoints.length).toBeGreaterThan(0);
    });
  });

  describe('Enhanced Workgroup Identification', () => {
    it('should identify workgroups based on skill matrices', async () => {
      const taskContent = {
        id: 'task-3',
        title: 'Database Migration and API Integration',
        description: 'Migrate legacy database and integrate with new API',
        content: 'Complex database migration required with API integration. Security review needed for data handling.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'high' as const
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.relatedWorkgroups).toBeDefined();
      expect(result.relatedWorkgroups.length).toBeGreaterThan(0);

      // Should identify multiple relevant teams
      const teamIds = result.relatedWorkgroups.map(wg => wg.teamId);
      expect(teamIds).toContain('backend-team'); // For API work
      expect(teamIds).toContain('security-team'); // For security review

      // Should have enhanced workgroup information
      const securityTeam = result.relatedWorkgroups.find(wg => wg.teamId === 'security-team');
      expect(securityTeam).toBeDefined();
      expect(securityTeam?.skillMatchDetails).toBeDefined();
      expect(securityTeam?.capacityInfo).toBeDefined();
      expect(securityTeam?.historicalPerformance).toBeDefined();
    });

    it('should provide detailed skill matching information', async () => {
      const taskContent = {
        id: 'task-4',
        title: 'Frontend React Component Development',
        description: 'Build responsive React components with TypeScript',
        content: 'Develop modern React components using TypeScript and implement responsive design.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date()
      };

      const result = await service.analyzeWorkTask(taskContent);

      const frontendTeam = result.relatedWorkgroups.find(wg => wg.teamId === 'frontend-team');
      expect(frontendTeam).toBeDefined();
      expect(frontendTeam?.skillMatchDetails).toBeDefined();
      expect(frontendTeam?.skillMatchDetails?.matchedSkills).toContain('react');
      expect(frontendTeam?.skillMatchDetails?.confidenceLevel).toBeGreaterThan(0.5);
    });
  });

  describe('Enhanced Todo List Generation', () => {
    it('should generate todos with dependency analysis', async () => {
      const taskContent = {
        id: 'task-5',
        title: 'Full Stack Feature Implementation',
        description: 'Implement complete user management feature',
        content: 'Build user management with database design, API development, frontend UI, and testing.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'high' as const
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.todoList).toBeDefined();
      expect(result.todoList.length).toBeGreaterThan(0);

      // Should have todos with dependencies
      const todosWithDependencies = result.todoList.filter(todo => todo.dependencies.length > 0);
      expect(todosWithDependencies.length).toBeGreaterThan(0);

      // Should have enhanced todo fields
      const enhancedTodos = result.todoList.filter(todo => 
        todo.risk_level !== undefined || 
        todo.success_criteria !== undefined
      );
      expect(enhancedTodos.length).toBeGreaterThan(0);
    });

    it('should optimize todo priorities based on multiple factors', async () => {
      const taskContent = {
        id: 'task-6',
        title: 'Security-Critical Database Update',
        description: 'Update database with security patches',
        content: 'Critical security update required for database. High risk if not completed quickly.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'critical' as const
      };

      const result = await service.analyzeWorkTask(taskContent);

      // Should have high-priority todos for critical tasks
      const criticalTodos = result.todoList.filter(todo => todo.priority === 'critical');
      expect(criticalTodos.length).toBeGreaterThan(0);

      // Should have security-related todos with high priority
      const securityTodos = result.todoList.filter(todo => 
        todo.description.toLowerCase().includes('security') && 
        (todo.priority === 'critical' || todo.priority === 'high')
      );
      expect(securityTodos.length).toBeGreaterThan(0);
    });
  });

  describe('Enhanced Risk Assessment', () => {
    it('should provide comprehensive risk analysis', async () => {
      const taskContent = {
        id: 'task-7',
        title: 'Complex System Integration',
        description: 'Integrate multiple third-party systems',
        content: 'Complex integration with external APIs, legacy systems, and new microservices. High technical complexity with security and compliance requirements.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'high' as const
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment.riskFactors.length).toBeGreaterThan(0);

      // Should identify multiple risk types
      const riskTypes = result.riskAssessment.riskFactors.map(rf => rf.type);
      expect(riskTypes).toContain('technical');
      expect(riskTypes).toContain('integration');

      // Should have enhanced risk assessment if available
      const enhancedRisk = result.riskAssessment as any;
      if (enhancedRisk.risk_matrix) {
        expect(enhancedRisk.risk_matrix).toBeDefined();
        expect(enhancedRisk.mitigation_timeline).toBeDefined();
        expect(enhancedRisk.contingency_plans).toBeDefined();
      }
    });

    it('should assess security risks appropriately', async () => {
      const taskContent = {
        id: 'task-8',
        title: 'User Data Processing System',
        description: 'Process sensitive user data with GDPR compliance',
        content: 'Handle personal data, implement encryption, ensure GDPR compliance, and maintain audit trails.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date()
      };

      const result = await service.analyzeWorkTask(taskContent);

      // Should identify security and compliance risks
      const securityRisks = result.riskAssessment.riskFactors.filter(rf => 
        rf.type === 'security' || rf.type === 'compliance'
      );
      expect(securityRisks.length).toBeGreaterThan(0);

      // Security risks should have high impact
      const highImpactRisks = securityRisks.filter(rf => rf.impact >= 0.7);
      expect(highImpactRisks.length).toBeGreaterThan(0);
    });
  });

  describe('Integration and Recommendations', () => {
    it('should generate comprehensive recommendations', async () => {
      const taskContent = {
        id: 'task-9',
        title: 'Multi-Team Project',
        description: 'Large project involving multiple teams',
        content: 'Complex project requiring coordination between frontend, backend, security, and DevOps teams.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date(),
        priority: 'high' as const
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Should have coordination recommendations for multi-team projects
      const coordinationRecs = result.recommendations.filter(rec => 
        rec.toLowerCase().includes('coordination') || 
        rec.toLowerCase().includes('communication') ||
        rec.toLowerCase().includes('team')
      );
      expect(coordinationRecs.length).toBeGreaterThan(0);
    });

    it('should provide effort estimates with enhanced breakdown', async () => {
      const taskContent = {
        id: 'task-10',
        title: 'Feature Development',
        description: 'Develop new feature with testing',
        content: 'Implement new feature including development, testing, documentation, and deployment.',
        submittedBy: 'user-1',
        teamId: 'team-1',
        submittedAt: new Date()
      };

      const result = await service.analyzeWorkTask(taskContent);

      expect(result.estimatedEffort).toBeDefined();
      expect(result.estimatedEffort.totalHours).toBeGreaterThan(0);
      expect(result.estimatedEffort.breakdown).toBeDefined();
      expect(result.estimatedEffort.breakdown.length).toBeGreaterThan(0);
      expect(result.estimatedEffort.confidence).toBeGreaterThan(0);
      expect(result.estimatedEffort.assumptions).toBeDefined();
    });
  });
});