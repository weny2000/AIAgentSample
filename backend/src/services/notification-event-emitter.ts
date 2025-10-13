import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

/**
 * Helper service for emitting work task events to EventBridge
 * These events trigger notification handlers
 */
export class NotificationEventEmitter {
  private eventBridgeClient: EventBridgeClient;
  private eventBusName: string;

  constructor(config: { eventBusName: string; region?: string }) {
    this.eventBridgeClient = new EventBridgeClient({ region: config.region || process.env.AWS_REGION });
    this.eventBusName = config.eventBusName;
  }

  /**
   * Emit task status change event
   */
  async emitTaskStatusChange(event: {
    task_id: string;
    todo_id: string;
    old_status: string;
    new_status: string;
    assigned_to: string;
    team_id: string;
    task_title: string;
  }): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'work-task-system',
          DetailType: 'Task Status Changed',
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusName,
        },
      ],
    });

    await this.eventBridgeClient.send(command);
  }

  /**
   * Emit quality check complete event
   */
  async emitQualityCheckComplete(event: {
    task_id: string;
    todo_id: string;
    deliverable_id: string;
    quality_score: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    issues: Array<{
      type: string;
      description: string;
      suggestion: string;
    }>;
    submitted_by: string;
    team_id: string;
  }): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'work-task-system',
          DetailType: 'Quality Check Complete',
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusName,
        },
      ],
    });

    await this.eventBridgeClient.send(command);
  }

  /**
   * Emit progress milestone event
   */
  async emitProgressMilestone(event: {
    task_id: string;
    milestone_type: 'quarter' | 'half' | 'three_quarters' | 'complete';
    completed_todos: number;
    total_todos: number;
    completion_percentage: number;
    team_id: string;
    team_members: string[];
  }): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'work-task-system',
          DetailType: 'Progress Milestone',
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusName,
        },
      ],
    });

    await this.eventBridgeClient.send(command);
  }

  /**
   * Emit delayed task detection event
   */
  async emitDelayedTaskDetection(event: {
    task_id: string;
    todo_id: string;
    task_title: string;
    days_delayed: number;
    assigned_to: string;
    team_id: string;
  }): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'work-task-system',
          DetailType: 'Delayed Task Detected',
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusName,
        },
      ],
    });

    await this.eventBridgeClient.send(command);
  }
}
