import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QualityAssessmentEngine } from '../../services/quality-assessment-engine';
import { DeliverableRecord, QualityAssessmentResult } from '../../models/work-task-models';
import { Logger } from '../utils/logger';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createResponse, parseRequestBody, validateRequiredFields } from '../utils/api-helpers';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

const qualityEngine = new QualityAssessmentEngine();

/**
 * Lambda handler for quality assessment operations
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'QualityAssessment'
  });

  logger.info('Quality assessment request received', {
    httpMethod: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters
  });

  try {
    const httpMethod = event.httpMethod;
    const path = event.path;

    // Route to appropriate handler based on HTTP method and path
    if (httpMethod === 'POST' && path.includes('/quality-check')) {
      return await handleQualityCheck(event, logger);
    } else if (httpMethod === 'GET' && path.includes('/quality-standards')) {
      return await handleGetQualityStandards(event, logger);
    } else if (httpMethod === 'GET' && path.includes('/quality-dimensions')) {
      return await handleGetQualityDimensions(event, logger);
    } else if (httpMethod === 'POST' && path.includes('/validate-config')) {
      return await handleValidateConfig(event, logger);
    } else {
      return createResponse(404, { error: 'Not Found', message: 'Endpoint not found' });
    }

  } catch (error) {
    logger.error('Quality assessment handler error', error, {
      errorType: 'HandlerError'
    });

    return createResponse(500, {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred during quality assessment'
    });
  }
};

/**
 * Handle quality check requests
 * POST /api/v1/deliverables/{deliverableId}/quality-check
 */
async function handleQualityCheck(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const deliverableId = event.pathParameters?.deliverableId;
    if (!deliverableId) {
      return createResponse(400, {
        error: 'Bad Request',
        message: 'Deliverable ID is required'
      });
    }

    // Parse request body for quality standards and context
    const requestBody = parseRequestBody(event.body);
    const qualityStandards: string[] = requestBody.qualityStandards || [];
    const teamId: string | undefined = requestBody.teamId;
    const projectContext: Record<string, any> | undefined = requestBody.projectContext;

    logger.info('Performing quality check', {
      deliverable_id: deliverableId,
      quality_standards: qualityStandards,
      team_id: teamId
    });

    // Retrieve deliverable record from DynamoDB
    const deliverable = await getDeliverableRecord(deliverableId, logger);
    if (!deliverable) {
      return createResponse(404, {
        error: 'Not Found',
        message: 'Deliverable not found'
      });
    }

    // Perform quality assessment
    const qualityResult: QualityAssessmentResult = await qualityEngine.performQualityAssessment(
      deliverable,
      qualityStandards,
      {
        teamId,
        projectContext
      }
    );

    // Update deliverable record with quality assessment result
    await updateDeliverableWithQualityResult(deliverable, qualityResult, logger);

    logger.info('Quality check completed', {
      deliverable_id: deliverableId,
      overall_score: qualityResult.overall_score,
      is_compliant: qualityResult.compliance_status.is_compliant
    });

    return createResponse(200, {
      deliverable_id: deliverableId,
      quality_assessment: qualityResult
    });

  } catch (error) {
    logger.error('Quality check failed', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return createResponse(404, {
        error: 'Not Found',
        message: error.message
      });
    }

    return createResponse(500, {
      error: 'Internal Server Error',
      message: 'Quality check failed'
    });
  }
}

/**
 * Handle get quality standards requests
 * GET /api/v1/quality-standards?fileType={fileType}
 */
async function handleGetQualityStandards(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const fileType = event.queryStringParameters?.fileType;
    if (!fileType) {
      return createResponse(400, {
        error: 'Bad Request',
        message: 'File type parameter is required'
      });
    }

    logger.info('Getting quality standards', { file_type: fileType });

    const qualityStandards = qualityEngine.getAvailableQualityStandards(fileType);

    return createResponse(200, {
      file_type: fileType,
      quality_standards: qualityStandards
    });

  } catch (error) {
    logger.error('Failed to get quality standards', error);
    return createResponse(500, {
      error: 'Internal Server Error',
      message: 'Failed to retrieve quality standards'
    });
  }
}

