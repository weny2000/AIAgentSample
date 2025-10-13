/**
 * 工作任务分析API处理器
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { WorkTaskAnalysisService, WorkTaskContent, TaskAnalysisResult } from '../../services/work-task-analysis-service';
import { KendraSearchService } from '../../services/kendra-search-service';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { Logger } from '../utils/logger';
import { validateRequest, extractUserInfo } from '../utils/auth';
import { corsHeaders } from '../utils/cors';

const logger = new Logger();
const auditRepository = new AuditLogRepository();
const kendraService = new KendraSearchService();
const rulesEngine = new RulesEngineService();
const workTaskService = new WorkTaskAnalysisService(
  kendraService,
  rulesEngine,
  auditRepository,
  logger
);

/**
 * 提交工作任务进行分析
 */
export const submitWorkTask = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('收到工作任务提交请求', { 
      path: event.path,
      method: event.httpMethod 
    });

    // 验证请求
    const authResult = await validateRequest(event);
    if (!authResult.isValid) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: authResult.error 
        })
      };
    }

    const userInfo = extractUserInfo(event);
    if (!userInfo) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Unable to extract user information' 
        })
      };
    }

    // 解析请求体
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Bad Request',
          message: 'Request body is required' 
        })
      };
    }

    const requestBody = JSON.parse(event.body);
    
    // 验证必需字段
    const requiredFields = ['title', 'description', 'content'];
    const missingFields = requiredFields.filter(field => !requestBody[field]);
    
    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Bad Request',
          message: `Missing required fields: ${missingFields.join(', ')}` 
        })
      };
    }

    // 构建工作任务内容
    const taskContent: WorkTaskContent = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: requestBody.title,
      description: requestBody.description,
      content: requestBody.content,
      submittedBy: userInfo.userId,
      teamId: userInfo.teamId,
      submittedAt: new Date(),
      priority: requestBody.priority || 'medium',
      category: requestBody.category,
      tags: requestBody.tags || []
    };

    logger.info('开始分析工作任务', { 
      taskId: taskContent.id,
      title: taskContent.title,
      submittedBy: taskContent.submittedBy 
    });

    // 执行任务分析
    const analysisResult = await workTaskService.analyzeWorkTask(taskContent);

    logger.info('工作任务分析完成', { 
      taskId: taskContent.id,
      keyPointsCount: analysisResult.keyPoints.length,
      todoItemsCount: analysisResult.todoList.length,
      relatedWorkgroupsCount: analysisResult.relatedWorkgroups.length
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          taskContent,
          analysisResult
        }
      })
    };

  } catch (error) {
    logger.error('工作任务分析失败', error as Error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to analyze work task' 
      })
    };
  }
};

/**
 * 获取任务分析历史
 */
export const getTaskAnalysisHistory = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('收到任务分析历史查询请求');

    // 验证请求
    const authResult = await validateRequest(event);
    if (!authResult.isValid) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: authResult.error 
        })
      };
    }

    const userInfo = extractUserInfo(event);
    if (!userInfo) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Unable to extract user information' 
        })
      };
    }

    // 获取查询参数
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit || '10');
    const offset = parseInt(queryParams.offset || '0');
    const teamId = queryParams.teamId || userInfo.teamId;

    // 从审计日志中获取历史记录
    const auditLogs = await auditRepository.getAuditLogs({
      team_id: teamId,
      action: 'work_task_analyzed',
      limit,
      offset
    });

    const history = auditLogs.map(log => ({
      taskId: log.session_id,
      submittedBy: log.user_id,
      submittedAt: log.timestamp,
      summary: log.result_summary,
      complianceScore: log.compliance_score
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          history,
          totalCount: auditLogs.length,
          hasMore: auditLogs.length === limit
        }
      })
    };

  } catch (error) {
    logger.error('获取任务分析历史失败', error as Error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to get task analysis history' 
      })
    };
  }
};

/**
 * 更新TODO项状态
 */
