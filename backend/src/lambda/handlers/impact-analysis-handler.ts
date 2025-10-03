import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseConnection } from '../../database/connection.js';
import { ImpactAnalysisService } from '../../services/impact-analysis-service.js';
import { ResponseBuilder } from '../utils/response-builder.js';
import { AuthUtils } from '../utils/auth-utils.js';
import { Logger } from '../utils/logger.js';

/**
 * Lambda handler for impact analysis operations
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const logger = new Logger({ correlationId, operation: 'impact-analysis' });

  try {
    // Extract user information
    const user = AuthUtils.extractUserContext(event);

    // Initialize database connection
    const db = DatabaseConnection.getInstance();
    await db.connect();

    const impactAnalysisService = new ImpactAnalysisService(db);
    
    const httpMethod = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const queryStringParameters = event.queryStringParameters || {};

    logger.info('Processing impact analysis request', {
      method: httpMethod,
      path: event.path,
      user: user.sub,
      pathParameters,
      queryStringParameters
    });

    try {
      switch (httpMethod) {
        case 'POST':
          return await handleAnalyzeImpact(impactAnalysisService, event, user, logger);
        
        case 'GET':
          if (pathParameters.serviceId) {
            return await handleGetAnalysis(impactAnalysisService, pathParameters.serviceId, queryStringParameters || {}, user, logger);
          } else {
            return ResponseBuilder.badRequest('Service ID is required');
          }

        default:
          return ResponseBuilder.error('METHOD_NOT_ALLOWED', `Method ${httpMethod} not allowed`, 405);
      }
    } finally {
      await db.disconnect();
    }

  } catch (error) {
    logger.error('Impact analysis handler error', error instanceof Error ? error : new Error(String(error)));
    return ResponseBuilder.internalError('Internal server error');
  }
};

/**
 * Handle POST /impact-analysis - Analyze impact for a service
 */
