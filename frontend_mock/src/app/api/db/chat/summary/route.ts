/**
 * チャット画面アクセス時のサマリー取得API
 * JSONファイルからサマリーデータを取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatSummary } from '@/lib/types';
import summariesData from '../../../../../../public/summaries.json';

// サマリー取得（JSONファイルから）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const chatId = searchParams.get('chatId');
    const timestamp = searchParams.get('timestamp');

    if (!userId && !chatId) {
      return NextResponse.json(
        { success: false, error: 'userId or chatId is required' },
        { status: 400 }
      );
    }

    // 1.0秒の遅延を追加してロード状態を確認できるようにする
    await new Promise(resolve => setTimeout(resolve, 1000));

    const allSummaries: ChatSummary[] = summariesData as ChatSummary[];

    if (chatId) {
      // chatIdで特定のサマリーを取得
      const summary = allSummaries.find(s => s.chatId === chatId);

      if (!summary) {
        // サマリーが見つからない場合は未作成として扱う
        console.log(
          `No summary found for chatId: ${chatId} - treating as not created`
        );
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      return NextResponse.json({
        success: true,
        data: summary,
      });
    } else if (timestamp && userId) {
      // 特定のサマリーを取得（従来の方法）
      const summary = allSummaries.find(
        s => s.userId === userId && s.timestamp === timestamp
      );

      if (!summary) {
        // サマリーが見つからない場合は未作成として扱う
        console.log(
          `No summary found for userId: ${userId}, timestamp: ${timestamp} - treating as not created`
        );
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      return NextResponse.json({
        success: true,
        data: summary,
      });
    } else if (userId) {
      // ユーザーの全サマリー一覧を取得
      const userSummaries = allSummaries.filter(s => s.userId === userId);

      return NextResponse.json({
        success: true,
        data: userSummaries,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid parameters' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error getting chat summary from JSON:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get chat summary' },
      { status: 500 }
    );
  }
}
