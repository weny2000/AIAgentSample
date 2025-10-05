'use client';

import { useState, useEffect } from 'react';
import { ChatHistorySummaryObject, ApiResponse } from '@/lib/types';
import { ChatHistorySideBar } from '@/components/chat/ChatHistorySideBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [chatHistories, setChatHistories] = useState<
    ChatHistorySummaryObject[]
  >([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 現在のチャットIDを取得
  const currentChatId = pathname.split('/')[2] || null;

  // チャット履歴一覧の取得（一度だけ実行）
  useEffect(() => {
    const fetchChatHistories = async () => {
      try {
        const response = await fetch('/api/db/chat');
        const result: ApiResponse<ChatHistorySummaryObject[]> =
          await response.json();

        if (result.success && result.data) {
          setChatHistories(result.data);
        } else {
          console.error('Failed to fetch chat histories:', result.error);
        }
      } catch (error) {
        console.error('Error fetching chat histories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChatHistories();
  }, []);

  // サイドバートグル
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden">
        {/* モバイル用サイドバーオーバーレイ */}
        <div
          className={`
          lg:hidden fixed inset-0 z-50 transition-opacity
          ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        >
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={toggleSidebar}
          />
          <div
            className={`
            absolute left-0 top-0 h-full w-80 bg-background border-r shadow-lg transform transition-transform
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          >
            <div className="flex justify-end p-4">
              <Button variant="ghost" size="sm" onClick={toggleSidebar}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ChatHistorySideBar
              histories={chatHistories}
              currentChatId={currentChatId}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* デスクトップレイアウト - サイドバーとメインコンテンツを横並び */}
        <div className="hidden lg:flex h-screen">
          {/* デスクトップ用サイドバー */}
          <div className="w-80 h-full flex-shrink-0">
            <ChatHistorySideBar
              histories={chatHistories}
              currentChatId={currentChatId}
              isLoading={isLoading}
            />
          </div>

          {/* メインコンテンツエリア - 残り領域全体を使用 */}
          <div className="flex-1 flex flex-col h-full">
            {/* ヘッダー - 固定表示（コンパクト） */}
            <header className="fixed top-0 right-0 left-0 z-40 border-b bg-background/95 backdrop-blur-sm px-4 py-2">
              <div className="flex items-center gap-3 max-w-fit">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold">TacitAi(タシタイ)</h1>
                  <span className="text-xs text-muted-foreground">
                    {currentChatId ? 'アクティブなチャット' : '新しいチャット'}
                  </span>
                </div>
              </div>
            </header>

            {/* コンテンツエリア */}
            <div className="flex-1 flex flex-col pt-[49px] w-full">
              {children}
            </div>
          </div>
        </div>

        {/* モバイルレイアウト - 元のレイアウトを維持 */}
        <div className="lg:hidden flex flex-col h-screen">
          {/* ヘッダー - 固定表示（コンパクト） */}
          <header className="fixed top-0 right-0 left-0 z-40 border-b bg-background/95 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-3 max-w-fit">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={toggleSidebar}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold">TacitAi(タシタイ)</h1>
                <span className="text-xs text-muted-foreground">
                  {currentChatId ? 'アクティブなチャット' : '新しいチャット'}
                </span>
              </div>
            </div>
          </header>

          {/* コンテンツエリア */}
          <div className="flex-1 flex flex-col pt-[49px] w-full">
            {children}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
