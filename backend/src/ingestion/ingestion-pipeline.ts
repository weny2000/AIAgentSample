/**
 * Main ingestion pipeline orchestrator
 */

import { Document, ProcessedDocument, IngestionJob, PIIDetection, ContentChunk, EnrichedMetadata } from './types';
import { S3StorageService } from './s3-storage';
import { PIIDetectionService } from './pii-detection';
import { ContentProcessor } from './content-processor';
import { BaseConnector } from './connectors/base-connector';

export interface PipelineConfig {
  s3BucketName: string;
  region: string;
  enablePIIDetection: boolean;
  enableContentProcessing: boolean;
  batchSize: number;
  maxRetries: number;
}

export interface PipelineMetrics {
  documentsProcessed: number;
  documentsSkipped: number;
  documentsWithPII: number;
  averageProcessingTime: number;
  errors: number;
  lastRunTime: Date;
}

export class IngestionPipeline {
  private s3Storage: S3StorageService;
  private piiDetection: PIIDetectionService;
  private contentProcessor: ContentProcessor;
  private config: PipelineConfig;
  private metrics: PipelineMetrics;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.s3Storage = new S3StorageService(config.s3BucketName, config.region);
    this.piiDetection = new PIIDetectionService(config.region);
    this.contentProcessor = new ContentProcessor(config.region);
    
