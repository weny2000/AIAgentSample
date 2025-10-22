/**
 * チャットサマリー生成API
 * 会話履歴からLLMを使用してサマリーを生成する
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { GenerateSummaryRequest, ChatSummary, ApiResponse } from '@/lib/types';

import { MessageObject } from '@/lib/types';

// GoogleGenAI クライアントの初期化
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// サマリー生成用プロンプトを構築する関数
function buildSummaryPrompt(messages: MessageObject[]): string {
  // メッセージを文字列形式に変換
  const conversationText = messages
    .map(msg => `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}`)
    .join('\n\n');

  return `以下の会話履歴を分析し、構造化されたサマリーを生成してください。

## 会話履歴
${conversationText}

## サマリー生成指示

以下の形式で簡潔なサマリーを作成してください：

### 📋 **会話の概要**
- 主要なトピック: [メインテーマ]
- ユーザーの課題: [ユーザーが抱えている問題や質問]
- 解決状況: [完了/進行中/未解決]

### 🎯 **重要なポイント**
1. [重要な発見や決定事項1]
2. [重要な発見や決定事項2]
3. [重要な発見や決定事項3]

### 💡 **提供された解決策**
- [具体的なソリューション1]
- [具体的なソリューション2]

### 📝 **次のステップ**
- [推奨される行動や次に必要な作業]

**重要**: 必ず上記の構造を保持し、絵文字と見出しを含めた形式で出力してください。内容は簡潔かつ具体的にまとめてください。`;
}

// POST: サマリー生成
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ChatSummary>>> {
  try {
    const body: GenerateSummaryRequest = await request.json();
    const { chatId, messages } = body;

    // バリデーション
    if (
      !chatId ||
      !messages ||
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: chatId and messages array are required',
        },
        { status: 400 }
      );
    }

    // API キーの確認
    if (!process.env.GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY is not set');
      return NextResponse.json(
        {
          success: false,
          error: 'Google API key is not configured',
        },
        { status: 500 }
      );
    }

    console.log(
      `Generating summary for chatId: ${chatId} with ${messages.length} messages`
    );

    // サマリー用プロンプトの構築
    const summaryPrompt = buildSummaryPrompt(messages);

    // Google Generative AI API の呼び出し
    const genAIResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: summaryPrompt,
    });

    const summaryContent = genAIResponse.text;

    // レスポンスの検証
    if (!summaryContent) {
      throw new Error('No summary content received from Gemini API');
    }

    // サマリーオブジェクトの作成
    const now = new Date().toISOString();
    const summary: ChatSummary = {
      chatId,
      userId: 'user-1', // TODO: 実際のユーザーIDに置き換え
      title: `チャットサマリー - ${new Date().toLocaleDateString('ja-JP')}`,
      summary: summaryContent,
      timestamp: now,
      createdAt: now,
      updatedAt: now,
    };

    console.log(`Summary generated successfully for chatId: ${chatId}`);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error generating summary:', error);

    // より具体的なエラーメッセージを提供
    let errorMessage = 'Failed to generate summary';

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'Google API key configuration error';
      } else if (error.message.includes('Gemini API')) {
        errorMessage = 'Failed to get response from Gemini AI';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
