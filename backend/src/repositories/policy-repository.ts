import { DatabaseConnection } from '../database/connection.js';
import { PostgreSqlBaseRepository } from './postgresql-base-repository.js';
import {
  Policy,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  PolicyApproval,
  CreatePolicyApprovalRequest,
  UpdatePolicyApprovalRequest,
  RuleTemplate,
  CreateRuleTemplateRequest,
  UpdateRuleTemplateRequest,
  PolicyExecutionHistory,
  CreatePolicyExecutionRequest,
  PolicyConflict,
  PolicyFilters,
  PaginationOptions,
  PaginatedResult,
  PolicyApprovalStatus,
  PolicyExecutionStats
} from '../models/postgresql.js';

/**
 * Repository for managing policies and rules
 */
export class PolicyRepository extends PostgreSqlBaseRepository {
  constructor(db: DatabaseConnection) {
    super(db);
  }

  // ===== POLICY MANAGEMENT =====

  /**
   * Create a new policy (alias for createPolicy)
   */
  async create(data: CreatePolicyRequest): Promise<Policy> {
    return this.createPolicy(data);
  }

  /**
   * Get policy by name and version
   */
  async getByNameAndVersion(name: string, version: number): Promise<Policy | null> {
    return this.executeQuery('get policy by name and version', async () => {
      const query = `
        SELECT * FROM policies 
        WHERE name = $1 AND version = $2
        LIMIT 1
      `;
      
      return this.queryOne<Policy>(query, [name, version]);
    });
  }

  /**
   * Create a new policy
   */
  async createPolicy(data: CreatePolicyRequest): Promise<Policy> {
    return this.executeQuery('create policy', async () => {
      this.validateRequired(data, ['name', 'policy_json', 'policy_type', 'created_by']);

      const query = `
        INSERT INTO policies (name, description, policy_json, policy_type, severity, applicable_artifacts, team_scope, created_by, effective_from, effective_until)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const params = [
        data.name,
        data.description || null,
        JSON.stringify(data.policy_json),
        data.policy_type,
        data.severity || 'medium',
        data.applicable_artifacts || [],
        data.team_scope || [],
        data.created_by,
        data.effective_from || new Date(),
        data.effective_until || null
      ];

      const result = await this.queryOne<Policy>(query, params);
      if (!result) {
        throw new Error('Failed to create policy');
      }

      return this.convertDbRowToModel<Policy>(result);
    });
  }

  /**
   * Get policy by ID
   */
  async getPolicyById(id: string): Promise<Policy | null> {
    return this.executeQuery('get policy by id', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid policy ID format');
      }

      const query = 'SELECT * FROM policies WHERE id = $1';
      const result = await this.queryOne<Policy>(query, [id]);
      
      return result ? this.convertDbRowToModel<Policy>(result) : null;
    });
  }

  /**
   * Update policy
   */
  async updatePolicy(id: string, data: UpdatePolicyRequest): Promise<Policy | null> {
    return this.executeQuery('update policy', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid policy ID format');
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }
      if (data.policy_json !== undefined) {
        updateFields.push(`policy_json = $${paramIndex++}`);
        params.push(JSON.stringify(data.policy_json));
      }
      if (data.policy_type !== undefined) {
        updateFields.push(`policy_type = $${paramIndex++}`);
        params.push(data.policy_type);
      }
      if (data.severity !== undefined) {
        updateFields.push(`severity = $${paramIndex++}`);
        params.push(data.severity);
      }
      if (data.applicable_artifacts !== undefined) {
        updateFields.push(`applicable_artifacts = $${paramIndex++}`);
        params.push(data.applicable_artifacts);
      }
      if (data.team_scope !== undefined) {
        updateFields.push(`team_scope = $${paramIndex++}`);
        params.push(data.team_scope);
      }
      if (data.effective_from !== undefined) {
        updateFields.push(`effective_from = $${paramIndex++}`);
        params.push(data.effective_from);
      }
      if (data.effective_until !== undefined) {
        updateFields.push(`effective_until = $${paramIndex++}`);
        params.push(data.effective_until);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(id);

      const query = `
        UPDATE policies 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.queryOne<Policy>(query, params);
      return result ? this.convertDbRowToModel<Policy>(result) : null;
    });
  }

