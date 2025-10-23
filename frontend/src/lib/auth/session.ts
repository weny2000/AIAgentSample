import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';

/**
 * サーバーサイドでセッション情報を取得するヘルパー関数
 * 認証設計方針に従い、cognitoSubはサーバーサイドでのみ取得可能
 */
export const getAuthSession = () => getServerSession(authConfig);

/**
 * 認証されたユーザーのCognito Subを取得
 * DBクエリ用のユーザーIDとして使用
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authConfig);
  return session?.user?.id || null;
}
