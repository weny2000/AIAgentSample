import { DatabaseConnection } from '../database/connection.js';
import { ServiceRepository } from '../repositories/service-repository.js';
import { DependencyRepository } from '../repositories/dependency-repository.js';
import { TeamRosterRepository } from '../repositories/team-roster-repository.js';

export interface ImpactAnalysisResult {
  service_id: string;
  service_name: string;
  team_id: string;
  analysis_type: 'downstream' | 'upstream' | 'full';
  affected_services: AffectedService[];
  risk_assessment: RiskAssessment;
  stakeholders: Stakeholder[];
  mitigation_strategies: MitigationStrategy[];
  visualization_data: VisualizationData;
}

export interface AffectedService {
  service_id: string;
  service_name: string;
  team_id: string;
  depth: number;
  path: string[];
  criticality: 'low' | 'medium' | 'high' | 'critical';
  impact_type: 'direct' | 'indirect';
  dependency_types: string[];
  estimated_impact_score: number;
}

export interface RiskAssessment {
  overall_risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: RiskFactor[];
  cross_team_impact_count: number;
  critical_path_services: string[];
  business_impact_estimate: string;
}

export interface RiskFactor {
  type: 'circular_dependency' | 'critical_service' | 'cross_team' | 'high_depth' | 'breaking_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affected_services: string[];
}

export interface Stakeholder {
  team_id: string;
  team_name?: string;
  contact_info: string[];
  role: 'owner' | 'dependent' | 'stakeholder';
  priority: 'high' | 'medium' | 'low';
  notification_preferences?: string[];
}

export interface MitigationStrategy {
  strategy_type: 'communication' | 'technical' | 'process' | 'rollback';
  priority: 'high' | 'medium' | 'low';
  description: string;
  action_items: string[];
  estimated_effort: string;
  responsible_teams: string[];
}

export interface VisualizationData {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  clusters: VisualizationCluster[];
  layout_hints: Record<string, any>;
}

export interface VisualizationNode {
  id: string;
  label: string;
  type: 'service' | 'team';
  team_id: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  impact_score: number;
  metadata: Record<string, any>;
}

export interface VisualizationEdge {
  source: string;
  target: string;
  dependency_type: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  bidirectional: boolean;
  metadata: Record<string, any>;
}

export interface VisualizationCluster {
  id: string;
  label: string;
  team_id: string;
  services: string[];
  color?: string;
}

/**
 * Service for performing cross-team impact analysis
 */
export class ImpactAnalysisService {
  private serviceRepository: ServiceRepository;
  private dependencyRepository: DependencyRepository;
  private teamRosterRepository: TeamRosterRepository;

  constructor(db: DatabaseConnection) {
    this.serviceRepository = new ServiceRepository(db);
    this.dependencyRepository = new DependencyRepository(db);
    // Note: TeamRosterRepository expects a different config, this is a simplified version
    this.teamRosterRepository = new TeamRosterRepository({
      region: process.env.AWS_REGION || 'us-east-1',
      tableName: process.env.TEAM_ROSTER_TABLE_NAME || 'team_roster'
    });
  }

