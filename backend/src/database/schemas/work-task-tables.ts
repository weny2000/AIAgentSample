/**
 * Database schema definitions for Work Task Analysis System DynamoDB tables
 * This file defineructures, indexes, and configurations
 */

import { CreateTableCommand, CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

// ============================================================================
// Work Tasks Table Schema
// ============================================================================

export const workTasksTableSchema: CreateTableCommandInput = {
  TableName: 'work_tasks',
  KeySchema: [
    {
      AttributeName: 'task_id',
      KeyType: 'HASH' // Partition key
    },
    {
      AttributeName: 'created_at',
      KeyType: 'RANGE' // Sort key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'task_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'created_at',
      AttributeType: 'S'
    },
    {
      AttributeName: 'team_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'status',
      AttributeType: 'S'
    },
    {
      AttributeName: 'submitted_by',
      AttributeType: 'S'
    }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'team-status-index',
      KeySchema: [
        {
          AttributeName: 'team_id',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'status',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      IndexName: 'submitted-by-index',
      KeySchema: [
        {
          AttributeName: 'submitted_by',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'created_at',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_AND_OLD_IMAGES'
  },
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true
  },
  Tags: [
    {
      Key: 'Environment',
      Value: process.env.ENVIRONMENT || 'development'
    },
    {
      Key: 'Service',
      Value: 'work-task-analysis'
    },
    {
      Key: 'Component',
      Value: 'work-tasks'
    }
  ]
};

// ============================================================================
// Todo Items Table Schema
// ============================================================================

export const todoItemsTableSchema: CreateTableCommandInput = {
  TableName: 'todo_items',
  KeySchema: [
    {
      AttributeName: 'todo_id',
      KeyType: 'HASH' // Partition key
    },
    {
      AttributeName: 'created_at',
      KeyType: 'RANGE' // Sort key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'todo_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'created_at',
      AttributeType: 'S'
    },
    {
      AttributeName: 'task_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'status',
      AttributeType: 'S'
    },
    {
      AttributeName: 'assigned_to',
      AttributeType: 'S'
    },
    {
      AttributeName: 'due_date',
      AttributeType: 'S'
    }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'task-status-index',
      KeySchema: [
        {
          AttributeName: 'task_id',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'status',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      IndexName: 'assigned-to-index',
      KeySchema: [
        {
          AttributeName: 'assigned_to',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'due_date',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_AND_OLD_IMAGES'
  },
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true
  },
  Tags: [
    {
      Key: 'Environment',
      Value: process.env.ENVIRONMENT || 'development'
    },
    {
      Key: 'Service',
      Value: 'work-task-analysis'
    },
    {
      Key: 'Component',
      Value: 'todo-items'
    }
  ]
};

// ============================================================================
// Deliverables Table Schema
// ============================================================================

export const deliverablesTableSchema: CreateTableCommandInput = {
  TableName: 'deliverables',
  KeySchema: [
    {
      AttributeName: 'deliverable_id',
      KeyType: 'HASH' // Partition key
    },
    {
      AttributeName: 'created_at',
      KeyType: 'RANGE' // Sort key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'deliverable_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'created_at',
      AttributeType: 'S'
    },
    {
      AttributeName: 'todo_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'task_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'status',
      AttributeType: 'S'
    }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'todo-status-index',
      KeySchema: [
        {
          AttributeName: 'todo_id',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'status',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      IndexName: 'task-status-index',
      KeySchema: [
        {
          AttributeName: 'task_id',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'status',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_AND_OLD_IMAGES'
  },
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true
  },
  Tags: [
    {
      Key: 'Environment',
      Value: process.env.ENVIRONMENT || 'development'
    },
    {
      Key: 'Service',
      Value: 'work-task-analysis'
    },
    {
      Key: 'Component',
      Value: 'deliverables'
    }
  ]
};

// ============================================================================
// Progress Tracking Table Schema
// ============================================================================

export const progressTrackingTableSchema: CreateTableCommandInput = {
  TableName: 'progress_tracking',
  KeySchema: [
    {
      AttributeName: 'tracking_id',
      KeyType: 'HASH' // Partition key
    },
    {
      AttributeName: 'created_at',
      KeyType: 'RANGE' // Sort key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'tracking_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'created_at',
      AttributeType: 'S'
    },
    {
      AttributeName: 'task_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'tracking_type',
      AttributeType: 'S'
    }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'task-type-index',
      KeySchema: [
        {
          AttributeName: 'task_id',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'tracking_type',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_AND_OLD_IMAGES'
  },
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true
  },
  Tags: [
    {
      Key: 'Environment',
      Value: process.env.ENVIRONMENT || 'development'
    },
    {
      Key: 'Service',
      Value: 'work-task-analysis'
    },
    {
      Key: 'Component',
      Value: 'progress-tracking'
    }
  ]
};

// ============================================================================
// Quality Standards Table Schema
// ============================================================================

export const qualityStandardsTableSchema: CreateTableCommandInput = {
  TableName: 'quality_standards',
  KeySchema: [
    {
      AttributeName: 'standard_id',
      KeyType: 'HASH' // Partition key
    },
    {
      AttributeName: 'version',
      KeyType: 'RANGE' // Sort key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'standard_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'version',
      AttributeType: 'S'
    },
    {
      AttributeName: 'team_id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'is_active',
      AttributeType: 'S'
    }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'team-active-index',
      KeySchema: [
        {
          AttributeName: 'team_id',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'is_active',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true
  },
  Tags: [
    {
      Key: 'Environment',
      Value: process.env.ENVIRONMENT || 'development'
    },
    {
      Key: 'Service',
      Value: 'work-task-analysis'
    },
    {
      Key: 'Component',
      Value: 'quality-standards'
    }
  ]
};

// ============================================================================
// Table Creation Utilities
// ============================================================================

export const workTaskTableSchemas = [
  workTasksTableSchema,
  todoItemsTableSchema,
  deliverablesTableSchema,
  progressTrackingTableSchema,
  qualityStandardsTableSchema
];

export interface TableCreationResult {
  tableName: string;
  success: boolean;
  error?: string;
  arn?: string;
}

export const getTableNames = (): string[] => {
  return workTaskTableSchemas.map(schema => schema.TableName!);
};

export const getTableByName = (tableName: string): CreateTableCommandInput | undefined => {
  return workTaskTableSchemas.find(schema => schema.TableName === tableName);
};

// Environment-specific table name prefixes
export const getEnvironmentTableName = (baseName: string): string => {
  const environment = process.env.ENVIRONMENT || 'development';
  return `${environment}-${baseName}`;
};

// Update table names with environment prefix
export const getEnvironmentTableSchemas = (): CreateTableCommandInput[] => {
  return workTaskTableSchemas.map(schema => ({
    ...schema,
    TableName: getEnvironmentTableName(schema.TableName!)
  }));
};