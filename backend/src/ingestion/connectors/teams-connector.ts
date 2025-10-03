/**
 * Microsoft Teams connector for ingesting messages and files via Graph API
 */

import { BaseConnector, ConnectorCredentials, SyncOptions, ConnectorMetrics } from './base-connector';
import { Document, ConnectorConfig } from '../types';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

interface TeamsCredentials extends ConnectorCredentials {
  client_id: string;
  client_secret: string;
  tenant_id: string;
  access_token?: string;
  refresh_token?: string;
}

interface TeamsMessage {
  id: string;
  messageType: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  body: {
    content: string;
    contentType: string;
  };
  from: {
    user?: {
      id: string;
      displayName: string;
      userIdentityType: string;
    };
  };
  attachments?: TeamsAttachment[];
  mentions?: TeamsMention[];
  reactions?: TeamsReaction[];
  replies?: TeamsMessage[];
}

interface TeamsAttachment {
  id: string;
  contentType: string;
  name: string;
  contentUrl?: string;
  content?: any;
}

interface TeamsMention {
  id: number;
  mentionText: string;
  mentioned: {
    user: {
      id: string;
      displayName: string;
    };
  };
}

interface TeamsReaction {
  reactionType: string;
  user: {
    id: string;
    displayName: string;
  };
  createdDateTime: string;
}

interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
  membershipType: string;
  isFavoriteByDefault: boolean;
}

interface TeamsTeam {
  id: string;
  displayName: string;
  description?: string;
  visibility: string;
}

interface TeamsUser {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName: string;
}

export class TeamsConnector extends BaseConnector {
  private client: AxiosInstance;
  protected credentials: TeamsCredentials;
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
    this.credentials = config.credentials as TeamsCredentials;
    
