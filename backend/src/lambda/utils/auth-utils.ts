import { APIGatewayProxyEvent } from 'aws-lambda';
import { UserContext } from '../types';

export class AuthUtils {
  /**
   * Extract user context from API Gateway event
   * This assumes the authorizer has already validated the token and populated the context
   */
  static extractUserContext(event: APIGatewayProxyEvent): UserContext {
    const requestContext = event.requestContext as any;
    
    // Check if authorizer context exists
    if (!requestContext.authorizer || !requestContext.authorizer.claims) {
      throw new Error('Missing authorization context');
    }

    const claims = requestContext.authorizer.claims;
    
    return {
      userId: claims.sub || claims.userId,
      teamId: claims.team_id || claims.teamId,
      role: claims.role || 'user',
      department: claims.department || 'unknown',
      clearance: claims.clearance || 'standard',
      permissions: claims.permissions ? claims.permissions.split(',') : [],
    };
  }

  /**
   * Check if user has required permission
   */
  static hasPermission(userContext: UserContext, requiredPermission: string): boolean {
    return userContext.permissions.includes(requiredPermission) || 
           userContext.permissions.includes('admin');
  }

  /**
   * Check if user can access team resources
   */
  static canAccessTeam(userContext: UserContext, targetTeamId: string): boolean {
    // Users can access their own team or if they have cross-team permissions
    return userContext.teamId === targetTeamId || 
           this.hasPermission(userContext, 'cross-team-access');
  }

  /**
   * Extract correlation ID from headers or generate one
   */
  static getCorrelationId(event: APIGatewayProxyEvent): string {
    return event.headers['X-Correlation-ID'] || 
           event.headers['x-correlation-id'] ||
           `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate required fields in request body
   */
  static validateRequiredFields(
    body: Record<string, any>, 
    requiredFields: string[]
  ): string[] {
    const missingFields: string[] = [];
    
    for (const field of requiredFields) {
      if (!body[field] || (typeof body[field] === 'string' && body[field].trim() === '')) {
        missingFields.push(field);
      }
    }
    
    return missingFields;
  }
}