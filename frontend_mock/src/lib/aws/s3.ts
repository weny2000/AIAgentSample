/**
 * S3操作用のヘルパー関数
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3_CONFIG, S3_BUCKET_NAME } from './config';

// S3 クライアントの初期化
const s3Client = new S3Client(S3_CONFIG);

/**
 * ネットワーク図HTMLをS3にアップロード
 */
export async function uploadNetworkGraph(
  key: string,
  htmlContent: string
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: htmlContent,
      ContentType: 'text/html',
      // パブリック読み取り可能にする場合（必要に応じて）
      // ACL: 'public-read'
    });

    await s3Client.send(command);

    // S3 URL を返す
    return `https://${S3_BUCKET_NAME}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Error uploading network graph to S3:', error);
    throw new Error('Failed to upload network graph to S3');
  }
}

/**
 * ネットワークJSONをS3にアップロード
 */
export async function uploadNetworkJson(
  key: string,
  jsonContent: string
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: jsonContent,
      ContentType: 'application/json',
      // パブリック読み取り可能にする場合（必要に応じて）
      // ACL: 'public-read'
    });

    await s3Client.send(command);

    // S3 URL を返す
    return `https://${S3_BUCKET_NAME}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Error uploading network JSON to S3:', error);
    throw new Error('Failed to upload network JSON to S3');
  }
}

/**
 * S3オブジェクトの署名付きURLを取得
 * TODO: 後で @aws-sdk/s3-request-presigner を使用して実装
 */
export async function getSignedUrlForObject(
  key: string,
  expiresIn: number = 3600 // デフォルト1時間
): Promise<string> {
  try {
    // 一時的にパブリックURLを返す
    return getPublicUrl(key);
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error('Failed to generate signed URL');
  }
}

/**
 * ファイルキー生成用のユーティリティ関数
 */
export function generateNetworkGraphKey(
  userId: string,
  chatId: string,
  timestamp: string
): string {
  return `network-graphs/${userId}/${chatId}/${timestamp}.html`;
}

export function generateNetworkJsonKey(
  userId: string,
  chatId: string,
  timestamp: string
): string {
  return `network-json/${userId}/${chatId}/${timestamp}.json`;
}

/**
 * S3からオブジェクトの内容を取得
 */
export async function getObjectContent(key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('Object body is empty');
    }

    // ReadableStreamを文字列に変換
    const bodyContent = await response.Body.transformToString();
    return bodyContent;
  } catch (error) {
    console.error('Error getting object content from S3:', error);
    throw new Error('Failed to get object content from S3');
  }
}

/**
 * S3バケットとキーからパブリックURLを生成
 */
export function getPublicUrl(key: string): string {
  return `https://${S3_BUCKET_NAME}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
}
