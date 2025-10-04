import { NextRequest, NextResponse } from 'next/server';
import {
  ChatHistoryObject,
  ChatHistorySummaryObject,
  ApiResponse,
} from '@/lib/types';
import chatHistoryData from '@/sample_data/chat_history.json';

export async function GET(): Promise<
  NextResponse<ApiResponse<ChatHistorySummaryObject[]>>
> {
  try {
    // 1.0秒の遅延を追加してロード状態を確認できるようにする
    await new Promise(resolve => setTimeout(resolve, 1000));

    // チャット履歴データをサマリー形式に変換
    const chatHistories: ChatHistoryObject[] =
      chatHistoryData as ChatHistoryObject[];
    const summaries: ChatHistorySummaryObject[] = chatHistories.map(chat => ({
      chatId: chat.chatId,
      title:
        chat.messages.length > 0
          ? chat.messages[0].content.substring(0, 50) +
            (chat.messages[0].content.length > 50 ? '...' : '')
          : 'New Chat',
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error('Error fetching chat histories:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch chat histories',
      },
      { status: 500 }
    );
  }
}
