/**
 * Workgroup Identification and Recommendation Service
 * 
 * Implements advanced algorithms for:
 * - Skill-based workgroup matching
 * - Historical collaboration data analysis
 * - Workgroup load and availability assessment
 * - Cross-team collaboration suggestions
 * 
 * Requirements: 4.1, 4.2, 4.3
 */

import { Logger } from '../lambda/utils/logger';
import {
  RelatedWorkgroup,
  WorkgroupSkillMatrix,
  SkillEntry,
  CapacityMetrics,
  HistoricalPerformance,
  SimilarProjectExperience,
  ResourceRequirement
} from '../models/work-task';

// ============================================================================
// Interfaces for Workgroup Identification
// ============================================================================

export interface WorkgroupIdentificationRequest {
  taskContent: string;
  technicalRequirements: string[];
  businessDomains: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedEffort: number; // hours
  timeline?: string;
  teamId: string;
}

export interface WorkgroupMatchResult {
  workgroup: RelatedWorkgroup;
  matchScore: SkillMatchScore;
  loadAssessment: LoadAssessment;
  collaborationRecommendation: CollaborationRecommendation;
}

export interface SkillMatchScore {
  overallScore: number; // 0-1
  skillCoverage: number; // percentage of required skills covered
  proficiencyMatch: number; // average proficiency level match
  recencyScore: number; // how recently skills were used
  certificationBonus: number; // bonus for certifications
  matchedSkills: SkillMatchDetail[];
  missingSkills: string[];
}

export interface SkillMatchDetail {
  skillName: string;
  required: boolean;
  proficiencyLevel: string;
  yearsExperience: number;
  lastUsed: string;
  confidenceScore: number;
  matchQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface LoadAssessment {
  currentUtilization: number; // 0-1
  availableCapacity: number; // hours per week
  recommendedAllocation: number; // hours for this task
  overloadRisk: 'none' | 'low' | 'medium' | 'high';
  availabilityWindow: {
    earliestStart: string;
    latestStart: string;
    bufferDays: number;
  };
  capacityConstraints: string[];
}

export interface CollaborationRecommendation {
  involvementType: 'lead' | 'contributor' | 'consultant' | 'reviewer' | 'approver';
  collaborationMode: 'full_time' | 'part_time' | 'on_demand' | 'advisory';
  estimatedTimeCommitment: number; // hours
  communicationChannels: string[];
  keyContactPerson?: string;
  collaborationRisks: string[];
  successFactors: string[];
}

export interface HistoricalCollaborationData {
  teamPairId: string;
  team1Id: string;
  team2Id: string;
  projectCount: number;
  successRate: number;
  averageCollaborationScore: number;
  commonChallenges: string[];
  bestPractices: string[];
  lastCollaboration: string;
}

export interface CrossTeamSuggestion {
  suggestedTeams: string[];
  reason: string;
  synergyScor
e: number;
  coordinationComplexity: 'low' | 'medium' | 'high';
  recommendedCoordinator?: string;
}

// ============================================================================
// Workgroup Identification Service
// ============================================================================

export class WorkgroupIdentificationService {
  private logger: Logger;
  private skillMatchWeights = {
    coverage: 0.35,
    proficiency: 0.25,
    recency: 0.15,
    certification: 0.10,
    confidence: 0.15
  };

