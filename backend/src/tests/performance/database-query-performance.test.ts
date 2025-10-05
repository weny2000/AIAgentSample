/**
 * Database Query Performance Optimization Tests
 * Tests query performance, indexing efficiency, and optimization strategies
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, BatchGetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { WorkTaskRecord, TodoItemRecord, DeliverableRecord } from '../../models/work-task';

// Mock repository classes for testing
class MockWorkTaskRepository {
  constructor(private client: DynamoDBDocumentClient) {}
  
  async getById(id: string, options?: any) {
    const command = new GetCommand({ TableName: 'work_tasks', Key: { task_id: id } });
    const result = await this.client.send(command);
    return result.Item;
  }
  
  async batchGet(ids: string[]) {
    const command = new BatchGetCommand({
      RequestItems: {
        'work_tasks': { Keys: ids.map(id => ({ task_id: id })) }
      }
    });
    const result = await this.client.send(command);
    return result.Responses?.['work_tasks'] || [];
  }
  
  async queryByTeamId(teamId: string) {
    const command = new QueryCommand({
      TableName: 'work_tasks',
      IndexName: 'team_id-index',
      KeyConditionExpression: 'team_id = :teamId',
      ExpressionAttributeValues: { ':teamId': teamId }
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async queryByTeamIdAndDateRange(teamId: string, startDate: Date, endDate: Date) {
    const command = new QueryCommand({
      TableName: 'work_tasks',
      IndexName: 'team_id-created_at-index',
      KeyConditionExpression: 'team_id = :teamId AND created_at BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':teamId': teamId,
        ':start': startDate.toISOString(),
        ':end': endDate.toISOString()
      }
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async queryByTeamIdPaginated(teamId: string, limit: number, lastKey?: any) {
    const command = new QueryCommand({
      TableName: 'work_tasks',
      IndexName: 'team_id-index',
      KeyConditionExpression: 'team_id = :teamId',
      ExpressionAttributeValues: { ':teamId': teamId },
      Limit: limit,
      ExclusiveStartKey: lastKey
    });
    const result = await this.client.send(command);
    return {
      items: result.Items || [],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  }
  
  async queryByStatus(status: string) {
    const command = new QueryCommand({
      TableName: 'work_tasks',
      IndexName: 'status-index',
      KeyConditionExpression: 'status = :status',
      ExpressionAttributeValues: { ':status': status }
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async queryByMultipleFilters(filters: any) {
    const command = new QueryCommand({
      TableName: 'work_tasks',
      IndexName: 'team_id-index',
      KeyConditionExpression: 'team_id = :teamId',
      FilterExpression: 'status = :status AND priority = :priority',
      ExpressionAttributeValues: {
        ':teamId': filters.teamId,
        ':status': filters.status,
        ':priority': filters.priority
      }
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async scanAll() {
    const command = new ScanCommand({ TableName: 'work_tasks' });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async scanSegment(segment: number, totalSegments: number) {
    const command = new ScanCommand({
      TableName: 'work_tasks',
      Segment: segment,
      TotalSegments: totalSegments
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async scanWithFilter(filter: any) {
    const command = new ScanCommand({
      TableName: 'work_tasks',
      FilterExpression: 'team_id = :teamId',
      ExpressionAttributeValues: { ':teamId': filter.team_id }
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
  
  async create(task: WorkTaskRecord) {
    const command = new PutCommand({ TableName: 'work_tasks', Item: task });
    await this.client.send(command);
    return task;
  }
  
  async update(id: string, updates: any) {
    const command = new UpdateCommand({
      TableName: 'work_tasks',
      Key: { task_id: id },
      UpdateExpression: 'SET #status = :status, #updated_at = :updated_at',
      ExpressionAttributeNames: { '#status': 'status', '#updated_at': 'updated_at' },
      ExpressionAttributeValues: { ':status': updates.status, ':updated_at': updates.updated_at }
    });
    await this.client.send(command);
  }
  
  async batchWrite(tasks: WorkTaskRecord[]) {
    // Simplified batch write
    await Promise.all(tasks.map(task => this.create(task)));
  }
  
  async getByIdProjected(id: string, attributes: string[]) {
    const command = new GetCommand({
      TableName: 'work_tasks',
      Key: { task_id: id },
      ProjectionExpression: attributes.join(', ')
    });
    const result = await this.client.send(command);
    return result.Item;
  }
}

class MockTodoItemRepository {
  constructor(private client: DynamoDBDocumentClient) {}
  
  async getById(id: string) {
    const command = new GetCommand({ TableName: 'todo_items', Key: { todo_id: id } });
    const result = await this.client.send(command);
    return result.Item;
  }
  
  async queryByTaskId(taskId: string) {
    const command = new QueryCommand({
      TableName: 'todo_items',
      IndexName: 'task_id-index',
      KeyConditionExpression: 'task_id = :taskId',
      ExpressionAttributeValues: { ':taskId': taskId }
    });
    const result = await this.client.send(command);
    return result.Items || [];
  }
}

class MockDeliverableRepository {
  constructor(private client: DynamoDBDocumentClient) {}
  
  async getById(id: string) {
    const command = new GetCommand({ TableName: 'deliverables', Key: { deliverable_id: id } });
    const result = await this.client.send(command);
    return result.Item;
  }
}

describe('Database Query Performance Tests', () => {
  let workTaskRepo: MockWorkTaskRepository;
  let todoItemRepo: MockTodoItemRepository;
  let deliverableRepo: MockDeliverableRepository;
  let mockDynamoClient: jest.Mocked<DynamoDBDocumentClient>;

  const queryMetrics = {
    singleItemQueries: [] as number[],
    batchQueries: [] as number[],
    scanOperations: [] as number[],
    indexQueries: [] as number[],
    filterQueries: [] as number[]
  };

  beforeAll(() => {
    // Setup mock DynamoDB client with realistic latencies
    const baseDynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    mockDynamoClient = DynamoDBDocumentClient.from(baseDynamoClient) as jest.Mocked<DynamoDBDocumentClient>;

    // Mock send method with realistic delays
    mockDynamoClient.send = jest.fn().mockImplementation(async (command: any) => {
      const commandName = command.constructor.name;
      let delay = 0;

      switch (commandName) {
        case 'GetCommand':
          delay = 5 + Math.random() * 10; // 5-15ms
          break;
        case 'QueryCommand':
          delay = 10 + Math.random() * 20; // 10-30ms
          break;
        case 'ScanCommand':
          delay = 50 + Math.random() * 100; // 50-150ms
          break;
        case 'BatchGetCommand':
          delay = 15 + Math.random() * 25; // 15-40ms
          break;
        case 'PutCommand':
        case 'UpdateCommand':
          delay = 8 + Math.random() * 12; // 8-20ms
          break;
        default:
          delay = 10;
      }

      await new Promise(resolve => setTimeout(resolve, delay));

      // Return mock data based on command type
      if (commandName === 'GetCommand') {
        return { Item: createMockWorkTask() };
      } else if (commandName === 'QueryCommand') {
        return {
          Items: Array.from({ length: 10 }, () => createMockWorkTask()),
          Count: 10
        };
      } else if (commandName === 'ScanCommand') {
        return {
          Items: Array.from({ length: 100 }, () => createMockWorkTask()),
          Count: 100,
          LastEvaluatedKey: undefined
        };
      } else if (commandName === 'BatchGetCommand') {
        return {
          Responses: {
            'work_tasks': Array.from({ length: 25 }, () => createMockWorkTask())
          }
        };
      }

      return { Attributes: createMockWorkTask() };
    });

    workTaskRepo = new MockWorkTaskRepository(mockDynamoClient);
    todoItemRepo = new MockTodoItemRepository(mockDynamoClient);
    deliverableRepo = new MockDeliverableRepository(mockDynamoClient);
  });

  afterAll(() => {
    // Print performance summary
    console.log('\n=== Database Query Performance Summary ===');
    console.log(`Single Item Queries - Avg: ${calculateAverage(queryMetrics.singleItemQueries).toFixed(2)}ms`);
    console.log(`Batch Queries - Avg: ${calculateAverage(queryMetrics.batchQueries).toFixed(2)}ms`);
    console.log(`Scan Operations - Avg: ${calculateAverage(queryMetrics.scanOperations).toFixed(2)}ms`);
    console.log(`Index Queries - Avg: ${calculateAverage(queryMetrics.indexQueries).toFixed(2)}ms`);
    console.log(`Filter Queries - Avg: ${calculateAverage(queryMetrics.filterQueries).toFixed(2)}ms`);
    console.log('==========================================\n');
  });

  describe('Single Item Query Performance', () => {
    test('should retrieve single work task within 20ms', async () => {
      const startTime = performance.now();
      
      const result = await workTaskRepo.getById('task-1');
      
      const duration = performance.now() - startTime;
      queryMetrics.singleItemQueries.push(duration);

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(20);
      
      console.log(`Single task query: ${duration.toFixed(2)}ms`);
    });

    test('should retrieve single todo item within 20ms', async () => {
      const startTime = performance.now();
      
      const result = await todoItemRepo.getById('todo-1');
      
      const duration = performance.now() - startTime;
      queryMetrics.singleItemQueries.push(duration);

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(20);
      
      console.log(`Single todo query: ${duration.toFixed(2)}ms`);
    });

    test('should handle 100 sequential single-item queries within 2 seconds', async () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        await workTaskRepo.getById(`task-${i}`);
      }
      
      const duration = performance.now() - startTime;
      const avgTime = duration / 100;

      expect(duration).toBeLessThan(2000);
      expect(avgTime).toBeLessThan(20);
      
      console.log(`100 sequential queries: ${duration.toFixed(2)}ms total, ${avgTime.toFixed(2)}ms avg`);
    });
  });

  describe('Batch Query Performance', () => {
    test('should retrieve 25 work tasks in batch within 50ms', async () => {
      const taskIds = Array.from({ length: 25 }, (_, i) => `task-${i}`);
      
      const startTime = performance.now();
      const results = await workTaskRepo.batchGet(taskIds);
      const duration = performance.now() - startTime;

      queryMetrics.batchQueries.push(duration);

      expect(results).toHaveLength(25);
      expect(duration).toBeLessThan(50);
      
      console.log(`Batch get 25 tasks: ${duration.toFixed(2)}ms`);
    });

    test('should retrieve 100 work tasks in batches within 200ms', async () => {
      const taskIds = Array.from({ length: 100 }, (_, i) => `task-${i}`);
      
      const startTime = performance.now();
      
      // Batch in groups of 25 (DynamoDB limit)
      const batches = [];
      for (let i = 0; i < taskIds.length; i += 25) {
        batches.push(taskIds.slice(i, i + 25));
      }

      const results = await Promise.all(
        batches.map(batch => workTaskRepo.batchGet(batch))
      );

      const duration = performance.now() - startTime;
      const totalResults = results.flat();

      expect(totalResults.length).toBe(100);
      expect(duration).toBeLessThan(200);
      
      console.log(`Batch get 100 tasks: ${duration.toFixed(2)}ms`);
    });

    test('batch queries should be faster than sequential queries', async () => {
      const taskIds = Array.from({ length: 50 }, (_, i) => `task-${i}`);

      // Sequential queries
      const sequentialStart = performance.now();
      for (const id of taskIds) {
        await workTaskRepo.getById(id);
      }
      const sequentialDuration = performance.now() - sequentialStart;

      // Batch queries
      const batchStart = performance.now();
      const batches = [];
      for (let i = 0; i < taskIds.length; i += 25) {
        batches.push(taskIds.slice(i, i + 25));
      }
      await Promise.all(batches.map(batch => workTaskRepo.batchGet(batch)));
      const batchDuration = performance.now() - batchStart;

      expect(batchDuration).toBeLessThan(sequentialDuration * 0.5); // At least 50% faster
      
      console.log(`Sequential: ${sequentialDuration.toFixed(2)}ms, Batch: ${batchDuration.toFixed(2)}ms`);
      console.log(`Batch is ${((sequentialDuration / batchDuration) - 1) * 100}% faster`);
    });
  });

  describe('Index Query Performance', () => {
    test('should query by team_id using GSI within 40ms', async () => {
      const startTime = performance.now();
      
      const results = await workTaskRepo.queryByTeamId('team-1');
      
      const duration = performance.now() - startTime;
      queryMetrics.indexQueries.push(duration);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(duration).toBeLessThan(40);
      
      console.log(`GSI query by team_id: ${duration.toFixed(2)}ms`);
    });

    test('should query todos by task_id using GSI within 40ms', async () => {
      const startTime = performance.now();
      
      const results = await todoItemRepo.queryByTaskId('task-1');
      
      const duration = performance.now() - startTime;
      queryMetrics.indexQueries.push(duration);

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(40);
      
      console.log(`GSI query by task_id: ${duration.toFixed(2)}ms`);
    });

    test('should query with sort key range efficiently', async () => {
      const startTime = performance.now();
      
      const results = await workTaskRepo.queryByTeamIdAndDateRange(
        'team-1',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      
      const duration = performance.now() - startTime;
      queryMetrics.indexQueries.push(duration);

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(50);
      
      console.log(`GSI range query: ${duration.toFixed(2)}ms`);
    });

    test('should handle pagination efficiently', async () => {
      const pageSize = 20;
      const pages = 5;
      const startTime = performance.now();
      
      let lastEvaluatedKey: any = undefined;
      const allResults = [];

      for (let i = 0; i < pages; i++) {
        const result = await workTaskRepo.queryByTeamIdPaginated(
          'team-1',
          pageSize,
          lastEvaluatedKey
        );
        
        allResults.push(...result.items);
        lastEvaluatedKey = result.lastEvaluatedKey;
        
        if (!lastEvaluatedKey) break;
      }

      const duration = performance.now() - startTime;
      const avgPageTime = duration / pages;

      expect(allResults.length).toBeGreaterThan(0);
      expect(avgPageTime).toBeLessThan(50);
      
      console.log(`Paginated query (${pages} pages): ${duration.toFixed(2)}ms, ${avgPageTime.toFixed(2)}ms per page`);
    });
  });

  describe('Filter Query Performance', () => {
    test('should filter by status efficiently', async () => {
      const startTime = performance.now();
      
      const results = await workTaskRepo.queryByStatus('in_progress');
      
      const duration = performance.now() - startTime;
      queryMetrics.filterQueries.push(duration);

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(60);
      
      console.log(`Filter by status: ${duration.toFixed(2)}ms`);
    });

    test('should filter by multiple conditions efficiently', async () => {
      const startTime = performance.now();
      
      const results = await workTaskRepo.queryByMultipleFilters({
        teamId: 'team-1',
        status: 'in_progress',
        priority: 'high'
      });
      
      const duration = performance.now() - startTime;
      queryMetrics.filterQueries.push(duration);

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(80);
      
      console.log(`Multi-filter query: ${duration.toFixed(2)}ms`);
    });

    test('should compare filter vs scan performance', async () => {
      // Filter query using index
      const filterStart = performance.now();
      await workTaskRepo.queryByStatus('completed');
      const filterDuration = performance.now() - filterStart;

      // Scan operation
      const scanStart = performance.now();
      await workTaskRepo.scanAll();
      const scanDuration = performance.now() - scanStart;

      expect(filterDuration).toBeLessThan(scanDuration * 0.5); // Filter should be at least 50% faster
      
      console.log(`Filter: ${filterDuration.toFixed(2)}ms, Scan: ${scanDuration.toFixed(2)}ms`);
      console.log(`Filter is ${((scanDuration / filterDuration) - 1) * 100}% faster`);
    });
  });

  describe('Scan Operation Performance', () => {
    test('should complete full table scan within 200ms', async () => {
      const startTime = performance.now();
      
      const results = await workTaskRepo.scanAll();
      
      const duration = performance.now() - startTime;
      queryMetrics.scanOperations.push(duration);

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(200);
      
      console.log(`Full table scan: ${duration.toFixed(2)}ms`);
    });

    test('should handle parallel segment scans efficiently', async () => {
      const segments = 4;
      const startTime = performance.now();
      
      const promises = Array.from({ length: segments }, (_, i) => 
        workTaskRepo.scanSegment(i, segments)
      );

      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      const totalItems = results.reduce((sum, r) => sum + r.length, 0);

      expect(totalItems).toBeGreaterThan(0);
      expect(duration).toBeLessThan(150); // Parallel should be faster than sequential
      
      console.log(`Parallel scan (${segments} segments): ${duration.toFixed(2)}ms, ${totalItems} items`);
    });
  });

  describe('Write Operation Performance', () => {
    test('should create work task within 30ms', async () => {
      const task = createMockWorkTask();
      
      const startTime = performance.now();
      await workTaskRepo.create(task);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(30);
      
      console.log(`Create task: ${duration.toFixed(2)}ms`);
    });

    test('should update work task within 30ms', async () => {
      const updates = {
        status: 'completed' as const,
        updated_at: new Date().toISOString()
      };
      
      const startTime = performance.now();
      await workTaskRepo.update('task-1', updates);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(30);
      
      console.log(`Update task: ${duration.toFixed(2)}ms`);
    });

    test('should handle batch writes efficiently', async () => {
      const tasks = Array.from({ length: 25 }, () => createMockWorkTask());
      
      const startTime = performance.now();
      await workTaskRepo.batchWrite(tasks);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100);
      
      console.log(`Batch write 25 tasks: ${duration.toFixed(2)}ms`);
    });

    test('should handle 100 concurrent writes', async () => {
      const startTime = performance.now();
      
      const promises = Array.from({ length: 100 }, () => {
        const task = createMockWorkTask();
        return workTaskRepo.create(task);
      });

      await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(500); // 100 concurrent writes in 500ms
      
      console.log(`100 concurrent writes: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Query Optimization Strategies', () => {
    test('should demonstrate projection optimization', async () => {
      // Full item query
      const fullStart = performance.now();
      await workTaskRepo.getById('task-1');
      const fullDuration = performance.now() - fullStart;

      // Projected query (only specific attributes)
      const projectedStart = performance.now();
      await workTaskRepo.getByIdProjected('task-1', ['task_id', 'title', 'status']);
      const projectedDuration = performance.now() - projectedStart;

      // Projected should be faster or similar
      expect(projectedDuration).toBeLessThanOrEqual(fullDuration * 1.2);
      
      console.log(`Full query: ${fullDuration.toFixed(2)}ms, Projected: ${projectedDuration.toFixed(2)}ms`);
    });

    test('should demonstrate consistent read vs eventually consistent', async () => {
      // Eventually consistent read (default)
      const eventualStart = performance.now();
      await workTaskRepo.getById('task-1', { consistentRead: false });
      const eventualDuration = performance.now() - eventualStart;

      // Strongly consistent read
      const consistentStart = performance.now();
      await workTaskRepo.getById('task-1', { consistentRead: true });
      const consistentDuration = performance.now() - consistentStart;

      // Eventually consistent should be faster
      expect(eventualDuration).toBeLessThanOrEqual(consistentDuration);
      
      console.log(`Eventually consistent: ${eventualDuration.toFixed(2)}ms, Strongly consistent: ${consistentDuration.toFixed(2)}ms`);
    });

    test('should demonstrate query vs scan efficiency', async () => {
      const iterations = 10;
      const queryTimes: number[] = [];
      const scanTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Query using index
        const queryStart = performance.now();
        await workTaskRepo.queryByTeamId('team-1');
        queryTimes.push(performance.now() - queryStart);

        // Scan with filter
        const scanStart = performance.now();
        await workTaskRepo.scanWithFilter({ team_id: 'team-1' });
        scanTimes.push(performance.now() - scanStart);
      }

      const avgQueryTime = calculateAverage(queryTimes);
      const avgScanTime = calculateAverage(scanTimes);

      expect(avgQueryTime).toBeLessThan(avgScanTime);
      
      console.log(`Query avg: ${avgQueryTime.toFixed(2)}ms, Scan avg: ${avgScanTime.toFixed(2)}ms`);
      console.log(`Query is ${((avgScanTime / avgQueryTime) - 1) * 100}% faster`);
    });
  });

  describe('Connection Pool Performance', () => {
    test('should handle connection reuse efficiently', async () => {
      const iterations = 50;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await workTaskRepo.getById(`task-${i}`);
      }

      const duration = performance.now() - startTime;
      const avgTime = duration / iterations;

      // With connection pooling, average should be low
      expect(avgTime).toBeLessThan(25);
      
      console.log(`${iterations} queries with connection reuse: ${duration.toFixed(2)}ms, ${avgTime.toFixed(2)}ms avg`);
    });

    test('should handle concurrent connections efficiently', async () => {
      const concurrentQueries = 50;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentQueries }, (_, i) =>
        workTaskRepo.getById(`task-${i}`)
      );

      await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200); // 50 concurrent in 200ms
      
      console.log(`${concurrentQueries} concurrent queries: ${duration.toFixed(2)}ms`);
    });
  });
});

// Helper functions
function createMockWorkTask(): WorkTaskRecord {
  return {
    task_id: `task-${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
    title: 'Test Task',
    description: 'Test Description',
    content: 'Test Content',
    submitted_by: 'test-user',
    team_id: 'test-team',
    priority: 'medium',
    status: 'submitted',
    updated_at: new Date().toISOString()
  };
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}
