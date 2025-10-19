'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { ChatHistoryObject, ApiResponse } from '@/lib/types';
import { ChatForm } from '@/components/chat/ChatForm';
import { ChatMessage } from '@/components/chat/ChatMessage';
import ChatSummaryDrawer from '@/components/chat/ChatSummaryDrawer';
import { useChatSummary } from '@/hooks/useChatSummary';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MessageSquare, PanelRight, PanelRightClose } from 'lucide-react';

export default function ChatDetailPage() {
  const params = useParams();
  const chatId = params.id as string;

  // 状態管理
  const [currentChat, setCurrentChat] = useState<ChatHistoryObject | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [currentTimestamp, setCurrentTimestamp] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // サマリーフックを使用
  const { generateSummary, isGenerating } = useChatSummary(
    'user-1',
    undefined,
    chatId
  );

  // 現在のチャット詳細の取得
  const fetchCurrentChat = async (id: string) => {
    try {
      const response = await fetch(`/api/db/chat/${id}`);
      const result: ApiResponse<ChatHistoryObject> = await response.json();

      if (result.success && result.data) {
        setCurrentChat(result.data);
      } else {
        // チャットが存在しない場合、新規チャットとして初期化
        setCurrentChat({
          chatId: id,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error fetching current chat:', error);
      // エラーの場合も新規チャットとして初期化
      setCurrentChat({
        chatId: id,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // 初期データロード
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchCurrentChat(chatId);
      setIsLoading(false);
    };

    if (chatId) {
      loadData();
    }
  }, [chatId]);

  // メッセージ送信後の処理
  const handleMessageSent = async (
    userMessage: string,
    assistantResponse: string
  ) => {
    if (!currentChat) return;

    const now = new Date().toISOString();

    // ユーザーメッセージが空でない場合は追加
    if (userMessage.trim()) {
      const updatedChat: ChatHistoryObject = {
        ...currentChat,
        messages: [
          ...currentChat.messages,
          {
            role: 'user',
            content: userMessage,
            timestamp: now,
          },
        ],
        updatedAt: now,
      };
      setCurrentChat(updatedChat);
    }

    // アシスタントメッセージが空でない場合は追加
    if (assistantResponse.trim()) {
      setCurrentChat(prevChat => {
        if (!prevChat) return null;
        return {
          ...prevChat,
          messages: [
            ...prevChat.messages,
            {
              role: 'assistant',
              content: assistantResponse,
              timestamp: now,
            },
          ],
          updatedAt: now,
        };
      });
    }
  };

  // 新しいメッセージが追加されたときに自動スクロール
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [currentChat?.messages.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        {/* ヘッダー（スケルトン） */}
        <div className="shrink-0 p-4 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* メインコンテンツスケルトン */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* フォーム（スケルトン） */}
        <div className="shrink-0 border-t bg-background">
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* メインチャット領域 */}
      <div
        className={`flex flex-col flex-1 ${isDrawerOpen ? 'mr-80' : ''} transition-all duration-300`}
      >
        {/* チャット領域左上のタイトル */}
        <div className="shrink-0 p-4 pb-2 pl-16 lg:pl-4 border-b bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">AI Assistant</h1>
              <span className="text-sm text-muted-foreground">
                {currentChat?.messages.length === 0
                  ? '新しいチャット'
                  : 'アクティブなチャット'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="flex items-center gap-2"
            >
              {isDrawerOpen ? (
                <>
                  <PanelRightClose className="h-4 w-4" /> Hide Panel
                </>
              ) : (
                <>
                  <PanelRight className="h-4 w-4" /> Show Panel
                </>
              )}
            </Button>
          </div>
        </div>

        {/* チャットメッセージ表示エリア - フォーム高さを除く */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          ref={scrollAreaRef}
          style={{
            height: 'calc(100vh - 80px - 140px)', // ヘッダー80px + フォーム140px
            minHeight: '300px',
          }}
        >
          <div className="px-4 py-4">
            {currentChat?.messages.length === 0 ? (
              // 初期状態の表示
              <div className="flex items-center justify-center min-h-[300px]">
                <div className="text-center space-y-4 max-w-md mx-auto p-8">
                  <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <MessageSquare className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold">
                    TacitAi(タシタイ)へようこそ
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    何でもお気軽にご質問ください。あなたの役割とスキルを教えていただければ、
                    より具体的で実用的な回答を提供できます。
                  </p>
                </div>
              </div>
            ) : (
              // メッセージ一覧の表示
              <div className="space-y-4 pb-4">
                {currentChat?.messages.map((message, index) => (
                  <ChatMessage key={index} message={message} />
                ))}
              </div>
            )}

            {/* 送信中の表示 */}
            {isSubmitting && (
              <div className="px-4 py-2">
                <div className="animate-pulse flex gap-3 w-full">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* チャット入力フォーム - 下部固定配置 */}
        <div className="shrink-0 border-t bg-background shadow-lg">
          <div className="max-w-full p-4">
            <ChatForm
              chatId={chatId}
              onMessageSent={handleMessageSent}
              onSummaryGenerated={async () => {
                // サマリーを生成
                await generateSummary(chatId);
              }}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
            />
          </div>
        </div>
      </div>

      {/* 右側サマリーDrawer */}
      {isDrawerOpen && (
        <div className="fixed right-0 top-0 w-80 h-screen bg-background border-l shadow-lg">
          <ChatSummaryDrawer
            userId="user-1" // TODO: 実際のユーザーIDに置き換え
            chatId={chatId}
            timestamp={currentTimestamp || undefined}
          />
        </div>
      )}
    </div>
  );
}
