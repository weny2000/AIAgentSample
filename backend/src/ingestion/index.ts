/**
 * Data ingestion pipeline exports
 */

// Core types
export * from './types';

// Storage services
export { S3StorageService } from './s3-storage';

// Processing services
export { PIIDetectionService } from './pii-detection';
export { ContentProcessor } from './content-processor';

// Connector framework
export { 
  BaseConnector, 
  ConnectorFactory, 
  ConnectorManager 
} from './connectors/base-connector';

// Main pipeline
export { IngestionPipeline } from './ingestion-pipeline';

// Re-export types for convenience
export type {
  Document,
  ProcessedDocument,
  ContentChunk,
  PIIDetection,
  EnrichedMetadata,
  IngestionJob,
  ConnectorConfig,
} from './types';