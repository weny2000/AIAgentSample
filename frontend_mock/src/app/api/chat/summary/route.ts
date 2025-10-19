/**
 * チャットサマリー API
 * POST: サマリー生成・保存
 * GET: サマリー取得
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getChatSummary,
  saveChatSummary,
  updateChatSummary,
  getUserChatSummaries,
} from '@/lib/aws/dynamodb';
import {
  ChatSummary,
  CreateSummaryRequest,
  CreateSummaryResponse,
} from '@/lib/types';

// サマリー生成・保存
export async function POST(request: NextRequest) {
  try {
    const body: CreateSummaryRequest = await request.json();

    if (
      !body.userId ||
      !body.chatId ||
      !body.latestQuestion ||
      !body.latestAnswer
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'userId, chatId, latestQuestion, and latestAnswer are required',
        },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();

    // サマリー生成ロジック（初期実装：固定テキスト）
    let generatedSummary: string;

    if (body.previousSummary) {
      // 既存サマリーがある場合は更新
      generatedSummary = generateUpdatedSummary(
        body.previousSummary,
        body.latestQuestion,
        body.latestAnswer
      );
    } else {
      // 新規サマリー作成
      generatedSummary = generateNewSummary(
        body.latestQuestion,
        body.latestAnswer
      );
    }

    // チャットタイトル生成（質問の最初の50文字）
    const title =
      body.latestQuestion.length > 50
        ? body.latestQuestion.substring(0, 50) + '...'
        : body.latestQuestion;

    const chatSummary: ChatSummary = {
      userId: body.userId,
      timestamp: timestamp,
      title: title,
      summary: generatedSummary,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await saveChatSummary(chatSummary);

    const response: CreateSummaryResponse = {
      summary: generatedSummary,
      timestamp: timestamp,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error creating chat summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create chat summary' },
      { status: 500 }
    );
  }
}

// サマリー取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const timestamp = searchParams.get('timestamp');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    if (timestamp) {
      // 特定のサマリーを取得
      const summary = await getChatSummary(userId, timestamp);

      if (!summary) {
        return NextResponse.json(
          { success: false, error: 'Summary not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: summary,
      });
    } else {
      // ユーザーの全サマリー一覧を取得
      const summaries = await getUserChatSummaries(userId);

      return NextResponse.json({
        success: true,
        data: summaries,
      });
    }
  } catch (error) {
    console.error('Error getting chat summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get chat summary' },
      { status: 500 }
    );
  }
}

/**
 * 新規サマリー生成（固定テキスト版）
 */
function generateNewSummary(question: string, answer: string): string {
  return `【会話サマリー】
質問: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}

回答のポイント:
- ${answer.substring(0, 200)}${answer.length > 200 ? '...' : ''}

このチャットでは、ユーザーからの質問に対してAIアシスタントが回答を提供しました。`;
}

/**
 * 既存サマリーの更新（固定テキスト版）
 */
function generateUpdatedSummary(
  previousSummary: string,
  latestQuestion: string,
  latestAnswer: string
): string {
  return `${previousSummary}

【最新の会話】
質問: ${latestQuestion.substring(0, 100)}${latestQuestion.length > 100 ? '...' : ''}
回答: ${latestAnswer.substring(0, 200)}${latestAnswer.length > 200 ? '...' : ''}

会話が継続され、新しい内容が追加されました。`;
}
