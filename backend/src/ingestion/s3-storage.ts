/**
 * S3 storage service for managing document structure and access patterns
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Document, ProcessedDocument } from './types';

export class S3StorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, region: string = 'us-east-1') {
    this.bucketName = bucketName;
    this.s3Client = new S3Client({ region });
  }

  /**
   * Store raw document in S3 following the defined structure
   */
  async storeRawDocument(document: Document): Promise<string> {
    const key = this.generateRawDocumentKey(document);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(document),
      ContentType: 'application/json',
      Metadata: {
        'source-type': document.source_type,
        'team-id': document.team_id,
        'created-at': document.created_at.toISOString(),
      },
      ServerSideEncryption: 'aws:kms',
    });

    await this.s3Client.send(command);
    return key;
  }

  /**
   * Store processed document with chunks and enriched metadata
   */
  async storeProcessedDocument(processedDoc: ProcessedDocument): Promise<string> {
    const key = this.generateProcessedDocumentKey(processedDoc.document);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(processedDoc),
      ContentType: 'application/json',
      Metadata: {
        'source-type': processedDoc.document.source_type,
        'team-id': processedDoc.document.team_id,
        'chunks-count': processedDoc.chunks.length.toString(),
        'pii-detected': processedDoc.pii_detected.length > 0 ? 'true' : 'false',
      },
      ServerSideEncryption: 'aws:kms',
    });

    await this.s3Client.send(command);
    return key;
  }

  /**
   * Store artifact upload
   */
  async storeArtifact(userId: string, content: Buffer, filename: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `artifacts/uploads/${userId}/${timestamp}/${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      Metadata: {
        'user-id': userId,
        'original-filename': filename,
        'upload-timestamp': timestamp,
      },
      ServerSideEncryption: 'aws:kms',
    });

    await this.s3Client.send(command);
    return key;
  }

  /**
   * Store job report
   */
  async storeJobReport(jobId: string, report: any): Promise<string> {
    const key = `artifacts/reports/${jobId}/report.json`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(report),
      ContentType: 'application/json',
      Metadata: {
        'job-id': jobId,
        'report-timestamp': new Date().toISOString(),
      },
      ServerSideEncryption: 'aws:kms',
    });

    await this.s3Client.send(command);
    return key;
  }

  /**
   * Retrieve document from S3
   */
  async getDocument(key: string): Promise<any> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    const content = await response.Body?.transformToString();
    return content ? JSON.parse(content) : null;
  }

  /**
   * List documents by source type and team
   */
  async listDocuments(sourceType: string, teamId?: string, prefix?: string): Promise<string[]> {
    let keyPrefix = `raw/${sourceType}/`;
    if (teamId) {
      keyPrefix += `${teamId}/`;
    }
    if (prefix) {
      keyPrefix += prefix;
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: keyPrefix,
      MaxKeys: 1000,
    });

    const response = await this.s3Client.send(command);
    return response.Contents?.map(obj => obj.Key!) || [];
  }

  /**
   * Delete document from S3
   */
  async deleteDocument(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  /**
   * Generate S3 key for raw document following the defined structure
   */
  private generateRawDocumentKey(document: Document): string {
    const timestamp = document.created_at.toISOString().replace(/[:.]/g, '-');
    
    switch (document.source_type) {
      case 'slack':
        return `raw/slack/${document.team_id}/${document.metadata.channel}/${document.source_id}.json`;
      case 'teams':
        return `raw/teams/${document.team_id}/${document.metadata.channel}/${document.source_id}.json`;
      case 'jira':
        return `raw/jira/${document.metadata.project_key}/${document.source_id}.json`;
      case 'confluence':
        return `raw/confluence/${document.metadata.space_key}/${document.source_id}.json`;
      case 'git':
        return `raw/git/${document.metadata.repository}/${document.source_id}/`;
      case 's3':
        return `raw/s3/${document.team_id}/${document.source_id}`;
      default:
        return `raw/unknown/${document.team_id}/${timestamp}/${document.source_id}.json`;
    }
  }

  /**
   * Generate S3 key for processed document
   */
  private generateProcessedDocumentKey(document: Document): string {
    const timestamp = document.created_at.toISOString().replace(/[:.]/g, '-');
    return `processed/documents/${document.source_type}/${document.team_id}/${timestamp}/${document.id}.json`;
  }

  /**
   * Generate presigned URL for secure access
   */
  async generatePresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // This would typically use getSignedUrl from @aws-sdk/s3-request-presigner
    // For now, return a placeholder implementation
    return `https://${this.bucketName}.s3.amazonaws.com/${key}?expires=${expiresIn}`;
  }
}