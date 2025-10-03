/**
 * Jira connector for ingesting issues, comments, and attachments
 */

import { BaseConnector, ConnectorCredentials, SyncOptions, ConnectorMetrics } from './base-connector.js';
import { Document, ConnectorConfig } from '../types.js';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

interface JiraCredentials extends ConnectorCredentials {
  base_url: string;
  username: string;
  api_token: string;
  webhook_secret?: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string };
    priority: { name: string };
    issuetype: { name: string };
    project: { key: string; name: string };
    assignee?: { displayName: string; emailAddress: string };
    reporter: { displayName: string; emailAddress: string };
    created: string;
    updated: string;
    labels: string[];
    components: Array<{ name: string }>;
    fixVersions: Array<{ name: string }>;
    attachment?: JiraAttachment[];
  };
}

interface JiraComment {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  body: string;
  created: string;
  updated: string;
}

interface JiraAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  content: string;
  created: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  lead: {
    displayName: string;
    emailAddress: string;
  };
}

export class JiraConnector extends BaseConnector {
  private client: AxiosInstance;
  protected credentials: JiraCredentials;
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
    this.credentials = config.credentials as JiraCredentials;
    
    this.client = axios.create({
      baseURL: `${this.credentials.base_url}/rest/api/3`,
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
      const response = await this.client.get('/myself');
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
      const response = await this.client.get('/myself');
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
      // Get projects accessible to the user
      const projects = await this.getProjects();
      
      for (const project of projects) {
        // Skip projects not in team boundaries if specified
        if (options.teamIds && !options.teamIds.includes(project.key)) {
          continue;
        }

        try {
          const issues = await this.getProjectIssues(project, options);
          
          for (const issue of issues) {
            // Create document for the issue itself
            const issueDoc = await this.convertIssueToDocument(issue, project);
            if (issueDoc && this.validateTeamBoundaries(issueDoc)) {
              documents.push(this.applyAccessControls(issueDoc));
              this.metrics.documentsProcessed++;
            } else {
              this.metrics.documentsSkipped++;
            }

            // Get comments for the issue
            const comments = await this.getIssueComments(issue.key);
            for (const comment of comments) {
              const commentDoc = await this.convertCommentToDocument(comment, issue, project);
              if (commentDoc && this.validateTeamBoundaries(commentDoc)) {
                documents.push(this.applyAccessControls(commentDoc));
                this.metrics.documentsProcessed++;
              } else {
                this.metrics.documentsSkipped++;
              }
            }

            // Process attachments
            if (issue.fields.attachment) {
              for (const attachment of issue.fields.attachment) {
                const attachmentDoc = await this.convertAttachmentToDocument(attachment, issue, project);
                if (attachmentDoc && this.validateTeamBoundaries(attachmentDoc)) {
                  documents.push(this.applyAccessControls(attachmentDoc));
                  this.metrics.documentsProcessed++;
                } else {
                  this.metrics.documentsSkipped++;
                }
              }
            }
          }
          
        } catch (error) {
          this.log('error', `Error fetching issues from project ${project.key}`, { 
            error: error instanceof Error ? error.message : String(error),
            project: project.key 
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
      // Parse document ID (format: project_key:issue_key or project_key:issue_key:comment_id)
      const parts = id.split(':');
      if (parts.length < 2) {
        throw new Error('Invalid document ID format');
      }

      const [projectKey, issueKey, commentId] = parts;
      
      // Get issue details
      const response = await this.client.get(`/issue/${issueKey}`, {
        params: {
          expand: 'comments,attachments',
        },
      });

      if (response.status !== 200) {
        return null;
      }

      const issue = response.data;
      const project = await this.getProjectInfo(projectKey);
      
      if (!project) {
        return null;
      }

      if (commentId) {
        // Return specific comment
        const comment = issue.fields.comment?.comments?.find((c: any) => c.id === commentId);
        if (comment) {
          return await this.convertCommentToDocument(comment, issue, project);
        }
      } else {
        // Return the issue itself
        return await this.convertIssueToDocument(issue, project);
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
   * Get all projects accessible to the user
   */
  private async getProjects(): Promise<JiraProject[]> {
    try {
      const response = await this.client.get('/project', {
        params: {
          expand: 'lead',
        },
      });

      return response.data || [];
    } catch (error) {
      this.log('error', 'Failed to fetch projects', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }

  /**
   * Get project information
   */
  private async getProjectInfo(projectKey: string): Promise<JiraProject | null> {
    try {
      const response = await this.client.get(`/project/${projectKey}`, {
        params: {
          expand: 'lead',
        },
      });

      return response.status === 200 ? response.data : null;
    } catch (error) {
      this.log('warn', 'Failed to get project info', { 
        error: error instanceof Error ? error.message : String(error),
        projectKey 
      });
      return null;
    }
  }

  /**
   * Get issues from a specific project
   */
  private async getProjectIssues(project: JiraProject, options: SyncOptions): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = options.limit || 100;

    // Build JQL query
    let jql = `project = "${project.key}"`;
    
    if (options.since) {
      const sinceStr = options.since.toISOString().split('T')[0];
      jql += ` AND updated >= "${sinceStr}"`;
    }

    jql += ' ORDER BY updated DESC';

    do {
      try {
        const response = await this.client.get('/search', {
          params: {
            jql,
            startAt,
            maxResults,
            expand: 'comments,attachments',
            fields: 'summary,description,status,priority,issuetype,project,assignee,reporter,created,updated,labels,components,fixVersions,attachment',
          },
        });

        if (!response.data.issues) {
          break;
        }

        issues.push(...response.data.issues);
        startAt += maxResults;

        // Break if we've fetched all issues or reached the limit
        if (response.data.issues.length < maxResults || 
            (options.limit && issues.length >= options.limit)) {
          break;
        }

      } catch (error) {
        this.log('error', 'Failed to fetch issues', { 
          error: error instanceof Error ? error.message : String(error),
          project: project.key,
          startAt 
        });
        break;
      }
    } while (true);

    return issues;
  }

  /**
   * Get comments for a specific issue
   */
  private async getIssueComments(issueKey: string): Promise<JiraComment[]> {
    try {
      const response = await this.client.get(`/issue/${issueKey}/comment`, {
        params: {
          expand: 'body',
        },
      });

      return response.data.comments || [];
    } catch (error) {
      this.log('warn', 'Failed to fetch comments', { 
        error: error instanceof Error ? error.message : String(error),
        issueKey 
      });
      return [];
    }
  }

  /**
   * Convert Jira issue to Document format
   */
  private async convertIssueToDocument(issue: JiraIssue, project: JiraProject): Promise<Document> {
    const content = this.formatIssueContent(issue);
    
    return {
      id: `${project.key}:${issue.key}`,
      source_type: 'jira',
      source_id: issue.id,
      team_id: project.key, // Using project as team boundary
      content,
      metadata: {
        title: `${issue.key}: ${issue.fields.summary}`,
        author: issue.fields.reporter.displayName,
        project_key: project.key,
        tags: [
          ...issue.fields.labels,
          issue.fields.status.name.toLowerCase(),
          issue.fields.priority.name.toLowerCase(),
          issue.fields.issuetype.name.toLowerCase(),
          ...issue.fields.components.map(c => c.name),
          ...issue.fields.fixVersions.map(v => v.name),
        ],
        content_type: 'text/plain',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        checksum: crypto.createHash('md5').update(content).digest('hex'),
      },
      access_controls: this.generateIssueAccessControls(issue, project),
      created_at: new Date(issue.fields.created),
      updated_at: new Date(issue.fields.updated),
    };
  }

  /**
   * Convert Jira comment to Document format
   */
  private async convertCommentToDocument(
    comment: JiraComment, 
    issue: JiraIssue, 
    project: JiraProject
  ): Promise<Document> {
    const content = this.formatCommentContent(comment, issue);
    
    return {
      id: `${project.key}:${issue.key}:${comment.id}`,
      source_type: 'jira',
      source_id: comment.id,
      team_id: project.key,
      content,
      metadata: {
        title: `Comment on ${issue.key}`,
        author: comment.author.displayName,
        project_key: project.key,
        tags: ['comment', issue.fields.issuetype.name.toLowerCase()],
        content_type: 'text/plain',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        checksum: crypto.createHash('md5').update(content).digest('hex'),
      },
      access_controls: this.generateCommentAccessControls(comment, issue, project),
      created_at: new Date(comment.created),
      updated_at: new Date(comment.updated),
    };
  }

  /**
   * Convert Jira attachment to Document format
   */
  private async convertAttachmentToDocument(
    attachment: JiraAttachment, 
    issue: JiraIssue, 
    project: JiraProject
  ): Promise<Document> {
    const content = `Attachment: ${attachment.filename}\nType: ${attachment.mimeType}\nSize: ${attachment.size} bytes\nAttached to: ${issue.key}`;
    
    return {
      id: `${project.key}:${issue.key}:attachment:${attachment.id}`,
      source_type: 'jira',
      source_id: attachment.id,
      team_id: project.key,
      content,
      metadata: {
        title: attachment.filename,
        author: attachment.author.displayName,
        project_key: project.key,
        tags: ['attachment', attachment.mimeType.split('/')[0]],
        content_type: attachment.mimeType,
        size_bytes: attachment.size,
        checksum: crypto.createHash('md5').update(attachment.id).digest('hex'),
      },
      access_controls: this.generateAttachmentAccessControls(attachment, issue, project),
      created_at: new Date(attachment.created),
      updated_at: new Date(attachment.created),
    };
  }

  /**
   * Format issue content for indexing
   */
  private formatIssueContent(issue: JiraIssue): string {
    let content = `${issue.key}: ${issue.fields.summary}\n\n`;
    
    if (issue.fields.description) {
      content += `Description:\n${issue.fields.description}\n\n`;
    }
    
    content += `Status: ${issue.fields.status.name}\n`;
    content += `Priority: ${issue.fields.priority.name}\n`;
    content += `Type: ${issue.fields.issuetype.name}\n`;
    content += `Project: ${issue.fields.project.name}\n`;
    
    if (issue.fields.assignee) {
      content += `Assignee: ${issue.fields.assignee.displayName}\n`;
    }
    
    content += `Reporter: ${issue.fields.reporter.displayName}\n`;
    
    if (issue.fields.labels.length > 0) {
      content += `Labels: ${issue.fields.labels.join(', ')}\n`;
    }
    
    if (issue.fields.components.length > 0) {
      content += `Components: ${issue.fields.components.map(c => c.name).join(', ')}\n`;
    }
    
    if (issue.fields.fixVersions.length > 0) {
      content += `Fix Versions: ${issue.fields.fixVersions.map(v => v.name).join(', ')}\n`;
    }

    return content;
  }

  /**
   * Format comment content for indexing
   */
  private formatCommentContent(comment: JiraComment, issue: JiraIssue): string {
    return `Comment on ${issue.key} by ${comment.author.displayName}:\n\n${comment.body}`;
  }

  /**
   * Generate access controls for issues
   */
  private generateIssueAccessControls(issue: JiraIssue, project: JiraProject): any[] {
    const controls = [];

    // Project-based access
    controls.push({
      type: 'team',
      identifier: project.key,
      permission: 'read',
    });

    // Reporter access
    controls.push({
      type: 'user',
      identifier: issue.fields.reporter.emailAddress,
      permission: 'read',
    });

    // Assignee access
    if (issue.fields.assignee) {
      controls.push({
        type: 'user',
        identifier: issue.fields.assignee.emailAddress,
        permission: 'read',
      });
    }

    return controls;
  }

  /**
   * Generate access controls for comments
   */
  private generateCommentAccessControls(comment: JiraComment, issue: JiraIssue, project: JiraProject): any[] {
    const controls = this.generateIssueAccessControls(issue, project);

    // Comment author access
    controls.push({
      type: 'user',
      identifier: comment.author.emailAddress,
      permission: 'read',
    });

    return controls;
  }

  /**
   * Generate access controls for attachments
   */
  private generateAttachmentAccessControls(attachment: JiraAttachment, issue: JiraIssue, project: JiraProject): any[] {
    const controls = this.generateIssueAccessControls(issue, project);

    // Attachment author access
    controls.push({
      type: 'user',
      identifier: attachment.author.emailAddress,
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
      switch (event.webhookEvent) {
        case 'jira:issue_created':
        case 'jira:issue_updated':
          const issueDoc = await this.handleIssueEvent(event);
          if (issueDoc) documents.push(issueDoc);
          break;

        case 'jira:issue_deleted':
          // Handle issue deletions - you might want to mark as deleted
          this.log('info', 'Issue deleted', { issueKey: event.issue?.key });
          break;

        case 'comment_created':
        case 'comment_updated':
          const commentDoc = await this.handleCommentEvent(event);
          if (commentDoc) documents.push(commentDoc);
          break;

        case 'comment_deleted':
          // Handle comment deletions
          this.log('info', 'Comment deleted', { 
            issueKey: event.issue?.key,
            commentId: event.comment?.id 
          });
          break;

        default:
          this.log('info', 'Unhandled webhook event type', { type: event.webhookEvent });
      }

    } catch (error) {
      this.log('error', 'Error handling webhook event', {
        error: error instanceof Error ? error.message : String(error),
        event: event.webhookEvent,
      });
    }

    return documents;
  }

  private async handleIssueEvent(event: any): Promise<Document | null> {
    try {
      const issue = event.issue;
      const project = await this.getProjectInfo(issue.fields.project.key);
      
      if (!project) {
        return null;
      }

      return await this.convertIssueToDocument(issue, project);
    } catch (error) {
      this.log('error', 'Failed to handle issue event', {
        error: error instanceof Error ? error.message : String(error),
        issueKey: event.issue?.key,
      });
      return null;
    }
  }

  private async handleCommentEvent(event: any): Promise<Document | null> {
    try {
      const issue = event.issue;
      const comment = event.comment;
      const project = await this.getProjectInfo(issue.fields.project.key);
      
      if (!project) {
        return null;
      }

      return await this.convertCommentToDocument(comment, issue, project);
    } catch (error) {
      this.log('error', 'Failed to handle comment event', {
        error: error instanceof Error ? error.message : String(error),
        issueKey: event.issue?.key,
        commentId: event.comment?.id,
      });
      return null;
    }
  }
}