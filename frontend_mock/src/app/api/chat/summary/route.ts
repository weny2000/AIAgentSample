import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { ChatSummary, CreateSummaryRequest } from '@/lib/types';

// GoogleGenAI クライアントの初期化
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// メモリベースの要約ストレージ（サーバー再起動まで保持）
const memorySummaries: ChatSummary[] = [];

// 要約生成用のプロンプト
function buildSummaryPrompt(chatHistory: { role: string; content: string }[]): string {
  const conversationText = chatHistory
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n\n');

  return `以下のチャット履歴を分析して、簡潔で有用なサマリーを作成してください。

【サマリー作成ガイドライン】
1. 会話の主なテーマ・トピックを特定
2. 重要なポイント・決定事項を箇条書きで整理
3. 技術的な内容があれば具体的に記載
4. 学習内容や解決された問題があれば明記
5. 今後のアクションアイテムがあれば含める

【出力形式】
タイトル: [会話の主要テーマを簡潔に]

【会話サマリー】
[会話の概要を2-3文で記述]

主なポイント:
- [ポイント1]
- [ポイント2]
- [ポイント3]
...

[その他重要な内容があれば追記]

【チャット履歴】
${conversationText}`;
}

// チャット履歴から要約を生成
async function generateSummaryFromChatHistory(
  chatId: string
): Promise<ChatSummary | null> {
  try {
    // チャット履歴を読み込み
    const chatHistoryPath = path.join(
      process.cwd(),
      'public',
      'chat_history.json'
    );
    const chatHistoryData = await fs.readFile(chatHistoryPath, 'utf-8');
    const allChats = JSON.parse(chatHistoryData);

    // 指定されたchatIdの履歴を取得
    const targetChat = allChats.find((chat: { chatId: string; messages: { role: string; content: string }[] }) => chat.chatId === chatId);

    if (
      !targetChat ||
      !targetChat.messages ||
      targetChat.messages.length === 0
    ) {
      console.log(`No chat history found for chatId: ${chatId}`);
      return null;
    }

    console.log(
      `Generating summary for chat ${chatId} with ${targetChat.messages.length} messages`
    );

    // Gemini APIで要約を生成
    const prompt = buildSummaryPrompt(targetChat.messages);

    const genAIResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });

    const summaryText = genAIResponse.text;

    if (!summaryText) {
      throw new Error('No summary generated from Gemini API');
    }

    // タイトルを抽出（最初の行から）
    const lines = summaryText.split('\n').filter((line: string) => line.trim());
    let title = `Chat Summary - ${new Date().toLocaleDateString()}`;
    if (lines[0] && lines[0].includes('タイトル:')) {
      title = lines[0].replace('タイトル:', '').trim();
    } else if (lines[0] && lines[0].length < 100) {
      title = lines[0].trim();
    }

    // 新しい要約オブジェクトを作成
    const newSummary: ChatSummary = {
      userId: 'user-1', // 固定値（実際の実装では認証から取得）
      chatId: chatId,
      timestamp: new Date().toISOString(),
      title: title,
      summary: summaryText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // メモリストレージに保存（既存の同じchatIdがあれば更新）
    const existingIndex = memorySummaries.findIndex(s => s.chatId === chatId);
    if (existingIndex >= 0) {
      memorySummaries[existingIndex] = newSummary;
    } else {
      memorySummaries.push(newSummary);
    }

    console.log(`Summary generated successfully for chatId: ${chatId}`);
    return newSummary;
  } catch (error) {
    console.error('Error generating summary:', error);
    throw error;
  }
}

// POST: 新しい要約を生成
export async function POST(request: NextRequest) {
  try {
    const body: CreateSummaryRequest = await request.json();
    const { chatId } = body;

    if (!chatId) {
      return NextResponse.json(
        {
          success: false,
          error: 'chatId is required',
        },
        { status: 400 }
      );
    }

    console.log('Generating summary for chatId:', chatId);

    // Google API Key の確認
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google API key not configured',
        },
        { status: 500 }
      );
    }

    // 要約を生成
    const summary = await generateSummaryFromChatHistory(chatId);

    if (!summary) {
      return NextResponse.json(
        {
          success: false,
          error: 'No chat history found for the specified chatId',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error in summary generation:', error);

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

// GET: 既存の要約を取得（メモリベース + フォールバック）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');
    const userId = searchParams.get('userId');

    console.log('Fetching summary with params:', { chatId, userId });

    // メモリから要約を検索
    if (chatId) {
      const memorySummary = memorySummaries.find(s => s.chatId === chatId);
      if (memorySummary) {
        console.log(`Found summary in memory for chatId: ${chatId}`);
        return NextResponse.json({
          success: true,
          data: memorySummary,
        });
      }
    }

    // メモリに見つからない場合、JSONファイルから取得
    try {
      const summariesPath = path.join(
        process.cwd(),
        'public',
        'summaries.json'
      );
      const summariesData = await fs.readFile(summariesPath, 'utf-8');
      const allSummaries: ChatSummary[] = JSON.parse(summariesData);

      let targetSummary: ChatSummary | undefined;

      if (chatId) {
        targetSummary = allSummaries.find(s => s.chatId === chatId);
      } else if (userId) {
        // userIdでの検索（最新のものを返す）
        const userSummaries = allSummaries
          .filter(s => s.userId === userId)
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        targetSummary = userSummaries[0];
      }

      if (targetSummary) {
        console.log(
          `Found summary in JSON file for ${chatId ? 'chatId' : 'userId'}: ${chatId || userId}`
        );
        return NextResponse.json({
          success: true,
          data: targetSummary,
        });
      }
    } catch (fileError) {
      console.error('Error reading summaries.json:', fileError);
    }

    // 何も見つからない場合 - エラーではなく未作成として扱う
    console.log(
      `No summary found for ${chatId ? 'chatId' : 'userId'}: ${chatId || userId} - treating as not created`
    );
    return NextResponse.json({
      success: true,
      data: null,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch summary',
      },
      { status: 500 }
    );
  }
}
