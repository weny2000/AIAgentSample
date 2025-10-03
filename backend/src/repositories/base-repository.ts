import { 
  DynamoDBClient, 
  GetItemCommand, 
  PutItemCommand, 
  UpdateItemCommand, 
  DeleteItemCommand, 
  ScanCommand, 
  QueryCommand,
  ConditionalCheckFailedException
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBItem, PaginatedResponse } from '../models';

export interface RepositoryConfig {
  region: string;
  tableName: string;
  client?: DynamoDBClient;
}

export abstract class BaseRepository<T extends DynamoDBItem> {
  protected client: DynamoDBClient;
  protected tableName: string;

  constructor(config: RepositoryConfig) {
    this.client = config.client || new DynamoDBClient({ region: config.region });
    this.tableName = config.tableName;
  }

  /**
   * Get current timestamp in ISO format
   */
  protected getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Get a single item by key
   */
  protected async getItem(key: Record<string, any>): Promise<T | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall(key)
    });

    const result = await this.client.send(command);
    return result.Item ? unmarshall(result.Item) as T : null;
  }

  /**
   * Put an item with optional condition
   */
  protected async putItem(item: T, conditionExpression?: string): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item),
      ConditionExpression: conditionExpression
    });

    await this.client.send(command);
  }

  /**
   * Update an item
   */
  protected async updateItem(
    key: Record<string, any>,
    updateExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>,
    conditionExpression?: string
  ): Promise<T | null> {
    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall(key),
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues ? marshall(expressionAttributeValues) : undefined,
      ConditionExpression: conditionExpression,
      ReturnValues: 'ALL_NEW'
    });

    const result = await this.client.send(command);
    return result.Attributes ? unmarshall(result.Attributes) as T : null;
  }

  /**
   * Delete an item
   */
  protected async deleteItem(key: Record<string, any>, conditionExpression?: string): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall(key),
      ConditionExpression: conditionExpression
    });

    await this.client.send(command);
  }

  /**
   * Scan items with optional filter
   */
  protected async scanItems(
    filterExpression?: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>,
    limit?: number,
    exclusiveStartKey?: Record<string, any>
  ): Promise<PaginatedResponse<T>> {
    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues ? marshall(expressionAttributeValues) : undefined,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey ? marshall(exclusiveStartKey) : undefined
    });

    const result = await this.client.send(command);
    
    return {
      items: result.Items?.map(item => unmarshall(item) as T) || [],
      lastEvaluatedKey: result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : undefined,
      count: result.Count || 0,
      scannedCount: result.ScannedCount || 0
    };
  }

  /**
   * Query items
   */
  protected async queryItems(
    keyConditionExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>,
    filterExpression?: string,
    indexName?: string,
    limit?: number,
    exclusiveStartKey?: Record<string, any>,
    scanIndexForward?: boolean
  ): Promise<PaginatedResponse<T>> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues ? marshall(expressionAttributeValues) : undefined,
      FilterExpression: filterExpression,
      IndexName: indexName,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey ? marshall(exclusiveStartKey) : undefined,
      ScanIndexForward: scanIndexForward
    });

    const result = await this.client.send(command);
    
    return {
      items: result.Items?.map(item => unmarshall(item) as T) || [],
      lastEvaluatedKey: result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : undefined,
      count: result.Count || 0,
      scannedCount: result.ScannedCount || 0
    };
  }

  /**
   * Batch get items
   */
  protected async batchGetItems(keys: Record<string, any>[]): Promise<T[]> {
    // Implementation would use BatchGetItemCommand
    // For now, fall back to individual gets
    const items: T[] = [];
    for (const key of keys) {
      const item = await this.getItem(key);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * Batch write items
   */
  protected async batchWriteItems(items: T[]): Promise<void> {
    // Implementation would use BatchWriteItemCommand
    // For now, fall back to individual puts
    for (const item of items) {
      await this.putItem(item);
    }
  }
}