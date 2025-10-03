/**
 * Webhook handler for real-time updates from external services
 */

import { Document } from './types';
import { SlackConnector } from './connectors/slack-connector';
import { TeamsConnector } from './connectors/teams-connector';
import { JiraConnector } from './connectors/jira-connector';
import { ConfluenceConnector } from './connectors/confluence-connector';
import { IngestionPipeline } from './ingestion-pipeline';
import crypto from 'crypto';

export interface WebhookEvent {
  source: 'slack' | 'teams' | 'jira' | 'confluence';
  event_type: string;
  timestamp: string;
  data: any;
  signature?: string;
}

export interface WebhookConfig {
  slack?: {
    signing_secret: string;
    verification_token?: string;
  };
  teams?: {
    client_secret: string;
    validation_token?: string;
  };
  jira?: {
    webhook_secret: string;
  };
  confluence?: {
    webhook_secret: string;
  };
}

export class WebhookHandler {
  private pipeline: IngestionPipeline;
  private config: WebhookConfig;
  private connectors: Map<string, SlackConnector | TeamsConnector | JiraConnector | ConfluenceConnector> = new Map();

  constructor(pipeline: IngestionPipeline, config: WebhookConfig) {
    this.pipeline = pipeline;
    this.config = config;
  }

  /**
   * Register a connector for webhook processing
   */
  registerConnector(
    sourceType: 'slack' | 'teams' | 'jira' | 'confluence', 
    connector: SlackConnector | TeamsConnector | JiraConnector | ConfluenceConnector
  ): void {
    this.connectors.set(sourceType, connector);
  }

