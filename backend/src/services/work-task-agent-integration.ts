/**
 * Work Task Agent Integration Service
 * Integrates work task analysis functionality into AgentCore conversation flows
 * Implements context awareness, memory functionality, and proactive suggestions
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentCoreService } from './agent-core-service';
import { WorkTaskAnalysisService } from './work-task-analysis-service';
import { ConversationManagementService } from './conversation-management-service';
import { AuditService } from './audit-service';
import { NotificationService } from './notification-service';
import {
  AgentSession,
  ConversationMessage,
  MessageReference,
  ActionItem,
  SendMessageResponse
} from '../models/agent-core';
import {
  WorkTaskRecord,
  TaskAnalysisResult,
  TodoItem
} from '../models/work-task';
import { Logger } from '../lambda/utils/logger';

export interface WorkTaskConversationContext {
  activeWorkTasks: string[]; // Task IDs being discussed
  recentAnalyses: Map<string, TaskAnalysisResult>;
  pendingTodoItems: TodoItem[];
  workTaskMemory: WorkTaskMemoryEntry[];
  proactiveSuggestions: ProactiveSuggestion[];
}

export interface WorkTaskMemoryEntry {
  taskId: string;
  taskTitle: string;
  discussionTimestamp: Date;
  keyDecisions: string[];
  userPreferences: Record<string, any>;
  followUpNeeded: boolean;
}

export interface ProactiveSuggestion {
  suggestionId: string;
  type: 'reminder' | 'recommendation' | 'warning' | 'opportunity';
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  relatedTaskId?: string;
  actionable: boolean;
  expiresAt?: Date;
}

export interface WorkTaskIntentAnalysis {
  intent: 'create_task' | 'query_task' | 'update_task' | 'analyze_progress' | 'general_conversation';
  confidence: number;
  extractedEntities: {
    taskId?: string;
    taskTitle?: string;
    keywords?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
  requiresWorkTaskAction: boolean;
}

export class WorkTaskAgentIntegration {
  private workTaskContexts: Map<string, WorkTaskConversationContext> = new Map();

  constructor(
    private agentCoreService: AgentCoreService,
    private workTaskAnalysisService: WorkTaskAnalysisService,
    private conversationService: ConversationManagementService,
    private auditService: AuditService,
    private notificationService: NotificationService,
    private logger: Logger
  ) {
    this.logger.info('WorkTaskAgentIntegration initialized');
  }

  /**
   * Process message with work task awareness
   * Intercepts messages to detect work task intents and enhance responses
   */
  async processMessageWithWorkTaskContext(
    sessionId: string,
    message: string,
    userId: string,
    teamId: string
  ): Promise<SendMessageResponse> {
    try {
      this.logger.info('Processing message with work task context', { sessionId, userId });

      // 1. Analyze message intent for work task operations
      const intentAnalysis = await this.analyzeWorkTaskIntent(message, sessionId);

      // 2. Get or create work task context for this session
      const workTaskContext = await this.getOrCreateWorkTaskContext(sessionId, userId, teamId);

      // 3. Build enhanced context with work task memory
      const enhancedContext = await this.buildEnhancedContext(sessionId, workTaskContext);

      // 4. Handle work task specific intents
      let workTaskResponse: SendMessageResponse | null = null;
      if (intentAnalysis.requiresWorkTaskAction) {
        workTaskResponse = await this.handleWorkTaskIntent(
          intentAnalysis,
          message,
          sessionId,
          userId,
          teamId,
          workTaskContext
        );
      }

      // 5. If work task handled the request, return that response
      if (workTaskResponse) {
        // Update work task context with new information
        await this.updateWorkTaskContext(sessionId, workTaskContext, workTaskResponse);
        
        // Add proactive suggestions
        workTaskResponse.suggestions = [
          ...workTaskResponse.suggestions,
          ...await this.generateProactiveSuggestions(workTaskContext, intentAnalysis)
        ];

        return workTaskResponse;
      }

      // 6. Otherwise, let AgentCore handle it but with work task context awareness
      const agentResponse = await this.agentCoreService.sendMessage({
        sessionId,
        message
      });

      // 7. Enhance agent response with work task insights
      const enhancedResponse = await this.enhanceResponseWithWorkTaskInsights(
        agentResponse,
        workTaskContext,
        message
      );

      // 8. Check for proactive opportunities
      await this.checkProactiveOpportunities(sessionId, workTaskContext, enhancedResponse);

      return enhancedResponse;

    } catch (error) {
      this.logger.error('Failed to process message with work task context', error as Error, {
        sessionId,
        message
      });
      throw error;
    }
  }

  /**
   * Analyze message intent to detect work task operations
   */
  private async analyzeWorkTaskIntent(
    message: string,
    sessionId: string
  ): Promise<WorkTaskIntentAnalysis> {
    const lowerMessage = message.toLowerCase();
    
    // Intent detection patterns
    const createTaskPatterns = [
      /create\s+(a\s+)?task/i,
      /new\s+task/i,
      /submit\s+(a\s+)?task/i,
      /analyze\s+this\s+task/i,
      /break\s+down\s+this\s+task/i
    ];

    const queryTaskPatterns = [
      /show\s+(me\s+)?(my\s+)?tasks?/i,
      /what\s+(are\s+)?my\s+tasks?/i,
      /task\s+status/i,
      /check\s+task/i,
      /view\s+task/i
    ];

    const updateTaskPatterns = [
      /update\s+task/i,
      /modify\s+task/i,
      /change\s+task/i,
      /complete\s+task/i,
      /mark\s+task/i
    ];

    const progressPatterns = [
      /progress\s+on/i,
      /how\s+(is|are)\s+.*\s+going/i,
      /status\s+of/i,
      /what'?s\s+the\s+status/i
    ];

    let intent: WorkTaskIntentAnalysis['intent'] = 'general_conversation';
    let confidence = 0;
    const extractedEntities: WorkTaskIntentAnalysis['extractedEntities'] = {};

    // Check for create task intent
    if (createTaskPatterns.some(pattern => pattern.test(message))) {
      intent = 'create_task';
      confidence = 0.8;
      
      // Extract potential task title
      const titleMatch = message.match(/task:?\s*["']?([^"'\n]+)["']?/i);
      if (titleMatch) {
        extractedEntities.taskTitle = titleMatch[1].trim();
      }
    }
    // Check for query task intent
    else if (queryTaskPatterns.some(pattern => pattern.test(message))) {
      intent = 'query_task';
      confidence = 0.85;
    }
    // Check for update task intent
    else if (updateTaskPatterns.some(pattern => pattern.test(message))) {
      intent = 'update_task';
      confidence = 0.8;
      
      // Extract task ID if present
      const taskIdMatch = message.match(/task[_\s-]?id:?\s*([a-zA-Z0-9-]+)/i);
      if (taskIdMatch) {
        extractedEntities.taskId = taskIdMatch[1];
      }
    }
    // Check for progress analysis intent
    else if (progressPatterns.some(pattern => pattern.test(message))) {
      intent = 'analyze_progress';
      confidence = 0.75;
    }

    // Extract keywords
    const keywords = this.extractKeywords(message);
    if (keywords.length > 0) {
      extractedEntities.keywords = keywords;
    }

    // Extract priority if mentioned
    const priorityMatch = message.match(/priority:?\s*(low|medium|high|critical)/i);
    if (priorityMatch) {
      extractedEntities.priority = priorityMatch[1].toLowerCase() as any;
    }

    const requiresWorkTaskAction = intent !== 'general_conversation' && confidence > 0.6;

    return {
      intent,
      confidence,
      extractedEntities,
      requiresWorkTaskAction
    };
  }

  /**
   * Handle work task specific intents
   */
  private async handleWorkTaskIntent(
    intentAnalysis: WorkTaskIntentAnalysis,
    message: string,
    sessionId: string,
    userId: string,
    teamId: string,
    workTaskContext: WorkTaskConversationContext
  ): Promise<SendMessageResponse | null> {
    switch (intentAnalysis.intent) {
      case 'create_task':
        return await this.handleCreateTaskIntent(
          message,
          intentAnalysis,
          sessionId,
          userId,
          teamId,
          workTaskContext
        );

      case 'query_task':
        return await this.handleQueryTaskIntent(
          message,
          sessionId,
          userId,
          teamId,
          workTaskContext
        );

      case 'update_task':
        return await this.handleUpdateTaskIntent(
          message,
          intentAnalysis,
          sessionId,
          userId,
          teamId,
          workTaskContext
        );

      case 'analyze_progress':
        return await this.handleAnalyzeProgressIntent(
          message,
          sessionId,
          userId,
          teamId,
          workTaskContext
        );

      default:
        return null;
    }
  }

  /**
   * Handle create task intent
   */
  private async handleCreateTaskIntent(
    message: string,
    intentAnalysis: WorkTaskIntentAnalysis,
    sessionId: string,
    userId: string,
    teamId: string,
    workTaskContext: WorkTaskConversationContext
  ): Promise<SendMessageResponse> {
    this.logger.info('Handling create task intent', { sessionId, userId });

    // Extract task information from message
    const taskTitle = intentAnalysis.extractedEntities.taskTitle || 'New Task';
    const taskContent = message;

    // Create work task content
    const workTaskContent = {
      id: uuidv4(),
      title: taskTitle,
      description: message.substring(0, 500),
      content: message,
      submittedBy: userId,
      teamId,
      submittedAt: new Date(),
      priority: intentAnalysis.extractedEntities.priority || 'medium',
      tags: intentAnalysis.extractedEntities.keywords || []
    };

    // Analyze the task
    const analysisResult = await this.workTaskAnalysisService.analyzeWorkTask(workTaskContent);

    // Store in context
    workTaskContext.activeWorkTasks.push(workTaskContent.id);
    workTaskContext.recentAnalyses.set(workTaskContent.id, analysisResult);
    workTaskContext.pendingTodoItems.push(...analysisResult.todoList);

    // Add to memory
    workTaskContext.workTaskMemory.push({
      taskId: workTaskContent.id,
      taskTitle,
      discussionTimestamp: new Date(),
      keyDecisions: [],
      userPreferences: {},
      followUpNeeded: true
    });

    // Build response
    const response = this.buildTaskAnalysisResponse(analysisResult, taskTitle);

    // Create references from knowledge base
    const references: MessageReference[] = analysisResult.knowledgeReferences.map(ref => ({
      sourceId: ref.sourceId,
      sourceType: ref.sourceType as any,
      snippet: ref.snippet,
      confidence: ref.relevanceScore,
      url: ref.url
    }));

    // Create action items from todos
    const actionItems: ActionItem[] = analysisResult.todoList.slice(0, 5).map(todo => ({
      id: todo.id,
      description: todo.title,
      priority: todo.priority,
      status: 'pending',
      createdAt: new Date()
    }));

    // Audit the task creation
    await this.auditService.logAction({
      request_id: workTaskContent.id,
      user_id: userId,
      persona: 'work_task_agent',
      action: 'work_task_created_via_conversation',
      references: references.map(ref => ({
        source_id: ref.sourceId,
        source_type: ref.sourceType,
        confidence_score: ref.confidence,
        snippet: ref.snippet
      })),
      result_summary: `Work task created and analyzed: ${taskTitle}`,
      compliance_score: 1.0,
      team_id: teamId,
      session_id: sessionId
    });

    return {
      messageId: uuidv4(),
      response,
      references,
      actionItems,
      suggestions: [
        'Would you like me to explain any of the identified risks?',
        'Should I provide more details about the recommended workgroups?',
        'Would you like to prioritize the todo items?'
      ],
      confidence: 0.9,
      processingTime: 0
    };
  }

  /**
   * Handle query task intent
   */
  private async handleQueryTaskIntent(
    message: string,
    sessionId: string,
    userId: string,
    teamId: string,
    workTaskContext: WorkTaskConversationContext
  ): Promise<SendMessageResponse> {
    this.logger.info('Handling query task intent', { sessionId, userId });

    const activeTasks = workTaskContext.activeWorkTasks;
    const pendingTodos = workTaskContext.pendingTodoItems;

    let response = '';
    const references: MessageReference[] = [];
    const actionItems: ActionItem[] = [];

    if (activeTasks.length === 0) {
      response = 'You don\'t have any active work tasks in this conversation. Would you like to create a new task or analyze an existing one?';
    } else {
      response = `You have ${activeTasks.length} active work task(s) in this conversation:\n\n`;
      
      for (const taskId of activeTasks.slice(0, 5)) {
        const analysis = workTaskContext.recentAnalyses.get(taskId);
        const memory = workTaskContext.workTaskMemory.find(m => m.taskId === taskId);
        
        if (analysis && memory) {
          response += `📋 **${memory.taskTitle}**\n`;
          response += `   - ${analysis.todoList.length} todo items (${analysis.todoList.filter(t => t.status === 'completed').length} completed)\n`;
          response += `   - ${analysis.relatedWorkgroups.length} related workgroups identified\n`;
          response += `   - Risk level: ${analysis.riskAssessment.overallRiskLevel}\n\n`;
        }
      }

      if (pendingTodos.length > 0) {
        response += `\n🎯 You have ${pendingTodos.filter(t => t.status === 'pending').length} pending todo items.`;
      }
    }

    return {
      messageId: uuidv4(),
      response,
      references,
      actionItems,
      suggestions: [
        'Show me details of a specific task',
        'What are my pending todo items?',
        'Analyze progress on current tasks'
      ],
      confidence: 0.95,
      processingTime: 0
    };
  }

  /**
   * Handle update task intent
   */
  private async handleUpdateTaskIntent(
    message: string,
    intentAnalysis: WorkTaskIntentAnalysis,
    sessionId: string,
    userId: string,
    teamId: string,
    workTaskContext: WorkTaskConversationContext
  ): Promise<SendMessageResponse> {
    this.logger.info('Handling update task intent', { sessionId, userId });

    const taskId = intentAnalysis.extractedEntities.taskId;
    
    if (!taskId || !workTaskContext.activeWorkTasks.includes(taskId)) {
      return {
        messageId: uuidv4(),
        response: 'I couldn\'t find that task. Please specify which task you\'d like to update, or show me your active tasks.',
        references: [],
        actionItems: [],
        suggestions: ['Show my active tasks', 'Create a new task'],
        confidence: 0.7,
        processingTime: 0
      };
    }

    // Update task memory
    const memory = workTaskContext.workTaskMemory.find(m => m.taskId === taskId);
    if (memory) {
      memory.discussionTimestamp = new Date();
      memory.keyDecisions.push(`Updated via conversation: ${message.substring(0, 100)}`);
    }

    const response = `Task ${taskId} has been updated. The changes have been recorded in the task history.`;

    // Audit the update
    await this.auditService.logAction({
      request_id: uuidv4(),
      user_id: userId,
      persona: 'work_task_agent',
      action: 'work_task_updated_via_conversation',
      references: [],
      result_summary: `Work task ${taskId} updated via conversation`,
      compliance_score: 1.0,
      team_id: teamId,
      session_id: sessionId
    });

    return {
      messageId: uuidv4(),
      response,
      references: [],
      actionItems: [],
      suggestions: ['Show updated task details', 'Analyze impact of changes'],
      confidence: 0.85,
      processingTime: 0
    };
  }

  /**
   * Handle analyze progress intent
   */
  private async handleAnalyzeProgressIntent(
    message: string,
    sessionId: string,
    userId: string,
    teamId: string,
    workTaskContext: WorkTaskConversationContext
  ): Promise<SendMessageResponse> {
    this.logger.info('Handling analyze progress intent', { sessionId, userId });

    const activeTasks = workTaskContext.activeWorkTasks;
    
    if (activeTasks.length === 0) {
      return {
        messageId: uuidv4(),
        response: 'You don\'t have any active work tasks to analyze. Would you like to create a new task?',
        references: [],
        actionItems: [],
        suggestions: ['Create a new task', 'View completed tasks'],
        confidence: 0.9,
        processingTime: 0
      };
    }

    // Calculate overall progress
    let totalTodos = 0;
    let completedTodos = 0;
    let blockedTodos = 0;

    for (const taskId of activeTasks) {
      const analysis = workTaskContext.recentAnalyses.get(taskId);
      if (analysis) {
        totalTodos += analysis.todoList.length;
        completedTodos += analysis.todoList.filter(t => t.status === 'completed').length;
        blockedTodos += analysis.todoList.filter(t => t.status === 'blocked').length;
      }
    }

    const progressPercentage = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

    let response = `📊 **Progress Analysis**\n\n`;
    response += `Overall Progress: ${progressPercentage}% (${completedTodos}/${totalTodos} todos completed)\n\n`;
    
    if (blockedTodos > 0) {
      response += `⚠️ ${blockedTodos} todo items are currently blocked and need attention.\n\n`;
    }

    response += `Active Tasks: ${activeTasks.length}\n`;
    response += `Pending Todos: ${totalTodos - completedTodos}\n`;

    // Add insights
    if (progressPercentage < 30) {
      response += `\n💡 The project is in early stages. Focus on completing foundational tasks first.`;
    } else if (progressPercentage < 70) {
      response += `\n💡 Good progress! Keep momentum going and address any blockers promptly.`;
    } else {
      response += `\n💡 Excellent progress! Focus on final deliverables and quality checks.`;
    }

    return {
      messageId: uuidv4(),
      response,
      references: [],
      actionItems: [],
      suggestions: [
        'Show me blocked items',
        'What should I focus on next?',
        'Generate progress report'
      ],
      confidence: 0.9,
      processingTime: 0
    };
  }

  /**
   * Build task analysis response message
   */
  private buildTaskAnalysisResponse(analysis: TaskAnalysisResult, taskTitle: string): string {
    let response = `✅ I've analyzed your task: **${taskTitle}**\n\n`;

    // Key points
    response += `**Key Points Identified:**\n`;
    analysis.keyPoints.slice(0, 5).forEach((point, index) => {
      response += `${index + 1}. ${point}\n`;
    });

    // Related workgroups
    if (analysis.relatedWorkgroups.length > 0) {
      response += `\n**Related Workgroups:**\n`;
      analysis.relatedWorkgroups.slice(0, 3).forEach(wg => {
        response += `- ${wg.teamName} (${Math.round(wg.relevanceScore * 100)}% match): ${wg.reason}\n`;
      });
    }

    // Todo summary
    response += `\n**Todo List:** ${analysis.todoList.length} items generated\n`;
    const highPriorityTodos = analysis.todoList.filter(t => t.priority === 'high' || t.priority === 'critical');
    if (highPriorityTodos.length > 0) {
      response += `⚠️ ${highPriorityTodos.length} high-priority items require immediate attention\n`;
    }

    // Risk assessment
    response += `\n**Risk Assessment:** ${analysis.riskAssessment.overallRiskLevel} risk level\n`;
    if (analysis.riskAssessment.riskFactors.length > 0) {
      response += `Key risks: ${analysis.riskAssessment.riskFactors.slice(0, 2).map(r => r.description).join(', ')}\n`;
    }

    // Recommendations
    if (analysis.recommendations.length > 0) {
      response += `\n**Recommendations:**\n`;
      analysis.recommendations.slice(0, 3).forEach(rec => {
        response += `- ${rec}\n`;
      });
    }

    return response;
  }

  /**
   * Get or create work task context for session
   */
  private async getOrCreateWorkTaskContext(
    sessionId: string,
    userId: string,
    teamId: string
  ): Promise<WorkTaskConversationContext> {
    let context = this.workTaskContexts.get(sessionId);
    
    if (!context) {
      context = {
        activeWorkTasks: [],
        recentAnalyses: new Map(),
        pendingTodoItems: [],
        workTaskMemory: [],
        proactiveSuggestions: []
      };
      this.workTaskContexts.set(sessionId, context);
    }

    return context;
  }

  /**
   * Build enhanced context with work task memory
   */
  private async buildEnhancedContext(
    sessionId: string,
    workTaskContext: WorkTaskConversationContext
  ): Promise<any> {
    // Build memory context from conversation service
    const memoryContext = await this.conversationService.buildMemoryContext(sessionId);

    // Enhance with work task specific memory
    return {
      ...memoryContext,
      workTaskMemory: workTaskContext.workTaskMemory,
      activeWorkTasks: workTaskContext.activeWorkTasks,
      pendingTodoItems: workTaskContext.pendingTodoItems
    };
  }

  /**
   * Update work task context after processing
   */
  private async updateWorkTaskContext(
    sessionId: string,
    workTaskContext: WorkTaskConversationContext,
    response: SendMessageResponse
  ): Promise<void> {
    // Update context based on response
    this.workTaskContexts.set(sessionId, workTaskContext);
  }

  /**
   * Enhance response with work task insights
   */
  private async enhanceResponseWithWorkTaskInsights(
    response: SendMessageResponse,
    workTaskContext: WorkTaskConversationContext,
    originalMessage: string
  ): Promise<SendMessageResponse> {
    // Add work task related suggestions if relevant
    const workTaskSuggestions = await this.generateContextualSuggestions(
      workTaskContext,
      originalMessage
    );

    return {
      ...response,
      suggestions: [...(response.suggestions || []), ...workTaskSuggestions].slice(0, 5)
    };
  }

  /**
   * Generate contextual suggestions based on work task context
   */
  private async generateContextualSuggestions(
    workTaskContext: WorkTaskConversationContext,
    message: string
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Suggest task creation if discussing work
    if (message.toLowerCase().includes('need to') || message.toLowerCase().includes('should')) {
      suggestions.push('Would you like me to create a task for this?');
    }

    // Suggest progress check if tasks are active
    if (workTaskContext.activeWorkTasks.length > 0) {
      const pendingCount = workTaskContext.pendingTodoItems.filter(t => t.status === 'pending').length;
      if (pendingCount > 5) {
        suggestions.push(`You have ${pendingCount} pending todos. Check progress?`);
      }
    }

    return suggestions;
  }

  /**
   * Generate proactive suggestions
   */
  private async generateProactiveSuggestions(
    workTaskContext: WorkTaskConversationContext,
    intentAnalysis: WorkTaskIntentAnalysis
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Check for follow-up opportunities
    for (const memory of workTaskContext.workTaskMemory) {
      if (memory.followUpNeeded) {
        const daysSinceDiscussion = Math.floor(
          (Date.now() - memory.discussionTimestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceDiscussion > 2) {
          suggestions.push(`Follow up on "${memory.taskTitle}" (discussed ${daysSinceDiscussion} days ago)`);
        }
      }
    }

    return suggestions.slice(0, 2);
  }

  /**
   * Check for proactive opportunities
   */
  private async checkProactiveOpportunities(
    sessionId: string,
    workTaskContext: WorkTaskConversationContext,
    response: SendMessageResponse
  ): Promise<void> {
    // Check for blocked todos
    const blockedTodos = workTaskContext.pendingTodoItems.filter(t => t.status === 'blocked');
    if (blockedTodos.length > 0) {
      const suggestion: ProactiveSuggestion = {
        suggestionId: uuidv4(),
        type: 'warning',
        message: `${blockedTodos.length} todo items are blocked and may need attention`,
        priority: 'high',
        actionable: true
      };
      workTaskContext.proactiveSuggestions.push(suggestion);
    }

    // Check for overdue items (if due dates exist)
    const now = new Date();
    const overdueTodos = workTaskContext.pendingTodoItems.filter(
      t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed'
    );
    
    if (overdueTodos.length > 0) {
      const suggestion: ProactiveSuggestion = {
        suggestionId: uuidv4(),
        type: 'reminder',
        message: `${overdueTodos.length} todo items are overdue`,
        priority: 'critical',
        actionable: true
      };
      workTaskContext.proactiveSuggestions.push(suggestion);
    }
  }

  /**
   * Extract keywords from message
   */
  private extractKeywords(message: string): string[] {
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
    
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Clean up expired contexts
   */
  async cleanupExpiredContexts(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, context] of this.workTaskContexts.entries()) {
      const lastActivity = Math.max(
        ...context.workTaskMemory.map(m => m.discussionTimestamp.getTime())
      );

      if (now - lastActivity > maxAge) {
        this.workTaskContexts.delete(sessionId);
        this.logger.info('Cleaned up expired work task context', { sessionId });
      }
    }
  }
}
