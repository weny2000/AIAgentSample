/**
 * Access Control Service
 * Role-based fine-grained access control for work tasks and deliverables
 */

import { Logger } from '../lambda/utils/logger';

export interface AccessControlPolicy {
  policyId: string;
  policyName: string;
  description: string;
  teamId?: string;
  roles: RoleDefinition[];
  resources: ResourcePermission[];
  conditions: AccessCondition[];
  isActive: boolean;
}

export interface RoleDefinition {
  roleId: string;
  roleName: string;
  description: string;
  permissions: Permission[];
  inheritsFrom?: string[]; // Role inheritance
  priority: number; // Higher priority roles override lower ones
}

export interface Permission {
  resource: ResourceType;
  actions: Action[];
  scope: 'own' | 'team' | 'organization' | 'all';
  conditions?: PermissionCondition[];
}

export type ResourceType = 
  | 'work_task'
  | 'todo_item'
  | 'deliverable'
  | 'quality_assessment'
  | 'progress_tracking'
  | 'team_data'
  | 'audit_log'
  | 'system_config';

export type Action = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'reassign'
  | 'comment'
  | 'export'
  | 'share';

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
}

export interface ResourcePermission {
  resourceType: ResourceType;
  resourceId: string;
  allowedRoles: string[];
  deniedRoles: string[];
  customPermissions?: CustomPermission[];
}

export interface CustomPermission {
  userId: string;
  actions: Action[];
  expiresAt?: string;
  reason?: string;
}

export interface AccessCondition {
  conditionId: string;
  conditionType: 'time_based' | 'location_based' | 'attribute_based' | 'risk_based';
  parameters: Record<string, any>;
  effect: 'allow' | 'deny';
}

export interface AccessRequest {
  userId: string;
  userRoles: string[];
  resource: ResourceType;
  resourceId: string;
  action: Action;
  context: AccessContext;
}

export interface AccessContext {
  teamId?: string;
  timestamp: string;
  sourceIp?: string;
  userAgent?: string;
  sessionId?: string;
  resourceOwner?: string;
  resourceMetadata?: Record<string, any>;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  appliedPolicies: string[];
  appliedRoles: string[];
  conditions: string[];
  expiresAt?: string;
  requiresApproval?: boolean;
  approvers?: string[];
}

export interface AuditEntry {
  timestamp: string;
  userId: string;
  action: Action;
  resource: ResourceType;
  resourceId: string;
  decision: 'allowed' | 'denied';
  reason: string;
  context: AccessContext;
}

export class AccessControlService {
  private logger: Logger;
  private policies: Map<string, AccessControlPolicy>;
  private roleCache: Map<string, RoleDefinition>;
  private auditLog: AuditEntry[];