  private loadAssessmentWeights = {
    availability: 0.40,
    efficiency: 0.30,
    collaboration: 0.20,
    historicalSuccess: 0.10
  };

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Identify and recommend workgroups based on skill matrices
   * Requirement 4.1: Identify related workgroups based on technology stacks and business domains
   */
  async identifyWorkgroups(
    request: WorkgroupIdentificationRequest
  ): Promise<WorkgroupMatchResult[]> {
    this.logger.info('Starting workgroup identification', { 
      teamId: request.teamId,
      requirementsCount: request.technicalRequirements.length 
    });

    // Load all available workgroup skill matrices
    const skillMatrices = await this.loadWorkgroupSkillMatrices(request.teamId);
    
    // Load historical collaboration data
    const historicalData = await this.loadHistoricalCollaborationData(request.teamId);

    const matchResults: WorkgroupMatchResult[] = [];

    // Analyze each workgroup
    for (const skillMatrix of skillMatrices) {
      // Calculate skill match score
      const skillMatchScore = this.calculateAdvancedSkillMatch(
        request.technicalRequirements,
        skillMatrix
      );

      // Skip workgroups with very low skill match
      if (skillMatchScore.overallScore < 0.2) {
        continue;
      }

      // Assess workgroup load and availability
      const loadAssessment = this.assessWorkgroupLoad(
        skillMatrix,
        request.estimatedEffort,
        request.priority
      );

      // Analyze historical performance for similar tasks
      const historicalScore = this.analyzeHistoricalPerformance(
        skillMatrix,
        request,
        historicalData
      );

      // Generate collaboration recommendation
      const collaborationRec = this.generateCollaborationRecommendation(
        skillMatrix,
        skillMatchScore,
        loadAssessment,
        request
      );

      // Calculate combined relevance score
      const relevanceScore = this.calculateCombinedRelevanceScore(
        skillMatchScore.overallScore,
        historicalScore,
        loadAssessment.currentUtilization,
        skillMatrix.capacity_metrics
      );

      // Create workgroup match result
      const workgroup: RelatedWorkgroup = {
        team_id: skillMatrix.teamId,
        team_name: skillMatrix.teamName,
        relevance_score: relevanceScore,
        reason: this.generateRecommendationReason(
          skillMatchScore,
          loadAssessment,
          historicalScore
        ),
        expertise: skillMatrix.expertise_areas,
        recommended_involvement: collaborationRec.involvementType,
        skillMatchDetails: {
          matchedSkills: skillMatchScore.matchedSkills.map(s => s.skillName),
          skillGaps: skillMatchScore.missingSkills,
          confidenceLevel: skillMatchScore.overallScore
        },
        capacityInfo: {
          currentWorkload: skillMatrix.capacity_metrics.current_workload,
          availableHours: loadAssessment.availableCapacity,
          efficiencyRating: skillMatrix.capacity_metrics.efficiency_rating
        },
        historicalPerformance: {
          successRate: skillMatrix.historical_performance.success_rate,
          averageDeliveryTime: skillMatrix.historical_performance.average_delivery_time,
          qualityScore: skillMatrix.historical_performance.quality_score,
          similarProjectCount: skillMatrix.historical_performance.similar_project_experience.length
        }
      };

      matchResults.push({
        workgroup,
        matchScore: skillMatchScore,
        loadAssessment,
        collaborationRecommendation: collaborationRec
      });
    }

    // Sort by relevance score
    matchResults.sort((a, b) => b.workgroup.relevance_score - a.workgroup.relevance_score);

    // Add cross-team collaboration suggestions
    const crossTeamSuggestions = this.generateCrossTeamSuggestions(
      matchResults,
      request
    );

    this.logger.info('Workgroup identification complete', {
      matchedWorkgroups: matchResults.length,
      crossTeamSuggestions: crossTeamSuggestions.length
    });

    return matchResults;
  }

  /**
   * Calculate advanced skill match using multiple factors
   * Requirement 4.2: Use team skill matrices and historical project data for matching
   */
  private calculateAdvancedSkillMatch(
    requirements: string[],
    skillMatrix: WorkgroupSkillMatrix
  ): SkillMatchScore {
    const matchedSkills: SkillMatchDetail[] = [];
    const missingSkills: string[] = [];
    
    let totalCoverageScore = 0;
    let totalProficiencyScore = 0;
    let totalRecencyScore = 0;
    let totalCertificationBonus = 0;
    let matchedCount = 0;

    // Analyze each required skill
    for (const requirement of requirements) {
      const matchingSkill = this.findBestMatchingSkill(requirement, skillMatrix.skills);
      
      if (matchingSkill) {
        // Calculate individual scores
        const proficiencyScore = this.getProficiencyScore(matchingSkill.proficiency_level);
        const recencyScore = this.calculateRecencyScore(matchingSkill.last_used);
        const certBonus = matchingSkill.certification_level ? 0.1 : 0;
        
        // Determine match quality
        const matchQuality = this.determineMatchQuality(
          proficiencyScore,
          recencyScore,
          matchingSkill.confidence_score
        );

        matchedSkills.push({
          skillName: matchingSkill.skill_name,
          required: true,
          proficiencyLevel: matchingSkill.proficiency_level,
          yearsExperience: matchingSkill.years_experience,
          lastUsed: matchingSkill.last_used,
          confidenceScore: matchingSkill.confidence_score,
          matchQuality
        });

        totalProficiencyScore += proficiencyScore;
        totalRecencyScore += recencyScore;
        totalCertificationBonus += certBonus;
        matchedCount++;
      } else {
        missingSkills.push(requirement);
      }
    }

    // Calculate aggregate scores
    const skillCoverage = requirements.length > 0 ? matchedCount / requirements.length : 0;
    const avgProficiency = matchedCount > 0 ? totalProficiencyScore / matchedCount : 0;
    const avgRecency = matchedCount > 0 ? totalRecencyScore / matchedCount : 0;
    const certBonus = matchedCount > 0 ? totalCertificationBonus / matchedCount : 0;

    // Calculate overall score with weighted factors
    const overallScore = (
      skillCoverage * this.skillMatchWeights.coverage +
      avgProficiency * this.skillMatchWeights.proficiency +
      avgRecency * this.skillMatchWeights.recency +
      certBonus * this.skillMatchWeights.certification
    );

    return {
      overallScore,
      skillCoverage,
      proficiencyMatch: avgProficiency,
      recencyScore: avgRecency,
      certificationBonus: certBonus,
      matchedSkills,
      missingSkills
    };
  }

