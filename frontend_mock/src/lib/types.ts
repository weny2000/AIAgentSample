import { JWT } from 'next-auth/jwt';

// NextAuth JWT トークンの拡張
declare module 'next-auth/jwt' {
  interface JWT {
    cognitoSub?: string;
    accessToken?: string;
    refreshToken?: string;
    username?: string;
    groups?: string[];
  }
}

// NextAuth セッションの拡張
declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// チャット履歴一覧（サマリー）の型定義
export interface ChatHistorySummaryObject {
  chatId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// チャット履歴詳細の型定義
export interface ChatHistoryObject {
  chatId: string;
  messages: MessageObject[];
  createdAt: string;
  updatedAt: string;
}

// メッセージの型定義
export interface MessageObject {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// 入力プロンプトの型定義
export interface InputPromptObject {
  mainPrompt: string;
  userRole: string;
  userSkills: string;
}

// ユーザープロフィールの型定義
export interface UserProfileObject {
  role: string;
  skills: string;
  description?: string;
}

// API レスポンスの型定義
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// チャット送信リクエストの型定義
export interface ChatRequestObject {
  chatId: string;
  message: InputPromptObject;
}

// チャット送信レスポンスの型定義
export interface ChatResponseObject {
  messageId: string;
  content: string;
  timestamp: string;
}

// =============================================================
// DynamoDB用の型定義
// =============================================================

// ChatSummary テーブルの型定義
export interface ChatSummary {
  userId: string; // PK
  chatId?: string; // チャットID
  timestamp: string; // SK (ISO 8601形式)
  title: string;
  summary: string;
  networkGraph?: string; // S3 URL for network graph HTML
  networkJson?: string; // S3 URL for network JSON
  createdAt: string;
  updatedAt: string;
}

// UserProfile テーブルの型定義
export interface UserProfile {
  userId: string; // PK
  profileId: string; // SK (UUID)
  role: string;
  skills: string;
  isDefault: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// =============================================================
// API リクエスト・レスポンス用の型定義
// =============================================================

// サマリー関連
export interface GenerateSummaryRequest {
  chatId: string;
  messages: MessageObject[]; // 会話履歴データ
}

export interface CreateSummaryResponse {
  summary: string;
  timestamp: string;
}

// ネットワーク図関連
export interface CreateNetworkGraphRequest {
  userId: string;
  chatId: string;
  previousNetworkJson?: string;
  latestQuestion: string;
  latestAnswer: string;
}

export interface CreateNetworkGraphResponse {
  networkGraphUrl: string;
  networkJsonUrl: string;
  timestamp: string;
}

// プロフィール関連
export interface CreateProfileRequest {
  role: string;
  skills: string;
}

export interface UpdateProfileRequest {
  role?: string;
  skills?: string;
  isDefault?: boolean;
}

export interface ProfileResponse {
  profileId: string;
  role: string;
  skills: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