  /**
   * Perform comprehensive impact analysis for a service
   */
  async analyzeImpact(
    serviceId: string,
    analysisType: 'downstream' | 'upstream' | 'full' = 'full',
    maxDepth: number = 3
  ): Promise<ImpactAnalysisResult> {
    // Get the target service
    const service = await this.serviceRepository.getById(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    // Perform dependency analysis
    const dependencyAnalysis = await this.dependencyRepository.getImpactAnalysis(serviceId, maxDepth);
    
    // Build affected services list
    const affectedServices = await this.buildAffectedServicesList(
      dependencyAnalysis,
      analysisType
    );

    // Assess risks
    const riskAssessment = await this.assessRisks(serviceId, affectedServices, dependencyAnalysis);

    // Identify stakeholders
    const stakeholders = await this.identifyStakeholders(affectedServices);

    // Generate mitigation strategies
    const mitigationStrategies = this.generateMitigationStrategies(riskAssessment, affectedServices);

    // Create visualization data
    const visualizationData = await this.createVisualizationData(serviceId, affectedServices);

    return {
      service_id: serviceId,
      service_name: service.name,
      team_id: service.team_id,
      analysis_type: analysisType,
      affected_services: affectedServices,
      risk_assessment: riskAssessment,
      stakeholders,
      mitigation_strategies: mitigationStrategies,
      visualization_data: visualizationData
    };
  }

  /**
   * Build list of affected services with impact details
   */
  private async buildAffectedServicesList(
    dependencyAnalysis: any,
    analysisType: 'downstream' | 'upstream' | 'full'
  ): Promise<AffectedService[]> {
    const affectedServices: AffectedService[] = [];
    const processedServices = new Set<string>();

    // Process downstream dependencies (services that depend on this service)
    if (analysisType === 'downstream' || analysisType === 'full') {
      for (const dep of dependencyAnalysis.downstream) {
        if (!processedServices.has(dep.service_id)) {
          affectedServices.push({
            service_id: dep.service_id,
            service_name: dep.service_name,
            team_id: dep.team_id,
            depth: dep.depth,
            path: dep.path,
            criticality: dep.criticality as 'low' | 'medium' | 'high' | 'critical',
            impact_type: dep.depth === 1 ? 'direct' : 'indirect',
            dependency_types: ['downstream'],
            estimated_impact_score: this.calculateImpactScore(dep)
          });
          processedServices.add(dep.service_id);
        }
      }
    }

    // Process upstream dependencies (services this service depends on)
    if (analysisType === 'upstream' || analysisType === 'full') {
      for (const dep of dependencyAnalysis.upstream) {
        if (!processedServices.has(dep.service_id)) {
          affectedServices.push({
            service_id: dep.service_id,
            service_name: dep.service_name,
            team_id: dep.team_id,
            depth: dep.depth,
            path: dep.path,
            criticality: dep.criticality as 'low' | 'medium' | 'high' | 'critical',
            impact_type: dep.depth === 1 ? 'direct' : 'indirect',
            dependency_types: ['upstream'],
            estimated_impact_score: this.calculateImpactScore(dep)
          });
          processedServices.add(dep.service_id);
        } else {
          // Update existing entry to include both upstream and downstream
          const existing = affectedServices.find(s => s.service_id === dep.service_id);
          if (existing) {
            existing.dependency_types.push('upstream');
            existing.estimated_impact_score = Math.max(
              existing.estimated_impact_score,
              this.calculateImpactScore(dep)
            );
          }
        }
      }
    }

    return affectedServices.sort((a, b) => b.estimated_impact_score - a.estimated_impact_score);
  }

  /**
   * Calculate impact score for a dependency
   */
  private calculateImpactScore(dependency: any): number {
    let score = 0;

    // Base score by criticality
    switch (dependency.criticality) {
      case 'critical': score += 40; break;
      case 'high': score += 30; break;
      case 'medium': score += 20; break;
      case 'low': score += 10; break;
    }

    // Depth penalty (closer dependencies have higher impact)
    score += Math.max(0, 20 - (dependency.depth * 5));

    // Cross-team impact bonus
    // This would need team information, simplified for now
    score += 10;

    return Math.min(100, score);
  }

  /**
   * Assess risks based on impact analysis
   */
  private async assessRisks(
    serviceId: string,
    affectedServices: AffectedService[],
    dependencyAnalysis: any
  ): Promise<RiskAssessment> {
    const riskFactors: RiskFactor[] = [];
    
    // Check for circular dependencies
    const circularDeps = await this.dependencyRepository.findCircularDependencies();
    if (circularDeps.cycles.length > 0) {
      const relevantCycles = circularDeps.cycles.filter(cycle => 
        cycle.services.includes(serviceId)
      );
      
      if (relevantCycles.length > 0) {
        riskFactors.push({
          type: 'circular_dependency',
          severity: 'high',
          description: `Service is part of ${relevantCycles.length} circular dependency chain(s)`,
          affected_services: relevantCycles.flatMap(c => c.services)
        });
      }
    }

    // Check for critical services in the impact chain
    const criticalServices = affectedServices.filter(s => s.criticality === 'critical');
    if (criticalServices.length > 0) {
      riskFactors.push({
        type: 'critical_service',
        severity: 'critical',
        description: `Impact chain includes ${criticalServices.length} critical service(s)`,
        affected_services: criticalServices.map(s => s.service_id)
      });
    }

    // Check for cross-team impacts
    const crossTeamServices = affectedServices.filter(s => s.team_id !== affectedServices[0]?.team_id);
    if (crossTeamServices.length > 0) {
      riskFactors.push({
        type: 'cross_team',
        severity: crossTeamServices.length > 5 ? 'high' : 'medium',
        description: `Changes will impact ${crossTeamServices.length} services across different teams`,
        affected_services: crossTeamServices.map(s => s.service_id)
      });
    }

    // Check for high depth dependencies
    const deepDependencies = affectedServices.filter(s => s.depth > 2);
    if (deepDependencies.length > 0) {
      riskFactors.push({
        type: 'high_depth',
        severity: 'medium',
        description: `Impact chain extends to depth ${Math.max(...deepDependencies.map(s => s.depth))}`,
        affected_services: deepDependencies.map(s => s.service_id)
      });
    }

    // Determine overall risk level
    const overallRiskLevel = this.calculateOverallRiskLevel(riskFactors, affectedServices);

    // Identify critical path services
    const criticalPathServices = affectedServices
      .filter(s => s.criticality === 'critical' || s.estimated_impact_score > 70)
      .map(s => s.service_id);

    return {
      overall_risk_level: overallRiskLevel,
      risk_factors: riskFactors,
      cross_team_impact_count: crossTeamServices.length,
      critical_path_services: criticalPathServices,
      business_impact_estimate: this.estimateBusinessImpact(overallRiskLevel, affectedServices.length)
    };
  }

  /**
   * Calculate overall risk level based on risk factors
   */
  private calculateOverallRiskLevel(
    riskFactors: RiskFactor[],
    affectedServices: AffectedService[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (riskFactors.some(rf => rf.severity === 'critical')) {
      return 'critical';
    }
    
    if (riskFactors.some(rf => rf.severity === 'high') || affectedServices.length > 10) {
      return 'high';
    }
    
    if (riskFactors.some(rf => rf.severity === 'medium') || affectedServices.length > 3) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Estimate business impact based on risk level and scope
   */
  private estimateBusinessImpact(riskLevel: string, affectedServiceCount: number): string {
    if (riskLevel === 'critical') {
      return 'High business impact expected - potential service outages and customer-facing issues';
    } else if (riskLevel === 'high') {
      return 'Medium to high business impact - may affect multiple teams and workflows';
    } else if (riskLevel === 'medium') {
      return 'Medium business impact - limited to specific teams or features';
    } else {
      return 'Low business impact - minimal disruption expected';
    }
  }

  /**
   * Identify stakeholders who should be notified
   */
  private async identifyStakeholders(affectedServices: AffectedService[]): Promise<Stakeholder[]> {
    const stakeholders: Stakeholder[] = [];
    const processedTeams = new Set<string>();

    for (const service of affectedServices) {
      if (!processedTeams.has(service.team_id)) {
        try {
          const teamRoster = await this.teamRosterRepository.getByTeamId(service.team_id);
          
          if (teamRoster) {
            const priority = this.determineStakeholderPriority(service);
            const role = service.impact_type === 'direct' ? 'dependent' : 'stakeholder';
            
            stakeholders.push({
              team_id: service.team_id,
              team_name: teamRoster.team_id, // Could be enhanced with actual team names
              contact_info: teamRoster.members.map(m => m.contact).filter(Boolean),
              role,
              priority,
              notification_preferences: ['slack', 'email'] // Default preferences
            });
          }
          
          processedTeams.add(service.team_id);
        } catch (error) {
          // Continue if team roster not found
          console.warn(`Could not find team roster for team: ${service.team_id}`);
        }
      }
    }

    return stakeholders.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Determine stakeholder priority based on service impact
   */
  private determineStakeholderPriority(service: AffectedService): 'high' | 'medium' | 'low' {
    if (service.criticality === 'critical' || service.estimated_impact_score > 70) {
      return 'high';
    } else if (service.criticality === 'high' || service.estimated_impact_score > 40) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generate mitigation strategies based on risk assessment
   */
  private generateMitigationStrategies(
    riskAssessment: RiskAssessment,
    affectedServices: AffectedService[]
  ): MitigationStrategy[] {
    const strategies: MitigationStrategy[] = [];

    // Communication strategy
    if (riskAssessment.cross_team_impact_count > 0) {
      strategies.push({
        strategy_type: 'communication',
        priority: 'high',
        description: 'Coordinate with affected teams before making changes',
        action_items: [
          'Send impact analysis to all affected team leads',
          'Schedule coordination meeting with high-priority stakeholders',
          'Create shared communication channel for updates',
          'Establish change timeline and coordination points'
        ],
        estimated_effort: '2-4 hours',
        responsible_teams: [...new Set(affectedServices.map(s => s.team_id))]
      });
    }

    // Technical strategy for critical services
    if (riskAssessment.critical_path_services.length > 0) {
      strategies.push({
        strategy_type: 'technical',
        priority: 'high',
        description: 'Implement technical safeguards for critical dependencies',
        action_items: [
          'Review and test all critical service integrations',
          'Implement circuit breakers and fallback mechanisms',
          'Create monitoring and alerting for critical paths',
          'Prepare rollback procedures for critical services'
        ],
        estimated_effort: '1-2 days',
        responsible_teams: [affectedServices[0]?.team_id || 'unknown']
      });
    }

    // Process strategy for high-risk changes
    if (riskAssessment.overall_risk_level === 'high' || riskAssessment.overall_risk_level === 'critical') {
      strategies.push({
        strategy_type: 'process',
        priority: 'high',
        description: 'Follow enhanced change management process',
        action_items: [
          'Require additional approval from affected team leads',
          'Implement phased rollout with canary deployments',
          'Schedule change during low-traffic periods',
          'Prepare detailed rollback plan with clear triggers'
        ],
        estimated_effort: '4-8 hours',
        responsible_teams: [affectedServices[0]?.team_id || 'unknown']
      });
    }

    // Rollback strategy
    strategies.push({
      strategy_type: 'rollback',
      priority: riskAssessment.overall_risk_level === 'critical' ? 'high' : 'medium',
      description: 'Prepare comprehensive rollback procedures',
      action_items: [
        'Document current state and dependencies',
        'Create automated rollback scripts where possible',
        'Test rollback procedures in staging environment',
        'Define clear rollback triggers and decision criteria'
      ],
      estimated_effort: '2-4 hours',
      responsible_teams: [affectedServices[0]?.team_id || 'unknown']
    });

    return strategies;
  }

  /**
   * Create visualization data for impact analysis
   */
  private async createVisualizationData(
    serviceId: string,
    affectedServices: AffectedService[]
  ): Promise<VisualizationData> {
    const nodes: VisualizationNode[] = [];
    const edges: VisualizationEdge[] = [];
    const clusters: VisualizationCluster[] = [];
    
    // Get the root service
    const rootService = await this.serviceRepository.getById(serviceId);
    if (rootService) {
      nodes.push({
        id: serviceId,
        label: rootService.name,
        type: 'service',
        team_id: rootService.team_id,
        criticality: 'high', // Root service is always important in this context
        impact_score: 100,
        metadata: { isRoot: true }
      });
    }

    // Add affected services as nodes
    for (const service of affectedServices) {
      nodes.push({
        id: service.service_id,
        label: service.service_name,
        type: 'service',
        team_id: service.team_id,
        criticality: service.criticality,
        impact_score: service.estimated_impact_score,
        metadata: {
          depth: service.depth,
          impactType: service.impact_type,
          dependencyTypes: service.dependency_types
        }
      });
    }

    // Create clusters by team
    const teamGroups = new Map<string, string[]>();
    for (const node of nodes) {
      if (!teamGroups.has(node.team_id)) {
        teamGroups.set(node.team_id, []);
      }
      teamGroups.get(node.team_id)!.push(node.id);
    }

    for (const [teamId, serviceIds] of teamGroups) {
      clusters.push({
        id: `team-${teamId}`,
        label: `Team ${teamId}`,
        team_id: teamId,
        services: serviceIds,
        color: this.generateTeamColor(teamId)
      });
    }

    // Get actual dependencies to create edges
    const dependencies = await this.dependencyRepository.list({});
    const relevantServiceIds = new Set([serviceId, ...affectedServices.map(s => s.service_id)]);
    
    for (const dep of dependencies.data) {
      if (relevantServiceIds.has(dep.source_service_id) && relevantServiceIds.has(dep.target_service_id)) {
        edges.push({
          source: dep.source_service_id,
          target: dep.target_service_id,
          dependency_type: dep.dependency_type,
          criticality: dep.criticality,
          bidirectional: false,
          metadata: {
            description: dep.description,
            created_at: dep.created_at
          }
        });
      }
    }

    return {
      nodes,
      edges,
      clusters,
      layout_hints: {
        algorithm: 'hierarchical',
        direction: 'top-down',
        groupByTeam: true,
        highlightCriticalPath: true
      }
    };
  }

  /**
   * Generate a consistent color for a team
   */
  private generateTeamColor(teamId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    
    let hash = 0;
    for (let i = 0; i < teamId.length; i++) {
      hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get cached impact analysis if available and not expired
   */
  async getCachedAnalysis(serviceId: string, analysisType: string): Promise<ImpactAnalysisResult | null> {
    // This would query the impact_analysis_cache table
    // Implementation depends on whether we want to use the cache table
    return null;
  }

  /**
   * Cache impact analysis results
   */
  async cacheAnalysis(analysis: ImpactAnalysisResult, ttlHours: number = 1): Promise<void> {
    // This would store results in the impact_analysis_cache table
    // Implementation depends on whether we want to use the cache table
  }
}