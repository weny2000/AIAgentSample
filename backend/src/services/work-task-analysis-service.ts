/**
 * 工作任务分析服务
 * 分析工作内容，提取要点，识别相关工作组，生成TODO列表
 */

import { v4 as uuidv4 } from 'uuid';
import { KendraSearchService, SearchRequest } from './kendra-search-service';
import { EnhancedKnowledgeSearchService, SemanticSearchRequest } from './enhanced-knowledge-search-service';
import { WorkgroupIdentificationService, WorkgroupIdentificationRequest } from './workgroup-identification-service';
import { IntelligentTodoGenerationService } from './intelligent-todo-generation-service';
import { RulesEngineService } from '../rules-engine/rules-engine-service';
import { Logger } from '../lambda/utils/logger';
import { AuditLogRepository } from '../repositories/audit-log-repository';
import { 
  WorkTaskRecord,
  TaskAnalysisResult,
  TodoItem,
  DeliverableRequirement,
  QualityRequirement,
  RelatedWorkgroup,
  KnowledgeReference,
  RiskAssessment,
  EnhancedRiskAssessment,
  RiskFactor,
  RiskMatrix,
  RiskGridCell,
  MitigationTimeline,
  MitigationAction,
  ContingencyPlan,
  MonitoringIndicator,
  EffortEstimate,
  TaskDependency,
  ComplianceCheck,
  TodoGenerationContext,
  ResourceAvailability,
  TimeConstraint,
  DependencyNode,
  WorkgroupSkillMatrix,
  SkillEntry,
  CapacityMetrics,
  HistoricalPerformance,
  SimilarProjectExperience,
  ImpactAnalysis,
  ResourceRequirement,
  EffortBreakdown
} from '../models/work-task';


// Legacy interface for backward compatibility
export interface WorkTaskContent {
  id: string;
  title: string;
  description: string;
  content: string;
  submittedBy: string;
  teamId: string;
  submittedAt: Date;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  tags?: string[];
}

// Enhanced interfaces for improved key point extraction
interface ExtractedKeyPoint {
  text: string;
  importance: number;
  extractionMethod: 'sentence_analysis' | 'technical_pattern' | 'performance_pattern' | 'action_pattern' | 'constraint_pattern' | 'risk_pattern';
  context: string;
  keywords: string[];
  finalScore?: number;
}

interface SentenceContext {
  text: string;
  position: number;
  context: {
    previous: string;
    next: string;
  };
  section: SectionType;
}

type SectionType = 'title' | 'introduction' | 'requirements' | 'technical' | 'conclusion' | 'general';

// Enhanced interfaces for workgroup identification
interface WorkgroupSkillMatrix {
  teamId: string;
  teamName: string;
  skills: SkillEntry[];
  expertise_areas: string[];
  capacity_metrics: CapacityMetrics;
  historical_performance: HistoricalPerformance;
  availability_status: 'available' | 'busy' | 'overloaded' | 'unavailable';
}

interface SkillEntry {
  skill_name: string;
  proficiency_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  years_experience: number;
  certification_level?: string;
  last_used: string;
  confidence_score: number; // 0-1
}

interface CapacityMetrics {
  current_workload: number; // 0-1 (percentage)
  available_hours_per_week: number;
  committed_hours_per_week: number;
  efficiency_rating: number; // 0-1
  collaboration_rating: number; // 0-1
}

interface HistoricalPerformance {
  completed_projects: number;
  success_rate: number; // 0-1
  average_delivery_time: number; // in days
  quality_score: number; // 0-1
  collaboration_feedback: number; // 0-1
  similar_project_experience: SimilarProjectExperience[];
}

interface SimilarProjectExperience {
  project_id: string;
  project_name: string;
  similarity_score: number; // 0-1
  role: string;
  outcome: 'success' | 'partial_success' | 'failure';
  lessons_learned: string[];
}

// Enhanced interfaces for todo generation
interface TodoGenerationContext {
  task_complexity: number; // 0-1
  available_resources: ResourceAvailability[];
  time_constraints: TimeConstraint[];
  dependency_graph: DependencyNode[];
  risk_factors: RiskFactor[];
  quality_requirements: QualityRequirement[];
}

interface ResourceAvailability {
  resource_type: 'human' | 'technical' | 'financial';
  resource_id: string;
  availability_percentage: number; // 0-1
  skills: string[];
  cost_per_hour?: number;
}

interface TimeConstraint {
  constraint_type: 'hard_deadline' | 'soft_deadline' | 'milestone' | 'dependency';
  date: string;
  description: string;
  flexibility: number; // 0-1, how flexible this constraint is
}

interface DependencyNode {
  node_id: string;
  node_type: 'task' | 'resource' | 'approval' | 'external';
  dependencies: string[];
  estimated_duration: number;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

// Enhanced interfaces for risk assessment
interface EnhancedRiskAssessment extends RiskAssessment {
  risk_matrix: RiskMatrix;
  mitigation_timeline: MitigationTimeline[];
  contingency_plans: ContingencyPlan[];
  monitoring_indicators: MonitoringIndicator[];
}

interface RiskMatrix {
  probability_impact_grid: RiskGridCell[][];
  risk_appetite: 'low' | 'medium' | 'high';
  acceptable_risk_threshold: number; // 0-1
}

interface RiskGridCell {
  probability_range: [number, number];
  impact_range: [number, number];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  action_required: 'monitor' | 'mitigate' | 'avoid' | 'transfer';
}

interface MitigationTimeline {
  risk_id: string;
  mitigation_actions: MitigationAction[];
  timeline: string;
  responsible_party: string;
  success_criteria: string[];
}

interface MitigationAction {
  action_id: string;
  description: string;
  effort_required: number; // hours
  cost_estimate?: number;
  effectiveness: number; // 0-1
}

interface ContingencyPlan {
  plan_id: string;
  trigger_conditions: string[];
  actions: string[];
  resource_requirements: ResourceRequirement[];
  activation_criteria: string;
}

interface MonitoringIndicator {
  indicator_name: string;
  current_value: number;
  threshold_value: number;
  trend: 'improving' | 'stable' | 'deteriorating';
  monitoring_frequency: 'daily' | 'weekly' | 'monthly';
}

// Interfaces now imported from models/work-task.ts

export class WorkTaskAnalysisService {
  private enhancedSearchService: EnhancedKnowledgeSearchService;
  private workgroupIdentificationService: WorkgroupIdentificationService;
  private intelligentTodoService: IntelligentTodoGenerationService;

  constructor(
    private kendraService: KendraSearchService,
    private rulesEngine: RulesEngineService,
    private auditRepository: AuditLogRepository,
    private logger: Logger
  ) {
    this.enhancedSearchService = new EnhancedKnowledgeSearchService(kendraService);
    this.workgroupIdentificationService = new WorkgroupIdentificationService(logger);
    this.intelligentTodoService = new IntelligentTodoGenerationService(logger);
  }

  /**
   * 分析工作任务内容并生成完整的分析报告
   */
  async analyzeWorkTask(taskContent: WorkTaskContent): Promise<TaskAnalysisResult> {
    try {
      this.logger.info('开始分析工作任务', { 
        taskId: taskContent.id,
        teamId: taskContent.teamId,
        submittedBy: taskContent.submittedBy 
      });

      // 1. 提取关键要点
      const keyPoints = await this.extractKeyPoints(taskContent);

      // 2. 搜索相关知识库
      const knowledgeReferences = await this.searchRelevantKnowledge(taskContent);

      // 3. 识别相关工作组
      const relatedWorkgroups = await this.identifyRelatedWorkgroups(taskContent, keyPoints);

      // 4. 生成TODO列表
      const todoList = await this.generateTodoList(taskContent, keyPoints, knowledgeReferences);

      // 5. 风险评估
      const riskAssessment = await this.assessRisks(taskContent, keyPoints, relatedWorkgroups);

      // 6. 工作量估算
      const estimatedEffort = await this.estimateEffort(todoList, riskAssessment);

      // 7. 依赖关系分析
      const dependencies = await this.analyzeDependencies(taskContent, todoList);

      // 8. 合规性检查
      const complianceChecks = await this.performComplianceChecks(taskContent);

      // 9. 生成建议
      const recommendations = await this.generateRecommendations(
        taskContent, 
        riskAssessment, 
        relatedWorkgroups,
        complianceChecks
      );

      const result: TaskAnalysisResult = {
        taskId: taskContent.id,
        keyPoints,
        relatedWorkgroups,
        todoList,
        knowledgeReferences,
        riskAssessment,
        recommendations,
        estimatedEffort,
        dependencies,
        complianceChecks
      };

      // 记录审计日志
      await this.auditRepository.create({
        request_id: taskContent.id,
        user_id: taskContent.submittedBy,
        persona: 'work_task_analyzer',
        action: 'work_task_analyzed',
        references: knowledgeReferences.map(ref => ({
          source_id: ref.sourceId,
          source_type: ref.sourceType,
          confidence_score: ref.relevanceScore,
          snippet: ref.snippet
        })),
        result_summary: `任务分析完成: ${keyPoints.length}个要点, ${todoList.length}个待办事项, ${relatedWorkgroups.length}个相关工作组`,
        compliance_score: this.calculateOverallComplianceScore(complianceChecks),
        team_id: taskContent.teamId,
        session_id: taskContent.id
      });

      this.logger.info('工作任务分析完成', { 
        taskId: taskContent.id,
        keyPointsCount: keyPoints.length,
        todoItemsCount: todoList.length,
        relatedWorkgroupsCount: relatedWorkgroups.length
      });

      return result;

    } catch (error) {
      this.logger.error('工作任务分析失败', error as Error, { taskContent });
      throw error;
    }
  }

  /**
   * 提取任务内容的关键要点 - Enhanced with detailed algorithms
   */
  private async extractKeyPoints(taskContent: WorkTaskContent): Promise<string[]> {
    const keyPoints: string[] = [];
    const content = `${taskContent.title} ${taskContent.description} ${taskContent.content}`;

    // Enhanced multi-layered key point extraction
    const extractedPoints = await this.performAdvancedKeyPointExtraction(content, taskContent);
    
    // Apply semantic filtering and ranking
    const rankedPoints = this.rankKeyPointsByImportance(extractedPoints, taskContent);
    
    // Apply contextual enhancement
    const enhancedPoints = this.enhanceKeyPointsWithContext(rankedPoints, taskContent);
    
    return enhancedPoints.slice(0, 12); // Increased limit for better coverage
  }

  /**
   * Advanced key point extraction using multiple algorithms
   */
  private async performAdvancedKeyPointExtraction(content: string, taskContent: WorkTaskContent): Promise<ExtractedKeyPoint[]> {
    const extractedPoints: ExtractedKeyPoint[] = [];

    // 1. Sentence-based extraction with enhanced patterns
    const sentences = this.extractSentencesWithContext(content);
    for (const sentenceData of sentences) {
      const importance = this.calculateSentenceImportance(sentenceData, taskContent);
      if (importance > 0.3) {
        extractedPoints.push({
          text: sentenceData.text,
          importance,
          extractionMethod: 'sentence_analysis',
          context: sentenceData.context,
          keywords: this.extractKeywordsFromSentence(sentenceData.text)
        });
      }
    }

    // 2. Pattern-based extraction for technical requirements
    const technicalPatterns = this.extractTechnicalPatterns(content);
    extractedPoints.push(...technicalPatterns);

    // 3. Action-oriented extraction
    const actionItems = this.extractActionOrientedPoints(content);
    extractedPoints.push(...actionItems);

    // 4. Constraint and requirement extraction
    const constraints = this.extractConstraintsAndRequirements(content);
    extractedPoints.push(...constraints);

    // 5. Risk and dependency indicators
    const riskIndicators = this.extractRiskAndDependencyIndicators(content);
    extractedPoints.push(...riskIndicators);

    return extractedPoints;
  }

  /**
   * Extract sentences with contextual information
   */
  private extractSentencesWithContext(content: string): SentenceContext[] {
    const sentences = content.split(/[.!?。！？]/);
    const contexts: SentenceContext[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length > 15) {
        contexts.push({
          text: sentence,
          position: i,
          context: {
            previous: i > 0 ? sentences[i - 1].trim() : '',
            next: i < sentences.length - 1 ? sentences[i + 1].trim() : ''
          },
          section: this.identifySectionType(sentence, i, sentences.length)
        });
      }
    }

    return contexts;
  }

  /**
   * Calculate sentence importance using multiple factors
   */
  private calculateSentenceImportance(sentenceData: SentenceContext, taskContent: WorkTaskContent): number {
    let importance = 0;

    // 1. Keyword-based scoring
    const criticalKeywords = [
      // Action verbs
      { words: ['implement', 'develop', 'create', 'build', 'design', '实现', '开发', '创建', '构建', '设计'], weight: 0.3 },
      // Requirements
      { words: ['must', 'require', 'need', 'should', 'essential', '必须', '需要', '要求', '应该', '关键'], weight: 0.4 },
      // Technical terms
      { words: ['api', 'database', 'security', 'performance', 'integration', '接口', '数据库', '安全', '性能', '集成'], weight: 0.25 },
      // Quality indicators
      { words: ['test', 'validate', 'verify', 'review', 'approve', '测试', '验证', '审查', '批准'], weight: 0.2 },
      // Risk indicators
      { words: ['risk', 'issue', 'problem', 'challenge', 'constraint', '风险', '问题', '挑战', '约束'], weight: 0.35 }
    ];

    const lowerText = sentenceData.text.toLowerCase();
    for (const keywordGroup of criticalKeywords) {
      const matchCount = keywordGroup.words.filter(word => lowerText.includes(word.toLowerCase())).length;
      importance += matchCount * keywordGroup.weight;
    }

    // 2. Position-based scoring (earlier sentences often more important)
    const positionScore = Math.max(0, 0.2 - (sentenceData.position * 0.02));
    importance += positionScore;

    // 3. Section-based scoring
    const sectionMultipliers = {
      'title': 0.4,
      'introduction': 0.3,
      'requirements': 0.35,
      'technical': 0.3,
      'conclusion': 0.15,
      'general': 0.2
    };
    importance *= sectionMultipliers[sentenceData.section] || 0.2;

    // 4. Length and complexity scoring
    const lengthScore = Math.min(0.2, sentenceData.text.length / 200);
    importance += lengthScore;

    // 5. Priority-based amplification
    const priorityMultipliers = {
      'critical': 1.5,
      'high': 1.3,
      'medium': 1.1,
      'low': 1.0
    };
    importance *= priorityMultipliers[taskContent.priority || 'medium'];

    return Math.min(1.0, importance);
  }