  // Default roles
  private readonly defaultRoles: RoleDefinition[] = [
    {
      roleId: 'admin',
      roleName: 'Administrator',
      description: 'Full system access',
      permissions: [
        {
          resource: 'work_task',
          actions: ['create', 'read', 'update', 'delete', 'submit', 'approve', 'reject', 'assign', 'reassign', 'comment', 'export', 'share'],
          scope: 'all'
        },
        {
          resource: 'todo_item',
          actions: ['create', 'read', 'update', 'delete', 'assign', 'reassign', 'comment'],
          scope: 'all'
        },
        {
          resource: 'deliverable',
          actions: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'export'],
          scope: 'all'
        },
        {
          resource: 'quality_assessment',
          actions: ['create', 'read', 'update', 'delete'],
          scope: 'all'
        },
        {
          resource: 'system_config',
          actions: ['read', 'update'],
          scope: 'all'
        }
      ],
      priority: 100
    },
    {
      roleId: 'team_lead',
      roleName: 'Team Lead',
      description: 'Team management and oversight',
      permissions: [
        {
          resource: 'work_task',
          actions: ['create', 'read', 'update', 'submit', 'approve', 'assign', 'reassign', 'comment', 'export'],
          scope: 'team'
        },
        {
          resource: 'todo_item',
          actions: ['create', 'read', 'update', 'assign', 'reassign', 'comment'],
          scope: 'team'
        },
        {
          resource: 'deliverable',
          actions: ['read', 'approve', 'reject', 'comment'],
          scope: 'team'
        },
        {
          resource: 'quality_assessment',
          actions: ['read', 'create'],
          scope: 'team'
        },
        {
          resource: 'progress_tracking',
          actions: ['read', 'update'],
          scope: 'team'
        }
      ],
      priority: 80
    },
    {
      roleId: 'contributor',
      roleName: 'Contributor',
      description: 'Standard team member',
      permissions: [
        {
          resource: 'work_task',
          actions: ['create', 'read', 'update', 'submit', 'comment'],
          scope: 'own'
        },
        {
          resource: 'todo_item',
          actions: ['read', 'update', 'comment'],
          scope: 'own',
          conditions: [
            { field: 'assigned_to', operator: 'equals', value: '{{userId}}' }
          ]
        },
        {
          resource: 'deliverable',
          actions: ['create', 'read', 'update', 'submit'],
          scope: 'own'
        },
        {
          resource: 'quality_assessment',
          actions: ['read'],
          scope: 'own'
        }
      ],
      priority: 50
    },
    {
      roleId: 'reviewer',
      roleName: 'Reviewer',
      description: 'Quality assurance and review',
      permissions: [
        {
          resource: 'work_task',
          actions: ['read', 'comment'],
          scope: 'team'
        },
        {
          resource: 'deliverable',
          actions: ['read', 'approve', 'reject', 'comment'],
          scope: 'team'
        },
        {
          resource: 'quality_assessment',
          actions: ['create', 'read', 'update'],
          scope: 'team'
        }
      ],
      priority: 60
    },
    {
      roleId: 'viewer',
      roleName: 'Viewer',
      description: 'Read-only access',
      permissions: [
        {
          resource: 'work_task',
          actions: ['read'],
          scope: 'team'
        },
        {
          resource: 'todo_item',
          actions: ['read'],
          scope: 'team'
        },
        {
          resource: 'deliverable',
          actions: ['read'],
          scope: 'team'
        },
        {
          resource: 'quality_assessment',
          actions: ['read'],
          scope: 'team'
        }
      ],
      priority: 30
    }
  ];

  constructor() {
    this.logger = new Logger({
      correlationId: 'access-control',
      operation: 'authorization'
    });

    this.policies = new Map();
    this.roleCache = new Map();
    this.auditLog = [];

    // Initialize default roles
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default roles
   */
  private initializeDefaultRoles(): void {
    for (const role of this.defaultRoles) {
      this.roleCache.set(role.roleId, role);
    }
  }

  /**
   * Check if user has permission to perform action on resource
   */
  async checkAccess(request: AccessRequest): Promise<AccessDecision> {
    this.logger.info('Checking access', {
      userId: request.userId,
      resource: request.resource,
      action: request.action,
      resourceId: request.resourceId
    });

    try {
      // 1. Get user's effective permissions
      const effectivePermissions = this.getEffectivePermissions(request.userRoles);

      // 2. Check if action is allowed for resource
      const permissionCheck = this.checkPermission(
        effectivePermissions,
        request.resource,
        request.action,
        request.context
      );

      if (!permissionCheck.allowed) {
        const decision = this.createDeniedDecision(permissionCheck.reason, request.userRoles);
        await this.auditAccess(request, decision);
        return decision;
      }

      // 3. Check scope restrictions
      const scopeCheck = await this.checkScope(
        permissionCheck.permission!,
        request,
        request.context
      );

      if (!scopeCheck.allowed) {
        const decision = this.createDeniedDecision(scopeCheck.reason, request.userRoles);
        await this.auditAccess(request, decision);
        return decision;
      }

      // 4. Check permission conditions
      const conditionCheck = this.checkConditions(
        permissionCheck.permission!,
        request,
        request.context
      );

      if (!conditionCheck.allowed) {
        const decision = this.createDeniedDecision(conditionCheck.reason, request.userRoles);
        await this.auditAccess(request, decision);
        return decision;
      }

      // 5. Check resource-specific permissions
      const resourceCheck = await this.checkResourcePermissions(request);

      if (!resourceCheck.allowed) {
        const decision = this.createDeniedDecision(resourceCheck.reason, request.userRoles);
        await this.auditAccess(request, decision);
        return decision;
      }

      // 6. Check access conditions (time-based, location-based, etc.)
      const accessConditionCheck = await this.checkAccessConditions(request);

      if (!accessConditionCheck.allowed) {
        const decision = this.createDeniedDecision(accessConditionCheck.reason, request.userRoles);
        await this.auditAccess(request, decision);
        return decision;
      }

      // Access granted
      const decision: AccessDecision = {
        allowed: true,
        reason: 'Access granted based on role permissions',
        appliedPolicies: [],
        appliedRoles: request.userRoles,
        conditions: []
      };

      await this.auditAccess(request, decision);

      this.logger.info('Access granted', {
        userId: request.userId,
        resource: request.resource,
        action: request.action
      });

      return decision;

    } catch (error) {
      this.logger.error('Access check failed', error as Error);
      return this.createDeniedDecision('Access check failed due to system error', request.userRoles);
    }
  }

  /**
   * Get effective permissions for user roles
   */
  private getEffectivePermissions(userRoles: string[]): Permission[] {
    const permissions: Permission[] = [];
    const rolesByPriority = userRoles
      .map(roleId => this.roleCache.get(roleId))
      .filter(role => role !== undefined)
      .sort((a, b) => b!.priority - a!.priority);

    for (const role of rolesByPriority) {
      if (role) {
        permissions.push(...role.permissions);
      }
    }

    return permissions;
  }

  /**
   * Check if permission allows action on resource
   */
  private checkPermission(
    permissions: Permission[],
    resource: ResourceType,
    action: Action,
    context: AccessContext
  ): { allowed: boolean; reason: string; permission?: Permission } {
    for (const permission of permissions) {
      if (permission.resource === resource && permission.actions.includes(action)) {
        return {
          allowed: true,
          reason: 'Permission found',
          permission
        };
      }
    }

    return {
      allowed: false,
      reason: `No permission found for action '${action}' on resource '${resource}'`
    };
  }

  /**
   * Check scope restrictions
   */
  private async checkScope(
    permission: Permission,
    request: AccessRequest,
    context: AccessContext
  ): Promise<{ allowed: boolean; reason: string }> {
    switch (permission.scope) {
      case 'all':
        return { allowed: true, reason: 'Scope: all' };

      case 'organization':
        // In a real implementation, check organization membership
        return { allowed: true, reason: 'Scope: organization' };

      case 'team':
        if (!context.teamId) {
          return { allowed: false, reason: 'Team context required but not provided' };
        }
        // In a real implementation, verify user is in the team
        return { allowed: true, reason: 'Scope: team' };

      case 'own':
        if (!context.resourceOwner) {
          return { allowed: false, reason: 'Resource owner information required' };
        }
        if (context.resourceOwner !== request.userId) {
          return { allowed: false, reason: 'Can only access own resources' };
        }
        return { allowed: true, reason: 'Scope: own' };

      default:
        return { allowed: false, reason: 'Unknown scope' };
    }
  }

  /**
   * Check permission conditions
   */
  private checkConditions(
    permission: Permission,
    request: AccessRequest,
    context: AccessContext
  ): { allowed: boolean; reason: string } {
    if (!permission.conditions || permission.conditions.length === 0) {
      return { allowed: true, reason: 'No conditions to check' };
    }

    for (const condition of permission.conditions) {
      const fieldValue = this.getFieldValue(condition.field, request, context);
      const conditionValue = this.resolveValue(condition.value, request, context);

      if (!this.evaluateCondition(fieldValue, condition.operator, conditionValue)) {
        return {
          allowed: false,
          reason: `Condition not met: ${condition.field} ${condition.operator} ${conditionValue}`
        };
      }
    }

    return { allowed: true, reason: 'All conditions met' };
  }

  /**
   * Check resource-specific permissions
   */
  private async checkResourcePermissions(
    request: AccessRequest
  ): Promise<{ allowed: boolean; reason: string }> {
    // Check if there are specific permissions for this resource
    const resourceKey = `${request.resource}:${request.resourceId}`;
    
    // In a real implementation, this would query a database
    // For now, we'll allow access if no specific restrictions exist
    return { allowed: true, reason: 'No resource-specific restrictions' };
  }

  /**
   * Check access conditions (time-based, location-based, etc.)
   */
  private async checkAccessConditions(
    request: AccessRequest
  ): Promise<{ allowed: boolean; reason: string }> {
    // Check time-based conditions
    const timestamp = request.context.timestamp ? new Date(request.context.timestamp) : new Date();
    const hour = timestamp.getHours();

    // Example: Restrict certain actions during off-hours
    if (request.action === 'delete' && (hour < 6 || hour > 22)) {
      return {
        allowed: false,
        reason: 'Delete operations are restricted during off-hours (10 PM - 6 AM)'
      };
    }

    // In a real implementation, check other conditions like:
    // - IP whitelist/blacklist
    // - Geographic restrictions
    // - Risk-based access (unusual activity patterns)
    // - MFA requirements for sensitive operations

    return { allowed: true, reason: 'All access conditions met' };
  }

  /**
   * Get field value from request or context
   */
  private getFieldValue(field: string, request: AccessRequest, context: AccessContext): any {
    if (field.startsWith('context.')) {
      const contextField = field.substring(8);
      return (context as any)[contextField];
    }

    if (field.startsWith('metadata.')) {
      const metadataField = field.substring(9);
      return context.resourceMetadata?.[metadataField];
    }

    // If no prefix, check resourceMetadata first, then context
    if (context.resourceMetadata && field in context.resourceMetadata) {
      return context.resourceMetadata[field];
    }

    if (field in context) {
      return (context as any)[field];
    }

    return undefined;
  }

  /**
   * Resolve value with variable substitution
   */
  private resolveValue(value: any, request: AccessRequest, context: AccessContext): any {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const variable = value.substring(2, value.length - 2);
      
      if (variable === 'userId') {
        return request.userId;
      }
      
      if (variable === 'teamId') {
        return context.teamId;
      }
    }

    return value;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(fieldValue: any, operator: string, conditionValue: any): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === conditionValue;
      
      case 'not_equals':
        return fieldValue !== conditionValue;
      
      case 'contains':
        return String(fieldValue).includes(String(conditionValue));
      
      case 'not_contains':
        return !String(fieldValue).includes(String(conditionValue));
      
      case 'greater_than':
        return Number(fieldValue) > Number(conditionValue);
      
      case 'less_than':
        return Number(fieldValue) < Number(conditionValue);
      
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
      
      case 'not_in':
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
      
      default:
        return false;
    }
  }

  /**
   * Create denied decision
   */
  private createDeniedDecision(reason: string, roles: string[]): AccessDecision {
    return {
      allowed: false,
      reason,
      appliedPolicies: [],
      appliedRoles: roles,
      conditions: []
    };
  }

  /**
   * Audit access decision
   */
  private async auditAccess(request: AccessRequest, decision: AccessDecision): Promise<void> {
    const auditEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      userId: request.userId,
      action: request.action,
      resource: request.resource,
      resourceId: request.resourceId,
      decision: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      context: request.context
    };

    this.auditLog.push(auditEntry);

    // In a real implementation, persist to database
    this.logger.info('Access audited', {
      userId: request.userId,
      decision: decision.allowed ? 'allowed' : 'denied',
      resource: request.resource,
      action: request.action
    });
  }

  /**
   * Add custom role
   */
  addRole(role: RoleDefinition): void {
    this.roleCache.set(role.roleId, role);
    this.logger.info('Role added', { roleId: role.roleId, roleName: role.roleName });
  }

  /**
   * Get role definition
   */
  getRole(roleId: string): RoleDefinition | undefined {
    return this.roleCache.get(roleId);
  }

  /**
   * Get all roles
   */
  getAllRoles(): RoleDefinition[] {
    return Array.from(this.roleCache.values());
  }

  /**
   * Add access policy
   */
  addPolicy(policy: AccessControlPolicy): void {
    this.policies.set(policy.policyId, policy);
    this.logger.info('Policy added', { policyId: policy.policyId, policyName: policy.policyName });
  }

  /**
   * Get audit log
   */
  getAuditLog(filters?: {
    userId?: string;
    resource?: ResourceType;
    startDate?: string;
    endDate?: string;
  }): AuditEntry[] {
    let filtered = this.auditLog;

    if (filters?.userId) {
      filtered = filtered.filter(entry => entry.userId === filters.userId);
    }

    if (filters?.resource) {
      filtered = filtered.filter(entry => entry.resource === filters.resource);
    }

    if (filters?.startDate) {
      filtered = filtered.filter(entry => entry.timestamp >= filters.startDate!);
    }

    if (filters?.endDate) {
      filtered = filtered.filter(entry => entry.timestamp <= filters.endDate!);
    }

    return filtered;
  }
}
