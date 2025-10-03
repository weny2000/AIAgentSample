/**
 * Confluence connector for ingesting pages, comments, and attachments with space-level access control
 */

import { BaseConnector, ConnectorCredentials, SyncOptions, ConnectorMetrics } from './base-connector.js';
import { Document, ConnectorConfig } from '../types.js';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

interface ConfluenceCredentials extends ConnectorCredentials {
  base_url: string;
  username: string;
  api_token: string;
  webhook_secret?: string;
}

interface ConfluencePage {
  id: string;
  type: string;
  status: string;
  title: string;
  space: {
    id: string;
    key: string;
    name: string;
  };
  body: {
    storage: {
      value: string;
      representation: string;
    };
  };
  version: {
    number: number;
    when: string;
    by: {
      displayName: string;
      email: string;
    };
  };
  ancestors: Array<{
    id: string;
    title: string;
  }>;
  restrictions?: {
    read: {
      restrictions: {
        user: {
          results: Array<{
            displayName: string;
            email: string;
          }>;
        };
        group: {
          results: Array<{
            name: string;
          }>;
        };
      };
    };
  };
}

interface ConfluenceComment {
  id: string;
  type: string;
  title: string;
  body: {
    storage: {
      value: string;
      representation: string;
    };
  };
  version: {
    number: number;
    when: string;
    by: {
      displayName: string;
      email: string;
    };
  };
}

interface ConfluenceAttachment {
  id: string;
  type: string;
  title: string;
  metadata: {
    mediaType: string;
    fileSize: number;
    comment?: string;
  };
  version: {
    when: string;
    by: {
      displayName: string;
      email: string;
    };
  };
  _links: {
    download: string;
  };
}

interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  description?: {
    plain: {
      value: string;
    };
  };
  permissions?: Array<{
    subjects: {
      user?: {
        results: Array<{
          displayName: string;
          email: string;
        }>;
      };
      group?: {
        results: Array<{
          name: string;
        }>;
      };
    };
    operation: {
      operation: string;
      targetType: string;
    };
  }>;
}

export class ConfluenceConnector extends BaseConnector {
  private client: AxiosInstance;
  protected credentials: ConfluenceCredentials;
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
    this.credentials = config.credentials as ConfluenceCredentials;
    