  /**
   * Extract technical patterns and requirements
   */
  private extractTechnicalPatterns(content: string): ExtractedKeyPoint[] {
    const patterns: ExtractedKeyPoint[] = [];
    const lowerContent = content.toLowerCase();

    // Technical architecture patterns
    const architecturePatterns = [
      /microservice[s]?\s+architecture/gi,
      /api\s+gateway/gi,
      /load\s+balancer/gi,
      /database\s+design/gi,
      /security\s+framework/gi,
      /authentication\s+system/gi,
      /monitoring\s+solution/gi
    ];

    for (const pattern of architecturePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          patterns.push({
            text: `Technical requirement: ${match}`,
            importance: 0.7,
            extractionMethod: 'technical_pattern',
            context: 'architecture',
            keywords: match.split(/\s+/)
          });
        });
      }
    }

    // Performance and scalability requirements
    const performancePatterns = [
      /response\s+time\s+[<≤]\s*\d+\s*(ms|seconds?)/gi,
      /throughput\s+[>≥]\s*\d+\s*(rps|requests)/gi,
      /concurrent\s+users?\s+[>≥]\s*\d+/gi,
      /availability\s+[>≥]\s*\d+(\.\d+)?%/gi
    ];

    for (const pattern of performancePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          patterns.push({
            text: `Performance requirement: ${match}`,
            importance: 0.8,
            extractionMethod: 'performance_pattern',
            context: 'performance',
            keywords: match.split(/\s+/)
          });
        });
      }
    }

    return patterns;
  }

  /**
   * Extract action-oriented key points
   */
  private extractActionOrientedPoints(content: string): ExtractedKeyPoint[] {
    const actionPoints: ExtractedKeyPoint[] = [];
    
    // Action verb patterns with context
    const actionPatterns = [
      { pattern: /(?:need to|must|should|will)\s+([^.!?。！？]{10,100})/gi, importance: 0.6 },
      { pattern: /(?:implement|develop|create|build|design)\s+([^.!?。！？]{10,100})/gi, importance: 0.7 },
      { pattern: /(?:integrate|connect|link|sync)\s+([^.!?。！？]{10,100})/gi, importance: 0.65 },
      { pattern: /(?:test|validate|verify|ensure)\s+([^.!?。！？]{10,100})/gi, importance: 0.55 },
      { pattern: /(?:deploy|release|launch|publish)\s+([^.!?。！？]{10,100})/gi, importance: 0.6 }
    ];

    for (const actionPattern of actionPatterns) {
      const matches = [...content.matchAll(actionPattern.pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim().length > 10) {
          actionPoints.push({
            text: match[0].trim(),
            importance: actionPattern.importance,
            extractionMethod: 'action_pattern',
            context: 'action_item',
            keywords: this.extractKeywordsFromSentence(match[1])
          });
        }
      });
    }

    return actionPoints;
  }

  /**
   * Extract constraints and requirements
   */
  private extractConstraintsAndRequirements(content: string): ExtractedKeyPoint[] {
    const constraints: ExtractedKeyPoint[] = [];

    // Constraint patterns
    const constraintPatterns = [
      { pattern: /(?:constraint|limitation|restriction):\s*([^.!?。！？]{10,150})/gi, importance: 0.75 },
      { pattern: /(?:deadline|due date|timeline):\s*([^.!?。！？]{5,100})/gi, importance: 0.8 },
      { pattern: /(?:budget|cost|resource)\s+(?:limit|constraint):\s*([^.!?。！？]{5,100})/gi, importance: 0.7 },
      { pattern: /(?:compliance|regulation|standard):\s*([^.!?。！？]{10,150})/gi, importance: 0.85 },
      { pattern: /(?:dependency|depends on|requires):\s*([^.!?。！？]{10,150})/gi, importance: 0.7 }
    ];

    for (const constraintPattern of constraintPatterns) {
      const matches = [...content.matchAll(constraintPattern.pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim().length > 5) {
          constraints.push({
            text: `Constraint: ${match[1].trim()}`,
            importance: constraintPattern.importance,
            extractionMethod: 'constraint_pattern',
            context: 'constraint',
            keywords: this.extractKeywordsFromSentence(match[1])
          });
        }
      });
    }

    return constraints;
  }

  /**
   * Extract risk and dependency indicators
   */
  private extractRiskAndDependencyIndicators(content: string): ExtractedKeyPoint[] {
    const indicators: ExtractedKeyPoint[] = [];

    // Risk indicator patterns
    const riskPatterns = [
      { pattern: /(?:risk|concern|issue|problem):\s*([^.!?。！？]{10,150})/gi, importance: 0.8 },
      { pattern: /(?:potential|possible|might|could)\s+(?:cause|lead to|result in)\s+([^.!?。！？]{10,150})/gi, importance: 0.6 },
      { pattern: /(?:challenge|difficulty|obstacle):\s*([^.!?。！？]{10,150})/gi, importance: 0.65 }
    ];

    for (const riskPattern of riskPatterns) {
      const matches = [...content.matchAll(riskPattern.pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim().length > 10) {
          indicators.push({
            text: `Risk indicator: ${match[1].trim()}`,
            importance: riskPattern.importance,
            extractionMethod: 'risk_pattern',
            context: 'risk',
            keywords: this.extractKeywordsFromSentence(match[1])
          });
        }
      });
    }

    return indicators;
  }

  /**
   * Rank key points by importance and relevance
   */
  private rankKeyPointsByImportance(extractedPoints: ExtractedKeyPoint[], taskContent: WorkTaskContent): ExtractedKeyPoint[] {
    // Apply additional scoring based on task context
    const scoredPoints = extractedPoints.map(point => ({
      ...point,
      finalScore: this.calculateFinalScore(point, taskContent)
    }));

    // Sort by final score and remove duplicates
    const uniquePoints = this.removeDuplicateKeyPoints(scoredPoints);
    
    return uniquePoints
      .sort((a, b) => b.finalScore - a.finalScore)
      .filter(point => point.finalScore > 0.2); // Filter out low-quality points
  }

  /**
   * Calculate final score considering multiple factors
   */
  private calculateFinalScore(point: ExtractedKeyPoint, taskContent: WorkTaskContent): number {
    let score = point.importance;

    // Boost score based on extraction method reliability
    const methodMultipliers = {
      'sentence_analysis': 1.0,
      'technical_pattern': 1.3,
      'performance_pattern': 1.4,
      'action_pattern': 1.2,
      'constraint_pattern': 1.35,
      'risk_pattern': 1.25
    };
    score *= methodMultipliers[point.extractionMethod] || 1.0;

    // Boost score based on keyword relevance to task category
    if (taskContent.category) {
      const categoryKeywords = this.getCategoryKeywords(taskContent.category);
      const keywordMatches = point.keywords.filter(keyword => 
        categoryKeywords.some(catKeyword => 
          keyword.toLowerCase().includes(catKeyword.toLowerCase())
        )
      ).length;
      score += keywordMatches * 0.1;
    }

    // Boost score based on tag relevance
    if (taskContent.tags && taskContent.tags.length > 0) {
      const tagMatches = point.keywords.filter(keyword =>
        taskContent.tags!.some(tag =>
          keyword.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(keyword.toLowerCase())
        )
      ).length;
      score += tagMatches * 0.15;
    }

    return Math.min(1.0, score);
  }

  /**
   * Remove duplicate key points using semantic similarity
   */
  private removeDuplicateKeyPoints(points: ExtractedKeyPoint[]): ExtractedKeyPoint[] {
    const uniquePoints: ExtractedKeyPoint[] = [];
    
    for (const point of points) {
      const isDuplicate = uniquePoints.some(existing => 
        this.calculateTextSimilarity(point.text, existing.text) > 0.7
      );
      
      if (!isDuplicate) {
        uniquePoints.push(point);
      } else {
        // If duplicate, keep the one with higher score
        const existingIndex = uniquePoints.findIndex(existing =>
          this.calculateTextSimilarity(point.text, existing.text) > 0.7
        );
        if (existingIndex !== -1 && point.finalScore > uniquePoints[existingIndex].finalScore) {
          uniquePoints[existingIndex] = point;
        }
      }
    }

    return uniquePoints;
  }

  /**
   * Enhance key points with additional context
   */
  private enhanceKeyPointsWithContext(points: ExtractedKeyPoint[], taskContent: WorkTaskContent): string[] {
    return points.map(point => {
      let enhancedText = point.text;

      // Add context indicators
      if (point.context === 'risk') {
        enhancedText = `⚠️ ${enhancedText}`;
      } else if (point.context === 'constraint') {
        enhancedText = `🔒 ${enhancedText}`;
      } else if (point.context === 'performance') {
        enhancedText = `⚡ ${enhancedText}`;
      } else if (point.context === 'action_item') {
        enhancedText = `🎯 ${enhancedText}`;
      }

      // Ensure proper capitalization and formatting
      enhancedText = this.formatKeyPointText(enhancedText);

      return enhancedText;
    });
  }

  // Helper methods for enhanced key point extraction
  private identifySectionType(sentence: string, position: number, totalSentences: number): SectionType {
    const lowerSentence = sentence.toLowerCase();
    
    if (position === 0) return 'title';
    if (position < totalSentences * 0.2) return 'introduction';
    if (lowerSentence.includes('requirement') || lowerSentence.includes('must') || lowerSentence.includes('need')) return 'requirements';
    if (lowerSentence.includes('technical') || lowerSentence.includes('architecture') || lowerSentence.includes('implementation')) return 'technical';
    if (position > totalSentences * 0.8) return 'conclusion';
    
    return 'general';
  }

  private extractKeywordsFromSentence(sentence: string): string[] {
    // Simple keyword extraction - in production, use NLP libraries
    const words = sentence.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
    
    return [...new Set(words)]; // Remove duplicates
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      '的', '了', '在', '是', '我', '你', '他', '她', '它', '们', '这', '那', '有', '没', '不', '也', '都', '很', '就', '还'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  private getCategoryKeywords(category: string): string[] {
    const categoryKeywords: { [key: string]: string[] } = {
      'development': ['code', 'programming', 'software', 'application', 'system', 'feature'],
      'security': ['security', 'authentication', 'authorization', 'encryption', 'vulnerability'],
      'performance': ['performance', 'optimization', 'speed', 'efficiency', 'scalability'],
      'testing': ['test', 'testing', 'validation', 'verification', 'quality', 'bug'],
      'documentation': ['documentation', 'manual', 'guide', 'specification', 'readme'],
      'deployment': ['deployment', 'release', 'production', 'staging', 'environment']
    };
    
    return categoryKeywords[category.toLowerCase()] || [];
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity - in production, use more sophisticated methods
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private formatKeyPointText(text: string): string {
    // Clean up and format the text
    let formatted = text.trim();
    
    // Ensure first letter is capitalized
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    
    // Ensure proper ending punctuation
    if (!/[.!?。！？]$/.test(formatted)) {
      formatted += '.';
    }
    
    return formatted;
  }

  /**
   * 搜索相关知识库内容 - Enhanced with semantic search and historical learning
   */
  private async searchRelevantKnowledge(taskContent: WorkTaskContent): Promise<KnowledgeReference[]> {
    try {
      // Extract contextual keywords from task content
      const contextualKeywords = this.extractContextualKeywords(taskContent);

      // Build comprehensive search query
      const mainQuery = `${taskContent.title} ${taskContent.description}`;

      // Use enhanced search with semantic similarity and historical patterns
      const enhancedRequest: SemanticSearchRequest = {
        query: mainQuery.trim(),
        teamId: taskContent.teamId,
        limit: 10,
        semanticBoost: true,
        includeHistoricalPatterns: true,
        contextualKeywords,
        taskCategory: taskContent.category
      };

      const enhancedResults = await this.enhancedSearchService.enhancedSearch(enhancedRequest);

      // Convert enhanced results to knowledge references
      const references = enhancedResults.results.map(result => ({
        sourceId: result.id,
        sourceType: this.mapSourceType(result.type),
        title: result.title || 'Untitled',
        snippet: result.excerpt,
        relevanceScore: result.combinedScore, // Use combined score instead of just confidence
        url: result.uri,
        lastUpdated: result.sourceAttributes.last_updated ? new Date(result.sourceAttributes.last_updated) : undefined,
        metadata: {
          semanticScore: result.semanticScore,
          historicalRelevance: result.historicalRelevance,
          patternMatchScore: result.patternMatchScore,
          matchedPatterns: result.matchedPatterns,
          relatedQueries: result.relatedQueries
        }
      }));

      // Also search for tag-specific content if tags are provided
      if (taskContent.tags && taskContent.tags.length > 0) {
        for (const tag of taskContent.tags.slice(0, 3)) { // Limit to top 3 tags
          const tagRequest: SemanticSearchRequest = {
            query: tag,
            teamId: taskContent.teamId,
            limit: 3,
            semanticBoost: true,
            contextualKeywords: [tag, ...contextualKeywords.slice(0, 2)]
          };

          const tagResults = await this.enhancedSearchService.enhancedSearch(tagRequest);
          
          const tagReferences = tagResults.results.map(result => ({
            sourceId: result.id,
            sourceType: this.mapSourceType(result.type),
            title: result.title || 'Untitled',
            snippet: result.excerpt,
            relevanceScore: result.combinedScore * 0.8, // Slightly lower weight for tag-based results
            url: result.uri,
            lastUpdated: result.sourceAttributes.last_updated ? new Date(result.sourceAttributes.last_updated) : undefined
          }));

          references.push(...tagReferences);
        }
      }

      // Deduplicate and sort by relevance score
      const uniqueReferences = this.deduplicateReferences(references);
      return uniqueReferences.slice(0, 15); // Limit to top 15 references

    } catch (error) {
      this.logger.error('搜索知识库失败', error as Error);
      return [];
    }
  }

  /**
   * Extract contextual keywords from task content for enhanced search
   */
  private extractContextualKeywords(taskContent: WorkTaskContent): string[] {
    const keywords: string[] = [];

    // Add priority as context
    if (taskContent.priority) {
      keywords.push(taskContent.priority);
    }

    // Add category as context
    if (taskContent.category) {
      keywords.push(taskContent.category);
    }

    // Add tags as context
    if (taskContent.tags) {
      keywords.push(...taskContent.tags);
    }

    // Extract technical terms from content
    const technicalTerms = this.extractTechnicalTerms(taskContent.content);
    keywords.push(...technicalTerms.slice(0, 5)); // Top 5 technical terms

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Extract technical terms from content
   */
  private extractTechnicalTerms(content: string): string[] {
    const terms: string[] = [];

    // Extract camelCase and PascalCase terms
    const camelCaseTerms = content.match(/\b[a-z]+(?:[A-Z][a-z]*)+\b/g);
    if (camelCaseTerms) terms.push(...camelCaseTerms);

    // Extract hyphenated technical terms
    const hyphenatedTerms = content.match(/\b\w+(?:-\w+)+\b/g);
    if (hyphenatedTerms) terms.push(...hyphenatedTerms);

    // Extract common technical keywords
    const technicalKeywords = [
      'API', 'REST', 'GraphQL', 'database', 'authentication', 'authorization',
      'security', 'performance', 'scalability', 'deployment', 'testing',
      'integration', 'microservice', 'serverless', 'cloud', 'AWS', 'Azure'
    ];

    const lowerContent = content.toLowerCase();
    for (const keyword of technicalKeywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        terms.push(keyword);
      }
    }

    return [...new Set(terms)]; // Remove duplicates
  }

  /**
   * 识别相关工作组 - Enhanced with skill matrices and historical data
   * Now uses the dedicated WorkgroupIdentificationService for advanced algorithms
   */
  private async identifyRelatedWorkgroups(
    taskContent: WorkTaskContent, 
    keyPoints: string[]
  ): Promise<RelatedWorkgroup[]> {
    // Extract technical requirements and business domains from task content
    const technicalRequirements = this.extractTechnicalRequirements(taskContent, keyPoints);
    const businessDomains = this.extractBusinessDomains(taskContent, keyPoints);
    
    // Estimate effort from task content
    const estimatedEffort = this.estimateTaskEffort(taskContent, keyPoints);

    // Build request for workgroup identification service
    const request: WorkgroupIdentificationRequest = {
      taskContent: `${taskContent.title} ${taskContent.description} ${taskContent.content}`,
      technicalRequirements,
      businessDomains,
      priority: taskContent.priority || 'medium',
      estimatedEffort,
      timeline: undefined, // Could be extracted from task content if available
      teamId: taskContent.teamId
    };

    // Use the dedicated workgroup identification service
    const matchResults = await this.workgroupIdentificationService.identifyWorkgroups(request);

    // Convert match results to RelatedWorkgroup format
    const workgroups = matchResults.map(result => result.workgroup);

    // Add cross-functional collaboration recommendations if needed
    const collaborationRecommendations = this.generateCollaborationRecommendations(workgroups, taskContent);
    workgroups.push(...collaborationRecommendations);

    // Sort by relevance score and apply business rules
    return this.applyWorkgroupSelectionRules(workgroups, taskContent);
  }

  /**
   * Load workgroup skill matrices from data store
   */
  private async loadWorkgroupSkillMatrices(teamId: string): Promise<WorkgroupSkillMatrix[]> {
    // In a real implementation, this would load from a database
    // For now, return mock data based on common team structures
    return [
      {
        teamId: 'security-team',
        teamName: 'Security Team',
        skills: [
          { skill_name: 'security_audit', proficiency_level: 'expert', years_experience: 5, last_used: '2024-01-01', confidence_score: 0.95 },
          { skill_name: 'vulnerability_assessment', proficiency_level: 'expert', years_experience: 4, last_used: '2024-01-15', confidence_score: 0.9 },
          { skill_name: 'compliance_checking', proficiency_level: 'advanced', years_experience: 3, last_used: '2024-02-01', confidence_score: 0.85 },
          { skill_name: 'encryption', proficiency_level: 'expert', years_experience: 6, last_used: '2024-01-20', confidence_score: 0.92 }
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
            { project_id: 'sec-001', project_name: 'API Security Review', similarity_score: 0.85, role: 'lead', outcome: 'success', lessons_learned: ['Early security integration', 'Automated scanning'] }
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
            { project_id: 'be-001', project_name: 'Task Management API', similarity_score: 0.78, role: 'developer', outcome: 'success', lessons_learned: ['API versioning', 'Error handling'] }
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
            { project_id: 'fe-001', project_name: 'Task Dashboard UI', similarity_score: 0.82, role: 'lead', outcome: 'success', lessons_learned: ['Component reusability', 'Performance optimization'] }
          ]
        },
        availability_status: 'available'
      },
      {
        teamId: 'devops-team',
        teamName: 'DevOps Team',
        skills: [
          { skill_name: 'aws_infrastructure', proficiency_level: 'expert', years_experience: 5, last_used: '2024-02-22', confidence_score: 0.96 },
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
            { project_id: 'ops-001', project_name: 'Task Service Deployment', similarity_score: 0.75, role: 'lead', outcome: 'success', lessons_learned: ['Infrastructure as code', 'Blue-green deployment'] }
          ]
        },
        availability_status: 'available'
      }
    ];
  }

  /**
   * Load historical project data for performance analysis
   */
  private async loadHistoricalProjectData(teamId: string): Promise<SimilarProjectExperience[]> {
    // Mock historical data - in real implementation, load from database
    return [
      {
        project_id: 'proj-001',
        project_name: 'Task Management System',
        similarity_score: 0.85,
        role: 'development',
        outcome: 'success',
        lessons_learned: ['Agile methodology', 'Cross-team collaboration', 'Early testing']
      },
      {
        project_id: 'proj-002',
        project_name: 'Workflow Automation',
        similarity_score: 0.72,
        role: 'support',
        outcome: 'partial_success',
        lessons_learned: ['Better requirement analysis', 'Stakeholder communication']
      }
    ];
  }

  /**
   * Extract technical requirements from task content and key points
   */
  private extractTechnicalRequirements(taskContent: WorkTaskContent, keyPoints: string[]): string[] {
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();
    const requirements: string[] = [];

    // Technical skill patterns
    const technicalPatterns = {
      'api_development': ['api', 'rest', 'graphql', 'endpoint', 'service'],
      'database_design': ['database', 'sql', 'nosql', 'schema', 'migration'],
      'security_audit': ['security', 'authentication', 'authorization', 'encryption', 'vulnerability'],
      'frontend_development': ['frontend', 'ui', 'react', 'vue', 'angular', 'javascript'],
      'backend_development': ['backend', 'server', 'microservice', 'lambda', 'node'],
      'devops': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'aws', 'infrastructure'],
      'testing': ['test', 'testing', 'qa', 'automation', 'unit test', 'integration'],
      'performance_optimization': ['performance', 'optimization', 'scalability', 'caching', 'load'],
      'monitoring': ['monitoring', 'logging', 'metrics', 'alerting', 'observability'],
      'compliance': ['compliance', 'gdpr', 'regulation', 'audit', 'policy']
    };

    for (const [skill, keywords] of Object.entries(technicalPatterns)) {
      const matchCount = keywords.filter(keyword => allContent.includes(keyword)).length;
      if (matchCount > 0) {
        requirements.push(skill);
      }
    }

    return requirements;
  }

  /**
   * Extract business domains from task content
   */
  private extractBusinessDomains(taskContent: WorkTaskContent, keyPoints: string[]): string[] {
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();
    const domains: string[] = [];

    // Business domain patterns
    const domainPatterns = {
      'authentication': ['authentication', 'auth', 'login', 'user management'],
      'security': ['security', 'encryption', 'vulnerability', 'threat'],
      'data_processing': ['data processing', 'etl', 'pipeline', 'analytics'],
      'user_interface': ['ui', 'user interface', 'frontend', 'ux'],
      'api': ['api', 'rest', 'graphql', 'endpoint'],
      'infrastructure': ['infrastructure', 'deployment', 'cloud', 'aws'],
      'database': ['database', 'storage', 'persistence', 'data model'],
      'integration': ['integration', 'connector', 'sync', 'webhook'],
      'reporting': ['reporting', 'dashboard', 'metrics', 'analytics'],
      'compliance': ['compliance', 'regulation', 'audit', 'policy']
    };

    for (const [domain, keywords] of Object.entries(domainPatterns)) {
      const matchCount = keywords.filter(keyword => allContent.includes(keyword)).length;
      if (matchCount > 0) {
        domains.push(domain);
      }
    }

    return domains;
  }

  /**
   * Estimate task effort based on content complexity
   */
  private estimateTaskEffort(taskContent: WorkTaskContent, keyPoints: string[]): number {
    // Base effort estimation
    let effort = 40; // Default 40 hours (1 week)

    // Adjust based on priority
    const priorityMultipliers = {
      'critical': 1.5,
      'high': 1.3,
      'medium': 1.0,
      'low': 0.7
    };
    effort *= priorityMultipliers[taskContent.priority || 'medium'];

    // Adjust based on content length (complexity indicator)
    const contentLength = taskContent.content.length;
    if (contentLength > 2000) {
      effort *= 1.5;
    } else if (contentLength > 1000) {
      effort *= 1.2;
    }

    // Adjust based on number of key points (scope indicator)
    if (keyPoints.length > 10) {
      effort *= 1.4;
    } else if (keyPoints.length > 5) {
      effort *= 1.2;
    }

    // Adjust based on technical complexity indicators
    const complexityKeywords = ['integration', 'migration', 'architecture', 'security', 'performance', 'scalability'];
    const complexityCount = complexityKeywords.filter(keyword => 
      taskContent.content.toLowerCase().includes(keyword)
    ).length;
    effort *= (1 + complexityCount * 0.1);

    return Math.round(effort);
  }

  /**
   * Calculate skill match score between requirements and team skills
   */
  private calculateSkillMatchScore(requirements: string[], skillMatrix: WorkgroupSkillMatrix): number {
    if (requirements.length === 0) return 0;

    let totalScore = 0;
    let matchedSkills = 0;

    for (const requirement of requirements) {
      const matchingSkill = skillMatrix.skills.find(skill => 
        skill.skill_name.toLowerCase().includes(requirement.toLowerCase()) ||
        requirement.toLowerCase().includes(skill.skill_name.toLowerCase())
      );

      if (matchingSkill) {
        // Score based on proficiency level and confidence
        const proficiencyScore = this.getProficiencyScore(matchingSkill.proficiency_level);
        const recencyScore = this.getRecencyScore(matchingSkill.last_used);
        const skillScore = (proficiencyScore * 0.6 + matchingSkill.confidence_score * 0.3 + recencyScore * 0.1);
        
        totalScore += skillScore;
        matchedSkills++;
      }
    }

    // Calculate match percentage with bonus for high coverage
    const matchPercentage = matchedSkills / requirements.length;
    const averageSkillScore = matchedSkills > 0 ? totalScore / matchedSkills : 0;
    
    return matchPercentage * averageSkillScore;
  }

  /**
   * Calculate historical performance score
   */
  private calculateHistoricalPerformanceScore(skillMatrix: WorkgroupSkillMatrix, historicalData: SimilarProjectExperience[]): number {
    const performance = skillMatrix.historical_performance;
    
    // Base score from team's overall performance
    const baseScore = (
      performance.success_rate * 0.4 +
      performance.quality_score * 0.3 +
      (performance.collaboration_feedback || 0.8) * 0.2 +
      Math.min(performance.completed_projects / 50, 1) * 0.1
    );

    // Bonus for similar project experience
    const similarProjectBonus = performance.similar_project_experience.reduce((bonus, exp) => {
      return bonus + (exp.similarity_score * 0.1);
    }, 0);

    return Math.min(baseScore + similarProjectBonus, 1.0);
  }

  /**
   * Calculate team capacity score
   */
  private calculateCapacityScore(skillMatrix: WorkgroupSkillMatrix): number {
    const capacity = skillMatrix.capacity_metrics;
    
    // Higher score for teams with more availability
    const availabilityScore = 1 - capacity.current_workload;
    const efficiencyScore = capacity.efficiency_rating;
    const collaborationScore = capacity.collaboration_rating;
    
    return (availabilityScore * 0.5 + efficiencyScore * 0.3 + collaborationScore * 0.2);
  }

  /**
   * Generate reason for workgroup recommendation
   */
  private generateWorkgroupReason(
    skillMatrix: WorkgroupSkillMatrix, 
    requirements: string[], 
    skillMatchScore: number
  ): string {
    const matchedSkills = this.getMatchedSkills(requirements, skillMatrix);
    const topSkills = matchedSkills.slice(0, 3).join(', ');
    
    if (skillMatchScore > 0.8) {
      return `High expertise match in ${topSkills} with ${Math.round(skillMatchScore * 100)}% skill alignment`;
    } else if (skillMatchScore > 0.6) {
      return `Good expertise match in ${topSkills} with proven track record`;
    } else if (skillMatchScore > 0.4) {
      return `Relevant skills in ${topSkills} and available capacity`;
    } else {
      return `Supporting role with complementary skills and good collaboration history`;
    }
  }

  /**
   * Get matched skills between requirements and team
   */
  private getMatchedSkills(requirements: string[], skillMatrix: WorkgroupSkillMatrix): string[] {
    const matched: string[] = [];
    
    for (const requirement of requirements) {
      const matchingSkill = skillMatrix.skills.find(skill => 
        skill.skill_name.toLowerCase().includes(requirement.toLowerCase()) ||
        requirement.toLowerCase().includes(skill.skill_name.toLowerCase())
      );
      
      if (matchingSkill) {
        matched.push(matchingSkill.skill_name);
      }
    }
    
    return matched;
  }

  /**
   * Identify skill gaps
   */
  private identifySkillGaps(requirements: string[], skillMatrix: WorkgroupSkillMatrix): string[] {
    const gaps: string[] = [];
    
    for (const requirement of requirements) {
      const hasSkill = skillMatrix.skills.some(skill => 
        skill.skill_name.toLowerCase().includes(requirement.toLowerCase()) ||
        requirement.toLowerCase().includes(skill.skill_name.toLowerCase())
      );
      
      if (!hasSkill) {
        gaps.push(requirement);
      }
    }
    
    return gaps;
  }

  /**
   * Generate collaboration recommendations
   */
  private generateCollaborationRecommendations(
    workgroups: RelatedWorkgroup[], 
    taskContent: WorkTaskContent
  ): RelatedWorkgroup[] {
    const recommendations: RelatedWorkgroup[] = [];
    
    // Add management team for high-priority tasks
    if (taskContent.priority === 'critical' || taskContent.priority === 'high') {
      recommendations.push({
        teamId: 'management-team',
        teamName: 'Management Team',
        relevanceScore: 0.8,
        reason: 'High-priority task requires management oversight and resource coordination',
        expertise: ['Project Management', 'Resource Allocation', 'Strategic Decision Making'],
        recommendedInvolvement: 'approval'
      });
    }

    // Add architecture team for complex integrations
    const hasIntegrationWork = workgroups.length > 2;
    if (hasIntegrationWork) {
      recommendations.push({
        teamId: 'architecture-team',
        teamName: 'Architecture Team',
        relevanceScore: 0.7,
        reason: 'Multi-team collaboration requires architectural coordination',
        expertise: ['System Architecture', 'Integration Patterns', 'Technical Standards'],
        recommendedInvolvement: 'consultation'
      });
    }

    return recommendations;
  }

  /**
   * Apply business rules for workgroup selection
   */
  private applyWorkgroupSelectionRules(
    workgroups: RelatedWorkgroup[], 
    taskContent: WorkTaskContent
  ): RelatedWorkgroup[] {
    // Sort by relevance score
    let sortedWorkgroups = workgroups.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply maximum team limit based on task complexity
    const maxTeams = taskContent.priority === 'critical' ? 6 : 4;
    sortedWorkgroups = sortedWorkgroups.slice(0, maxTeams);

    // Ensure minimum required teams are included
    const requiredTeamTypes = ['backend-team', 'frontend-team'];
    for (const requiredType of requiredTeamTypes) {
      if (!sortedWorkgroups.some(wg => wg.teamId === requiredType)) {
        // Add with minimum score if not present
        const defaultTeam = this.getDefaultTeamInfo(requiredType);
        if (defaultTeam) {
          sortedWorkgroups.push(defaultTeam);
        }
      }
    }

    return sortedWorkgroups;
  }

  /**
   * Get default team information
   */
  private getDefaultTeamInfo(teamId: string): RelatedWorkgroup | null {
    const defaultTeams: { [key: string]: RelatedWorkgroup } = {
      'backend-team': {
        teamId: 'backend-team',
        teamName: 'Backend Development Team',
        relevanceScore: 0.5,
        reason: 'Required for backend development tasks',
        expertise: ['API Development', 'Database Design', 'System Integration'],
        recommendedInvolvement: 'collaboration'
      },
      'frontend-team': {
        teamId: 'frontend-team',
        teamName: 'Frontend Development Team',
        relevanceScore: 0.5,
        reason: 'Required for frontend development tasks',
        expertise: ['UI Development', 'User Experience', 'Frontend Testing'],
        recommendedInvolvement: 'collaboration'
      }
    };

    return defaultTeams[teamId] || null;
  }

  // Helper methods for skill scoring
  private getProficiencyScore(level: string): number {
    const scores = {
      'beginner': 0.3,
      'intermediate': 0.6,
      'advanced': 0.8,
      'expert': 1.0
    };
    return scores[level as keyof typeof scores] || 0.5;
  }

  private getRecencyScore(lastUsed: string): number {
    const lastUsedDate = new Date(lastUsed);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 30) return 1.0;
    if (daysDiff <= 90) return 0.8;
    if (daysDiff <= 180) return 0.6;
    if (daysDiff <= 365) return 0.4;
    return 0.2;
  }

  /**
   * 生成TODO列表 - Enhanced with intelligent decomposition and optimization
   */
  private async generateTodoList(
    taskContent: WorkTaskContent,
    keyPoints: string[],
    knowledgeReferences: KnowledgeReference[]
  ): Promise<TodoItem[]> {
    // Generate comprehensive todo generation context
    const generationContext = await this.buildTodoGenerationContext(taskContent, keyPoints, knowledgeReferences);
    
    // Get related workgroups for team assignment
    const relatedWorkgroups = await this.identifyRelatedWorkgroups(taskContent, keyPoints);
    
    // Use intelligent todo generation service for optimized todo list
    const fullContent = `${taskContent.title}\n\n${taskContent.description}\n\n${taskContent.content}`;
    const intelligentTodos = await this.intelligentTodoService.generateOptimizedTodoList(
      fullContent,
      keyPoints,
      generationContext,
      relatedWorkgroups
    );
    
    // Fallback to legacy method if intelligent generation fails or returns empty
    if (intelligentTodos.length === 0) {
      this.logger.warn('Intelligent todo generation returned empty, falling back to legacy method');
      return this.generateTodoListLegacy(taskContent, keyPoints, knowledgeReferences, generationContext);
    }
    
    return intelligentTodos;
  }

  /**
   * Legacy todo generation method (fallback)
   */
  private generateTodoListLegacy(
    taskContent: WorkTaskContent,
    keyPoints: string[],
    knowledgeReferences: KnowledgeReference[],
    generationContext: TodoGenerationContext
  ): TodoItem[] {
    // Generate initial todo items from key points
    const keyPointTodos = this.generateTodosFromKeyPoints(keyPoints, taskContent, generationContext);
    
    // Generate standard project management todos
    const standardTodos = this.generateStandardProjectTodos(taskContent, generationContext);
    
    // Combine all todos
    let allTodos = [...keyPointTodos, ...standardTodos];
    
    // Apply intelligent dependency analysis
    allTodos = this.analyzeTodoDependencies(allTodos, generationContext);
    
    // Apply priority optimization
    allTodos = this.optimizeTodoPriorities(allTodos, taskContent, generationContext);
    
    // Apply resource-based scheduling
    allTodos = this.applyResourceBasedScheduling(allTodos, generationContext);
    
    // Validate and optimize the final todo list
    allTodos = this.validateAndOptimizeTodoList(allTodos, generationContext);
    
    return allTodos;
  }

  /**
   * Build comprehensive context for todo generation
   */
  private async buildTodoGenerationContext(
    taskContent: WorkTaskContent,
    keyPoints: string[],
    knowledgeReferences: KnowledgeReference[]
  ): Promise<TodoGenerationContext> {
    const taskComplexity = this.assessTaskComplexity(taskContent, keyPoints);
    const availableResources = await this.identifyAvailableResources(taskContent.teamId);
    const timeConstraints = this.extractTimeConstraints(taskContent, keyPoints);
    const riskFactors = await this.identifyRiskFactorsForTodos(taskContent, keyPoints);
    const qualityRequirements = this.extractQualityRequirements(taskContent, keyPoints);

    return {
      task_complexity: taskComplexity,
      available_resources: availableResources,
      time_constraints: timeConstraints,
      dependency_graph: [], // Will be built during dependency analysis
      risk_factors: riskFactors,
      quality_requirements: qualityRequirements
    };
  }

  /**
   * Generate todos from key points with enhanced analysis
   */
  private generateTodosFromKeyPoints(
    keyPoints: string[],
    taskContent: WorkTaskContent,
    context: TodoGenerationContext
  ): TodoItem[] {
    const todos: TodoItem[] = [];

    for (const keyPoint of keyPoints) {
      const category = this.categorizeKeyPointAdvanced(keyPoint, context);
      const priority = this.determineTodoPriorityAdvanced(keyPoint, taskContent, context);
      const estimatedHours = this.estimateTodoHoursAdvanced(keyPoint, category, context);
      
      // Generate subtasks for complex key points
      const subtasks = this.generateSubtasksIfNeeded(keyPoint, category, context);
      
      const mainTodo: TodoItem = {
        id: uuidv4(),
        title: this.generateTodoTitleAdvanced(keyPoint),
        description: this.enhanceTodoDescription(keyPoint, context),
        priority,
        estimated_hours: estimatedHours,
        dependencies: [], // Will be set during dependency analysis
        category,
        status: 'pending',
        related_workgroups: this.identifyTodoWorkgroupsAdvanced(keyPoint, context),
        deliverable_requirements: this.generateDeliverableRequirements(keyPoint, category),
        quality_requirements: this.generateQualityRequirements(keyPoint, category),
        risk_level: this.assessTodoRiskLevel(keyPoint, context),
        blocking_factors: this.identifyBlockingFactors(keyPoint, context),
        success_criteria: this.generateSuccessCriteria(keyPoint, category)
      };

      todos.push(mainTodo);
      
      // Add subtasks if generated
      if (subtasks.length > 0) {
        subtasks.forEach(subtask => {
          subtask.parent_task_id = mainTodo.id;
          todos.push(subtask);
        });
      }
    }

    return todos;
  }

  /**
   * Generate standard project management todos with context awareness
   */
  private generateStandardProjectTodos(
    taskContent: WorkTaskContent,
    context: TodoGenerationContext
  ): TodoItem[] {
    const standardTodos: Partial<TodoItem>[] = [
      {
        title: 'Requirements Analysis and Validation',
        description: 'Conduct thorough requirements analysis, stakeholder interviews, and validation of acceptance criteria',
        category: 'research',
        priority: 'high',
        estimated_hours: this.calculateStandardTodoHours('research', context)
      },
      {
        title: 'Technical Architecture Design',
        description: 'Design system architecture, select technology stack, and create technical specifications',
        category: 'development',
        priority: 'high',
        estimated_hours: this.calculateStandardTodoHours('architecture', context)
      },
      {
        title: 'Implementation Planning',
        description: 'Create detailed implementation plan, resource allocation, and timeline estimation',
        category: 'development',
        priority: 'medium',
        estimated_hours: this.calculateStandardTodoHours('planning', context)
      },
      {
        title: 'Quality Assurance Setup',
        description: 'Establish testing strategy, quality gates, and validation procedures',
        category: 'testing',
        priority: 'medium',
        estimated_hours: this.calculateStandardTodoHours('qa_setup', context)
      },
      {
        title: 'Documentation and Knowledge Transfer',
        description: 'Create comprehensive documentation and conduct knowledge transfer sessions',
        category: 'documentation',
        priority: 'medium',
        estimated_hours: this.calculateStandardTodoHours('documentation', context)
      }
    ];

    // Add security review for security-sensitive tasks
    if (this.isSecuritySensitive(taskContent, context)) {
      standardTodos.push({
        title: 'Security Review and Compliance Check',
        description: 'Conduct security assessment, vulnerability analysis, and compliance verification',
        category: 'review',
        priority: 'critical',
        estimated_hours: this.calculateStandardTodoHours('security_review', context)
      });
    }

    // Add performance testing for performance-critical tasks
    if (this.isPerformanceCritical(taskContent, context)) {
      standardTodos.push({
        title: 'Performance Testing and Optimization',
        description: 'Execute performance tests, identify bottlenecks, and implement optimizations',
        category: 'testing',
        priority: 'high',
        estimated_hours: this.calculateStandardTodoHours('performance_testing', context)
      });
    }

    return standardTodos.map(todo => ({
      id: uuidv4(),
      ...todo,
      dependencies: [],
      status: 'pending' as const,
      related_workgroups: this.identifyTodoWorkgroupsAdvanced(todo.description || '', context),
      deliverable_requirements: this.generateDeliverableRequirements(todo.description || '', todo.category!),
      quality_requirements: this.generateQualityRequirements(todo.description || '', todo.category!),
      risk_level: this.assessTodoRiskLevel(todo.description || '', context),
      blocking_factors: this.identifyBlockingFactors(todo.description || '', context),
      success_criteria: this.generateSuccessCriteria(todo.description || '', todo.category!)
    } as TodoItem));
  }

  /**
   * Analyze and set todo dependencies using advanced algorithms
   */
  private analyzeTodoDependencies(todos: TodoItem[], context: TodoGenerationContext): TodoItem[] {
    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(todos, context);
    context.dependency_graph = dependencyGraph;

    // Apply dependency rules
    const dependencyRules = this.getDependencyRules();
    
    for (const todo of todos) {
      const dependencies: string[] = [];

      // Category-based dependencies
      const categoryDeps = this.getCategoryBasedDependencies(todo, todos, dependencyRules);
      dependencies.push(...categoryDeps);

      // Content-based dependencies
      const contentDeps = this.getContentBasedDependencies(todo, todos);
      dependencies.push(...contentDeps);

      // Resource-based dependencies
      const resourceDeps = this.getResourceBasedDependencies(todo, todos, context);
      dependencies.push(...resourceDeps);

      // Risk-based dependencies
      const riskDeps = this.getRiskBasedDependencies(todo, todos, context);
      dependencies.push(...riskDeps);

      // Remove duplicates and self-references
      todo.dependencies = [...new Set(dependencies)].filter(dep => dep !== todo.id);
    }

    // Validate dependency graph for cycles
    this.validateDependencyGraph(todos);

    return todos;
  }

  /**
   * Optimize todo priorities based on multiple factors
   */
  private optimizeTodoPriorities(
    todos: TodoItem[],
    taskContent: WorkTaskContent,
    context: TodoGenerationContext
  ): TodoItem[] {
    // Calculate priority scores for each todo
    const priorityScores = todos.map(todo => ({
      todo,
      score: this.calculatePriorityScore(todo, taskContent, context, todos)
    }));

    // Sort by priority score
    priorityScores.sort((a, b) => b.score - a.score);

    // Assign optimized priorities
    const totalTodos = priorityScores.length;
    priorityScores.forEach((item, index) => {
      const percentile = index / totalTodos;
      
      if (percentile <= 0.15) {
        item.todo.priority = 'critical';
      } else if (percentile <= 0.35) {
        item.todo.priority = 'high';
      } else if (percentile <= 0.70) {
        item.todo.priority = 'medium';
      } else {
        item.todo.priority = 'low';
      }

      // Override for specific conditions
      if (item.todo.risk_level === 'critical') {
        item.todo.priority = 'critical';
      }
      if (item.todo.blocking_factors && item.todo.blocking_factors.length > 0) {
        item.todo.priority = Math.max(item.todo.priority, 'high') as TodoItem['priority'];
      }
    });

    return todos;
  }

  /**
   * Apply resource-based scheduling optimization
   */
  private applyResourceBasedScheduling(todos: TodoItem[], context: TodoGenerationContext): TodoItem[] {
    // Group todos by required resources
    const resourceGroups = this.groupTodosByResources(todos, context);
    
    // Apply resource constraints and scheduling
    for (const [resourceType, todoGroup] of Object.entries(resourceGroups)) {
      const availableResource = context.available_resources.find(r => r.resource_type === resourceType);
      
      if (availableResource && availableResource.availability_percentage < 0.8) {
        // Adjust priorities and timelines for resource-constrained todos
        todoGroup.forEach(todo => {
          if (todo.priority === 'low') {
            todo.priority = 'medium'; // Bump up priority to ensure attention
          }
          // Add resource constraint note
          todo.description += ` [Resource Constraint: Limited ${resourceType} availability]`;
        });
      }
    }

    return todos;
  }

  /**
   * Validate and optimize the final todo list
   */
  private validateAndOptimizeTodoList(todos: TodoItem[], context: TodoGenerationContext): TodoItem[] {
    // Remove duplicate todos
    const uniqueTodos = this.removeDuplicateTodos(todos);
    
    // Ensure minimum required todos are present
    const validatedTodos = this.ensureMinimumRequiredTodos(uniqueTodos, context);
    
    // Optimize todo ordering
    const optimizedTodos = this.optimizeTodoOrdering(validatedTodos);
    
    // Add final validation metadata
    optimizedTodos.forEach(todo => {
      todo.validation_status = 'validated';
      todo.optimization_applied = true;
    });

    return optimizedTodos;
  }

  // Helper methods for enhanced todo generation

  private assessTaskComplexity(taskContent: WorkTaskContent, keyPoints: string[]): number {
    let complexity = 0;

    // Base complexity from content length
    complexity += Math.min(taskContent.content.length / 1000, 0.3);

    // Complexity from key points count
    complexity += Math.min(keyPoints.length / 10, 0.2);

    // Technical complexity indicators
    const complexityKeywords = [
      'integration', 'architecture', 'migration', 'optimization', 'algorithm',
      'machine learning', 'ai', 'distributed', 'scalability', 'performance'
    ];
    
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();
    const keywordMatches = complexityKeywords.filter(keyword => allContent.includes(keyword)).length;
    complexity += Math.min(keywordMatches / 5, 0.3);

    // Priority-based complexity
    const priorityMultipliers = { 'low': 0.8, 'medium': 1.0, 'high': 1.2, 'critical': 1.5 };
    complexity *= priorityMultipliers[taskContent.priority || 'medium'];

    return Math.min(complexity, 1.0);
  }

  private async identifyAvailableResources(teamId: string): Promise<ResourceAvailability[]> {
    // Mock implementation - in real system, query resource management system
    return [
      {
        resource_type: 'human',
        resource_id: 'dev-team-1',
        availability_percentage: 0.7,
        skills: ['javascript', 'react', 'node.js', 'aws'],
        cost_per_hour: 75
      },
      {
        resource_type: 'human',
        resource_id: 'qa-team-1',
        availability_percentage: 0.9,
        skills: ['testing', 'automation', 'selenium', 'jest'],
        cost_per_hour: 65
      },
      {
        resource_type: 'technical',
        resource_id: 'aws-infrastructure',
        availability_percentage: 0.95,
        skills: ['aws', 'lambda', 'dynamodb', 's3']
      }
    ];
  }

  private extractTimeConstraints(taskContent: WorkTaskContent, keyPoints: string[]): TimeConstraint[] {
    const constraints: TimeConstraint[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`;

    // Look for deadline patterns
    const deadlinePatterns = [
      /deadline[:\s]+([^.!?\n]+)/gi,
      /due[:\s]+([^.!?\n]+)/gi,
      /by[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/gi,
      /before[:\s]+([^.!?\n]+)/gi
    ];

    deadlinePatterns.forEach(pattern => {
      const matches = [...allContent.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          constraints.push({
            constraint_type: 'hard_deadline',
            date: this.parseDate(match[1]) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            description: match[0],
            flexibility: 0.1
          });
        }
      });
    });

    // Add default constraint if none found
    if (constraints.length === 0) {
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + (taskContent.priority === 'critical' ? 14 : 30));
      
      constraints.push({
        constraint_type: 'soft_deadline',
        date: defaultDeadline.toISOString(),
        description: 'Estimated completion target based on task priority',
        flexibility: 0.3
      });
    }

    return constraints;
  }

  private parseDate(dateString: string): string | null {
    // Simple date parsing - in production, use a proper date parsing library
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }

  private async identifyRiskFactorsForTodos(taskContent: WorkTaskContent, keyPoints: string[]): Promise<RiskFactor[]> {
    // Reuse existing risk assessment logic
    const riskAssessment = await this.assessRisks(taskContent, keyPoints, []);
    return riskAssessment.riskFactors;
  }

  private extractQualityRequirements(taskContent: WorkTaskContent, keyPoints: string[]): QualityRequirement[] {
    const requirements: QualityRequirement[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    // Standard quality requirements
    requirements.push({
      requirement_id: uuidv4(),
      description: 'Code quality and maintainability standards',
      category: 'code_quality',
      priority: 'high',
      acceptance_criteria: ['Code coverage >= 80%', 'No critical issues', 'Follows coding standards'],
      measurement_method: 'automated_analysis',
      target_value: 85,
      threshold_value: 70
    });

    // Add specific requirements based on content
    if (allContent.includes('performance') || allContent.includes('scalability')) {
      requirements.push({
        requirement_id: uuidv4(),
        description: 'Performance and scalability requirements',
        category: 'performance',
        priority: 'high',
        acceptance_criteria: ['Response time < 2s', 'Handles 1000+ concurrent users', 'Memory usage optimized'],
        measurement_method: 'performance_testing',
        target_value: 95,
        threshold_value: 80
      });
    }

    return requirements;
  }

  private categorizeKeyPointAdvanced(keyPoint: string, context: TodoGenerationContext): TodoItem['category'] {
    const lowerPoint = keyPoint.toLowerCase();
    
    // Enhanced categorization with context awareness
    if (lowerPoint.includes('research') || lowerPoint.includes('analysis') || lowerPoint.includes('investigate')) {
      return 'research';
    }
    if (lowerPoint.includes('develop') || lowerPoint.includes('implement') || lowerPoint.includes('code') || lowerPoint.includes('build')) {
      return 'development';
    }
    if (lowerPoint.includes('review') || lowerPoint.includes('audit') || lowerPoint.includes('inspect')) {
      return 'review';
    }
    if (lowerPoint.includes('approve') || lowerPoint.includes('sign-off') || lowerPoint.includes('authorize')) {
      return 'approval';
    }
    if (lowerPoint.includes('document') || lowerPoint.includes('write') || lowerPoint.includes('record')) {
      return 'documentation';
    }
    if (lowerPoint.includes('test') || lowerPoint.includes('verify') || lowerPoint.includes('validate')) {
      return 'testing';
    }
    
    // Context-based categorization
    if (context.task_complexity > 0.7) {
      return 'development'; // Complex tasks likely need development
    }
    
    return 'development';
  }

  private determineTodoPriorityAdvanced(
    keyPoint: string,
    taskContent: WorkTaskContent,
    context: TodoGenerationContext
  ): TodoItem['priority'] {
    let priorityScore = 0;

    // Base priority from task
    const taskPriorityScores = { 'low': 0.2, 'medium': 0.4, 'high': 0.6, 'critical': 0.8 };
    priorityScore += taskPriorityScores[taskContent.priority || 'medium'];

    // Content-based priority indicators
    const lowerPoint = keyPoint.toLowerCase();
    if (lowerPoint.includes('critical') || lowerPoint.includes('urgent') || lowerPoint.includes('blocker')) {
      priorityScore += 0.3;
    }
    if (lowerPoint.includes('security') || lowerPoint.includes('compliance') || lowerPoint.includes('risk')) {
      priorityScore += 0.2;
    }
    if (lowerPoint.includes('foundation') || lowerPoint.includes('prerequisite') || lowerPoint.includes('dependency')) {
      priorityScore += 0.15;
    }

    // Context-based adjustments
    if (context.task_complexity > 0.8) {
      priorityScore += 0.1;
    }

    // Convert score to priority level
    if (priorityScore >= 0.8) return 'critical';
    if (priorityScore >= 0.6) return 'high';
    if (priorityScore >= 0.4) return 'medium';
    return 'low';
  }

  private estimateTodoHoursAdvanced(
    keyPoint: string,
    category: TodoItem['category'],
    context: TodoGenerationContext
  ): number {
    const baseHours = {
      'research': 6,
      'development': 12,
      'review': 4,
      'approval': 2,
      'documentation': 5,
      'testing': 8
    };

    let hours = baseHours[category];

    // Complexity adjustment
    hours *= (1 + context.task_complexity * 0.5);

    // Content-based adjustments
    const lowerPoint = keyPoint.toLowerCase();
    const complexityKeywords = ['complex', 'integrate', 'optimize', 'migrate', 'refactor'];
    const hasComplexity = complexityKeywords.some(keyword => lowerPoint.includes(keyword));
    
    if (hasComplexity) {
      hours *= 1.4;
    }

    // Risk-based adjustments
    const riskKeywords = ['risk', 'uncertain', 'experimental', 'new technology'];
    const hasRisk = riskKeywords.some(keyword => lowerPoint.includes(keyword));
    
    if (hasRisk) {
      hours *= 1.3;
    }

    return Math.round(hours);
  }

  private generateSubtasksIfNeeded(
    keyPoint: string,
    category: TodoItem['category'],
    context: TodoGenerationContext
  ): TodoItem[] {
    const subtasks: TodoItem[] = [];
    
    // Generate subtasks for complex development tasks
    if (category === 'development' && context.task_complexity > 0.6) {
      const developmentSubtasks = [
        'Design and architecture planning',
        'Core implementation',
        'Integration and testing',
        'Code review and optimization'
      ];

      developmentSubtasks.forEach((subtaskTitle, index) => {
        subtasks.push({
          id: uuidv4(),
          title: subtaskTitle,
          description: `${subtaskTitle} for: ${keyPoint}`,
          priority: 'medium',
          estimated_hours: Math.round(this.estimateTodoHoursAdvanced(keyPoint, category, context) / 4),
          dependencies: index > 0 ? [subtasks[index - 1].id] : [],
          category,
          status: 'pending',
          related_workgroups: [],
          deliverable_requirements: [],
          quality_requirements: []
        });
      });
    }

    return subtasks;
  }

  private generateTodoTitleAdvanced(keyPoint: string): string {
    // Clean and format the key point as a title
    let title = keyPoint.replace(/^[⚠️🔒⚡🎯]\s*/, ''); // Remove emoji indicators
    title = title.replace(/^(Risk indicator:|Constraint:|Performance requirement:)\s*/i, '');
    
    // Ensure proper length
    if (title.length > 60) {
      title = title.substring(0, 57) + '...';
    }

    // Ensure proper capitalization
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return title;
  }

  private enhanceTodoDescription(keyPoint: string, context: TodoGenerationContext): string {
    let description = keyPoint;

    // Add context information
    if (context.task_complexity > 0.7) {
      description += '\n\nNote: This is part of a complex task requiring careful planning and execution.';
    }

    // Add risk information
    const relevantRisks = context.risk_factors.filter(risk => 
      keyPoint.toLowerCase().includes(risk.type) || 
      risk.description.toLowerCase().includes(keyPoint.toLowerCase().split(' ')[0])
    );

    if (relevantRisks.length > 0) {
      description += '\n\nRisk Considerations:\n';
      relevantRisks.forEach(risk => {
        description += `- ${risk.description} (${Math.round(risk.probability * 100)}% probability)\n`;
      });
    }

    return description;
  }

  private identifyTodoWorkgroupsAdvanced(description: string, context: TodoGenerationContext): string[] {
    const workgroups: string[] = [];
    const lowerDesc = description.toLowerCase();

    // Enhanced workgroup mapping
    const mappings = {
      'security': 'security-team',
      'database': 'data-team',
      'frontend': 'frontend-team',
      'backend': 'backend-team',
      'devops': 'devops-team',
      'test': 'qa-team',
      'design': 'design-team',
      'architecture': 'architecture-team',
      'performance': 'performance-team'
    };

    for (const [keyword, teamId] of Object.entries(mappings)) {
      if (lowerDesc.includes(keyword)) {
        workgroups.push(teamId);
      }
    }

    // Add resource-based workgroups
    context.available_resources.forEach(resource => {
      if (resource.resource_type === 'human' && resource.availability_percentage > 0.5) {
        const hasMatchingSkill = resource.skills?.some(skill => 
          lowerDesc.includes(skill.toLowerCase())
        );
        if (hasMatchingSkill && !workgroups.includes(resource.resource_id)) {
          workgroups.push(resource.resource_id);
        }
      }
    });

    return workgroups;
  }

  private assessTodoRiskLevel(keyPoint: string, context: TodoGenerationContext): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0;

    // Content-based risk assessment
    const lowerPoint = keyPoint.toLowerCase();
    const highRiskKeywords = ['security', 'migration', 'integration', 'performance', 'critical'];
    const mediumRiskKeywords = ['new', 'complex', 'external', 'dependency'];

    highRiskKeywords.forEach(keyword => {
      if (lowerPoint.includes(keyword)) riskScore += 0.3;
    });

    mediumRiskKeywords.forEach(keyword => {
      if (lowerPoint.includes(keyword)) riskScore += 0.2;
    });

    // Context-based risk assessment
    if (context.task_complexity > 0.8) riskScore += 0.2;
    if (context.time_constraints.some(tc => tc.flexibility < 0.2)) riskScore += 0.15;

    // Convert to risk level
    if (riskScore >= 0.7) return 'critical';
    if (riskScore >= 0.5) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }

  private identifyBlockingFactors(keyPoint: string, context: TodoGenerationContext): string[] {
    const blockingFactors: string[] = [];
    const lowerPoint = keyPoint.toLowerCase();

    // Common blocking factors
    if (lowerPoint.includes('approval') || lowerPoint.includes('sign-off')) {
      blockingFactors.push('Requires management approval');
    }
    if (lowerPoint.includes('external') || lowerPoint.includes('third-party')) {
      blockingFactors.push('Depends on external party');
    }
    if (lowerPoint.includes('resource') || lowerPoint.includes('budget')) {
      blockingFactors.push('Resource allocation required');
    }

    // Context-based blocking factors
    const constrainedResources = context.available_resources.filter(r => r.availability_percentage < 0.5);
    if (constrainedResources.length > 0) {
      blockingFactors.push(`Limited resource availability: ${constrainedResources.map(r => r.resource_id).join(', ')}`);
    }

    return blockingFactors;
  }

  private generateSuccessCriteria(keyPoint: string, category: TodoItem['category']): string[] {
    const criteria: string[] = [];
    const lowerPoint = keyPoint.toLowerCase();

    // Category-based success criteria
    switch (category) {
      case 'development':
        criteria.push('Code is implemented and tested');
        criteria.push('Meets functional requirements');
        criteria.push('Passes code review');
        break;
      case 'testing':
        criteria.push('All test cases pass');
        criteria.push('Coverage meets requirements');
        criteria.push('No critical bugs found');
        break;
      case 'documentation':
        criteria.push('Documentation is complete and accurate');
        criteria.push('Reviewed and approved by stakeholders');
        break;
      case 'review':
        criteria.push('Review completed with findings documented');
        criteria.push('Action items identified and assigned');
        break;
      default:
        criteria.push('Deliverable meets quality standards');
        criteria.push('Stakeholder acceptance obtained');
    }

    // Content-specific criteria
    if (lowerPoint.includes('security')) {
      criteria.push('Security requirements validated');
      criteria.push('No security vulnerabilities identified');
    }
    if (lowerPoint.includes('performance')) {
      criteria.push('Performance benchmarks met');
      criteria.push('Load testing completed successfully');
    }

    return criteria;
  }

  // Additional helper methods for dependency analysis and optimization
  
  private buildDependencyGraph(todos: TodoItem[], context: TodoGenerationContext): DependencyNode[] {
    return todos.map(todo => ({
      node_id: todo.id,
      node_type: 'task',
      dependencies: [], // Will be populated during dependency analysis
      estimated_duration: todo.estimated_hours,
      criticality: todo.priority === 'critical' ? 'critical' : 
                   todo.priority === 'high' ? 'high' : 
                   todo.priority === 'medium' ? 'medium' : 'low'
    }));
  }

  private getDependencyRules(): { [key: string]: string[] } {
    return {
      'research': [],
      'development': ['research'],
      'testing': ['development'],
      'review': ['development', 'testing'],
      'approval': ['review'],
      'documentation': ['development', 'testing']
    };
  }

  private getCategoryBasedDependencies(
    todo: TodoItem,
    allTodos: TodoItem[],
    rules: { [key: string]: string[] }
  ): string[] {
    const dependencies: string[] = [];
    const requiredCategories = rules[todo.category] || [];

    for (const requiredCategory of requiredCategories) {
      const dependencyTodos = allTodos.filter(t => 
        t.category === requiredCategory && 
        t.id !== todo.id &&
        !t.parent_task_id // Don't depend on subtasks
      );
      
      dependencies.push(...dependencyTodos.map(t => t.id));
    }

    return dependencies;
  }

  private getContentBasedDependencies(todo: TodoItem, allTodos: TodoItem[]): string[] {
    const dependencies: string[] = [];
    const todoKeywords = todo.description.toLowerCase().split(' ');

    // Find todos with related content
    for (const otherTodo of allTodos) {
      if (otherTodo.id === todo.id) continue;

      const otherKeywords = otherTodo.description.toLowerCase().split(' ');
      const commonKeywords = todoKeywords.filter(keyword => 
        otherKeywords.includes(keyword) && keyword.length > 3
      );

      // If significant overlap and other todo has higher priority or is foundational
      if (commonKeywords.length >= 2) {
        const priorityOrder = ['low', 'medium', 'high', 'critical'];
        const todoPriorityIndex = priorityOrder.indexOf(todo.priority);
        const otherPriorityIndex = priorityOrder.indexOf(otherTodo.priority);

        if (otherPriorityIndex > todoPriorityIndex || 
            otherTodo.description.toLowerCase().includes('foundation') ||
            otherTodo.description.toLowerCase().includes('setup')) {
          dependencies.push(otherTodo.id);
        }
      }
    }

    return dependencies;
  }

  private getResourceBasedDependencies(
    todo: TodoItem,
    allTodos: TodoItem[],
    context: TodoGenerationContext
  ): string[] {
    const dependencies: string[] = [];

    // Find todos that compete for the same constrained resources
    const constrainedResources = context.available_resources.filter(r => r.availability_percentage < 0.6);
    
    for (const resource of constrainedResources) {
      const competingTodos = allTodos.filter(t => 
        t.id !== todo.id &&
        t.related_workgroups.includes(resource.resource_id) &&
        t.priority === 'critical'
      );

      // Higher priority todos should be dependencies
      dependencies.push(...competingTodos.map(t => t.id));
    }

    return dependencies;
  }

  private getRiskBasedDependencies(
    todo: TodoItem,
    allTodos: TodoItem[],
    context: TodoGenerationContext
  ): string[] {
    const dependencies: string[] = [];

    // High-risk todos should depend on risk mitigation todos
    if (todo.risk_level === 'high' || todo.risk_level === 'critical') {
      const mitigationTodos = allTodos.filter(t => 
        t.id !== todo.id &&
        (t.description.toLowerCase().includes('risk') ||
         t.description.toLowerCase().includes('mitigation') ||
         t.category === 'review')
      );

      dependencies.push(...mitigationTodos.map(t => t.id));
    }

    return dependencies;
  }

  private validateDependencyGraph(todos: TodoItem[]): void {
    // Simple cycle detection using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (todoId: string): boolean => {
      if (recursionStack.has(todoId)) return true;
      if (visited.has(todoId)) return false;

      visited.add(todoId);
      recursionStack.add(todoId);

      const todo = todos.find(t => t.id === todoId);
      if (todo) {
        for (const depId of todo.dependencies) {
          if (hasCycle(depId)) return true;
        }
      }

      recursionStack.delete(todoId);
      return false;
    };

    // Check for cycles and remove problematic dependencies
    for (const todo of todos) {
      if (hasCycle(todo.id)) {
        // Remove the last dependency that creates the cycle
        todo.dependencies = todo.dependencies.slice(0, -1);
        this.logger.warn(`Removed dependency to break cycle for todo: ${todo.title}`);
      }
    }
  }

  private calculatePriorityScore(
    todo: TodoItem,
    taskContent: WorkTaskContent,
    context: TodoGenerationContext,
    allTodos: TodoItem[]
  ): number {
    let score = 0;

    // Base priority score
    const priorityScores = { 'low': 0.2, 'medium': 0.4, 'high': 0.6, 'critical': 0.8 };
    score += priorityScores[todo.priority] * 0.3;

    // Risk level score
    const riskScores = { 'low': 0.1, 'medium': 0.3, 'high': 0.6, 'critical': 0.9 };
    score += riskScores[todo.risk_level || 'low'] * 0.2;

    // Dependency impact score (todos that others depend on get higher priority)
    const dependentCount = allTodos.filter(t => t.dependencies.includes(todo.id)).length;
    score += Math.min(dependentCount / 5, 0.3) * 0.2;

    // Category importance score
    const categoryScores = {
      'research': 0.8, // Foundation work
      'development': 0.6,
      'testing': 0.5,
      'review': 0.4,
      'approval': 0.7, // Often blocking
      'documentation': 0.3
    };
    score += categoryScores[todo.category] * 0.15;

    // Blocking factors penalty (higher priority if it's blocking others)
    if (todo.blocking_factors && todo.blocking_factors.length > 0) {
      score += 0.15;
    }

    // Time constraint urgency
    const urgentConstraints = context.time_constraints.filter(tc => 
      tc.constraint_type === 'hard_deadline' && tc.flexibility < 0.3
    );
    if (urgentConstraints.length > 0) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private groupTodosByResources(todos: TodoItem[], context: TodoGenerationContext): { [key: string]: TodoItem[] } {
    const groups: { [key: string]: TodoItem[] } = {};

    for (const todo of todos) {
      for (const workgroupId of todo.related_workgroups) {
        const resource = context.available_resources.find(r => r.resource_id === workgroupId);
        if (resource) {
          if (!groups[resource.resource_type]) {
            groups[resource.resource_type] = [];
          }
          groups[resource.resource_type].push(todo);
        }
      }
    }

    return groups;
  }

  private removeDuplicateTodos(todos: TodoItem[]): TodoItem[] {
    const seen = new Set<string>();
    return todos.filter(todo => {
      const key = `${todo.title.toLowerCase()}-${todo.category}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private ensureMinimumRequiredTodos(todos: TodoItem[], context: TodoGenerationContext): TodoItem[] {
    const requiredCategories = ['research', 'development', 'testing'];
    const missingCategories = requiredCategories.filter(category => 
      !todos.some(todo => todo.category === category)
    );

    for (const category of missingCategories) {
      todos.push({
        id: uuidv4(),
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} Phase`,
        description: `Essential ${category} activities for task completion`,
        priority: 'medium',
        estimated_hours: this.calculateStandardTodoHours(category, context),
        dependencies: [],
        category: category as TodoItem['category'],
        status: 'pending',
        related_workgroups: [],
        deliverable_requirements: [],
        quality_requirements: []
      });
    }

    return todos;
  }

  private optimizeTodoOrdering(todos: TodoItem[]): TodoItem[] {
    // Topological sort based on dependencies
    const sorted: TodoItem[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (todoId: string) => {
      if (temp.has(todoId)) return; // Cycle detected, skip
      if (visited.has(todoId)) return;

      temp.add(todoId);
      
      const todo = todos.find(t => t.id === todoId);
      if (todo) {
        for (const depId of todo.dependencies) {
          visit(depId);
        }
        
        temp.delete(todoId);
        visited.add(todoId);
        sorted.push(todo);
      }
    };

    for (const todo of todos) {
      if (!visited.has(todo.id)) {
        visit(todo.id);
      }
    }

    return sorted;
  }

  private calculateStandardTodoHours(type: string, context: TodoGenerationContext): number {
    const baseHours = {
      'research': 8,
      'architecture': 12,
      'planning': 6,
      'qa_setup': 4,
      'documentation': 6,
      'security_review': 8,
      'performance_testing': 10
    };

    const hours = baseHours[type as keyof typeof baseHours] || 6;
    return Math.round(hours * (1 + context.task_complexity * 0.3));
  }

  private isSecuritySensitive(taskContent: WorkTaskContent, context: TodoGenerationContext): boolean {
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();
    const securityKeywords = ['security', 'auth', 'permission', 'encryption', 'privacy', 'compliance'];
    return securityKeywords.some(keyword => allContent.includes(keyword));
  }

  private isPerformanceCritical(taskContent: WorkTaskContent, context: TodoGenerationContext): boolean {
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();
    const performanceKeywords = ['performance', 'scalability', 'optimization', 'load', 'speed'];
    return performanceKeywords.some(keyword => allContent.includes(keyword)) || context.task_complexity > 0.7;
  }

  /**
   * 评估风险 - Enhanced with comprehensive risk analysis
   */
  private async assessRisks(
    taskContent: WorkTaskContent,
    keyPoints: string[],
    relatedWorkgroups: RelatedWorkgroup[]
  ): Promise<EnhancedRiskAssessment> {
    const riskFactors: RiskFactor[] = [];

    // Comprehensive risk assessment across multiple dimensions
    const technicalRisks = await this.assessTechnicalRisks(taskContent, keyPoints);
    const resourceRisks = await this.assessResourceRisks(taskContent, relatedWorkgroups);
    const timelineRisks = await this.assessTimelineRisks(taskContent, keyPoints);
    const securityRisks = await this.assessSecurityRisks(taskContent, keyPoints);
    const complianceRisks = await this.assessComplianceRisks(taskContent, keyPoints);
    const integrationRisks = await this.assessIntegrationRisks(taskContent, keyPoints, relatedWorkgroups);
    const businessRisks = await this.assessBusinessRisks(taskContent, keyPoints);

    riskFactors.push(
      ...technicalRisks,
      ...resourceRisks,
      ...timelineRisks,
      ...securityRisks,
      ...complianceRisks,
      ...integrationRisks,
      ...businessRisks
    );

    // Calculate overall risk using enhanced algorithm
    const overallRisk = this.calculateEnhancedOverallRisk(riskFactors);

    // Build risk matrix
    const riskMatrix = this.buildRiskMatrix(riskFactors);

    // Generate mitigation timeline
    const mitigationTimeline = this.generateMitigationTimeline(riskFactors);

    // Create contingency plans
    const contingencyPlans = this.createContingencyPlans(riskFactors, taskContent);

    // Set up monitoring indicators
    const monitoringIndicators = this.setupMonitoringIndicators(riskFactors);

    const enhancedRiskAssessment: EnhancedRiskAssessment = {
      overallRisk,
      riskFactors,
      mitigationStrategies: riskFactors.map(rf => rf.mitigation || '').filter(Boolean),
      impactAnalysis: {
        affectedSystems: this.identifyAffectedSystems(taskContent, keyPoints),
        affectedTeams: relatedWorkgroups.map(wg => wg.teamName),
        businessImpact: this.assessBusinessImpact(taskContent, overallRisk),
        technicalComplexity: this.mapTechnicalComplexity(this.assessTechnicalComplexity(taskContent, keyPoints)),
        resourceRequirements: this.identifyResourceRequirements(taskContent, relatedWorkgroups)
      },
      risk_matrix: riskMatrix,
      mitigation_timeline: mitigationTimeline,
      contingency_plans: contingencyPlans,
      monitoring_indicators: monitoringIndicators
    };

    return enhancedRiskAssessment;
  }

  /**
   * Assess technical risks with detailed analysis
   */
  private async assessTechnicalRisks(taskContent: WorkTaskContent, keyPoints: string[]): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    // Technology complexity risk
    const technicalComplexity = this.assessTechnicalComplexity(taskContent, keyPoints);
    if (technicalComplexity > 0.5) {
      risks.push({
        type: 'technical',
        description: `High technical complexity (${Math.round(technicalComplexity * 100)}%) may lead to implementation challenges`,
        probability: Math.min(technicalComplexity + 0.2, 0.9),
        impact: 0.7,
        mitigation: 'Conduct technical spike, engage senior developers, create proof of concept'
      });
    }

    // New technology risk
    const newTechKeywords = ['new technology', 'experimental', 'beta', 'cutting edge', 'latest version'];
    const hasNewTech = newTechKeywords.some(keyword => allContent.includes(keyword));
    if (hasNewTech) {
      risks.push({
        type: 'technical',
        description: 'Use of new or experimental technology increases uncertainty',
        probability: 0.6,
        impact: 0.6,
        mitigation: 'Create prototype, establish fallback options, allocate extra time for learning'
      });
    }

    // Integration complexity risk
    const integrationKeywords = ['integration', 'api', 'third-party', 'external system', 'microservice'];
    const integrationCount = integrationKeywords.filter(keyword => allContent.includes(keyword)).length;
    if (integrationCount > 2) {
      risks.push({
        type: 'technical',
        description: 'Multiple system integrations increase technical risk and failure points',
        probability: 0.5 + (integrationCount * 0.1),
        impact: 0.8,
        mitigation: 'Design robust error handling, implement circuit breakers, plan integration testing'
      });
    }

    // Performance risk
    const performanceKeywords = ['performance', 'scalability', 'high load', 'concurrent users'];
    const hasPerformanceRequirements = performanceKeywords.some(keyword => allContent.includes(keyword));
    if (hasPerformanceRequirements) {
      risks.push({
        type: 'technical',
        description: 'Performance requirements may be difficult to achieve without proper architecture',
        probability: 0.4,
        impact: 0.7,
        mitigation: 'Conduct performance testing early, implement monitoring, design for scalability'
      });
    }

    return risks;
  }

  /**
   * Assess resource-related risks
   */
  private async assessResourceRisks(taskContent: WorkTaskContent, relatedWorkgroups: RelatedWorkgroup[]): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];

    // Team availability risk
    const overloadedTeams = relatedWorkgroups.filter(wg => 
      wg.capacityInfo && wg.capacityInfo.currentWorkload > 0.8
    );
    
    if (overloadedTeams.length > 0) {
      risks.push({
        type: 'resource',
        description: `${overloadedTeams.length} team(s) are at high capacity, may cause delays`,
        probability: 0.7,
        impact: 0.6,
        mitigation: 'Negotiate resource allocation, consider external resources, adjust timeline'
      });
    }

    // Skill gap risk
    const teamsWithSkillGaps = relatedWorkgroups.filter(wg => 
      wg.skillMatchDetails && wg.skillMatchDetails.skillGaps.length > 0
    );

    if (teamsWithSkillGaps.length > 0) {
      risks.push({
        type: 'resource',
        description: 'Skill gaps identified in assigned teams may impact delivery quality',
        probability: 0.5,
        impact: 0.5,
        mitigation: 'Provide training, engage consultants, pair with experienced team members'
      });
    }

    // Multi-team coordination risk
    if (relatedWorkgroups.length > 3) {
      risks.push({
        type: 'resource',
        description: 'Coordination complexity increases with multiple teams involved',
        probability: 0.6,
        impact: 0.5,
        mitigation: 'Establish clear communication protocols, assign coordination lead, regular sync meetings'
      });
    }

    // Key person dependency risk
    const criticalTeams = relatedWorkgroups.filter(wg => wg.recommendedInvolvement === 'collaboration');
    if (criticalTeams.length > 0) {
      risks.push({
        type: 'resource',
        description: 'Dependency on key team members may create bottlenecks',
        probability: 0.4,
        impact: 0.7,
        mitigation: 'Cross-train team members, document knowledge, establish backup resources'
      });
    }

    return risks;
  }

  /**
   * Assess timeline-related risks
   */
  private async assessTimelineRisks(taskContent: WorkTaskContent, keyPoints: string[]): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];

    // Aggressive timeline risk
    if (taskContent.priority === 'critical') {
      risks.push({
        type: 'timeline',
        description: 'Critical priority indicates aggressive timeline with limited flexibility',
        probability: 0.7,
        impact: 0.8,
        mitigation: 'Parallel execution, reduce scope if needed, increase resources'
      });
    }

    // Scope creep risk
    const scopeIndicators = ['flexible', 'evolving', 'additional features', 'nice to have'];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();
    const hasScopeRisk = scopeIndicators.some(indicator => allContent.includes(indicator));
    
    if (hasScopeRisk) {
      risks.push({
        type: 'timeline',
        description: 'Potential for scope creep may impact timeline',
        probability: 0.5,
        impact: 0.6,
        mitigation: 'Define clear scope boundaries, implement change control process'
      });
    }

    // Dependency delay risk
    const dependencyKeywords = ['depends on', 'waiting for', 'blocked by', 'prerequisite'];
    const hasDependencies = dependencyKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasDependencies) {
      risks.push({
        type: 'timeline',
        description: 'External dependencies may cause delays',
        probability: 0.6,
        impact: 0.7,
        mitigation: 'Identify critical path, establish contingency plans, regular dependency tracking'
      });
    }

    return risks;
  }

  /**
   * Assess security-related risks
   */
  private async assessSecurityRisks(taskContent: WorkTaskContent, keyPoints: string[]): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    // Data security risk
    const dataKeywords = ['personal data', 'sensitive information', 'user data', 'pii', 'confidential'];
    const hasDataSecurity = dataKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasDataSecurity) {
      risks.push({
        type: 'security',
        description: 'Handling sensitive data requires strict security measures',
        probability: 0.8,
        impact: 0.9,
        mitigation: 'Implement data encryption, access controls, security audit, compliance review'
      });
    }

    // Authentication/Authorization risk
    const authKeywords = ['authentication', 'authorization', 'access control', 'permissions', 'login'];
    const hasAuthSecurity = authKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasAuthSecurity) {
      risks.push({
        type: 'security',
        description: 'Authentication and authorization systems are critical security components',
        probability: 0.6,
        impact: 0.8,
        mitigation: 'Use proven security frameworks, conduct penetration testing, implement MFA'
      });
    }

    // API security risk
    const apiKeywords = ['api', 'endpoint', 'rest', 'graphql', 'web service'];
    const hasApiSecurity = apiKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasApiSecurity) {
      risks.push({
        type: 'security',
        description: 'API endpoints require proper security implementation',
        probability: 0.5,
        impact: 0.7,
        mitigation: 'Implement API authentication, rate limiting, input validation, security headers'
      });
    }

    return risks;
  }

  /**
   * Assess compliance-related risks
   */
  private async assessComplianceRisks(taskContent: WorkTaskContent, keyPoints: string[]): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    // Regulatory compliance risk
    const complianceKeywords = ['gdpr', 'hipaa', 'sox', 'pci', 'compliance', 'regulation', 'audit'];
    const hasCompliance = complianceKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasCompliance) {
      risks.push({
        type: 'compliance',
        description: 'Regulatory compliance requirements must be met to avoid legal issues',
        probability: 0.7,
        impact: 0.9,
        mitigation: 'Engage compliance team early, conduct compliance review, document controls'
      });
    }

    // Data retention risk
    const dataRetentionKeywords = ['data retention', 'data lifecycle', 'archival', 'deletion policy'];
    const hasDataRetention = dataRetentionKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasDataRetention) {
      risks.push({
        type: 'compliance',
        description: 'Data retention policies must be properly implemented',
        probability: 0.5,
        impact: 0.6,
        mitigation: 'Define clear data retention policies, implement automated cleanup, audit trails'
      });
    }

    return risks;
  }

  /**
   * Assess integration-related risks
   */
  private async assessIntegrationRisks(
    taskContent: WorkTaskContent,
    keyPoints: string[],
    relatedWorkgroups: RelatedWorkgroup[]
  ): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    // Third-party integration risk
    const thirdPartyKeywords = ['third-party', 'external api', 'vendor', 'partner system'];
    const hasThirdParty = thirdPartyKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasThirdParty) {
      risks.push({
        type: 'integration',
        description: 'Third-party integrations introduce external dependencies and potential failures',
        probability: 0.6,
        impact: 0.7,
        mitigation: 'Implement circuit breakers, fallback mechanisms, SLA monitoring, vendor communication'
      });
    }

    // Legacy system integration risk
    const legacyKeywords = ['legacy', 'old system', 'mainframe', 'deprecated'];
    const hasLegacy = legacyKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasLegacy) {
      risks.push({
        type: 'integration',
        description: 'Legacy system integration may have technical limitations and compatibility issues',
        probability: 0.7,
        impact: 0.6,
        mitigation: 'Thorough compatibility testing, adapter patterns, gradual migration approach'
      });
    }

    // Data synchronization risk
    const syncKeywords = ['synchronization', 'data sync', 'real-time', 'consistency'];
    const hasSync = syncKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasSync) {
      risks.push({
        type: 'integration',
        description: 'Data synchronization across systems may lead to consistency issues',
        probability: 0.5,
        impact: 0.8,
        mitigation: 'Implement eventual consistency patterns, conflict resolution, monitoring'
      });
    }

    return risks;
  }

  /**
   * Assess business-related risks
   */
  private async assessBusinessRisks(taskContent: WorkTaskContent, keyPoints: string[]): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    // Stakeholder alignment risk
    const stakeholderKeywords = ['stakeholder', 'multiple teams', 'cross-functional', 'various departments'];
    const hasMultipleStakeholders = stakeholderKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasMultipleStakeholders) {
      risks.push({
        type: 'business',
        description: 'Multiple stakeholders may have conflicting requirements or priorities',
        probability: 0.5,
        impact: 0.6,
        mitigation: 'Regular stakeholder meetings, clear communication, documented decisions'
      });
    }

    // Market timing risk
    if (taskContent.priority === 'critical') {
      risks.push({
        type: 'business',
        description: 'Critical priority suggests market or business timing pressures',
        probability: 0.4,
        impact: 0.7,
        mitigation: 'Focus on MVP, parallel development, risk-based prioritization'
      });
    }

    // User adoption risk
    const userKeywords = ['user experience', 'user interface', 'customer facing', 'public'];
    const hasUserImpact = userKeywords.some(keyword => allContent.includes(keyword));
    
    if (hasUserImpact) {
      risks.push({
        type: 'business',
        description: 'User-facing changes may impact adoption and satisfaction',
        probability: 0.4,
        impact: 0.6,
        mitigation: 'User testing, gradual rollout, feedback collection, rollback plan'
      });
    }

    return risks;
  }

  /**
   * Calculate enhanced overall risk using weighted factors
   */
  private calculateEnhancedOverallRisk(riskFactors: RiskFactor[]): RiskAssessment['overallRisk'] {
    if (riskFactors.length === 0) return 'low';

    // Weight different risk types
    const riskWeights = {
      'security': 1.5,
      'compliance': 1.4,
      'business': 1.2,
      'technical': 1.1,
      'integration': 1.0,
      'resource': 0.9,
      'timeline': 0.8
    };

    let totalWeightedRisk = 0;
    let totalWeight = 0;

    for (const risk of riskFactors) {
      const weight = riskWeights[risk.type as keyof typeof riskWeights] || 1.0;
      const riskScore = risk.probability * risk.impact;
      totalWeightedRisk += riskScore * weight;
      totalWeight += weight;
    }

    const averageRisk = totalWeight > 0 ? totalWeightedRisk / totalWeight : 0;

    if (averageRisk >= 0.7) return 'critical';
    if (averageRisk >= 0.5) return 'high';
    if (averageRisk >= 0.3) return 'medium';
    return 'low';
  }

  /**
   * Build risk matrix for visualization and analysis
   */
  private buildRiskMatrix(riskFactors: RiskFactor[]): RiskMatrix {
    const grid: RiskGridCell[][] = [];
    
    // Create 5x5 risk matrix
    for (let i = 0; i < 5; i++) {
      grid[i] = [];
      for (let j = 0; j < 5; j++) {
        const probabilityRange: [number, number] = [i * 0.2, (i + 1) * 0.2];
        const impactRange: [number, number] = [j * 0.2, (j + 1) * 0.2];
        
        let riskLevel: RiskGridCell['risk_level'] = 'low';
        let actionRequired: RiskGridCell['action_required'] = 'monitor';
        
        const combinedScore = (probabilityRange[1] + impactRange[1]) / 2;
        if (combinedScore >= 0.8) {
          riskLevel = 'critical';
          actionRequired = 'avoid';
        } else if (combinedScore >= 0.6) {
          riskLevel = 'high';
          actionRequired = 'mitigate';
        } else if (combinedScore >= 0.4) {
          riskLevel = 'medium';
          actionRequired = 'mitigate';
        }

        grid[i][j] = {
          probability_range: probabilityRange,
          impact_range: impactRange,
          risk_level: riskLevel,
          action_required: actionRequired
        };
      }
    }

    return {
      probability_impact_grid: grid,
      risk_appetite: 'medium', // Default risk appetite
      acceptable_risk_threshold: 0.3
    };
  }

  /**
   * Generate mitigation timeline for identified risks
   */
  private generateMitigationTimeline(riskFactors: RiskFactor[]): MitigationTimeline[] {
    return riskFactors
      .filter(risk => risk.probability * risk.impact >= 0.3) // Only mitigate significant risks
      .map(risk => ({
        risk_id: `risk-${risk.type}-${Date.now()}`,
        mitigation_actions: this.generateMitigationActions(risk),
        timeline: this.calculateMitigationTimeline(risk),
        responsible_party: this.assignResponsibleParty(risk),
        success_criteria: this.defineMitigationSuccessCriteria(risk)
      }));
  }

  /**
   * Create contingency plans for high-impact risks
   */
  private createContingencyPlans(riskFactors: RiskFactor[], taskContent: WorkTaskContent): ContingencyPlan[] {
    const highImpactRisks = riskFactors.filter(risk => risk.impact >= 0.7);
    
    return highImpactRisks.map(risk => ({
      plan_id: `contingency-${risk.type}-${Date.now()}`,
      trigger_conditions: this.defineTriggerConditions(risk),
      actions: this.defineContingencyActions(risk, taskContent),
      resource_requirements: this.defineContingencyResources(risk),
      activation_criteria: `When ${risk.type} risk materializes with impact >= ${risk.impact}`
    }));
  }

  /**
   * Setup monitoring indicators for risk tracking
   */
  private setupMonitoringIndicators(riskFactors: RiskFactor[]): MonitoringIndicator[] {
    const indicators: MonitoringIndicator[] = [];

    // Technical risk indicators
    if (riskFactors.some(r => r.type === 'technical')) {
      indicators.push({
        indicator_name: 'Technical Debt Score',
        current_value: 0.3,
        threshold_value: 0.5,
        trend: 'stable',
        monitoring_frequency: 'weekly'
      });
    }

    // Timeline risk indicators
    if (riskFactors.some(r => r.type === 'timeline')) {
      indicators.push({
        indicator_name: 'Schedule Performance Index',
        current_value: 1.0,
        threshold_value: 0.8,
        trend: 'stable',
        monitoring_frequency: 'weekly'
      });
    }

    // Resource risk indicators
    if (riskFactors.some(r => r.type === 'resource')) {
      indicators.push({
        indicator_name: 'Team Utilization Rate',
        current_value: 0.75,
        threshold_value: 0.9,
        trend: 'improving',
        monitoring_frequency: 'weekly'
      });
    }

    return indicators;
  }

  // Helper methods for risk assessment enhancement

  private generateMitigationActions(risk: RiskFactor): MitigationAction[] {
    const actions: MitigationAction[] = [];
    
    // Generate specific actions based on risk type
    switch (risk.type) {
      case 'technical':
        actions.push({
          action_id: 'tech-spike',
          description: 'Conduct technical spike to validate approach',
          effort_required: 16,
          cost_estimate: 1200,
          effectiveness: 0.7
        });
        break;
      case 'security':
        actions.push({
          action_id: 'security-review',
          description: 'Conduct comprehensive security review',
          effort_required: 24,
          cost_estimate: 2000,
          effectiveness: 0.8
        });
        break;
      case 'resource':
        actions.push({
          action_id: 'resource-planning',
          description: 'Develop detailed resource allocation plan',
          effort_required: 8,
          cost_estimate: 600,
          effectiveness: 0.6
        });
        break;
      default:
        actions.push({
          action_id: 'general-mitigation',
          description: risk.mitigation || 'Implement general risk mitigation measures',
          effort_required: 12,
          effectiveness: 0.5
        });
    }

    return actions;
  }

  private calculateMitigationTimeline(risk: RiskFactor): string {
    const urgency = risk.probability * risk.impact;
    
    if (urgency >= 0.7) return 'Immediate (within 1 week)';
    if (urgency >= 0.5) return 'Short-term (within 2 weeks)';
    if (urgency >= 0.3) return 'Medium-term (within 1 month)';
    return 'Long-term (within 3 months)';
  }

  private assignResponsibleParty(risk: RiskFactor): string {
    const responsibilityMap = {
      'technical': 'Technical Lead',
      'security': 'Security Team',
      'compliance': 'Compliance Officer',
      'resource': 'Project Manager',
      'timeline': 'Project Manager',
      'integration': 'Integration Lead',
      'business': 'Product Owner'
    };

    return responsibilityMap[risk.type as keyof typeof responsibilityMap] || 'Project Manager';
  }

  private defineMitigationSuccessCriteria(risk: RiskFactor): string[] {
    const criteria: string[] = [];
    
    switch (risk.type) {
      case 'technical':
        criteria.push('Technical approach validated through prototype');
        criteria.push('Technical risks documented and addressed');
        break;
      case 'security':
        criteria.push('Security review completed with no critical findings');
        criteria.push('Security controls implemented and tested');
        break;
      case 'resource':
        criteria.push('Resource allocation confirmed and documented');
        criteria.push('Team capacity validated against requirements');
        break;
      default:
        criteria.push('Risk impact reduced by at least 50%');
        criteria.push('Mitigation measures implemented and verified');
    }

    return criteria;
  }

  private defineTriggerConditions(risk: RiskFactor): string[] {
    const conditions: string[] = [];
    
    switch (risk.type) {
      case 'technical':
        conditions.push('Technical implementation blocked for > 2 days');
        conditions.push('Critical technical issues identified');
        break;
      case 'timeline':
        conditions.push('Schedule variance > 20%');
        conditions.push('Critical path activities delayed');
        break;
      case 'resource':
        conditions.push('Key team members unavailable');
        conditions.push('Resource utilization > 90%');
        break;
      default:
        conditions.push(`${risk.type} risk indicators exceed threshold`);
    }

    return conditions;
  }

  private defineContingencyActions(risk: RiskFactor, taskContent: WorkTaskContent): string[] {
    const actions: string[] = [];
    
    switch (risk.type) {
      case 'technical':
        actions.push('Engage external technical consultants');
        actions.push('Implement alternative technical approach');
        actions.push('Reduce technical scope to core requirements');
        break;
      case 'timeline':
        actions.push('Increase team size');
        actions.push('Reduce scope to critical features');
        actions.push('Implement parallel development streams');
        break;
      case 'resource':
        actions.push('Reallocate resources from other projects');
        actions.push('Engage external contractors');
        actions.push('Adjust project timeline');
        break;
      default:
        actions.push('Escalate to management');
        actions.push('Implement emergency response procedures');
    }

    return actions;
  }

  private defineContingencyResources(risk: RiskFactor): ResourceRequirement[] {
    const resources: ResourceRequirement[] = [];
    
    switch (risk.type) {
      case 'technical':
        resources.push({
          type: 'human',
          description: 'Senior Technical Consultant',
          quantity: 1,
          unit: 'person',
          criticality: 'required'
        });
        break;
      case 'resource':
        resources.push({
          type: 'human',
          description: 'Additional Development Resources',
          quantity: 2,
          unit: 'person',
          criticality: 'required'
        });
        break;
      default:
        resources.push({
          type: 'financial',
          description: 'Emergency Budget Allocation',
          quantity: 10000,
          unit: 'USD',
          criticality: 'optional'
        });
    }

    return resources;
  }

  /**
   * 估算工作量
   */
  private async estimateEffort(todoList: TodoItem[], riskAssessment: RiskAssessment): Promise<EffortEstimate> {
    const breakdown: EffortBreakdown[] = [];
    let totalHours = 0;

    // 按类别汇总工作量
    const categoryHours: { [key: string]: number } = {};
    
    for (const todo of todoList) {
      categoryHours[todo.category] = (categoryHours[todo.category] || 0) + todo.estimatedHours;
      totalHours += todo.estimatedHours;
    }

    for (const [category, hours] of Object.entries(categoryHours)) {
      breakdown.push({
        category: this.getCategoryDisplayName(category),
        hours,
        description: `${category}相关工作的预估时间`
      });
    }

    // 根据风险调整工作量
    const riskMultiplier = this.getRiskMultiplier(riskAssessment.overallRisk);
    totalHours *= riskMultiplier;

    // 添加风险缓冲时间
    const bufferHours = totalHours * 0.2; // 20%缓冲
    breakdown.push({
      category: '风险缓冲',
      hours: bufferHours,
      description: '应对不确定性和风险的额外时间'
    });

    totalHours += bufferHours;

    return {
      totalHours: Math.round(totalHours),
      breakdown,
      confidence: this.calculateEstimateConfidence(riskAssessment),
      assumptions: [
        '基于历史项目数据的估算',
        '假设团队成员具备相应技能',
        '假设外部依赖按时交付',
        '包含20%的风险缓冲时间'
      ]
    };
  }

  /**
   * 分析依赖关系
   */
  private async analyzeDependencies(
    taskContent: WorkTaskContent,
    todoList: TodoItem[]
  ): Promise<TaskDependency[]> {
    const dependencies: TaskDependency[] = [];

    // 分析外部系统依赖
    const externalSystems = this.identifyExternalSystems(taskContent);
    for (const system of externalSystems) {
      dependencies.push({
        dependencyId: uuidv4(),
        type: 'requires',
        description: `需要${system}系统的支持或集成`,
        externalSystem: system,
        criticality: 'high'
      });
    }

    // 分析任务间依赖
    for (let i = 1; i < todoList.length; i++) {
      const currentTodo = todoList[i];
      const previousTodo = todoList[i - 1];

      if (this.hasDependencyRelation(currentTodo, previousTodo)) {
        dependencies.push({
          dependencyId: uuidv4(),
          type: 'blocks',
          description: `${previousTodo.title}必须在${currentTodo.title}之前完成`,
          targetTask: currentTodo.id,
          criticality: 'medium'
        });
      }
    }

    return dependencies;
  }

  /**
   * 执行合规性检查
   */
  private async performComplianceChecks(taskContent: WorkTaskContent): Promise<ComplianceCheck[]> {
    try {
      const checks: ComplianceCheck[] = [];

      // 使用规则引擎进行合规性检查
      const content = `${taskContent.title} ${taskContent.description} ${taskContent.content}`;
      const complianceResult = await this.rulesEngine.validateContent(content, taskContent.teamId);

      if (complianceResult.violations && complianceResult.violations.length > 0) {
        for (const violation of complianceResult.violations) {
          checks.push({
            policyId: violation.ruleId || 'unknown',
            policyName: violation.ruleName || '未知策略',
            status: 'non_compliant',
            details: violation.description,
            requiredActions: violation.suggestions || []
          });
        }
      }

      // 添加标准合规性检查
      const standardChecks = [
        {
          policyId: 'security-review',
          policyName: '安全审查要求',
          status: this.needsSecurityReview(taskContent) ? 'needs_review' : 'not_applicable',
          details: '涉及安全相关内容需要进行安全审查',
          requiredActions: ['联系安全团队进行审查', '完成安全检查清单']
        },
        {
          policyId: 'data-privacy',
          policyName: '数据隐私保护',
          status: this.involvesPersonalData(taskContent) ? 'needs_review' : 'not_applicable',
          details: '涉及个人数据处理需要符合隐私保护要求',
          requiredActions: ['进行隐私影响评估', '确保数据处理合规']
        }
      ];

      checks.push(...standardChecks.filter(check => check.status !== 'not_applicable'));

      return checks;

    } catch (error) {
      this.logger.error('合规性检查失败', error as Error);
      return [];
    }
  }

  /**
   * 生成建议
   */
  private async generateRecommendations(
    taskContent: WorkTaskContent,
    riskAssessment: RiskAssessment,
    relatedWorkgroups: RelatedWorkgroup[],
    complianceChecks: ComplianceCheck[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // 基于风险的建议
    if (riskAssessment.overallRisk === 'high' || riskAssessment.overallRisk === 'critical') {
      recommendations.push('建议将任务分解为更小的子任务，降低实施风险');
      recommendations.push('考虑增加项目管理和监控频率');
    }

    // 基于工作组的建议
    if (relatedWorkgroups.length > 2) {
      recommendations.push('建议尽早召开跨团队协调会议，明确各方职责');
      recommendations.push('建立定期沟通机制，确保信息同步');
    }

    // 基于合规性的建议
    const nonCompliantChecks = complianceChecks.filter(check => check.status === 'non_compliant');
    if (nonCompliantChecks.length > 0) {
      recommendations.push('优先解决合规性问题，避免后期返工');
      recommendations.push('建议在项目早期引入合规专家');
    }

    // 基于任务优先级的建议
    if (taskContent.priority === 'critical') {
      recommendations.push('建议分配最有经验的团队成员负责关键任务');
      recommendations.push('考虑准备应急预案和回滚方案');
    }

    // 通用建议
    recommendations.push('建议定期更新项目进度，及时识别和解决问题');
    recommendations.push('确保充分的文档记录，便于知识传承');

    return recommendations;
  }

  // 辅助方法
  private mapSourceType(type: string): KnowledgeReference['sourceType'] {
    const mapping: { [key: string]: KnowledgeReference['sourceType'] } = {
      'policy': 'policy',
      'document': 'documentation',
      'best_practice': 'best_practice',
      'project': 'previous_project',
      'expertise': 'expertise'
    };
    return mapping[type] || 'documentation';
  }

  private deduplicateReferences(references: KnowledgeReference[]): KnowledgeReference[] {
    const seen = new Set<string>();
    return references.filter(ref => {
      const key = `${ref.sourceId}-${ref.title}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private calculateRelevanceScore(content: string, keyword: string): number {
    const occurrences = (content.match(new RegExp(keyword, 'gi')) || []).length;
    return Math.min(occurrences * 0.2 + 0.3, 1.0);
  }

  private determineInvolvementLevel(relevanceScore: number): RelatedWorkgroup['recommendedInvolvement'] {
    if (relevanceScore >= 0.8) return 'collaboration';
    if (relevanceScore >= 0.6) return 'consultation';
    if (relevanceScore >= 0.4) return 'notification';
    return 'notification';
  }

  private categorizeKeyPoint(keyPoint: string): TodoItem['category'] {
    const lowerPoint = keyPoint.toLowerCase();
    
    if (lowerPoint.includes('research') || lowerPoint.includes('分析') || lowerPoint.includes('调研')) {
      return 'research';
    }
    if (lowerPoint.includes('develop') || lowerPoint.includes('开发') || lowerPoint.includes('实现')) {
      return 'development';
    }
    if (lowerPoint.includes('review') || lowerPoint.includes('审查') || lowerPoint.includes('检查')) {
      return 'review';
    }
    if (lowerPoint.includes('approval') || lowerPoint.includes('批准') || lowerPoint.includes('确认')) {
      return 'approval';
    }
    if (lowerPoint.includes('document') || lowerPoint.includes('文档') || lowerPoint.includes('记录')) {
      return 'documentation';
    }
    if (lowerPoint.includes('test') || lowerPoint.includes('测试') || lowerPoint.includes('验证')) {
      return 'testing';
    }
    
    return 'development';
  }

  private generateTodoTitle(keyPoint: string): string {
    // 简化关键要点为TODO标题
    const title = keyPoint.length > 50 ? keyPoint.substring(0, 47) + '...' : keyPoint;
    return title.replace(/^[^a-zA-Z\u4e00-\u9fa5]*/, '').trim();
  }

  private determineTodoPriority(keyPoint: string, taskPriority?: string): TodoItem['priority'] {
    const lowerPoint = keyPoint.toLowerCase();
    
    if (lowerPoint.includes('critical') || lowerPoint.includes('urgent') || lowerPoint.includes('紧急')) {
      return 'critical';
    }
    if (lowerPoint.includes('important') || lowerPoint.includes('重要') || taskPriority === 'high') {
      return 'high';
    }
    if (taskPriority === 'critical') {
      return 'high';
    }
    
    return 'medium';
  }

  private estimateTodoHours(keyPoint: string, category: TodoItem['category']): number {
    const baseHours = {
      'research': 4,
      'development': 8,
      'review': 3,
      'approval': 2,
      'documentation': 3,
      'testing': 6
    };

    let hours = baseHours[category];
    
    // 根据关键要点的复杂度调整
    const complexityKeywords = ['complex', 'integrate', 'optimize', '复杂', '集成', '优化'];
    const hasComplexity = complexityKeywords.some(keyword => 
      keyPoint.toLowerCase().includes(keyword)
    );
    
    if (hasComplexity) {
      hours *= 1.5;
    }

    return Math.round(hours);
  }

  private identifyTodoWorkgroups(description: string): string[] {
    const workgroups: string[] = [];
    const lowerDesc = description.toLowerCase();

    const mappings = {
      'security': 'security-team',
      'database': 'data-team',
      'frontend': 'frontend-team',
      'backend': 'backend-team',
      'devops': 'devops-team',
      'test': 'qa-team',
      'design': 'design-team'
    };

    for (const [keyword, teamId] of Object.entries(mappings)) {
      if (lowerDesc.includes(keyword)) {
        workgroups.push(teamId);
      }
    }

    return workgroups;
  }

  private assessTechnicalComplexity(taskContent: WorkTaskContent, keyPoints: string[]): number {
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();
    
    const complexityIndicators = [
      'integration', 'architecture', 'performance', 'scalability', 'security',
      'migration', 'optimization', 'algorithm', 'machine learning', 'ai',
      '集成', '架构', '性能', '扩展', '安全', '迁移', '优化', '算法', '机器学习', '人工智能'
    ];

    let complexityScore = 0;
    for (const indicator of complexityIndicators) {
      if (allContent.includes(indicator)) {
        complexityScore += 0.1;
      }
    }

    return Math.min(complexityScore, 1.0);
  }

  private calculateOverallRisk(riskFactors: RiskFactor[]): RiskAssessment['overallRisk'] {
    if (riskFactors.length === 0) return 'low';

    const avgRisk = riskFactors.reduce((sum, rf) => sum + (rf.probability * rf.impact), 0) / riskFactors.length;

    if (avgRisk >= 0.7) return 'critical';
    if (avgRisk >= 0.5) return 'high';
    if (avgRisk >= 0.3) return 'medium';
    return 'low';
  }

  private identifyAffectedSystems(taskContent: WorkTaskContent, keyPoints: string[]): string[] {
    const systems: string[] = [];
    const allContent = `${taskContent.title} ${taskContent.description} ${taskContent.content} ${keyPoints.join(' ')}`.toLowerCase();

    const systemKeywords = {
      'database': '数据库系统',
      'api': 'API服务',
      'frontend': '前端系统',
      'backend': '后端系统',
      'auth': '认证系统',
      'payment': '支付系统',
      'notification': '通知系统'
    };

    for (const [keyword, systemName] of Object.entries(systemKeywords)) {
      if (allContent.includes(keyword)) {
        systems.push(systemName);
      }
    }

    return systems;
  }

  private assessBusinessImpact(taskContent: WorkTaskContent, overallRisk: string): ImpactAnalysis['businessImpact'] {
    if (taskContent.priority === 'critical') return 'critical';
    if (taskContent.priority === 'high' && overallRisk === 'high') return 'significant';
    if (taskContent.priority === 'high') return 'moderate';
    return 'minimal';
  }

  private mapTechnicalComplexity(complexity: number): ImpactAnalysis['technicalComplexity'] {
    if (complexity >= 0.8) return 'very_high';
    if (complexity >= 0.6) return 'high';
    if (complexity >= 0.3) return 'medium';
    return 'low';
  }

  private identifyResourceRequirements(
    taskContent: WorkTaskContent,
    relatedWorkgroups: RelatedWorkgroup[]
  ): ResourceRequirement[] {
    const requirements: ResourceRequirement[] = [];

    // 人力资源需求
    requirements.push({
      type: 'human',
      description: '开发团队成员',
      quantity: Math.max(2, Math.ceil(relatedWorkgroups.length / 2)),
      unit: '人',
      criticality: 'required'
    });

    // 时间资源需求
    const timeMultiplier = taskContent.priority === 'critical' ? 0.7 : 1.0;
    requirements.push({
      type: 'time',
      description: '项目开发时间',
      quantity: Math.round(40 * timeMultiplier), // 基础40小时
      unit: '小时',
      criticality: 'required'
    });

    return requirements;
  }

  private getRiskMultiplier(overallRisk: string): number {
    const multipliers = {
      'low': 1.1,
      'medium': 1.3,
      'high': 1.5,
      'critical': 2.0
    };
    return multipliers[overallRisk as keyof typeof multipliers] || 1.2;
  }

  private calculateEstimateConfidence(riskAssessment: RiskAssessment): number {
    const baseConfidence = 0.7;
    const riskPenalty = {
      'low': 0,
      'medium': -0.1,
      'high': -0.2,
      'critical': -0.3
    };

    return Math.max(0.3, baseConfidence + (riskPenalty[riskAssessment.overallRisk] || -0.1));
  }

  private getCategoryDisplayName(category: string): string {
    const names = {
      'research': '需求分析',
      'development': '开发实现',
      'review': '审查评估',
      'approval': '审批确认',
      'documentation': '文档编写',
      'testing': '测试验证'
    };
    return names[category as keyof typeof names] || category;
  }

  /**
   * Generate deliverable requirements for a todo item
   */
  private generateDeliverableRequirements(keyPoint: string, category: TodoItem['category']): DeliverableRequirement[] {
    const requirements: DeliverableRequirement[] = [];
    const lowerPoint = keyPoint.toLowerCase();

    // Category-based deliverable requirements
    switch (category) {
      case 'development':
        requirements.push({
          requirement_id: uuidv4(),
          name: 'Source Code',
          description: 'Implementation source code files',
          file_type_restrictions: ['.ts', '.js', '.py', '.java', '.cs', '.cpp', '.go'],
          size_limits: { max_size: 50 * 1024 * 1024 }, // 50MB
          format_requirements: ['UTF-8 encoding', 'Proper indentation', 'No syntax errors'],
          content_requirements: ['Function documentation', 'Error handling', 'Unit tests'],
          quality_standards: ['code-quality-standard', 'security-standard'],
          mandatory: true
        });
        break;

      case 'documentation':
        requirements.push({
          requirement_id: uuidv4(),
          name: 'Technical Documentation',
          description: 'Comprehensive technical documentation',
          file_type_restrictions: ['.md', '.pdf', '.docx', '.html'],
          size_limits: { max_size: 10 * 1024 * 1024 }, // 10MB
          format_requirements: ['Clear structure', 'Table of contents', 'Proper formatting'],
          content_requirements: ['Overview', 'Implementation details', 'Usage examples'],
          quality_standards: ['documentation-standard'],
          mandatory: true
        });
        break;

      case 'testing':
        requirements.push({
          requirement_id: uuidv4(),
          name: 'Test Results',
          description: 'Test execution results and coverage reports',
          file_type_restrictions: ['.xml', '.json', '.html', '.txt'],
          size_limits: { max_size: 5 * 1024 * 1024 }, // 5MB
          format_requirements: ['Standard test report format', 'Coverage metrics'],
          content_requirements: ['Test cases', 'Pass/fail status', 'Coverage percentage'],
          quality_standards: ['testing-standard'],
          mandatory: true
        });
        break;

      case 'review':
        requirements.push({
          requirement_id: uuidv4(),
          name: 'Review Report',
          description: 'Detailed review findings and recommendations',
          file_type_restrictions: ['.md', '.pdf', '.docx'],
          size_limits: { max_size: 5 * 1024 * 1024 }, // 5MB
          format_requirements: ['Structured format', 'Clear findings', 'Action items'],
          content_requirements: ['Review criteria', 'Findings', 'Recommendations'],
          quality_standards: ['review-standard'],
          mandatory: true
        });
        break;

      default:
        // Generic deliverable for other categories
        requirements.push({
          requirement_id: uuidv4(),
          name: 'Task Output',
          description: 'Primary deliverable for the task',
          size_limits: { max_size: 25 * 1024 * 1024 }, // 25MB
          format_requirements: ['Professional format', 'Clear content'],
          content_requirements: ['Complete information', 'Proper structure'],
          quality_standards: ['general-standard'],
          mandatory: true
        });
    }

    // Add specific requirements based on key point content
    if (lowerPoint.includes('security') || lowerPoint.includes('安全')) {
      requirements.push({
        requirement_id: uuidv4(),
        name: 'Security Assessment',
        description: 'Security analysis and compliance documentation',
        file_type_restrictions: ['.pdf', '.md', '.docx'],
        size_limits: { max_size: 10 * 1024 * 1024 },
        format_requirements: ['Security checklist format'],
        content_requirements: ['Threat analysis', 'Mitigation strategies', 'Compliance verification'],
        quality_standards: ['security-standard', 'compliance-standard'],
        mandatory: true
      });
    }

    if (lowerPoint.includes('performance') || lowerPoint.includes('性能')) {
      requirements.push({
        requirement_id: uuidv4(),
        name: 'Performance Report',
        description: 'Performance testing results and analysis',
        file_type_restrictions: ['.json', '.xml', '.html', '.pdf'],
        size_limits: { max_size: 15 * 1024 * 1024 },
        format_requirements: ['Benchmark format', 'Metrics visualization'],
        content_requirements: ['Performance metrics', 'Baseline comparison', 'Optimization recommendations'],
        quality_standards: ['performance-standard'],
        mandatory: false
      });
    }

    return requirements;
  }

  /**
   * Generate quality requirements for a todo item
   */
  private generateQualityRequirements(keyPoint: string, category: TodoItem['category']): QualityRequirement[] {
    const requirements: QualityRequirement[] = [];
    const lowerPoint = keyPoint.toLowerCase();

    // Base quality requirements for all categories
    requirements.push({
      requirement_id: uuidv4(),
      description: 'Completeness - All required elements are present and complete',
      category: 'completeness',
      priority: 'high',
      acceptance_criteria: [
        'All deliverable requirements are met',
        'No missing components or sections',
        'All dependencies are satisfied'
      ],
      measurement_method: 'automated_checklist',
      target_value: 100,
      threshold_value: 90
    });

    requirements.push({
      requirement_id: uuidv4(),
      description: 'Quality - Meets professional standards and best practices',
      category: 'quality',
      priority: 'high',
      acceptance_criteria: [
        'Follows established standards and guidelines',
        'No critical quality issues',
        'Peer review approved'
      ],
      measurement_method: 'quality_assessment',
      target_value: 85,
      threshold_value: 70
    });

    // Category-specific quality requirements
    switch (category) {
      case 'development':
        requirements.push({
          requirement_id: uuidv4(),
          description: 'Code Quality - Clean, maintainable, and well-documented code',
          category: 'code_quality',
          priority: 'critical',
          acceptance_criteria: [
            'Code coverage >= 80%',
            'No critical security vulnerabilities',
            'Follows coding standards',
            'Proper error handling'
          ],
          measurement_method: 'static_analysis',
          target_value: 90,
          threshold_value: 75
        });

        requirements.push({
          requirement_id: uuidv4(),
          description: 'Performance - Code meets performance requirements',
          category: 'performance',
          priority: 'medium',
          acceptance_criteria: [
            'Response time within acceptable limits',
            'Memory usage optimized',
            'No performance regressions'
          ],
          measurement_method: 'performance_testing',
          target_value: 95,
          threshold_value: 80
        });
        break;

      case 'documentation':
        requirements.push({
          requirement_id: uuidv4(),
          description: 'Documentation Quality - Clear, accurate, and comprehensive',
          category: 'documentation_quality',
          priority: 'high',
          acceptance_criteria: [
            'Clear and concise writing',
            'Accurate technical information',
            'Proper formatting and structure',
            'Up-to-date content'
          ],
          measurement_method: 'manual_review',
          target_value: 90,
          threshold_value: 75
        });
        break;

      case 'testing':
        requirements.push({
          requirement_id: uuidv4(),
          description: 'Test Coverage - Comprehensive test coverage and validation',
          category: 'test_coverage',
          priority: 'critical',
          acceptance_criteria: [
            'Test coverage >= 85%',
            'All critical paths tested',
            'Edge cases covered',
            'Integration tests included'
          ],
          measurement_method: 'coverage_analysis',
          target_value: 90,
          threshold_value: 85
        });
        break;
    }

    // Add security requirements if security-related
    if (lowerPoint.includes('security') || lowerPoint.includes('安全')) {
      requirements.push({
        requirement_id: uuidv4(),
        description: 'Security Compliance - Meets security standards and requirements',
        category: 'security',
        priority: 'critical',
        acceptance_criteria: [
          'No high-severity security vulnerabilities',
          'Security best practices followed',
          'Compliance requirements met',
          'Security review approved'
        ],
        measurement_method: 'security_scan',
        target_value: 100,
        threshold_value: 95
      });
    }

    return requirements;
  }

  private identifyExternalSystems(taskContent: WorkTaskContent): string[] {
    const systems: string[] = [];
    const content = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();

    const externalSystemKeywords = [
      'third-party', 'external api', 'integration', 'webhook', 'oauth',
      '第三方', '外部接口', '集成', '对接'
    ];

    for (const keyword of externalSystemKeywords) {
      if (content.includes(keyword)) {
        systems.push(`外部系统 (${keyword})`);
      }
    }

    return systems;
  }

  private hasDependencyRelation(currentTodo: TodoItem, previousTodo: TodoItem): boolean {
    // 简单的依赖关系判断逻辑
    const dependencyCategories = ['research', 'development', 'testing', 'review', 'approval'];
    const currentIndex = dependencyCategories.indexOf(currentTodo.category);
    const previousIndex = dependencyCategories.indexOf(previousTodo.category);
    
    return currentIndex > previousIndex;
  }

  private needsSecurityReview(taskContent: WorkTaskContent): boolean {
    const content = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();
    const securityKeywords = ['security', 'auth', 'permission', 'encryption', '安全', '认证', '权限', '加密'];
    
    return securityKeywords.some(keyword => content.includes(keyword));
  }

  private involvesPersonalData(taskContent: WorkTaskContent): boolean {
    const content = `${taskContent.title} ${taskContent.description} ${taskContent.content}`.toLowerCase();
    const dataKeywords = ['personal data', 'user info', 'privacy', 'gdpr', '个人信息', '用户数据', '隐私'];
    
    return dataKeywords.some(keyword => content.includes(keyword));
  }

  private calculateOverallComplianceScore(complianceChecks: ComplianceCheck[]): number {
    if (complianceChecks.length === 0) return 1.0;

    const compliantCount = complianceChecks.filter(check => 
      check.status === 'compliant' || check.status === 'not_applicable'
    ).length;

    return compliantCount / complianceChecks.length;
  }
}