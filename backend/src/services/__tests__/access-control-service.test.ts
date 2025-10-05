/**
 * Tests for Access Control Service
 */

import { AccessControlService, AccessRequest } from '../access-control-service';

describe('AccessControlService', () => {
  let service: AccessControlService;

  beforeEach(() => {
    service = new AccessControlService();
  });

  describe('checkAccess', () => {
    it('should allow admin full access', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['admin'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'delete',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(true);
      expect(decision.appliedRoles).toContain('admin');
    });

    it('should allow team lead to manage team tasks', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['team_lead'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'approve',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(true);
    });

    it('should allow contributor to access own tasks', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['contributor'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'update',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789',
          resourceOwner: 'user-123'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(true);
    });

    it('should deny contributor access to others tasks', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['contributor'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'update',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789',
          resourceOwner: 'user-999'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('own resources');
    });

    it('should deny access for missing permissions', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['viewer'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'delete',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('No permission found');
    });

    it('should allow reviewer to approve deliverables', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['reviewer'],
        resource: 'deliverable',
        resourceId: 'deliv-456',
        action: 'approve',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(true);
    });

    it('should restrict delete operations during off-hours', async () => {
      // Create a date during off-hours (2 AM)
      const offHoursDate = new Date();
      offHoursDate.setHours(2, 0, 0, 0);

      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['admin'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'delete',
        context: {
          timestamp: offHoursDate.toISOString(),
          teamId: 'team-789'
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('off-hours');
    });
  });

  describe('role management', () => {
    it('should add custom role', () => {
      const customRole = {
        roleId: 'custom-role',
        roleName: 'Custom Role',
        description: 'Custom role for testing',
        permissions: [
          {
            resource: 'work_task' as const,
            actions: ['read' as const],
            scope: 'team' as const
          }
        ],
        priority: 40
      };

      service.addRole(customRole);

      const retrieved = service.getRole('custom-role');
      expect(retrieved).toBeDefined();
      expect(retrieved?.roleName).toBe('Custom Role');
    });

    it('should list all roles', () => {
      const roles = service.getAllRoles();

      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some(r => r.roleId === 'admin')).toBe(true);
      expect(roles.some(r => r.roleId === 'contributor')).toBe(true);
    });
  });

  describe('audit logging', () => {
    it('should log access decisions', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['contributor'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'read',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789',
          resourceOwner: 'user-123'
        }
      };

      await service.checkAccess(request);

      const auditLog = service.getAuditLog({ userId: 'user-123' });

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].userId).toBe('user-123');
      expect(auditLog[0].resource).toBe('work_task');
      expect(auditLog[0].action).toBe('read');
    });

    it('should filter audit log by resource', async () => {
      const request1: AccessRequest = {
        userId: 'user-123',
        userRoles: ['contributor'],
        resource: 'work_task',
        resourceId: 'task-456',
        action: 'read',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789',
          resourceOwner: 'user-123'
        }
      };

      const request2: AccessRequest = {
        userId: 'user-123',
        userRoles: ['contributor'],
        resource: 'deliverable',
        resourceId: 'deliv-789',
        action: 'create',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789',
          resourceOwner: 'user-123'
        }
      };

      await service.checkAccess(request1);
      await service.checkAccess(request2);

      const workTaskLog = service.getAuditLog({ resource: 'work_task' });
      const deliverableLog = service.getAuditLog({ resource: 'deliverable' });

      expect(workTaskLog.every(entry => entry.resource === 'work_task')).toBe(true);
      expect(deliverableLog.every(entry => entry.resource === 'deliverable')).toBe(true);
    });
  });

  describe('permission conditions', () => {
    it('should evaluate conditions correctly', async () => {
      const request: AccessRequest = {
        userId: 'user-123',
        userRoles: ['contributor'],
        resource: 'todo_item',
        resourceId: 'todo-456',
        action: 'update',
        context: {
          timestamp: new Date().toISOString(),
          teamId: 'team-789',
          resourceOwner: 'user-123',
          resourceMetadata: {
            assigned_to: 'user-123'
          }
        }
      };

      const decision = await service.checkAccess(request);

      expect(decision.allowed).toBe(true);
    });
  });
});
