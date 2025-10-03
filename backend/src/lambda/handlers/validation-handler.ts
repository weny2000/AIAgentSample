import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { RuleRepository } from '../../repositories/rule-repository';
import { RulesEngine, DEFAULT_STATIC_ANALYSIS_CONFIG, DEFAULT_SEMANTIC_ANALYSIS_CONFIG } from '../../rules-engine';
import { ArtifactValidationRequest } from '../../rules-engine/types';
import { buildResponse, buildErrorResponse } from '../utils/response-builder';
import { logger } from '../utils/logger';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const ruleRepository = new RuleRepository(dynamoClient, process.env.RULE_DEFINITIONS_TABLE_NAME);

// Initialize rules engine with configuration from environment variables
const staticConfig = {
  ...DEFAULT_STATIC_ANALYSIS_CONFIG,
  eslint: {
    ...DEFAULT_STATIC_ANALYSIS_CONFIG.eslint,
    enabled: process.env.ESLINT_ENABLED !== 'false'
  },
  cfn_lint: {
    ...DEFAULT_STATIC_ANALYSIS_CONFIG.cfn_lint,
    enabled: process.env.CFN_LINT_ENABLED !== 'false'
  },
  cfn_nag: {
    ...DEFAULT_STATIC_ANALYSIS_CONFIG.cfn_nag,
    enabled: process.env.CFN_NAG_ENABLED !== 'false'
  },
  snyk: {
    ...DEFAULT_STATIC_ANALYSIS_CONFIG.snyk,
    enabled: process.env.SNYK_ENABLED !== 'false'
  }
};

const semanticConfig = {
  ...DEFAULT_SEMANTIC_ANALYSIS_CONFIG,
  model_name: process.env.LLM_MODEL_NAME || DEFAULT_SEMANTIC_ANALYSIS_CONFIG.model_name,
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
  max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
  confidence_threshold: parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD || '0.7')
};

const rulesEngine = new RulesEngine(staticConfig, semanticConfig, ruleRepository);

export const handler = async (event: APIGatewayProxyEvent | any): Promise<APIGatewayProxyResult | any> => {
  const correlationId = event.requestContext?.requestId || event.correlationId || 'unknown';
  logger.setCorrelationId(correlationId);

  try {
    // Handle both API Gateway events and Step Functions events
    const isStepFunction = !event.httpMethod;
    
    if (isStepFunction) {
      return await handleStepFunctionEvent(event);
    } else {
      return await handleApiGatewayEvent(event);
    }
  } catch (error) {
    logger.error('Validation request failed', { error });
    
    if (event.httpMethod) {
      return buildErrorResponse(500, 'Internal server error', correlationId);
    } else {
      // Step Functions error format
      throw error;
    }
  }
};

async function handleApiGatewayEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = event.body ? JSON.parse(event.body) : {};
  
  const request: ArtifactValidationRequest = {
    artifact_id: body.artifact_id || `api-${Date.now()}`,
    artifact_type: body.artifact_type,
    content: body.content,
    file_path: body.file_path,
    metadata: body.metadata
  };

  if (!request.artifact_type || !request.content) {
    return buildErrorResponse(400, 'artifact_type and content are required', '');
  }

  logger.info('Running artifact validation', {
    artifactId: request.artifact_id,
    artifactType: request.artifact_type,
    contentLength: request.content.length
  });

  const report = await rulesEngine.validateArtifact(request);
  
  logger.info('Validation completed', {
    artifactId: request.artifact_id,
    score: report.overall_score,
    passed: report.passed,
    issueCount: report.summary.failed_rules
  });

  return buildResponse(200, report);
}

async function handleStepFunctionEvent(event: any): Promise<any> {
  const { artifactId, artifactType, s3Bucket, s3Key, filePath, metadata } = event;

  if (!artifactId || !artifactType || !s3Bucket || !s3Key) {
    throw new Error('Missing required fields: artifactId, artifactType, s3Bucket, s3Key');
  }

  logger.info('Running Step Function validation', {
    artifactId,
    artifactType,
    s3Bucket,
    s3Key
  });

  // Download artifact content from S3
  const content = await downloadArtifactFromS3(s3Bucket, s3Key);

  const request: ArtifactValidationRequest = {
    artifact_id: artifactId,
    artifact_type: artifactType,
    content,
    file_path: filePath,
    metadata
  };

  const report = await rulesEngine.validateArtifact(request);
  
  logger.info('Step Function validation completed', {
    artifactId,
    score: report.overall_score,
    passed: report.passed,
    issueCount: report.summary.failed_rules
  });

  // Return data in Step Functions format
  return {
    artifactId,
    validationReport: report,
    passed: report.passed,
    score: report.overall_score,
    criticalIssues: report.summary.critical_issues,
    highIssues: report.summary.high_issues,
    executionTime: report.execution_time_ms
  };
}

async function downloadArtifactFromS3(bucket: string, key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('Empty response from S3');
    }

    // Convert stream to string
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');
  } catch (error) {
    logger.error('Failed to download artifact from S3', {
      bucket,
      key,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to download artifact from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Health check endpoint
export const healthCheck = async (): Promise<APIGatewayProxyResult> => {
  try {
    // Test rules engine initialization
    const stats = await rulesEngine.getValidationStats({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      end: new Date()
    });

    return buildResponse(200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      rulesEngine: 'initialized',
      staticAnalysis: {
        eslint: staticConfig.eslint?.enabled,
        cfn_lint: staticConfig.cfn_lint?.enabled,
        cfn_nag: staticConfig.cfn_nag?.enabled,
        snyk: staticConfig.snyk?.enabled
      },
      semanticAnalysis: {
        provider: semanticConfig.llm_provider,
        model: semanticConfig.model_name,
        confidence_threshold: semanticConfig.confidence_threshold
      }
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    return buildErrorResponse(503, 'Service unhealthy', '');
  }
};