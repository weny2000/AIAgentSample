/**
 * Intelligent Todo Generation and Optimization Service
 * Implements advanced algorithms for task decomposition, dependency analysis,
 * workload estimation, and team-based task assignment
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../lambda/utils/logger';
import {
  TodoItem,
  TodoGenerationContext,
  ResourceAvailability,
  TimeConstraint,
  DependencyNode,
  RiskFactor,
  QualityRequirement,
  WorkgroupSkillMatrix,
  RelatedWorkgroup,
  EffortEstimate,
  EffortBreakdown,
  TaskDependency
} from '../models/work-task';

// ============================================================================
// Interfaces for Todo Generation
// ============================================================================

export interface TaskComplexityAnalysis {
  overall_complexity: number; // 0-1
  technical_complexity: number;
  scope_complexity: number;
  integration_complexity: number;
  uncertainty_level: number;
  decomposition_depth: number; // recommended levels of breakdown
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyEdge[];
  critical_path: string[];
  parallel_tracks: string[][];
}

export interface DependencyGraphNode {
  id: string;
  title: string;
  type: 'task' | 'milestone' | 'approval' | 'external';
  estimated_hours: number;
  earliest_start: number;
  latest_start: number;
  slack: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish';
  lag_hours: number;
}

export interface WorkloadEstimationModel {
  base_estimate: number;
  complexity_multiplier: number;
  risk_buffer: number;
  team_efficiency_factor: number;
  historical_accuracy: number;
}


export interface TeamAssignmentRecommendation {
  todo_id: string;
  recommended_teams: TeamRecommendation[];
  assignment_confidence: number;
  reasoning: string[];
}

export interface TeamRecommendation {
  team_id: string;
  team_name: string;
  suitability_score: number;
  skill_match_score: number;
  capacity_score: number;
  experience_score: number;
  availability_score: number;
  estimated_completion_time: number;
  risk_factors: string[];
}

export interface OptimizationResult {
  original_todo_count: number;
  optimized_todo_count: number;
  improvements: OptimizationImprovement[];
  estimated_time_savings: number;
  risk_reduction: number;
}

export interface OptimizationImprovement {
  type: 'merge' | 'split' | 'reorder' | 'reassign' | 'parallelize';
  description: string;
  impact: 'high' | 'medium' | 'low';
  affected_todos: string[];
}

// ============================================================================
// Main Service Class
// ============================================================================

export class IntelligentTodoGenerationService {
  constructor(private logger: Logger) {}

  /**
   * Generate optimized todo list with intelligent decomposition and assignment
   */
  async generateOptimizedTodoList(
    taskContent: string,
    keyPoints: string[],
    context: TodoGenerationContext,
    workgroups: RelatedWorkgroup[]
  ): Promise<TodoItem[]> {
    this.logger.info('Starting intelligent todo generation', {
      keyPointsCount: keyPoints.length,
      contextComplexity: context.task_complexity
    });

    // 1. Analyze task complexity
    const complexityAnalysis = this.analyzeTaskComplexity(taskContent, keyPoints, context);

    // 2. Perform automatic decomposition
    const decomposedTasks = await this.decomposeTaskAutomatically(
      taskContent,
      keyPoints,
      complexityAnalysis,
      context
    );

    // 3. Build and analyze dependency graph
    const dependencyGraph = this.buildDependencyGraph(decomposedTasks, context);

    // 4. Estimate workload using ML-based models
    const estimatedTasks = await this.estimateWorkloadWithML(
      decomposedTasks,
      complexityAnalysis,
      workgroups
    );

    // 5. Generate team assignment recommendations
    const assignedTasks = await this.assignTasksToTeams(
      estimatedTasks,
      workgroups,
      context
    );

    // 6. Optimize and sort tasks
    const optimizedTasks = this.optimizeTodoList(
      assignedTasks,
      dependencyGraph,
      context
    );

    this.logger.info('Todo generation completed', {
      totalTasks: optimizedTasks.length,
      complexity: complexityAnalysis.overall_complexity
    });

    return optimizedTasks;
  }


  /**
   * Analyze task complexity using multiple dimensions
   */
  private analyzeTaskComplexity(
    taskContent: string,
    keyPoints: string[],
    context: TodoGenerationContext
  ): TaskComplexityAnalysis {
    // Technical complexity based on keywords and patterns
    const technicalComplexity = this.calculateTechnicalComplexity(taskContent, keyPoints);

    // Scope complexity based on content length and key points
    const scopeComplexity = this.calculateScopeComplexity(taskContent, keyPoints);

    // Integration complexity based on dependencies and external systems
    const integrationComplexity = this.calculateIntegrationComplexity(context);

    // Uncertainty level based on risk factors and constraints
    const uncertaintyLevel = this.calculateUncertaintyLevel(context);

    // Overall complexity (weighted average)
    const overallComplexity = 
      technicalComplexity * 0.3 +
      scopeComplexity * 0.25 +
      integrationComplexity * 0.25 +
      uncertaintyLevel * 0.2;

    // Determine decomposition depth based on complexity
    const decompositionDepth = this.calculateDecompositionDepth(overallComplexity);

    return {
      overall_complexity: overallComplexity,
      technical_complexity: technicalComplexity,
      scope_complexity: scopeComplexity,
      integration_complexity: integrationComplexity,
      uncertainty_level: uncertaintyLevel,
      decomposition_depth
    };
  }

  /**
   * Calculate technical complexity based on technical indicators
   */
  private calculateTechnicalComplexity(taskContent: string, keyPoints: string[]): number {
    let complexity = 0;
    const lowerContent = taskContent.toLowerCase();

    // Technical patterns that indicate complexity
    const complexityIndicators = [
      { patterns: ['microservice', 'distributed', 'scalability', 'high availability'], weight: 0.15 },
      { patterns: ['security', 'authentication', 'encryption', 'compliance'], weight: 0.12 },
      { patterns: ['integration', 'api', 'third-party', 'external system'], weight: 0.10 },
      { patterns: ['database', 'migration', 'schema', 'data model'], weight: 0.08 },
      { patterns: ['performance', 'optimization', 'caching', 'load balancing'], weight: 0.10 },
      { patterns: ['real-time', 'streaming', 'websocket', 'event-driven'], weight: 0.12 },
      { patterns: ['machine learning', 'ai', 'algorithm', 'model training'], weight: 0.15 },
      { patterns: ['legacy', 'refactor', 'migration', 'modernization'], weight: 0.10 }
    ];

    for (const indicator of complexityIndicators) {
      const matchCount = indicator.patterns.filter(pattern => 
        lowerContent.includes(pattern)
      ).length;
      complexity += matchCount * indicator.weight;
    }

    // Add complexity based on key points count
    complexity += Math.min(0.2, keyPoints.length * 0.02);

    return Math.min(1.0, complexity);
  }

  /**
   * Calculate scope complexity based on content analysis
   */
  private calculateScopeComplexity(taskContent: string, keyPoints: string[]): number {
    let complexity = 0;

    // Content length indicator
    const contentLength = taskContent.length;
    complexity += Math.min(0.3, contentLength / 10000);

    // Key points count indicator
    complexity += Math.min(0.3, keyPoints.length / 20);

    // Multiple system/component indicator
    const systemKeywords = ['system', 'component', 'module', 'service', 'layer'];
    const systemCount = systemKeywords.filter(keyword =>
      taskContent.toLowerCase().split(keyword).length - 1 > 1
    ).length;
    complexity += Math.min(0.2, systemCount * 0.05);

    // Multiple stakeholder indicator
    const stakeholderKeywords = ['team', 'department', 'stakeholder', 'user group'];
    const stakeholderCount = stakeholderKeywords.filter(keyword =>
      taskContent.toLowerCase().includes(keyword)
    ).length;
    complexity += Math.min(0.2, stakeholderCount * 0.05);

    return Math.min(1.0, complexity);
  }

  /**
   * Calculate integration complexity based on dependencies
   */
  private calculateIntegrationComplexity(context: TodoGenerationContext): number {
    let complexity = 0;

    // Dependency count
    const dependencyCount = context.dependency_graph.length;
    complexity += Math.min(0.4, dependencyCount * 0.05);

    // External dependencies
    const externalDeps = context.dependency_graph.filter(
      node => node.node_type === 'external'
    ).length;
    complexity += Math.min(0.3, externalDeps * 0.1);

    // Critical dependencies
    const criticalDeps = context.dependency_graph.filter(
      node => node.criticality === 'critical' || node.criticality === 'high'
    ).length;
    complexity += Math.min(0.3, criticalDeps * 0.08);

    return Math.min(1.0, complexity);
  }

  /**
   * Calculate uncertainty level based on risk factors
   */
  private calculateUncertaintyLevel(context: TodoGenerationContext): number {
    let uncertainty = 0;

    // Risk factors
    const highRisks = context.risk_factors.filter(
      risk => risk.probability * risk.impact > 0.5
    ).length;
    uncertainty += Math.min(0.4, highRisks * 0.1);

    // Time constraints
    const hardDeadlines = context.time_constraints.filter(
      constraint => constraint.constraint_type === 'hard_deadline'
    ).length;
    uncertainty += Math.min(0.3, hardDeadlines * 0.1);

    // Resource availability
    const limitedResources = context.available_resources.filter(
      resource => resource.availability_percentage < 0.5
    ).length;
    uncertainty += Math.min(0.3, limitedResources * 0.1);

    return Math.min(1.0, uncertainty);
  }

  /**
   * Calculate recommended decomposition depth
   */
  private calculateDecompositionDepth(overallComplexity: number): number {
    if (overallComplexity < 0.3) return 1; // Simple tasks: minimal breakdown
    if (overallComplexity < 0.5) return 2; // Moderate tasks: 2 levels
    if (overallComplexity < 0.7) return 3; // Complex tasks: 3 levels
    return 4; // Very complex tasks: deep breakdown
  }


  /**
   * Automatically decompose task based on complexity analysis
   */
  private async decomposeTaskAutomatically(
    taskContent: string,
    keyPoints: string[],
    complexityAnalysis: TaskComplexityAnalysis,
    context: TodoGenerationContext
  ): Promise<TodoItem[]> {
    const todos: TodoItem[] = [];

    // Extract main phases from key points
    const phases = this.identifyTaskPhases(keyPoints, taskContent);

    // Decompose each phase based on complexity
    for (const phase of phases) {
      const phaseTodos = await this.decomposePhase(
        phase,
        complexityAnalysis,
        context,
        todos.length
      );
      todos.push(...phaseTodos);
    }

    // Add cross-cutting concerns (testing, documentation, etc.)
    const crossCuttingTodos = this.generateCrossCuttingTasks(
      taskContent,
      complexityAnalysis,
      context
    );
    todos.push(...crossCuttingTodos);

    return todos;
  }

  /**
   * Identify main task phases from key points
   */
  private identifyTaskPhases(keyPoints: string[], taskContent: string): TaskPhase[] {
    const phases: TaskPhase[] = [];

    // Standard software development phases
    const phasePatterns = [
      { name: 'Planning & Design', keywords: ['design', 'plan', 'architecture', 'specification'], category: 'research' },
      { name: 'Setup & Configuration', keywords: ['setup', 'configure', 'initialize', 'install'], category: 'development' },
      { name: 'Core Implementation', keywords: ['implement', 'develop', 'create', 'build'], category: 'development' },
      { name: 'Integration', keywords: ['integrate', 'connect', 'link', 'sync'], category: 'development' },
      { name: 'Testing & Validation', keywords: ['test', 'validate', 'verify', 'qa'], category: 'testing' },
      { name: 'Documentation', keywords: ['document', 'readme', 'guide', 'manual'], category: 'documentation' },
      { name: 'Deployment', keywords: ['deploy', 'release', 'launch', 'publish'], category: 'approval' },
      { name: 'Review & Approval', keywords: ['review', 'approve', 'sign-off', 'acceptance'], category: 'review' }
    ];

    for (const pattern of phasePatterns) {
      const relevantKeyPoints = keyPoints.filter(kp => {
        const lowerKp = kp.toLowerCase();
        return pattern.keywords.some(keyword => lowerKp.includes(keyword));
      });

      if (relevantKeyPoints.length > 0) {
        phases.push({
          name: pattern.name,
          category: pattern.category as any,
          keyPoints: relevantKeyPoints,
          priority: this.calculatePhasePriority(pattern.name, relevantKeyPoints)
        });
      }
    }

    // Ensure at least core phases exist
    if (phases.length === 0) {
      phases.push({
        name: 'Core Implementation',
        category: 'development',
        keyPoints: keyPoints.slice(0, 5),
        priority: 'high'
      });
    }

    return phases;
  }

  /**
   * Decompose a phase into individual todos
   */
  private async decomposePhase(
    phase: TaskPhase,
    complexityAnalysis: TaskComplexityAnalysis,
    context: TodoGenerationContext,
    startIndex: number
  ): Promise<TodoItem[]> {
    const todos: TodoItem[] = [];
    const tasksPerPhase = Math.max(1, Math.ceil(phase.keyPoints.length / 2));

    for (let i = 0; i < Math.min(tasksPerPhase, phase.keyPoints.length); i++) {
      const keyPoint = phase.keyPoints[i];
      
      const todo: TodoItem = {
        id: uuidv4(),
        title: this.generateTodoTitle(keyPoint, phase.name),
        description: this.generateTodoDescription(keyPoint, phase, context),
        priority: phase.priority,
        estimated_hours: 0, // Will be estimated later
        dependencies: [],
        category: phase.category,
        status: 'pending',
        related_workgroups: [],
        risk_level: this.assessTodoRiskLevel(keyPoint, context),
        success_criteria: this.generateSuccessCriteria(keyPoint, phase),
        validation_status: 'pending'
      };

      todos.push(todo);
    }

    return todos;
  }

  /**
   * Generate cross-cutting tasks (testing, docs, etc.)
   */
  private generateCrossCuttingTasks(
    taskContent: string,
    complexityAnalysis: TaskComplexityAnalysis,
    context: TodoGenerationContext
  ): TodoItem[] {
    const todos: TodoItem[] = [];

    // Add testing task if complexity warrants it
    if (complexityAnalysis.overall_complexity > 0.3) {
      todos.push({
        id: uuidv4(),
        title: 'Implement comprehensive testing suite',
        description: 'Create unit tests, integration tests, and end-to-end tests for all components',
        priority: 'high',
        estimated_hours: 0,
        dependencies: [],
        category: 'testing',
        status: 'pending',
        related_workgroups: [],
        risk_level: 'medium',
        success_criteria: ['All tests pass', 'Code coverage > 80%'],
        validation_status: 'pending'
      });
    }

    // Add documentation task
    if (complexityAnalysis.overall_complexity > 0.4) {
      todos.push({
        id: uuidv4(),
        title: 'Create technical documentation',
        description: 'Document architecture, APIs, and deployment procedures',
        priority: 'medium',
        estimated_hours: 0,
        dependencies: [],
        category: 'documentation',
        status: 'pending',
        related_workgroups: [],
        risk_level: 'low',
        success_criteria: ['Documentation complete', 'Peer reviewed'],
        validation_status: 'pending'
      });
    }

    return todos;
  }


  /**
   * Build dependency graph and identify critical path
   */
  private buildDependencyGraph(
    todos: TodoItem[],
    context: TodoGenerationContext
  ): DependencyGraph {
    const nodes: DependencyGraphNode[] = [];
    const edges: DependencyEdge[] = [];

    // Create nodes for each todo
    for (const todo of todos) {
      nodes.push({
        id: todo.id,
        title: todo.title,
        type: 'task',
        estimated_hours: todo.estimated_hours,
        earliest_start: 0,
        latest_start: 0,
        slack: 0
      });
    }

    // Identify dependencies based on task categories and content
    for (let i = 0; i < todos.length; i++) {
      const currentTodo = todos[i];
      
      // Standard phase dependencies
      const dependencies = this.identifyTaskDependencies(currentTodo, todos, context);
      
      for (const depId of dependencies) {
        edges.push({
          from: depId,
          to: currentTodo.id,
          type: 'finish_to_start',
          lag_hours: 0
        });
        
        if (!currentTodo.dependencies.includes(depId)) {
          currentTodo.dependencies.push(depId);
        }
      }
    }

    // Calculate critical path using forward and backward pass
    this.calculateCriticalPath(nodes, edges);

    // Identify parallel tracks
    const parallelTracks = this.identifyParallelTracks(nodes, edges);

    // Extract critical path
    const criticalPath = nodes
      .filter(node => node.slack === 0)
      .map(node => node.id);

    return {
      nodes,
      edges,
      critical_path: criticalPath,
      parallel_tracks: parallelTracks
    };
  }

  /**
   * Identify dependencies for a task
   */
  private identifyTaskDependencies(
    todo: TodoItem,
    allTodos: TodoItem[],
    context: TodoGenerationContext
  ): string[] {
    const dependencies: string[] = [];

    // Category-based dependencies
    const categoryDependencies: { [key: string]: string[] } = {
      'development': ['research'],
      'testing': ['development'],
      'review': ['testing', 'development'],
      'approval': ['review', 'testing'],
      'documentation': ['development']
    };

    const requiredCategories = categoryDependencies[todo.category] || [];
    
    for (const category of requiredCategories) {
      const dependentTodos = allTodos.filter(t => 
        t.category === category && t.id !== todo.id
      );
      
      if (dependentTodos.length > 0) {
        // Add dependency to the last task in that category
        dependencies.push(dependentTodos[dependentTodos.length - 1].id);
      }
    }

    // Content-based dependencies (if task mentions another task)
    for (const otherTodo of allTodos) {
      if (otherTodo.id === todo.id) continue;
      
      const titleWords = otherTodo.title.toLowerCase().split(' ');
      const descWords = todo.description.toLowerCase();
      
      const hasReference = titleWords.some(word => 
        word.length > 4 && descWords.includes(word)
      );
      
      if (hasReference && !dependencies.includes(otherTodo.id)) {
        dependencies.push(otherTodo.id);
      }
    }

    return dependencies;
  }

  /**
   * Calculate critical path using CPM algorithm
   */
  private calculateCriticalPath(
    nodes: DependencyGraphNode[],
    edges: DependencyEdge[]
  ): void {
    // Forward pass - calculate earliest start times
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    for (const node of nodes) {
      const incomingEdges = edges.filter(e => e.to === node.id);
      
      if (incomingEdges.length === 0) {
        node.earliest_start = 0;
      } else {
        node.earliest_start = Math.max(
          ...incomingEdges.map(edge => {
            const fromNode = nodeMap.get(edge.from)!;
            return fromNode.earliest_start + fromNode.estimated_hours + edge.lag_hours;
          })
        );
      }
    }

    // Backward pass - calculate latest start times
    const maxTime = Math.max(...nodes.map(n => n.earliest_start + n.estimated_hours));
    
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const outgoingEdges = edges.filter(e => e.from === node.id);
      
      if (outgoingEdges.length === 0) {
        node.latest_start = maxTime - node.estimated_hours;
      } else {
        node.latest_start = Math.min(
          ...outgoingEdges.map(edge => {
            const toNode = nodeMap.get(edge.to)!;
            return toNode.latest_start - node.estimated_hours - edge.lag_hours;
          })
        );
      }
      
      node.slack = node.latest_start - node.earliest_start;
    }
  }

  /**
   * Identify parallel execution tracks
   */
  private identifyParallelTracks(
    nodes: DependencyGraphNode[],
    edges: DependencyEdge[]
  ): string[][] {
    const tracks: string[][] = [];
    const visited = new Set<string>();

    for (const node of nodes) {
      if (visited.has(node.id)) continue;
      
      // Find all nodes that can run in parallel with this one
      const parallelNodes = nodes.filter(other => {
        if (other.id === node.id || visited.has(other.id)) return false;
        
        // Check if there's no dependency path between them
        return !this.hasPathBetween(node.id, other.id, edges) &&
               !this.hasPathBetween(other.id, node.id, edges);
      });

      if (parallelNodes.length > 0) {
        const track = [node.id, ...parallelNodes.map(n => n.id)];
        tracks.push(track);
        track.forEach(id => visited.add(id));
      }
    }

    return tracks;
  }

  /**
   * Check if there's a path between two nodes
   */
  private hasPathBetween(fromId: string, toId: string, edges: DependencyEdge[]): boolean {
    const visited = new Set<string>();
    const queue = [fromId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === toId) return true;
      if (visited.has(current)) continue;
      
      visited.add(current);
      
      const outgoing = edges.filter(e => e.from === current);
      queue.push(...outgoing.map(e => e.to));
    }

    return false;
  }


  /**
   * Estimate workload using ML-based models
   */
  private async estimateWorkloadWithML(
    todos: TodoItem[],
    complexityAnalysis: TaskComplexityAnalysis,
    workgroups: RelatedWorkgroup[]
  ): Promise<TodoItem[]> {
    for (const todo of todos) {
      const model = this.buildWorkloadEstimationModel(
        todo,
        complexityAnalysis,
        workgroups
      );

      todo.estimated_hours = this.calculateEstimatedHours(todo, model);
    }

    return todos;
  }

  /**
   * Build workload estimation model for a task
   */
  private buildWorkloadEstimationModel(
    todo: TodoItem,
    complexityAnalysis: TaskComplexityAnalysis,
    workgroups: RelatedWorkgroup[]
  ): WorkloadEstimationModel {
    // Base estimate from category
    const categoryBaseHours: { [key: string]: number } = {
      'research': 8,
      'development': 16,
      'testing': 12,
      'review': 4,
      'approval': 2,
      'documentation': 6
    };

    const baseEstimate = categoryBaseHours[todo.category] || 8;

    // Complexity multiplier
    const complexityMultiplier = 1 + (complexityAnalysis.overall_complexity * 1.5);

    // Risk buffer (add time for high-risk tasks)
    const riskMultipliers = {
      'low': 1.1,
      'medium': 1.25,
      'high': 1.5,
      'critical': 2.0
    };
    const riskBuffer = riskMultipliers[todo.risk_level || 'medium'];

    // Team efficiency factor from historical performance
    const avgEfficiency = workgroups.length > 0
      ? workgroups.reduce((sum, wg) => 
          sum + (wg.historicalPerformance?.qualityScore || 0.7), 0
        ) / workgroups.length
      : 0.7;
    
    const teamEfficiencyFactor = 1 / Math.max(0.5, avgEfficiency);

    // Historical accuracy (simulated - in production, use actual data)
    const historicalAccuracy = 0.85;

    return {
      base_estimate: baseEstimate,
      complexity_multiplier: complexityMultiplier,
      risk_buffer: riskBuffer,
      team_efficiency_factor: teamEfficiencyFactor,
      historical_accuracy: historicalAccuracy
    };
  }

  /**
   * Calculate estimated hours using the model
   */
  private calculateEstimatedHours(
    todo: TodoItem,
    model: WorkloadEstimationModel
  ): number {
    // Apply all factors
    let estimate = model.base_estimate;
    estimate *= model.complexity_multiplier;
    estimate *= model.risk_buffer;
    estimate *= model.team_efficiency_factor;

    // Add buffer for dependencies
    const dependencyBuffer = 1 + (todo.dependencies.length * 0.1);
    estimate *= dependencyBuffer;

    // Round to nearest 0.5 hours
    estimate = Math.round(estimate * 2) / 2;

    // Apply confidence interval based on historical accuracy
    const confidenceRange = estimate * (1 - model.historical_accuracy);
    const optimistic = estimate - confidenceRange;
    const pessimistic = estimate + confidenceRange;

    // Return realistic estimate (weighted average)
    return Math.round((optimistic * 0.2 + estimate * 0.6 + pessimistic * 0.2) * 2) / 2;
  }

  /**
   * Assign tasks to teams based on capabilities
   */
  private async assignTasksToTeams(
    todos: TodoItem[],
    workgroups: RelatedWorkgroup[],
    context: TodoGenerationContext
  ): Promise<TodoItem[]> {
    for (const todo of todos) {
      const recommendations = this.generateTeamAssignmentRecommendations(
        todo,
        workgroups,
        context
      );

      // Assign to best matching team
      if (recommendations.recommended_teams.length > 0) {
        const bestTeam = recommendations.recommended_teams[0];
        todo.related_workgroups = [bestTeam.team_id];
        
        // Optionally assign to specific team member (simplified)
        if (bestTeam.suitability_score > 0.8) {
          todo.assigned_to = `${bestTeam.team_id}-lead`;
        }
      }
    }

    return todos;
  }

  /**
   * Generate team assignment recommendations
   */
  private generateTeamAssignmentRecommendations(
    todo: TodoItem,
    workgroups: RelatedWorkgroup[],
    context: TodoGenerationContext
  ): TeamAssignmentRecommendation {
    const recommendations: TeamRecommendation[] = [];

    for (const workgroup of workgroups) {
      const skillMatchScore = this.calculateSkillMatchScore(todo, workgroup);
      const capacityScore = this.calculateCapacityScore(workgroup, context);
      const experienceScore = this.calculateExperienceScore(todo, workgroup);
      const availabilityScore = this.calculateAvailabilityScore(workgroup);

      // Overall suitability (weighted average)
      const suitabilityScore = 
        skillMatchScore * 0.35 +
        capacityScore * 0.25 +
        experienceScore * 0.25 +
        availabilityScore * 0.15;

      // Estimate completion time based on team efficiency
      const baseHours = todo.estimated_hours;
      const efficiencyFactor = workgroup.historicalPerformance?.qualityScore || 0.7;
      const estimatedCompletionTime = baseHours / Math.max(0.5, efficiencyFactor);

      recommendations.push({
        team_id: workgroup.team_id,
        team_name: workgroup.team_name,
        suitability_score: suitabilityScore,
        skill_match_score: skillMatchScore,
        capacity_score: capacityScore,
        experience_score: experienceScore,
        availability_score: availabilityScore,
        estimated_completion_time: estimatedCompletionTime,
        risk_factors: this.identifyTeamRiskFactors(workgroup, todo)
      });
    }

    // Sort by suitability score
    recommendations.sort((a, b) => b.suitability_score - a.suitability_score);

    // Calculate overall confidence
    const avgScore = recommendations.length > 0
      ? recommendations.reduce((sum, r) => sum + r.suitability_score, 0) / recommendations.length
      : 0;

    return {
      todo_id: todo.id,
      recommended_teams: recommendations,
      assignment_confidence: avgScore,
      reasoning: this.generateAssignmentReasoning(todo, recommendations)
    };
  }

  /**
   * Calculate skill match score
   */
  private calculateSkillMatchScore(todo: TodoItem, workgroup: RelatedWorkgroup): number {
    if (!workgroup.skillMatchDetails) return 0.5;

    const matchedSkills = workgroup.skillMatchDetails.matchedSkills.length;
    const totalSkills = matchedSkills + workgroup.skillMatchDetails.skillGaps.length;

    if (totalSkills === 0) return 0.5;

    const matchRatio = matchedSkills / totalSkills;
    const confidenceBoost = workgroup.skillMatchDetails.confidenceLevel;

    return matchRatio * 0.7 + confidenceBoost * 0.3;
  }

  /**
   * Calculate capacity score
   */
  private calculateCapacityScore(
    workgroup: RelatedWorkgroup,
    context: TodoGenerationContext
  ): number {
    if (!workgroup.capacityInfo) return 0.5;

    const workloadScore = 1 - workgroup.capacityInfo.currentWorkload;
    const availabilityScore = workgroup.capacityInfo.availableHours / 40; // Normalize to 40-hour week
    const efficiencyScore = workgroup.capacityInfo.efficiencyRating;

    return workloadScore * 0.4 + availabilityScore * 0.3 + efficiencyScore * 0.3;
  }

  /**
   * Calculate experience score
   */
  private calculateExperienceScore(todo: TodoItem, workgroup: RelatedWorkgroup): number {
    if (!workgroup.historicalPerformance) return 0.5;

    const successRate = workgroup.historicalPerformance.successRate;
    const qualityScore = workgroup.historicalPerformance.qualityScore;
    const similarProjectCount = Math.min(1, workgroup.historicalPerformance.similarProjectCount / 10);

    return successRate * 0.4 + qualityScore * 0.4 + similarProjectCount * 0.2;
  }

  /**
   * Calculate availability score
   */
  private calculateAvailabilityScore(workgroup: RelatedWorkgroup): number {
    if (!workgroup.capacityInfo) return 0.5;

    const availableHours = workgroup.capacityInfo.availableHours;
    const maxScore = Math.min(1, availableHours / 20); // 20 hours = full availability

    return maxScore;
  }

  /**
   * Identify risk factors for team assignment
   */
  private identifyTeamRiskFactors(workgroup: RelatedWorkgroup, todo: TodoItem): string[] {
    const risks: string[] = [];

    if (workgroup.capacityInfo && workgroup.capacityInfo.currentWorkload > 0.8) {
      risks.push('High current workload may impact delivery timeline');
    }

    if (workgroup.skillMatchDetails && workgroup.skillMatchDetails.skillGaps.length > 0) {
      risks.push(`Skill gaps: ${workgroup.skillMatchDetails.skillGaps.join(', ')}`);
    }

    if (workgroup.historicalPerformance && workgroup.historicalPerformance.successRate < 0.7) {
      risks.push('Below-average historical success rate');
    }

    return risks;
  }

  /**
   * Generate reasoning for assignment recommendations
   */
  private generateAssignmentReasoning(
    todo: TodoItem,
    recommendations: TeamRecommendation[]
  ): string[] {
    const reasoning: string[] = [];

    if (recommendations.length === 0) {
      reasoning.push('No suitable teams found for this task');
      return reasoning;
    }

    const topTeam = recommendations[0];

    if (topTeam.skill_match_score > 0.8) {
      reasoning.push(`${topTeam.team_name} has excellent skill match for this task`);
    }

    if (topTeam.experience_score > 0.8) {
      reasoning.push(`${topTeam.team_name} has strong experience with similar tasks`);
    }

    if (topTeam.capacity_score > 0.7) {
      reasoning.push(`${topTeam.team_name} has good availability`);
    }

    if (topTeam.risk_factors.length > 0) {
      reasoning.push(`Note: ${topTeam.risk_factors[0]}`);
    }

    return reasoning;
  }


  /**
   * Optimize todo list for better execution
   */
  private optimizeTodoList(
    todos: TodoItem[],
    dependencyGraph: DependencyGraph,
    context: TodoGenerationContext
  ): TodoItem[] {
    const improvements: OptimizationImprovement[] = [];

    // 1. Merge similar tasks
    const mergedTodos = this.mergeSimilarTasks(todos, improvements);

    // 2. Split overly complex tasks
    const splitTodos = this.splitComplexTasks(mergedTodos, improvements);

    // 3. Reorder based on dependencies and priorities
    const reorderedTodos = this.reorderTasks(splitTodos, dependencyGraph, improvements);

    // 4. Identify parallelization opportunities
    this.markParallelizableTasks(reorderedTodos, dependencyGraph, improvements);

    // Log optimization results
    this.logger.info('Todo list optimization completed', {
      originalCount: todos.length,
      optimizedCount: reorderedTodos.length,
      improvementsCount: improvements.length
    });

    return reorderedTodos;
  }

  /**
   * Merge similar or redundant tasks
   */
  private mergeSimilarTasks(
    todos: TodoItem[],
    improvements: OptimizationImprovement[]
  ): TodoItem[] {
    const merged: TodoItem[] = [];
    const processed = new Set<string>();

    for (const todo of todos) {
      if (processed.has(todo.id)) continue;

      // Find similar tasks
      const similar = todos.filter(other => 
        !processed.has(other.id) &&
        other.id !== todo.id &&
        this.areSimilarTasks(todo, other)
      );

      if (similar.length > 0) {
        // Merge tasks
        const mergedTodo = this.mergeTasks(todo, similar);
        merged.push(mergedTodo);
        
        processed.add(todo.id);
        similar.forEach(s => processed.add(s.id));

        improvements.push({
          type: 'merge',
          description: `Merged ${similar.length + 1} similar tasks into one`,
          impact: 'medium',
          affected_todos: [todo.id, ...similar.map(s => s.id)]
        });
      } else {
        merged.push(todo);
        processed.add(todo.id);
      }
    }

    return merged;
  }

  /**
   * Check if two tasks are similar enough to merge
   */
  private areSimilarTasks(task1: TodoItem, task2: TodoItem): boolean {
    // Same category and priority
    if (task1.category !== task2.category) return false;

    // Similar titles (word overlap > 50%)
    const words1 = new Set(task1.title.toLowerCase().split(' '));
    const words2 = new Set(task2.title.toLowerCase().split(' '));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    
    return similarity > 0.5;
  }

  /**
   * Merge multiple tasks into one
   */
  private mergeTasks(primary: TodoItem, others: TodoItem[]): TodoItem {
    const merged: TodoItem = {
      ...primary,
      description: [primary.description, ...others.map(o => o.description)].join('\n\n'),
      estimated_hours: primary.estimated_hours + others.reduce((sum, o) => sum + o.estimated_hours, 0),
      dependencies: [...new Set([...primary.dependencies, ...others.flatMap(o => o.dependencies)])],
      related_workgroups: [...new Set([...primary.related_workgroups, ...others.flatMap(o => o.related_workgroups)])],
      success_criteria: [
        ...(primary.success_criteria || []),
        ...others.flatMap(o => o.success_criteria || [])
      ]
    };

    return merged;
  }

  /**
   * Split overly complex tasks
   */
  private splitComplexTasks(
    todos: TodoItem[],
    improvements: OptimizationImprovement[]
  ): TodoItem[] {
    const result: TodoItem[] = [];

    for (const todo of todos) {
      // Check if task is too complex (> 40 hours or multiple success criteria)
      const isComplex = todo.estimated_hours > 40 || 
                       (todo.success_criteria && todo.success_criteria.length > 5);

      if (isComplex) {
        const subtasks = this.splitTask(todo);
        result.push(...subtasks);

        improvements.push({
          type: 'split',
          description: `Split complex task into ${subtasks.length} subtasks`,
          impact: 'high',
          affected_todos: [todo.id]
        });
      } else {
        result.push(todo);
      }
    }

    return result;
  }

  /**
   * Split a task into subtasks
   */
  private splitTask(todo: TodoItem): TodoItem[] {
    const subtasks: TodoItem[] = [];
    const targetHours = 20; // Target hours per subtask
    const numSubtasks = Math.ceil(todo.estimated_hours / targetHours);

    for (let i = 0; i < numSubtasks; i++) {
      const subtask: TodoItem = {
        ...todo,
        id: uuidv4(),
        title: `${todo.title} - Part ${i + 1}`,
        estimated_hours: todo.estimated_hours / numSubtasks,
        parent_task_id: todo.id,
        dependencies: i === 0 ? todo.dependencies : [subtasks[i - 1].id]
      };

      subtasks.push(subtask);
    }

    return subtasks;
  }

  /**
   * Reorder tasks based on dependencies and priorities
   */
  private reorderTasks(
    todos: TodoItem[],
    dependencyGraph: DependencyGraph,
    improvements: OptimizationImprovement[]
  ): TodoItem[] {
    // Topological sort with priority consideration
    const sorted: TodoItem[] = [];
    const visited = new Set<string>();
    const todoMap = new Map(todos.map(t => [t.id, t]));

    // Helper function for DFS
    const visit = (todoId: string) => {
      if (visited.has(todoId)) return;
      visited.add(todoId);

      const todo = todoMap.get(todoId);
      if (!todo) return;

      // Visit dependencies first
      for (const depId of todo.dependencies) {
        visit(depId);
      }

      sorted.push(todo);
    };

    // Start with high-priority tasks
    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorityOrder) {
      const priorityTodos = todos.filter(t => t.priority === priority);
      for (const todo of priorityTodos) {
        visit(todo.id);
      }
    }

    // Visit any remaining tasks
    for (const todo of todos) {
      visit(todo.id);
    }

    if (sorted.length !== todos.length) {
      improvements.push({
        type: 'reorder',
        description: 'Reordered tasks based on dependencies and priorities',
        impact: 'medium',
        affected_todos: sorted.map(t => t.id)
      });
    }

    return sorted;
  }

  /**
   * Mark tasks that can be parallelized
   */
  private markParallelizableTasks(
    todos: TodoItem[],
    dependencyGraph: DependencyGraph,
    improvements: OptimizationImprovement[]
  ): void {
    for (const track of dependencyGraph.parallel_tracks) {
      if (track.length > 1) {
        improvements.push({
          type: 'parallelize',
          description: `Identified ${track.length} tasks that can run in parallel`,
          impact: 'high',
          affected_todos: track
        });
      }
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculatePhasePriority(phaseName: string, keyPoints: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalPhases = ['Core Implementation', 'Security', 'Integration'];
    const highPhases = ['Testing & Validation', 'Planning & Design'];
    
    if (criticalPhases.some(p => phaseName.includes(p))) return 'critical';
    if (highPhases.some(p => phaseName.includes(p))) return 'high';
    
    return 'medium';
  }

  private generateTodoTitle(keyPoint: string, phaseName: string): string {
    // Clean up key point and create concise title
    let title = keyPoint.replace(/^[⚠️🔒⚡🎯]\s*/, '').trim();
    
    // Limit length
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }

    return title;
  }

  private generateTodoDescription(
    keyPoint: string,
    phase: TaskPhase,
    context: TodoGenerationContext
  ): string {
    let description = `Phase: ${phase.name}\n\n`;
    description += `Key Point: ${keyPoint}\n\n`;
    
    // Add relevant context
    if (context.quality_requirements.length > 0) {
      description += `Quality Requirements: ${context.quality_requirements.length} standards to meet\n`;
    }

    return description;
  }

  private assessTodoRiskLevel(
    keyPoint: string,
    context: TodoGenerationContext
  ): 'low' | 'medium' | 'high' | 'critical' {
    const lowerKeyPoint = keyPoint.toLowerCase();
    
    // Check for risk indicators
    if (lowerKeyPoint.includes('⚠️') || lowerKeyPoint.includes('critical')) {
      return 'critical';
    }
    
    const highRiskKeywords = ['security', 'compliance', 'migration', 'integration'];
    if (highRiskKeywords.some(keyword => lowerKeyPoint.includes(keyword))) {
      return 'high';
    }

    const mediumRiskKeywords = ['performance', 'scalability', 'refactor'];
    if (mediumRiskKeywords.some(keyword => lowerKeyPoint.includes(keyword))) {
      return 'medium';
    }

    return 'low';
  }

  private generateSuccessCriteria(keyPoint: string, phase: TaskPhase): string[] {
    const criteria: string[] = [];

    // Phase-specific criteria
    const phaseCriteria: { [key: string]: string[] } = {
      'Planning & Design': ['Design document approved', 'Architecture reviewed'],
      'Core Implementation': ['Code implemented', 'Unit tests passing'],
      'Testing & Validation': ['All tests passing', 'Quality gates met'],
      'Documentation': ['Documentation complete', 'Peer reviewed'],
      'Deployment': ['Successfully deployed', 'Smoke tests passing']
    };

    const defaultCriteria = phaseCriteria[phase.name] || ['Task completed', 'Reviewed by peer'];
    criteria.push(...defaultCriteria);

    return criteria;
  }
}

// ============================================================================
// Supporting Interfaces
// ============================================================================

interface TaskPhase {
  name: string;
  category: 'research' | 'development' | 'review' | 'approval' | 'documentation' | 'testing';
  keyPoints: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}