  /**
   * Delete policy
   */
  async deletePolicy(id: string): Promise<boolean> {
    return this.executeQuery('delete policy', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid policy ID format');
      }

      const query = 'DELETE FROM policies WHERE id = $1';
      const result = await this.query(query, [id]);
      return result.length > 0;
    });
  }

  /**
   * List policies with filtering and pagination
   */
  async listPolicies(
    filters: PolicyFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Policy>> {
    return this.executeQuery('list policies', async () => {
      let baseQuery = 'SELECT * FROM policies';
      let countQuery = 'SELECT COUNT(*) as count FROM policies';
      
      const queryFilters: Record<string, any> = {};
      
      if (filters.status) queryFilters.status = filters.status;
      if (filters.policy_type) queryFilters.policy_type = filters.policy_type;
      if (filters.severity) queryFilters.severity = filters.severity;
      if (filters.created_by) queryFilters.created_by = filters.created_by;

      // Handle array filters
      if (filters.team_scope) {
        const { whereClause, params, nextIndex } = this.buildWhereClause(queryFilters);
        const teamCondition = `$${nextIndex} = ANY(team_scope)`;
        
        const finalWhereClause = whereClause 
          ? `${whereClause} AND ${teamCondition}`
          : `WHERE ${teamCondition}`;
        
        baseQuery += ` ${finalWhereClause}`;
        countQuery += ` ${finalWhereClause}`;
        
        const orderByClause = this.buildOrderByClause(options);
        const { clause: limitOffsetClause, params: limitOffsetParams } = 
          this.buildLimitOffsetClause(options, params.length + 2);

        const allParams = [...params, filters.team_scope];
        
        // Execute queries
        const countResult = await this.queryOne<{ count: string }>(countQuery, allParams);
        const total = parseInt(countResult?.count || '0');

        const dataQuery = `${baseQuery} ${orderByClause} ${limitOffsetClause}`;
        const data = await this.query<Policy>(dataQuery, [...allParams, ...limitOffsetParams]);

        const limit = options.limit || 50;
        const offset = options.offset || 0;

        return {
          data: this.convertDbRowsToModels<Policy>(data),
          total,
          limit,
          offset,
          has_more: offset + data.length < total
        };
      }

      const result = await this.executePaginatedQuery<Policy>(
        baseQuery,
        countQuery,
        queryFilters,
        options
      );

      return {
        ...result,
        data: this.convertDbRowsToModels<Policy>(result.data)
      };
    });
  }

  /**
   * Get active policies
   */
  async getActivePolicies(): Promise<Policy[]> {
    return this.executeQuery('get active policies', async () => {
      const query = 'SELECT * FROM active_policies ORDER BY name';
      const result = await this.query<Policy>(query);
      return this.convertDbRowsToModels<Policy>(result);
    });
  }

  /**
   * Approve policy
   */
  async approvePolicy(id: string, approvedBy: string): Promise<Policy | null> {
    return this.executeQuery('approve policy', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid policy ID format');
      }

      const query = `
        UPDATE policies 
        SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND status = 'pending_approval'
        RETURNING *
      `;

      const result = await this.queryOne<Policy>(query, [approvedBy, id]);
      return result ? this.convertDbRowToModel<Policy>(result) : null;
    });
  }

  // ===== POLICY APPROVAL WORKFLOW =====

  /**
   * Create policy approval request
   */
  async createPolicyApproval(data: CreatePolicyApprovalRequest): Promise<PolicyApproval> {
    return this.executeQuery('create policy approval', async () => {
      this.validateRequired(data, ['policy_id', 'approver_id']);

      if (!this.isValidUuid(data.policy_id)) {
        throw new Error('Invalid policy ID format');
      }

      const query = `
        INSERT INTO policy_approvals (policy_id, approver_id, approval_level, comments)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const params = [
        data.policy_id,
        data.approver_id,
        data.approval_level || 1,
        data.comments || null
      ];

      const result = await this.queryOne<PolicyApproval>(query, params);
      if (!result) {
        throw new Error('Failed to create policy approval');
      }

      return this.convertDbRowToModel<PolicyApproval>(result);
    });
  }

  /**
   * Update policy approval
   */
  async updatePolicyApproval(id: string, data: UpdatePolicyApprovalRequest): Promise<PolicyApproval | null> {
    return this.executeQuery('update policy approval', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid policy approval ID format');
      }

      const query = `
        UPDATE policy_approvals 
        SET approval_status = $1, comments = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;

      const result = await this.queryOne<PolicyApproval>(query, [
        data.approval_status,
        data.comments || null,
        id
      ]);

      return result ? this.convertDbRowToModel<PolicyApproval>(result) : null;
    });
  }

  /**
   * Get policy approval status
   */
  async getPolicyApprovalStatus(): Promise<PolicyApprovalStatus[]> {
    return this.executeQuery('get policy approval status', async () => {
      const query = 'SELECT * FROM policy_approval_status ORDER BY name';
      const result = await this.query<PolicyApprovalStatus>(query);
      return result;
    });
  }

  // ===== RULE TEMPLATES =====

  /**
   * Create rule template
   */
  async createRuleTemplate(data: CreateRuleTemplateRequest): Promise<RuleTemplate> {
    return this.executeQuery('create rule template', async () => {
      this.validateRequired(data, ['name', 'template_json', 'category', 'created_by']);

      const query = `
        INSERT INTO rule_templates (name, description, template_json, category, parameters, example_usage, created_by, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const params = [
        data.name,
        data.description || null,
        JSON.stringify(data.template_json),
        data.category,
        JSON.stringify(data.parameters || {}),
        JSON.stringify(data.example_usage || {}),
        data.created_by,
        data.is_active !== undefined ? data.is_active : true
      ];

      const result = await this.queryOne<RuleTemplate>(query, params);
      if (!result) {
        throw new Error('Failed to create rule template');
      }

      return this.convertDbRowToModel<RuleTemplate>(result);
    });
  }

  /**
   * Get rule template by ID
   */
  async getRuleTemplateById(id: string): Promise<RuleTemplate | null> {
    return this.executeQuery('get rule template by id', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid rule template ID format');
      }

      const query = 'SELECT * FROM rule_templates WHERE id = $1';
      const result = await this.queryOne<RuleTemplate>(query, [id]);
      
      return result ? this.convertDbRowToModel<RuleTemplate>(result) : null;
    });
  }

  /**
   * Get rule template by name
   */
  async getRuleTemplateByName(name: string): Promise<RuleTemplate | null> {
    return this.executeQuery('get rule template by name', async () => {
      const query = 'SELECT * FROM rule_templates WHERE name = $1';
      const result = await this.queryOne<RuleTemplate>(query, [name]);
      
      return result ? this.convertDbRowToModel<RuleTemplate>(result) : null;
    });
  }

  /**
   * List rule templates
   */
  async listRuleTemplates(
    category?: string,
    isActive?: boolean,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<RuleTemplate>> {
    return this.executeQuery('list rule templates', async () => {
      let baseQuery = 'SELECT * FROM rule_templates';
      let countQuery = 'SELECT COUNT(*) as count FROM rule_templates';
      
      const queryFilters: Record<string, any> = {};
      
      if (category) queryFilters.category = category;
      if (isActive !== undefined) queryFilters.is_active = isActive;

      const result = await this.executePaginatedQuery<RuleTemplate>(
        baseQuery,
        countQuery,
        queryFilters,
        options
      );

      return {
        ...result,
        data: this.convertDbRowsToModels<RuleTemplate>(result.data)
      };
    });
  }

  /**
   * Update rule template
   */
  async updateRuleTemplate(id: string, data: UpdateRuleTemplateRequest): Promise<RuleTemplate | null> {
    return this.executeQuery('update rule template', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid rule template ID format');
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }
      if (data.template_json !== undefined) {
        updateFields.push(`template_json = $${paramIndex++}`);
        params.push(JSON.stringify(data.template_json));
      }
      if (data.category !== undefined) {
        updateFields.push(`category = $${paramIndex++}`);
        params.push(data.category);
      }
      if (data.parameters !== undefined) {
        updateFields.push(`parameters = $${paramIndex++}`);
        params.push(JSON.stringify(data.parameters));
      }
      if (data.example_usage !== undefined) {
        updateFields.push(`example_usage = $${paramIndex++}`);
        params.push(JSON.stringify(data.example_usage));
      }
      if (data.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        params.push(data.is_active);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(id);

      const query = `
        UPDATE rule_templates 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.queryOne<RuleTemplate>(query, params);
      return result ? this.convertDbRowToModel<RuleTemplate>(result) : null;
    });
  }

  // ===== POLICY EXECUTION HISTORY =====

  /**
   * Create policy execution record
   */
  async createPolicyExecution(data: CreatePolicyExecutionRequest): Promise<PolicyExecutionHistory> {
    return this.executeQuery('create policy execution', async () => {
      this.validateRequired(data, ['policy_id', 'artifact_id', 'artifact_type', 'execution_result']);

      if (!this.isValidUuid(data.policy_id)) {
        throw new Error('Invalid policy ID format');
      }

      const query = `
        INSERT INTO policy_execution_history (policy_id, artifact_id, artifact_type, execution_result, score, findings, execution_time_ms, executed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const params = [
        data.policy_id,
        data.artifact_id,
        data.artifact_type,
        data.execution_result,
        data.score || null,
        JSON.stringify(data.findings || []),
        data.execution_time_ms || null,
        data.executed_by || null
      ];

      const result = await this.queryOne<PolicyExecutionHistory>(query, params);
      if (!result) {
        throw new Error('Failed to create policy execution record');
      }

      return this.convertDbRowToModel<PolicyExecutionHistory>(result);
    });
  }

  /**
   * Get policy execution statistics
   */
  async getPolicyExecutionStats(): Promise<PolicyExecutionStats[]> {
    return this.executeQuery('get policy execution stats', async () => {
      const query = 'SELECT * FROM policy_execution_stats ORDER BY name';
      const result = await this.query<PolicyExecutionStats>(query);
      return result;
    });
  }

  /**
   * Get policy execution history for artifact
   */
  async getPolicyExecutionHistory(
    artifactId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<PolicyExecutionHistory>> {
    return this.executeQuery('get policy execution history', async () => {
      const baseQuery = 'SELECT * FROM policy_execution_history';
      const countQuery = 'SELECT COUNT(*) as count FROM policy_execution_history';
      
      const result = await this.executePaginatedQuery<PolicyExecutionHistory>(
        baseQuery,
        countQuery,
        { artifact_id: artifactId },
        options
      );

      return {
        ...result,
        data: this.convertDbRowsToModels<PolicyExecutionHistory>(result.data)
      };
    });
  }

  // ===== POLICY CONFLICTS =====

  /**
   * Detect policy conflicts
   */
  async detectPolicyConflicts(): Promise<PolicyConflict[]> {
    return this.executeQuery('detect policy conflicts', async () => {
      // This is a simplified conflict detection - in practice, this would be more sophisticated
      const query = `
        SELECT 
          uuid_generate_v4() as id,
          p1.id as policy_a_id,
          p2.id as policy_b_id,
          'overlapping' as conflict_type,
          'Policies have overlapping artifact types and team scopes' as conflict_description,
          'medium' as severity,
          'unresolved' as resolution_status,
          NOW() as detected_at,
          NULL as resolved_at,
          NULL as resolved_by
        FROM policies p1
        JOIN policies p2 ON p1.id < p2.id
        WHERE p1.status = 'active' 
          AND p2.status = 'active'
          AND p1.applicable_artifacts && p2.applicable_artifacts
          AND p1.team_scope && p2.team_scope
          AND p1.policy_type = p2.policy_type
      `;

      const result = await this.query<PolicyConflict>(query);
      return this.convertDbRowsToModels<PolicyConflict>(result);
    });
  }

  /**
   * Get policy statistics
   */
  async getPolicyStatistics(): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
    active_templates: number;
  }> {
    return this.executeQuery('get policy statistics', async () => {
      const [totalResult, statusResult, typeResult, severityResult, templatesResult] = await Promise.all([
        this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM policies'),
        this.query<{ status: string; count: string }>(`
          SELECT status, COUNT(*) as count 
          FROM policies 
          GROUP BY status 
          ORDER BY status
        `),
        this.query<{ policy_type: string; count: string }>(`
          SELECT policy_type, COUNT(*) as count 
          FROM policies 
          GROUP BY policy_type 
          ORDER BY count DESC
        `),
        this.query<{ severity: string; count: string }>(`
          SELECT severity, COUNT(*) as count 
          FROM policies 
          GROUP BY severity 
          ORDER BY 
            CASE severity 
              WHEN 'critical' THEN 1 
              WHEN 'high' THEN 2 
              WHEN 'medium' THEN 3 
              WHEN 'low' THEN 4 
            END
        `),
        this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM rule_templates WHERE is_active = true')
      ]);

      const total = parseInt(totalResult?.count || '0');
      const active_templates = parseInt(templatesResult?.count || '0');
      
      const by_status: Record<string, number> = {};
      statusResult.forEach(row => {
        by_status[row.status] = parseInt(row.count);
      });

      const by_type: Record<string, number> = {};
      typeResult.forEach(row => {
        by_type[row.policy_type] = parseInt(row.count);
      });

      const by_severity: Record<string, number> = {};
      severityResult.forEach(row => {
        by_severity[row.severity] = parseInt(row.count);
      });

      return { total, by_status, by_type, by_severity, active_templates };
    });
  }
}