import { Handler } from 'aws-lambda';
import { Logger } from '../utils/logger';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { ValidationReport, RuleDefinition, ArtifactValidationRequest } from '../../rules-engine/types';

interface RulesEngineValidationEvent {
  jobId: string;
  artifactData: {
    content: string;
    contentType: string;
    detectedArtifactType: string;
    applicableRules: RuleDefinition[];
    validationConfig: {
      timeoutMs: number;
      maxRetries: number;
      enableParallelValidation: boolean;
    };
  };
  userContext: {
    userId: string;
    teamId: string;
    role: string;
  };
  artifactCheckRequest: {
    artifactUrl?: string;
    artifactType: string;
  };
}

interface RulesEngineValidationResult {
  validationReport: ValidationReport | null;
  executionStatus: 'completed' | 'failed' | 'timeout' | 'skipped';
  executionTime: number;
  errorDetails?: {
    error: string;
    retryCount: number;
    lastAttemptTime: string;
  };
}

export const handler: Handler<RulesEngineValidationEvent, RulesEngineValidationResult> = async (event) => {
  const correlationId = event.jobId;
  const logger = new Logger({ 
    correlationId, 
    operation: 'rules-engine-validation',
    userId: event.userContext.userId 
  });
  
  const startTime = Date.now();
  
  try {
    logger.info('Starting rules engine validation', { 
      artifactType: event.artifactData.detectedArtifactType,
      applicableRulesCount: event.artifactData.applicableRules.length,
      timeoutMs: event.artifactData.validationConfig.timeoutMs,
      enableParallelValidation: event.artifactData.validationConfig.enableParallelValidation
    });

    // Skip validation if no applicable rules
    if (event.artifactData.applicableRules.length === 0) {
      logger.info('No applicable rules found, skipping validation');
      return {
        validationReport: null,
        executionStatus: 'skipped',
        executionTime: Date.now() - startTime
      };
    }

    // Validate artifact size (prevent processing of very large artifacts)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (Buffer.byteLength(event.artifactData.content, 'utf8') > maxSize) {
      throw new Error(`Artifact size exceeds maximum allowed size (${maxSize} bytes)`);
    }

    // Run validation with retry logic
    const validationReport = await runValidationWithRetry(event, correlationId);
    
    const executionTime = Date.now() - startTime;
    
    logger.info('Rules engine validation completed successfully', { 
      overall_score: validationReport.overall_score,
      passed: validationReport.passed,
      total_rules: validationReport.summary.total_rules,
      failed_rules: validationReport.summary.failed_rules,
      execution_time_ms: executionTime
    });

    return {
      validationReport,
      executionStatus: 'completed',
      executionTime
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Rules engine validation failed', { 
      error: errorMessage,
      execution_time_ms: executionTime
    });

    // Determine if this was a timeout
    const isTimeout = errorMessage.includes('timeout') || 
                     executionTime >= event.artifactData.validationConfig.timeoutMs;

    return {
      validationReport: null,
      executionStatus: isTimeout ? 'timeout' : 'failed',
      executionTime,
      errorDetails: {
        error: errorMessage,
        retryCount: 0, // Will be updated by retry logic
        lastAttemptTime: new Date().toISOString()
      }
    };
  }
};

/**
 * Run validation with retry logic
 */
async function runValidationWithRetry(
  event: RulesEngineValidationEvent, 
  correlationId: string
): Promise<ValidationReport> {
  const logger = new Logger({ correlationId, operation: 'validation-with-retry' });
  const maxRetries = event.artifactData.validationConfig.maxRetries;
  const timeoutMs = event.artifactData.validationConfig.timeoutMs;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info('Starting validation attempt', { 
        attempt: attempt + 1, 
        maxRetries: maxRetries + 1,
        timeoutMs 
      });

      // Create validation request
      const validationRequest: ArtifactValidationRequest = {
        artifact_id: event.jobId,
        artifact_type: event.artifactData.detectedArtifactType,
        content: event.artifactData.content,
        file_path: event.artifactCheckRequest.artifactUrl,
        metadata: {
          user_id: event.userContext.userId,
          team_id: event.userContext.teamId,
          role: event.userContext.role,
          content_type: event.artifactData.contentType,
          applicable_rules: event.artifactData.applicableRules.map(r => r.id),
          validation_config: event.artifactData.validationConfig,
          attempt_number: attempt + 1
        }
      };

      // Run validation with timeout
      const validationPromise = runRulesEngineValidation(validationRequest, correlationId);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Validation timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const report = await Promise.race([validationPromise, timeoutPromise]);
      
      logger.info('Validation attempt succeeded', { 
        attempt: attempt + 1,
        overall_score: report.overall_score,
        execution_time_ms: report.execution_time_ms
      });

      return report;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      logger.warn('Validation attempt failed', { 
        attempt: attempt + 1,
        error: lastError.message,
        willRetry: attempt < maxRetries
      });

      // Don't retry on certain types of errors
      if (lastError.message.includes('Invalid artifact type') ||
          lastError.message.includes('exceeds maximum allowed size') ||
          lastError.message.includes('Invalid rule configuration')) {
        logger.info('Non-retryable error detected, stopping retries');
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        logger.info('Waiting before retry', { delayMs });
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Validation failed after all retries');
}

/**
 * Run the actual rules engine validation
 */
async function runRulesEngineValidation(
  request: ArtifactValidationRequest, 
  correlationId: string
): Promise<ValidationReport> {
  const logger = new Logger({ correlationId, operation: 'rules-engine-execution' });
  
  try {
    const rulesEngineService = RulesEngineService.getInstance();
    
    logger.info('Executing rules engine validation', {
      artifact_id: request.artifact_id,
      artifact_type: request.artifact_type,
      content_length: request.content.length,
      applicable_rules_count: request.metadata?.applicable_rules?.length || 0
    });

    const report = await rulesEngineService.validateArtifact(request);
    
    logger.info('Rules engine validation executed successfully', {
      overall_score: report.overall_score,
      passed: report.passed,
      total_rules: report.summary.total_rules,
      failed_rules: report.summary.failed_rules,
      critical_issues: report.summary.critical_issues,
      execution_time_ms: report.execution_time_ms
    });

    return report;
  } catch (error) {
    logger.error('Rules engine execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      artifact_id: request.artifact_id
    });
    throw error;
  }
}

/**
 * Health check for rules engine validation
 */
export const healthCheck = async (): Promise<{ status: string; timestamp: string; details: any }> => {
  try {
    const rulesEngineService = RulesEngineService.getInstance();
    const supportedTypes = rulesEngineService.getSupportedArtifactTypes();
    const ruleStats = await rulesEngineService.getRuleStats();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      details: {
        supportedArtifactTypes: supportedTypes,
        ruleStats,
        service: 'rules-engine-validation-handler'
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        service: 'rules-engine-validation-handler'
      }
    };
  }
};