    this.client = axios.create({
      baseURL: `${this.credentials.base_url}/rest/api`,
      auth: {
        username: this.credentials.username,
        password: this.credentials.api_token,
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          this.log('warn', 'Rate limited, waiting before retry', { retryAfter });
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/user/current');
      return response.status === 200;
    } catch (error) {
      this.log('error', 'Connection test failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await this.client.get('/user/current');
      if (response.status === 200) {
        this.log('info', 'Authentication successful', { 
          user: response.data.displayName,
          accountId: response.data.accountId 
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
      // Get spaces accessible to the user
      const spaces = await this.getSpaces();
      
      for (const space of spaces) {
        // Skip spaces not in team boundaries if specified
        if (options.teamIds && !options.teamIds.includes(space.key)) {
          continue;
        }

        try {
          const pages = await this.getSpacePages(space, options);
          
          for (const page of pages) {
            // Create document for the page itself
            const pageDoc = await this.convertPageToDocument(page, space);
            if (pageDoc && this.validateTeamBoundaries(pageDoc)) {
              documents.push(this.applyAccessControls(pageDoc));
              this.metrics.documentsProcessed++;
            } else {
              this.metrics.documentsSkipped++;
            }

            // Get comments for the page
            const comments = await this.getPageComments(page.id);
            for (const comment of comments) {
              const commentDoc = await this.convertCommentToDocument(comment, page, space);
              if (commentDoc && this.validateTeamBoundaries(commentDoc)) {
                documents.push(this.applyAccessControls(commentDoc));
                this.metrics.documentsProcessed++;
              } else {
                this.metrics.documentsSkipped++;
              }
            }

            // Get attachments for the page
            const attachments = await this.getPageAttachments(page.id);
            for (const attachment of attachments) {
              const attachmentDoc = await this.convertAttachmentToDocument(attachment, page, space);
              if (attachmentDoc && this.validateTeamBoundaries(attachmentDoc)) {
                documents.push(this.applyAccessControls(attachmentDoc));
                this.metrics.documentsProcessed++;
              } else {
                this.metrics.documentsSkipped++;
              }
            }
          }
          
        } catch (error) {
          this.log('error', `Error fetching pages from space ${space.key}`, { 
            error: error instanceof Error ? error.message : String(error),
            space: space.key 
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
      // Parse document ID (format: space_key:page_id or space_key:page_id:comment_id)
      const parts = id.split(':');
      if (parts.length < 2) {
        throw new Error('Invalid document ID format');
      }

      const [spaceKey, pageId, commentId] = parts;
      
      // Get page details
      const response = await this.client.get(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version,space,ancestors,restrictions.read.restrictions.user,restrictions.read.restrictions.group',
        },
      });

      if (response.status !== 200) {
        return null;
      }

      const page = response.data;
      const space = await this.getSpaceInfo(spaceKey);
      
      if (!space) {
        return null;
      }

      if (commentId) {
        // Return specific comment
        const comments = await this.getPageComments(pageId);
        const comment = comments.find(c => c.id === commentId);
        if (comment) {
          return await this.convertCommentToDocument(comment, page, space);
        }
      } else {
        // Return the page itself
        return await this.convertPageToDocument(page, space);
      }

      return null;

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
   * Get all spaces accessible to the user
   */
  private async getSpaces(): Promise<ConfluenceSpace[]> {
    const spaces: ConfluenceSpace[] = [];
    let start = 0;
    const limit = 50;

    do {
      try {
        const response = await this.client.get('/space', {
          params: {
            start,
            limit,
            expand: 'description.plain,permissions',
          },
        });

        if (!response.data.results) {
          break;
        }

        spaces.push(...response.data.results);
        start += limit;

        // Break if we've fetched all spaces
        if (response.data.results.length < limit) {
          break;
        }

      } catch (error) {
        this.log('error', 'Failed to fetch spaces', { 
          error: error instanceof Error ? error.message : String(error),
          start 
        });
        break;
      }
    } while (true);

    return spaces;
  }

  /**
   * Get space information
   */
  private async getSpaceInfo(spaceKey: string): Promise<ConfluenceSpace | null> {
    try {
      const response = await this.client.get(`/space/${spaceKey}`, {
        params: {
          expand: 'description.plain,permissions',
        },
      });

      return response.status === 200 ? response.data : null;
    } catch (error) {
      this.log('warn', 'Failed to get space info', { 
        error: error instanceof Error ? error.message : String(error),
        spaceKey 
      });
      return null;
    }
  }

  /**
   * Get pages from a specific space
   */
  private async getSpacePages(space: ConfluenceSpace, options: SyncOptions): Promise<ConfluencePage[]> {
    const pages: ConfluencePage[] = [];
    let start = 0;
    const limit = options.limit || 50;

    do {
      try {
        const params: any = {
          spaceKey: space.key,
          start,
          limit,
          expand: 'body.storage,version,space,ancestors,restrictions.read.restrictions.user,restrictions.read.restrictions.group',
        };

        // Add date filter if specified
        if (options.since) {
          // Confluence uses CQL (Confluence Query Language) for filtering
          params.cql = `space = "${space.key}" AND lastModified >= "${options.since.toISOString()}"`;
        }

        const response = await this.client.get('/content', {
          params,
        });

        if (!response.data.results) {
          break;
        }

        pages.push(...response.data.results);
        start += limit;

        // Break if we've fetched all pages or reached the limit
        if (response.data.results.length < limit || 
            (options.limit && pages.length >= options.limit)) {
          break;
        }

      } catch (error) {
        this.log('error', 'Failed to fetch pages', { 
          error: error instanceof Error ? error.message : String(error),
          space: space.key,
          start 
        });
        break;
      }
    } while (true);

    return pages;
  }

  /**
   * Get comments for a specific page
   */
  private async getPageComments(pageId: string): Promise<ConfluenceComment[]> {
    try {
      const response = await this.client.get(`/content/${pageId}/child/comment`, {
        params: {
          expand: 'body.storage,version',
        },
      });

      return response.data.results || [];
    } catch (error) {
      this.log('warn', 'Failed to fetch comments', { 
        error: error instanceof Error ? error.message : String(error),
        pageId 
      });
      return [];
    }
  }

  /**
   * Get attachments for a specific page
   */
  private async getPageAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    try {
      const response = await this.client.get(`/content/${pageId}/child/attachment`, {
        params: {
          expand: 'version,metadata',
        },
      });

      return response.data.results || [];
    } catch (error) {
      this.log('warn', 'Failed to fetch attachments', { 
        error: error instanceof Error ? error.message : String(error),
        pageId 
      });
      return [];
    }
  }

  /**
   * Convert Confluence page to Document format
   */
  private async convertPageToDocument(page: ConfluencePage, space: ConfluenceSpace): Promise<Document> {
    const content = this.formatPageContent(page);
    
    return {
      id: `${space.key}:${page.id}`,
      source_type: 'confluence',
      source_id: page.id,
      team_id: space.key, // Using space as team boundary
      content,
      metadata: {
        title: page.title,
        author: page.version.by.displayName,
        space_key: space.key,
        tags: [
          page.type,
          page.status,
          ...this.extractLabelsFromContent(page.body.storage.value),
        ],
        content_type: 'text/html',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        checksum: crypto.createHash('md5').update(content).digest('hex'),
      },
      access_controls: this.generatePageAccessControls(page, space),
      created_at: new Date(page.version.when),
      updated_at: new Date(page.version.when),
    };
  }

  /**
   * Convert Confluence comment to Document format
   */
  private async convertCommentToDocument(
    comment: ConfluenceComment, 
    page: ConfluencePage, 
    space: ConfluenceSpace
  ): Promise<Document> {
    const content = this.formatCommentContent(comment, page);
    
    return {
      id: `${space.key}:${page.id}:${comment.id}`,
      source_type: 'confluence',
      source_id: comment.id,
      team_id: space.key,
      content,
      metadata: {
        title: `Comment on ${page.title}`,
        author: comment.version.by.displayName,
        space_key: space.key,
        tags: ['comment', page.type],
        content_type: 'text/html',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        checksum: crypto.createHash('md5').update(content).digest('hex'),
      },
      access_controls: this.generateCommentAccessControls(comment, page, space),
      created_at: new Date(comment.version.when),
      updated_at: new Date(comment.version.when),
    };
  }

  /**
   * Convert Confluence attachment to Document format
   */
  private async convertAttachmentToDocument(
    attachment: ConfluenceAttachment, 
    page: ConfluencePage, 
    space: ConfluenceSpace
  ): Promise<Document> {
    const content = `Attachment: ${attachment.title}\nType: ${attachment.metadata.mediaType}\nSize: ${attachment.metadata.fileSize} bytes\nAttached to: ${page.title}`;
    
    return {
      id: `${space.key}:${page.id}:attachment:${attachment.id}`,
      source_type: 'confluence',
      source_id: attachment.id,
      team_id: space.key,
      content,
      metadata: {
        title: attachment.title,
        author: attachment.version.by.displayName,
        space_key: space.key,
        tags: ['attachment', attachment.metadata.mediaType.split('/')[0]],
        content_type: attachment.metadata.mediaType,
        size_bytes: attachment.metadata.fileSize,
        checksum: crypto.createHash('md5').update(attachment.id).digest('hex'),
      },
      access_controls: this.generateAttachmentAccessControls(attachment, page, space),
      created_at: new Date(attachment.version.when),
      updated_at: new Date(attachment.version.when),
    };
  }

  /**
   * Format page content for indexing
   */
  private formatPageContent(page: ConfluencePage): string {
    let content = `${page.title}\n\n`;
    
    // Add breadcrumb path
    if (page.ancestors && page.ancestors.length > 0) {
      const breadcrumb = page.ancestors.map(a => a.title).join(' > ');
      content += `Path: ${breadcrumb} > ${page.title}\n\n`;
    }
    
    // Add the actual content (strip HTML tags for better indexing)
    const bodyContent = page.body.storage.value
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    content += bodyContent;
    
    return content;
  }

  /**
   * Format comment content for indexing
   */
  private formatCommentContent(comment: ConfluenceComment, page: ConfluencePage): string {
    const bodyContent = comment.body.storage.value
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return `Comment on "${page.title}" by ${comment.version.by.displayName}:\n\n${bodyContent}`;
  }

  /**
   * Extract labels from Confluence content
   */
  private extractLabelsFromContent(content: string): string[] {
    const labels: string[] = [];
    
    // Extract Confluence labels/macros
    const macroMatches = content.match(/ac:name="([^"]+)"/g);
    if (macroMatches) {
      labels.push(...macroMatches.map(match => match.replace(/ac:name="([^"]+)"/, '$1')));
    }
    
    // Extract @mentions
    const mentionMatches = content.match(/@\w+/g);
    if (mentionMatches) {
      labels.push(...mentionMatches.map(mention => `mention:${mention.substring(1)}`));
    }
    
    return labels;
  }

  /**
   * Generate access controls for pages with space-level restrictions
   */
  private generatePageAccessControls(page: ConfluencePage, space: ConfluenceSpace): any[] {
    const controls = [];

    // Space-level access (primary boundary)
    controls.push({
      type: 'team',
      identifier: space.key,
      permission: 'read',
    });

    // Page author access
    controls.push({
      type: 'user',
      identifier: page.version.by.email,
      permission: 'read',
    });

    // Page-specific restrictions
    if (page.restrictions?.read?.restrictions) {
      // User restrictions
      if (page.restrictions.read.restrictions.user?.results) {
        for (const user of page.restrictions.read.restrictions.user.results) {
          controls.push({
            type: 'user',
            identifier: user.email,
            permission: 'read',
          });
        }
      }

      // Group restrictions
      if (page.restrictions.read.restrictions.group?.results) {
        for (const group of page.restrictions.read.restrictions.group.results) {
          controls.push({
            type: 'role',
            identifier: group.name,
            permission: 'read',
          });
        }
      }
    }

    // Space-level permissions
    if (space.permissions) {
      for (const permission of space.permissions) {
        if (permission.operation.operation === 'read') {
          // User permissions
          if (permission.subjects.user?.results) {
            for (const user of permission.subjects.user.results) {
              controls.push({
                type: 'user',
                identifier: user.email,
                permission: 'read',
              });
            }
          }

          // Group permissions
          if (permission.subjects.group?.results) {
            for (const group of permission.subjects.group.results) {
              controls.push({
                type: 'role',
                identifier: group.name,
                permission: 'read',
              });
            }
          }
        }
      }
    }

    return controls;
  }

  /**
   * Generate access controls for comments
   */
  private generateCommentAccessControls(comment: ConfluenceComment, page: ConfluencePage, space: ConfluenceSpace): any[] {
    const controls = this.generatePageAccessControls(page, space);

    // Comment author access
    controls.push({
      type: 'user',
      identifier: comment.version.by.email,
      permission: 'read',
    });

    return controls;
  }

  /**
   * Generate access controls for attachments
   */
  private generateAttachmentAccessControls(attachment: ConfluenceAttachment, page: ConfluencePage, space: ConfluenceSpace): any[] {
    const controls = this.generatePageAccessControls(page, space);

    // Attachment author access
    controls.push({
      type: 'user',
      identifier: attachment.version.by.email,
      permission: 'read',
    });

    return controls;
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!this.credentials.webhook_secret) {
      this.log('warn', 'No webhook secret configured, skipping signature verification');
      return true; // Allow if no secret is configured
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.credentials.webhook_secret)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle webhook events for real-time updates
   */
  async handleWebhookEvent(event: any): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      switch (event.eventType) {
        case 'page_created':
        case 'page_updated':
          const pageDoc = await this.handlePageEvent(event);
          if (pageDoc) documents.push(pageDoc);
          break;

        case 'page_removed':
          // Handle page deletions
          this.log('info', 'Page deleted', { pageId: event.page?.id });
          break;

        case 'comment_created':
        case 'comment_updated':
          const commentDoc = await this.handleCommentEvent(event);
          if (commentDoc) documents.push(commentDoc);
          break;

        case 'comment_removed':
          // Handle comment deletions
          this.log('info', 'Comment deleted', { 
            pageId: event.page?.id,
            commentId: event.comment?.id 
          });
          break;

        case 'attachment_created':
          const attachmentDoc = await this.handleAttachmentEvent(event);
          if (attachmentDoc) documents.push(attachmentDoc);
          break;

        case 'attachment_removed':
          // Handle attachment deletions
          this.log('info', 'Attachment deleted', { 
            pageId: event.page?.id,
            attachmentId: event.attachment?.id 
          });
          break;

        default:
          this.log('info', 'Unhandled webhook event type', { type: event.eventType });
      }

    } catch (error) {
      this.log('error', 'Error handling webhook event', {
        error: error instanceof Error ? error.message : String(error),
        event: event.eventType,
      });
    }

    return documents;
  }

  private async handlePageEvent(event: any): Promise<Document | null> {
    try {
      const page = event.page;
      const space = await this.getSpaceInfo(page.space.key);
      
      if (!space) {
        return null;
      }

      // Fetch full page details
      const fullPage = await this.fetchDocument(`${space.key}:${page.id}`);
      return fullPage;
    } catch (error) {
      this.log('error', 'Failed to handle page event', {
        error: error instanceof Error ? error.message : String(error),
        pageId: event.page?.id,
      });
      return null;
    }
  }

  private async handleCommentEvent(event: any): Promise<Document | null> {
    try {
      const page = event.page;
      const comment = event.comment;
      const space = await this.getSpaceInfo(page.space.key);
      
      if (!space) {
        return null;
      }

      return await this.convertCommentToDocument(comment, page, space);
    } catch (error) {
      this.log('error', 'Failed to handle comment event', {
        error: error instanceof Error ? error.message : String(error),
        pageId: event.page?.id,
        commentId: event.comment?.id,
      });
      return null;
    }
  }

  private async handleAttachmentEvent(event: any): Promise<Document | null> {
    try {
      const page = event.page;
      const attachment = event.attachment;
      const space = await this.getSpaceInfo(page.space.key);
      
      if (!space) {
        return null;
      }

      return await this.convertAttachmentToDocument(attachment, page, space);
    } catch (error) {
      this.log('error', 'Failed to handle attachment event', {
        error: error instanceof Error ? error.message : String(error),
        pageId: event.page?.id,
        attachmentId: event.attachment?.id,
      });
      return null;
    }
  }
}