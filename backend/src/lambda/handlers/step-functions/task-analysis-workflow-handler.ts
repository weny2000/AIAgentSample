/**
 * Lambda handler for task analysis workflow steps
 * Handles individual steps in the task analysis Step Functions workflow
 */

import { Handler } from 'aws-lambda';
import { WorkTaskAnalysisService } from '../../../services/work-task-analysis-service';
import { KendraSearchService } from '../../../services/kendra-search-service';
import { RulesEngineService } from '../../../rules-engine/rules-engine-service';
import { Logger } from '../../utils/logger';
import { AuditLogRepository } from '../../../repositories/audit-log-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const logger = new Logger({ correlationId: 'task-analysis-workflow', operation: 'TaskAnalysisWorkflow' });

export interface TaskAnalysisWorkflowInput {
  taskId: string;
  taskContent: {
    id: string;
    title: string;
    description: string;
    content: string;
    submittedBy: string;
    teamId: string;
    submittedAt: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    category?: string;
    tags?: string[];
  };
  step: 'extract_key_points' | 'search_knowledge' | 'identify_workgroups' | 'generate_todos' | 'assess_risks' | 'compile_results';
  context?: any;
}

export interface TaskAnalysisWorkflowOutput {
  taskId: string;
  step: string;
  status: 'success' | 'failed';
  result?: any;
  error?: string;
  executionTime: number;
}

/**
 * Main handler for task analysis workflow steps
 */
export const handler: Handler<TaskAnalysisWorkflowInput, TaskAnalysisWorkflowOutput> = async (event) => {
  const startTime = Date.now();
  
  logger.info('Task analysis workflow step started', {
    taskId: event.taskId,
    step: event.step
  });

  try {
    // Initialize services
    const kendraService = new KendraSearchService(
      process.env.KENDRA_INDEX_ID!,
      logger
    );
    const rulesEngine = RulesEngineService.getInstance();
    const auditRepository = new AuditLogRepository(dynamoClient, logger);
    const analysisService = new WorkTaskAnalysisService(
      kendraService,
      rulesEngine,
      auditRepository,
      logger
    );

    let result: any;

    // Execute the appropriate step
    switch (event.step) {
      case 'extract_key_points':
        result = await extractKeyPoints(analysisService, event);
        break;
      
      case 'search_knowledge':
        result = await searchKnowledge(kendraService, event);
        break;
      
      case 'identify_workgroups':
        result = await identifyWorkgroups(analysisService, event);
        break;
      
      case 'generate_todos':
        result = await generateTodos(analysisService, event);
        break;
      
      case 'assess_risks':
        result = await assessRisks(analysisService, event);
        break;
      
      case 'compile_results':
        result = await compileResults(event);
        break;
      
      default:
        throw new Error(`Unknown workflow step: ${event.step}`);
    }

    const executionTime = Date.now() - startTime;

    logger.info('Task analysis workflow step completed', {
      taskId: event.taskId,
      step: event.step,
      executionTime
    });

    return {
      taskId: event.taskId,
      step: event.step,
      status: 'success',
      result,
      executionTime
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error('Task analysis workflow step failed', error as Error, {
      taskId: event.taskId,
      step: event.step
    });

    return {
      taskId: event.taskId,
      step: event.step,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime
    };
  }
};

async function extractKeyPoints(service: WorkTaskAnalysisService, event: TaskAnalysisWorkflowInput) {
  const taskContent = {
    ...event.taskContent,
    submittedAt: new Date(event.taskContent.submittedAt)
  };
  
  // Use the private method through the public analyzeWorkTask method
  const analysis = await service.analyzeWorkTask(taskContent);
  
  return {
    keyPoints: analysis.keyPoints
  };
}

async function searchKnowledge(service: KendraSearchService, event: TaskAnalysisWorkflowInput) {
  const searchQueries = [
    event.taskContent.title,
    event.taskContent.description,
    ...(event.taskContent.tags || [])
  ].filter(q => q && q.trim().length > 3);

  const allReferences = [];

  for (const query of searchQueries) {
    const results = await service.search({
      query: query.trim(),
      teamId: event.taskContent.teamId,
      limit: 5
    });

    allReferences.push(...results.results.map(result => ({
      sourceId: result.id,
      sourceType: result.type,
      title: result.title || 'Untitled',
      snippet: result.excerpt,
      relevanceScore: result.confidence,
      url: result.uri,
      lastUpdated: result.lastModified ? new Date(result.lastModified) : undefined
    })));
  }

  return {
    knowledgeReferences: allReferences.slice(0, 15)
  };
}

async function identifyWorkgroups(service: WorkTaskAnalysisService, event: TaskAnalysisWorkflowInput) {
  const taskContent = {
    ...event.taskContent,
    submittedAt: new Date(event.taskContent.submittedAt)
  };
  
  const analysis = await service.analyzeWorkTask(taskContent);
  
  return {
    relatedWorkgroups: analysis.relatedWorkgroups
  };
}

async function generateTodos(service: WorkTaskAnalysisService, event: TaskAnalysisWorkflowInput) {
  const taskContent = {
    ...event.taskContent,
    submittedAt: new Date(event.taskContent.submittedAt)
  };
  
  const analysis = await service.analyzeWorkTask(taskContent);
  
  return {
    todoList: analysis.todoList
  };
}

async function assessRisks(service: WorkTaskAnalysisService, event: TaskAnalysisWorkflowInput) {
  const taskContent = {
    ...event.taskContent,
    submittedAt: new Date(event.taskContent.submittedAt)
  };
  
  const analysis = await service.analyzeWorkTask(taskContent);
  
  return {
    riskAssessment: analysis.riskAssessment,
    estimatedEffort: analysis.estimatedEffort,
    dependencies: analysis.dependencies,
    complianceChecks: analysis.complianceChecks
  };
}

async function compileResults(event: TaskAnalysisWorkflowInput) {
  // Compile all results from context
  const context = event.context || {};
  
  return {
    taskId: event.taskId,
    keyPoints: context.keyPoints || [],
    knowledgeReferences: context.knowledgeReferences || [],
    relatedWorkgroups: context.relatedWorkgroups || [],
    todoList: context.todoList || [],
    riskAssessment: context.riskAssessment || {},
    estimatedEffort: context.estimatedEffort || {},
    dependencies: context.dependencies || [],
    complianceChecks: context.complianceChecks || [],
    recommendations: context.recommendations || [],
    compiledAt: new Date().toISOString()
  };
}
