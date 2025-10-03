/**
 * Base interface for all DynamoDB items
 */
export interface DynamoDBItem {
  [key: string]: any;
}

/**
 * Paginated response interface for repository queries
 */
export interface PaginatedResponse<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
  scannedCount: number;
}

/**
 * Common timestamp fields
 */
export interface TimestampFields {
  created_at: string;
  updated_at: string;
}

/**
 * Base entity interface
 */
export interface BaseEntity extends TimestampFields {
  id: string;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    request_id?: string;
    execution_time_ms?: number;
  };
}

/**
 * Error response interface
 */
export interface ErrorResponse {
  error_code: string;
  message: string;
  details?: Record<string, any>;
  retry_after?: number;
  correlation_id: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
}

/**
 * Sort parameters
 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter parameters
 */
export interface FilterParams {
  [key: string]: any;
}

/**
 * Query parameters combining pagination, sorting, and filtering
 */
export interface QueryParams extends PaginationParams, SortParams, FilterParams {
  search?: string;
}

// Re-export all models
export * from './audit-log';
export * from './persona';
export * from './team-roster';
export * from './artifact-template';
export * from './postgresql';