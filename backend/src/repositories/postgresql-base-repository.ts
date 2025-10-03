import { PoolClient } from 'pg';
import { DatabaseConnection } from '../database/connection.js';
import { PaginationOptions, PaginatedResult } from '../models/postgresql.js';

/**
 * Base repository class for PostgreSQL operations
 * Provides common functionality for all PostgreSQL repositories
 */
export abstract class PostgreSqlBaseRepository {
  protected db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Execute a query with parameters
   */
  protected async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    return this.db.query<T>(text, params);
  }

  /**
   * Execute a query and return a single result
   */
  protected async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    return this.db.queryOne<T>(text, params);
  }

  /**
   * Execute multiple queries in a transaction
   */
  protected async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(callback);
  }

  /**
   * Build WHERE clause from filters
   */
  protected buildWhereClause(
    filters: Record<string, any>,
    startIndex: number = 1
  ): { whereClause: string; params: any[]; nextIndex: number } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = startIndex;

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        if (key === 'search') {
          // Handle search across multiple text fields
          continue; // Will be handled separately by each repository
        } else if (Array.isArray(value)) {
          conditions.push(`${key} = ANY($${paramIndex})`);
          params.push(value);
        } else {
          conditions.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    return {
      whereClause,
      params,
      nextIndex: paramIndex
    };
  }

  /**
   * Build ORDER BY clause from pagination options
   */
  protected buildOrderByClause(options: PaginationOptions): string {
    const sortBy = options.sort_by || 'created_at';
    const sortOrder = options.sort_order || 'desc';
    return `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
  }

  /**
   * Build LIMIT and OFFSET clause from pagination options
   */
  protected buildLimitOffsetClause(
    options: PaginationOptions,
    paramIndex: number
  ): { clause: string; params: any[]; nextIndex: number } {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    return {
      clause: `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params: [limit, offset],
      nextIndex: paramIndex + 2
    };
  }

  /**
   * Execute a paginated query
   */
  protected async executePaginatedQuery<T>(
    baseQuery: string,
    countQuery: string,
    filters: Record<string, any>,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    const { whereClause, params } = this.buildWhereClause(filters);
    const orderByClause = this.buildOrderByClause(options);
    const { clause: limitOffsetClause, params: limitOffsetParams } = 
      this.buildLimitOffsetClause(options, params.length + 1);

    // Execute count query
    const countQueryWithWhere = `${countQuery} ${whereClause}`;
    const countResult = await this.queryOne<{ count: string }>(countQueryWithWhere, params);
    const total = parseInt(countResult?.count || '0');

    // Execute data query
    const dataQuery = `${baseQuery} ${whereClause} ${orderByClause} ${limitOffsetClause}`;
    const data = await this.query<T>(dataQuery, [...params, ...limitOffsetParams]);

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    return {
      data,
      total,
      limit,
      offset,
      has_more: offset + data.length < total
    };
  }

  /**
   * Validate UUID format
   */
  protected isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate required fields
   */
  protected validateRequired(data: Record<string, any>, requiredFields: string[]): void {
    const missingFields = requiredFields.filter(field => 
      data[field] === undefined || data[field] === null || data[field] === ''
    );

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Convert database row to model (handles date conversion, etc.)
   */
  protected convertDbRowToModel<T>(row: any): T {
    const converted = { ...row };
    
    // Convert date strings to Date objects
    for (const [key, value] of Object.entries(converted)) {
      if (value && typeof value === 'string' && key.endsWith('_at')) {
        converted[key] = new Date(value);
      }
    }

    return converted as T;
  }

  /**
   * Convert array of database rows to models
   */
  protected convertDbRowsToModels<T>(rows: any[]): T[] {
    return rows.map(row => this.convertDbRowToModel<T>(row));
  }

  /**
   * Handle database errors and convert to application errors
   */
  protected handleDatabaseError(error: any, operation: string): never {
    console.error(`Database error during ${operation}:`, error);

    // Handle specific PostgreSQL error codes
    if (error.code) {
      switch (error.code) {
        case '23505': // unique_violation
          throw new Error('A record with this information already exists');
        case '23503': // foreign_key_violation
          throw new Error('Referenced record does not exist');
        case '23502': // not_null_violation
          throw new Error('Required field is missing');
        case '23514': // check_violation
          throw new Error('Invalid data provided');
        case '42P01': // undefined_table
          throw new Error('Database table not found - database may not be initialized');
        default:
          throw new Error(`Database operation failed: ${error.message}`);
      }
    }

    throw new Error(`Database operation failed during ${operation}: ${error.message}`);
  }

  /**
   * Execute a query with error handling
   */
  protected async executeQuery<T>(
    operation: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    try {
      return await queryFn();
    } catch (error) {
      this.handleDatabaseError(error, operation);
    }
  }
}