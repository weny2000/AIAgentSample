import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '../utils/logger';
import { buildErrorResponse, buildSuccessResponse } from '../utils/response-builder';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { RuleDefinition } from '../../rules-engine/types';

interface FetchArtifactEvent {
  artifactUrl?: string;
  artifactContent?: string;
  artifactType: string;
  jobId: string;
  userContext?: {
    userId: string;
    teamId: string;
    role: string;
  };
}

interface FetchArtifactResult {
  content: string;
  contentType: string;
  size: number;
  source: 'url' | 'inline';
  detectedArtifactType: string;
  applicableRules: RuleDefinition[];
  rulesEngineCapabilities: {
    staticAnalysisEnabled: boolean;
    semanticAnalysisEnabled: boolean;
    securityAnalysisEnabled: boolean;
    supportedTypes: string[];
  };
  validationConfig: {
    timeoutMs: number;
    maxRetries: number;
    enableParallelValidation: boolean;
  };
  metadata?: Record<string, any>;
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

export const handler: Handler<FetchArtifactEvent, FetchArtifactResult> = async (event) => {
  const correlationId = event.jobId;
  const logger = new Logger({ correlationId, operation: 'fetch-artifact' });
  
  try {
    logger.info('Starting artifact fetch', { 
      hasUrl: !!event.artifactUrl,
      hasContent: !!event.artifactContent,
      artifactType: event.artifactType
    });

    // Validate input
    if (!event.artifactUrl && !event.artifactContent) {
      throw new Error('Either artifactUrl or artifactContent must be provided');
    }

    if (!event.artifactType) {
      throw new Error('artifactType must be provided');
    }

    let baseResult: Omit<FetchArtifactResult, 'detectedArtifactType' | 'applicableRules'>;

    if (event.artifactContent) {
      // Handle inline content
      baseResult = {
        content: event.artifactContent,
        contentType: 'text/plain',
        size: Buffer.byteLength(event.artifactContent, 'utf8'),
        source: 'inline',
      };
      
      logger.info('Using inline artifact content', { 
        size: baseResult.size 
      });
    } else if (event.artifactUrl) {
      // Handle S3 URL or external URL
      if (event.artifactUrl.startsWith('s3://')) {
        baseResult = await fetchFromS3(event.artifactUrl, correlationId);
      } else {
        baseResult = await fetchFromUrl(event.artifactUrl, correlationId);
      }
    } else {
      throw new Error('No valid artifact source provided');
    }

    // Validate artifact size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (baseResult.size > maxSize) {
      throw new Error(`Artifact size (${baseResult.size} bytes) exceeds maximum allowed size (${maxSize} bytes)`);
    }

    // Detect artifact type and get applicable rules
    const detectedArtifactType = detectArtifactType(baseResult.content, baseResult.contentType, event.artifactType);
    const applicableRules = await getApplicableRules(detectedArtifactType, correlationId);
    
    // Get rules engine capabilities for this artifact type
    const rulesEngineCapabilities = await getRulesEngineCapabilities(detectedArtifactType, correlationId);
    
    // Configure validation settings based on artifact type and rules
    const validationConfig = getValidationConfig(detectedArtifactType, applicableRules);

    const result: FetchArtifactResult = {
      ...baseResult,
      detectedArtifactType,
      applicableRules,
      rulesEngineCapabilities,
      validationConfig,
    };

    logger.info('Artifact fetch completed successfully', { 
      contentType: result.contentType,
      size: result.size,
      source: result.source,
      detectedArtifactType,
      applicableRulesCount: applicableRules.length
    });

    return result;

  } catch (error) {
    logger.error('Failed to fetch artifact', error instanceof Error ? error : new Error('Unknown error'));
    
    throw error;
  }
};

/**
 * Detect the actual artifact type based on content and metadata
 */
