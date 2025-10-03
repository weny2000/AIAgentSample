import { Pool, PoolClient, PoolConfig } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

export interface DatabaseConfig {
  secretArn: string;
  host: string;
  port: number;
  database: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Database connection manager with connection pooling
 * Handles credential retrieval from AWS Secrets Manager and connection lifecycle
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private secretsClient: SecretsManagerClient;
  private credentials: DatabaseCredentials | null = null;
  private credentialsExpiry: Date | null = null;

  private constructor(config: DatabaseConfig) {
    this.config = config;
    this.secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Get singleton instance of DatabaseConnection
   */
  public static getInstance(config?: DatabaseConfig): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!config) {
        throw new Error('DatabaseConnection config is required for first initialization');
      }
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Initialize database connection from environment variables
   */
  public static fromEnvironment(): DatabaseConnection {
    const config: DatabaseConfig = {
      secretArn: process.env.DB_SECRET_ARN!,
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'aiagent',
      ssl: process.env.DB_SSL !== 'false',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
    };

    if (!config.secretArn || !config.host) {
      throw new Error('Required database environment variables are missing');
    }

    return DatabaseConnection.getInstance(config);
  }

  /**
   * Get database credentials from AWS Secrets Manager
   */
  private async getCredentials(): Promise<DatabaseCredentials> {
    // Return cached credentials if they're still valid (cache for 1 hour)
    if (this.credentials && this.credentialsExpiry && this.credentialsExpiry > new Date()) {
      return this.credentials;
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: this.config.secretArn,
      });

      const response = await this.secretsClient.send(command);
      
      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      const secretData = JSON.parse(response.SecretString);
      
      this.credentials = {
        username: secretData.username,
        password: secretData.password,
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
      };

      // Cache credentials for 1 hour
      this.credentialsExpiry = new Date(Date.now() + 60 * 60 * 1000);
      
      return this.credentials;
    } catch (error) {
      console.error('Failed to retrieve database credentials:', error);
      throw new Error('Failed to retrieve database credentials from Secrets Manager');
    }
  }

  /**
   * Initialize connection pool
   */
  private async initializePool(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }

    const credentials = await this.getCredentials();

    const poolConfig: PoolConfig = {
      user: credentials.username,
      password: credentials.password,
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.maxConnections || 20,
      idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis || 10000,
      // Enable keep-alive to prevent connection drops
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    // Handle pool connection events
    this.pool.on('connect', (client) => {
      console.log('New client connected to database');
    });

    this.pool.on('remove', (client) => {
      console.log('Client removed from pool');
    });

    return this.pool;
  }

  /**
   * Get a database client from the pool
   */
  public async getClient(): Promise<PoolClient> {
    const pool = await this.initializePool();
    return pool.connect();
  }

  /**
   * Execute a query with automatic client management
   */
  public async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query and return a single result
   */
  public async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(text, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute multiple queries in a transaction
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test database connectivity
   */
  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as test');
      return result.length > 0 && result[0].test === 1;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Get pool statistics
   */
  public getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Close all connections and clean up
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.credentials = null;
    this.credentialsExpiry = null;
  }

  /**
   * Refresh credentials (useful for long-running processes)
   */
  public async refreshCredentials(): Promise<void> {
    this.credentials = null;
    this.credentialsExpiry = null;
    
    // Close existing pool to force recreation with new credentials
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

/**
 * Utility function to get database connection instance
 */
export function getDatabase(): DatabaseConnection {
  return DatabaseConnection.fromEnvironment();
}

/**
 * Utility function for executing database migrations
 */
export async function executeMigration(
  db: DatabaseConnection,
  migrationSql: string,
  migrationName: string
): Promise<void> {
  console.log(`Executing migration: ${migrationName}`);
  
  try {
    await db.transaction(async (client) => {
      // Split SQL by statements (simple approach - may need refinement for complex cases)
      const statements = migrationSql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        await client.query(statement);
      }
    });
    
    console.log(`Migration completed successfully: ${migrationName}`);
  } catch (error) {
    console.error(`Migration failed: ${migrationName}`, error);
    throw error;
  }
}