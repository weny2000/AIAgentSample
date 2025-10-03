/**
 * Slack connector for ingesting messages and files
 */

import { BaseConnector, ConnectorCredentials, SyncOptions, ConnectorMetrics } from './base-connector.js';
import { Document, ConnectorConfig } from '../types.js';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

interface SlackCredentials extends ConnectorCredentials {
  bot_token: string;
  app_token?: string;
  signing_secret: string;
  client_id: string;
  client_secret: string;
}

interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  channel: string;
  thread_ts?: string;
  files?: SlackFile[];
  reactions?: SlackReaction[];
  replies?: SlackMessage[];
}

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  size: number;
}

interface SlackReaction {
  name: string;
  users: string[];
  count: number;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
  members?: string[];
}

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  email?: string;
  team_id: string;
}

export class SlackConnector extends BaseConnector {
  private client: AxiosInstance;
  protected credentials: SlackCredentials;
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
    this.credentials = config.credentials as SlackCredentials;
    
    this.client = axios.create({
      baseURL: 'https://slack.com/api',
      headers: {
        'Authorization': `Bearer ${this.credentials.bot_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '1');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/auth.test');
      return response.data.ok === true;
    } catch (error) {
      this.log('error', 'Connection test failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await this.client.get('/auth.test');
      if (response.data.ok) {
        this.log('info', 'Authentication successful', { 
          team: response.data.team,
          user: response.data.user 
        });
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
      // Get channels accessible to the bot
      const channels = await this.getChannels();
      
      for (const channel of channels) {
        // Skip channels not in team boundaries if specified
        if (options.teamIds && !options.teamIds.includes(channel.id)) {
          continue;
        }

        try {
          const messages = await this.getChannelMessages(channel, options);
          const channelDocs = await this.convertMessagesToDocuments(messages, channel);
          
          // Apply team boundary validation
          const validDocs = channelDocs.filter(doc => this.validateTeamBoundaries(doc));
          documents.push(...validDocs);
          
          this.metrics.documentsProcessed += validDocs.length;
          this.metrics.documentsSkipped += channelDocs.length - validDocs.length;
          
        } catch (error) {
          this.log('error', `Error fetching messages from channel ${channel.name}`, { 
            error: error instanceof Error ? error.message : String(error),
            channel: channel.id 
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
      // Parse message ID (format: channel_id:message_ts)
      const [channelId, messageTs] = id.split(':');
      if (!channelId || !messageTs) {
        throw new Error('Invalid message ID format');
      }

      const response = await this.client.get('/conversations.history', {
        params: {
          channel: channelId,
          latest: messageTs,
          limit: 1,
          inclusive: true,
        },
      });

      if (!response.data.ok || !response.data.messages?.length) {
        return null;
      }

      const message = response.data.messages[0];
      const channel = await this.getChannelInfo(channelId);
      
      if (!channel) {
        return null;
      }

      const documents = await this.convertMessagesToDocuments([message], channel);
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
   * Get all channels accessible to the bot
   */
  private async getChannels(): Promise<SlackChannel[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.client.get('/conversations.list', {
        params: {
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: 200,
          cursor,
        },
      });

      if (!response.data.ok) {
        throw new Error(`Failed to fetch channels: ${response.data.error}`);
      }

      channels.push(...response.data.channels);
      cursor = response.data.response_metadata?.next_cursor;

    } while (cursor);

    return channels;
  }

  /**
   * Get channel information
   */
  private async getChannelInfo(channelId: string): Promise<SlackChannel | null> {
    try {
      const response = await this.client.get('/conversations.info', {
        params: { channel: channelId },
      });

      return response.data.ok ? response.data.channel : null;
    } catch (error) {
      this.log('warn', 'Failed to get channel info', { 
        error: error instanceof Error ? error.message : String(error),
        channelId 
      });
      return null;
    }
  }

  /**
   * Get messages from a specific channel
   */
  private async getChannelMessages(
    channel: SlackChannel, 
    options: SyncOptions
  ): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;
    const oldest = options.since?.getTime() ? (options.since.getTime() / 1000).toString() : undefined;

    do {
      const response = await this.client.get('/conversations.history', {
        params: {
          channel: channel.id,
          limit: options.limit || 200,
          oldest,
          cursor,
        },
      });

      if (!response.data.ok) {
        throw new Error(`Failed to fetch messages: ${response.data.error}`);
      }

      const channelMessages = response.data.messages || [];
      
      // Get thread replies for messages that have them
      for (const message of channelMessages) {
        if (message.thread_ts && message.thread_ts === message.ts) {
          try {
            const replies = await this.getThreadReplies(channel.id, message.thread_ts);
            message.replies = replies;
          } catch (error) {
            this.log('warn', 'Failed to fetch thread replies', {
              error: error instanceof Error ? error.message : String(error),
              channel: channel.id,
              thread_ts: message.thread_ts,
            });
          }
        }
      }

      messages.push(...channelMessages);
      cursor = response.data.response_metadata?.next_cursor;

    } while (cursor && (!options.limit || messages.length < options.limit));

    return messages;
  }

  /**
   * Get thread replies for a message
   */
  private async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    const response = await this.client.get('/conversations.replies', {
      params: {
        channel: channelId,
        ts: threadTs,
        limit: 200,
      },
    });

    if (!response.data.ok) {
      throw new Error(`Failed to fetch thread replies: ${response.data.error}`);
    }

    // Remove the parent message from replies
    return response.data.messages?.slice(1) || [];
  }

  /**
   * Convert Slack messages to Document format
   */
  private async convertMessagesToDocuments(
    messages: SlackMessage[], 
    channel: SlackChannel
  ): Promise<Document[]> {
    const documents: Document[] = [];

    for (const message of messages) {
      try {
        // Get user info for author
        const user = await this.getUserInfo(message.user);
        
        // Create main message document
        const document: Document = {
          id: `${channel.id}:${message.ts}`,
          source_type: 'slack',
          source_id: message.ts,
          team_id: channel.id, // Using channel as team boundary
          content: this.formatMessageContent(message),
          metadata: {
            title: `Message in #${channel.name}`,
            author: user?.real_name || user?.name || message.user,
            channel: channel.name,
            tags: this.extractTags(message.text),
            content_type: 'text/plain',
            size_bytes: Buffer.byteLength(message.text || '', 'utf8'),
            checksum: crypto.createHash('md5').update(message.text || '').digest('hex'),
          },
          access_controls: this.generateAccessControls(channel, user),
          created_at: new Date(parseFloat(message.ts) * 1000),
          updated_at: new Date(parseFloat(message.ts) * 1000),
        };

        documents.push(this.applyAccessControls(document));

        // Process thread replies
        if (message.replies) {
          for (const reply of message.replies) {
            const replyUser = await this.getUserInfo(reply.user);
            const replyDoc: Document = {
              id: `${channel.id}:${reply.ts}`,
              source_type: 'slack',
              source_id: reply.ts,
              team_id: channel.id,
              content: this.formatMessageContent(reply),
              metadata: {
                title: `Reply in #${channel.name}`,
                author: replyUser?.real_name || replyUser?.name || reply.user,
                channel: channel.name,
                tags: this.extractTags(reply.text),
                content_type: 'text/plain',
                size_bytes: Buffer.byteLength(reply.text || '', 'utf8'),
                checksum: crypto.createHash('md5').update(reply.text || '').digest('hex'),
              },
              access_controls: this.generateAccessControls(channel, replyUser),
              created_at: new Date(parseFloat(reply.ts) * 1000),
              updated_at: new Date(parseFloat(reply.ts) * 1000),
            };

            documents.push(this.applyAccessControls(replyDoc));
          }
        }

        // Process file attachments
        if (message.files) {
          for (const file of message.files) {
            const fileDoc = await this.createFileDocument(file, channel, user);
            if (fileDoc) {
              documents.push(this.applyAccessControls(fileDoc));
            }
          }
        }

      } catch (error) {
        this.log('warn', 'Failed to convert message to document', {
          error: error instanceof Error ? error.message : String(error),
          messageTs: message.ts,
          channel: channel.id,
        });
      }
    }

    return documents;
  }

  /**
   * Get user information
   */
  private async getUserInfo(userId: string): Promise<SlackUser | null> {
    try {
      const response = await this.client.get('/users.info', {
        params: { user: userId },
      });

      return response.data.ok ? response.data.user : null;
    } catch (error) {
      this.log('warn', 'Failed to get user info', { 
        error: error instanceof Error ? error.message : String(error),
        userId 
      });
      return null;
    }
  }

  /**
   * Format message content including mentions and formatting
   */
  private formatMessageContent(message: SlackMessage): string {
    let content = message.text || '';
    
    // Add thread context if this is a reply
    if (message.thread_ts && message.thread_ts !== message.ts) {
      content = `[Reply to thread] ${content}`;
    }

    // Add reaction context
    if (message.reactions && message.reactions.length > 0) {
      const reactionSummary = message.reactions
        .map(r => `${r.name}(${r.count})`)
        .join(', ');
      content += `\n[Reactions: ${reactionSummary}]`;
    }

    return content;
  }

  /**
   * Extract hashtags and mentions as tags
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];
    
    // Extract hashtags
    const hashtags = text.match(/#\w+/g);
    if (hashtags) {
      tags.push(...hashtags.map(tag => tag.substring(1)));
    }

    // Extract user mentions
    const mentions = text.match(/<@\w+>/g);
    if (mentions) {
      tags.push(...mentions.map(mention => `mention:${mention.slice(2, -1)}`));
    }

    // Extract channel mentions
    const channelMentions = text.match(/<#\w+\|?\w*>/g);
    if (channelMentions) {
      tags.push(...channelMentions.map(mention => `channel:${mention.slice(2).split('|')[0]}`));
    }

    return tags;
  }

  /**
   * Generate access controls based on channel and user
   */
  private generateAccessControls(channel: SlackChannel, user: SlackUser | null): any[] {
    const controls = [];

    // Channel-based access
    if (channel.is_private) {
      controls.push({
        type: 'team',
        identifier: channel.id,
        permission: 'read',
      });
    } else {
      controls.push({
        type: 'team',
        identifier: 'public',
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
   * Create document for file attachment
   */
  private async createFileDocument(
    file: SlackFile, 
    channel: SlackChannel, 
    user: SlackUser | null
  ): Promise<Document | null> {
    try {
      // For now, we'll create a document with file metadata
      // In a full implementation, you might download and process the file content
      const document: Document = {
        id: `${channel.id}:file:${file.id}`,
        source_type: 'slack',
        source_id: file.id,
        team_id: channel.id,
        content: `File: ${file.name}\nType: ${file.mimetype}\nSize: ${file.size} bytes`,
        metadata: {
          title: file.name,
          author: user?.real_name || user?.name || 'Unknown',
          channel: channel.name,
          tags: ['file', file.mimetype.split('/')[0]],
          content_type: file.mimetype,
          size_bytes: file.size,
          checksum: crypto.createHash('md5').update(file.id).digest('hex'),
        },
        access_controls: this.generateAccessControls(channel, user),
        created_at: new Date(),
        updated_at: new Date(),
      };

      return document;
    } catch (error) {
      this.log('warn', 'Failed to create file document', {
        error: error instanceof Error ? error.message : String(error),
        fileId: file.id,
      });
      return null;
    }
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(body: string, signature: string, timestamp: string): boolean {
    const signingSecret = this.credentials.signing_secret;
    const baseString = `v0:${timestamp}:${body}`;
    const expectedSignature = `v0=${crypto
      .createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex')}`;

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
      switch (event.type) {
        case 'message':
          if (event.subtype === 'message_changed') {
            // Handle message updates
            const updatedDoc = await this.handleMessageUpdate(event);
            if (updatedDoc) documents.push(updatedDoc);
          } else if (!event.subtype) {
            // Handle new messages
            const newDoc = await this.handleNewMessage(event);
            if (newDoc) documents.push(newDoc);
          }
          break;

        case 'message_deleted':
          // Handle message deletions - you might want to mark as deleted
          // rather than actually delete from your system
          break;

        case 'file_shared':
          // Handle file sharing
          const fileDoc = await this.handleFileShared(event);
          if (fileDoc) documents.push(fileDoc);
          break;

        default:
          this.log('info', 'Unhandled webhook event type', { type: event.type });
      }

    } catch (error) {
      this.log('error', 'Error handling webhook event', {
        error: error instanceof Error ? error.message : String(error),
        event: event.type,
      });
    }

    return documents;
  }

  private async handleMessageUpdate(event: any): Promise<Document | null> {
    const channel = await this.getChannelInfo(event.channel);
    if (!channel) return null;

    const message = event.message;
    
    const documents = await this.convertMessagesToDocuments([message], channel);
    return documents[0] || null;
  }

  private async handleNewMessage(event: any): Promise<Document | null> {
    const channel = await this.getChannelInfo(event.channel);
    if (!channel) return null;

    const documents = await this.convertMessagesToDocuments([event], channel);
    return documents[0] || null;
  }

  private async handleFileShared(event: any): Promise<Document | null> {
    const channel = await this.getChannelInfo(event.channel_id);
    if (!channel) return null;

    const user = await this.getUserInfo(event.user_id);
    return this.createFileDocument(event.file, channel, user);
  }
}