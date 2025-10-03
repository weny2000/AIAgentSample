import { DatabaseConnection } from '../database/connection.js';
import { PostgreSqlBaseRepository } from './postgresql-base-repository.js';
import {
  Dependency,
  CreateDependencyRequest,
  UpdateDependencyRequest,
  DependencyFilters,
  PaginationOptions,
  PaginatedResult,
  CrossTeamDependency
} from '../models/postgresql.js';

/**
 * Repository for managing dependencies between services
 */
export class DependencyRepository extends PostgreSqlBaseRepository {
  constructor(db: DatabaseConnection) {
    super(db);
  }

  /**
   * Create a new dependency
   */
  async create(data: CreateDependencyRequest): Promise<Dependency> {
    return this.executeQuery('create dependency', async () => {
      this.validateRequired(data, ['source_service_id', 'target_service_id', 'dependency_type']);

      if (data.source_service_id === data.target_service_id) {
        throw new Error('Service cannot depend on itself');
      }

      if (!this.isValidUuid(data.source_service_id) || !this.isValidUuid(data.target_service_id)) {
        throw new Error('Invalid service ID format');
      }

      const query = `
        INSERT INTO dependencies (source_service_id, target_service_id, dependency_type, criticality, description, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const params = [
        data.source_service_id,
        data.target_service_id,
        data.dependency_type,
        data.criticality || 'medium',
        data.description || null,
        JSON.stringify(data.metadata || {})
      ];

      const result = await this.queryOne<Dependency>(query, params);
      if (!result) {
        throw new Error('Failed to create dependency');
      }

      return this.convertDbRowToModel<Dependency>(result);
    });
  }

  /**
   * Get dependency by ID
   */
  async getById(id: string): Promise<Dependency | null> {
    return this.executeQuery('get dependency by id', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid dependency ID format');
      }

      const query = 'SELECT * FROM dependencies WHERE id = $1';
      const result = await this.queryOne<Dependency>(query, [id]);
      
      return result ? this.convertDbRowToModel<Dependency>(result) : null;
    });
  }

  /**
   * Update dependency
   */
  async update(id: string, data: UpdateDependencyRequest): Promise<Dependency | null> {
    return this.executeQuery('update dependency', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid dependency ID format');
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.dependency_type !== undefined) {
        updateFields.push(`dependency_type = $${paramIndex++}`);
        params.push(data.dependency_type);
      }
      if (data.criticality !== undefined) {
        updateFields.push(`criticality = $${paramIndex++}`);
        params.push(data.criticality);
      }
      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }
      if (data.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex++}`);
        params.push(JSON.stringify(data.metadata));
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(id);

      const query = `
        UPDATE dependencies 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.queryOne<Dependency>(query, params);
      return result ? this.convertDbRowToModel<Dependency>(result) : null;
    });
  }

  /**
   * Delete dependency
   */
  async delete(id: string): Promise<boolean> {
    return this.executeQuery('delete dependency', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid dependency ID format');
      }

      const query = 'DELETE FROM dependencies WHERE id = $1';
      const result = await this.query(query, [id]);
      return result.length > 0;
    });
  }

  /**
   * List dependencies with filtering and pagination
   */
  async list(
    filters: DependencyFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Dependency>> {
    return this.executeQuery('list dependencies', async () => {
      let baseQuery = 'SELECT * FROM dependencies';
      let countQuery = 'SELECT COUNT(*) as count FROM dependencies';
      
      const queryFilters: Record<string, any> = {};
      
      if (filters.source_service_id) queryFilters.source_service_id = filters.source_service_id;
      if (filters.target_service_id) queryFilters.target_service_id = filters.target_service_id;
      if (filters.dependency_type) queryFilters.dependency_type = filters.dependency_type;
      if (filters.criticality) queryFilters.criticality = filters.criticality;

      // Handle team-based filtering
      if (filters.team_id) {
        const teamCondition = `
          (source_service_id IN (SELECT id FROM services WHERE team_id = $TEAM_PARAM) OR
           target_service_id IN (SELECT id FROM services WHERE team_id = $TEAM_PARAM))
        `;
        
        const { whereClause, params } = this.buildWhereClause(queryFilters);
        const teamParamIndex = params.length + 1;
        
        const finalWhereClause = whereClause 
          ? `${whereClause} AND ${teamCondition.replace(/\$TEAM_PARAM/g, `$${teamParamIndex}`)}`
          : `WHERE ${teamCondition.replace(/\$TEAM_PARAM/g, `$${teamParamIndex}`)}`;
        
        baseQuery += ` ${finalWhereClause}`;
        countQuery += ` ${finalWhereClause}`;
        
        const orderByClause = this.buildOrderByClause(options);
        const { clause: limitOffsetClause, params: limitOffsetParams } = 
          this.buildLimitOffsetClause(options, params.length + 2);

        const allParams = [...params, filters.team_id];
        
        // Execute queries
        const countResult = await this.queryOne<{ count: string }>(countQuery, allParams);
        const total = parseInt(countResult?.count || '0');

        const dataQuery = `${baseQuery} ${orderByClause} ${limitOffsetClause}`;
        const data = await this.query<Dependency>(dataQuery, [...allParams, ...limitOffsetParams]);

        const limit = options.limit || 50;
        const offset = options.offset || 0;

        return {
          data: this.convertDbRowsToModels<Dependency>(data),
          total,
          limit,
          offset,
          has_more: offset + data.length < total
        };
      }

      const result = await this.executePaginatedQuery<Dependency>(
        baseQuery,
        countQuery,
        queryFilters,
        options
      );

      return {
        ...result,
        data: this.convertDbRowsToModels<Dependency>(result.data)
      };
    });
  }

  /**
   * Get dependencies for a specific service (both incoming and outgoing)
   */
  async getByServiceId(serviceId: string): Promise<{
    incoming: Dependency[];
    outgoing: Dependency[];
  }> {
    return this.executeQuery('get dependencies by service id', async () => {
      if (!this.isValidUuid(serviceId)) {
        throw new Error('Invalid service ID format');
      }

      const [incoming, outgoing] = await Promise.all([
        this.query<Dependency>('SELECT * FROM dependencies WHERE target_service_id = $1 ORDER BY criticality DESC, created_at DESC', [serviceId]),
        this.query<Dependency>('SELECT * FROM dependencies WHERE source_service_id = $1 ORDER BY criticality DESC, created_at DESC', [serviceId])
      ]);

      return {
        incoming: this.convertDbRowsToModels<Dependency>(incoming),
        outgoing: this.convertDbRowsToModels<Dependency>(outgoing)
      };
    });
  }

  /**
   * Get cross-team dependencies
   */
  async getCrossTeamDependencies(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<CrossTeamDependency>> {
    return this.executeQuery('get cross-team dependencies', async () => {
      const baseQuery = 'SELECT * FROM cross_team_dependencies';
      const countQuery = 'SELECT COUNT(*) as count FROM cross_team_dependencies';
      
      const result = await this.executePaginatedQuery<CrossTeamDependency>(
        baseQuery,
        countQuery,
        {},
        options
      );

      return result;
    });
  }

  /**
   * Get critical dependencies
   */
  async getCriticalDependencies(): Promise<Dependency[]> {
    return this.executeQuery('get critical dependencies', async () => {
      const query = `
        SELECT * FROM dependencies 
        WHERE criticality = 'critical'
        ORDER BY created_at DESC
      `;
      
      const result = await this.query<Dependency>(query);
      return this.convertDbRowsToModels<Dependency>(result);
    });
  }

  /**
   * Find circular dependencies
   */
  async findCircularDependencies(): Promise<{
    cycles: Array<{
      services: string[];
      dependencies: string[];
    }>;
  }> {
    return this.executeQuery('find circular dependencies', async () => {
      // Use recursive CTE to find cycles
      const query = `
        WITH RECURSIVE dependency_path AS (
          -- Base case: start with each dependency
          SELECT 
            source_service_id,
            target_service_id,
            ARRAY[source_service_id] as path,
            ARRAY[id::text] as dependency_path,
            1 as depth
          FROM dependencies
          
          UNION ALL
          
          -- Recursive case: extend the path
          SELECT 
            dp.source_service_id,
            d.target_service_id,
            dp.path || d.source_service_id,
            dp.dependency_path || d.id::text,
            dp.depth + 1
          FROM dependency_path dp
          JOIN dependencies d ON dp.target_service_id = d.source_service_id
          WHERE dp.depth < 10 -- Prevent infinite recursion
            AND NOT (d.source_service_id = ANY(dp.path)) -- Avoid cycles in path building
        )
        SELECT DISTINCT
          path || target_service_id as services,
          dependency_path as dependencies
        FROM dependency_path
        WHERE target_service_id = source_service_id -- Found a cycle
          AND depth > 1
        ORDER BY array_length(path, 1)
      `;

      const result = await this.query<{
        services: string[];
        dependencies: string[];
      }>(query);

      return { cycles: result };
    });
  }

  /**
   * Get dependency impact analysis for a service
   */
  async getImpactAnalysis(serviceId: string, maxDepth: number = 3): Promise<{
    downstream: Array<{
      service_id: string;
      service_name: string;
      team_id: string;
      depth: number;
      path: string[];
      criticality: string;
    }>;
    upstream: Array<{
      service_id: string;
      service_name: string;
      team_id: string;
      depth: number;
      path: string[];
      criticality: string;
    }>;
  }> {
    return this.executeQuery('get impact analysis', async () => {
      if (!this.isValidUuid(serviceId)) {
        throw new Error('Invalid service ID format');
      }

      // Downstream impact (services that depend on this service)
      const downstreamQuery = `
        WITH RECURSIVE downstream_impact AS (
          -- Base case: direct dependencies
          SELECT 
            d.source_service_id as service_id,
            s.name as service_name,
            s.team_id,
            1 as depth,
            ARRAY[d.target_service_id, d.source_service_id] as path,
            d.criticality
          FROM dependencies d
          JOIN services s ON d.source_service_id = s.id
          WHERE d.target_service_id = $1
          
          UNION ALL
          
          -- Recursive case: indirect dependencies
          SELECT 
            d.source_service_id as service_id,
            s.name as service_name,
            s.team_id,
            di.depth + 1,
            di.path || d.source_service_id,
            CASE 
              WHEN d.criticality = 'critical' OR di.criticality = 'critical' THEN 'critical'
              WHEN d.criticality = 'high' OR di.criticality = 'high' THEN 'high'
              WHEN d.criticality = 'medium' OR di.criticality = 'medium' THEN 'medium'
              ELSE 'low'
            END as criticality
          FROM downstream_impact di
          JOIN dependencies d ON di.service_id = d.target_service_id
          JOIN services s ON d.source_service_id = s.id
          WHERE di.depth < $2
            AND NOT (d.source_service_id = ANY(di.path)) -- Prevent cycles
        )
        SELECT DISTINCT * FROM downstream_impact
        ORDER BY depth, criticality DESC, service_name
      `;

      // Upstream impact (services this service depends on)
      const upstreamQuery = `
        WITH RECURSIVE upstream_impact AS (
          -- Base case: direct dependencies
          SELECT 
            d.target_service_id as service_id,
            s.name as service_name,
            s.team_id,
            1 as depth,
            ARRAY[d.source_service_id, d.target_service_id] as path,
            d.criticality
          FROM dependencies d
          JOIN services s ON d.target_service_id = s.id
          WHERE d.source_service_id = $1
          
          UNION ALL
          
          -- Recursive case: indirect dependencies
          SELECT 
            d.target_service_id as service_id,
            s.name as service_name,
            s.team_id,
            ui.depth + 1,
            ui.path || d.target_service_id,
            CASE 
              WHEN d.criticality = 'critical' OR ui.criticality = 'critical' THEN 'critical'
              WHEN d.criticality = 'high' OR ui.criticality = 'high' THEN 'high'
              WHEN d.criticality = 'medium' OR ui.criticality = 'medium' THEN 'medium'
              ELSE 'low'
            END as criticality
          FROM upstream_impact ui
          JOIN dependencies d ON ui.service_id = d.source_service_id
          JOIN services s ON d.target_service_id = s.id
          WHERE ui.depth < $2
            AND NOT (d.target_service_id = ANY(ui.path)) -- Prevent cycles
        )
        SELECT DISTINCT * FROM upstream_impact
        ORDER BY depth, criticality DESC, service_name
      `;

      const [downstream, upstream] = await Promise.all([
        this.query(downstreamQuery, [serviceId, maxDepth]),
        this.query(upstreamQuery, [serviceId, maxDepth])
      ]);

      return { downstream, upstream };
    });
  }

  /**
   * Get dependency statistics
   */
  async getStatistics(): Promise<{
    total: number;
    by_type: Record<string, number>;
    by_criticality: Record<string, number>;
    cross_team_count: number;
    circular_dependencies_count: number;
  }> {
    return this.executeQuery('get dependency statistics', async () => {
      const [totalResult, typeResult, criticalityResult, crossTeamResult] = await Promise.all([
        this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM dependencies'),
        this.query<{ dependency_type: string; count: string }>(`
          SELECT dependency_type, COUNT(*) as count 
          FROM dependencies 
          GROUP BY dependency_type 
          ORDER BY count DESC
        `),
        this.query<{ criticality: string; count: string }>(`
          SELECT criticality, COUNT(*) as count 
          FROM dependencies 
          GROUP BY criticality 
          ORDER BY 
            CASE criticality 
              WHEN 'critical' THEN 1 
              WHEN 'high' THEN 2 
              WHEN 'medium' THEN 3 
              WHEN 'low' THEN 4 
            END
        `),
        this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM cross_team_dependencies')
      ]);

      const total = parseInt(totalResult?.count || '0');
      const cross_team_count = parseInt(crossTeamResult?.count || '0');

      const by_type: Record<string, number> = {};
      typeResult.forEach(row => {
        by_type[row.dependency_type] = parseInt(row.count);
      });

      const by_criticality: Record<string, number> = {};
      criticalityResult.forEach(row => {
        by_criticality[row.criticality] = parseInt(row.count);
      });

      // Get circular dependencies count
      const circularResult = await this.findCircularDependencies();
      const circular_dependencies_count = circularResult.cycles.length;

      return { 
        total, 
        by_type, 
        by_criticality, 
        cross_team_count,
        circular_dependencies_count
      };
    });
  }
}