    this.client = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      timeout: 30000,
    });

    // Add response interceptor for token refresh and rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            error.config.headers['Authorization'] = `Bearer ${this.credentials.access_token}`;
            return this.client.request(error.config);
          }
        } else if (error.response?.status === 429) {
          // Rate limited
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );

    // Set initial authorization header if we have a token
    if (this.credentials.access_token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.credentials.access_token}`;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.credentials.access_token) {
        const authenticated = await this.authenticate();
        if (!authenticated) return false;
      }

      const response = await this.client.get('/me');
      return response.status === 200;
    } catch (error) {
      this.log('error', 'Connection test failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async authenticate(): Promise<boolean> {
    try {
      const tokenResponse = await this.getAccessToken();
      if (tokenResponse) {
        this.credentials.access_token = tokenResponse.access_token;
        this.credentials.refresh_token = tokenResponse.refresh_token;
        this.client.defaults.headers.common['Authorization'] = `Bearer ${tokenResponse.access_token}`;
        
        this.log('info', 'Authentication successful');
        return true;
      }
      return false;
    } catch (error) {
      this.log('error', 'Authentication failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async fetchDocuments(options: SyncOptions = {}): Promise<Document[]> {
    const startTime = Date.now();
    const documents: Document[] = [];

    try {
      // Get teams accessible to the user
      const teams = await this.getTeams();
      
      for (const team of teams) {
        // Skip teams not in team boundaries if specified
        if (options.teamIds && !options.teamIds.includes(team.id)) {
          continue;
        }

        try {
          const channels = await this.getTeamChannels(team.id);
          
          for (const channel of channels) {
            const messages = await this.getChannelMessages(team.id, channel.id, options);
            const channelDocs = await this.convertMessagesToDocuments(messages, team, channel);
            
            // Apply team boundary validation
            const validDocs = channelDocs.filter(doc => this.validateTeamBoundaries(doc));
            documents.push(...validDocs);
            
            this.metrics.documentsProcessed += validDocs.length;
            this.metrics.documentsSkipped += channelDocs.length - validDocs.length;
          }
          
        } catch (error) {
          this.log('error', `Error fetching messages from team ${team.displayName}`, { 
            error: error instanceof Error ? error.message : String(error),
            teamId: team.id 
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
      this.log('error', 'Failed to fetch documents', { error: error instanceof Error ? error.message : String(error) });
      this.metrics.errors++;
      throw error;
    }
  }

  async fetchDocument(id: string): Promise<Document | null> {
    try {
      // Parse message ID (format: team_id:channel_id:message_id)
      const [teamId, channelId, messageId] = id.split(':');
      if (!teamId || !channelId || !messageId) {
        throw new Error('Invalid message ID format');
      }

      const response = await this.client.get(
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}`
      );

      if (response.status !== 200) {
        return null;
      }

      const message = response.data;
      const team = await this.getTeamInfo(teamId);
      const channel = await this.getChannelInfo(teamId, channelId);
      
      if (!team || !channel) {
        return null;
      }

      const documents = await this.convertMessagesToDocuments([message], team, channel);
      return documents[0] || null;

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
   * Get access token using client credentials flow
   */
  private async getAccessToken(): Promise<any> {
    const tokenUrl = `https://login.microsoftonline.com/${this.credentials.tenant_id}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', this.credentials.client_id);
    params.append('client_secret', this.credentials.client_secret);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    try {
      if (!this.credentials.refresh_token) {
        return await this.authenticate();
      }

      const tokenUrl = `https://login.microsoftonline.com/${this.credentials.tenant_id}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams();
      params.append('client_id', this.credentials.client_id);
      params.append('client_secret', this.credentials.client_secret);
      params.append('refresh_token', this.credentials.refresh_token);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.credentials.access_token = response.data.access_token;
      this.credentials.refresh_token = response.data.refresh_token;
      this.client.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;

      return true;
    } catch (error) {
      this.log('error', 'Failed to refresh access token', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get all teams accessible to the application
   */
  private async getTeams(): Promise<TeamsTeam[]> {
    const teams: TeamsTeam[] = [];
    let nextLink: string | undefined = '/me/joinedTeams';

    do {
      const response = await this.client.get(nextLink);
      
      if (response.data.value) {
        teams.push(...response.data.value);
      }
      
      nextLink = response.data['@odata.nextLink'];
    } while (nextLink);

    return teams;
  }

  /**
   * Get team information
   */
  private async getTeamInfo(teamId: string): Promise<TeamsTeam | null> {
    try {
      const response = await this.client.get(`/teams/${teamId}`);
      return response.data;
    } catch (error) {
      this.log('warn', 'Failed to get team info', { 
        error: error instanceof Error ? error.message : String(error),
        teamId 
      });
      return null;
    }
  }

  /**
   * Get channels for a specific team
   */
  private async getTeamChannels(teamId: string): Promise<TeamsChannel[]> {
    const channels: TeamsChannel[] = [];
    let nextLink: string | undefined = `/teams/${teamId}/channels`;

    do {
      const response = await this.client.get(nextLink);
      
      if (response.data.value) {
        channels.push(...response.data.value);
      }
      
      nextLink = response.data['@odata.nextLink'];
    } while (nextLink);

    return channels;
  }

  /**
   * Get channel information
   */
  private async getChannelInfo(teamId: string, channelId: string): Promise<TeamsChannel | null> {
    try {
      const response = await this.client.get(`/teams/${teamId}/channels/${channelId}`);
      return response.data;
    } catch (error) {
      this.log('warn', 'Failed to get channel info', { 
        error: error instanceof Error ? error.message : String(error),
        teamId,
        channelId 
      });
      return null;
    }
  }

  /**
   * Get messages from a specific channel
   */
  private async getChannelMessages(
    teamId: string,
    channelId: string,
    options: SyncOptions
  ): Promise<TeamsMessage[]> {
    const messages: TeamsMessage[] = [];
    let nextLink: string | undefined = `/teams/${teamId}/channels/${channelId}/messages`;
    
    // Add query parameters
    const params = new URLSearchParams();
    if (options.limit) {
      params.append('$top', options.limit.toString());
    }
    if (options.since) {
      params.append('$filter', `createdDateTime gt ${options.since.toISOString()}`);
    }
    
    if (params.toString()) {
      nextLink += `?${params.toString()}`;
    }

    do {
      const response = await this.client.get(nextLink);
      
      if (response.data.value) {
        const channelMessages = response.data.value;
        
        // Get replies for messages that have them
        for (const message of channelMessages) {
          try {
            const replies = await this.getMessageReplies(teamId, channelId, message.id);
            message.replies = replies;
          } catch (error) {
            this.log('warn', 'Failed to fetch message replies', {
              error: error instanceof Error ? error.message : String(error),
              teamId,
              channelId,
              messageId: message.id,
            });
          }
        }

        messages.push(...channelMessages);
      }
      
      nextLink = response.data['@odata.nextLink'];
    } while (nextLink && (!options.limit || messages.length < options.limit));

    return messages;
  }

  /**
   * Get replies for a specific message
   */
  private async getMessageReplies(
    teamId: string,
    channelId: string,
    messageId: string
  ): Promise<TeamsMessage[]> {
    const replies: TeamsMessage[] = [];
    let nextLink: string | undefined = `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`;

    do {
      const response = await this.client.get(nextLink);
      
      if (response.data.value) {
        replies.push(...response.data.value);
      }
      
      nextLink = response.data['@odata.nextLink'];
    } while (nextLink);

    return replies;
  }

  /**
   * Convert Teams messages to Document format
   */
  private async convertMessagesToDocuments(
    messages: TeamsMessage[],
    team: TeamsTeam,
    channel: TeamsChannel
  ): Promise<Document[]> {
    const documents: Document[] = [];

    for (const message of messages) {
      try {
        // Create main message document
        const document: Document = {
          id: `${team.id}:${channel.id}:${message.id}`,
          source_type: 'teams',
          source_id: message.id,
          team_id: team.id,
          content: this.formatMessageContent(message),
          metadata: {
            title: `Message in ${channel.displayName}`,
            author: message.from?.user?.displayName || 'Unknown',
            channel: channel.displayName,
            team: team.displayName,
            tags: this.extractTags(message.body.content),
            content_type: message.body.contentType,
            size_bytes: Buffer.byteLength(message.body.content || '', 'utf8'),
            checksum: crypto.createHash('md5').update(message.body.content || '').digest('hex'),
          },
          access_controls: this.generateAccessControls(team, channel, message.from?.user),
          created_at: new Date(message.createdDateTime),
          updated_at: new Date(message.lastModifiedDateTime),
        };

        documents.push(this.applyAccessControls(document));

        // Process replies
        if (message.replies) {
          for (const reply of message.replies) {
            const replyDoc: Document = {
              id: `${team.id}:${channel.id}:${reply.id}`,
              source_type: 'teams',
              source_id: reply.id,
              team_id: team.id,
              content: this.formatMessageContent(reply),
              metadata: {
                title: `Reply in ${channel.displayName}`,
                author: reply.from?.user?.displayName || 'Unknown',
                channel: channel.displayName,
                team: team.displayName,
                tags: this.extractTags(reply.body.content),
                content_type: reply.body.contentType,
                size_bytes: Buffer.byteLength(reply.body.content || '', 'utf8'),
                checksum: crypto.createHash('md5').update(reply.body.content || '').digest('hex'),
              },
              access_controls: this.generateAccessControls(team, channel, reply.from?.user),
              created_at: new Date(reply.createdDateTime),
              updated_at: new Date(reply.lastModifiedDateTime),
            };

            documents.push(this.applyAccessControls(replyDoc));
          }
        }

        // Process attachments
        if (message.attachments) {
          for (const attachment of message.attachments) {
            const attachmentDoc = await this.createAttachmentDocument(
              attachment, 
              team, 
              channel, 
              message.from?.user
            );
            if (attachmentDoc) {
              documents.push(this.applyAccessControls(attachmentDoc));
            }
          }
        }

      } catch (error) {
        this.log('warn', 'Failed to convert message to document', {
          error: error instanceof Error ? error.message : String(error),
          messageId: message.id,
          teamId: team.id,
          channelId: channel.id,
        });
      }
    }

    return documents;
  }

  /**
   * Format message content including mentions and formatting
   */
  private formatMessageContent(message: TeamsMessage): string {
    let content = message.body.content || '';
    
    // Handle HTML content type
    if (message.body.contentType === 'html') {
      // Simple HTML to text conversion (in production, use a proper HTML parser)
      content = content
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
    }

    // Add mention context
    if (message.mentions && message.mentions.length > 0) {
      const mentionSummary = message.mentions
        .map(m => `@${m.mentioned.user.displayName}`)
        .join(', ');
      content += `\n[Mentions: ${mentionSummary}]`;
    }

    // Add reaction context
    if (message.reactions && message.reactions.length > 0) {
      const reactionSummary = message.reactions
        .map(r => `${r.reactionType} by ${r.user.displayName}`)
        .join(', ');
      content += `\n[Reactions: ${reactionSummary}]`;
    }

    return content;
  }

  /**
   * Extract hashtags and mentions as tags
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    
    // Extract hashtags
    const hashtags = content.match(/#\w+/g);
    if (hashtags) {
      tags.push(...hashtags.map(tag => tag.substring(1)));
    }

    // Extract mentions (Teams uses different format)
    const mentions = content.match(/@\w+/g);
    if (mentions) {
      tags.push(...mentions.map(mention => `mention:${mention.substring(1)}`));
    }

    return tags;
  }

  /**
   * Generate access controls based on team, channel, and user
   */
  private generateAccessControls(
    team: TeamsTeam,
    channel: TeamsChannel,
    user?: TeamsUser
  ): any[] {
    const controls = [];

    // Team-based access
    controls.push({
      type: 'team',
      identifier: team.id,
      permission: 'read',
    });

    // Channel-based access (if private)
    if (channel.membershipType === 'private') {
      controls.push({
        type: 'channel',
        identifier: channel.id,
        permission: 'read',
      });
    }

    // User-based access
    if (user) {
      controls.push({
        type: 'user',
        identifier: user.id,
        permission: 'read',
      });
    }

    return controls;
  }

  /**
   * Create document for attachment
   */
  private async createAttachmentDocument(
    attachment: TeamsAttachment,
    team: TeamsTeam,
    channel: TeamsChannel,
    user?: TeamsUser
  ): Promise<Document | null> {
    try {
      const document: Document = {
        id: `${team.id}:${channel.id}:attachment:${attachment.id}`,
        source_type: 'teams',
        source_id: attachment.id,
        team_id: team.id,
        content: `Attachment: ${attachment.name}\nType: ${attachment.contentType}`,
        metadata: {
          title: attachment.name,
          author: user?.displayName || 'Unknown',
          channel: channel.displayName,
          team: team.displayName,
          tags: ['attachment', attachment.contentType.split('/')[0]],
          content_type: attachment.contentType,
          size_bytes: 0, // Teams API doesn't always provide size
          checksum: crypto.createHash('md5').update(attachment.id).digest('hex'),
        },
        access_controls: this.generateAccessControls(team, channel, user),
        created_at: new Date(),
        updated_at: new Date(),
      };

      return document;
    } catch (error) {
      this.log('warn', 'Failed to create attachment document', {
        error: error instanceof Error ? error.message : String(error),
        attachmentId: attachment.id,
      });
      return null;
    }
  }

  /**
   * Handle webhook events for real-time updates
   */
  async handleWebhookEvent(event: any): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      switch (event.changeType) {
        case 'created':
          if (event.resource.includes('/messages/')) {
            const newDoc = await this.handleMessageCreated(event);
            if (newDoc) documents.push(newDoc);
          }
          break;

        case 'updated':
          if (event.resource.includes('/messages/')) {
            const updatedDoc = await this.handleMessageUpdated(event);
            if (updatedDoc) documents.push(updatedDoc);
          }
          break;

        case 'deleted':
          // Handle message deletions - you might want to mark as deleted
          // rather than actually delete from your system
          break;

        default:
          this.log('info', 'Unhandled webhook event type', { changeType: event.changeType });
      }

    } catch (error) {
      this.log('error', 'Error handling webhook event', {
        error: error instanceof Error ? error.message : String(error),
        changeType: event.changeType,
      });
    }

    return documents;
  }

  private async handleMessageCreated(event: any): Promise<Document | null> {
    try {
      // Extract team and channel IDs from resource path
      const resourceMatch = event.resource.match(/teams\/([^\/]+)\/channels\/([^\/]+)\/messages\/([^\/]+)/);
      if (!resourceMatch) return null;

      const [, teamId, channelId, messageId] = resourceMatch;
      
      const team = await this.getTeamInfo(teamId);
      const channel = await this.getChannelInfo(teamId, channelId);
      
      if (!team || !channel) return null;

      const response = await this.client.get(`/teams/${teamId}/channels/${channelId}/messages/${messageId}`);
      const message = response.data;

      const documents = await this.convertMessagesToDocuments([message], team, channel);
      return documents[0] || null;
    } catch (error) {
      this.log('error', 'Failed to handle message created event', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private async handleMessageUpdated(event: any): Promise<Document | null> {
    // Similar to handleMessageCreated but for updates
    return this.handleMessageCreated(event);
  }
}