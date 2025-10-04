import { NextRequest, NextResponse } from 'next/server';
import {
  ChatRequestObject,
  ChatResponseObject,
  ApiResponse,
} from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

// GoogleGenAI クライアントの初期化
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// プロンプトを加工する関数
function buildPrompt(
  mainPrompt: string,
  userRole?: string,
  userSkills?: string
): string {
  let prompt = `あなたはこのプロジェクト全体を統括する優秀なプロジェクトマネージャーのアシスタントです。
以下の質問について、プロジェクトを成功に導くためのアドバイスを提供してください。
それっぽいことを言ってください。人の名前（日本人）やチーム名も適当に作ってください。

## 回答の形式について
- 回答は必ずMarkdown形式で出力してください
- 適切な見出し（#, ##, ###）、箇条書き（-）、番号付きリスト（1.）を使用してください
- 回答には必ず関連する参考リンクを含めてください
- 参考リンクは実際のURLでなくても構いません（例：https://example.com/resource、https://docs.example.com/guide など）
- リンクには適切なタイトルを付けて [タイトル](URL) の形式で記載してください
- 重要な部分は**太字**や\`コード\`でハイライトしてください

## 質問
${mainPrompt}`;

  // ユーザープロフィールが入力された場合
  if (userRole || userSkills) {
    prompt += `

ユーザーのプロフィール情報を考慮して、より適切なアドバイスを提供してください。

## ユーザープロフィール

`;
    if (userRole) {
      prompt += `役割: ${userRole}\n`;
    }
    if (userSkills) {
      prompt += `スキル: ${userSkills}\n`;
    }

    prompt += `
## 参考リンクの例
- 技術的な質問の場合：[公式ドキュメント](https://docs.example.com/api)、[ベストプラクティス](https://example.com/best-practices)
- プロジェクト管理の質問の場合：[アジャイル開発ガイド](https://example.com/agile-guide)、[プロジェクト計画テンプレート](https://example.com/templates)
- キャリア関連の質問の場合：[スキルアップリソース](https://example.com/learning)、[業界動向レポート](https://example.com/trends)`;
  }

  return prompt;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ChatResponseObject>>> {
  try {
    const body: ChatRequestObject = await request.json();
    const { chatId, message } = body;

    // バリデーション
    if (!chatId || !message || !message.mainPrompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: chatId and message.mainPrompt are required',
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

    // プロンプトの構築
    const processedPrompt = buildPrompt(
      message.mainPrompt,
      message.userRole,
      message.userSkills
    );

    // Google Generative AI API の呼び出し
    const genAIResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: processedPrompt,
    });

    const aiContent = genAIResponse.text;

    // レスポンスの検証
    if (!aiContent) {
      throw new Error('No response content received from Gemini API');
    }

    const response: ChatResponseObject = {
      messageId: uuidv4(),
      content: aiContent,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error processing chat request:', error);

    // より具体的なエラーメッセージを提供
    let errorMessage = 'Failed to process chat request';

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
