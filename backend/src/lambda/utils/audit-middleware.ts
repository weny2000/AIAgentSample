import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AuditService } from '../../services/audit-service';
import { createRepositoryFactory } from '../../repositories';
import { 
  CreateAuditLogInput, 
  SecurityEvent, 
  DataSourceAttribution,
  PerformanceMetrics 
} from '../../models';
import { Logger } from './logger';

// Initialize audit service
const repositories = createRepositoryFactory({
  region: process.env.AWS_REGION || 'us-east-1',
  teamRosterTableName: process.env.TEAM_ROSTER_TABLE_NAME!,
  artifactTemplatesTableName: process.env.ARTIFACT_TEMPLATES_TABLE_NAME!,
  auditLogTableName: process.env.AUDIT_LOG_TABLE_NAME!,
  databaseConnection: {
    host: process.env.POSTGRES_HOST!,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE!,
    username: process.env.POSTGRES_USERNAME!,
    password: process.env.POSTGRES_PASSWORD!,
  },
});

const auditService = new AuditService({ repositories });

export interface AuditContext {
  startTime: number;
  requestId: string;
  userId?: string;
  action: string;
  persona: string;
  references: any[];
  securityEvent?: SecurityEvent;
  policyViolations?: string[];
  complianceFlags?: string[];
  businessContext?: any;
}

export class AuditMiddleware {
  /**
   * Wrap a Lambda handler with automatic audit logging
   */
  static wrap<T extends APIGatewayProxyEvent, R extends APIGatewayProxyResult>(
    handler: (event: T) => Promise<R>,
    options: {
      action: string;
      persona?: string;
      extractReferences?: (event: T, result: R) => any[];
      extractBusinessContext?: (event: T, result: R) => any;
      skipAuditOnError?: boolean;
    }
  ) {
    return async (event: T): Promise<R> => {
      const startTime = Date.now();
      const logger = new Logger({
        correlationId: event.requestContext.requestId,
        operation: options.action,
        userId: event.requestContext.authorizer?.claims?.sub,
      });

      let result: R;
      let error: Error | undefined;
      let complianceScore = 100;
      let securityEvent: SecurityEvent | undefined;
      let policyViolations: string[] = [];
      let complianceFlags: string[] = [];

      try {
        // Execute the handler
        result = await handler(event);
        
        // Analyze result for compliance issues
        if (result.statusCode >= 400) {
          complianceScore = Math.max(complianceScore - 20, 0);
          complianceFlags.push('error_response');
        }

        // Check for security events based on response
        if (result.statusCode === 401 || result.statusCode === 403) {
          securityEvent = {
            event_type: 'authorization',
            severity: 'medium',
            source_ip: event.requestContext.identity.sourceIp,
            user_agent: event.headers['User-Agent'],
            resource_accessed: event.path,
            permission_requested: event.httpMethod,
            risk_score: 60,
          };
          complianceScore = Math.max(complianceScore - 30, 0);
        }

      } catch (err) {
        error = err as Error;
        result = {
          statusCode: 500,
          body: JSON.stringify({ error: 'Internal server error' }),
          headers: { 'Content-Type': 'application/json' },
        } as R;
        
        complianceScore = Math.max(complianceScore - 50, 0);
        complianceFlags.push('handler_error');
        
        // Create security event for errors
        securityEvent = {
          event_type: 'system_operation',
          severity: 'high',
          source_ip: event.requestContext.identity.sourceIp,
          user_agent: event.headers['User-Agent'],
          resource_accessed: event.path,
          violation_details: error.message,
          risk_score: 80,
        };
      }

      // Skip audit logging if configured and there was an error
      if (options.skipAuditOnError && error) {
        throw error;
      }

      try {
        // Create audit log entry
        const executionTime = Date.now() - startTime;
        const references = options.extractReferences ? 
          options.extractReferences(event, result) : [];
        const businessContext = options.extractBusinessContext ? 
          options.extractBusinessContext(event, result) : undefined;

        const auditInput: CreateAuditLogInput = {
          request_id: event.requestContext.requestId,
          user_id: event.requestContext.authorizer?.claims?.sub || 'anonymous',
          persona: options.persona || 'system',
          action: options.action,
          references,
          result_summary: error ? 
            `Action failed: ${error.message}` : 
            `Action completed successfully (${result.statusCode})`,
          compliance_score: complianceScore,
          
          // Enhanced fields
          session_id: event.requestContext.requestId,
          team_id: event.requestContext.authorizer?.claims?.['custom:team_id'],
          department: event.requestContext.authorizer?.claims?.['custom:department'],
          user_role: event.requestContext.authorizer?.claims?.['custom:role'],
          action_category: this.categorizeAction(options.action),
          security_event: securityEvent,
          compliance_flags: complianceFlags,
          policy_violations: policyViolations,
          
          performance_metrics: {
            execution_time_ms: executionTime,
            api_calls_made: 1,
            error_count: error ? 1 : 0,
          },
          
          error_details: error ? {
            error_code: 'HANDLER_ERROR',
            error_message: error.message,
            stack_trace: error.stack,
          } : undefined,
          
          request_context: {
            source_ip: event.requestContext.identity.sourceIp,
            user_agent: event.headers['User-Agent'],
            api_version: event.requestContext.stage,
            client_type: event.headers['X-Client-Type'] || 'web',
            correlation_id: event.requestContext.requestId,
            trace_id: event.headers['X-Amzn-Trace-Id'],
          },
          
          business_context: businessContext,
        };

        // Log the audit entry asynchronously
        auditService.logAction(auditInput).catch(auditError => {
          logger.error('Failed to log audit entry', auditError as Error);
        });

      } catch (auditError) {
        logger.error('Failed to create audit log', auditError as Error);
      }

      // Throw original error if there was one
      if (error) {
        throw error;
      }

      return result;
    };
  }

