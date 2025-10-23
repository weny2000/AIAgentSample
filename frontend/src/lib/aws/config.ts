/**
 * AWS Configuration
 * 環境変数から AWS 設定を読み込む
 */

export const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
} as const;

export const DYNAMODB_CONFIG = {
  region: AWS_CONFIG.region,
  credentials: AWS_CONFIG.credentials,
} as const;

export const S3_CONFIG = {
  region: process.env.S3_REGION || AWS_CONFIG.region,
  credentials: AWS_CONFIG.credentials,
} as const;

export const TABLE_NAMES = {
  CHAT_SUMMARY: process.env.DYNAMODB_TABLE_CHAT_SUMMARY || 'ChatSummary',
  USER_PROFILES: process.env.DYNAMODB_TABLE_USER_PROFILES || 'UserProfiles',
} as const;

export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

/**
 * AWS設定が正しく設定されているかチェック
 */
export function validateAWSConfig(): boolean {
  return !!(
    AWS_CONFIG.credentials.accessKeyId &&
    AWS_CONFIG.credentials.secretAccessKey &&
    S3_BUCKET_NAME
  );
}
