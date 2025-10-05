import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ArtifactValidationService } from '../../services/artifact-validation-service';
import { DeliverableRecord, TodoItemRecord } from '../../models/work-task-models';
import { Logger } from '../utils/logger';

const logger = new Logger({
  correlationId: 'artifact-validation-handler',
  operation: 'ArtifactValidation'
});

const artifactValidationService = new ArtifactValidationService();

/**
 * Lambda handler for artifact validation operations
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const correlationId = event.headers['x-correlation-id'] || 'unknown';
  
  logger.info('Artifact validation request received', {
    correlationId,
    path: event.path,
    method: event.httpMethod
  });

  try {
    const { httpMethod, path } = event;
    const pathParts = path.split('/');

    // Route based on HTTP method and path
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/validate')) {
          return await handleValidateDeliverable(event, correlationId);
        } else if (path.includes('/assess-completeness')) {
          return await handleAssessCompleteness(event, correlationId);
        } else if (path.includes('/quality-check')) {
          return await handleQualityCheck(event, correlationId);
        }
        break;
      
      case 'GET':
        if (path.includes('/improvement-suggestions')) {
          return await handleGetImprovementSuggestions(event, correlationId);
        }
        break;
    }

    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Not Found',
        message: 'The requested endpoint was not found'
      })
    };

  } catch (error) {
    logger.error('Artifact validation handler error', error as Error, {
      correlationId
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'An error occurred while processing the request'
      })
    };
  }
};

/**
 * Handle deliverable validation request
 */
async function handleValidateDeliverable(
  event: APIGatewayProxyEvent,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Request body is required'
      })
    };
  }

  const { todoId, deliverable } = JSON.parse(event.body) as {
    todoId: string;
    deliverable: DeliverableRecord;
  };

  if (!todoId || !deliverable) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'todoId and deliverable are required'
      })
    };
  }

  logger.info('Validating deliverable', {
    correlationId,
    todoId,
    deliverableId: deliverable.deliverable_id
  });

  const validationResult = await artifactValidationService.validateDeliverable(
    todoId,
    deliverable
  );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      data: validationResult
    })
  };
}

/**
 * Handle completeness assessment request
 */
async function handleAssessCompleteness(
  event: APIGatewayProxyEvent,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Request body is required'
      })
    };
  }

  const { todoItem, deliverable } = JSON.parse(event.body) as {
    todoItem: TodoItemRecord;
    deliverable: DeliverableRecord;
  };

  if (!todoItem || !deliverable) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'todoItem and deliverable are required'
      })
    };
  }

  logger.info('Assessing completeness', {
    correlationId,
    todoId: todoItem.todo_id,
    deliverableId: deliverable.deliverable_id
  });

  const completenessAssessment = await artifactValidationService.assessCompleteness(
    todoItem,
    deliverable
  );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      data: completenessAssessment
    })
  };
}

/**
 * Handle quality check request
 */
async function handleQualityCheck(
  event: APIGatewayProxyEvent,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Request body is required'
      })
    };
  }

  const { deliverable, qualityStandards } = JSON.parse(event.body) as {
    deliverable: DeliverableRecord;
    qualityStandards: string[];
  };

  if (!deliverable || !qualityStandards) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'deliverable and qualityStandards are required'
      })
    };
  }

  logger.info('Performing quality check', {
    correlationId,
    deliverableId: deliverable.deliverable_id,
    standards: qualityStandards
  });

  const qualityAssessment = await artifactValidationService.performQualityCheck(
    deliverable,
    qualityStandards
  );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      data: qualityAssessment
    })
  };
}

/**
 * Handle improvement suggestions request
 */
async function handleGetImprovementSuggestions(
  event: APIGatewayProxyEvent,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Request body is required'
      })
    };
  }

  const { validationResult } = JSON.parse(event.body) as {
    validationResult: any;
  };

  if (!validationResult) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'validationResult is required'
      })
    };
  }

  logger.info('Generating improvement suggestions', {
    correlationId,
    validationScore: validationResult.validation_score
  });

  const suggestions = await artifactValidationService.generateImprovementSuggestions(
    validationResult
  );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      data: {
        suggestions
      }
    })
  };
}