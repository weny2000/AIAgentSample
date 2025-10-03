/**
 * S3 connector for ingesting documents from S3 buckets
 * Supports cross-account access patterns and various authentication methods
 */

import { BaseConnector, ConnectorCredentials, SyncOptions, ConnectorMetrics } from './base-connector.js';
import { Document, ConnectorConfig } from '../types.js';
import { 
  S3Client, 
  ListObjectsV2Command, 
  GetObjectCommand, 
  HeadObjectCommand,
  GetBucketLocationCommand,
  ListObjectsV2CommandOutput
} from '@aws-sdk/client-s3';
import path from 'path';

interface S3Credentials extends ConnectorCredentials {
  access_key_id?: string;
  secret_access_key?: string;
  session_token?: string;
  region?: string;
  role_arn?: string;
  external_id?: string;
  profile?: string;
}

interface S3BucketConfig {
  bucket_name: string;
  prefix?: string;
  include_patterns?: string[];
  exclude_patterns?: string[];
  cross_account_role_arn?: string;
  kms_key_id?: string;
}

interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  storageClass?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export class S3Connector extends BaseConnector {
  private s3Client: S3Client;
  protected credentials: S3Credentials;
  private bucketConfig: S3BucketConfig;
  private lastSyncTime: Date | null = null;
  private metrics: ConnectorMetrics = {
    documentsProcessed: 0,
    documentsSkipped: 0,
    errors: 0,
    lastSyncTime: new Date(),
    avgProcessingTime: 0,
  };

  constructor(config: ConnectorConfig) {
    super(config);
    this.credentials = config.credentials as S3Credentials;
    this.bucketConfig = config.credentials as S3BucketConfig;
    
    this.s3Client = this.createS3Client();
  }

  private createS3Client(): S3Client {
    const clientConfig: any = {
      region: this.credentials.region || 'us-east-1',
    };

    // Configure credentials
    if (this.credentials.access_key_id && this.credentials.secret_access_key) {
      clientConfig.credentials = {
        accessKeyId: this.credentials.access_key_id,
        secretAccessKey: this.credentials.secret_access_key,
        sessionToken: this.credentials.session_token,
      };
    } else if (this.credentials.profile) {
      // Use AWS profile (will be handled by AWS SDK automatically)
      process.env.AWS_PROFILE = this.credentials.profile;
    }
    // If no explicit credentials, SDK will use default credential chain

    return new S3Client(clientConfig);
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test by getting bucket location
      const command = new GetBucketLocationCommand({
        Bucket: this.bucketConfig.bucket_name,
      });
      
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      this.log('error', 'Connection test failed', { 
        error: error instanceof Error ? error.message : String(error),
        bucket: this.bucketConfig.bucket_name,
      });
      return false;
    }
  }

  async authenticate(): Promise<boolean> {
    try {
      // If cross-account role is specified, assume the role
      if (this.bucketConfig.cross_account_role_arn) {
        await this.assumeCrossAccountRole();
      }

      const isConnected = await this.testConnection();
      if (isConnected) {
        this.log('info', 'Authentication successful', { 
          bucket: this.bucketConfig.bucket_name,
          crossAccount: !!this.bucketConfig.cross_account_role_arn,
        });
        return true;
      }
      return false;
    } catch (error) {
      this.log('error', 'Authentication failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  async fetchDocuments(options: SyncOptions = {}): Promise<Document[]> {
    const startTime = Date.now();
    const documents: Document[] = [];

    try {
      // List objects in the bucket
      const objects = await this.listObjects(options);
      
      for (const obj of objects) {
        try {
          // Skip objects that don't match our criteria
          if (!this.shouldProcessObject(obj)) {
            this.metrics.documentsSkipped++;
            continue;
          }

          // Fetch object content and create document
          const document = await this.createDocumentFromObject(obj);
          if (document) {
            // Apply team boundary validation
            if (this.validateTeamBoundaries(document)) {
              documents.push(this.applyAccessControls(document));
              this.metrics.documentsProcessed++;
            } else {
              this.metrics.documentsSkipped++;
            }
          }
          
        } catch (error) {
          this.log('error', `Error processing object ${obj.key}`, { 
            error: error instanceof Error ? error.message : String(error),
            key: obj.key 
          });
          this.metrics.errors++;
        }
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.metrics.avgProcessingTime = 
        (this.metrics.avgProcessingTime + processingTime) / 2;
      this.metrics.lastSyncTime = new Date();

      this.log('info', 'Document fetch completed', {
        documentsProcessed: this.metrics.documentsProcessed,
        documentsSkipped: this.metrics.documentsSkipped,
        errors: this.metrics.errors,
        processingTime,
      });

      return documents;

    } catch (error) {
      this.log('error', 'Failed to fetch documents', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.metrics.errors++;
      throw error;
    }
  }

  async fetchDocument(id: string): Promise<Document | null> {
    try {
      // Document ID is the S3 object key
      const objectInfo = await this.getObjectInfo(id);
      if (!objectInfo) {
        return null;
      }

      return this.createDocumentFromObject(objectInfo);

    } catch (error) {
      this.log('error', 'Failed to fetch single document', { 
        error: error instanceof Error ? error.message : String(error),
        documentId: id 
      });
      return null;
    }
  }

  async getLastSyncTime(): Promise<Date | null> {
    return this.lastSyncTime;
  }

  async updateLastSyncTime(timestamp: Date): Promise<void> {
    this.lastSyncTime = timestamp;
  }

  async getMetrics(): Promise<ConnectorMetrics> {
    return { ...this.metrics };
  }

  async reset(): Promise<void> {
    this.lastSyncTime = null;
    this.metrics = {
      documentsProcessed: 0,
      documentsSkipped: 0,
      errors: 0,
      lastSyncTime: new Date(),
      avgProcessingTime: 0,
    };
  }

  /**
   * List objects in the S3 bucket
   */
  private async listObjects(options: SyncOptions): Promise<S3ObjectInfo[]> {
    const objects: S3ObjectInfo[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketConfig.bucket_name,
          Prefix: this.bucketConfig.prefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        });

        const response: ListObjectsV2CommandOutput = await this.s3Client.send(command);
        
        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key && obj.Size !== undefined && obj.LastModified && obj.ETag) {
              // Filter by last modified date if specified
              if (options.since && obj.LastModified < options.since) {
                continue;
              }

              const objectInfo: S3ObjectInfo = {
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
                etag: obj.ETag.replace(/"/g, ''), // Remove quotes from ETag
                storageClass: obj.StorageClass,
              };

              objects.push(objectInfo);
            }
          }
        }

        continuationToken = response.NextContinuationToken;

        // Respect limit if specified
        if (options.limit && objects.length >= options.limit) {
          break;
        }

      } while (continuationToken);

    } catch (error) {
      this.log('error', 'Failed to list objects', {
        error: error instanceof Error ? error.message : String(error),
        bucket: this.bucketConfig.bucket_name,
      });
      throw error;
    }

    return objects;
  }

  /**
   * Get detailed information about a specific object
   */
  private async getObjectInfo(key: string): Promise<S3ObjectInfo | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketConfig.bucket_name,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag?.replace(/"/g, '') || '',
        contentType: response.ContentType,
        metadata: response.Metadata,
      };

    } catch (error) {
      this.log('warn', 'Failed to get object info', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      return null;
    }
  }

  /**
   * Get object content from S3
   */
  private async getObjectContent(key: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketConfig.bucket_name,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        return null;
      }

      // Convert stream to string
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const buffer = Buffer.concat(chunks);
      
      // Try to decode as UTF-8, fallback to base64 for binary files
      try {
        return buffer.toString('utf-8');
      } catch {
        return buffer.toString('base64');
      }

    } catch (error) {
      this.log('warn', 'Failed to get object content', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      return null;
    }
  }

  /**
   * Create document from S3 object
   */
  private async createDocumentFromObject(objectInfo: S3ObjectInfo): Promise<Document | null> {
    try {
      const content = await this.getObjectContent(objectInfo.key);
      if (content === null) {
        return null;
      }

      // Extract team ID from object key or metadata
      const teamId = this.extractTeamId(objectInfo);

      const document: Document = {
        id: objectInfo.key,
        source_type: 's3',
        source_id: objectInfo.etag,
        team_id: teamId,
        content,
        metadata: {
          title: path.basename(objectInfo.key),
          file_path: objectInfo.key,
          tags: this.extractTags(objectInfo),
          content_type: objectInfo.contentType || this.getContentType(objectInfo.key),
          size_bytes: objectInfo.size,
          checksum: objectInfo.etag,
        },
        access_controls: this.generateAccessControls(objectInfo),
        created_at: objectInfo.lastModified,
        updated_at: objectInfo.lastModified,
      };

      return document;

    } catch (error) {
      this.log('error', 'Failed to create document from object', {
        error: error instanceof Error ? error.message : String(error),
        key: objectInfo.key,
      });
      return null;
    }
  }

  /**
   * Check if object should be processed based on include/exclude patterns
   */
  private shouldProcessObject(objectInfo: S3ObjectInfo): boolean {
    const key = objectInfo.key;

    // Skip directories (keys ending with /)
    if (key.endsWith('/')) {
      return false;
    }

    // Skip very large files (>100MB) to avoid memory issues
    if (objectInfo.size > 100 * 1024 * 1024) {
      this.log('info', 'Skipping large file', { key, size: objectInfo.size });
      return false;
    }

    // Check exclude patterns first
    if (this.bucketConfig.exclude_patterns) {
      for (const pattern of this.bucketConfig.exclude_patterns) {
        if (this.matchesPattern(key, pattern)) {
          return false;
        }
      }
    }

    // Check include patterns
    if (this.bucketConfig.include_patterns && this.bucketConfig.include_patterns.length > 0) {
      for (const pattern of this.bucketConfig.include_patterns) {
        if (this.matchesPattern(key, pattern)) {
          return true;
        }
      }
      return false; // If include patterns are specified, only include matching files
    }

    // Default: include text-based files
    return this.isTextFile(key);
  }

  /**
   * Check if a key matches a glob-like pattern
   */
  private matchesPattern(key: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(key);
  }

  /**
   * Check if file is likely to contain text content
   */
  private isTextFile(key: string): boolean {
    const textExtensions = [
      '.txt', '.md', '.rst', '.json', '.xml', '.yaml', '.yml',
      '.js', '.ts', '.py', '.java', '.cpp', '.c', '.h',
      '.html', '.css', '.sql', '.sh', '.bat', '.ps1',
      '.log', '.csv', '.tsv', '.ini', '.conf', '.config',
    ];

    const ext = path.extname(key).toLowerCase();
    return textExtensions.includes(ext);
  }

  /**
   * Extract team ID from object key or metadata
   */
  private extractTeamId(objectInfo: S3ObjectInfo): string {
    // Try to extract from metadata first
    if (objectInfo.metadata?.team_id) {
      return objectInfo.metadata.team_id;
    }

    // Try to extract from object key path
    const pathParts = objectInfo.key.split('/');
    
    // Look for common patterns like team-name/, teams/team-name/, etc.
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (part.match(/^team-/i) || (pathParts[i - 1] === 'teams')) {
        return part;
      }
    }

    // Default to bucket name or 'default'
    return this.bucketConfig.bucket_name;
  }

  /**
   * Extract tags from object key and metadata
   */
  private extractTags(objectInfo: S3ObjectInfo): string[] {
    const tags: string[] = [];

    // Add file extension as tag
    const ext = path.extname(objectInfo.key);
    if (ext) {
      tags.push(ext.substring(1).toLowerCase());
    }

    // Add storage class as tag
    if (objectInfo.storageClass) {
      tags.push(`storage:${objectInfo.storageClass.toLowerCase()}`);
    }

    // Add path-based tags
    const pathParts = objectInfo.key.split('/');
    if (pathParts.length > 1) {
      // Add directory names as tags (up to 3 levels)
      for (let i = 0; i < Math.min(pathParts.length - 1, 3); i++) {
        if (pathParts[i]) {
          tags.push(`dir:${pathParts[i]}`);
        }
      }
    }

    // Add metadata-based tags
    if (objectInfo.metadata) {
      Object.entries(objectInfo.metadata).forEach(([key, value]) => {
        if (key.startsWith('tag-') || key === 'tags') {
          tags.push(value);
        }
      });
    }

    return tags;
  }

  /**
   * Generate access controls based on object metadata and bucket configuration
   */
  private generateAccessControls(objectInfo: S3ObjectInfo): any[] {
    const controls = [];

    // Check for access control metadata
    if (objectInfo.metadata?.access_control) {
      try {
        const accessControl = JSON.parse(objectInfo.metadata.access_control);
        if (Array.isArray(accessControl)) {
          controls.push(...accessControl);
        }
      } catch (error) {
        this.log('warn', 'Invalid access control metadata', {
          key: objectInfo.key,
          metadata: objectInfo.metadata.access_control,
        });
      }
    }

    // Default access control based on team ID
    const teamId = this.extractTeamId(objectInfo);
    controls.push({
      type: 'team',
      identifier: teamId,
      permission: 'read',
    });

    return controls;
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    
    const contentTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.yaml': 'application/yaml',
      '.yml': 'application/yaml',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.h': 'text/x-chdr',
      '.html': 'text/html',
      '.css': 'text/css',
      '.sql': 'text/x-sql',
      '.sh': 'text/x-shellscript',
      '.log': 'text/plain',
      '.csv': 'text/csv',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Assume cross-account role for accessing S3 bucket
   */
  private async assumeCrossAccountRole(): Promise<void> {
    if (!this.bucketConfig.cross_account_role_arn) {
      return;
    }

    try {
      // This would typically use STS to assume the role
      // For now, we'll log the intent and assume the role ARN is configured
      this.log('info', 'Assuming cross-account role', {
        roleArn: this.bucketConfig.cross_account_role_arn,
        externalId: this.credentials.external_id,
      });

      // In a real implementation, you would:
      // 1. Use STS AssumeRole to get temporary credentials
      // 2. Create a new S3 client with those credentials
      // 3. Update this.s3Client with the new client

    } catch (error) {
      this.log('error', 'Failed to assume cross-account role', {
        error: error instanceof Error ? error.message : String(error),
        roleArn: this.bucketConfig.cross_account_role_arn,
      });
      throw error;
    }
  }

  /**
   * Handle S3 event notifications for real-time updates
   */
  async handleS3Event(event: any): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      if (event.Records) {
        for (const record of event.Records) {
          if (record.eventSource === 'aws:s3') {
            const bucketName = record.s3.bucket.name;
            const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

            // Only process events for our configured bucket
            if (bucketName === this.bucketConfig.bucket_name) {
              if (record.eventName.startsWith('ObjectCreated:') || 
                  record.eventName.startsWith('ObjectModified:')) {
                
                const objectInfo = await this.getObjectInfo(objectKey);
                if (objectInfo && this.shouldProcessObject(objectInfo)) {
                  const document = await this.createDocumentFromObject(objectInfo);
                  if (document) {
                    documents.push(this.applyAccessControls(document));
                  }
                }
              }
              // Handle ObjectRemoved events by marking documents as deleted
              // (implementation depends on your document management strategy)
            }
          }
        }
      }

    } catch (error) {
      this.log('error', 'Error handling S3 event', {
        error: error instanceof Error ? error.message : String(error),
        event: event.Records?.[0]?.eventName,
      });
    }

    return documents;
  }
}