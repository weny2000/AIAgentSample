/**
 * ダミー用チャットサマリーAPI
 * public/summaries.jsonからサマリーデータを返すだけの実装
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { ChatSummary, CreateSummaryRequest } from '@/lib/types';

// public/summaries.jsonからデータを取得する関数
async function getSummariesData(): Promise<ChatSummary[]> {
  try {
    const summariesPath = path.join(process.cwd(), 'public', 'summaries.json');
    const summariesData = await fs.readFile(summariesPath, 'utf-8');
    return JSON.parse(summariesData) as ChatSummary[];
  } catch (error) {
    console.error('Error reading summaries.json:', error);
    return [];
  }
}

// POST: サマリー生成（ダミー実装）
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

    console.log('Looking for summary with chatId:', chatId);

    // JSONファイルからデータを取得
    const summariesData = await getSummariesData();

    // chatIdでサマリーを検索
    const summary = summariesData.find(s => s.chatId === chatId);

    if (!summary) {
      // chatIdでヒットしなくてもエラーにならず、nullを返す
      console.log(
        `No summary found for chatId: ${chatId} - treating as not created`
      );
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    console.log(`Found summary for chatId: ${chatId}`);
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error in summary generation:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate summary',
      },
      { status: 500 }
    );
  }
}

// GET: サマリー取得（ダミー実装）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');
    const userId = searchParams.get('userId');

    console.log('Fetching summary with params:', { chatId, userId });

    // JSONファイルからデータを取得
    const summariesData = await getSummariesData();

    let targetSummary: ChatSummary | undefined;

    if (chatId) {
      // chatIdでサマリーを検索
      targetSummary = summariesData.find(s => s.chatId === chatId);
    } else if (userId) {
      // userIdでの検索（最新のものを返す）
      const userSummaries = summariesData
        .filter(s => s.userId === userId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      targetSummary = userSummaries[0];
    }

    if (targetSummary) {
      console.log(
        `Found summary for ${chatId ? 'chatId' : 'userId'}: ${chatId || userId}`
      );
      return NextResponse.json({
        success: true,
        data: targetSummary,
      });
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
