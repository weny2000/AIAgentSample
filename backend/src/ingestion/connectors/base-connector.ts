/**
 * Base connector interface for external integrations
 */

import { Document, ConnectorConfig } from '../types.js';

export interface ConnectorCredentials {
  [key: string]: string | undefined;
}

export interface SyncOptions {
  incremental?: boolean;
  since?: Date;
  limit?: number;
  teamIds?: string[];
}

export interface ConnectorMetrics {
  documentsProcessed: number;
  documentsSkipped: number;
  errors: number;
  lastSyncTime: Date;
  avgProcessingTime: number;
}

export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected credentials: ConnectorCredentials;

  constructor(config: ConnectorConfig) {
    this.config = config;
    this.credentials = config.credentials;
  }

  /**
   * Test connection to the external service
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Authenticate with the external service
   */
  abstract authenticate(): Promise<boolean>;

  /**
   * Fetch documents from the external service
   */
  abstract fetchDocuments(options?: SyncOptions): Promise<Document[]>;

  /**
   * Fetch a single document by ID
   */
  abstract fetchDocument(id: string): Promise<Document | null>;

  /**
   * Get the last sync timestamp
   */
  abstract getLastSyncTime(): Promise<Date | null>;

  /**
   * Update the last sync timestamp
   */
  abstract updateLastSyncTime(timestamp: Date): Promise<void>;

  /**
   * Validate that the document meets team boundary requirements
   */
  protected validateTeamBoundaries(document: Document): boolean {
    if (!this.config.team_boundaries || this.config.team_boundaries.length === 0) {
      return true;
    }

    return this.config.team_boundaries.includes(document.team_id);
  }

  /**
   * Apply access controls to the document
   */
  protected applyAccessControls(document: Document): Document {
    // Merge connector-level access controls with document-specific ones
    const mergedAccessControls = [
      ...document.access_controls,
      ...this.config.access_controls,
    ];

    // Remove duplicates
    const uniqueAccessControls = mergedAccessControls.filter(
      (control, index, self) =>
        index === self.findIndex(
          (c) =>
            c.type === control.type &&
            c.identifier === control.identifier &&
            c.permission === control.permission
        )
    );

    return {
      ...document,
      access_controls: uniqueAccessControls,
    };
  }

  /**
   * Handle rate limiting with exponential backoff
   */
  protected async handleRateLimit(retryCount: number = 0): Promise<void> {
    const maxRetries = 5;
    if (retryCount >= maxRetries) {
      throw new Error('Max retries exceeded for rate limiting');
    }

    const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
    const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
    
    await new Promise(resolve => setTimeout(resolve, backoffTime + jitter));
  }

  /**
   * Log connector activity
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, metadata?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      connector: this.constructor.name,
      message,
      metadata,
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Get connector metrics
   */
  abstract getMetrics(): Promise<ConnectorMetrics>;

  /**
   * Reset connector state (useful for testing)
   */
  abstract reset(): Promise<void>;
}

/**
 * Connector factory for creating connector instances
 */
export class ConnectorFactory {
  private static connectors: Map<string, typeof BaseConnector> = new Map();

  static register(sourceType: string, connectorClass: typeof BaseConnector): void {
    this.connectors.set(sourceType, connectorClass);
  }

  static create(config: ConnectorConfig): BaseConnector {
    const ConnectorClass = this.connectors.get(config.source_type);
    if (!ConnectorClass) {
      throw new Error(`No connector registered for source type: ${config.source_type}`);
    }

    // TypeScript doesn't know that ConnectorClass is a concrete class, so we cast it
    return new (ConnectorClass as any)(config);
  }

  static getSupportedTypes(): string[] {
    return Array.from(this.connectors.keys());
  }

  static initialize(): void {
    // Register built-in connectors
    if (this.connectors.size === 0) {
      // Import and register connectors
      import('./slack-connector.js').then(({ SlackConnector }) => {
        this.register('slack', SlackConnector);
      }).catch(console.error);
      
      import('./jira-connector.js').then(({ JiraConnector }) => {
        this.register('jira', JiraConnector);
      }).catch(console.error);
      
      import('./confluence-connector.js').then(({ ConfluenceConnector }) => {
        this.register('confluence', ConfluenceConnector);
      }).catch(console.error);
      
      import('./git-connector.js').then(({ GitConnector }) => {
        this.register('git', GitConnector);
      }).catch(console.error);
      
      import('./s3-connector.js').then(({ S3Connector }) => {
        this.register('s3', S3Connector);
      }).catch(console.error);
      
      // Skip Teams connector for now due to module issues
      // import('./teams-connector.js').then(({ TeamsConnector }) => {
      //   this.register('teams', TeamsConnector);
      // }).catch(console.error);
    }
  }
}

/**
 * Connector manager for orchestrating multiple connectors
 */
export class ConnectorManager {
  private connectors: Map<string, BaseConnector> = new Map();

  addConnector(id: string, connector: BaseConnector): void {
    this.connectors.set(id, connector);
  }

  removeConnector(id: string): void {
    this.connectors.delete(id);
  }

  getConnector(id: string): BaseConnector | undefined {
    return this.connectors.get(id);
  }

  async syncAll(options?: SyncOptions): Promise<Document[]> {
    const allDocuments: Document[] = [];

    for (const [id, connector] of this.connectors) {
      try {
        const documents = await connector.fetchDocuments(options);
        allDocuments.push(...documents);
      } catch (error) {
        console.error(`Error syncing connector ${id}:`, error);
      }
    }

    return allDocuments;
  }

  async testAllConnections(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, connector] of this.connectors) {
      try {
        const isConnected = await connector.testConnection();
        results.set(id, isConnected);
      } catch (error) {
        results.set(id, false);
      }
    }

    return results;
  }
}