/**
 * Handle get quality dimensions requests
 * GET /api/v1/quality-dimensions?fileType={fileType}
 */
async function handleGetQualityDimensions(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const fileType = event.queryStringParameters?.fileType;
    if (!fileType) {
      return createResponse(400, {
        error: 'Bad Request',
        message: 'File type parameter is required'
      });
    }

    logger.info('Getting quality dimensions', { file_type: fileType });

    const qualityDimensions = qualityEngine.getQualityDimensionConfig(fileType);

    return createResponse(200, {
      file_type: fileType,
      quality_dimensions: qualityDimensions
    });

  } catch (error) {
    logger.error('Failed to get quality dimensions', error);
    return createResponse(500, {
      error: 'Internal Server Error',
      message: 'Failed to retrieve quality dimensions'
    });
  }
}

/**
 * Handle validate quality standard configuration requests
 * POST /api/v1/quality-standards/validate-config
 */
async function handleValidateConfig(
  event: APIGatewayProxyEvent,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  try {
    const requestBody = parseRequestBody(event.body);
    
    // Validate required fields
    const validationResult = validateRequiredFields(requestBody, [
      'fileTypes',
      'dimensions',
      'complianceRules',
      'scoringWeights',
      'improvementThresholds'
    ]);

    if (!validationResult.isValid) {
      return createResponse(400, {
        error: 'Bad Request',
        message: 'Invalid request body',
        details: validationResult.missingFields
      });
    }

    logger.info('Validating quality standard configuration');

    const configValidation = qualityEngine.validateQualityStandardConfig(requestBody);

    return createResponse(200, {
      valid: configValidation.valid,
      errors: configValidation.errors
    });

  } catch (error) {
    logger.error('Failed to validate quality standard configuration', error);
    return createResponse(500, {
      error: 'Internal Server Error',
      message: 'Configuration validation failed'
    });
  }
}

/**
 * Retrieve deliverable record from DynamoDB
 */
async function getDeliverableRecord(
  deliverableId: string,
  logger: Logger
): Promise<DeliverableRecord | null> {
  try {
    const command = new GetCommand({
      TableName: process.env.DELIVERABLES_TABLE_NAME || 'deliverables',
      Key: {
        deliverable_id: deliverableId
      }
    });

    const response = await dynamoClient.send(command);
    
    if (!response.Item) {
      logger.warn('Deliverable not found', { deliverable_id: deliverableId });
      return null;
    }

    return response.Item as DeliverableRecord;

  } catch (error) {
    logger.error('Failed to retrieve deliverable record', error, {
      deliverable_id: deliverableId
    });
    throw error;
  }
}

/**
 * Update deliverable record with quality assessment result
 */
async function updateDeliverableWithQualityResult(
  deliverable: DeliverableRecord,
  qualityResult: QualityAssessmentResult,
  logger: Logger
): Promise<void> {
  try {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    
    const command = new UpdateCommand({
      TableName: process.env.DELIVERABLES_TABLE_NAME || 'deliverables',
      Key: {
        deliverable_id: deliverable.deliverable_id
      },
      UpdateExpression: 'SET quality_assessment = :quality_assessment, #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':quality_assessment': qualityResult,
        ':status': qualityResult.compliance_status.is_compliant ? 'approved' : 'needs_revision'
      }
    });

    await dynamoClient.send(command);

    logger.info('Deliverable updated with quality assessment', {
      deliverable_id: deliverable.deliverable_id,
      overall_score: qualityResult.overall_score,
      status: qualityResult.compliance_status.is_compliant ? 'approved' : 'needs_revision'
    });

  } catch (error) {
    logger.error('Failed to update deliverable with quality result', error, {
      deliverable_id: deliverable.deliverable_id
    });
    throw error;
  }
}

