import { NextRequest, NextResponse } from 'next/server';
import { ChatHistoryObject, ApiResponse } from '@/lib/types';
import chatHistoryData from '@/sample_data/chat_history.json';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ChatHistoryObject>>> {
  try {
    // パラメータの取得
    const { id } = await params;
    const chatId = id;

    // 1.0秒の遅延を追加してロード状態を確認できるようにする
    await new Promise(resolve => setTimeout(resolve, 1000));

    // チャット履歴データから指定されたIDのチャットを検索
    const chatHistories: ChatHistoryObject[] =
      chatHistoryData as ChatHistoryObject[];
    const targetChat = chatHistories.find(chat => chat.chatId === chatId);

    if (!targetChat) {
      return NextResponse.json(
        {
          success: false,
          error: 'Chat not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: targetChat,
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch chat history',
      },
      { status: 500 }
    );
  }
}
