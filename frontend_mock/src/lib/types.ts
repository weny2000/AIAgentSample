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