function detectArtifactType(content: string, contentType: string, declaredType: string): string {
  const logger = new Logger({ operation: 'detect-artifact-type' });
  
  try {
    // Start with declared type as fallback
    let detectedType = declaredType.toLowerCase();

    // Try to detect based on content patterns
    const trimmedContent = content.trim();
    
    // JSON detection
    if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
      try {
        JSON.parse(trimmedContent);
        
        // Check for specific JSON types
        if (trimmedContent.includes('"AWSTemplateFormatVersion"') || 
            trimmedContent.includes('"Resources"')) {
          detectedType = 'cloudformation';
        } else if (trimmedContent.includes('"terraform"') || 
                   trimmedContent.includes('"provider"')) {
          detectedType = 'terraform';
        } else if (trimmedContent.includes('"apiVersion"') && 
                   trimmedContent.includes('"kind"')) {
          detectedType = 'kubernetes';
        } else {
          detectedType = 'json';
        }
      } catch {
        // Not valid JSON, keep original detection
      }
    }
    
    // YAML detection
    else if (trimmedContent.includes('---') || 
             trimmedContent.match(/^[a-zA-Z_][a-zA-Z0-9_]*:\s/m)) {
      if (trimmedContent.includes('AWSTemplateFormatVersion') || 
          trimmedContent.includes('Resources:')) {
        detectedType = 'cloudformation';
      } else if (trimmedContent.includes('apiVersion:') && 
                 trimmedContent.includes('kind:')) {
        detectedType = 'kubernetes';
      } else {
        detectedType = 'yaml';
      }
    }
    
    // Dockerfile detection
    else if (trimmedContent.match(/^FROM\s+/m) || 
             trimmedContent.includes('RUN ') || 
             trimmedContent.includes('COPY ')) {
      detectedType = 'dockerfile';
    }
    
    // Terraform detection
    else if (trimmedContent.includes('resource "') || 
             trimmedContent.includes('provider "') || 
             trimmedContent.includes('terraform {')) {
      detectedType = 'terraform';
    }
    
    // Programming language detection
    else if (trimmedContent.includes('import ') && 
             (trimmedContent.includes('interface ') || trimmedContent.includes('type '))) {
      detectedType = 'typescript';
    } else if (trimmedContent.includes('import ') && 
               (trimmedContent.includes('function ') || trimmedContent.includes('const '))) {
      detectedType = 'javascript';
    } else if (trimmedContent.includes('def ') || 
               trimmedContent.includes('import ') || 
               trimmedContent.includes('from ')) {
      detectedType = 'python';
    } else if (trimmedContent.includes('public class ') || 
               trimmedContent.includes('package ')) {
      detectedType = 'java';
    }

    logger.info('Artifact type detected', { 
      declaredType, 
      detectedType,
      contentLength: content.length 
    });

    return detectedType;
  } catch (error) {
    logger.warn('Failed to detect artifact type, using declared type', { 
      declaredType, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return declaredType.toLowerCase();
  }
}

/**
 * Get applicable rules for the detected artifact type
 */
async function getApplicableRules(artifactType: string, correlationId: string): Promise<RuleDefinition[]> {
  const logger = new Logger({ correlationId, operation: 'get-applicable-rules' });
  
  try {
    const rulesEngineService = RulesEngineService.getInstance();
    const allRules = await rulesEngineService.getEnabledRules();
    
    // Filter rules applicable to this artifact type
    const applicableRules = allRules.filter(rule => {
      const applicableTypes = rule.config.applicable_types;
      
      if (!applicableTypes || !Array.isArray(applicableTypes)) {
        return false;
      }
      
      // Check for wildcard or exact match
      return applicableTypes.includes('*') || 
             applicableTypes.includes(artifactType) ||
             applicableTypes.some(type => artifactType.includes(type));
    });

    logger.info('Applicable rules found', { 
      artifactType,
      totalRules: allRules.length,
      applicableRules: applicableRules.length,
      ruleIds: applicableRules.map(r => r.id)
    });

    return applicableRules;
  } catch (error) {
    logger.error('Failed to get applicable rules', { 
      artifactType,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    // Return empty array on error to allow workflow to continue
    return [];
  }
}

/**
 * Get rules engine capabilities for the artifact type
 */
async function getRulesEngineCapabilities(artifactType: string, correlationId: string) {
  const logger = new Logger({ correlationId, operation: 'get-rules-engine-capabilities' });
  
  try {
    const rulesEngineService = RulesEngineService.getInstance();
    const capabilities = await rulesEngineService.getValidationCapabilities(artifactType);
    const supportedTypes = rulesEngineService.getSupportedArtifactTypes();
    
    logger.info('Rules engine capabilities retrieved', { 
      artifactType,
      capabilities,
      supportedTypesCount: supportedTypes.length
    });

    return {
      staticAnalysisEnabled: capabilities?.staticAnalysis || false,
      semanticAnalysisEnabled: capabilities?.semanticAnalysis || false,
      securityAnalysisEnabled: capabilities?.securityAnalysis || false,
      supportedTypes
    };
  } catch (error) {
    logger.warn('Failed to get rules engine capabilities', { 
      artifactType,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    // Return default capabilities on error
    return {
      staticAnalysisEnabled: false,
      semanticAnalysisEnabled: false,
      securityAnalysisEnabled: false,
      supportedTypes: []
    };
  }
}

/**
 * Configure validation settings based on artifact type and rules
 */
function getValidationConfig(artifactType: string, applicableRules: RuleDefinition[]) {
  // Base timeout configuration
  let timeoutMs = 60000; // 1 minute default
  let maxRetries = 2;
  let enableParallelValidation = true;

  // Adjust based on artifact type
  switch (artifactType.toLowerCase()) {
    case 'cloudformation':
    case 'terraform':
      timeoutMs = 120000; // 2 minutes for infrastructure code
      break;
    case 'dockerfile':
    case 'kubernetes':
      timeoutMs = 90000; // 1.5 minutes for container configs
      break;
    case 'python':
    case 'java':
      timeoutMs = 180000; // 3 minutes for complex code analysis
      break;
    default:
      timeoutMs = 60000; // 1 minute for other types
  }

  // Adjust based on number of applicable rules
  const ruleCount = applicableRules.length;
  if (ruleCount > 20) {
    timeoutMs *= 2; // Double timeout for many rules
    enableParallelValidation = true; // Ensure parallel processing
  } else if (ruleCount > 10) {
    timeoutMs *= 1.5; // Increase timeout by 50%
  }

  // Check for critical rules that might need more time
  const hasCriticalRules = applicableRules.some(rule => rule.severity === 'critical');
  const hasSemanticRules = applicableRules.some(rule => rule.type === 'semantic');
  
  if (hasCriticalRules) {
    maxRetries = 3; // More retries for critical rules
  }
  
  if (hasSemanticRules) {
    timeoutMs += 60000; // Add 1 minute for semantic analysis
  }

  // Cap maximum timeout at 5 minutes
  timeoutMs = Math.min(timeoutMs, 300000);

  return {
    timeoutMs,
    maxRetries,
    enableParallelValidation
  };
}

async function fetchFromS3(s3Url: string, correlationId: string): Promise<Omit<FetchArtifactResult, 'detectedArtifactType' | 'applicableRules'>> {
  try {
    // Parse S3 URL (s3://bucket/key)
    const url = new URL(s3Url);
    const bucket = url.hostname;
    const key = url.pathname.substring(1); // Remove leading slash

    logger.info('Fetching artifact from S3', { 
      bucket,
      key 
    });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('S3 object has no body');
    }

    const content = await response.Body.transformToString();
    
    return {
      content,
      contentType: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || Buffer.byteLength(content, 'utf8'),
      source: 'url',
      metadata: {
        lastModified: response.LastModified,
        etag: response.ETag,
        versionId: response.VersionId,
      },
    };

  } catch (error) {
    logger.error('Failed to fetch artifact from S3', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

async function fetchFromUrl(url: string, correlationId: string): Promise<Omit<FetchArtifactResult, 'detectedArtifactType' | 'applicableRules'>> {
  try {
    logger.info('Fetching artifact from URL', { 
      url: url.substring(0, 100) + (url.length > 100 ? '...' : '') // Truncate for logging
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Agent-System/1.0',
      },
      // Set timeout
      signal: AbortSignal.timeout(30000), // 30 seconds
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    const contentType = response.headers.get('content-type') || 'text/plain';

    return {
      content,
      contentType,
      size: Buffer.byteLength(content, 'utf8'),
      source: 'url',
      metadata: {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      },
    };

  } catch (error) {
    logger.error('Failed to fetch artifact from URL', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}