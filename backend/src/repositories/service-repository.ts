import { DatabaseConnection } from '../database/connection.js';
import { PostgreSqlBaseRepository } from './postgresql-base-repository.js';
import {
  Service,
  CreateServiceRequest,
  UpdateServiceRequest,
  ServiceFilters,
  PaginationOptions,
  PaginatedResult,
  ServiceDependencySummary
} from '../models/postgresql.js';

/**
 * Repository for managing services in the dependency graph
 */
export class ServiceRepository extends PostgreSqlBaseRepository {
  constructor(db: DatabaseConnection) {
    super(db);
  }

  /**
   * Create a new service
   */
  async create(data: CreateServiceRequest): Promise<Service> {
    return this.executeQuery('create service', async () => {
      this.validateRequired(data, ['name', 'team_id']);

      const query = `
        INSERT INTO services (name, team_id, repository_url, description, service_type, status, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const params = [
        data.name,
        data.team_id,
        data.repository_url || null,
        data.description || null,
        data.service_type || null,
        data.status || 'active',
        JSON.stringify(data.metadata || {})
      ];

      const result = await this.queryOne<Service>(query, params);
      if (!result) {
        throw new Error('Failed to create service');
      }

      return this.convertDbRowToModel<Service>(result);
    });
  }

  /**
   * Get service by ID
   */
  async getById(id: string): Promise<Service | null> {
    return this.executeQuery('get service by id', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid service ID format');
      }

      const query = 'SELECT * FROM services WHERE id = $1';
      const result = await this.queryOne<Service>(query, [id]);
      
      return result ? this.convertDbRowToModel<Service>(result) : null;
    });
  }

  /**
   * Get service by name
   */
  async getByName(name: string): Promise<Service | null> {
    return this.executeQuery('get service by name', async () => {
      const query = 'SELECT * FROM services WHERE name = $1 LIMIT 1';
      return this.queryOne<Service>(query, [name]);
    });
  }

  /**
   * Get service by name and team
   */
  async getByNameAndTeam(name: string, teamId: string): Promise<Service | null> {
    return this.executeQuery('get service by name and team', async () => {
      const query = 'SELECT * FROM services WHERE name = $1 AND team_id = $2';
      const result = await this.queryOne<Service>(query, [name, teamId]);
      
      return result ? this.convertDbRowToModel<Service>(result) : null;
    });
  }

  /**
   * Update service
   */
  async update(id: string, data: UpdateServiceRequest): Promise<Service | null> {
    return this.executeQuery('update service', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid service ID format');
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        params.push(data.name);
      }
      if (data.repository_url !== undefined) {
        updateFields.push(`repository_url = $${paramIndex++}`);
        params.push(data.repository_url);
      }
      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }
      if (data.service_type !== undefined) {
        updateFields.push(`service_type = $${paramIndex++}`);
        params.push(data.service_type);
      }
      if (data.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(data.status);
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
        UPDATE services 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.queryOne<Service>(query, params);
      return result ? this.convertDbRowToModel<Service>(result) : null;
    });
  }

  /**
   * Delete service
   */
  async delete(id: string): Promise<boolean> {
    return this.executeQuery('delete service', async () => {
      if (!this.isValidUuid(id)) {
        throw new Error('Invalid service ID format');
      }

      const query = 'DELETE FROM services WHERE id = $1';
      const result = await this.query(query, [id]);
      return result.length > 0;
    });
  }

  /**
   * List services with filtering and pagination
   */
  async list(
    filters: ServiceFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Service>> {
    return this.executeQuery('list services', async () => {
      let baseQuery = 'SELECT * FROM services';
      let countQuery = 'SELECT COUNT(*) as count FROM services';
      
      const queryFilters: Record<string, any> = {};
      
      if (filters.team_id) queryFilters.team_id = filters.team_id;
      if (filters.service_type) queryFilters.service_type = filters.service_type;
      if (filters.status) queryFilters.status = filters.status;

      // Handle search across name and description
      if (filters.search) {
        const { whereClause, params, nextIndex } = this.buildWhereClause(queryFilters);
        const searchCondition = `(name ILIKE $${nextIndex} OR description ILIKE $${nextIndex + 1})`;
        const searchParams = [`%${filters.search}%`, `%${filters.search}%`];
        
        const finalWhereClause = whereClause 
          ? `${whereClause} AND ${searchCondition}`
          : `WHERE ${searchCondition}`;
        
        baseQuery += ` ${finalWhereClause}`;
        countQuery += ` ${finalWhereClause}`;
        
        const orderByClause = this.buildOrderByClause(options);
        const { clause: limitOffsetClause, params: limitOffsetParams } = 
          this.buildLimitOffsetClause(options, params.length + searchParams.length + 1);

        const allParams = [...params, ...searchParams];
        
        // Execute queries
        const countResult = await this.queryOne<{ count: string }>(countQuery, allParams);
        const total = parseInt(countResult?.count || '0');

        const dataQuery = `${baseQuery} ${orderByClause} ${limitOffsetClause}`;
        const data = await this.query<Service>(dataQuery, [...allParams, ...limitOffsetParams]);

        const limit = options.limit || 50;
        const offset = options.offset || 0;

        return {
          data: this.convertDbRowsToModels<Service>(data),
          total,
          limit,
          offset,
          has_more: offset + data.length < total
        };
      }

      const result = await this.executePaginatedQuery<Service>(
        baseQuery,
        countQuery,
        queryFilters,
        options
      );

      return {
        ...result,
        data: this.convertDbRowsToModels<Service>(result.data)
      };
    });
  }

  /**
   * Get services by team ID
   */
  async getByTeamId(teamId: string): Promise<Service[]> {
    return this.executeQuery('get services by team', async () => {
      const query = 'SELECT * FROM services WHERE team_id = $1 ORDER BY name';
      const result = await this.query<Service>(query, [teamId]);
      return this.convertDbRowsToModels<Service>(result);
    });
  }

  /**
   * Get service dependency summary
   */
  async getDependencySummary(
    filters: ServiceFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ServiceDependencySummary>> {
    return this.executeQuery('get service dependency summary', async () => {
      let baseQuery = 'SELECT * FROM service_dependency_summary';
      let countQuery = 'SELECT COUNT(*) as count FROM service_dependency_summary';
      
      const queryFilters: Record<string, any> = {};
      
      if (filters.team_id) queryFilters.team_id = filters.team_id;
      if (filters.service_type) queryFilters.service_type = filters.service_type;
      if (filters.status) queryFilters.status = filters.status;

      const result = await this.executePaginatedQuery<ServiceDependencySummary>(
        baseQuery,
        countQuery,
        queryFilters,
        options
      );

      return result;
    });
  }

  /**
   * Get services with critical dependencies
   */
  async getServicesWithCriticalDependencies(): Promise<ServiceDependencySummary[]> {
    return this.executeQuery('get services with critical dependencies', async () => {
      const query = `
        SELECT * FROM service_dependency_summary 
        WHERE has_critical_outgoing = true OR has_critical_incoming = true
        ORDER BY name
      `;
      
      const result = await this.query<ServiceDependencySummary>(query);
      return result;
    });
  }

  /**
   * Search services by name or description
   */
  async search(searchTerm: string, limit: number = 10): Promise<Service[]> {
    return this.executeQuery('search services', async () => {
      const query = `
        SELECT * FROM services 
        WHERE (name ILIKE $1 OR description ILIKE $1) 
        AND status = 'active'
        ORDER BY 
          CASE WHEN name ILIKE $1 THEN 1 ELSE 2 END,
          name
        LIMIT $2
      `;
      
      const searchPattern = `%${searchTerm}%`;
      const result = await this.query<Service>(query, [searchPattern, limit]);
      return this.convertDbRowsToModels<Service>(result);
    });
  }

  /**
   * Get service statistics
   */
  async getStatistics(): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_team: Record<string, number>;
    by_type: Record<string, number>;
  }> {
    return this.executeQuery('get service statistics', async () => {
      const [totalResult, statusResult, teamResult, typeResult] = await Promise.all([
        this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM services'),
        this.query<{ status: string; count: string }>(`
          SELECT status, COUNT(*) as count 
          FROM services 
          GROUP BY status 
          ORDER BY status
        `),
        this.query<{ team_id: string; count: string }>(`
          SELECT team_id, COUNT(*) as count 
          FROM services 
          GROUP BY team_id 
          ORDER BY count DESC 
          LIMIT 10
        `),
        this.query<{ service_type: string; count: string }>(`
          SELECT service_type, COUNT(*) as count 
          FROM services 
          WHERE service_type IS NOT NULL
          GROUP BY service_type 
          ORDER BY count DESC
        `)
      ]);

      const total = parseInt(totalResult?.count || '0');
      
      const by_status: Record<string, number> = {};
      statusResult.forEach(row => {
        by_status[row.status] = parseInt(row.count);
      });

      const by_team: Record<string, number> = {};
      teamResult.forEach(row => {
        by_team[row.team_id] = parseInt(row.count);
      });

      const by_type: Record<string, number> = {};
      typeResult.forEach(row => {
        by_type[row.service_type] = parseInt(row.count);
      });

      return { total, by_status, by_team, by_type };
    });
  }
}