  /**
   * Assess workgroup load and availability
   * Requirement 4.3: Provide contact information and professional domain information
   */
  private assessWorkgroupLoad(
    skillMatrix: WorkgroupSkillMatrix,
    estimatedEffort: number,
    priority: string
  ): LoadAssessment {
    const capacity = skillMatrix.capacity_metrics;
    
    // Calculate current utilization
    const currentUtilization = capacity.current_workload;
    
    // Calculate available capacity
    const availableCapacity = capacity.available_hours_per_week;
    
    // Determine recommended allocation based on priority and capacity
    let recommendedAllocation = Math.min(
      estimatedEffort * 0.25, // Spread over 4 weeks by default
      availableCapacity * 0.7 // Don't overcommit
    );

    // Adjust for priority
    if (priority === 'critical') {
      recommendedAllocation = Math.min(estimatedEffort * 0.5, availableCapacity);
    } else if (priority === 'high') {
      recommendedAllocation = Math.min(estimatedEffort * 0.35, availableCapacity * 0.8);
    }

    // Assess overload risk
    const projectedUtilization = currentUtilization + (recommendedAllocation / capacity.committed_hours_per_week);
    let overloadRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    
    if (projectedUtilization > 1.0) {
      overloadRisk = 'high';
    } else if (projectedUtilization > 0.9) {
      overloadRisk = 'medium';
    } else if (projectedUtilization > 0.8) {
      overloadRisk = 'low';
    }

    // Calculate availability window
    const bufferDays = this.calculateBufferDays(currentUtilization, priority);
    const earliestStart = new Date();
    earliestStart.setDate(earliestStart.getDate() + bufferDays);
    
    const latestStart = new Date(earliestStart);
    latestStart.setDate(latestStart.getDate() + 14); // 2-week window

    // Identify capacity constraints
    const capacityConstraints: string[] = [];
    if (currentUtilization > 0.8) {
      capacityConstraints.push('High current workload may impact availability');
    }
    if (availableCapacity < estimatedEffort * 0.1) {
      capacityConstraints.push('Limited weekly capacity for new work');
    }
    if (capacity.efficiency_rating < 0.7) {
      capacityConstraints.push('Team efficiency below optimal levels');
    }

    return {
      currentUtilization,
      availableCapacity,
      recommendedAllocation,
      overloadRisk,
      availabilityWindow: {
        earliestStart: earliestStart.toISOString(),
        latestStart: latestStart.toISOString(),
        bufferDays
      },
      capacityConstraints
    };
  }