/**
 * Batch quality check handler for multiple deliverables
 * POST /api/v1/work-tasks/{taskId}/batch-quality-check
 */
export const batchQualityCheckHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const logger = new Logger({
    correlationId: event.requestContext.requestId,
    operation: 'BatchQualityCheck'
  });

  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return createResponse(400, {
        error: 'Bad Request',
        message: 'Task ID is required'
      });
    }

    const requestBody = parseRequestBody(event.body);
    const qualityStandards: string[] = requestBody.qualityStandards || [];
    const teamId: string | undefined = requestBody.teamId;

    logger.info('Starting batch quality check', {
      task_id: taskId,
      quality_standards: qualityStandards,
      team_id: teamId
    });

    // Get all deliverables for the task
    const deliverables = await getDeliverablesForTask(taskId, logger);
    
    if (deliverables.length === 0) {
      return createResponse(404, {
        error: 'Not Found',
        message: 'No deliverables found for task'
      });
    }

    // Perform quality assessment on all deliverables
    const qualityResults = await Promise.allSettled(
      deliverables.map(deliverable =>
        qualityEngine.performQualityAssessment(
          deliverable,
          qualityStandards,
          { teamId }
        )
      )
    );

    // Process results
    const successfulResults: Array<{
      deliverable_id: string;
      quality_assessment: QualityAssessmentResult;
    }> = [];
    const failedResults: Array<{
      deliverable_id: string;
      error: string;
    }> = [];

    qualityResults.forEach((result, index) => {
      const deliverable = deliverables[index];
      
      if (result.status === 'fulfilled') {
        successfulResults.push({
          deliverable_id: deliverable.deliverable_id,
          quality_assessment: result.value
        });
      } else {
        failedResults.push({
          deliverable_id: deliverable.deliverable_id,
          error: result.reason?.message || 'Quality assessment failed'
        });
      }
    });

    // Update deliverables with successful results
    await Promise.allSettled(
      successfulResults.map(result =>
        updateDeliverableWithQualityResult(
          deliverables.find(d => d.deliverable_id === result.deliverable_id)!,
          result.quality_assessment,
          logger
        )
      )
    );

    logger.info('Batch quality check completed', {
      task_id: taskId,
      total_deliverables: deliverables.length,
      successful_assessments: successfulResults.length,
      failed_assessments: failedResults.length
    });

    return createResponse(200, {
      task_id: taskId,
      total_deliverables: deliverables.length,
      successful_results: successfulResults,
      failed_results: failedResults,
      summary: {
        success_rate: successfulResults.length / deliverables.length,
        average_score: successfulResults.length > 0 
          ? successfulResults.reduce((sum, r) => sum + r.quality_assessment.overall_score, 0) / successfulResults.length
          : 0
      }
    });

  } catch (error) {
    logger.error('Batch quality check failed', error);
    return createResponse(500, {
      error: 'Internal Server Error',
      message: 'Batch quality check failed'
    });
  }
};

/**
 * Get all deliverables for a task
 */
async function getDeliverablesForTask(
  taskId: string,
  logger: Logger
): Promise<DeliverableRecord[]> {
  try {
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
    
    const command = new QueryCommand({
      TableName: process.env.DELIVERABLES_TABLE_NAME || 'deliverables',
      IndexName: 'TaskIdIndex', // Assuming GSI exists
      KeyConditionExpression: 'task_id = :task_id',
      ExpressionAttributeValues: {
        ':task_id': taskId
      }
    });

    const response = await dynamoClient.send(command);
    return (response.Items || []) as DeliverableRecord[];

  } catch (error) {
    logger.error('Failed to retrieve deliverables for task', error, {
      task_id: taskId
    });
    throw error;
  }
}