  /**
   * Handle incoming webhook from Slack
   */
  async handleSlackWebhook(
    body: string,
    headers: Record<string, string>
  ): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
    try {
      // Verify webhook signature
      const signature = headers['x-slack-signature'];
      const timestamp = headers['x-slack-request-timestamp'];
      
      if (!this.verifySlackSignature(body, signature, timestamp)) {
        return { success: false, error: 'Invalid signature' };
      }

      // Check timestamp to prevent replay attacks
      const currentTime = Math.floor(Date.now() / 1000);
      if (Math.abs(currentTime - parseInt(timestamp)) > 300) { // 5 minutes
        return { success: false, error: 'Request too old' };
      }

      const payload = JSON.parse(body);

      // Handle URL verification challenge
      if (payload.type === 'url_verification') {
        return { success: true };
      }

      // Handle event callbacks
      if (payload.type === 'event_callback') {
        const connector = this.connectors.get('slack') as SlackConnector;
        if (!connector) {
          return { success: false, error: 'Slack connector not registered' };
        }

        const documents = await connector.handleWebhookEvent(payload.event);
        
        // Process documents through pipeline
        if (documents.length > 0) {
          for (const document of documents) {
            await this.pipeline.processDocument(document);
          }
        }

        return { success: true, documents };
      }

      return { success: true };

    } catch (error) {
      console.error('Error handling Slack webhook:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Handle incoming webhook from Microsoft Teams
   */
  async handleTeamsWebhook(
    body: string,
    headers: Record<string, string>
  ): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
    try {
      const payload = JSON.parse(body);

      // Handle validation request
      if (payload.validationToken) {
        if (payload.validationToken === this.config.teams?.validation_token) {
          return { success: true };
        } else {
          return { success: false, error: 'Invalid validation token' };
        }
      }

      // Handle subscription notifications
      if (payload.value && Array.isArray(payload.value)) {
        const connector = this.connectors.get('teams') as TeamsConnector;
        if (!connector) {
          return { success: false, error: 'Teams connector not registered' };
        }

        const allDocuments: Document[] = [];

        for (const notification of payload.value) {
          try {
            const documents = await connector.handleWebhookEvent(notification);
            allDocuments.push(...documents);
          } catch (error) {
            console.error('Error processing Teams notification:', error);
          }
        }

        // Process documents through pipeline
        if (allDocuments.length > 0) {
          for (const document of allDocuments) {
            await this.pipeline.processDocument(document);
          }
        }

        return { success: true, documents: allDocuments };
      }

      return { success: true };

    } catch (error) {
      console.error('Error handling Teams webhook:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Handle incoming webhook from Jira
   */
  async handleJiraWebhook(
    body: string,
    _headers: Record<string, string>
  ): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
    try {
      // Verify webhook signature if configured
      const signature = _headers['x-hub-signature-256'] || _headers['x-atlassian-webhook-identifier'];
      
      const connector = this.connectors.get('jira') as JiraConnector;
      if (!connector) {
        return { success: false, error: 'Jira connector not registered' };
      }

      if (signature && !connector.verifyWebhookSignature(body, signature)) {
        return { success: false, error: 'Invalid signature' };
      }

      const payload = JSON.parse(body);

      // Handle different Jira webhook events
      const documents = await connector.handleWebhookEvent(payload);
      
      // Process documents through pipeline
      if (documents.length > 0) {
        for (const document of documents) {
          await this.pipeline.processDocument(document);
        }
      }

      return { success: true, documents };

    } catch (error) {
      console.error('Error handling Jira webhook:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Handle incoming webhook from Confluence
   */
  async handleConfluenceWebhook(
    body: string,
    _headers: Record<string, string>
  ): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
    try {
      // Verify webhook signature if configured
      const signature = _headers['x-hub-signature-256'] || _headers['x-atlassian-webhook-identifier'];
      
      const connector = this.connectors.get('confluence') as ConfluenceConnector;
      if (!connector) {
        return { success: false, error: 'Confluence connector not registered' };
      }

      if (signature && !connector.verifyWebhookSignature(body, signature)) {
        return { success: false, error: 'Invalid signature' };
      }

      const payload = JSON.parse(body);

      // Handle different Confluence webhook events
      const documents = await connector.handleWebhookEvent(payload);
      
      // Process documents through pipeline
      if (documents.length > 0) {
        for (const document of documents) {
          await this.pipeline.processDocument(document);
        }
      }

      return { success: true, documents };

    } catch (error) {
      console.error('Error handling Confluence webhook:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Verify Slack webhook signature
   */
  private verifySlackSignature(body: string, signature: string, timestamp: string): boolean {
    if (!this.config.slack?.signing_secret || !signature || !timestamp) {
      return false;
    }

    const signingSecret = this.config.slack.signing_secret;
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
   * Create webhook subscription for Teams
   */
  async createTeamsSubscription(
    resource: string,
    changeTypes: string[],
    notificationUrl: string,
    expirationDateTime: string
  ): Promise<any> {
    const connector = this.connectors.get('teams') as TeamsConnector;
    if (!connector) {
      throw new Error('Teams connector not registered');
    }

    // This would typically be done through the Graph API
    // Implementation depends on your specific setup
    const subscription = {
      changeType: changeTypes.join(','),
      notificationUrl,
      resource,
      expirationDateTime,
      clientState: crypto.randomBytes(16).toString('hex'),
    };

    console.log('Teams subscription created:', subscription);
    return subscription;
  }

  /**
   * Renew webhook subscriptions before they expire
   */
  async renewSubscriptions(): Promise<void> {
    // Implementation for renewing webhook subscriptions
    // This should be called periodically (e.g., via a scheduled job)
    console.log('Renewing webhook subscriptions...');
  }

  /**
   * Health check for webhook endpoints
   */
  async healthCheck(): Promise<{ slack: boolean; teams: boolean; jira: boolean; confluence: boolean }> {
    return {
      slack: this.connectors.has('slack'),
      teams: this.connectors.has('teams'),
      jira: this.connectors.has('jira'),
      confluence: this.connectors.has('confluence'),
    };
  }
}

/**
 * Express middleware for handling webhooks
 */
export function createWebhookMiddleware(handler: WebhookHandler) {
  return {
    slack: async (req: any, res: any) => {
      try {
        const body = JSON.stringify(req.body);
        const result = await handler.handleSlackWebhook(body, req.headers);
        
        if (result.success) {
          // Handle URL verification challenge
          if (req.body.type === 'url_verification') {
            res.json({ challenge: req.body.challenge });
          } else {
            res.status(200).json({ status: 'ok' });
          }
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        console.error('Webhook middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    teams: async (req: any, res: any) => {
      try {
        const body = JSON.stringify(req.body);
        const result = await handler.handleTeamsWebhook(body, req.headers);
        
        if (result.success) {
          // Handle validation request
          if (req.body.validationToken) {
            res.status(200).send(req.body.validationToken);
          } else {
            res.status(200).json({ status: 'ok' });
          }
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        console.error('Webhook middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    jira: async (req: any, res: any) => {
      try {
        const body = JSON.stringify(req.body);
        const result = await handler.handleJiraWebhook(body, req.headers);
        
        if (result.success) {
          res.status(200).json({ status: 'ok' });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        console.error('Jira webhook middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    confluence: async (req: any, res: any) => {
      try {
        const body = JSON.stringify(req.body);
        const result = await handler.handleConfluenceWebhook(body, req.headers);
        
        if (result.success) {
          res.status(200).json({ status: 'ok' });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        console.error('Confluence webhook middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  };
}