  /**
   * Log a security event manually
   */
  static async logSecurityEvent(
    event: APIGatewayProxyEvent,
    securityEvent: SecurityEvent,
    action: string,
    persona: string = 'system'
  ): Promise<void> {
    const baseInput: CreateAuditLogInput = {
      request_id: event.requestContext.requestId,
      user_id: event.requestContext.authorizer?.claims?.sub || 'anonymous',
      persona,
      action,
      references: [],
      result_summary: `Security event: ${securityEvent.event_type} (${securityEvent.severity})`,
      compliance_score: this.calculateSecurityEventComplianceScore(securityEvent),
      
      request_context: {
        source_ip: event.requestContext.identity.sourceIp,
        user_agent: event.headers['User-Agent'],
        api_version: event.requestContext.stage,
        client_type: event.headers['X-Client-Type'] || 'web',
        correlation_id: event.requestContext.requestId,
        trace_id: event.headers['X-Amzn-Trace-Id'],
      },
    };

    await auditService.logSecurityEvent(baseInput, securityEvent);
  }

  /**
   * Log a policy violation manually
   */
  static async logPolicyViolation(
    event: APIGatewayProxyEvent,
    violatedPolicies: string[],
    violationDetails: string,
    action: string,
    persona: string = 'system'
  ): Promise<void> {
    const baseInput: CreateAuditLogInput = {
      request_id: event.requestContext.requestId,
      user_id: event.requestContext.authorizer?.claims?.sub || 'anonymous',
      persona,
      action,
      references: [],
      result_summary: `Policy violation: ${violationDetails}`,
      compliance_score: Math.max(100 - (violatedPolicies.length * 20), 0),
      
      request_context: {
        source_ip: event.requestContext.identity.sourceIp,
        user_agent: event.headers['User-Agent'],
        api_version: event.requestContext.stage,
        client_type: event.headers['X-Client-Type'] || 'web',
        correlation_id: event.requestContext.requestId,
        trace_id: event.headers['X-Amzn-Trace-Id'],
      },
    };

    await auditService.logPolicyViolation(baseInput, violatedPolicies, violationDetails);
  }

  /**
   * Log data access with PII detection
   */
  static async logDataAccess(
    event: APIGatewayProxyEvent,
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted',
    piiDetected: boolean,
    action: string,
    persona: string = 'system',
    dataSources: DataSourceAttribution[] = []
  ): Promise<void> {
    const baseInput: CreateAuditLogInput = {
      request_id: event.requestContext.requestId,
      user_id: event.requestContext.authorizer?.claims?.sub || 'anonymous',
      persona,
      action,
      references: [],
      result_summary: `Data access: ${dataClassification} data${piiDetected ? ' (PII detected)' : ''}`,
      compliance_score: this.calculateDataAccessComplianceScore(dataClassification, piiDetected),
      data_sources: dataSources,
      
      request_context: {
        source_ip: event.requestContext.identity.sourceIp,
        user_agent: event.headers['User-Agent'],
        api_version: event.requestContext.stage,
        client_type: event.headers['X-Client-Type'] || 'web',
        correlation_id: event.requestContext.requestId,
        trace_id: event.headers['X-Amzn-Trace-Id'],
      },
    };

    await auditService.logDataAccess(baseInput, dataClassification, piiDetected);
  }

  // Private helper methods
  private static categorizeAction(action: string): CreateAuditLogInput['action_category'] {
    if (action.includes('query') || action.includes('search')) return 'query';
    if (action.includes('check') || action.includes('validate')) return 'artifact_check';
    if (action.includes('policy') || action.includes('rule')) return 'policy_update';
    if (action.includes('config') || action.includes('setting')) return 'configuration_change';
    if (action.includes('access') || action.includes('read')) return 'data_access';
    return 'system_operation';
  }

  private static calculateSecurityEventComplianceScore(securityEvent: SecurityEvent): number {
    let score = 100;
    
    switch (securityEvent.severity) {
      case 'critical': score -= 80; break;
      case 'high': score -= 60; break;
      case 'medium': score -= 30; break;
      case 'low': score -= 10; break;
    }
    
    return Math.max(score, 0);
  }

  private static calculateDataAccessComplianceScore(
    classification: 'public' | 'internal' | 'confidential' | 'restricted',
    piiDetected: boolean
  ): number {
    let score = 100;
    
    switch (classification) {
      case 'restricted': score -= 20; break;
      case 'confidential': score -= 10; break;
      case 'internal': score -= 5; break;
      case 'public': break;
    }
    
    if (piiDetected) score -= 30;
    
    return Math.max(score, 0);
  }
}