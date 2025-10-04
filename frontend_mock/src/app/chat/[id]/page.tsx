"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { ChatHistoryObject, ApiResponse } from "@/lib/types";
import { ChatForm } from "@/components/chat/ChatForm";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";

export default function ChatDetailPage() {
  const params = useParams();
  const chatId = params.id as string;

  // 状態管理
  const [currentChat, setCurrentChat] = useState<ChatHistoryObject | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
      console.error("Error fetching current chat:", error);
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
            role: "user",
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
      setCurrentChat((prevChat) => {
        if (!prevChat) return null;
        return {
          ...prevChat,
          messages: [
            ...prevChat.messages,
            {
              role: "assistant",
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
      <div className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
        {/* メインコンテンツスケルトン */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ height: "calc(100vh - 49px - 120px)" }}
        >
          <div className="p-4 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="fixed bottom-0 right-0 left-0 lg:left-80 p-3 bg-background/95 backdrop-blur-sm border-t">
          <Skeleton className="h-20 w-full max-w-[800px] mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      {/* チャットメッセージ表示エリア */}
      <div
        className="flex-1 overflow-y-scroll"
        ref={scrollAreaRef}
        style={{
          height: "calc(100vh - 49px - 120px)",
          minHeight: "400px",
        }}
      >
        <div className="px-4 pb-[120px]">
          {currentChat?.messages.length === 0 ? (
            // 初期状態の表示
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center space-y-4 max-w-md mx-auto p-8">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">
                  AI Assistantへようこそ
                </h2>
                <p className="text-muted-foreground text-sm">
                  何でもお気軽にご質問ください。あなたの役割とスキルを教えていただければ、
                  より具体的で実用的な回答を提供できます。
                </p>
              </div>
            </div>
          ) : (
            // メッセージ一覧の表示
            <div className="space-y-2 py-4 min-h-[200px]">
              {currentChat?.messages.map((message, index) => (
                <ChatMessage key={index} message={message} />
              ))}
            </div>
          )}

          {/* 送信中の表示 */}
          {isSubmitting && (
            <div className="p-4 flex items-center gap-3">
              <div className="animate-pulse flex gap-3 w-full">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* チャット入力フォーム - 固定配置（コンパクト） */}
      <div className="fixed bottom-0 right-0 left-0 lg:left-80 p-2 bg-background/95 backdrop-blur-sm border-t z-30">
        <div className="w-full max-w-none lg:max-w-none mx-0 lg:mx-4">
          <ChatForm
            chatId={chatId}
            onMessageSent={handleMessageSent}
            isSubmitting={isSubmitting}
            setIsSubmitting={setIsSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