async function handleAnalyzeImpact(
  service: ImpactAnalysisService,
  event: APIGatewayProxyEvent,
  user: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Validate required fields
    if (!body.service_id) {
      return ResponseBuilder.badRequest('service_id is required');
    }

    // Validate optional fields
    const analysisType = body.analysis_type || 'full';
    if (!['downstream', 'upstream', 'full'].includes(analysisType)) {
      return ResponseBuilder.badRequest('analysis_type must be one of: downstream, upstream, full');
    }

    const maxDepth = body.max_depth || 3;
    if (maxDepth < 1 || maxDepth > 10) {
      return ResponseBuilder.badRequest('max_depth must be between 1 and 10');
    }

    logger.info('Analyzing impact', {
      serviceId: body.service_id,
      analysisType,
      maxDepth,
      user: user.userId
    });

    // Perform impact analysis
    const result = await service.analyzeImpact(body.service_id, analysisType, maxDepth);

    logger.info('Impact analysis completed', {
      serviceId: body.service_id,
      affectedServicesCount: result.affected_services.length,
      riskLevel: result.risk_assessment.overall_risk_level,
      stakeholdersCount: result.stakeholders.length
    });

    return ResponseBuilder.success({
      success: true,
      data: result,
      metadata: {
        analysis_timestamp: new Date().toISOString(),
        analyzed_by: user.userId,
        correlation_id: logger.context.correlationId
      }
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error analyzing impact', err);
    
    if (err.message.includes('Service not found')) {
      return ResponseBuilder.notFound(err.message);
    }
    
    if (err.message.includes('Invalid service ID')) {
      return ResponseBuilder.badRequest(err.message);
    }

    return ResponseBuilder.error('ANALYSIS_ERROR', 'Failed to analyze impact', 500);
  }
}

/**
 * Handle GET /impact-analysis/{serviceId} - Get cached analysis or perform new analysis
 */
async function handleGetAnalysis(
  service: ImpactAnalysisService,
  serviceId: string,
  queryParams: Record<string, string>,
  user: any,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    // Validate service ID format
    if (!serviceId || serviceId.length === 0) {
      return ResponseBuilder.badRequest('Invalid service ID');
    }

    const analysisType = queryParams.analysis_type || 'full';
    const maxDepth = parseInt(queryParams.max_depth || '3');
    const useCache = queryParams.use_cache !== 'false';

    logger.info('Getting impact analysis', {
      serviceId,
      analysisType,
      maxDepth,
      useCache,
      user: user.userId
    });

    let result = null;

    // Try to get cached result if requested
    if (useCache) {
      result = await service.getCachedAnalysis(serviceId, analysisType);
      if (result) {
        logger.info('Returning cached impact analysis', { serviceId });
        return ResponseBuilder.success({
          success: true,
          data: result,
          metadata: {
            cached: true,
            correlation_id: logger.context.correlationId
          }
        });
      }
    }

    // Perform new analysis
    result = await service.analyzeImpact(serviceId, analysisType as any, maxDepth);

    // Cache the result
    if (useCache) {
      await service.cacheAnalysis(result);
    }

    logger.info('Impact analysis completed', {
      serviceId,
      affectedServicesCount: result.affected_services.length,
      riskLevel: result.risk_assessment.overall_risk_level
    });

    return ResponseBuilder.success({
      success: true,
      data: result,
      metadata: {
        cached: false,
        analysis_timestamp: new Date().toISOString(),
        correlation_id: logger.context.correlationId
      }
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error getting impact analysis', err);
    
    if (err.message.includes('Service not found')) {
      return ResponseBuilder.notFound(err.message);
    }
    
    if (err.message.includes('Invalid service ID')) {
      return ResponseBuilder.badRequest(err.message);
    }

    return ResponseBuilder.error('ANALYSIS_ERROR', 'Failed to get impact analysis', 500);
  }
}

/**
 * Handle batch impact analysis for multiple services
 */
export const batchAnalysisHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const correlationId = AuthUtils.getCorrelationId(event);
  const logger = new Logger({ correlationId, operation: 'batch-impact-analysis' });

  try {
    const user = AuthUtils.extractUserContext(event);
    if (!user) {
      return ResponseBuilder.unauthorized('Authentication required');
    }

    const body = JSON.parse(event.body || '{}');
    
    if (!body.service_ids || !Array.isArray(body.service_ids)) {
      return ResponseBuilder.badRequest('service_ids array is required');
    }

    if (body.service_ids.length > 10) {
      return ResponseBuilder.badRequest('Maximum 10 services can be analyzed at once');
    }

    const db = DatabaseConnection.getInstance();
    await db.connect();

    try {
      const impactAnalysisService = new ImpactAnalysisService(db);
      const analysisType = body.analysis_type || 'full';
      const maxDepth = body.max_depth || 3;

      logger.info('Starting batch impact analysis', {
        serviceIds: body.service_ids,
        analysisType,
        maxDepth,
        user: user.userId
      });

      const results = await Promise.allSettled(
        body.service_ids.map((serviceId: string) =>
          impactAnalysisService.analyzeImpact(serviceId, analysisType, maxDepth)
        )
      );

      const successful = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);

      const failed = results
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === 'rejected')
        .map(({ result, index }) => ({
          service_id: body.service_ids[index],
          error: (result as PromiseRejectedResult).reason?.message || 'Unknown error'
        }));

      logger.info('Batch impact analysis completed', {
        successful: successful.length,
        failed: failed.length,
        user: user.userId
      });

      return ResponseBuilder.success({
        success: true,
        data: {
          successful_analyses: successful,
          failed_analyses: failed,
          summary: {
            total_requested: body.service_ids.length,
            successful_count: successful.length,
            failed_count: failed.length
          }
        },
        metadata: {
          analysis_timestamp: new Date().toISOString(),
          analyzed_by: user.userId,
          correlation_id: logger.context.correlationId
        }
      });

    } finally {
      await db.disconnect();
    }

  } catch (error) {
    logger.error('Batch impact analysis error', error instanceof Error ? error : new Error(String(error)));
    return ResponseBuilder.internalError('Internal server error');
  }
};