    this.metrics = {
      documentsProcessed: 0,
      documentsSkipped: 0,
      documentsWithPII: 0,
      averageProcessingTime: 0,
      errors: 0,
      lastRunTime: new Date(),
    };
  }

  /**
   * Process a single document through the complete pipeline
   */
  async processDocument(document: Document): Promise<ProcessedDocument> {
    const startTime = Date.now();
    
    try {
      this.log('info', `Processing document ${document.id}`, { 
        sourceType: document.source_type,
        teamId: document.team_id 
      });

      // Step 1: Store raw document
      await this.s3Storage.storeRawDocument(document);

      // Step 2: PII Detection and Masking
      let processedContent = document.content;
      let piiDetections: PIIDetection[] = [];

      if (this.config.enablePIIDetection) {
        const piiResult = await this.piiDetection.processText(document.content);
        processedContent = piiResult.maskedText;
        piiDetections = piiResult.piiDetections;

        if (piiDetections.length > 0) {
          this.metrics.documentsWithPII++;
          this.log('warn', `PII detected in document ${document.id}`, {
            piiCount: piiDetections.length,
            types: piiDetections.map(p => p.type)
          });
        }
      }

      // Step 3: Content Processing and Enrichment
      let chunks: ContentChunk[] = [];
      let enrichedMetadata: EnrichedMetadata = {
        entities: [],
        key_phrases: [],
        language_code: 'en',
        topics: [],
      };

      if (this.config.enableContentProcessing) {
        const documentWithMaskedContent = { ...document, content: processedContent };
        const processingResult = await this.contentProcessor.processContent(documentWithMaskedContent);
        chunks = processingResult.chunks;
        enrichedMetadata = processingResult.enrichedMetadata;
      }

      // Step 4: Create processed document
      const processedDocument: ProcessedDocument = {
        document: { ...document, content: processedContent },
        chunks,
        pii_detected: piiDetections,
        enriched_metadata: enrichedMetadata,
      };

      // Step 5: Store processed document
      await this.s3Storage.storeProcessedDocument(processedDocument);

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(processingTime, false);

      this.log('info', `Successfully processed document ${document.id}`, {
        processingTimeMs: processingTime,
        chunksCreated: chunks.length,
        piiDetected: piiDetections.length > 0
      });

      return processedDocument;

    } catch (error) {
      this.metrics.errors++;
      this.log('error', `Error processing document ${document.id}`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Process multiple documents in batches
   */
  async processBatch(documents: Document[]): Promise<ProcessedDocument[]> {
    const results: ProcessedDocument[] = [];
    const batches = this.createBatches(documents, this.config.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.log('info', `Processing batch ${i + 1}/${batches.length}`, { 
        batchSize: batch.length 
      });

      const batchPromises = batch.map(doc => 
        this.processDocumentWithRetry(doc)
          .catch(error => {
            this.log('error', `Failed to process document ${doc.id} after retries`, { error });
            return null;
          })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null) as ProcessedDocument[]);
    }

    return results;
  }

  /**
   * Run ingestion from a connector
   */
  async runIngestion(connector: BaseConnector, options?: { incremental?: boolean }): Promise<IngestionJob> {
    const jobId = this.generateJobId();
    const job: IngestionJob = {
      id: jobId,
      source_type: connector.constructor.name,
      source_config: {},
      status: 'running',
      progress: 0,
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
    };

    try {
      this.log('info', `Starting ingestion job ${jobId}`, { 
        sourceType: job.source_type,
        incremental: options?.incremental 
      });

      // Test connection first
      const isConnected = await connector.testConnection();
      if (!isConnected) {
        throw new Error('Connector connection test failed');
      }

      // Fetch documents
      const lastSyncTime = options?.incremental ? await connector.getLastSyncTime() : null;
      const documents = await connector.fetchDocuments({
        incremental: options?.incremental,
        since: lastSyncTime || undefined,
      });

      this.log('info', `Fetched ${documents.length} documents for processing`);

      // Process documents
      const processedDocuments = await this.processBatch(documents);

      // Update job status
      job.status = 'completed';
      job.progress = 100;
      job.updated_at = new Date();

      // Update connector sync time
      await connector.updateLastSyncTime(new Date());

      this.log('info', `Completed ingestion job ${jobId}`, {
        documentsProcessed: processedDocuments.length,
        documentsFetched: documents.length
      });

    } catch (error) {
      job.status = 'failed';
      job.error_message = error instanceof Error ? error.message : String(error);
      job.updated_at = new Date();

      this.log('error', `Ingestion job ${jobId} failed`, { error: error instanceof Error ? error.message : String(error) });
    }

    return job;
  }

  /**
   * Process document with retry logic
   */
  private async processDocumentWithRetry(document: Document): Promise<ProcessedDocument> {
    let lastError: Error;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.processDocument(document);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries - 1) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt), 30000);
          this.log('warn', `Retrying document ${document.id} in ${backoffTime}ms`, {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries
          });
          
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Create batches from documents array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Update pipeline metrics
   */
  private updateMetrics(processingTime: number, skipped: boolean): void {
    if (skipped) {
      this.metrics.documentsSkipped++;
    } else {
      this.metrics.documentsProcessed++;
      
      // Update average processing time
      const totalProcessed = this.metrics.documentsProcessed;
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime * (totalProcessed - 1) + processingTime) / totalProcessed;
    }
    
    this.metrics.lastRunTime = new Date();
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Log pipeline activity
   */
  private log(level: 'info' | 'warn' | 'error', message: string, metadata?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'IngestionPipeline',
      message,
      metadata,
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset pipeline metrics
   */
  resetMetrics(): void {
    this.metrics = {
      documentsProcessed: 0,
      documentsSkipped: 0,
      documentsWithPII: 0,
      averageProcessingTime: 0,
      errors: 0,
      lastRunTime: new Date(),
    };
  }

  /**
   * Health check for pipeline components
   */
  async healthCheck(): Promise<{ status: string; components: Record<string, boolean> }> {
    const components = {
      s3Storage: true,
      piiDetection: true,
      contentProcessor: true,
    };

    try {
      // Test S3 connectivity (simplified)
      // In production, this would make an actual S3 call
      components.s3Storage = true;
    } catch {
      components.s3Storage = false;
    }

    try {
      // Test Comprehend connectivity
      await this.contentProcessor.detectLanguage('test');
      components.piiDetection = true;
    } catch {
      components.piiDetection = false;
    }

    try {
      // Test content processor
      await this.contentProcessor.detectLanguage('test');
      components.contentProcessor = true;
    } catch {
      components.contentProcessor = false;
    }

    const allHealthy = Object.values(components).every(status => status);
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      components,
    };
  }
}