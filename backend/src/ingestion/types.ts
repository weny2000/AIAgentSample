/**
 * Core types for the data ingestion pipeline
 */

export interface Document {
  id: string;
  source_type: 'slack' | 'teams' | 'jira' | 'confluence' | 'git' | 's3';
  source_id: string;
  team_id: string;
  content: string;
  metadata: DocumentMetadata;
  access_controls: AccessControl[];
  created_at: Date;
  updated_at: Date;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  channel?: string;
  project_key?: string;
  space_key?: string;
  repository?: string;
  file_path?: string;
  tags: string[];
  language?: string;
  content_type: string;
  size_bytes: number;
  checksum: string;
}

export interface AccessControl {
  type: 'user' | 'team' | 'role';
  identifier: string;
  permission: 'read' | 'write' | 'admin';
}

export interface ProcessedDocument {
  document: Document;
  chunks: ContentChunk[];
  pii_detected: PIIDetection[];
  enriched_metadata: EnrichedMetadata;
}

export interface ContentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  start_position: number;
  end_position: number;
  embedding?: number[];
}

export interface PIIDetection {
  type: 'EMAIL' | 'PHONE' | 'SSN' | 'CREDIT_CARD' | 'NAME' | 'ADDRESS';
  text: string;
  confidence: number;
  start_offset: number;
  end_offset: number;
  masked_text: string;
}

export interface EnrichedMetadata {
  entities: Entity[];
  key_phrases: KeyPhrase[];
  sentiment?: Sentiment;
  language_code: string;
  topics: string[];
}

export interface Entity {
  text: string;
  type: string;
  confidence: number;
  begin_offset: number;
  end_offset: number;
}

export interface KeyPhrase {
  text: string;
  confidence: number;
  begin_offset: number;
  end_offset: number;
}

export interface Sentiment {
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
  confidence: number;
}

export interface IngestionJob {
  id: string;
  source_type: string;
  source_config: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
  retry_count: number;
}

export interface ConnectorConfig {
  source_type: string;
  credentials: Record<string, any>;
  sync_interval: number;
  team_boundaries: string[];
  access_controls: AccessControl[];
  enabled: boolean;
}