  /**
   * Analyze historical performance for similar tasks
   * Requirement 4.2: Use historical project data for matching
   */
  private analyzeHistoricalPerformance(
    skillMatrix: WorkgroupSkillMatrix,
    request: WorkgroupIdentificationRequest,
    historicalData: HistoricalCollaborationData[]
  ): number {
    const performance = skillMatrix.historical_performance;
    
    // Base score from overall performance metrics
    let score = (
      performance.success_rate * 0.35 +
      performance.quality_score * 0.25 +
      (performance.collaboration_feedback || 0.8) * 0.20 +
      Math.min(performance.completed_projects / 50, 1) * 0.10
    );

    // Analyze similar project experience
    const similarProjects = performance.similar_project_experience.filter(
      exp => exp.similarity_score > 0.6
    );

    if (similarProjects.length > 0) {
      // Calculate average similarity and success rate
      const avgSimilarity = similarProjects.reduce((sum, exp) => sum + exp.similarity_score, 0) / similarProjects.length;
      const successCount = similarProjects.filter(exp => exp.outcome === 'success').length;
      const successRate = successCount / similarProjects.length;
      
      // Bonus for relevant experience
      const experienceBonus = avgSimilarity * successRate * 0.10;
      score += experienceBonus;
    }

    // Factor in historical collaboration data
    const relevantCollabs = historicalData.filter(
      collab => collab.team1Id === skillMatrix.teamId || collab.team2Id === skillMatrix.teamId
    );

    if (relevantCollabs.length > 0) {
      const avgCollabScore = relevantCollabs.reduce((sum, collab) => sum + collab.averageCollaborationScore, 0) / relevantCollabs.length;
      score = score * 0.9 + avgCollabScore * 0.1; // Blend in collaboration history
    }

    // Penalize for poor delivery times if significantly above average
    if (performance.average_delivery_time > 20) {
      score *= 0.95;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate collaboration recommendation
   * Requirement 4.3: Suggest collaboration methods and communication channels
   */
  private generateCollaborationRecommendation(
    skillMatrix: WorkgroupSkillMatrix,
    skillMatch: SkillMatchScore,
    loadAssessment: LoadAssessment,
    request: WorkgroupIdentificationRequest
  ): CollaborationRecommendation {
    // Determine involvement type based on skill match and capacity
    let involvementType: 'lead' | 'contributor' | 'consultant' | 'reviewer' | 'approver' = 'contributor';
    
    if (skillMatch.overallScore > 0.8 && loadAssessment.overloadRisk === 'none') {
      involvementType = 'lead';
    } else if (skillMatch.overallScore > 0.6) {
      involvementType = 'contributor';
    } else if (skillMatch.overallScore > 0.4) {
      involvementType = 'consultant';
    } else if (skillMatch.overallScore > 0.3) {
      involvementType = 'reviewer';
    } else {
      involvementType = 'approver';
    }

    // Determine collaboration mode
    let collaborationMode: 'full_time' | 'part_time' | 'on_demand' | 'advisory' = 'part_time';
    
    if (involvementType === 'lead' && request.priority === 'critical') {
      collaborationMode = 'full_time';
    } else if (involvementType === 'contributor') {
      collaborationMode = 'part_time';
    } else if (involvementType === 'consultant' || involvementType === 'reviewer') {
      collaborationMode = 'on_demand';
    } else {
      collaborationMode = 'advisory';
    }

    // Estimate time commitment
    const estimatedTimeCommitment = loadAssessment.recommendedAllocation;

    // Recommend communication channels
    const communicationChannels = this.recommendCommunicationChannels(
      involvementType,
      collaborationMode,
      request.priority
    );

    // Identify collaboration risks
    const collaborationRisks: string[] = [];
    if (loadAssessment.overloadRisk === 'high') {
      collaborationRisks.push('Team is currently at high capacity - may impact response times');
    }
    if (skillMatch.missingSkills.length > 0) {
      collaborationRisks.push(`Missing skills: ${skillMatch.missingSkills.slice(0, 3).join(', ')}`);
    }
    if (skillMatrix.capacity_metrics.collaboration_rating < 0.7) {
      collaborationRisks.push('Team has lower collaboration ratings - may need extra coordination');
    }

    // Identify success factors
    const successFactors: string[] = [];
    if (skillMatch.overallScore > 0.7) {
      successFactors.push('Strong skill match ensures technical capability');
    }
    if (skillMatrix.historical_performance.success_rate > 0.85) {
      successFactors.push('Proven track record of successful project delivery');
    }
    if (skillMatrix.capacity_metrics.efficiency_rating > 0.85) {
      successFactors.push('High team efficiency supports timely delivery');
    }
    if (skillMatrix.capacity_metrics.collaboration_rating > 0.85) {
      successFactors.push('Excellent collaboration skills facilitate teamwork');
    }

    return {
      involvementType,
      collaborationMode,
      estimatedTimeCommitment,
      communicationChannels,
      collaborationRisks,
      successFactors
    };
  }

  /**
   * Generate cross-team collaboration suggestions
   * Requirement 4.3: Suggest collaboration methods and communication channels
   */
  private generateCrossTeamSuggestions(
    matchResults: WorkgroupMatchResult[],
    request: WorkgroupIdentificationRequest
  ): CrossTeamSuggestion[] {
    const suggestions: CrossTeamSuggestion[] = [];

    // If multiple high-scoring teams, suggest coordination
    const highScoreTeams = matchResults.filter(r => r.workgroup.relevance_score > 0.7);
    
    if (highScoreTeams.length >= 2) {
      suggestions.push({
        suggestedTeams: highScoreTeams.map(r => r.workgroup.team_id),
        reason: 'Multiple teams have strong skill matches - coordinated effort recommended',
        synergyScore: this.calculateSynergyScore(highScoreTeams),
        coordinationComplexity: highScoreTeams.length > 3 ? 'high' : 'medium',
        recommendedCoordinator: highScoreTeams[0].workgroup.team_id
      });
    }

    // Suggest complementary teams for skill gaps
    const primaryTeam = matchResults[0];
    if (primaryTeam && primaryTeam.matchScore.missingSkills.length > 0) {
      const complementaryTeams = this.findComplementaryTeams(
        primaryTeam.matchScore.missingSkills,
        matchResults.slice(1)
      );

      if (complementaryTeams.length > 0) {
        suggestions.push({
          suggestedTeams: [primaryTeam.workgroup.team_id, ...complementaryTeams.map(t => t.workgroup.team_id)],
          reason: `Primary team needs support in: ${primaryTeam.matchScore.missingSkills.slice(0, 3).join(', ')}`,
          synergyScore: 0.8,
          coordinationComplexity: 'low',
          recommendedCoordinator: primaryTeam.workgroup.team_id
        });
      }
    }

    // Suggest architecture/management oversight for complex tasks
    if (request.priority === 'critical' || matchResults.length > 3) {
      suggestions.push({
        suggestedTeams: ['architecture-team', 'management-team'],
        reason: 'Complex multi-team effort requires architectural coordination and management oversight',
        synergyScore: 0.7,
        coordinationComplexity: 'high',
        recommendedCoordinator: 'management-team'
      });
    }

    return suggestions;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private findBestMatchingSkill(requirement: string, skills: SkillEntry[]): SkillEntry | null {
    // Direct match
    let bestMatch = skills.find(skill => 
      skill.skill_name.toLowerCase() === requirement.toLowerCase()
    );

    if (bestMatch) return bestMatch;

    // Partial match
    bestMatch = skills.find(skill =>
      skill.skill_name.toLowerCase().includes(requirement.toLowerCase()) ||
      requirement.toLowerCase().includes(skill.skill_name.toLowerCase())
    );

    if (bestMatch) return bestMatch;

    // Fuzzy match with common synonyms
    const synonymMap: { [key: string]: string[] } = {
      'api_development': ['api', 'rest', 'graphql', 'endpoint'],
      'frontend_development': ['frontend', 'ui', 'react', 'vue', 'angular'],
      'backend_development': ['backend', 'server', 'microservice'],
      'database_design': ['database', 'sql', 'nosql', 'db'],
      'security_audit': ['security', 'authentication', 'authorization'],
      'devops': ['deployment', 'ci/cd', 'infrastructure', 'aws']
    };

    for (const [skillName, synonyms] of Object.entries(synonymMap)) {
      if (synonyms.some(syn => requirement.toLowerCase().includes(syn))) {
        bestMatch = skills.find(skill => skill.skill_name === skillName);
        if (bestMatch) return bestMatch;
      }
    }

    return null;
  }

  private getProficiencyScore(level: string): number {
    const scores: { [key: string]: number } = {
      'expert': 1.0,
      'advanced': 0.8,
      'intermediate': 0.6,
      'beginner': 0.3
    };
    return scores[level] || 0.5;
  }

  private calculateRecencyScore(lastUsed: string): number {
    const lastUsedDate = new Date(lastUsed);
    const now = new Date();
    const daysSinceUsed = (now.getTime() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUsed < 30) return 1.0;
    if (daysSinceUsed < 90) return 0.9;
    if (daysSinceUsed < 180) return 0.7;
    if (daysSinceUsed < 365) return 0.5;
    return 0.3;
  }

  private determineMatchQuality(
    proficiency: number,
    recency: number,
    confidence: number
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    const avgScore = (proficiency + recency + confidence) / 3;
    
    if (avgScore >= 0.85) return 'excellent';
    if (avgScore >= 0.70) return 'good';
    if (avgScore >= 0.50) return 'fair';
    return 'poor';
  }

  private calculateBufferDays(utilization: number, priority: string): number {
    if (priority === 'critical') return 0;
    if (priority === 'high') return utilization > 0.8 ? 3 : 1;
    if (priority === 'medium') return utilization > 0.8 ? 7 : 3;
    return utilization > 0.8 ? 14 : 7;
  }

  private calculateCombinedRelevanceScore(
    skillScore: number,
    historicalScore: number,
    utilization: number,
    capacity: CapacityMetrics
  ): number {
    // Weighted combination of factors
    const availabilityScore = 1 - utilization;
    const efficiencyScore = capacity.efficiency_rating;
    const collaborationScore = capacity.collaboration_rating;

    return (
      skillScore * 0.40 +
      historicalScore * 0.25 +
      availabilityScore * 0.15 +
      efficiencyScore * 0.10 +
      collaborationScore * 0.10
    );
  }

  private generateRecommendationReason(
    skillMatch: SkillMatchScore,
    loadAssessment: LoadAssessment,
    historicalScore: number
  ): string {
    const reasons: string[] = [];

    if (skillMatch.overallScore > 0.8) {
      reasons.push(`Excellent skill match (${Math.round(skillMatch.skillCoverage * 100)}% coverage)`);
    } else if (skillMatch.overallScore > 0.6) {
      reasons.push(`Strong skill alignment with ${skillMatch.matchedSkills.length} matched skills`);
    } else {
      reasons.push(`Relevant skills in ${skillMatch.matchedSkills.slice(0, 2).map(s => s.skillName).join(', ')}`);
    }

    if (historicalScore > 0.85) {
      reasons.push('proven track record of success');
    }

    if (loadAssessment.overloadRisk === 'none') {
      reasons.push('good availability');
    } else if (loadAssessment.overloadRisk === 'low') {
      reasons.push('adequate capacity');
    }

    return reasons.join(', ');
  }

  private recommendCommunicationChannels(
    involvementType: string,
    collaborationMode: string,
    priority: string
  ): string[] {
    const channels: string[] = [];

    // Base channels for all teams
    channels.push('Email');

    // Add based on involvement and priority
    if (involvementType === 'lead' || priority === 'critical') {
      channels.push('Slack - Dedicated Channel');
      channels.push('Daily Standups');
      channels.push('Video Calls');
    } else if (involvementType === 'contributor' || collaborationMode === 'part_time') {
      channels.push('Slack - Project Channel');
      channels.push('Weekly Sync Meetings');
    } else {
      channels.push('Slack - General Channel');
      channels.push('As-needed Meetings');
    }

    // Add documentation channel
    channels.push('Confluence/Wiki');

    return channels;
  }

  private calculateSynergyScore(teams: WorkgroupMatchResult[]): number {
    // Calculate synergy based on complementary skills and collaboration history
    let synergyScore = 0.5; // Base score

    // Bonus for complementary skills
    const allSkills = new Set<string>();
    teams.forEach(team => {
      team.matchScore.matchedSkills.forEach(skill => allSkills.add(skill.skillName));
    });

    // More unique skills = better synergy
    const avgSkillsPerTeam = teams.reduce((sum, t) => sum + t.matchScore.matchedSkills.length, 0) / teams.length;
    const uniquenessRatio = allSkills.size / (avgSkillsPerTeam * teams.length);
    synergyScore += uniquenessRatio * 0.3;

    // Bonus for good collaboration ratings
    const avgCollabRating = teams.reduce((sum, t) => 
      sum + (t.workgroup.capacityInfo?.efficiencyRating || 0.7), 0
    ) / teams.length;
    synergyScore += avgCollabRating * 0.2;

    return Math.min(synergyScore, 1.0);
  }

  private findComplementaryTeams(
    missingSkills: string[],
    candidateTeams: WorkgroupMatchResult[]
  ): WorkgroupMatchResult[] {
    const complementary: WorkgroupMatchResult[] = [];

    for (const team of candidateTeams) {
      const coveredSkills = team.matchScore.matchedSkills
        .filter(skill => missingSkills.includes(skill.skillName));
      
      if (coveredSkills.length > 0) {
        complementary.push(team);
      }
    }

    return complementary.slice(0, 2); // Limit to 2 complementary teams
  }

  /**
   * Load workgroup skill matrices from data store
   * In production, this would query a database
   */
  private async loadWorkgroupSkillMatrices(teamId: string): Promise<WorkgroupSkillMatrix[]> {
    // Mock data - in production, load from DynamoDB or similar
    return [
      {
        teamId: 'security-team',
        teamName: 'Security Team',
        skills: [
          { skill_name: 'security_audit', proficiency_level: 'expert', years_experience: 5, last_used: '2024-01-01', confidence_score: 0.95 },
          { skill_name: 'vulnerability_assessment', proficiency_level: 'expert', years_experience: 4, last_used: '2024-01-15', confidence_score: 0.9 },
          { skill_name: 'compliance_checking', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-01', confidence_score: 0.85 },
          { skill_name: 'encryption', proficiency_level: 'expert', years_experience: 6, last_used: '2024-01-20', confidence_score: 0.92, certification_level: 'CISSP' }
        ],
        expertise_areas: ['Security Architecture', 'Threat Modeling', 'Compliance', 'Penetration Testing'],
        capacity_metrics: {
          current_workload: 0.7,
          available_hours_per_week: 12,
          committed_hours_per_week: 28,
          efficiency_rating: 0.88,
          collaboration_rating: 0.85
        },
        historical_performance: {
          completed_projects: 45,
          success_rate: 0.92,
          average_delivery_time: 14,
          quality_score: 0.89,
          collaboration_feedback: 0.87,
          similar_project_experience: [
            { 
              project_id: 'sec-001', 
              project_name: 'API Security Review', 
              similarity_score: 0.85, 
              role: 'lead', 
              outcome: 'success', 
              lessons_learned: ['Early security integration', 'Automated scanning'] 
            }
          ]
        },
        availability_status: 'available'
      },
      {
        teamId: 'backend-team',
        teamName: 'Backend Development Team',
        skills: [
          { skill_name: 'api_development', proficiency_level: 'expert', years_experience: 4, last_used: '2024-02-15', confidence_score: 0.93 },
          { skill_name: 'database_design', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-10', confidence_score: 0.87 },
          { skill_name: 'microservices', proficiency_level: 'advanced', years_experience: 2, last_used: '2024-02-01', confidence_score: 0.82 },
          { skill_name: 'performance_optimization', proficiency_level: 'intermediate', years_experience: 2, last_used: '2024-01-25', confidence_score: 0.75 }
        ],
        expertise_areas: ['REST APIs', 'GraphQL', 'Database Architecture', 'System Integration'],
        capacity_metrics: {
          current_workload: 0.85,
          available_hours_per_week: 6,
          committed_hours_per_week: 34,
          efficiency_rating: 0.91,
          collaboration_rating: 0.89
        },
        historical_performance: {
          completed_projects: 67,
          success_rate: 0.89,
          average_delivery_time: 18,
          quality_score: 0.86,
          collaboration_feedback: 0.91,
          similar_project_experience: [
            { 
              project_id: 'be-001', 
              project_name: 'Task Management API', 
              similarity_score: 0.78, 
              role: 'developer', 
              outcome: 'success', 
              lessons_learned: ['API versioning', 'Error handling'] 
            }
          ]
        },
        availability_status: 'busy'
      },
      {
        teamId: 'frontend-team',
        teamName: 'Frontend Development Team',
        skills: [
          { skill_name: 'react', proficiency_level: 'expert', years_experience: 4, last_used: '2024-02-20', confidence_score: 0.94 },
          { skill_name: 'typescript', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-18', confidence_score: 0.88 },
          { skill_name: 'ui_ux_design', proficiency_level: 'intermediate', years_experience: 2, last_used: '2024-02-15', confidence_score: 0.76 },
          { skill_name: 'testing', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-12', confidence_score: 0.84 }
        ],
        expertise_areas: ['React Development', 'Component Libraries', 'User Experience', 'Frontend Testing'],
        capacity_metrics: {
          current_workload: 0.6,
          available_hours_per_week: 16,
          committed_hours_per_week: 24,
          efficiency_rating: 0.87,
          collaboration_rating: 0.92
        },
        historical_performance: {
          completed_projects: 52,
          success_rate: 0.91,
          average_delivery_time: 12,
          quality_score: 0.88,
          collaboration_feedback: 0.93,
          similar_project_experience: [
            { 
              project_id: 'fe-001', 
              project_name: 'Task Dashboard UI', 
              similarity_score: 0.82, 
              role: 'lead', 
              outcome: 'success', 
              lessons_learned: ['Component reusability', 'Performance optimization'] 
            }
          ]
        },
        availability_status: 'available'
      },
      {
        teamId: 'devops-team',
        teamName: 'DevOps Team',
        skills: [
          { skill_name: 'aws_infrastructure', proficiency_level: 'expert', years_experience: 5, last_used: '2024-02-22', confidence_score: 0.96, certification_level: 'AWS Solutions Architect' },
          { skill_name: 'ci_cd', proficiency_level: 'expert', years_experience: 4, last_used: '2024-02-20', confidence_score: 0.93 },
          { skill_name: 'monitoring', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-18', confidence_score: 0.89 },
          { skill_name: 'containerization', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-15', confidence_score: 0.86 }
        ],
        expertise_areas: ['Cloud Infrastructure', 'Deployment Automation', 'Monitoring', 'Container Orchestration'],
        capacity_metrics: {
          current_workload: 0.75,
          available_hours_per_week: 10,
          committed_hours_per_week: 30,
          efficiency_rating: 0.92,
          collaboration_rating: 0.88
        },
        historical_performance: {
          completed_projects: 38,
          success_rate: 0.94,
          average_delivery_time: 8,
          quality_score: 0.91,
          collaboration_feedback: 0.89,
          similar_project_experience: [
            { 
              project_id: 'ops-001', 
              project_name: 'Task Service Deployment', 
              similarity_score: 0.75, 
              role: 'lead', 
              outcome: 'success', 
              lessons_learned: ['Infrastructure as code', 'Blue-green deployment'] 
            }
          ]
        },
        availability_status: 'available'
      },
      {
        teamId: 'data-team',
        teamName: 'Data Engineering Team',
        skills: [
          { skill_name: 'data_pipeline', proficiency_level: 'expert', years_experience: 4, last_used: '2024-02-18', confidence_score: 0.90 },
          { skill_name: 'analytics', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-15', confidence_score: 0.85 },
          { skill_name: 'machine_learning', proficiency_level: 'intermediate', years_experience: 2, last_used: '2024-01-30', confidence_score: 0.72 },
          { skill_name: 'database_optimization', proficiency_level: 'expert', years_experience: 5, last_used: '2024-02-20', confidence_score: 0.93 }
        ],
        expertise_areas: ['Data Pipelines', 'Analytics', 'Data Warehousing', 'ETL Processes'],
        capacity_metrics: {
          current_workload: 0.65,
          available_hours_per_week: 14,
          committed_hours_per_week: 26,
          efficiency_rating: 0.86,
          collaboration_rating: 0.83
        },
        historical_performance: {
          completed_projects: 29,
          success_rate: 0.88,
          average_delivery_time: 16,
          quality_score: 0.87,
          collaboration_feedback: 0.84,
          similar_project_experience: [
            { 
              project_id: 'data-001', 
              project_name: 'Analytics Dashboard', 
              similarity_score: 0.68, 
              role: 'contributor', 
              outcome: 'success', 
              lessons_learned: ['Data quality checks', 'Incremental processing'] 
            }
          ]
        },
        availability_status: 'available'
      }
    ];
  }

  /**
   * Load historical collaboration data
   * In production, this would query collaboration history from database
   */
  private async loadHistoricalCollaborationData(teamId: string): Promise<HistoricalCollaborationData[]> {
    // Mock data - in production, load from database
    return [
      {
        teamPairId: 'backend-frontend',
        team1Id: 'backend-team',
        team2Id: 'frontend-team',
        projectCount: 15,
        successRate: 0.93,
        averageCollaborationScore: 0.89,
        commonChallenges: ['API contract alignment', 'Timeline coordination'],
        bestPractices: ['Regular sync meetings', 'Shared documentation', 'Early integration testing'],
        lastCollaboration: '2024-01-15'
      },
      {
        teamPairId: 'backend-security',
        team1Id: 'backend-team',
        team2Id: 'security-team',
        projectCount: 8,
        successRate: 0.88,
        averageCollaborationScore: 0.85,
        commonChallenges: ['Security requirements clarity', 'Performance vs security tradeoffs'],
        bestPractices: ['Security review checkpoints', 'Threat modeling sessions'],
        lastCollaboration: '2024-02-01'
      },
      {
        teamPairId: 'devops-backend',
        team1Id: 'devops-team',
        team2Id: 'backend-team',
        projectCount: 12,
        successRate: 0.92,
        averageCollaborationScore: 0.91,
        commonChallenges: ['Deployment timing', 'Environment configuration'],
        bestPractices: ['Infrastructure as code', 'Automated deployment pipelines', 'Rollback procedures'],
        lastCollaboration: '2024-02-10'
      },
      {
        teamPairId: 'frontend-data',
        team1Id: 'frontend-team',
        team2Id: 'data-team',
        projectCount: 6,
        successRate: 0.83,
        averageCollaborationScore: 0.80,
        commonChallenges: ['Data format agreements', 'Real-time data requirements'],
        bestPractices: ['API specification first', 'Mock data for development'],
        lastCollaboration: '2023-12-20'
      }
    ];
  }
}