export const updateTodoStatus = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('收到TODO状态更新请求');

    // 验证请求
    const authResult = await validateRequest(event);
    if (!authResult.isValid) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: authResult.error 
        })
      };
    }

    const userInfo = extractUserInfo(event);
    if (!userInfo) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Unable to extract user information' 
        })
      };
    }

    // 获取路径参数
    const todoId = event.pathParameters?.todoId;
    if (!todoId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Bad Request',
          message: 'Todo ID is required' 
        })
      };
    }

    // 解析请求体
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Bad Request',
          message: 'Request body is required' 
        })
      };
    }

    const requestBody = JSON.parse(event.body);
    const { status, assignedTo, dueDate } = requestBody;

    // 验证状态值
    const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
    if (status && !validStatuses.includes(status)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Bad Request',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        })
      };
    }

    // 记录状态更新（在实际实现中，这里应该更新数据库）
    await auditRepository.create({
      request_id: `todo-update-${Date.now()}`,
      user_id: userInfo.userId,
      persona: 'todo_manager',
      action: 'todo_status_updated',
      references: [],
      result_summary: `TODO ${todoId} status updated to ${status}`,
      compliance_score: 1.0,
      team_id: userInfo.teamId,
      session_id: todoId
    });

    logger.info('TODO状态更新成功', { 
      todoId, 
      status, 
      updatedBy: userInfo.userId 
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          todoId,
          status,
          assignedTo,
          dueDate,
          updatedBy: userInfo.userId,
          updatedAt: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    logger.error('TODO状态更新失败', error as Error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to update todo status' 
      })
    };
  }
};

/**
 * 获取工作组建议
 */
export const getWorkgroupSuggestions = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('收到工作组建议查询请求');

    // 验证请求
    const authResult = await validateRequest(event);
    if (!authResult.isValid) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: authResult.error 
        })
      };
    }

    const userInfo = extractUserInfo(event);
    if (!userInfo) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Unable to extract user information' 
        })
      };
    }

    // 获取查询参数
    const queryParams = event.queryStringParameters || {};
    const keywords = queryParams.keywords?.split(',') || [];
    const category = queryParams.category;

    // 基于关键词和类别提供工作组建议
    const workgroupSuggestions = [
      {
        teamId: 'security-team',
        teamName: '安全团队',
        expertise: ['安全审计', '漏洞评估', '合规检查'],
        contactInfo: 'security@company.com',
        relevantKeywords: ['security', 'auth', 'encryption', '安全', '认证', '加密']
      },
      {
        teamId: 'data-team',
        teamName: '数据团队',
        expertise: ['数据库设计', '数据迁移', '性能优化'],
        contactInfo: 'data@company.com',
        relevantKeywords: ['database', 'data', 'migration', '数据库', '数据', '迁移']
      },
      {
        teamId: 'frontend-team',
        teamName: '前端团队',
        expertise: ['用户界面', '用户体验', '前端开发'],
        contactInfo: 'frontend@company.com',
        relevantKeywords: ['ui', 'ux', 'frontend', 'react', '前端', '界面', '用户体验']
      },
      {
        teamId: 'backend-team',
        teamName: '后端团队',
        expertise: ['API开发', '服务架构', '系统集成'],
        contactInfo: 'backend@company.com',
        relevantKeywords: ['api', 'backend', 'service', 'integration', '后端', '接口', '服务']
      },
      {
        teamId: 'devops-team',
        teamName: 'DevOps团队',
        expertise: ['部署自动化', '基础设施', '监控'],
        contactInfo: 'devops@company.com',
        relevantKeywords: ['deploy', 'infrastructure', 'monitoring', 'ci/cd', '部署', '基础设施', '监控']
      },
      {
        teamId: 'qa-team',
        teamName: '质量保证团队',
        expertise: ['测试策略', '质量控制', '自动化测试'],
        contactInfo: 'qa@company.com',
        relevantKeywords: ['test', 'quality', 'automation', '测试', '质量', '自动化']
      }
    ];

    // 根据关键词过滤相关工作组
    let filteredSuggestions = workgroupSuggestions;
    
    if (keywords.length > 0) {
      filteredSuggestions = workgroupSuggestions.filter(team =>
        keywords.some(keyword =>
          team.relevantKeywords.some(teamKeyword =>
            teamKeyword.toLowerCase().includes(keyword.toLowerCase())
          )
        )
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          suggestions: filteredSuggestions,
          totalCount: filteredSuggestions.length
        }
      })
    };

  } catch (error) {
    logger.error('获取工作组建议失败', error as Error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'Failed to get workgroup suggestions' 
      })
    };
  }
};