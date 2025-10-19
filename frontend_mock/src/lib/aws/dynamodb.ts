/**
 * DynamoDB操作用のヘルパー関数
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { DYNAMODB_CONFIG, TABLE_NAMES } from './config';
import { ChatSummary, UserProfile } from '../types';

// DynamoDB クライアントの初期化
const client = new DynamoDBClient(DYNAMODB_CONFIG);
const docClient = DynamoDBDocumentClient.from(client);

// =============================================================
// ChatSummary テーブル操作関数
// =============================================================

/**
 * チャットサマリーを取得
 */
export async function getChatSummary(
  userId: string,
  timestamp: string
): Promise<ChatSummary | null> {
  try {
    const response = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAMES.CHAT_SUMMARY,
        Key: {
          userId,
          timestamp,
        },
      })
    );

    return (response.Item as ChatSummary) || null;
  } catch (error) {
    console.error('Error getting chat summary:', error);
    throw new Error('Failed to get chat summary');
  }
}

/**
 * チャットサマリーを保存
 */
export async function saveChatSummary(data: ChatSummary): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.CHAT_SUMMARY,
        Item: {
          ...data,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  } catch (error) {
    console.error('Error saving chat summary:', error);
    throw new Error('Failed to save chat summary');
  }
}

/**
 * チャットサマリーを更新
 */
export async function updateChatSummary(
  userId: string,
  timestamp: string,
  updates: Partial<ChatSummary>
): Promise<void> {
  try {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'userId' && key !== 'timestamp') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    if (updateExpressions.length === 0) {
      return;
    }

    // updatedAt を自動追加
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.CHAT_SUMMARY,
        Key: { userId, timestamp },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  } catch (error) {
    console.error('Error updating chat summary:', error);
    throw new Error('Failed to update chat summary');
  }
}

/**
 * ユーザーのチャットサマリー一覧を取得
 */
export async function getUserChatSummaries(
  userId: string
): Promise<ChatSummary[]> {
  try {
    const response = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.CHAT_SUMMARY,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // 新しい順にソート
      })
    );

    return (response.Items as ChatSummary[]) || [];
  } catch (error) {
    console.error('Error getting user chat summaries:', error);
    throw new Error('Failed to get user chat summaries');
  }
}

// =============================================================
// UserProfiles テーブル操作関数
// =============================================================

/**
 * ユーザープロフィール一覧を取得
 */
export async function getUserProfiles(userId: string): Promise<UserProfile[]> {
  try {
    const response = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.USER_PROFILES,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      })
    );

    return (response.Items as UserProfile[]) || [];
  } catch (error) {
    console.error('Error getting user profiles:', error);
    throw new Error('Failed to get user profiles');
  }
}

/**
 * ユーザープロフィールを保存
 */
export async function saveUserProfile(data: UserProfile): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.USER_PROFILES,
        Item: {
          ...data,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw new Error('Failed to save user profile');
  }
}

/**
 * ユーザープロフィールを更新
 */
export async function updateUserProfile(
  userId: string,
  profileId: string,
  updates: Partial<UserProfile>
): Promise<void> {
  try {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'userId' && key !== 'profileId') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    if (updateExpressions.length === 0) {
      return;
    }

    // updatedAt を自動追加
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.USER_PROFILES,
        Key: { userId, profileId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw new Error('Failed to update user profile');
  }
}

/**
 * ユーザープロフィールを削除
 */
export async function deleteUserProfile(
  userId: string,
  profileId: string
): Promise<void> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.USER_PROFILES,
        Key: { userId, profileId },
      })
    );
  } catch (error) {
    console.error('Error deleting user profile:', error);
    throw new Error('Failed to delete user profile');
  }
}

/**
 * デフォルトプロフィールを設定（他のプロフィールのisDefaultをfalseにしてから、指定したプロフィールをtrueにする）
 */
export async function setDefaultProfile(
  userId: string,
  profileId: string
): Promise<void> {
  try {
    // まず、そのユーザーの全プロフィールを取得
    const profiles = await getUserProfiles(userId);

    // 全プロフィールのisDefaultをfalseに設定
    const updatePromises = profiles.map(profile =>
      updateUserProfile(userId, profile.profileId, { isDefault: false })
    );

    await Promise.all(updatePromises);

    // 指定したプロフィールのisDefaultをtrueに設定
    await updateUserProfile(userId, profileId, { isDefault: true });
  } catch (error) {
    console.error('Error setting default profile:', error);
    throw new Error('Failed to set default profile');
  }
}

/**
 * デフォルトプロフィールを取得
 */
export async function getDefaultProfile(
  userId: string
): Promise<UserProfile | null> {
  try {
    const profiles = await getUserProfiles(userId);
    return profiles.find(profile => profile.isDefault) || null;
  } catch (error) {
    console.error('Error getting default profile:', error);
    throw new Error('Failed to get default profile');
  }
}
